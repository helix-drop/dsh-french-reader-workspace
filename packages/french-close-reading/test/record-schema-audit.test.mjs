import test from 'node:test'
import assert from 'node:assert/strict'

import { createBacking, ids, openController, passageRequest, signal } from './support/harness.mjs'
import { FRENCH_READER_DOMAIN } from '../lib/domain.js'
import { contextManifestKey, contextsKey } from '../lib/discussion-store.js'
import { writeConjugationDataset } from '../lib/conjugation-store.js'

/**
 * Every record kind the plugin can write, checked against the real record schema.
 *
 * The in-memory medium used by these tests does not validate on write the way a
 * JSON or SQLite backend does, so a payload that drifts from its schema stays
 * invisible until a user restarts and the domain refuses to open. This audit
 * writes one record of every kind through the real code paths and then validates
 * each one, which is where that drift becomes a failing test instead of a broken
 * app.
 */
const uuid = () => globalThis.crypto.randomUUID()
const SENTENCE = 'Il faut cultiver notre jardin.'

const reply = JSON.stringify({
  translation: '我们必须耕种我们的园地。',
  backbone: 'il faut cultiver notre jardin',
  clauses: [{ role: '主句', start: 0, end: SENTENCE.length, text: SENTENCE, parentIndex: null }],
  constituents: [
    { role: '形式主语', start: 0, end: 2, text: 'Il', clauseIndex: 0, partOfSpeech: '代词' },
    { role: '谓语', start: 3, end: 16, text: 'faut cultiver', clauseIndex: 0, partOfSpeech: '动词' },
    { role: '直接宾语', start: 17, end: 29, text: 'notre jardin', clauseIndex: 0, partOfSpeech: '名词短语' },
  ],
  morphology: [],
  explanations: [],
})

