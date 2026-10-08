import test from 'node:test'
import assert from 'node:assert/strict'

import { createBacking, openController } from './support/harness.mjs'
import { FRENCH_READER_DOMAIN } from '../lib/domain.js'
import { buildFrenchReaderTool } from '../lib/tools.js'

async function withTool() {
  const backing = createBacking()
  const opened = await openController(backing, FRENCH_READER_DOMAIN)
  return { backing, controller: opened.controller, tool: buildFrenchReaderTool(opened.controller) }
}

test('the tool advertises every action and its schema', () => {
  const tool = buildFrenchReaderTool({})
  assert.equal(tool.name, 'french_reader')
  assert.deepEqual(tool.parameters.properties.action.enum, [
    'list', 'preview', 'conjugation', 'coverage', 'save', 'read', 'archive', 'translate', 'branch', 'analysis',
    'answer', 'resume', 'runs', 'source', 'select', 'revise', 'backfill', 'export', 'import',
    'adopt', 'mot', 'lexicon', 'occurrence', 'grammar', 'resolve', 'render', 'section', 'lexiconSource',
    'backends', 'models', 'context', 'discuss', 'discussion', 'ask', 'sentContext',
    'coverageReport', 'analyse', 'sentence', 'publish', 'sources', 'fetchSource', 'mastery',
    'conjugationData',
  ])
  assert.deepEqual(tool.parameters.required, ['action'])
  assert.deepEqual(tool.parameters.properties.kind.enum, ['constituents', 'grammar', 'vocabulary', 'translation', 'note'])
  assert.deepEqual(tool.output.render({}, { ok: true }), [{ type: 'text', text: '{"ok":true}' }])
})

test('pronunciation data is read from the store, and fetching without a web service refuses', async () => {
  const { tool } = await withTool()

  // Nothing stored: the answer is `no-data`, not a paradigm generated from memory.
  const read = await tool.execute({ action: 'conjugationData', conjugationLemma: 'venir' })
  assert.equal(read.ok, true)
  assert.equal(read.detail.state, 'no-data')
  assert.match(read.detail.reason, /尚未获取/u)

  const list = await tool.execute({ action: 'conjugationData', conjugationMode: 'list' })
  assert.equal(list.detail.total, 0)
  assert.deepEqual(list.detail.records, [])

  // A fetch needs the Host's web service; without one it refuses and says so rather
  // than reporting an empty paradigm.
  const fetch = await tool.execute({ action: 'conjugationData', conjugationMode: 'fetch', conjugationLemma: 'venir' })
  assert.equal(fetch.detail.refused, true)
  assert.equal(fetch.detail.reason, 'web-unavailable')

  // A missing lemma is refused too, not silently read as the empty string.
  const blank = await tool.execute({ action: 'conjugationData', conjugationLemma: '   ' })
  assert.equal(blank.ok, false)
})

test('an identical retry cannot create a duplicate passage, and a fresh id can', async () => {
  const { tool } = await withTool()
  const request = { action: 'save', title: 'Pascal', sourceText: 'Le cœur a ses raisons.' }
  const first = await tool.execute(request)
  const retry = await tool.execute(request)

  assert.equal(retry.ok, true)
  assert.equal(retry.detail.passageId, first.detail.passageId)
  assert.equal(retry.detail.alreadySaved, true)
  // The derived id is a real UUID: the storage schema accepts it.
  assert.match(first.detail.passageId, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u)

  const listed = await tool.execute({ action: 'list' })
  assert.equal(listed.detail.total, 1, 'a retry must not add a second library entry')

  const duplicate = await tool.execute({
    ...request,
    id: '11111111-2222-4333-8444-555555555555',
  })
  assert.equal(duplicate.detail.saved, true)
  assert.notEqual(duplicate.detail.passageId, first.detail.passageId)
  assert.equal((await tool.execute({ action: 'list' })).detail.total, 2)
})

