import test from 'node:test'
import assert from 'node:assert/strict'

import { createBacking, ids, openController, passageRequest, signal } from './support/harness.mjs'
import { FRENCH_READER_DOMAIN } from '../lib/domain.js'
import { analysisPrompt, parseAnalysisReply } from '../lib/analysis-store.js'
import { MAX_TRANSLATION_CHARACTERS } from '../lib/limits.js'

const uuid = () => globalThis.crypto.randomUUID()
const SENTENCE = 'Il faut cultiver notre jardin.'
const CLAUSE = { role: '主句', start: 0, end: SENTENCE.length, text: SENTENCE, parentIndex: null }

/** A complete reply the gate accepts, with ranges derived from the sentence. */
function goodReply(overrides = {}) {
  const at = (text) => {
    const start = SENTENCE.indexOf(text)
    return { start, end: start + text.length, text }
  }
  return JSON.stringify({
    translation: '我们必须耕种我们的园地。',
    backbone: 'il faut cultiver notre jardin',
    clauses: [CLAUSE],
    constituents: [
      { role: '形式主语', ...at('Il'), clauseIndex: 0, partOfSpeech: '代词' },
      { role: '谓语', ...at('faut cultiver'), clauseIndex: 0, partOfSpeech: '动词' },
      { role: '直接宾语', ...at('notre jardin'), clauseIndex: 0, partOfSpeech: '名词短语' },
    ],
    morphology: [{
      form: 'faut', lemma: 'falloir', partOfSpeech: '动词', tense: '现在时',
      mood: '直陈式', person: '第三人称', gender: null, number: '单数',
      agreesWith: 'il', note: '',
    }],
    explanations: [
      { kind: 'syntax', text: 'il 是无人称句的形式主语。', ...at('Il') },
      { kind: 'context', text: '这一句是全文的结论。', start: null, end: null },
    ],
    ...overrides,
  })
}

/** A backend that answers with whatever text the test hands it. */
function stubBackend(reply, { finish = 'stop', failure = null, available = true } = {}) {
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
      calls.push({ target, prompt: request.prompt, system: request.system })
      return {
        text: reply, resolvedModel: target.model,
        usage: { inputTokens: 1, outputTokens: 1 }, finish, failure,
      }
    },
  }
}

async function withPassage(backend) {
  const backing = createBacking()
  const opened = await openController(backing, FRENCH_READER_DOMAIN, { backends: [backend] })
  await opened.controller.createPassage({
    ...passageRequest,
    sourceText: SENTENCE,
  }, signal())
  return { backing, ...opened }
}

test('a validated reply is stored, and the coverage it produces is reported', async () => {
  const backend = stubBackend(goodReply())
  const { controller } = await withPassage(backend)

  const before = controller.readAnalysisCoverage(ids.passage, signal())
  assert.equal(before.total, 1)
  assert.deepEqual(before.covered, [], 'nothing is covered before anything is written')
  assert.deepEqual(before.missing, ['p1.s1'])

  const result = await controller.analyseSentence({
    passageId: ids.passage, anchorId: 'p1.s1', backend: 'stub', model: 'stub-model',
    reasoningEffort: null, operationId: uuid(),
  }, signal())
  assert.equal(result.ok, true, result.ok ? '' : `${result.reason}: ${result.failure ?? ''}`)
  assert.equal(result.covered, 1)
  assert.equal(result.missing, 0)
  assert.equal(result.failed, 0)
  assert.equal(result.resolvedModel, 'stub-model')

  const stored = controller.readSentenceAnalysis(ids.passage, 'p1.s1', signal())
  assert.equal(stored.found, true)
  assert.deepEqual(stored.errors, [])
  assert.equal(stored.analysis.translation, '我们必须耕种我们的园地。')
  assert.equal(stored.analysis.morphology[0].lemma, 'falloir')
})

