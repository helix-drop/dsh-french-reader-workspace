import test from 'node:test'
import assert from 'node:assert/strict'

import { createBacking, ids, openController, passageRequest, signal } from './support/harness.mjs'
import { FRENCH_READER_DOMAIN } from '../lib/domain.js'
import { buildFrenchReaderTool } from '../lib/tools.js'

/**
 * The tool surface for the newer capabilities, exercised the way a model would
 * call it: a backend that records its prompt, so isolation and the compiled
 * context are checked on the bytes sent rather than on any UI.
 */
const uuid = () => globalThis.crypto.randomUUID()
const SENTENCE = 'Il faut cultiver notre jardin.'

const reply = JSON.stringify({
  translation: '我们必须耕种我们的园地。',
  backbone: 'il faut cultiver notre jardin',
  clauses: [{ role: '主句', start: 0, end: 16, text: SENTENCE.slice(0, 16), parentIndex: null }],
  constituents: [
    { role: '形式主语', start: 0, end: 2, text: 'Il', clauseIndex: 0, partOfSpeech: '代词' },
    { role: '谓语', start: 3, end: 16, text: 'faut cultiver', clauseIndex: 0, partOfSpeech: '动词' },
    { role: '直接宾语', start: 17, end: 29, text: 'notre jardin', clauseIndex: 0, partOfSpeech: '名词短语' },
  ],
  morphology: [{ form: 'faut', lemma: 'falloir', partOfSpeech: '动词', tense: '现在时', mood: '直陈式', person: '第三人称', gender: null, number: '单数', agreesWith: 'il', note: '' }],
  explanations: [{ kind: 'syntax', text: 'il 是无人称句的形式主语。', start: 0, end: 2 }],
})

/** One backend that answers with the analysis reply when asked for an analysis. */
function stubBackend() {
  const calls = []
  return {
    calls,
    id: 'stub',
    label: 'stub',
    capabilities: {
      streaming: false, cancel: true, reportsResolvedModel: true,
      reportsUsage: true, maxInputCharacters: null, singleFlight: false,
    },
    available: () => ({ available: true }),
    listModels: async () => [{ id: 'stub-model', name: 'Stub', reasoningEfforts: [], contextWindow: null }],
    generate: async (target, request) => {
      calls.push({ target, prompt: request.prompt })
      const text = request.prompt.includes('逐句精读解析') ? reply : '这一句是无人称结构。'
      return {
        text, resolvedModel: target.model,
        usage: { inputTokens: 5, outputTokens: 7 }, finish: 'stop', failure: null,
      }
    },
  }
}

async function withTool() {
  const backing = createBacking()
  const opened = await openController(backing, FRENCH_READER_DOMAIN, { backends: [stubBackend()] })
  const tool = buildFrenchReaderTool(opened.controller)
  await tool.execute({
    action: 'save', title: 'T', sourceText: SENTENCE, id: ids.passage, operationId: ids.source,
  })
  return { backing, controller: opened.controller, tool, backend: opened.controller.listBackends().length > 0 }
}

test('the tool lists the backends with their honest status and the models they serve', async () => {
  const { tool } = await withTool()
  const listed = await tool.execute({ action: 'backends' })
  assert.equal(listed.ok, true)
  assert.equal(listed.detail.backends.length, 1)
  assert.equal(listed.detail.backends[0].available, true)

  const models = await tool.execute({ action: 'models', backend: 'stub' })
  assert.equal(models.ok, true)
  assert.deepEqual(models.detail.models.map((model) => model.id), ['stub-model'])

  const unknown = await tool.execute({ action: 'models', backend: 'nope' })
  assert.equal(unknown.ok, false, 'an unknown backend is refused, not silently answered')
  assert.equal(unknown.detail.reason, 'backend-unknown')
})