test('archive hides a passage from the library while keeping its notes', async () => {
  const { tool } = await withTool()
  const saved = await tool.execute({ action: 'save', title: 'Pascal', sourceText: 'Le cœur a ses raisons.' })
  const passageId = saved.detail.passageId
  await tool.execute({ action: 'translate', passageId, anchorId: 'passage', text: '心有其理。' })
  await tool.execute({ action: 'branch', passageId, anchorId: 'p1.s1', kind: 'note', title: '笔记', body: '保留。' })

  const archived = await tool.execute({ action: 'archive', passageId, expectedSourceRevision: 1 })
  assert.equal(archived.ok, true)
  assert.equal(archived.detail.archived, true)
  assert.equal(typeof archived.detail.archivedAt, 'string')

  const listed = await tool.execute({ action: 'list' })
  assert.equal(listed.detail.total, 0, 'an archived passage leaves the library index')

  const retry = await tool.execute({ action: 'archive', passageId, expectedSourceRevision: 1 })
  assert.equal(retry.detail.alreadyArchived, true)

  const read = await tool.execute({ action: 'read', passageId })
  assert.equal(read.detail.found, true, 'the source is kept for the reader')
  const analysis = await tool.execute({ action: 'analysis', passageId })
  assert.equal(analysis.detail.translations.length, 1)
  assert.equal(analysis.detail.branches.length, 1)

  const staleRevision = await tool.execute({
    action: 'archive',
    passageId: '11111111-2222-4333-8444-555555555555',
    expectedSourceRevision: 1,
  })
  assert.equal(staleRevision.ok, false)
  assert.equal(staleRevision.detail.reason, 'passage-unknown')
})

test('save returns anchors and read replays the immutable source', async () => {
  const { tool } = await withTool()
  const saved = await tool.execute({
    action: 'save',
    title: 'Pascal',
    sourceText: 'Le cœur a ses raisons.\n\nQue la raison ne connaît point.',
  })
  assert.equal(saved.ok, true)
  assert.equal(saved.detail.paragraphs.length, 2)
  assert.equal(saved.detail.paragraphs[0].anchorId, 'p1')
  assert.deepEqual(saved.detail.paragraphs[1].sentences.map((s) => s.anchorId), ['p2.s1'])

  const read = await tool.execute({ action: 'read', passageId: saved.detail.passageId })
  assert.equal(read.detail.sourceText.includes('Le cœur a ses raisons.'), true)
  assert.equal(read.detail.paragraphs[1].text, 'Que la raison ne connaît point.')

  const listed = await tool.execute({ action: 'list' })
  assert.equal(listed.detail.total, 1)
  assert.equal(listed.detail.passages[0].passageId, saved.detail.passageId)
})

test('the overall translation uses the passage anchor and versions accumulate', async () => {
  const { tool } = await withTool()
  const saved = await tool.execute({ action: 'save', title: 'Pascal', sourceText: 'Le cœur a ses raisons.' })
  const passageId = saved.detail.passageId

  const overall = await tool.execute({
    action: 'translate', passageId, anchorId: 'passage', text: '心有其理，理不知之。',
  })
  assert.equal(overall.ok, true)
  assert.equal(overall.detail.anchorId, 'passage')

  const sentence = await tool.execute({
    action: 'translate', passageId, anchorId: 'p1.s1', text: '心有其自身的道理。',
  })
  assert.equal(sentence.ok, true)

  const bad = await tool.execute({ action: 'translate', passageId, anchorId: 'p4.s9', text: '错位' })
  assert.equal(bad.ok, false)
  assert.equal(bad.detail.reason, 'anchor-unknown')

  const analysis = await tool.execute({ action: 'analysis', passageId })
  assert.equal(analysis.detail.translations.length, 2)
  assert.deepEqual(analysis.detail.translations.map((entry) => entry.anchorId), ['passage', 'p1.s1'])
})

test('branches hang under anchors and parents, and bad kinds are refused locally', async () => {
  const { tool } = await withTool()
  const saved = await tool.execute({ action: 'save', title: 'Pascal', sourceText: 'Le cœur a ses raisons.' })
  const passageId = saved.detail.passageId

  const constituents = await tool.execute({
    action: 'branch', passageId, anchorId: 'p1.s1', kind: 'constituents', title: '句子成分',
    body: 'Le cœur : sujet ; a : verbe ; ses raisons : COD.',
  })
  assert.equal(constituents.ok, true)

  const grammar = await tool.execute({
    action: 'branch', passageId, anchorId: 'p1.s1', kind: 'grammar', title: '主有形容词',
    body: 'ses 为主有形容词，性数随名词 raisons（阴性复数）。', parentId: constituents.detail.branchId,
  })
  assert.equal(grammar.detail.parentId, constituents.detail.branchId)

  const vocabulary = await tool.execute({
    action: 'branch', passageId, anchorId: 'p1.s1', kind: 'vocabulary', title: 'raison',
    body: '阴性名词；此处为复数 raisons。',
  })
  assert.equal(vocabulary.ok, true)

  const refused = await tool.execute({
    action: 'branch', passageId, anchorId: 'p1.s1', kind: 'speculation', title: '不允许', body: '',
  })
  assert.equal(refused.ok, false)
  assert.equal(refused.detail.reason, 'kind-not-allowed')

  const orphan = await tool.execute({
    action: 'branch', passageId, anchorId: 'p1', kind: 'note', title: '悬空',
    parentId: '00000000-0000-4000-8000-0000000000ff', body: '',
  })
  assert.equal(orphan.ok, false)
  assert.equal(orphan.detail.reason, 'parent-unknown')

  const analysis = await tool.execute({ action: 'analysis', passageId })
  assert.equal(analysis.detail.branches.length, 3)
  // Drift is visible to the model too, not only to the panel.
  assert.ok(analysis.detail.branches.every((branch) => branch.anchorStatus === 'resolved'))
  const children = analysis.detail.branches.filter((branch) => branch.parentId === constituents.detail.branchId)
  assert.deepEqual(children.map((branch) => branch.kind), ['grammar'])
})

