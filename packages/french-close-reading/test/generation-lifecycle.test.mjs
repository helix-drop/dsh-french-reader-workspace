import test from 'node:test'
import assert from 'node:assert/strict'

import { createBacking, ids, openController, passageRequest, signal } from './support/harness.mjs'
import { FRENCH_READER_DOMAIN } from '../lib/domain.js'
import { generationJobKey } from '../lib/generation-store.js'

/**
 * The generation lifecycle: one operation is one job, every ending is recorded, and
 * a retry never buys a second answer.
 *
 * The assertions are on the stored job record and on how many times the backend was
 * actually called — a summary the controller produced about itself would prove
 * nothing about either.
 */
const uuid = () => globalThis.crypto.randomUUID()

/** A backend that answers once, optionally streaming deltas before it does. */
function lifecycleBackend({ text = '这是回答。', finish = 'stop', failure = null, deltas = [], hold = null } = {}) {
  const calls = []
  return {
    calls,
    id: 'stub',
    label: '测试后端',
    capabilities: {
      streaming: deltas.length > 0, cancel: true, reportsResolvedModel: true,
      reportsUsage: true, maxInputCharacters: null, singleFlight: false,
    },
    available: () => ({ available: true }),
    listModels: async () => [{ id: 'stub-model', name: 'Stub', reasoningEfforts: [], contextWindow: null }],
    generate: async (target, request) => {
      calls.push({ target, prompt: request.prompt, onDelta: request.onDelta })
      for (const delta of deltas) request.onDelta?.(delta)
      if (hold !== null) await hold(request.signal)
      return {
        text,
        resolvedModel: target.model,
        usage: { inputTokens: 11, outputTokens: 22 },
        finish,
        failure,
      }
    },
  }
}

async function withBackend(backend) {
  const backing = createBacking()
  const opened = await openController(backing, FRENCH_READER_DOMAIN, { backends: [backend] })
  await opened.controller.createPassage(passageRequest, signal())
  return { backing, ...opened }
}

async function openBranch(controller) {
  const created = await controller.createDiscussionBranch({
    passageId: ids.passage, anchorId: 'p1.s1', kind: 'discussion', title: '分支',
    parentId: null, forkedFrom: null, operationId: uuid(),
  }, signal())
  return created.branchId
}

const ask = (controller, branchId, question, operationId = uuid()) => controller.ask({
  passageId: ids.passage, branchId, question, backend: 'stub', model: 'stub-model', operationId,
}, signal())

test('a turn leaves a job that says what happened, including how it ended', async () => {
  const backend = lifecycleBackend()
  const { controller, backing } = await withBackend(backend)
  const branchId = await openBranch(controller)
  const asked = await ask(controller, branchId, '这一句怎么读？')
  assert.equal(asked.ok, true)

  const jobs = controller.listGenerationJobs(ids.passage, signal())
  assert.equal(jobs.length, 1)
  const job = jobs[0]
  assert.equal(job.kind, 'ask')
  assert.equal(job.status, 'succeeded')
  assert.equal(job.attempt, 1)
  assert.equal(job.finish, 'stop')
  assert.equal(job.backend, 'stub')
  assert.equal(job.model, 'stub-model')
  assert.equal(job.resolvedModel, 'stub-model')
  assert.equal(job.usage.outputTokens, 22)
  assert.equal(job.messageId, asked.messageId, 'the job points at the answer it produced')
  assert.equal(job.contextId, asked.contextId, 'and at the context it was sent with')
  assert.notEqual(job.startedAt, null)
  assert.notEqual(job.finishedAt, null)

  // Durable, not an in-memory note: a reopened domain still has it, which is what
  // lets a later session explain what happened to the question.
  const reopened = await openController(backing, FRENCH_READER_DOMAIN, { backends: [backend] })
  const after = reopened.controller.listGenerationJobs(ids.passage, signal())
  assert.equal(after.length, 1)
  assert.equal(after[0].status, 'succeeded')
  assert.equal(after[0].messageId, asked.messageId)
})

test('a retried send is replayed from its record instead of generated twice', async () => {
  const backend = lifecycleBackend()
  const { controller } = await withBackend(backend)
  const branchId = await openBranch(controller)
  const operationId = uuid()

  const first = await ask(controller, branchId, '同一个问题', operationId)
  const retry = await ask(controller, branchId, '同一个问题', operationId)
  assert.equal(first.ok, true)
  assert.equal(retry.ok, true)
  assert.equal(backend.calls.length, 1, 'the retry did not reach the model')
  assert.equal(retry.replayed, true, 'and it says so rather than pretending to generate')
  assert.equal(retry.messageId, first.messageId)
  assert.equal(retry.answerText, first.answerText)
  assert.equal(retry.contextId, first.contextId)
  assert.equal(retry.fingerprint, first.fingerprint, 'the replayed turn keeps its context identity')

  const branch = controller.listDiscussion(ids.passage, signal()).branches[0]
  assert.equal(branch.messages.length, 2, 'still one turn')
  assert.equal(controller.listGenerationJobs(ids.passage, signal()).length, 1, 'still one job')
})

test('the same operation id with different words is refused, not replayed', async () => {
  const backend = lifecycleBackend()
  const { controller } = await withBackend(backend)
  const branchId = await openBranch(controller)
  const operationId = uuid()

  await ask(controller, branchId, '第一个问题', operationId)
  const reused = await ask(controller, branchId, '换了内容', operationId)
  assert.equal(reused.ok, false)
  assert.equal(reused.reason, 'operation-used')
  assert.equal(backend.calls.length, 1)
})