test('the prompt states the JSON contract and carries the sentence and its paragraph', async () => {
  const backend = stubBackend(goodReply())
  const { controller } = await withPassage(backend)
  await controller.analyseSentence({
    passageId: ids.passage, anchorId: 'p1.s1', backend: 'stub', model: 'stub-model',
    reasoningEffort: null, operationId: uuid(),
  }, signal())

  const prompt = backend.calls[0].prompt
  assert.match(prompt, /只输出一个 JSON 对象/u)
  assert.match(prompt, /"constituents"/u, 'the contract names the fields')
  assert.match(prompt, /每一段含词的文字都必须被某个成分覆盖/u, 'the coverage rule is stated, not implied')
  assert.match(prompt, /syntax 的只写句法事实/u, 'the certainty rule is stated too')
  assert.match(prompt, new RegExp(escapeRegExp(SENTENCE), 'u'), 'the sentence is quoted')
  assert.match(prompt, /【当前段落】/u)
})

test('the analysis system prompt asks for JSON only and never for the discussion grammar block', async () => {
  // The prompt and the system instruction are two halves of one contract: the
  // prompt says "只输出一个 JSON 对象" while a system prompt that also asks for
  // a <<<GRAMMAR block would contradict it — so both halves are asserted here.
  const backend = stubBackend(goodReply())
  const { controller } = await withPassage(backend)
  await controller.analyseSentence({
    passageId: ids.passage, anchorId: 'p1.s1', backend: 'stub', model: 'stub-model',
    reasoningEffort: null, operationId: uuid(),
  }, signal())

  const system = backend.calls[0].system
  assert.equal(typeof system, 'string', 'the model call carries a system instruction')
  assert.match(system, /只输出一个 JSON 对象/u, 'system and prompt state the same output protocol')
  assert.doesNotMatch(system, /<<<GRAMMAR/u, 'no grammar-extraction block is requested here')
  assert.doesNotMatch(system, /机器可读块：/u, 'the discussion extraction instruction stays out')
})

test('a reply that fails the gate is refused with its errors and stored nowhere', async () => {
  // The object is dropped, so a word-bearing gap remains: the gate must refuse.
  const broken = JSON.stringify({
    translation: '我们必须耕种我们的园地。',
    backbone: 'il faut',
    clauses: [CLAUSE],
    constituents: [
      { role: '形式主语', start: 0, end: 2, text: 'Il', clauseIndex: 0, partOfSpeech: '代词' },
    ],
    morphology: [],
    explanations: [],
  })
  const backend = stubBackend(broken)
  const { controller } = await withPassage(backend)

  const result = await controller.analyseSentence({
    passageId: ids.passage, anchorId: 'p1.s1', backend: 'stub', model: 'stub-model',
    reasoningEffort: null, operationId: uuid(),
  }, signal())
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'analysis-rejected')
  assert.match(result.failure, /未被分析的原文片段/u, 'the gate names the text it refused')

  const stored = controller.readSentenceAnalysis(ids.passage, 'p1.s1', signal())
  assert.equal(stored.found, false, 'an unusable analysis never reaches the screen')
  assert.deepEqual(controller.readAnalysisCoverage(ids.passage, signal()).covered, [])
})

test('a reply that is not JSON at all is refused as such', async () => {
  const backend = stubBackend('这句的主语是 il，谓语是 faut。')
  const { controller } = await withPassage(backend)
  const result = await controller.analyseSentence({
    passageId: ids.passage, anchorId: 'p1.s1', backend: 'stub', model: 'stub-model',
    reasoningEffort: null, operationId: uuid(),
  }, signal())
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'model-reply-not-json')
})

test('a fenced JSON reply is read, because models wrap it anyway', () => {
  const parsed = parseAnalysisReply(
    '```json\n' + goodReply() + '\n```',
    {
      passageId: ids.passage, anchorId: 'p1.s1', text: SENTENCE,
      sourceRevision: 1, segmentationRevision: 1, backend: 'stub', model: 'm',
    },
  )
  assert.equal(parsed.ok, true)
  assert.equal(parsed.analysis.clauses.length, 1)
})

test('an unknown explanation kind degrades to unverified, never to a fact', () => {
  const reply = JSON.parse(goodReply())
  reply.explanations = [{ kind: 'authors-intent', text: '作者想表达……', start: null, end: null }]
  const parsed = parseAnalysisReply(JSON.stringify(reply), {
    passageId: ids.passage, anchorId: 'p1.s1', text: SENTENCE,
    sourceRevision: 1, segmentationRevision: 1, backend: 'stub', model: 'm',
  })
  assert.equal(parsed.ok, true)
  assert.equal(parsed.analysis.explanations[0].kind, 'unverified')
})