test('missing arguments, unknown actions, and unknown passages are reported, never thrown', async () => {
  const { tool } = await withTool()
  const missing = await tool.execute({ action: 'save', title: 'x' })
  assert.equal(missing.ok, false)
  assert.match(missing.detail.error, /sourceText is required/u)

  const unknown = await tool.execute({ action: 'explode' })
  assert.equal(unknown.ok, false)
  assert.equal(unknown.detail.error, 'unknown action')

  const absent = await tool.execute({ action: 'read', passageId: '00000000-0000-4000-8000-0000000000ff' })
  assert.equal(absent.ok, false)
  assert.equal(absent.detail.found, false)

  const analysisAbsent = await tool.execute({ action: 'analysis', passageId: '00000000-0000-4000-8000-0000000000ff' })
  assert.equal(analysisAbsent.detail.found, false)
})

test('a retried write with the same operation id stays idempotent through the tool', async () => {
  const { tool } = await withTool()
  const saved = await tool.execute({ action: 'save', title: 'Pascal', sourceText: 'Le cœur a ses raisons.' })
  const passageId = saved.detail.passageId
  const operationId = '00000000-0000-4000-8000-0000000000c9'

  const first = await tool.execute({
    action: 'branch', passageId, operationId, anchorId: 'p1', kind: 'note', title: '一次', body: '一次',
  })
  const retry = await tool.execute({
    action: 'branch', passageId, operationId, anchorId: 'p1', kind: 'note', title: '一次', body: '一次',
  })
  assert.equal(first.detail.saved, true)
  assert.equal(retry.detail.alreadySaved, true)
  assert.equal(retry.detail.branchId, first.detail.branchId)

  const analysis = await tool.execute({ action: 'analysis', passageId })
  assert.equal(analysis.detail.branches.length, 1)
})

test('revise adds a revision and source reads it back, so old text is never lost', async () => {
  const { tool } = await withTool()
  const saved = await tool.execute({
    action: 'save', title: 'Pascal', sourceText: 'Le cœur a ses raisons.',
  })
  const passageId = saved.detail.passageId

  const first = await tool.execute({ action: 'source', passageId, revision: 1 })
  assert.equal(first.detail.found, true)
  assert.equal(first.detail.text, 'Le cœur a ses raisons.')

  const revised = await tool.execute({
    action: 'revise', passageId, expectedSourceRevision: 1,
    sourceText: 'Le cœur a ses raisons.\n\nOn le sait en mille choses.', note: '补第二句',
  })
  assert.equal(revised.detail.revised, true)
  assert.equal(revised.detail.sourceRevision, 2)

  const old = await tool.execute({ action: 'source', passageId, revision: 1 })
  assert.equal(old.detail.text, 'Le cœur a ses raisons.', 'revision 1 is still readable')
  const current = await tool.execute({ action: 'source', passageId, revision: 2 })
  assert.equal(current.detail.text.includes('mille choses'), true)

  const missing = await tool.execute({ action: 'source', passageId, revision: 9 })
  assert.equal(missing.ok, false)
  assert.equal(missing.detail.reason, 'revision-unknown')

  const stale = await tool.execute({
    action: 'revise', passageId, expectedSourceRevision: 1, sourceText: '再次改写',
  })
  assert.equal(stale.ok, false)
  assert.equal(stale.detail.reason, 'revision-conflict')
})
