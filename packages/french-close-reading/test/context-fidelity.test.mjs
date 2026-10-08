import test from 'node:test'
import assert from 'node:assert/strict'

import { createBacking, ids, openController, passageRequest, signal } from './support/harness.mjs'
import { FRENCH_READER_DOMAIN } from '../lib/domain.js'
import { renderPrompt } from '../lib/context-compiler.js'
import {
  CONTEXT_MIGRATION_NAME,
  contextManifestKey,
  contextsKey,
  migrationKey,
} from '../lib/discussion-store.js'
import { selectionKey } from '../lib/limits.js'

/**
 * Context fidelity: what a branch inherits, what a request actually contains, and
 * what survives. Each test here fails on the pre-M1 behaviour it replaces, so the
 * file is evidence rather than a restatement of the code.
 */
const uuid = () => globalThis.crypto.randomUUID()

/**
 * A backend that records exactly what it was sent and answers with a number, so a
 * prompt can be traced back to the turn that produced it.
 */
function recordingBackend() {
  const calls = []
  return {
    calls,
    id: 'stub',
    label: '测试后端',
    capabilities: {
      streaming: false, cancel: true, reportsResolvedModel: true,
      reportsUsage: true, maxInputCharacters: null, singleFlight: false,
    },
    available: () => ({ available: true }),
    listModels: async () => [{ id: 'stub-model', name: 'Stub', reasoningEfforts: [], contextWindow: null }],
    generate: async (target, request) => {
      calls.push({ target, prompt: request.prompt })
      return {
        text: `回答 #${String(calls.length)}`,
        resolvedModel: target.model,
        usage: { inputTokens: 1, outputTokens: 1 },
        finish: 'stop',
        failure: null,
      }
    },
  }
}

async function withPassage(backend) {
  const backing = createBacking()
  const opened = await openController(backing, FRENCH_READER_DOMAIN, { backends: [backend] })
  await opened.controller.createPassage(passageRequest, signal())
  return { backing, ...opened }
}

async function openBranch(controller, { passageId = ids.passage, anchorId = 'p1.s1', title = '分支' } = {}) {
  const created = await controller.createDiscussionBranch({
    passageId, anchorId, kind: 'discussion', title, parentId: null, forkedFrom: null, operationId: uuid(),
  }, signal())
  assert.equal(created.created, true)
  return created.branchId
}

const ask = (controller, branchId, question) => controller.ask({
  passageId: ids.passage, branchId, question, backend: 'stub', model: 'stub-model', operationId: uuid(),
}, signal())

