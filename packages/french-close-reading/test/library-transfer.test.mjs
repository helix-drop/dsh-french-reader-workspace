import test from 'node:test'
import assert from 'node:assert/strict'

import { createBacking, ids, openController, passageRequest, signal } from './support/harness.mjs'
import { FRENCH_READER_DOMAIN } from '../lib/domain.js'
import { buildFrenchReaderTool } from '../lib/tools.js'

const uuid = () => globalThis.crypto.randomUUID()
const SENTENCE = 'Il faut cultiver notre jardin.'
const ANALYSIS_REPLY = JSON.stringify({
  translation: '我们必须耕种我们的园地。',
  backbone: 'il faut cultiver notre jardin',
  clauses: [{ role: '主句', start: 0, end: 16, text: SENTENCE.slice(0, 16), parentIndex: null }],
  constituents: [
    { role: '形式主语', start: 0, end: 2, text: 'Il', clauseIndex: 0, partOfSpeech: '代词' },
    { role: '谓语', start: 3, end: 16, text: 'faut cultiver', clauseIndex: 0, partOfSpeech: '动词' },
    { role: '直接宾语', start: 17, end: 29, text: 'notre jardin', clauseIndex: 0, partOfSpeech: '名词短语' },
  ],
  morphology: [],
  explanations: [{ kind: 'syntax', text: 'il 是无人称句的形式主语。', start: 0, end: 2 }],
})

/** One backend that answers inline, so the discussion and analysis rows exist. */
function inlineBackend(reply = ANALYSIS_REPLY) {
  return {
    id: 'stub',
    label: 'stub',
    capabilities: {
      streaming: false, cancel: true, reportsResolvedModel: true,
      reportsUsage: true, maxInputCharacters: null, singleFlight: false,
    },
    available: () => ({ available: true }),
    listModels: async () => [],
    generate: async (target) => ({
      text: reply, resolvedModel: target.model, usage: null, finish: 'stop', failure: null,
    }),
  }
}

/** A library with every record kind the plugin writes today. */
async function buildLibrary() {
  const backing = createBacking()
  const opened = await openController(backing, FRENCH_READER_DOMAIN, { backends: [inlineBackend()] })
  const tool = buildFrenchReaderTool(opened.controller)

  await opened.controller.createPassage(passageRequest, signal())
  await opened.controller.getSegmentation({ passageId: ids.passage }, signal())
  const variant = await tool.execute({
    action: 'translate', passageId: ids.passage, anchorId: 'p1.s1',
    text: '必须耕种我们自己的园地。', source: 'user', note: '口语化',
    operationId: '00000000-0000-4000-8000-0000000000e1',
  })
  await tool.execute({
    action: 'adopt', passageId: ids.passage, anchorId: 'p1.s1', translationId: variant.detail.translationId,
  })
  await tool.execute({
    action: 'answer', passageId: ids.passage, anchorId: 'p1.s1',
    question: 'il faut 是什么结构？', answer: '无人称句。',
    intents: [
      { kind: 'branch', anchorId: 'p1.s1', title: '无人称 il faut', body: 'il 为形式主语。' },
      { kind: 'grammar', anchorId: 'p1.s1', title: '无人称句 il faut', body: 'il 为形式主语。' },
    ],
  })
  await tool.execute({ action: 'mot', mot: 'cœur', partOfSpeech: 'nom masculin', create: true, definition: '心。' })
  await tool.execute({
    action: 'revise', passageId: ids.passage, expectedSourceRevision: 1,
    sourceText: 'Il faut cultiver notre jardin.\n\n— Mais lequel ?', note: '补问句',
  })
  await tool.execute({ action: 'backfill', passageId: ids.passage, sourceRevision: 1 })

  // The entities added after the first milestone: a discussion with a turn, a
  // confirmed conclusion, a gated sentence analysis and a published version.
  const branch = await opened.controller.createDiscussionBranch({
    passageId: ids.passage, anchorId: 'p1.s1', kind: 'discussion', title: '无人称句讨论',
    parentId: null, forkedFrom: null, operationId: uuid(),
  }, signal())
  await opened.controller.ask({
    passageId: ids.passage, branchId: branch.branchId, question: 'il faut 是什么结构？',
    backend: 'stub', model: 'stub-model', operationId: uuid(),
  }, signal())
  await opened.controller.recordConclusion({
    passageId: ids.passage, branchId: branch.branchId, anchorId: 'p1.s1', messageId: null,
    text: 'il 是形式主语。', status: 'confirmed', operationId: uuid(),
  }, signal())
  await opened.controller.createSelection({
    passageId: ids.passage, operationId: uuid(), ranges: [{ start: 0, end: 2 }], note: '形式主语',
  }, signal())
  await opened.controller.analyseSentence({
    passageId: ids.passage, anchorId: 'p1.s1', backend: 'stub', model: 'stub-model',
    reasoningEffort: null, operationId: uuid(),
  }, signal())
  await opened.controller.publishAnalysis({
    passageId: ids.passage, overallTranslation: '我们必须耕种我们的园地。', cohesion: '与下文的问答衔接。',
  }, signal())
  await opened.controller.setGrammarMastery({
    entryId: (await opened.controller.listGrammar(signal())).entries[0].id,
    mastery: 'known', expectedRevision: null, operationId: uuid(),
  }, signal())
  return { backing, controller: opened.controller, tool }
}

