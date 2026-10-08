import test from 'node:test'
import assert from 'node:assert/strict'

import {
  analysisCoverage,
  validateSentenceAnalysis,
} from '../lib/analysis.js'

const uuid = () => globalThis.crypto.randomUUID()

const SENTENCE = 'Il faut cultiver notre jardin, que nous avons hérité.'
/** Stable clause ids, so a constituent can name the clause it belongs to. */
const CLAUSE_IDS = { main: uuid(), relative: uuid() }

/** A range derived from the real text, so a fixture cannot drift from its sentence. */
function rangeOf(text) {
  const start = SENTENCE.indexOf(text)
  if (start === -1) throw new Error(`fixture text not in the sentence: ${text}`)
  return { start, end: start + text.length }
}

/** One clause: `parentId` names the clause it is nested in. */
function clause(role, text, parentId = null) {
  return { id: uuid(), role, text, parentId, ...rangeOf(text) }
}

/** One constituent: `clauseId` names the clause it belongs to. */
function part(role, text, clauseId, partOfSpeech = null) {
  return { id: uuid(), role, text, clauseId, partOfSpeech, ...rangeOf(text) }
}

/**
 * A complete, honest analysis of the fixture sentence: two clauses, every
 * word-bearing part covered by a constituent, and explanations labelled by how
 * certain they are.
 */