test('a clause parent index that names nothing is refused, never silently detached', () => {
  // parentIndex 7 exists nowhere: resolving it to null would turn a subordinate
  // clause into a main one and call that the model's analysis.
  const reply = JSON.parse(goodReply())
  reply.clauses = [
    { role: '主句', start: 0, end: 16, text: SENTENCE.slice(0, 16), parentIndex: null },
    { role: '关系从句', start: 16, end: SENTENCE.length, text: SENTENCE.slice(16), parentIndex: 7 },
  ]
  const parsed = parseAnalysisReply(JSON.stringify(reply), {
    passageId: ids.passage, anchorId: 'p1.s1', text: SENTENCE,
    sourceRevision: 1, segmentationRevision: 1, backend: 'stub', model: 'm',
  })
  assert.equal(parsed.ok, false, 'an index that names nothing fails the parse')
  assert.equal(parsed.reason, 'analysis-invalid')
  assert.match(parsed.detail, /不存在的从句下标/u)
})

test('a constituent clause index that names nothing is refused too', () => {
  const reply = JSON.parse(goodReply())
  reply.constituents[0].clauseIndex = 5
  const parsed = parseAnalysisReply(JSON.stringify(reply), {
    passageId: ids.passage, anchorId: 'p1.s1', text: SENTENCE,
    sourceRevision: 1, segmentationRevision: 1, backend: 'stub', model: 'm',
  })
  assert.equal(parsed.ok, false)
  assert.equal(parsed.reason, 'analysis-invalid')
})

test('a non-integer or negative offset is refused rather than repaired', () => {
  // The contract says character offsets; flooring 2.7 into 2 would validate a
  // range the model never stated.
  for (const broken of [{ start: 2.7 }, { start: -1 }, { end: '5' }]) {
    const reply = JSON.parse(goodReply())
    Object.assign(reply.constituents[1], broken)
    const parsed = parseAnalysisReply(JSON.stringify(reply), {
      passageId: ids.passage, anchorId: 'p1.s1', text: SENTENCE,
      sourceRevision: 1, segmentationRevision: 1, backend: 'stub', model: 'm',
    })
    assert.equal(parsed.ok, false, `offset ${JSON.stringify(broken)} is not repaired into a legal value`)
    assert.equal(parsed.reason, 'analysis-invalid')
    assert.match(parsed.detail, /字符下标/u)
  }
})

test('an incomplete reply is refused for what is missing, not for being short', () => {
  const reply = JSON.parse(goodReply())
  reply.translation = '   '
  const parsed = parseAnalysisReply(JSON.stringify(reply), {
    passageId: ids.passage, anchorId: 'p1.s1', text: SENTENCE,
    sourceRevision: 1, segmentationRevision: 1, backend: 'stub', model: 'm',
  })
  assert.equal(parsed.ok, false)
  assert.equal(parsed.reason, 'analysis-incomplete')
  assert.match(parsed.detail, /译文/u)
})

test('a cancelled analysis never stores the reply the provider still sent', async () => {
  // The provider ignores the abort and still ends its turn with `stop`: the
  // cancel happened, so the reply is late rather than valid. It must not reach
  // the store, and the job must not claim a success.
  const backend = stubBackend(goodReply())
  const aborter = new AbortController()
  const inner = backend.generate
  backend.generate = async (target, request) => {
    aborter.abort()
    return inner(target, request)
  }
  const { controller } = await withPassage(backend)

  const result = await controller.analyseSentence({
    passageId: ids.passage, anchorId: 'p1.s1', backend: 'stub', model: 'stub-model',
    reasoningEffort: null, operationId: uuid(),
  }, aborter.signal)
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'cancelled')

  const stored = controller.readSentenceAnalysis(ids.passage, 'p1.s1', signal())
  assert.equal(stored.found, false, 'a cancelled run leaves no analysis behind')
  const job = controller.listGenerationJobs(ids.passage, signal())[0]
  assert.equal(job.status, 'cancelled', 'the job record agrees this was not a success')
  assert.equal(job.finish, 'stop', 'the provider did answer — the record says what really happened')
})