test('a three-level fork carries the whole chain, each link cut at its own point', async () => {
  const backend = recordingBackend()
  const { controller } = await withPassage(backend)

  const root = await openBranch(controller, { title: '甲' })
  await ask(controller, root, '甲问一')
  await ask(controller, root, '甲问二')
  const afterRoot = controller.listDiscussion(ids.passage, signal())
  const rootBranch = afterRoot.branches.find((branch) => branch.branchId === root)

  // Fork at the first turn's answer, then talk in the middle branch.
  const middle = await controller.createDiscussionBranch({
    passageId: ids.passage, anchorId: 'p1.s1', kind: 'discussion', title: '乙',
    parentId: root, forkedFrom: { branchId: root, messageId: rootBranch.messages[1].messageId },
    operationId: uuid(),
  }, signal())
  assert.equal(middle.created, true)
  await ask(controller, middle.branchId, '乙问一')
  const middleBranch = controller.listDiscussion(ids.passage, signal())
    .branches.find((branch) => branch.branchId === middle.branchId)

  // And fork again from the middle branch: the third level.
  const leaf = await controller.createDiscussionBranch({
    passageId: ids.passage, anchorId: 'p1.s1', kind: 'discussion', title: '丙',
    parentId: middle.branchId,
    forkedFrom: { branchId: middle.branchId, messageId: middleBranch.messages[1].messageId },
    operationId: uuid(),
  }, signal())
  assert.equal(leaf.created, true)
  const turn = await ask(controller, leaf.branchId, '丙问一')
  assert.equal(turn.ok, true)

  const prompt = backend.calls[backend.calls.length - 1].prompt
  assert.match(prompt, /甲问一/u, 'the root turn is inherited through two forks')
  assert.match(prompt, /回答 #1/u, 'the root answer it forked from is inherited too')
  assert.match(prompt, /乙问一/u, 'the middle branch turn is inherited')
  assert.match(prompt, /回答 #3/u)
  assert.doesNotMatch(prompt, /甲问二/u, 'what the root said after the first fork is not')
  assert.doesNotMatch(prompt, /回答 #2/u)

  // The stored history is the same chain, counted rather than trusted to prose.
  const leafView = controller.listDiscussion(ids.passage, signal())
    .branches.find((branch) => branch.branchId === leaf.branchId)
  assert.equal(
    leafView.historyCount, 6,
    'root turn (2) + middle turn (2) + the leaf turn (2); reading only the direct source gave 4',
  )
})

test('the sent prompt is exactly the previewed one, and quotes the question once', async () => {
  const backend = recordingBackend()
  const { controller } = await withPassage(backend)
  const branchId = await openBranch(controller, { title: '预览一致' })
  const question = '这一句的不定式过去时说明什么？'

  const preview = controller.previewAsk({
    passageId: ids.passage, branchId, question, backend: 'stub', model: 'stub-model',
  }, signal())
  assert.equal(preview.ok, true)

  const asked = await controller.ask({
    passageId: ids.passage, branchId, question, backend: 'stub', model: 'stub-model',
    operationId: uuid(), expectedFingerprint: preview.fingerprint,
  }, signal())
  assert.equal(asked.ok, true)

  const sent = backend.calls[0].prompt
  assert.equal(sent, preview.prompt, 'the preview is the request, byte for byte')
  assert.equal(
    sent.split(question).length - 1, 1,
    'the question is quoted once; the old second compile put it in history as well',
  )
  assert.equal(sent.split('=== 读者的问题 ===').length - 1, 1)

  // The stored manifest is the one that was sent, not a third compilation.
  const answer = controller.listDiscussion(ids.passage, signal())
    .branches.find((branch) => branch.branchId === branchId).messages[1]
  const stored = controller.readContext(ids.passage, answer.contextId, signal())
  assert.equal(stored.found, true)
  assert.equal(stored.manifest.fingerprint, preview.fingerprint)
  assert.equal(renderPrompt(stored.manifest), sent)
})

test('a same-length edit changes the fingerprint and refuses the old approval', async () => {
  const backend = recordingBackend()
  const { controller } = await withPassage(backend)
  const branchId = await openBranch(controller, { title: '同长度编辑' })
  const question = '同一个问题'
  const extra = (text) => [{ refId: 'note-1', reason: '读者加入的知识', text }]

  const first = controller.previewAsk({
    passageId: ids.passage, branchId, question, backend: 'stub', model: 'stub-model', extras: extra('AAAA'),
  }, signal())
  const second = controller.previewAsk({
    passageId: ids.passage, branchId, question, backend: 'stub', model: 'stub-model', extras: extra('BBBB'),
  }, signal())
  assert.equal(first.ok, true)
  assert.equal(second.ok, true)
  assert.equal(first.characters, second.characters, 'the two contexts are the same size')
  assert.notEqual(
    first.fingerprint, second.fingerprint,
    'the fingerprint covers content; hashing lengths alone could not tell these apart',
  )

  // An approval given for the first must not carry the second to the model.
  const refused = await controller.ask({
    passageId: ids.passage, branchId, question, backend: 'stub', model: 'stub-model',
    extras: extra('BBBB'), operationId: uuid(), expectedFingerprint: first.fingerprint,
  }, signal())
  assert.equal(refused.ok, false)
  assert.equal(refused.reason, 'context-changed')
  assert.equal(backend.calls.length, 0, 'nothing was sent under a stale approval')
})

test('compiled contexts are never evicted: the first survives 205 later turns', async () => {
  const backend = recordingBackend()
  const { controller, domain } = await withPassage(backend)
  const branchId = await openBranch(controller, { title: '长期留存' })

  const turns = 205
  let firstContextId = null
  for (let index = 0; index < turns; index += 1) {
    const asked = await ask(controller, branchId, `第 ${String(index + 1)} 问`)
    assert.equal(asked.ok, true)
    if (index === 0) firstContextId = asked.contextId
  }

  const oldest = controller.readContext(ids.passage, firstContextId, signal())
  assert.equal(
    oldest.found, true,
    'the oldest manifest is still readable; the removed cap kept only the newest 200',
  )
  const contextRecords = [...domain.table('records').entries()]
    .filter(([key]) => key.startsWith('context_')).length
  assert.equal(contextRecords, turns, 'one record per turn, none dropped')
})

test('legacy context arrays move to one record per manifest, with a marker, once', async () => {
  const backend = recordingBackend()
  const { controller, domain } = await withPassage(backend)
  const table = domain.table('records')
  const branchId = await openBranch(controller, { title: '迁移' })

  const first = await ask(controller, branchId, '第一问')
  const second = await ask(controller, branchId, '第二问')
  assert.equal(first.ok, true)
  assert.equal(second.ok, true)

  // Rewind to the pre-M1 shape: manifests inside the per-passage array.
  const manifests = [first.contextId, second.contextId]
    .map((contextId) => controller.readContext(ids.passage, contextId, signal()).manifest)
  await table.put(contextsKey(ids.passage), {
    kind: 'contexts', recordVersion: 1, payload: { passageId: ids.passage, manifests },
  })
  for (const contextId of [first.contextId, second.contextId]) {
    await table.delete(contextManifestKey(contextId))
  }
  assert.equal(table.get(contextManifestKey(first.contextId)), undefined)

  const report = await controller.migrateStoredRecords(signal())
  assert.deepEqual(
    { ran: report.ran, migrated: report.migrated, skipped: report.skipped, emptied: report.emptied },
    { ran: true, migrated: 2, skipped: 0, emptied: 1 },
  )
  assert.equal(controller.readContext(ids.passage, first.contextId, signal()).found, true)
  assert.equal(table.get(contextsKey(ids.passage)).payload.manifests.length, 0, 'the legacy array is emptied')

  const marker = table.get(migrationKey(CONTEXT_MIGRATION_NAME))
  assert.equal(marker?.kind, 'storageMigration', 'the move leaves an audit record')
  assert.equal(marker.payload.migratedManifests, 2)
  assert.equal(marker.payload.fromVersion, 1)
  assert.equal(marker.payload.toVersion, 2)

  const again = await controller.migrateStoredRecords(signal())
  assert.equal(again.ran, false, 'a second open finds nothing left to move')

  // Re-running over an array whose manifests are already per-record skips them.
  await table.put(contextsKey(ids.passage), {
    kind: 'contexts', recordVersion: 1, payload: { passageId: ids.passage, manifests },
  })
  const third = await controller.migrateStoredRecords(signal())
  assert.deepEqual(
    { ran: third.ran, migrated: third.migrated, skipped: third.skipped },
    { ran: true, migrated: 0, skipped: 2 },
  )
})

test('a selection anchor sends its own words, and a stale one refuses instead', async () => {
  const backend = recordingBackend()
  const { controller, domain } = await withPassage(backend)

  const selection = await controller.createSelection({
    passageId: ids.passage, ranges: [{ start: 0, end: 2 }], note: '', operationId: uuid(),
  }, signal())
  assert.equal(selection.created, true)
  const branchId = await openBranch(controller, { anchorId: selection.anchorId, title: '选区讨论' })

  const asked = await ask(controller, branchId, '这个词在这里做什么？')
  assert.equal(asked.ok, true)
  assert.match(
    backend.calls[0].prompt,
    /【选区 sel_[0-9a-f]{16}】/u,
    'the selection is a material of its own, not an omission',
  )
  assert.match(backend.calls[0].prompt, /Il/u, 'and it carries the selected words')

  // The selection record disappears: the anchor can no longer be reproduced.
  await domain.table('records').delete(selectionKey(selection.anchorId.slice(4)))
  const callsBefore = backend.calls.length
  const refused = await ask(controller, branchId, '选区没了以后呢？')
  assert.equal(refused.ok, false)
  assert.match(refused.reason, /^selection-stale/u)
  assert.equal(backend.calls.length, callsBefore, 'nothing was sent without the words the question is about')

  // The refusal is recorded in the branch, so the reader is told rather than
  // shown a question that silently went nowhere.
  const branch = controller.listDiscussion(ids.passage, signal())
    .branches.find((entry) => entry.branchId === branchId)
  assert.match(branch.messages[branch.messages.length - 1].text, /未发送/u)
})