test('the context action shows what a turn would send and writes nothing', async () => {
  const { tool, controller } = await withTool()
  const branch = await tool.execute({ action: 'discuss', passageId: ids.passage, anchorId: 'p1.s1', title: '讨论' })
  assert.equal(branch.ok, true)

  const before = controller.listDiscussion(ids.passage, signal()).branches[0].messages.length
  const context = await tool.execute({
    action: 'context', passageId: ids.passage, branchId: branch.detail.branchId,
    question: '这一句怎么读？', backend: 'stub', model: 'stub-model',
  })
  assert.equal(context.ok, true)
  assert.equal(context.detail.characters > 0, true)
  assert.equal(context.detail.materials.length > 0, true)
  assert.match(context.detail.prompt, /这一句怎么读/u)
  // A content-covering fingerprint: 64 hex characters of SHA-256 over the whole
  // manifest, so a same-length edit cannot pass as an already-approved context.
  assert.match(context.detail.fingerprint, /^[0-9a-f]{64}$/u, 'a fingerprint is returned for the send to pin')
  assert.equal(
    controller.listDiscussion(ids.passage, signal()).branches[0].messages.length, before,
    'a preview appends nothing',
  )
})

test('the ask action stores the turn and reports the answer with its provenance', async () => {
  const { tool, controller } = await withTool()
  const branch = await tool.execute({ action: 'discuss', passageId: ids.passage, anchorId: 'p1.s1', title: '讨论' })

  const asked = await tool.execute({
    action: 'ask', passageId: ids.passage, branchId: branch.detail.branchId,
    question: '这一句怎么读？', backend: 'stub', model: 'stub-model',
  })
  assert.equal(asked.ok, true, JSON.stringify(asked.detail))
  assert.match(asked.detail.answer, /无人称结构/u)
  assert.equal(asked.detail.resolvedModel, 'stub-model')
  assert.equal(asked.detail.finish, 'stop')

  const listed = await tool.execute({ action: 'discussion', passageId: ids.passage })
  const messages = listed.detail.branches[0].messages
  assert.equal(messages.length, 2, 'the question and the answer are both stored')
  assert.equal(messages[0].author, 'user')
  assert.equal(messages[1].backend, 'stub')

  // The compiled context is auditable afterwards, by id.
  const sent = await tool.execute({
    action: 'sentContext', passageId: ids.passage, contextId: asked.detail.contextId,
  })
  assert.equal(sent.detail.found, true)
  assert.equal(sent.detail.model, 'stub-model')
})

test('a sibling branch stays out of an ask made through the tool', async () => {
  const { tool, controller } = await withTool()
  const first = await tool.execute({ action: 'discuss', passageId: ids.passage, anchorId: 'p1.s1', title: '甲' })
  const second = await tool.execute({ action: 'discuss', passageId: ids.passage, anchorId: 'p1.s1', title: '乙' })

  await tool.execute({
    action: 'ask', passageId: ids.passage, branchId: first.detail.branchId,
    question: '甲分支的问题', backend: 'stub', model: 'stub-model',
  })
  await tool.execute({
    action: 'ask', passageId: ids.passage, branchId: second.detail.branchId,
    question: '乙分支的问题', backend: 'stub', model: 'stub-model',
  })

  // The second branch's own history is what it carries: its question only.
  const listed = controller.listDiscussion(ids.passage, signal())
  const secondBranch = listed.branches.find((entry) => entry.branchId === second.detail.branchId)
  assert.equal(secondBranch.historyCount, 2, 'one question and one answer of its own')
  const preview = await tool.execute({
    action: 'context', passageId: ids.passage, branchId: second.detail.branchId,
    question: '再问一次', backend: 'stub', model: 'stub-model',
  })
  assert.match(preview.detail.prompt, /乙分支的问题/u, 'its own history is carried')
  assert.doesNotMatch(preview.detail.prompt, /甲分支的问题/u, 'the sibling is not')
})