test('an unavailable backend is reported instead of generating', async () => {
  const backend = stubBackend(goodReply(), { available: false })
  const { controller } = await withPassage(backend)
  const result = await controller.analyseSentence({
    passageId: ids.passage, anchorId: 'p1.s1', backend: 'stub', model: 'stub-model',
    reasoningEffort: null, operationId: uuid(),
  }, signal())
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'stub-unavailable')
  assert.equal(backend.calls.length, 0)
})

test('an unknown anchor is refused before any generation happens', async () => {
  const backend = stubBackend(goodReply())
  const { controller } = await withPassage(backend)
  const result = await controller.analyseSentence({
    passageId: ids.passage, anchorId: 'p9.s9', backend: 'stub', model: 'stub-model',
    reasoningEffort: null, operationId: uuid(),
  }, signal())
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'anchor-unknown')
  assert.equal(backend.calls.length, 0, 'nothing is sent for a sentence that does not exist')
})

test('re-analysing one sentence replaces only that sentence', async () => {
  const backend = stubBackend(goodReply())
  const { backing, controller } = await withPassage(backend)
  const first = await controller.analyseSentence({
    passageId: ids.passage, anchorId: 'p1.s1', backend: 'stub', model: 'stub-model',
    reasoningEffort: null, operationId: uuid(),
  }, signal())
  assert.equal(first.replaced, false)
  assert.equal(controller.readSentenceAnalysis(ids.passage, 'p1.s1', signal()).analysis.revision, 1)

  const again = await controller.analyseSentence({
    passageId: ids.passage, anchorId: 'p1.s1', backend: 'stub', model: 'stub-model',
    reasoningEffort: null, operationId: uuid(),
  }, signal())
  assert.equal(again.ok, true)
  assert.equal(again.replaced, true, 'the second run replaces the row instead of appending')
  assert.equal(
    controller.readSentenceAnalysis(ids.passage, 'p1.s1', signal()).analysis.revision, 2,
    'and the revision moves, so two analyses of one sentence are distinguishable',
  )
  assert.equal(controller.readAnalysisCoverage(ids.passage, signal()).covered.length, 1)
  const stored = [...backing.tables.get('records').entries()]
    .filter(([key]) => key.startsWith('sentences_'))
  assert.equal(stored.length, 1, 'one record holds the passage analyses')
  assert.equal(stored[0][1].payload.sentences.length, 1, 'and exactly one row per sentence')
})

test('a reply longer than the diagnostic field still stores, and the record is truncated', async () => {
  // partialText is evidence bounded by its schema field, not a second copy of
  // the reply: the business parse reads the full text, the job record keeps
  // the head of it, and neither fails because the reply was long.
  const reply = JSON.parse(goodReply())
  reply.explanations = [
    { kind: 'syntax', text: `句法。${'长'.repeat(9_000)}`, start: 0, end: 2 },
    { kind: 'context', text: `语境。${'长'.repeat(9_000)}`, start: null, end: null },
    { kind: 'rhetoric', text: `修辞。${'长'.repeat(9_000)}`, start: null, end: null },
  ]
  const longReply = JSON.stringify(reply)
  assert.equal(longReply.length > MAX_TRANSLATION_CHARACTERS, true, 'the fixture really overflows the field')
  const backend = stubBackend(longReply)
  const { controller } = await withPassage(backend)

  const result = await controller.analyseSentence({
    passageId: ids.passage, anchorId: 'p1.s1', backend: 'stub', model: 'stub-model',
    reasoningEffort: null, operationId: uuid(),
  }, signal())
  assert.equal(result.ok, true, result.ok ? '' : `${result.reason}: ${result.failure ?? ''}`)
  assert.equal(
    controller.readSentenceAnalysis(ids.passage, 'p1.s1', signal()).found, true,
    'the full reply was parsed and stored',
  )
  const job = controller.listGenerationJobs(ids.passage, signal())[0]
  assert.equal(job.status, 'succeeded', 'the job does not fail because its diagnostic field was capped')
  assert.equal(job.partialText.length, MAX_TRANSLATION_CHARACTERS, 'the diagnostic copy is truncated to its field')
})

