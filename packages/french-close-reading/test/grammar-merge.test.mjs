import test from 'node:test'
import assert from 'node:assert/strict'

import { createBacking, ids, openController, passageRequest, signal } from './support/harness.mjs'
import { FRENCH_READER_DOMAIN } from '../lib/domain.js'
import { buildFrenchReaderTool } from '../lib/tools.js'

/**
 * Merging same-named grammar entries (R7-U06).
 *
 * The automatic extraction keys a rule by its normalised topic, so two topics
 * that differ only by trailing punctuation — which the reader reads as one and
 * the same rule — legitimately produce two records. The panel now names the
 * differences and the reader decides; this is the only path that deletes one.
 */
const ANCHOR = 'p1.s1'
let counter = 0
const nextOperation = () => `00000000-0000-4000-8000-0000000${String(counter++).padStart(5, '0')}`

async function withTool() {
  const backing = createBacking()
  const opened = await openController(backing, FRENCH_READER_DOMAIN)
  await opened.controller.createPassage(passageRequest, signal())
  return { backing, controller: opened.controller, tool: buildFrenchReaderTool(opened.controller) }
}

const grammarIntent = (topic, body, extra = {}) => ({
  kind: 'grammar', anchorId: ANCHOR, title: topic, body, ...extra,
})

/**
 * Two entries the reader reads as one rule.
 *
 * The live write path de-duplicates by topic, so duplicates enter a library the
 * way the tested report's did: through an imported bundle (or an older build).
 * Here the second record is the first one's twin with a different storage key
 * and a topic that differs only by trailing punctuation.
 */
async function twoSameNamedEntries() {
  const { tool, controller } = await withTool()
  await tool.execute({
    action: 'answer', passageId: ids.passage, anchorId: ANCHOR,
    question: '这里的 que 是什么成分？', answer: '关系代词作直接宾语。',
    intents: [grammarIntent('que 作直接宾语', 'que 引导关系从句并在从句中作直接宾语。', { level: 'B1', module: '关系从句' })],
    operationId: nextOperation(),
  })
  const library = await controller.exportLibrary(signal())
  const record = library.records.find((entry) => entry.record?.kind === 'grammar')
  assert.ok(record, 'the grammar record is in the exported library')
  const twin = JSON.parse(JSON.stringify(record.record))
  twin.payload = {
    ...twin.payload,
    id: '00000000-0000-4000-8000-00000000cafe',
    topic: 'que 作直接宾语。',
    topicKey: 'que 作直接宾语。',
    level: 'B2',
    module: '关系从句与 dont',
    keyPoints: '补充：先行词指物时用 que，指人时也可用 que。',
    notes: '',
    examples: [{
      id: '00000000-0000-4000-8000-00000000aaaa',
      text: 'Le livre que je lis est passionnant.',
      passageId: null,
      anchorId: null,
      anchor: null,
      question: '第二个 que 怎么分析？',
      intentId: '00000000-0000-4000-8000-00000000bbbb',
      questionId: '00000000-0000-4000-8000-00000000cccc',
      // A string date: the schema takes an ISO datetime, and this fixture is
      // imported as data, not produced by a run.
      createdAt: '2026-01-01T00:00:00.000Z',
    }],
    askCount: 1,
    lastAskedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    pitfalls: [{
      id: '00000000-0000-4000-8000-00000000beef',
      text: '不要把 que 与 dont 混用。',
      intentId: '00000000-0000-4000-8000-00000000feed',
      createdAt: '2026-01-01T00:00:00.000Z',
    }],
    revision: 1,
    operationId: '00000000-0000-4000-8000-00000000dead',
  }
  const imported = await controller.importLibrary({
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    records: [{ key: `${record.key}_twin`, record: twin }],
  }, signal())
  assert.equal(imported.imported, 1, 'the twin record imports')
  const grammar = await tool.execute({ action: 'grammar' })
  assert.equal(grammar.detail.total, 2, 'the two topics are two records')
  return { tool, controller, entries: grammar.detail.entries }
}

test('a merge moves examples and pitfalls into the kept entry and deletes the others', async () => {
  const { controller, entries } = await twoSameNamedEntries()
  const keep = entries.find((entry) => entry.topic === 'que 作直接宾语')
  const other = entries.find((entry) => entry.topic === 'que 作直接宾语。')

  const value = await controller.mergeGrammarEntriesRemote({
    keepEntryId: keep.entryId,
    mergeEntryIds: [other.entryId],
    operationId: nextOperation(),
  }, signal())

  assert.equal(value.kind, 'merged')
  assert.equal(value.examples, 1, 'the other entry’s example moved in')
  assert.equal(value.pitfalls, 1)

  const after = await controller.listGrammar(signal())
  assert.equal(after.entries.length, 1, 'one topic, one entry')
  const merged = after.entries[0]
  assert.equal(merged.id, keep.entryId)
  assert.equal(merged.examples.length, 2, 'both examples are kept')
  assert.equal(merged.pitfalls.length, 1, 'the pitfall came with them')
  assert.equal(merged.askCount, 2, 'the question count is the real usage history')
  assert.equal(merged.keyPoints, keep.keyPoints ?? merged.keyPoints, 'the kept rule text survives')
  assert.equal(merged.level, 'B1', 'the kept entry’s own level wins')
  assert.equal(merged.module, '关系从句', 'and its module too')
})

test('a merge never weakens the mastery claim and is idempotent', async () => {
  const { controller, entries } = await twoSameNamedEntries()
  const keep = entries.find((entry) => entry.topic === 'que 作直接宾语')
  const other = entries.find((entry) => entry.topic === 'que 作直接宾语。')
  // The reader knows the second one better: the merge keeps the stronger claim.
  await controller.setGrammarMastery({ entryId: other.entryId, mastery: 'known', expectedRevision: null, operationId: nextOperation() }, signal())

  const operationId = nextOperation()
  const first = await controller.mergeGrammarEntriesRemote({
    keepEntryId: keep.entryId, mergeEntryIds: [other.entryId], operationId,
  }, signal())
  assert.equal(first.kind, 'merged')
  assert.equal(first.mastery, 'known', 'a merge does not silently say the reader knows less')

  const retried = await controller.mergeGrammarEntriesRemote({
    keepEntryId: keep.entryId, mergeEntryIds: [other.entryId], operationId,
  }, signal())
  assert.equal(retried.kind, 'already-merged', 'a retried merge lands on the same outcome')

  const after = await controller.listGrammar(signal())
  assert.equal(after.entries.length, 1)
  assert.equal(after.entries[0].examples.length, 2, 'a retry does not duplicate the examples')
})

test('a merge refuses what it cannot do, and says which', async () => {
  const { controller, entries } = await twoSameNamedEntries()
  const keep = entries[0]

  const unknown = await controller.mergeGrammarEntriesRemote({
    keepEntryId: '00000000-0000-4000-8000-0000000000ff', mergeEntryIds: [keep.entryId], operationId: nextOperation(),
  }, signal())
  assert.equal(unknown.kind, 'conflict')
  assert.equal(unknown.reason, 'entry-unknown')

  const nothing = await controller.mergeGrammarEntriesRemote({
    keepEntryId: keep.entryId,
    mergeEntryIds: ['00000000-0000-4000-8000-0000000000fe'],
    operationId: nextOperation(),
  }, signal())
  assert.equal(nothing.kind, 'conflict')
  assert.equal(nothing.reason, 'nothing-to-merge')

  const after = await controller.listGrammar(signal())
  assert.equal(after.entries.length, 2, 'a refused merge changes nothing')
})