test('the analyse action stores a validated analysis and reports coverage', async () => {
  const { tool } = await withTool()
  const analysed = await tool.execute({
    action: 'analyse', passageId: ids.passage, anchorId: 'p1.s1', backend: 'stub', model: 'stub-model',
  })
  assert.equal(analysed.ok, true, JSON.stringify(analysed.detail))
  assert.equal(analysed.detail.stored, true)
  assert.equal(analysed.detail.coverage.covered, 1)
  assert.equal(analysed.detail.coverage.missing, 0)

  const stored = await tool.execute({ action: 'sentence', passageId: ids.passage, anchorId: 'p1.s1' })
  assert.equal(stored.detail.found, true)
  assert.equal(stored.detail.translation, '我们必须耕种我们的园地。')
  assert.equal(stored.detail.morphology[0].lemma, 'falloir')
  assert.equal(stored.detail.explanations[0].kind, 'syntax')

  const coverage = await tool.execute({ action: 'coverageReport', passageId: ids.passage })
  assert.deepEqual(coverage.detail.covered, ['p1.s1'])
  assert.equal(coverage.detail.currentVersion, null, 'no version is published yet')

  const published = await tool.execute({
    action: 'publish', passageId: ids.passage, overallTranslation: '整体译文',
  })
  assert.equal(published.detail.published, true)
  assert.equal(published.detail.coveredCount, 1)
  const after = await tool.execute({ action: 'coverageReport', passageId: ids.passage })
  assert.equal(after.detail.currentVersion.revision, 1)
})

test('a sentence with no analysis reports missing rather than an empty object', async () => {
  const { tool } = await withTool()
  const missing = await tool.execute({ action: 'sentence', passageId: ids.passage, anchorId: 'p1.s1' })
  assert.equal(missing.ok, false)
  assert.equal(missing.detail.found, false)
})

test('the sources action lists what may be requested, and a refusal says why', async () => {
  const { tool } = await withTool()
  const sources = await tool.execute({ action: 'sources' })
  assert.equal(sources.ok, true)
  assert.equal(sources.detail.sources.some((source) => source.source === 'cnrtl'), true)

  const stored = await tool.execute({
    action: 'mot', mot: 'cœur', partOfSpeech: 'nom', create: true, definition: '心。',
  })
  // No web service is available in this harness, so the fetch is refused with a
  // reason and nothing is stored as a source.
  const refused = await tool.execute({
    action: 'fetchSource', entryId: stored.detail.entryId, source: 'cnrtl',
    section: 'etymology', mot: 'cœur',
  })
  assert.equal(refused.ok, false)
  assert.equal(refused.detail.reason, 'web-unavailable')
})

test('mastery moves through the tool and refuses a stale revision', async () => {
  const { tool } = await withTool()
  await tool.execute({
    action: 'answer', passageId: ids.passage, anchorId: 'p1.s1',
    question: 'il faut 是什么结构？', answer: '无人称句。',
    intents: [{ kind: 'grammar', anchorId: 'p1.s1', title: '无人称句 il faut', body: 'il 为形式主语。' }],
  })
  const entry = (await tool.execute({ action: 'grammar' })).detail.entries[0]

  const moved = await tool.execute({ action: 'mastery', entryId: entry.entryId, mastery: 'known' })
  assert.equal(moved.ok, true)
  assert.equal(moved.detail.updated, true)
  assert.equal(moved.detail.previous, 'learning')

  const stale = await tool.execute({
    action: 'mastery', entryId: entry.entryId, mastery: 'learning', expectedRevision: entry.revision,
  })
  assert.equal(stale.ok, false, 'a write based on a stale revision is refused')
  assert.equal(stale.detail.reason, 'revision-conflict')

  const invented = await tool.execute({ action: 'mastery', entryId: entry.entryId, mastery: 'fluent' })
  assert.equal(invented.ok, false)
  assert.match(invented.detail.error, /mastery must be/u)
})

test('the tool description tells the model the discipline it must follow', () => {
  const description = buildFrenchReaderTool({}).description
  assert.match(description, /One question is one count/u)
  assert.match(description, /validated before storage/u)
  assert.match(description, /never part of it/u, 'the isolation rule is stated, not implied')
  assert.match(description, /the verdict is the result, not the status/u)
  assert.match(description, /nothing automatic writes it/u)
  assert.match(description, /refuses an analysis that leaves a word-bearing part/u)
})
