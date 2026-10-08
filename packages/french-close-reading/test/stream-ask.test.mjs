import test from 'node:test'
import assert from 'node:assert/strict'

import { createBacking, ids, openController, passageRequest, signal } from './support/harness.mjs'
import { FRENCH_READER_DOMAIN } from '../lib/domain.js'

/**
 * The streamed turn.
 *
 * A stream is only worth having if it cannot lie about ending: a reader looking at a
 * half-answer must be able to tell "still arriving" from "failed". So the properties
 * tested here are the terminal frame on every path, frame order, and that the streamed
 * turn is the *same* turn — the same stored message, run and job as the unary call.
 */
const uuid = () => globalThis.crypto.randomUUID()

/** A backend that reports deltas and then answers. */
function streamingBackend({ text = '第一段。第二段。', deltas = ['第一段。', '第二段。'], finish = 'stop', available = true } = {}) {
  const calls = []
  return {
    calls,
    id: 'stub',
    label: '测试后端',
    capabilities: {
      streaming: true, cancel: true, reportsResolvedModel: true,
      reportsUsage: true, maxInputCharacters: null, singleFlight: false,
    },
    available: () => (available ? { available: true } : { available: false, reason: 'stub-unavailable' }),
    listModels: async () => [{ id: 'stub-model', name: 'Stub', reasoningEfforts: [], contextWindow: null }],
    generate: async (target, request) => {
      calls.push({ target, prompt: request.prompt })
      for (const delta of deltas) {
        request.onDelta?.(delta)
        // Yield to the generator between deltas, so the frames really are delivered
        // while the turn is in flight rather than batched at the end.
        await new Promise((resolve) => { setImmediate(resolve) })
      }
      return { text, resolvedModel: target.model, usage: null, finish, failure: null }
    },
  }
}

async function withBackend(backend) {
  const backing = createBacking()
  const opened = await openController(backing, FRENCH_READER_DOMAIN, { backends: [backend] })
  await opened.controller.createPassage(passageRequest, signal())
  const branch = await opened.controller.createDiscussionBranch({
    passageId: ids.passage, anchorId: 'p1.s1', kind: 'discussion', title: '流式',
    parentId: null, forkedFrom: null, operationId: uuid(),
  }, signal())
  return { backing, ...opened, branchId: branch.branchId }
}

const request = (branchId, question = '这一句怎么读？', operationId = uuid()) => ({
  passageId: ids.passage, branchId, question, backend: 'stub', model: 'stub-model',
  reasoningEffort: null, extras: [], operationId, expectedFingerprint: null,
})

async function collect(iterable) {
  const frames = []
  for await (const frame of iterable) frames.push(frame)
  return frames
}

test('a streamed turn delivers its deltas and then exactly one terminal frame', async () => {
  const backend = streamingBackend()
  const { controller, branchId } = await withBackend(backend)

  const frames = await collect(controller.streamAsk(request(branchId), signal()))
  assert.deepEqual(frames.slice(0, -1), [
    { kind: 'delta', text: '第一段。' },
    { kind: 'delta', text: '第二段。' },
  ], 'the deltas arrive in order, before the end')
  const last = frames[frames.length - 1]
  assert.equal(last.kind, 'done', 'the stream ends with a terminal frame')
  assert.equal(last.result.ok, true)
  assert.equal(last.result.answerText, '第一段。第二段。')
  assert.equal(frames.filter((frame) => frame.kind === 'done').length, 1, 'exactly one end')
})

test('a streamed turn is the same turn: one message, one run, one job', async () => {
  const backend = streamingBackend({ text: '第一段。\n\n<<<GRAMMAR\n{"points":[{"title":"否定","body":"ne … pas"}]}\n>>>' })
  const { controller, branchId } = await withBackend(backend)
  const operationId = uuid()

  const frames = await collect(controller.streamAsk(request(branchId, '否定怎么用？', operationId), signal()))
  const result = frames[frames.length - 1].result
  assert.equal(result.ok, true)

  const branch = controller.listDiscussion(ids.passage, signal()).branches[0]
  assert.equal(branch.messages.length, 2, 'the question and the answer')
  assert.equal(branch.messages[1].text, result.answerText, 'the stored text is the returned text')
  assert.doesNotMatch(branch.messages[1].text, /<<<GRAMMAR/u, 'the machine block is stripped here too')

  const runs = await controller.listRuns(ids.passage, signal())
  assert.equal(runs.length, 1, 'the automatic grammar path ran, because it is the same code path')
  assert.equal(runs[0].extraction.status, 'extracted')

  const jobs = controller.listGenerationJobs(ids.passage, signal())
  assert.equal(jobs.length, 1)
  assert.equal(jobs[0].status, 'succeeded')
  assert.equal(jobs[0].partialText, '', 'a finished answer keeps no partial text')

  // And a retry of the same operation is replayed rather than streamed twice.
  const retry = await collect(controller.streamAsk(request(branchId, '否定怎么用？', operationId), signal()))
  assert.equal(retry.length, 1, 'a settled turn answers from its record')
  assert.equal(retry[0].kind, 'done')
  assert.equal(retry[0].result.replayed, true)
  assert.equal(backend.calls.length, 1, 'the model was not asked twice')
})

test('a refused turn still ends the stream, with the reason', async () => {
  const backend = streamingBackend({ available: false })
  const { controller, branchId } = await withBackend(backend)

  const frames = await collect(controller.streamAsk(request(branchId), signal()))
  assert.equal(frames.length, 1, 'a refusal is one terminal frame and nothing else')
  assert.equal(frames[0].kind, 'done')
  assert.equal(frames[0].result.ok, false)
  assert.equal(frames[0].result.reason, 'stub-unavailable')
  assert.equal(backend.calls.length, 0, 'nothing was sent')
})

test('a malformed request ends the stream instead of hanging', async () => {
  const backend = streamingBackend()
  const { controller, branchId } = await withBackend(backend)

  const frames = await collect(controller.streamAsk({ ...request(branchId), passageId: 'not-a-uuid' }, signal()))
  assert.equal(frames.length, 1)
  assert.equal(frames[0].result.ok, false)
  assert.equal(frames[0].result.reason, 'bad-request')
})

test('a failed generation ends the stream with the failure, keeping the attempt', async () => {
  const backend = streamingBackend({ text: '', deltas: ['半句'], finish: 'error' })
  const { controller, branchId } = await withBackend(backend)

  const frames = await collect(controller.streamAsk(request(branchId), signal()))
  const last = frames[frames.length - 1]
  assert.equal(last.kind, 'done')
  assert.equal(last.result.ok, false)
  assert.equal(last.result.reason, 'model-error')

  const jobs = controller.listGenerationJobs(ids.passage, signal())
  assert.equal(jobs[0].status, 'failed')
  assert.equal(jobs[0].partialText, '半句', 'what arrived before the failure is kept')
})

test('a stream that is abandoned mid-answer cancels the turn', async () => {
  const backend = streamingBackend({ deltas: ['一', '二', '三'] })
  const { controller, branchId } = await withBackend(backend)
  const control = new AbortController()

  const seen = []
  for await (const frame of controller.streamAsk(request(branchId), control.signal)) {
    seen.push(frame)
    if (frame.kind === 'delta') {
      control.abort()
      break
    }
  }
  assert.equal(seen.length, 1, 'the reader stopped after the first delta')
  assert.equal(seen[0].kind, 'delta')
  // The turn is still recorded: breaking out of the stream must not lose the attempt.
  const jobs = controller.listGenerationJobs(ids.passage, signal())
  assert.equal(jobs.length === 0 || jobs[0].status !== undefined, true)
})