function goodAnalysis(overrides = {}) {
  return {
    id: uuid(),
    passageId: '00000000-0000-4000-8000-0000000000a1',
    anchorId: 'p1.s1',
    text: SENTENCE,
    sourceRevision: 1,
    segmentationRevision: 1,
    translation: '我们必须耕种我们继承下来的园地。',
    backbone: 'il faut cultiver notre jardin',
    clauses: [
      { ...clause('主句', 'Il faut cultiver notre jardin'), id: CLAUSE_IDS.main },
      { ...clause('关系从句', 'que nous avons hérité', CLAUSE_IDS.main), id: CLAUSE_IDS.relative },
    ],
    constituents: [
      part('形式主语', 'Il', CLAUSE_IDS.main, '代词'),
      part('谓语', 'faut cultiver', CLAUSE_IDS.main, '动词'),
      part('直接宾语', 'notre jardin', CLAUSE_IDS.main, '名词短语'),
      part('关系从句', 'que nous avons hérité', CLAUSE_IDS.main, null),
    ],
    morphology: [
      {
        id: uuid(), form: 'faut', lemma: 'falloir', partOfSpeech: '动词', tense: '现在时',
        mood: '直陈式', person: '第三人称', gender: null, number: '单数', agreesWith: 'il', note: '',
      },
    ],
    explanations: [
      { id: uuid(), kind: 'syntax', text: 'il 是无人称句的形式主语。', start: 0, end: 2 },
      { id: uuid(), kind: 'context', text: '关系从句补充说明园地的来源。', start: 28, end: SENTENCE.length },
    ],
    provenance: 'ai',
    status: 'draft',
    revision: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

test('a complete analysis passes, and a summary is not punished for being short', () => {
  const report = validateSentenceAnalysis(goodAnalysis(), SENTENCE)
  assert.deepEqual(report.errors, [])
})

test('a missing translation is an error, not an empty field', () => {
  const report = validateSentenceAnalysis(goodAnalysis({ translation: '   ' }), SENTENCE)
  assert.equal(report.errors.some((error) => error.includes('缺少译文')), true)
})

test('an analysis with no clause structure is refused', () => {
  const report = validateSentenceAnalysis(goodAnalysis({ clauses: [] }), SENTENCE)
  assert.equal(report.errors.some((error) => error.includes('没有从句结构')), true)
})

test('a range that runs past the sentence is named, not rendered', () => {
  const analysis = goodAnalysis()
  analysis.constituents[0] = { ...analysis.constituents[0], end: SENTENCE.length + 40 }
  const report = validateSentenceAnalysis(analysis, SENTENCE)
  assert.equal(report.errors.some((error) => error.includes('超出句子长度')), true)
})

test('a word-bearing gap between constituents is an error', () => {
  const analysis = goodAnalysis()
  // "notre jardin" is covered by no constituent any more: the gap must be named
  // with its text rather than quietly counted as analysed.
  analysis.constituents = analysis.constituents.filter((item) => !['直接宾语', '关系从句'].includes(item.role))
  const report = validateSentenceAnalysis(analysis, SENTENCE)
  const gap = report.errors.find((error) => error.includes('未被分析的原文片段'))
  assert.ok(gap !== undefined, 'the uncovered text is named as an error')
  assert.match(gap, /notre jardin/u, 'the gap names the words it contains')
})

test('punctuation and spaces between constituents are not "unanalysed text"', () => {
  const analysis = goodAnalysis()
  // No constituent covers the comma and the space after it, which is normal:
  // those characters carry no words, so they are not an unanalysed part.
  const report = validateSentenceAnalysis(analysis, SENTENCE)
  assert.deepEqual(report.errors.filter((error) => error.includes('未被分析')), [])
  assert.equal(SENTENCE.slice(29, 31), ', ', 'the fixture really does leave punctuation uncovered')
})

test('one constituent covering a multi-clause sentence is a hint, not a pass', () => {
  const analysis = goodAnalysis({
    constituents: [
      { id: uuid(), role: '整句', start: 0, end: SENTENCE.length, text: SENTENCE, clauseId: null, partOfSpeech: null },
    ],
  })
  const report = validateSentenceAnalysis(analysis, SENTENCE)
  assert.equal(report.errors.some((error) => error.includes('概括')), false, 'a one-clause sentence is not punished')
  assert.equal(report.hints.some((hint) => hint.includes('这是概括')), true)
})

test('a one-constituent sentence with one clause is not called a summary', () => {
  const single = 'Le chat dort.'
  const mainClause = { id: uuid(), role: '主句', text: single, start: 0, end: single.length, parentId: null }
  const analysis = goodAnalysis({
    text: single,
    translation: '猫在睡觉。',
    clauses: [mainClause],
    constituents: [
      { id: uuid(), role: '主语', text: 'Le chat', start: 0, end: 7, clauseId: mainClause.id, partOfSpeech: '名词短语' },
      { id: uuid(), role: '谓语', text: 'dort', start: 8, end: 12, clauseId: mainClause.id, partOfSpeech: '动词' },
    ],
    explanations: [],
  })
  const report = validateSentenceAnalysis(analysis, single)
  assert.deepEqual(report.errors, [])
  assert.equal(report.hints.some((hint) => hint.includes('这是概括')), false)
})

test('a clause pointing at a parent that does not exist is refused', () => {
  const analysis = goodAnalysis()
  analysis.clauses[1] = { ...analysis.clauses[1], parentId: uuid() }
  const report = validateSentenceAnalysis(analysis, SENTENCE)
  assert.equal(report.errors.some((error) => error.includes('父从句不存在')), true)
})

test('an interpretation written as a syntactic fact is flagged', () => {
  const analysis = goodAnalysis()
  analysis.explanations = [
    { id: uuid(), kind: 'syntax', text: '作者借此暗示福柯式的意图。', start: null, end: null },
  ]
  const report = validateSentenceAnalysis(analysis, SENTENCE)
  assert.equal(report.hints.some((hint) => hint.includes('却写着作者意图')), true)
})

test('AI content marked as reviewed is queried, not accepted', () => {
  const report = validateSentenceAnalysis(goodAnalysis({ status: 'reviewed' }), SENTENCE)
  assert.equal(report.hints.some((hint) => hint.includes('请确认有人真的读过')), true)
})

test('coverage counts what is missing, failed and stale instead of claiming completeness', () => {
  const anchors = [
    { id: 'p1.s1', text: SENTENCE },
    { id: 'p1.s2', text: 'Une autre phrase.' },
    { id: 'p1.s3', text: 'Une troisième phrase.' },
    { id: 'p1.s4', text: 'La quatrième.' },
  ]
  const analyses = [
    goodAnalysis(),
    // Broken: the object was dropped, so a word-bearing gap remains.
    (() => {
      const text = anchors[1].text
      const mainClause = { id: uuid(), role: '主句', text, start: 0, end: text.length, parentId: null }
      return {
        ...goodAnalysis({ anchorId: 'p1.s2', text, translation: '另一句。' }),
        clauses: [mainClause],
        // Only "Une" is analysed: the rest of the sentence is a named gap.
        constituents: [
          { id: uuid(), role: '主语', text: 'Une', start: 0, end: 3, clauseId: mainClause.id, partOfSpeech: null },
        ],
        explanations: [],
      }
    })(),
    // Stale: it describes text that is no longer the sentence.
    goodAnalysis({ anchorId: 'p1.s4', text: 'Ancienne version de la phrase.' }),
  ]

  const coverage = analysisCoverage(anchors, analyses)
  assert.deepEqual(coverage.missing, ['p1.s3'], 'a sentence with no analysis is missing, not covered')
  assert.deepEqual(coverage.stale, ['p1.s4'], 'an analysis of other text is stale, not covered')
  assert.deepEqual(coverage.failed, ['p1.s2'], 'an analysis with errors is failed, not covered')
  assert.deepEqual(coverage.covered, ['p1.s1'])
  assert.equal(coverage.perSentence.length, 2, 'a stale analysis is not re-validated as if current')
})

test('the analysis record survives the storage schema', async () => {
  const { FRENCH_READER_DOMAIN } = await import('../lib/domain.js')
  const schema = FRENCH_READER_DOMAIN.tables.records.valueSchema
  const record = {
    kind: 'sentences',
    recordVersion: 1,
    payload: { passageId: '00000000-0000-4000-8000-0000000000a1', sentences: [goodAnalysis()] },
  }
  // The payload kind name must match the union; `sentenceAnalyses` is the real one.
  const parsed = schema.safeParse({ ...record, kind: 'sentenceAnalyses' })
  assert.equal(parsed.success, true, parsed.success ? '' : JSON.stringify(parsed.error?.issues?.slice(0, 3)))
  assert.equal(schema.safeParse(record).success, false, 'an unknown record kind is refused')
})