test('export carries every record with its key, not a lossy projection', async () => {
  const { tool } = await buildLibrary()
  const exported = await tool.execute({ action: 'export' })
  assert.equal(exported.detail.schemaVersion, 1)
  assert.equal(exported.detail.records, exported.detail.bundle.records.length)
  assert.ok(exported.detail.records > 6, 'passages, segments, analysis, adoptions, runs, lexicon and sources')

  const keys = exported.detail.bundle.records.map((entry) => entry.key)
  assert.ok(keys.some((key) => key.startsWith('lexicon_')), 'vocabulary travels with the library')
  assert.ok(keys.some((key) => key.startsWith('source_')), 'source history travels too')
  assert.ok(keys.some((key) => key.startsWith('adoptions_')))
  assert.ok(keys.some((key) => key.startsWith('runs_')))
  // The entities that only exist after the later milestones must travel too: a
  // backup that silently drops the discussion would look complete and not be.
  // Compiled contexts travel as one record each (`context_<id>`), which is what
  // keeps "what exactly was sent" alive past the old 200-manifest cap.
  for (const prefix of ['discussion_', 'context_', 'conclusions_', 'sentences_', 'analysisVersions_', 'version_', 'selection_']) {
    assert.ok(keys.some((key) => key.startsWith(prefix)), `${prefix} travels with the library`)
  }
})

test('every record kind survives a backup and restore, including the discussion', async () => {
  const { tool } = await buildLibrary()
  const bundle = (await tool.execute({ action: 'export' })).detail.bundle
  const kinds = new Set(bundle.records.map((entry) => entry.record.kind))
  for (const kind of ['discussion', 'contextManifest', 'conclusions', 'sentenceAnalyses', 'analysisVersions', 'contentVersion']) {
    assert.equal(kinds.has(kind), true, `${kind} is in the backup`)
  }

  const empty = createBacking()
  const restored = await openController(empty, FRENCH_READER_DOMAIN)
  const result = await restored.controller.importLibrary(bundle, signal())
  assert.deepEqual(result.conflicts, [], 'a valid backup imports without conflict')
  assert.equal(result.imported, bundle.records.length)

  // The relationships are back, not just the rows: the branch has its turn, the
  // conclusion names its branch, and the analysis still covers its sentence.
  const discussion = restored.controller.listDiscussion(ids.passage, signal())
  assert.equal(discussion.branches.length, 1)
  assert.equal(discussion.branches[0].messages.length, 2, 'the question and its answer both restored')
  assert.equal(discussion.branches[0].messages[1].backend, 'stub', 'the answer kept its provenance')
  assert.equal(discussion.conclusions.length, 1)
  assert.equal(discussion.conclusions[0].status, 'confirmed')
  // "What was it allowed to see" survives the round trip, not just the message.
  const restoredContext = restored.controller.readContext(
    ids.passage, discussion.branches[0].messages[1].contextId, signal(),
  )
  assert.equal(restoredContext.found, true, 'the restored answer can still show its sent context')
  assert.match(restoredContext.manifest.fingerprint, /^[0-9a-f]{64}$/u)

  const coverage = restored.controller.readAnalysisCoverage(ids.passage, signal())
  assert.deepEqual(coverage.covered, ['p1.s1'])
  assert.equal(coverage.versionCount, 1)
  assert.equal(coverage.currentVersion.overallTranslation, '我们必须耕种我们的园地。')
})

