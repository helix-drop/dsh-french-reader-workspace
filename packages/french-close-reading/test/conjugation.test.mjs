import test from 'node:test'
import assert from 'node:assert/strict'

import { checkConjugation, renderConjugation } from '../lib/conjugation.js'

const PRESENT = {
  tense: '现在时',
  stem: 'ouvr',
  endings: { 'je': 'e', 'tu': 'es', 'il': 'e', 'nous': 'ons', 'vous': 'ez', 'ils': 'ent' },
  rows: [
    { person: 'je', form: 'ouvre' },
    { person: 'tu', form: 'ouvres' },
    { person: 'il', form: 'ouvre' },
    { person: 'nous', form: 'ouvrons' },
    { person: 'vous', form: 'ouvrez' },
    { person: 'ils', form: 'ouvrent' },
  ],
}

test('a correct claim passes and renders the ladder with the input marked', () => {
  const claim = {
    infinitive: 'ouvrir', inputForm: 'ouvre', inputTense: '现在时',
    blocks: [PRESENT], irregularNote: '三组动词，直陈式现在时单数词干为 ouvr-。',
  }
  const report = checkConjugation(claim)
  assert.deepEqual(report.errors, [])
  const rendered = renderConjugation(claim)
  assert.match(rendered, /原形 ouvrir/)
  assert.match(rendered, /词干 ouvr/)
  assert.match(rendered, /je ouvre ◀/, 'the input form is marked in the ladder')
  assert.equal((rendered.match(/◀/gu) ?? []).length, 2, 'both forms identical to the input are marked')
})

test('a decomposition that does not compose the shown form is an error', () => {
  const report = checkConjugation({
    ...{ infinitive: 'ouvrir', inputForm: 'ouvre', inputTense: '现在时' },
    irregularNote: 'n/a',
    blocks: [{ ...PRESENT, endings: { ...PRESENT.endings, 'nous': 'ons' }, rows: PRESENT.rows.map((row) => row.person === 'nous' ? { ...row, form: 'ouvrons' } : row).map((row) => row.person === 'vous' ? { ...row, form: 'ouvrez' } : row) }],
  })
  // stems and endings agree here; now break one deliberately
  const broken = checkConjugation({
    infinitive: 'ouvrir', inputForm: 'ouvre', inputTense: '现在时', irregularNote: 'n/a',
    blocks: [{ ...PRESENT, stem: 'ouv', endings: { 'nous': 'ons' }, rows: [{ person: 'nous', form: 'ouvrons' }] }],
  })
  assert.equal(broken.errors.some((error) => /词干「ouv」＋后缀「ons」＝「ouvons」/u.test(error)), true)
  assert.equal(report.errors.some((error) => /不符/u.test(error)), false)
})

test('the present tense is shown once, and no other tense beyond the input', () => {
  const duplicated = checkConjugation({
    infinitive: 'ouvrir', inputForm: 'ouvre', inputTense: '现在时', irregularNote: 'n/a',
    blocks: [PRESENT, { ...PRESENT, tense: '直陈式现在时' }],
  })
  assert.equal(duplicated.errors.some((error) => /不重复输出/u.test(error)), true)

  const extra = checkConjugation({
    infinitive: 'ouvrir', inputForm: 'ouvre', inputTense: '现在时', irregularNote: 'n/a',
    blocks: [PRESENT, { tense: '未完成过去时', rows: [{ person: 'je', form: 'ouvrais' }] }],
  })
  assert.equal(extra.errors.some((error) => /超出范围/u.test(error)), true)
})