test('publishing a version records what it covers and leaves earlier versions readable', async () => {
  const backend = stubBackend(goodReply())
  const { controller } = await withPassage(backend)

  const nothing = await controller.publishAnalysis({
    passageId: ids.passage, overallTranslation: '我们必须耕种我们的园地。', cohesion: '',
  }, signal())
  assert.equal(nothing.published, false)
  assert.equal(nothing.reason, 'no-valid-analysis', 'a version cannot claim coverage it does not have')

  await controller.analyseSentence({
    passageId: ids.passage, anchorId: 'p1.s1', backend: 'stub', model: 'stub-model',
    reasoningEffort: null, operationId: uuid(),
  }, signal())

  const first = await controller.publishAnalysis({
    passageId: ids.passage, overallTranslation: '我们必须耕种我们的园地。', cohesion: '与上文的结论关系。',
  }, signal())
  assert.equal(first.published, true)
  assert.equal(first.revision, 1)
  assert.equal(first.coveredCount, 1)

  const second = await controller.publishAnalysis({
    passageId: ids.passage, overallTranslation: '改写后的整体译文。', cohesion: '',
  }, signal())
  assert.equal(second.revision, 2)

  const coverage = controller.readAnalysisCoverage(ids.passage, signal())
  assert.equal(coverage.versionCount, 2, 'the earlier version stays readable')
  assert.equal(coverage.currentVersion.revision, 2)
  assert.equal(coverage.currentVersion.overallTranslation, '改写后的整体译文。')
})

test('a written analysis goes through the same gate as a generated one', async () => {
  const backend = stubBackend(goodReply())
  const { controller } = await withPassage(backend)

  const bad = await controller.putSentenceAnalysisRemote({
    passageId: ids.passage, anchorId: 'p1.s1', analysisJson: '{"translation":""}',
  }, signal())
  assert.equal(bad.stored, false)
  assert.equal(bad.reason, 'analysis-incomplete')

  const good = await controller.putSentenceAnalysisRemote({
    passageId: ids.passage, anchorId: 'p1.s1', analysisJson: goodReply(),
  }, signal())
  assert.equal(good.stored, true, good.stored ? '' : JSON.stringify(good.errors))
  const stored = controller.readSentenceAnalysis(ids.passage, 'p1.s1', signal())
  assert.equal(stored.analysis.provenance, 'user', 'a written analysis is attributed to the reader, not to a model')
})

test('the coverage report distinguishes missing, failed and stale sentences', async () => {
  const twoSentences = 'Il faut cultiver notre jardin. Le nôtre, dit-il.'
  const backend = stubBackend(JSON.stringify({
    translation: '我们必须耕种我们的园地。',
    backbone: 'il faut cultiver notre jardin',
    clauses: [{ role: '主句', start: 0, end: 28, text: twoSentences.slice(0, 28), parentIndex: null }],
    constituents: [
      { role: '形式主语', start: 0, end: 2, text: 'Il', clauseIndex: 0, partOfSpeech: '代词' },
      { role: '谓语', start: 3, end: 16, text: 'faut cultiver', clauseIndex: 0, partOfSpeech: '动词' },
      { role: '直接宾语', start: 17, end: 29, text: twoSentences.slice(17, 29), clauseIndex: 0, partOfSpeech: '名词短语' },
    ],
    morphology: [],
    explanations: [],
  }))
  const backing = createBacking()
  const opened = await openController(backing, FRENCH_READER_DOMAIN, { backends: [backend] })
  await opened.controller.createPassage({ ...passageRequest, sourceText: twoSentences }, signal())

  const coverage = opened.controller.readAnalysisCoverage(ids.passage, signal())
  assert.equal(coverage.total, 2, 'the fixture really has two sentences')
  assert.deepEqual(coverage.missing, ['p1.s1', 'p1.s2'])
  assert.deepEqual(coverage.stale, [], 'no analysis exists yet, so none is stale')
})

