import test from 'node:test'
import assert from 'node:assert/strict'

import { createBacking, ids, openController, passageRequest, signal } from './support/harness.mjs'
import { FRENCH_READER_DOMAIN } from '../lib/domain.js'
import { buildFrenchReaderTool } from '../lib/tools.js'

const SECOND = {
  id: '00000000-0000-4000-8000-0000000000a2',
  operationId: '00000000-0000-4000-8000-0000000000b2',
  title: 'Deuxième passage',
  sourceText: 'Un autre texte, sans rapport avec le premier.',
}

const uuid = () => globalThis.crypto.randomUUID()

/**
 * A backend that answers inline and records exactly what it was sent.
 *
 * The recorded prompt is the evidence for isolation: a test asserts on the bytes
 * the backend received, not on a tree the UI drew.
 */
function recordingBackend({ text = '这是回答。', finish = 'stop', failure = null, available = true } = {}) {
  const calls = []
  return {
    calls,
    id: 'stub',
    label: '测试后端',
    capabilities: {
      streaming: false, cancel: true, reportsResolvedModel: true,
      reportsUsage: true, maxInputCharacters: null, singleFlight: false,
    },
    available: () => (available ? { available: true } : { available: false, reason: 'stub-unavailable' }),
    listModels: async () => [{ id: 'stub-model', name: 'Stub', reasoningEfforts: [], contextWindow: null }],
    generate: async (target, request) => {
      calls.push({ target, system: request.system, prompt: request.prompt })
      return {
        text: finish === 'stop' ? text : '',
        resolvedModel: target.model,
        usage: { inputTokens: 10, outputTokens: 20 },
        finish,
        failure,
      }
    },
  }
}

async function withPassage(backend) {
  const backing = createBacking()
  const opened = await openController(backing, FRENCH_READER_DOMAIN, { backends: [backend] })
  await opened.controller.createPassage(passageRequest, signal())
  await opened.controller.createPassage(SECOND, signal())
  return { backing, ...opened, tool: buildFrenchReaderTool(opened.controller) }
}

/** One branch on one anchor, with a title that is easy to grep for in a prompt. */
async function openBranch(controller, { passageId = ids.passage, anchorId = 'p1.s1', title, kind = 'discussion' } = {}) {
  const created = await controller.createDiscussionBranch({
    passageId, anchorId, kind, title, parentId: null, forkedFrom: null, operationId: uuid(),
  }, signal())
  assert.equal(created.created, true)
  return created.branchId
}

test('a backend that is unavailable is reported, never silently replaced', async () => {
  const backend = recordingBackend({ available: false })
  const { controller } = await withPassage(backend)

  const backends = controller.listBackends()
  assert.equal(backends.length, 1)
  assert.equal(backends[0].available, false)
  assert.equal(backends[0].reason, 'stub-unavailable')

  const branchId = await openBranch(controller, { title: '隔离检查' })
  const asked = await controller.ask({
    passageId: ids.passage, branchId, question: '这一句怎么读？',
    backend: 'stub', model: 'stub-model', operationId: uuid(),
  }, signal())
  assert.equal(asked.ok, false)
  assert.equal(asked.reason, 'stub-unavailable')
  assert.equal(backend.calls.length, 0, 'nothing was sent')
})

test('sibling branches never enter each other\'s context', async () => {
  const backend = recordingBackend()
  const { controller } = await withPassage(backend)

  // Two branches on the same anchor. Each says something the other must not see.
  const first = await openBranch(controller, { title: '分支甲' })
  const second = await openBranch(controller, { title: '分支乙' })

  const firstTurn = await controller.ask({
    passageId: ids.passage, branchId: first,
    question: '甲的问题：主语是什么？', backend: 'stub', model: 'stub-model', operationId: uuid(),
  }, signal())
  assert.equal(firstTurn.ok, true)

  const secondTurn = await controller.ask({
    passageId: ids.passage, branchId: second,
    question: '乙的问题：时态是什么？', backend: 'stub', model: 'stub-model', operationId: uuid(),
  }, signal())
  assert.equal(secondTurn.ok, true)

  const secondPrompt = backend.calls[1].prompt
  assert.match(secondPrompt, /乙的问题/u, 'its own question is in the request')
  assert.doesNotMatch(secondPrompt, /甲的问题/u, 'the sibling question is not')
  assert.doesNotMatch(secondPrompt, /这是回答/u, 'the sibling answer did not leak through a shared parent')
  assert.equal(
    controller.listDiscussion(ids.passage, signal()).branches.length, 2,
    'the two branches share an anchor and nothing else',
  )

  // And the first branch's later turn still carries only its own history.
  const firstAgain = await controller.ask({
    passageId: ids.passage, branchId: first,
    question: '甲的追问：补语呢？', backend: 'stub', model: 'stub-model', operationId: uuid(),
  }, signal())
  assert.equal(firstAgain.ok, true)
  const firstPrompt = backend.calls[2].prompt
  assert.match(firstPrompt, /甲的问题/u, 'its own first question is history')
  assert.match(firstPrompt, /甲的追问/u)
  assert.doesNotMatch(firstPrompt, /乙的问题/u, 'the sibling never enters this branch')
})