test('a cancel settles the job and keeps what the answer had said so far', async () => {
  const backend = lifecycleBackend({
    text: '',
    finish: 'cancelled',
    failure: '用户取消',
    deltas: ['前半段', '，还有一点'],
  })
  const { controller } = await withBackend(backend)
  const branchId = await openBranch(controller)

  const asked = await ask(controller, branchId, '会被取消的问题')
  assert.equal(asked.finish, 'cancelled')

  const job = controller.listGenerationJobs(ids.passage, signal())[0]
  assert.equal(job.status, 'cancelled')
  assert.equal(job.finish, 'cancelled')
  assert.equal(job.failure, '用户取消')
  assert.equal(job.partialText, '前半段，还有一点', 'the text that arrived before the cancel is kept')
  assert.equal(job.finishedAt !== null, true)
})

test('a length stop is stored as partial, never as a finished answer', async () => {
  const backend = lifecycleBackend({ text: '被截断的回答', finish: 'max-tokens' })
  const { controller } = await withBackend(backend)
  const branchId = await openBranch(controller)

  const asked = await ask(controller, branchId, '很长的回答')
  assert.equal(asked.ok, true)
  assert.equal(asked.finish, 'max-tokens')

  const branch = controller.listDiscussion(ids.passage, signal()).branches[0]
  assert.equal(branch.messages[1].status, 'partial', 'the reader is told the answer is unfinished')

  const job = controller.listGenerationJobs(ids.passage, signal())[0]
  assert.equal(job.status, 'succeeded')
  assert.equal(job.finish, 'max-tokens')
  assert.equal(job.partialText, '被截断的回答', 'the unfinished text is on the record too')
})

test('a failed generation is a failed job, and the attempt is still stored', async () => {
  const backend = lifecycleBackend({ text: '', finish: 'error', failure: '后端失败' })
  const { controller } = await withBackend(backend)
  const branchId = await openBranch(controller)

  const asked = await ask(controller, branchId, '会失败的问题')
  assert.equal(asked.ok, false)
  assert.equal(asked.reason, 'model-error')

  const job = controller.listGenerationJobs(ids.passage, signal())[0]
  assert.equal(job.status, 'failed')
  assert.equal(job.finish, 'error')
  assert.equal(job.failure, '后端失败')
  assert.equal(job.messageId !== null, true, 'the failed attempt is still a stored message')
})

test('a job left running by a restart is reconciled, with its partial text kept', async () => {
  const backend = lifecycleBackend()
  const { controller, domain } = await withBackend(backend)
  const table = domain.table('records')

  // A job as a killed Host would leave it: running, with text already captured.
  const operationId = uuid()
  const startedAt = new Date().toISOString()
  await table.put(generationJobKey('ask', operationId), {
    kind: 'generationJob',
    recordVersion: 1,
    payload: {
      id: uuid(), operationId, kind: 'ask', passageId: ids.passage, branchId: null, anchorId: 'p1.s1',
      backend: 'stub', model: 'stub-model', status: 'running', attempt: 1,
      partialText: '半句话', finish: null, failure: null, resolvedModel: null, usage: null,
      messageId: null, contextId: null, startedAt, updatedAt: startedAt, finishedAt: null,
    },
  })

  const settled = await controller.settleInterruptedJobs(signal())
  assert.equal(settled.interrupted, 1)

  const job = controller.listGenerationJobs(ids.passage, signal())[0]
  assert.equal(job.status, 'interrupted', 'a restart is not a success')
  assert.equal(job.partialText, '半句话', 'what it had said is still readable')
  assert.match(job.failure, /重启/u)

  // Idempotent: nothing is running any more, so a second open changes nothing.
  const again = await controller.settleInterruptedJobs(signal())
  assert.equal(again.interrupted, 0)
})

test('a refused turn creates no job, because no model was asked', async () => {
  const backend = lifecycleBackend()
  backend.capabilities.maxInputCharacters = 20
  const { controller } = await withBackend(backend)
  const branchId = await openBranch(controller)

  const refused = await ask(controller, branchId, '这个问题连同原文会超出上限')
  assert.equal(refused.ok, false)
  assert.match(refused.reason, /context-too-long/u)
  assert.deepEqual(controller.listGenerationJobs(ids.passage, signal()), [], 'a refusal is not an attempt')
  assert.equal(backend.calls.length, 0)
})

test('the backend is handed a delta sink, so progress can be durable', async () => {
  const backend = lifecycleBackend({ deltas: ['一', '二'] })
  const { controller } = await withBackend(backend)
  const branchId = await openBranch(controller)
  await ask(controller, branchId, '流式问题')
  assert.equal(typeof backend.calls[0].onDelta, 'function')
})

test('jobs are listed newest first and can be narrowed to one passage', async () => {
  const backend = lifecycleBackend()
  const { controller } = await withBackend(backend)
  const branchId = await openBranch(controller)
  await ask(controller, branchId, '第一问')
  await ask(controller, branchId, '第二问')

  const all = controller.listGenerationJobs(null, signal())
  assert.equal(all.length, 2)
  assert.ok(all[0].startedAt >= all[1].startedAt, 'newest first')

  const other = '00000000-0000-4000-8000-0000000000f9'
  assert.deepEqual(controller.listGenerationJobs(other, signal()), [])
})