test('a source correction makes the old analysis stale rather than silently kept', async () => {
  const backend = stubBackend(goodReply())
  const { controller } = await withPassage(backend)
  await controller.analyseSentence({
    passageId: ids.passage, anchorId: 'p1.s1', backend: 'stub', model: 'stub-model',
    reasoningEffort: null, operationId: uuid(),
  }, signal())
  assert.deepEqual(controller.readAnalysisCoverage(ids.passage, signal()).covered, ['p1.s1'])

  // Correct the source: the sentence text changes under the stored analysis.
  const revised = await controller.reviseSource({
    passageId: ids.passage, operationId: uuid(), expectedSourceRevision: 1,
    sourceText: 'Il faut cultiver notre jardin, vraiment.', note: '补一个词',
  }, signal())
  assert.equal(revised.revised, true)

  const coverage = controller.readAnalysisCoverage(ids.passage, signal())
  assert.deepEqual(coverage.covered, [], 'the analysis no longer describes the sentence')
  assert.deepEqual(coverage.stale, ['p1.s1'], 'it is reported as stale, not as covering the new text')
})

test('a revised source makes the stored analysis read as stale, never as current', async () => {
  // The single-sentence read applies the same staleness rule as the coverage
  // report: an analysis of text that is no longer there is not served for
  // colouring, whatever its anchor id still matches.
  const backend = stubBackend(goodReply())
  const { controller } = await withPassage(backend)
  await controller.analyseSentence({
    passageId: ids.passage, anchorId: 'p1.s1', backend: 'stub', model: 'stub-model',
    reasoningEffort: null, operationId: uuid(),
  }, signal())
  assert.equal(controller.readSentenceAnalysis(ids.passage, 'p1.s1', signal()).found, true)

  await controller.reviseSource({
    passageId: ids.passage, operationId: uuid(), expectedSourceRevision: 1,
    sourceText: 'Il faut cultiver notre jardin, vraiment.', note: '补一个词',
  }, signal())

  const stored = controller.readSentenceAnalysis(ids.passage, 'p1.s1', signal())
  assert.equal(stored.found, false, 'the old analysis is no longer served as current')
  assert.equal(stored.stale, true, 'it is named stale, matching the coverage report')
  const remote = controller.readSentenceAnalysisRemote({ passageId: ids.passage, anchorId: 'p1.s1' }, signal())
  assert.equal(remote.kind, 'stale', 'the wire says stale, so no client colours from it')
})

test('a source revision during generation refuses to store the old reply', async () => {
  // The model answered against revision 1, but by the time the write takes its
  // turn the passage is at revision 2: storing would attach the analysis to
  // text it is not about.
  const backend = stubBackend(goodReply())
  const { controller } = await withPassage(backend)
  const inner = backend.generate
  backend.generate = async (target, request) => {
    const revised = await controller.reviseSource({
      passageId: ids.passage, operationId: uuid(), expectedSourceRevision: 1,
      sourceText: 'Il faut cultiver notre jardin, vraiment.', note: null,
    }, request.signal)
    assert.equal(revised.revised, true, 'the fixture really revises mid-generation')
    return inner(target, request)
  }

  const result = await controller.analyseSentence({
    passageId: ids.passage, anchorId: 'p1.s1', backend: 'stub', model: 'stub-model',
    reasoningEffort: null, operationId: uuid(),
  }, signal())
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'source-revised')
  assert.equal(
    controller.readSentenceAnalysis(ids.passage, 'p1.s1', signal()).found, false,
    'the superseded reply was never stored',
  )
})

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

test('a paragraph run asks only for what is missing, and says what it spent', async () => {
  const backend = stubBackend(goodReply())
  const { controller } = await withPassage(backend)

  const first = await controller.analyseParagraph({
    passageId: ids.passage, paragraphId: 'p1', backend: 'stub', model: 'stub-model',
    reasoningEffort: null, operationId: uuid(),
  }, signal())
  assert.equal(first.ok, true)
  assert.equal(first.asked, 1, 'one sentence was missing')
  assert.equal(first.stored, 1)
  assert.deepEqual(first.failed, [])
  assert.equal(backend.calls.length, 1, 'exactly one model call for one sentence')

  // Nothing is missing now, so a second run spends nothing and says so.
  const again = await controller.analyseParagraph({
    passageId: ids.passage, paragraphId: 'p1', backend: 'stub', model: 'stub-model',
    reasoningEffort: null, operationId: uuid(),
  }, signal())
  assert.equal(again.ok, true)
  assert.equal(again.asked, 0)
  assert.equal(backend.calls.length, 1, 'a complete paragraph costs no calls')
  assert.match(again.note, /没有缺解析/u)
})