test('another passage never enters a request', async () => {
  const backend = recordingBackend()
  const { controller } = await withPassage(backend)
  const branchId = await openBranch(controller, { title: '跨篇检查' })

  await controller.ask({
    passageId: ids.passage, branchId, question: '这一句的否定范围？',
    backend: 'stub', model: 'stub-model', operationId: uuid(),
  }, signal())

  const prompt = backend.calls[0].prompt
  assert.match(prompt, /Il faut cultiver/u, 'the current passage is there')
  assert.doesNotMatch(prompt, /Un autre texte/u, 'the other passage is not')
})

test('a fork stops history at the forked message', async () => {
  const backend = recordingBackend()
  const { controller } = await withPassage(backend)
  const source = await openBranch(controller, { title: '源分支' })

  await controller.ask({
    passageId: ids.passage, branchId: source, question: '源头第一问',
    backend: 'stub', model: 'stub-model', operationId: uuid(),
  }, signal())

  const listed = controller.listDiscussion(ids.passage, signal())
  const sourceBranch = listed.branches.find((branch) => branch.branchId === source)
  const forkMessage = sourceBranch.messages[0]

  // Fork at the first message, then keep talking in the source branch.
  const forked = await controller.createDiscussionBranch({
    passageId: ids.passage, anchorId: 'p1.s1', kind: 'discussion', title: '分叉分支',
    parentId: source, forkedFrom: { branchId: source, messageId: forkMessage.messageId }, operationId: uuid(),
  }, signal())
  assert.equal(forked.created, true)

  await controller.ask({
    passageId: ids.passage, branchId: source, question: '源分支之后的追问',
    backend: 'stub', model: 'stub-model', operationId: uuid(),
  }, signal())

  const forkedTurn = await controller.ask({
    passageId: ids.passage, branchId: forked.branchId, question: '分叉自己的问题',
    backend: 'stub', model: 'stub-model', operationId: uuid(),
  }, signal())
  assert.equal(forkedTurn.ok, true)

  const prompt = backend.calls[backend.calls.length - 1].prompt
  assert.match(prompt, /源头第一问/u, 'history up to the fork point is carried')
  assert.doesNotMatch(prompt, /源分支之后的追问/u, 'what the source said after the fork is not')
  assert.match(prompt, /分叉自己的问题/u)

  const after = controller.listDiscussion(ids.passage, signal())
  const forkedView = after.branches.find((branch) => branch.branchId === forked.branchId)
  const sourceView = after.branches.find((branch) => branch.branchId === source)
  assert.equal(sourceView.historyCount, 4, 'the source branch keeps all four of its messages')
  // The fork carries the source's first turn plus its own: forking is a reference
  // to a cut-off point, not a copy, so nothing drifts out of sync.
  assert.equal(forkedView.historyCount, 3, 'the fork carries the source turn it forked from, plus its own')
})

test('the preview and the request are the same compilation', async () => {
  const backend = recordingBackend()
  const { controller } = await withPassage(backend)
  const branchId = await openBranch(controller, { title: '预览一致性' })

  const question = '这一句的不定式过去时说明什么？'
  const preview = controller.previewAsk({
    passageId: ids.passage, branchId, question, backend: 'stub', model: 'stub-model',
  }, signal())
  assert.equal(preview.ok, true)

  const asked = await controller.ask({
    passageId: ids.passage, branchId, question,
    backend: 'stub', model: 'stub-model', operationId: uuid(),
    expectedFingerprint: preview.fingerprint,
  }, signal())
  assert.equal(asked.ok, true)

  // The sent prompt is the previewed one plus the question now in history; the
  // materials themselves are identical.
  const sent = backend.calls[0].prompt
  for (const material of preview.materials) {
    assert.match(sent, new RegExp(escapeRegExp(material.excerpt.slice(0, 24)), 'u'),
      `material ${material.refId} reached the request`)
  }
  assert.match(sent, /=== 读者的问题 ===/u)
})