test('a bare past participle is not a compound tense', () => {
  const report = checkConjugation({
    infinitive: 'ouvrir', inputForm: 'ouvert', inputTense: '复合过去时',
    blocks: [{ tense: '现在时', rows: [{ person: 'je', form: 'ouvre' }] }],
    irregularNote: '过去分词不规则。',
  })
  assert.equal(report.errors.some((error) => /没有助动词/u.test(error)), true)

  const withAuxiliary = checkConjugation({
    infinitive: 'ouvrir', inputForm: 'ai ouvert', inputTense: '复合过去时',
    blocks: [{ tense: '现在时', rows: [{ person: 'je', form: 'ouvre' }] }],
    irregularNote: '过去分词不规则。',
  })
  assert.equal(withAuxiliary.errors.some((error) => /没有助动词/u.test(error)), false)
  // The compound block itself is in scope because it is the input's tense.
  assert.equal(withAuxiliary.errors.some((error) => /超出范围/u.test(error)), false)
})

test('an ambiguous form needs an example before its tense is asserted', () => {
  const without = checkConjugation({
    infinitive: 'établir', inputForm: 'établit', inputTense: '现在时',
    candidates: ['现在时', '简单过去时'],
    blocks: [{ tense: '现在时', rows: [{ person: 'il', form: 'établit' }] }],
    irregularNote: 'n/a',
  })
  assert.equal(without.errors.some((error) => /需要给出例句/u.test(error)), true)

  const with_ = checkConjugation({
    infinitive: 'établir', inputForm: 'établit', inputTense: '现在时',
    candidates: ['现在时', '简单过去时'],
    evidence: 'Il établit la liste chaque matin.',
    blocks: [{ tense: '现在时', rows: [{ person: 'il', form: 'établit' }] }],
    irregularNote: 'n/a',
  })
  assert.deepEqual(with_.errors, [])
  assert.equal(with_.hints.some((hint) => /已用例句消歧/u.test(hint)), true)
})

test('an unverified classification is marked, not asserted', () => {
  const claim = {
    infinitive: 'finir', inputForm: 'finis', inputTense: '现在时',
    classification: 'B 类', classificationVerified: false,
    blocks: [{ tense: '现在时', rows: [{ person: 'je', form: 'finis' }] }],
    irregularNote: 'n/a',
  }
  const report = checkConjugation(claim)
  assert.equal(report.hints.some((hint) => /存疑/u.test(hint)), true)
  assert.match(renderConjugation(claim), /B 类（存疑：未核实）/)

  const verified = { ...claim, classificationVerified: true }
  assert.match(renderConjugation(verified), /B 类\n/)
  assert.equal(checkConjugation(verified).hints.some((hint) => /存疑/u.test(hint)), false)
})

test('irregular verbs demand an explicit exception note', () => {
  const report = checkConjugation({
    infinitive: 'être', inputForm: 'suis', inputTense: '现在时',
    blocks: [{ tense: '现在时', rows: [{ person: 'je', form: 'suis' }] }],
  })
  assert.equal(report.hints.some((hint) => /不规则动词/u.test(hint)), true)
  assert.equal(report.errors.length, 0, 'a missing note is a hint, not a false claim')
})

test('malformed forms and an empty claim are refused', () => {
  const bad = checkConjugation({
    infinitive: 'ouvrir', inputForm: 'ouvre', inputTense: '现在时', irregularNote: 'n/a',
    blocks: [{ tense: '现在时', rows: [{ person: 'je', form: 'ouvre1' }] }],
  })
  assert.equal(bad.errors.some((error) => /不是合法的法语词形/u.test(error)), true)

  const empty = checkConjugation({ infinitive: '', inputForm: '', inputTense: null, blocks: [] })
  assert.equal(empty.errors.length >= 3, true, 'missing infinitive, input, and blocks are all reported')
})

test('an input form missing from the ladder is reported', () => {
  const report = checkConjugation({
    infinitive: 'ouvrir', inputForm: 'ouvrait', inputTense: '未完成过去时', irregularNote: 'n/a',
    blocks: [{ tense: '现在时', rows: [{ person: 'je', form: 'ouvre' }] }, { tense: '未完成过去时', rows: [{ person: 'je', form: 'ouvrais' }] }],
  })
  assert.equal(report.hints.some((hint) => /未出现在展示的任何一个时态块中/u.test(hint)), true)
})