test('a paragraph run names the sentence it could not store, and keeps the rest', async () => {
  const twoSentences = 'Il faut cultiver notre jardin. Le nôtre, dit-il.'
  // The reply's ranges fit the first sentence only, so the second is refused by
  // the gate's coverage check.
  const reply = JSON.stringify({
    translation: '我们必须耕种我们的园地。',
    backbone: 'il faut cultiver notre jardin',
    clauses: [{ role: '主句', start: 0, end: 30, text: 'Il faut cultiver notre jardin.', parentIndex: null }],
    constituents: [
      { role: '形式主语', start: 0, end: 2, text: 'Il', clauseIndex: 0, partOfSpeech: '代词' },
      { role: '谓语', start: 3, end: 16, text: 'faut cultiver', clauseIndex: 0, partOfSpeech: '动词' },
      { role: '直接宾语', start: 17, end: 30, text: 'notre jardin.', clauseIndex: 0, partOfSpeech: '名词短语' },
    ],
    morphology: [],
    explanations: [{ kind: 'syntax', text: '无人称句。', start: 0, end: 2 }],
  })
  const backend = stubBackend(reply)
  const backing = createBacking()
  const opened = await openController(backing, FRENCH_READER_DOMAIN, { backends: [backend] })
  await opened.controller.createPassage({ ...passageRequest, sourceText: twoSentences }, signal())

  const run = await opened.controller.analyseParagraph({
    passageId: ids.passage, paragraphId: 'p1', backend: 'stub', model: 'stub-model',
    reasoningEffort: null, operationId: uuid(),
  }, signal())
  assert.equal(run.ok, true)
  assert.equal(run.asked, 2)
  assert.equal(run.stored, 1, 'the sentence the reply fits is stored')
  assert.equal(run.failed.length, 1)
  assert.equal(run.failed[0].anchorId, 'p1.s2', 'the failing sentence is named')
  assert.equal(run.failed[0].reason, 'analysis-rejected')
  assert.equal(run.covered, 1)
  assert.equal(run.missing, 1)
})

test('a paragraph anchor is refused by the sentence path as "not a sentence", not as unknown', async () => {
  const backend = stubBackend(goodReply())
  const { controller } = await withPassage(backend)

  const wrongGranularity = await controller.analyseSentence({
    passageId: ids.passage, anchorId: 'p1', backend: 'stub', model: 'stub-model',
    reasoningEffort: null, operationId: uuid(),
  }, signal())
  assert.equal(wrongGranularity.ok, false)
  assert.equal(wrongGranularity.reason, 'anchor-not-a-sentence',
    'a paragraph exists: calling it unknown sends the reader hunting for a missing sentence')
  assert.match(wrongGranularity.hints.join(' '), /句子为锚点/u)

  const reallyUnknown = await controller.analyseSentence({
    passageId: ids.passage, anchorId: 'p9.s9', backend: 'stub', model: 'stub-model',
    reasoningEffort: null, operationId: uuid(),
  }, signal())
  assert.equal(reallyUnknown.reason, 'anchor-unknown')
  assert.equal(backend.calls.length, 0, 'neither refusal reaches the model')
})

test('a paragraph id that is not a paragraph says so', async () => {
  const backend = stubBackend(goodReply())
  const { controller } = await withPassage(backend)
  const wrong = await controller.analyseParagraph({
    passageId: ids.passage, paragraphId: 'p1.s1', backend: 'stub', model: 'stub-model',
    reasoningEffort: null, operationId: uuid(),
  }, signal())
  assert.equal(wrong.ok, false)
  assert.equal(wrong.reason, 'anchor-not-a-paragraph')
  assert.equal(backend.calls.length, 0)
})