test('a stale preview is refused instead of sending unlooked-at content', async () => {
  const backend = recordingBackend()
  const { controller } = await withPassage(backend)
  const branchId = await openBranch(controller, { title: '过期预览' })

  const preview = controller.previewAsk({
    passageId: ids.passage, branchId, question: '第一个问题', backend: 'stub', model: 'stub-model',
  }, signal())
  assert.equal(preview.ok, true)

  // The branch moves on, so the preview no longer describes the request.
  await controller.ask({
    passageId: ids.passage, branchId, question: '插进来的问题',
    backend: 'stub', model: 'stub-model', operationId: uuid(),
  }, signal())
  const before = backend.calls.length

  const stale = await controller.ask({
    passageId: ids.passage, branchId, question: '第一个问题',
    backend: 'stub', model: 'stub-model', operationId: uuid(),
    expectedFingerprint: preview.fingerprint,
  }, signal())
  // The question itself is part of the fingerprint only through history, so a
  // changed branch must not silently ride on the old approval.
  assert.equal(stale.ok, false)
  assert.equal(stale.reason, 'context-changed')
  assert.equal(backend.calls.length, before, 'nothing was sent')
})

test('the question is stored before the model is called, and the answer after', async () => {
  const backend = recordingBackend({ text: '', finish: 'error', failure: 'stub-failure: 后端失败' })
  const { controller } = await withPassage(backend)
  const branchId = await openBranch(controller, { title: '失败也要留下问题' })

  const result = await controller.ask({
    passageId: ids.passage, branchId, question: '失败时的问题还在吗？',
    backend: 'stub', model: 'stub-model', operationId: uuid(),
  }, signal())
  assert.equal(result.ok, false, 'an error finish is not reported as success')
  assert.equal(result.reason, 'model-error')

  const listed = controller.listDiscussion(ids.passage, signal())
  const branch = listed.branches.find((entry) => entry.branchId === branchId)
  assert.equal(branch.messages.length, 2, 'the question and the failed attempt are both stored')
  assert.equal(branch.messages[0].author, 'user')
  assert.match(branch.messages[1].text, /未返回内容/u)
  assert.equal(branch.messages[1].status, 'failed')
  assert.equal(branch.messages[1].failure, 'stub-failure: 后端失败')
})

test('an answer records the backend, the model and the context it was sent with', async () => {
  const backend = recordingBackend()
  const { controller } = await withPassage(backend)
  const branchId = await openBranch(controller, { title: '来源可审计' })

  const asked = await controller.ask({
    passageId: ids.passage, branchId, question: '记录来源',
    backend: 'stub', model: 'stub-model', reasoningEffort: null, operationId: uuid(),
  }, signal())
  assert.equal(asked.ok, true)

  const listed = controller.listDiscussion(ids.passage, signal())
  const answer = listed.branches.find((entry) => entry.branchId === branchId).messages[1]
  assert.equal(answer.author, 'model')
  assert.equal(answer.backend, 'stub')
  assert.equal(answer.model, 'stub-model')
  assert.equal(answer.resolvedModel, 'stub-model')
  assert.equal(answer.status, 'complete')

  // The compiled context is stored, so a claim about what was sent can be audited.
  const manifest = controller.readContext(ids.passage, answer.contextId, signal())
  assert.equal(manifest.found, true)
  assert.equal(manifest.manifest.branchId, branchId)
  assert.equal(manifest.manifest.materials.length > 0, true)
})

test('a retried send is one turn, and different text under the same id is refused', async () => {
  const backend = recordingBackend()
  const { controller } = await withPassage(backend)
  const branchId = await openBranch(controller, { title: '幂等发送' })
  const operationId = uuid()

  const first = await controller.ask({
    passageId: ids.passage, branchId, question: '同一个问题',
    backend: 'stub', model: 'stub-model', operationId,
  }, signal())
  assert.equal(first.ok, true)

  const retry = await controller.ask({
    passageId: ids.passage, branchId, question: '同一个问题',
    backend: 'stub', model: 'stub-model', operationId,
  }, signal())
  assert.equal(retry.ok, true, 'a retry of the same send is accepted')

  let listed = controller.listDiscussion(ids.passage, signal())
  let branch = listed.branches.find((entry) => entry.branchId === branchId)
  assert.equal(branch.messages.length, 2, 'the retry did not append a second turn')

  const different = await controller.ask({
    passageId: ids.passage, branchId, question: '换了问题',
    backend: 'stub', model: 'stub-model', operationId,
  }, signal())
  assert.equal(different.ok, false)
  assert.equal(different.reason, 'operation-used')

  listed = controller.listDiscussion(ids.passage, signal())
  branch = listed.branches.find((entry) => entry.branchId === branchId)
  assert.equal(branch.messages.length, 2, 'the refused send changed nothing')
})

