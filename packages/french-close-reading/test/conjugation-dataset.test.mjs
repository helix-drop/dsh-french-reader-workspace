import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import {
  deriveConjugationDataset,
  lexiqueRowToSourceRow,
  parseLexiqueRow,
  resolvePerson,
  resolveTenseLabel,
} from '../lib/conjugation-data.js'
import { formPageToRow } from '../lib/conjugation-source.js'
import { checkConjugation } from '../lib/conjugation.js'
import {
  answerForLemma,
  conjugationKey,
  listConjugationRecords,
  mergeDataset,
  missingPersons,
  readConjugationRecord,
  writeConjugationDataset,
} from '../lib/conjugation-store.js'
import { createBacking, openController, signal } from './support/harness.mjs'
import { FRENCH_READER_DOMAIN } from '../lib/domain.js'

/**
 * The dataset store and the data-backed checker.
 *
 * Two properties are being defended here:
 *
 * 1. **A card never conjugates from memory.** No fetch means `no-data`, and a record
 *    that carries no dataset says why instead of looking like an empty paradigm.
 * 2. **A claim is checked against data, not against its own assertion.** The
 *    author's `classificationVerified: true` used to be enough; with a dataset it is
 *    not, and a form or a base the data contradicts is an error.
 */
const fixture = readFileSync(fileURLToPath(new URL('./fixtures/lexique-verbs.tsv', import.meta.url)), 'utf8')
const wiki = (form) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/wiktionary/${form}.json`, import.meta.url)), 'utf8')).parse.wikitext

/** A real dataset for one lemma, from the Lexique fixture. */
function datasetFor(lemma) {
  const rows = []
  for (const line of fixture.split('\n')) {
    const parsed = parseLexiqueRow(line)
    if (parsed === null || parsed.lemma !== lemma) continue
    const row = lexiqueRowToSourceRow(parsed)
    if (row !== null) rows.push(row)
  }
  return deriveConjugationDataset(lemma, rows, { kind: 'lexique', version: '3.83', fetchedAt: '2026-10-07T00:00:00.000Z' })
}

/** A minimal table, enough for the store's own functions. */
function table() {
  const records = new Map()
  return {
    records,
    get: (key) => records.get(key),
    entries: () => [...records.entries()],
    get size() { return records.size },
    async put(key, value) { records.set(key, value) },
    async delete(key) { return records.delete(key) },
    async update(key, fn) { const next = fn(records.get(key)); records.set(key, next); return next },
  }
}

test('labels resolve to dataset slots, and unknown ones do not', () => {
  assert.deepEqual(resolveTenseLabel('现在时'), { mood: 'ind', tense: 'pre' })
  assert.deepEqual(resolveTenseLabel('présent'), { mood: 'ind', tense: 'pre' })
  assert.deepEqual(resolveTenseLabel('imparfait'), { mood: 'ind', tense: 'imp' })
  assert.equal(resolveTenseLabel('随便什么'), null)
  assert.equal(resolvePerson('je'), '1s')
  assert.equal(resolvePerson('nous'), '1p')
  assert.equal(resolvePerson('il / elle'), '3s')
  assert.equal(resolvePerson('第三人称'), null)
})

test('no data is a first-class answer, and never a generated paradigm', () => {
  const store = table()
  const answer = answerForLemma(store, 'venir')
  assert.equal(answer.kind, 'no-data')
  assert.match(answer.reason, /尚未获取/u)
})

test('a failed fetch is stored as its own state, with the reason', async () => {
  const store = table()
  const record = await writeConjugationDataset(store, {
    lemma: 'venir', dataset: null, source: 'fr-wiktionary', sourceVersion: 'api',
    fetchStatus: 'rate-limited', failure: '来源限流，请稍后再试',
  })
  assert.equal(record.dataset, null)
  const answer = answerForLemma(store, 'venir')
  assert.equal(answer.kind, 'pending')
  assert.match(answer.reason, /限流/u)
  // And it survives a read: the store keys by the normalised lemma.
  assert.equal(readConjugationRecord(store, '  VENIR ')?.fetchStatus, 'rate-limited')
  assert.equal(conjugationKey('venir'), conjugationKey(' VENIR '))
})

test('a fetched dataset is stored with its provenance and answers as data', async () => {
  const store = table()
  const dataset = datasetFor('venir')
  await writeConjugationDataset(store, {
    lemma: 'venir', dataset, source: 'lexique', sourceVersion: '3.83', fetchStatus: 'ok',
  })
  const answer = answerForLemma(store, 'venir')
  assert.equal(answer.kind, 'dataset')
  assert.equal(answer.record.source, 'lexique')
  assert.equal(answer.record.dataset.lemma, 'venir')
  assert.equal(answer.record.missingForms.length, 0)
  assert.equal(listConjugationRecords(store).length, 1)
})

test('a second fetch merges tenses instead of discarding the first', () => {
  const present = deriveConjugationDataset('venir', ['viens', 'venons', 'viennent'].map((form) => formPageToRow(wiki(form))),
    { kind: 'fr-wiktionary', version: 'api', fetchedAt: '2026-10-07T00:00:00.000Z' })
  // A form page declares every slot it fills, so the three fetched present forms also
  // bring the imperative and subjunctive cells they belong to. The merge must keep
  // the union of both fetches, and let the newer fetch win where they overlap.
  const imperfectOnly = datasetFor('venir')
  const later = {
    ...imperfectOnly,
    tenses: [
      ...imperfectOnly.tenses.filter((tense) => tense.tense === 'imp'),
      { ...imperfectOnly.tenses.find((tense) => tense.mood === 'ind' && tense.tense === 'pre'), label: '现在时（新）' },
    ],
  }
  const merged = mergeDataset(present, later)
  const codes = merged.tenses.map((tense) => `${tense.mood}:${tense.tense}`).sort()
  const wanted = [...new Set([...present.tenses, ...later.tenses].map((tense) => `${tense.mood}:${tense.tense}`))].sort()
  assert.deepEqual(codes, wanted, 'the union of both fetches survives')
  assert.equal(
    merged.tenses.find((tense) => tense.mood === 'ind' && tense.tense === 'pre').label, '现在时（新）',
    'the newer fetch replaces the older one for a tense they share',
  )
  // The three fetched pages cover 1s, 2s, 1p and 3p; the card can name what is absent.
  assert.equal(missingPersons(present, { mood: 'ind', tense: 'pre' }).join(','), '3s,2p', 'the gaps are nameable')
  // After the merge the present tense came from the newer, complete fetch, so there is
  // nothing missing there — and a tense neither fetch touched is entirely absent.
  assert.equal(missingPersons(merged, { mood: 'ind', tense: 'pre' }).length, 0, 'the newer complete fetch filled it')
  assert.equal(missingPersons(merged, { mood: 'ind', tense: 'fut' }).length, 6, 'an unfetched tense is entirely missing')
})

test('missing persons follow the mood: the imperative has three, non-finite moods none', () => {
  const dataset = datasetFor('venir')
  const imperative = dataset.tenses.find((tense) => tense.mood === 'imp' && tense.tense === 'pre')
  assert.notEqual(imperative, undefined, 'the fixture really has an imperative present')
  // The imperative exists for 2s/1p/2p only: 1s, 3s and 3p are not "missing",
  // they are persons this mood does not have.
  const missing = missingPersons(dataset, { mood: 'imp', tense: 'pre' })
  assert.equal(missing.includes('1s'), false)
  assert.equal(missing.includes('3s'), false)
  assert.equal(missing.includes('3p'), false)
  for (const person of ['2s', '1p', '2p']) {
    assert.equal(missing.includes(person), imperative.forms.every((form) => form.person !== person),
      'a finite imperative person is missing only when the data lacks it')
  }
  // An imperative tense absent from the dataset reports its own three persons,
  // never six.
  const empty = { lemma: 'venir', source: dataset.source, tenses: [] }
  assert.deepEqual(missingPersons(empty, { mood: 'imp', tense: 'pre' }), ['2s', '1p', '2p'])
  // Infinitive and participle are non-finite: no persons exist to be missing.
  assert.deepEqual(missingPersons(dataset, { mood: 'inf', tense: 'pre' }), [])
  assert.deepEqual(missingPersons(dataset, { mood: 'par', tense: 'pre' }), [])
})

test('the store validates through the domain schema', async () => {
  // The write path goes through the real record union, so a dataset that would fail
  // the next open fails here instead.
  const backing = createBacking()
  const opened = await openController(backing, FRENCH_READER_DOMAIN)
  const domainTable = opened.domain.table('records')
  await writeConjugationDataset(domainTable, {
    lemma: 'venir', dataset: datasetFor('venir'), source: 'lexique', sourceVersion: '3.83', fetchStatus: 'ok',
  })
  const stored = backing.tables.get('records').get(conjugationKey('venir'))
  assert.equal(FRENCH_READER_DOMAIN.tables.records.valueSchema.safeParse(stored).success, true)
  const answer = answerForLemma(domainTable, 'venir')
  assert.equal(answer.kind, 'dataset')
})

test('the checker verifies a claim against the data, not against its own flag', () => {
  const dataset = datasetFor('venir')
  const honest = {
    infinitive: 'venir',
    inputForm: 'venons',
    inputTense: '现在时',
    blocks: [{
      tense: '现在时',
      rows: [
        { person: 'je', form: 'viens' },
        { person: 'tu', form: 'viens' },
        { person: 'il / elle', form: 'vient' },
        { person: 'nous', form: 'venons' },
        { person: 'vous', form: 'venez' },
        { person: 'ils / elles', form: 'viennent' },
      ],
      bases: [
        { ipa: 'vjɛ̃', persons: ['je', 'tu', 'il / elle'] },
        { ipa: 'vən', persons: ['nous', 'vous'] },
        { ipa: 'vjɛn', persons: ['ils / elles'] },
      ],
    }],
  }
  const accepted = checkConjugation(honest, { dataset })
  assert.deepEqual(accepted.errors, [], 'a claim that matches the data passes')

  // A form the data contradicts is an error, even though the shape is fine.
  const wrongForm = checkConjugation({
    ...honest,
    blocks: [{ ...honest.blocks[0], rows: honest.blocks[0].rows.map((row) => row.person === 'nous' ? { ...row, form: 'venont' } : row) }],
  }, { dataset })
  assert.equal(wrongForm.errors.length, 1)
  assert.match(wrongForm.errors[0], /venons|不符/u)

  // A claimed base the data does not have is an error.
  const wrongBase = checkConjugation({
    ...honest,
    blocks: [{ ...honest.blocks[0], bases: [{ ipa: 'vjɛ̃', persons: ['je', 'tu', 'il / elle'] }] }],
  }, { dataset })
  assert.match(wrongBase.errors.join(' '), /数据集给出 3 个/u, 'a wrong base count is named')
})

test('a single taught stem is refused when the persons do not share one', () => {
  const dataset = datasetFor('venir')
  const claim = {
    infinitive: 'venir',
    inputForm: 'venons',
    inputTense: '现在时',
    blocks: [{
      tense: '现在时',
      stem: 'ven',
      endings: { 'nous': 'ons', 'vous': 'ez' },
      rows: [
        { person: 'je', form: 'viens' },
        { person: 'nous', form: 'venons' },
        { person: 'vous', form: 'venez' },
        { person: 'ils / elles', form: 'viennent' },
      ],
    }],
  }
  const report = checkConjugation(claim, { dataset })
  assert.equal(
    report.errors.some((error) => /并不共用一个基底|不符/u.test(error)), true,
    'venir cannot be taught with one stem, and the data says so',
  )
})

test('without data the claim is not contradicted, but the base claim is marked', () => {
  const claim = {
    infinitive: 'venir',
    inputForm: 'venons',
    inputTense: '现在时',
    blocks: [{
      tense: '现在时',
      rows: [{ person: 'nous', form: 'venons' }],
      bases: [{ ipa: 'vən', persons: ['nous', 'vous'] }],
    }],
  }
  const report = checkConjugation(claim)
  assert.deepEqual(report.errors, [], 'no data means no contradiction is invented')
  assert.equal(report.hints.some((hint) => /未核实/u.test(hint)), true, 'and the gap is stated')
})

test('a partial dataset yields hints where a complete one yields errors', () => {
  // Only three form pages were fetched, so the three persons that were not fetched
  // must not be reported as contradictions.
  const partial = deriveConjugationDataset('venir', ['viens', 'venons', 'viennent'].map((form) => formPageToRow(wiki(form))),
    { kind: 'fr-wiktionary', version: 'api', fetchedAt: '2026-10-07T00:00:00.000Z' })
  const claim = {
    infinitive: 'venir',
    inputForm: 'venez',
    inputTense: '现在时',
    blocks: [{
      tense: '现在时',
      rows: [
        { person: 'je', form: 'viens' },
        { person: 'vous', form: 'venez' },
        { person: 'ils / elles', form: 'viennent' },
      ],
    }],
  }
  const report = checkConjugation(claim, { dataset: partial })
  assert.deepEqual(report.errors, [], 'an unfetched cell is not a contradiction')
  assert.equal(report.hints.some((hint) => /数据不完整|没有这一格/u.test(hint)), true, 'it is named as a gap')

  // The same claim against a complete dataset does contradict it.
  const complete = datasetFor('venir')
  const strict = checkConjugation({ ...claim, blocks: [{ ...claim.blocks[0], rows: [{ person: 'je', form: 'viens' }, { person: 'vous', form: 'venont' }, { person: 'ils / elles', form: 'viennent' }] }] }, { dataset: complete })
  assert.equal(strict.errors.some((error) => /venez|不符/u.test(error)), true)
})

test('a claim about another verb is not checked against this dataset', () => {
  const dataset = datasetFor('venir')
  const report = checkConjugation({
    infinitive: 'parler',
    inputForm: 'parlons',
    inputTense: '现在时',
    blocks: [{ tense: '现在时', rows: [{ person: 'nous', form: 'parlons' }] }],
  }, { dataset })
  assert.deepEqual(report.errors, [])
  assert.equal(report.hints.some((hint) => /不同/u.test(hint)), true)
})