test('an exported library restores into an empty profile and re-imports idempotently', async () => {
  const { tool } = await buildLibrary()
  const bundle = (await tool.execute({ action: 'export' })).detail.bundle

  const empty = createBacking()
  const restored = await openController(empty, FRENCH_READER_DOMAIN)
  const restoreTool = buildFrenchReaderTool(restored.controller)
  const first = await restoreTool.execute({ action: 'import', bundle })
  assert.equal(first.detail.imported, bundle.records.length)
  assert.equal(first.detail.skipped, 0)
  assert.deepEqual(first.detail.conflicts, [])

  // Everything is readable, including the relationships between records.
  const analysis = await restoreTool.execute({ action: 'analysis', passageId: ids.passage })
  assert.equal(analysis.detail.adopted.length, 1)
  // No overall translation exists in this library yet, so there is nothing for
  // a sentence change to disagree with.
  assert.equal(analysis.detail.reconciliation.passageTranslationId, null)
  assert.equal(analysis.detail.reconciliation.needed, false)
  const runs = await restoreTool.execute({ action: 'runs', passageId: ids.passage })
  // The run carried a branch note and a grammar point: both restore as applied.
  assert.equal(runs.detail.runs[0].applied, 2)
  const lexicon = await restoreTool.execute({ action: 'lexicon' })
  assert.equal(lexicon.detail.total, 1)
  const oldSource = await restoreTool.execute({ action: 'source', passageId: ids.passage, revision: 1 })
  assert.equal(oldSource.detail.found, true, 'the original revision is traceable after a round trip')

  const second = await restoreTool.execute({ action: 'import', bundle })
  assert.equal(second.detail.imported, 0)
  assert.equal(second.detail.skipped, bundle.records.length, 'a second import changes nothing')
  await restored.domain.close()
})

test('import never overwrites local work, and reports what it refused', async () => {
  const { tool } = await buildLibrary()
  const bundle = (await tool.execute({ action: 'export' })).detail.bundle

  // The local profile keeps a passage row the bundle disagrees with.
  const tampered = {
    ...bundle,
    records: bundle.records.map((entry) => entry.key === ids.passage
      ? { ...entry, record: { ...entry.record, payload: { ...entry.record.payload, title: '别的标题' } } }
      : entry),
  }
  const result = await tool.execute({ action: 'import', bundle: tampered })
  assert.equal(result.detail.imported, 0)
  assert.equal(result.detail.skipped, bundle.records.length - 1)
  assert.deepEqual(result.detail.conflicts, [{ key: ids.passage, reason: 'content-differs' }])

  const stored = await tool.execute({ action: 'read', passageId: ids.passage })
  assert.equal(stored.detail.title, passageRequest.title, 'the local record was left alone')
})

test('a malformed or unknown bundle is refused without touching storage', async () => {
  const { backing, tool } = await buildLibrary()
  const before = backing.writes.length

  const notABundle = await tool.execute({ action: 'import', bundle: { schemaVersion: 2, records: [] } })
  assert.equal(notABundle.ok, false)
  assert.deepEqual(notABundle.detail.conflicts, [{ key: '', reason: 'unsupported-bundle' }])

  const invalidRecord = await tool.execute({
    action: 'import',
    bundle: {
      schemaVersion: 1,
      records: [{ key: 'lexicon_deadbeef', record: { kind: 'lexicon', recordVersion: 1, payload: { mot: 'x' } } }],
    },
  })
  assert.deepEqual(invalidRecord.detail.conflicts, [{ key: 'lexicon_deadbeef', reason: 'schema-invalid' }])
  assert.equal(invalidRecord.detail.imported, 0, 'a record that would fail the next open is never planted')
  assert.equal(backing.writes.length, before)
})