test('a compiled context over the backend ceiling is refused, not truncated', async () => {
  const backend = recordingBackend()
  // Below the size of the paragraph alone, so the ceiling is genuinely exceeded
  // rather than the test relying on a question being long.
  backend.capabilities.maxInputCharacters = 20
  const { controller } = await withPassage(backend)
  const branchId = await openBranch(controller, { title: '超限拒绝' })

  const asked = await controller.ask({
    passageId: ids.passage, branchId, question: '这个问题连同原文会超出上限',
    backend: 'stub', model: 'stub-model', operationId: uuid(),
  }, signal())
  assert.equal(asked.ok, false)
  assert.match(asked.reason, /context-too-long: /u)
  assert.equal(backend.calls.length, 0, 'nothing was sent or truncated')

  // The question is already durable when the refusal happens, so the branch says
  // why the turn did not happen instead of showing a question with no answer.
  const listed = controller.listDiscussion(ids.passage, signal())
  const branch = listed.branches.find((entry) => entry.branchId === branchId)
  assert.equal(branch.messages.length, 2)
  assert.equal(branch.messages[0].author, 'user')
  assert.match(branch.messages[1].text, /未发送/u)
  assert.equal(branch.messages[1].status, 'failed')
})

test('a conclusion points at the message it came from and supersedes, never overwrites', async () => {
  const backend = recordingBackend()
  const { controller } = await withPassage(backend)
  const branchId = await openBranch(controller, { title: '结论留痕' })

  await controller.ask({
    passageId: ids.passage, branchId, question: '第一问',
    backend: 'stub', model: 'stub-model', operationId: uuid(),
  }, signal())
  const branch = controller.listDiscussion(ids.passage, signal()).branches[0]
  const answerId = branch.messages[1].messageId

  const first = await controller.recordConclusion({
    passageId: ids.passage, branchId, anchorId: 'p1.s1', messageId: answerId,
    text: '第一版结论', status: 'confirmed', operationId: uuid(),
  }, signal())
  assert.equal(first.added, true)

  const second = await controller.recordConclusion({
    passageId: ids.passage, branchId, anchorId: 'p1.s1', messageId: answerId,
    text: '第二版结论', status: 'confirmed', operationId: uuid(),
  }, signal())
  assert.equal(second.added, true)

  const listed = controller.listDiscussion(ids.passage, signal())
  assert.equal(listed.conclusions.length, 2, 'both versions stay readable')
  const older = listed.conclusions.find((entry) => entry.conclusionId === first.conclusionId)
  const newer = listed.conclusions.find((entry) => entry.conclusionId === second.conclusionId)
  assert.equal(older.status, 'superseded')
  assert.equal(newer.status, 'confirmed')
  assert.equal(newer.messageId, answerId, 'the conclusion names its source message')
})

test('a branch cannot be opened on an anchor that does not exist', async () => {
  const backend = recordingBackend()
  const { controller } = await withPassage(backend)

  const refused = await controller.createDiscussionBranch({
    passageId: ids.passage, anchorId: 'p9.s9', kind: 'discussion', title: '错锚点',
    parentId: null, forkedFrom: null, operationId: uuid(),
  }, signal())
  assert.equal(refused.created, false)
  assert.equal(refused.reason, 'anchor-unknown')

  const unknownPassage = await controller.createDiscussionBranch({
    passageId: '00000000-0000-4000-8000-0000000000fe', anchorId: 'p1.s1', kind: 'discussion',
    title: '错文章', parentId: null, forkedFrom: null, operationId: uuid(),
  }, signal())
  assert.equal(unknownPassage.reason, 'passage-unknown')
})

test('a fork naming a message that does not exist is refused', async () => {
  const backend = recordingBackend()
  const { controller } = await withPassage(backend)
  const source = await openBranch(controller, { title: '源' })

  const refused = await controller.createDiscussionBranch({
    passageId: ids.passage, anchorId: 'p1.s1', kind: 'discussion', title: '错分叉',
    parentId: source, forkedFrom: { branchId: source, messageId: uuid() }, operationId: uuid(),
  }, signal())
  assert.equal(refused.created, false)
  assert.equal(refused.reason, 'fork-message-unknown')
})

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}