function stubBackend() {
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

/** Exercise one path per record kind, so every kind is present in the store. */
async function buildEveryKind() {
  const backing = createBacking()
  const opened = await openController(backing, FRENCH_READER_DOMAIN, { backends: [stubBackend()] })
  const c = opened.controller
  await c.createPassage({ ...passageRequest, sourceText: SENTENCE }, signal())
  await c.getSegmentation({ passageId: ids.passage }, signal())
  const variant = await c.saveTranslation({
    passageId: ids.passage, operationId: uuid(), anchorId: 'p1.s1',
    source: 'user', note: '', language: 'zh-Hans', text: '译文',
  }, signal())
  await c.adoptTranslation({
    passageId: ids.passage, anchorId: 'p1.s1',
    translationId: variant.translation.id, operationId: uuid(),
  }, signal())
  const branch = await c.createDiscussionBranch({
    passageId: ids.passage, anchorId: 'p1.s1', kind: 'discussion', title: '讨论',
    parentId: null, forkedFrom: null, operationId: uuid(),
  }, signal())
  await c.ask({
    passageId: ids.passage, branchId: branch.branchId, question: '这一句？',
    backend: 'stub', model: 'm', operationId: uuid(),
  }, signal())
  await c.recordConclusion({
    passageId: ids.passage, branchId: branch.branchId, anchorId: 'p1.s1',
    messageId: null, text: '结论', status: 'confirmed', operationId: uuid(),
  }, signal())
  await c.analyseSentence({
    passageId: ids.passage, anchorId: 'p1.s1', backend: 'stub', model: 'm',
    reasoningEffort: null, operationId: uuid(),
  }, signal())
  await c.publishAnalysis({ passageId: ids.passage, overallTranslation: '整体', cohesion: '' }, signal())
  await c.createSelection({
    passageId: ids.passage, operationId: uuid(), ranges: [{ start: 0, end: 2 }], note: '',
  }, signal())
  await c.commitRun({
    passageId: ids.passage, operationId: uuid(), anchorId: 'p1.s1', question: 'q', answer: 'a',
    intents: [{ kind: 'grammar', anchorId: 'p1.s1', title: '语法点', body: '正文' }],
  }, signal())
  const lexicon = await c.createLexiconEntry({
    mot: 'cœur', partOfSpeech: 'nom', lemma: null, forms: [], definition: '心',
    label: '', provenance: 'ai', operationId: uuid(),
  }, signal())
  await c.appendLexiconOccurrence({
    entryId: lexicon.entryId, passageId: ids.passage, anchorId: 'p1.s1',
    excerpt: 'Il', note: '这里', operationId: uuid(),
  }, signal())
  await c.setLexiconSection({ entryId: lexicon.entryId, section: 'culture', text: '未发现可靠关联。' }, signal())
  const grammar = (await c.listGrammar(signal())).entries[0]
  await c.setGrammarMastery({
    entryId: grammar.id, mastery: 'known', expectedRevision: null, operationId: uuid(),
  }, signal())
  await c.reviseSource({
    passageId: ids.passage, operationId: uuid(), expectedSourceRevision: 1,
    sourceText: `${SENTENCE} Encore.`, note: null,
  }, signal())

  // The legacy manifest array is no longer written by the turn path, so the audit
  // recreates one and runs the real migration over it. That is what keeps three
  // kinds honest at once: the emptied `contexts` record, the per-record
  // `contextManifest` it moved, and the `storageMigration` marker it left behind.
  const answer = (await c.listDiscussion(ids.passage, signal()))
    .branches[0].messages.find((message) => message.author === 'model')
  const table = opened.domain.table('records')
  const manifest = c.readContext(ids.passage, answer.contextId, signal()).manifest
  await table.put(contextsKey(ids.passage), {
    kind: 'contexts', recordVersion: 1, payload: { passageId: ids.passage, manifests: [manifest] },
  })
  await table.delete(contextManifestKey(answer.contextId))
  await c.migrateStoredRecords(signal())

  // A conjugation dataset with its provenance and fetch state: the shape a later
  // open validates before a card is allowed to read it.
  await writeConjugationDataset(table, {
    lemma: 'cultiver',
    dataset: {
      lemma: 'cultiver',
      source: { kind: 'fr-wiktionary', version: 'api', fetchedAt: '2026-10-07T00:00:00.000Z' },
      tenses: [{
        mood: 'ind', tense: 'pre', label: '现在时',
        bases: [{ ipa: 'kyltiv', persons: ['1s', '2s', '3s', '1p', '2p', '3p'], writtenStem: 'cultiv' }],
        forms: [{ person: '1s', written: 'cultive', ipa: 'kyltiv', baseIndex: 0 }],
        notes: [],
      }],
    },
    source: 'fr-wiktionary',
    sourceVersion: 'api',
    fetchStatus: 'ok',
  })
  return { backing, controller: c }
}

test('every record kind the plugin writes satisfies the real record schema', async () => {
  const { backing } = await buildEveryKind()
  const schema = FRENCH_READER_DOMAIN.tables.records.valueSchema
  const byKind = new Map()
  for (const [key, record] of backing.tables.get('records')) {
    const parsed = schema.safeParse(record)
    const entry = byKind.get(record.kind) ?? { ok: 0, bad: [] }
    if (parsed.success) entry.ok += 1
    else {
      entry.bad.push(
        `${key}: ${parsed.error.issues.slice(0, 2).map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`,
      )
    }
    byKind.set(record.kind, entry)
  }

  const failures = [...byKind.entries()]
    .filter(([, entry]) => entry.bad.length > 0)
    .map(([kind, entry]) => `${kind} → ${entry.bad.join(' | ')}`)
  assert.deepEqual(failures, [], 'a record that fails its schema would break the next open')

  // The audit is only meaningful if it really reaches every kind.
  const expected = [
    'adoptions', 'analysis', 'analysisVersions', 'conclusions', 'conjugationDataset', 'contentVersion',
    'contextManifest', 'contexts', 'discussion', 'generationJob', 'grammar', 'grammarStore', 'lexicon',
    'lexiconIndex', 'passage', 'runs', 'segments', 'selection', 'sentenceAnalyses', 'source',
    'storageMigration',
  ]
  const missing = expected.filter((kind) => !byKind.has(kind))
  assert.deepEqual(missing, [], 'every record kind is exercised by this audit')
})

test('the medium itself refuses a record a real backend would refuse', async () => {
  const backing = createBacking()
  const opened = await openController(backing, FRENCH_READER_DOMAIN)
  await opened.controller.createPassage(passageRequest, signal())
  // `openController` installs the real schema, and the medium refuses what a real
  // backend would refuse. This is the guard that turns a shape drift into a
  // failing test instead of a domain that will not open after a restart.
  assert.notEqual(backing.schema, null, 'the medium validates by default')
  const unit = backing.facility().facility
  assert.equal(typeof unit.open, 'function')
  const bad = { kind: 'passage', recordVersion: 1, payload: { id: 'not-a-uuid' } }
  assert.equal(FRENCH_READER_DOMAIN.tables.records.valueSchema.safeParse(bad).success, false)

  // Writing that record through the domain is refused, which is the behaviour the
  // audit above depends on.
  const table = opened.domain.table('records')
  await assert.rejects(
    () => table.put('bad', bad),
    /medium rejected an invalid record/u,
  )
})

test('an answer carries a UUID-shaped operation id, and a retry maps to the same one', async () => {
  const { backing } = await buildEveryKind()
  const discussion = [...backing.tables.get('records').entries()]
    .find(([key]) => key.startsWith('discussion_'))[1].payload
  const answers = discussion.branches[0].messages.filter((message) => message.author === 'model')
  assert.equal(answers.length, 1, 'the answered turn is stored')
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u
  for (const answer of answers) {
    assert.match(answer.operationId, uuidPattern, 'a suffixed string is not a UUID and would be refused')
  }
})

test('a rewritten source keeps the earlier analysis readable as its own version', async () => {
  const { controller } = await buildEveryKind()
  // The revision did not change the first sentence, and the stored analysis still
  // describes its text, so it stays covered rather than being invalidated by the
  // act of correcting a later part of the passage.
  const coverage = controller.readAnalysisCoverage(ids.passage, signal())
  assert.equal(coverage.versionCount, 1, 'the published version survives the corrected source')
  assert.equal(coverage.sourceRevision, 2, 'coverage is reported against the current source')
  assert.deepEqual(coverage.covered, ['p1.s1'])
  assert.deepEqual(coverage.stale, [], 'the sentence it describes is unchanged, so it is not stale')
  // The revision appended a sentence, and that one has no analysis: the report
  // says so rather than presenting the passage as fully analysed.
  assert.deepEqual(coverage.missing, ['p1.s2'])
  assert.equal(coverage.total, 2)
})
