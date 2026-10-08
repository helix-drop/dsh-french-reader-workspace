import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { deriveConjugationDataset } from '../lib/conjugation-data.js'
import {
  WIKTIONARY_API,
  decodeWiktionarySlot,
  formPageToRow,
  formPageUrl,
  parseFormPage,
  requestWikitext,
  variantPronunciations,
} from '../lib/conjugation-source.js'

/**
 * The pronunciation source, checked against pages that were really fetched.
 *
 * Every fixture under `test/fixtures/wiktionary/` is the API's own response for one
 * form (2026-10-07; provenance and licence in that directory's README). Parsing real
 * pages is the point: a parser validated against wikitext this test wrote would only
 * prove that the test and the parser agree.
 */
const read = (form) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/wiktionary/${form}.json`, import.meta.url)), 'utf8')).parse.wikitext

const signal = () => new AbortController().signal

test('a real form page yields its spelling, pronunciation, lemma and slots', () => {
  const venons = parseFormPage(read('venons'))
  assert.equal(venons.written, 'venons')
  assert.deepEqual(venons.ipa, ['və.nɔ̃'])
  assert.equal(venons.lemma, 'venir')
  assert.deepEqual(venons.slots, [
    { mood: 'ind', tense: 'pre', person: '1p' },
    { mood: 'imp', tense: 'pre', person: '1p' },
  ], 'one page can belong to two paradigms, and both are read')

  const viens = parseFormPage(read('viens'))
  assert.equal(viens.ipa[0], 'vjɛ̃')
  assert.deepEqual(viens.slots.map((slot) => `${slot.mood}:${slot.tense}:${slot.person}`), [
    'ind:pre:1s', 'ind:pre:2s', 'imp:pre:2s',
  ])

  const viennent = parseFormPage(read('viennent'))
  assert.equal(viennent.ipa[0], 'vjɛn')
  assert.deepEqual(viennent.slots.map((slot) => `${slot.mood}:${slot.tense}:${slot.person}`), [
    'ind:pre:3p', 'sub:pre:3p',
  ])
})

test('the parsed slots and pronunciation are the ones the pages state', () => {
  // Each expectation is read off the fetched wikitext, not from a guess about it.
  const cases = [
    ['parlons', 'parler', 'paʁ.lɔ̃', ['ind:pre:1p', 'imp:pre:1p']],
    ['parlent', 'parler', 'paʁl', ['ind:pre:3p', 'sub:pre:3p']],
    ['finissons', 'finir', 'fi.ni.sɔ̃', ['ind:pre:1p', 'imp:pre:1p']],
    ['finissent', 'finir', 'fi.nis', ['ind:pre:3p', 'sub:pre:3p', 'sub:imp:3p']],
    ['parlerons', 'parler', 'paʁ.lə.ʁɔ̃', ['ind:fut:1p']],
  ]
  for (const [form, lemma, ipa, slots] of cases) {
    const parsed = parseFormPage(read(form))
    assert.equal(parsed.lemma, lemma, `${form}: lemma`)
    assert.equal(parsed.ipa[0], ipa, `${form}: pronunciation`)
    assert.deepEqual(
      parsed.slots.map((slot) => `${slot.mood}:${slot.tense}:${slot.person}`), slots, `${form}: slots`,
    )
  }
})

test('a real paradigm derives the phonetic bases the reader knows', () => {
  // Only the pages that were actually fetched are used: 1s/2s from `viens`,
  // 1p from `venons`, 3p from `viennent`. The bases that come out are the ones the
  // interface carried for venir, so the whole chain — fetch, parse, derive — is
  // exercised on real data rather than on a transcript of it.
  const rows = ['viens', 'venons', 'viennent'].map((form) => formPageToRow(read(form)))
  assert.equal(rows.every((row) => row !== null), true)

  const dataset = deriveConjugationDataset('venir', rows, {
    kind: 'fr-wiktionary', version: 'api', fetchedAt: '2026-10-07T00:00:00.000Z',
  })
  const present = dataset.tenses.find((tense) => `${tense.mood}:${tense.tense}` === 'ind:pre')
  assert.notEqual(present, undefined)
  assert.deepEqual(
    present.bases.map((base) => ({ ipa: base.ipa, persons: base.persons })),
    [
      { ipa: 'vjɛ̃', persons: ['1s', '2s'] },
      { ipa: 'vən', persons: ['1p'] },
      { ipa: 'vjɛn', persons: ['3p'] },
    ],
    'syllable dots are notation, not sound: the base is grouped and displayed without them',
  )
  // The forms keep their full pronunciation, which is what the card shows beside each person.
  assert.equal(present.forms.find((form) => form.person === '1p').ipa, 'və.nɔ̃')
  assert.deepEqual(present.notes, [])
})

test('a page with no pronunciation contributes nothing instead of a wrong form', () => {
  const withoutPron = "{{fr-verbe-flexion|grp=1|parler|ind.p.1s=oui}} '''parle'''"
  assert.equal(formPageToRow(withoutPron), null, 'no pronunciation means no row')
  const notAVerb = "{{fr-nom|m}} '''table''' {{pron|tabl|fr}}"
  assert.equal(formPageToRow(notAVerb), null, 'a non-verb page is not a verb form')
  assert.equal(parseFormPage("{{fr-verbe-flexion|grp=1|parler}} '''parle''' {{pron|paʁl|fr}}"), null,
    'a flexion template with no slot is not usable')
})

test('extra pronunciations are reported, not silently discarded', () => {
  // Wiktionary lists a variant pronunciation for some forms; the first is the form's
  // own, and the rest are named so a note can say so.
  const withVariants = "{{fr-verbe-flexion|grp=3|venir|inf=oui}} '''venir''' {{pron|və.niʁ|vniʁ|fr}}"
  assert.deepEqual(variantPronunciations(withVariants), ['vniʁ'])
  assert.equal(formPageToRow(withVariants).ipa, 'və.niʁ', 'the first is used')
})

test('inflection codes decode, and unknown ones do not', () => {
  assert.deepEqual(decodeWiktionarySlot('ind.p.1p'), { mood: 'ind', tense: 'pre', person: '1p' })
  assert.deepEqual(decodeWiktionarySlot('ind.ps.3p'), { mood: 'ind', tense: 'pas', person: '3p' })
  assert.deepEqual(decodeWiktionarySlot('cnd.p.1s'), { mood: 'cnd', tense: 'pre', person: '1s' })
  assert.deepEqual(decodeWiktionarySlot('sub.i.2s'), { mood: 'sub', tense: 'imp', person: '2s' })
  assert.deepEqual(decodeWiktionarySlot('par.p'), { mood: 'par', tense: 'pas', person: null })
  assert.equal(decodeWiktionarySlot('ind.p'), null, 'a person paradigm needs a person')
  assert.equal(decodeWiktionarySlot('xxx.p.1s'), null, 'an unknown mood is refused')
  assert.equal(decodeWiktionarySlot(''), null)
})

test('every failure the API can answer with is its own outcome', async () => {
  const respond = (statusCode, content, truncated = false) => async () => ({
    statusCode, body: { kind: 'text', content }, truncated,
  })
  const ok = await requestWikitext(respond(200, JSON.stringify({ parse: { wikitext: 'hello' } })), 'venir', signal())
  assert.equal(ok.status, 'ok')
  assert.equal(ok.wikitext, 'hello')

  const limited = await requestWikitext(respond(429, 'too many'), 'venir', signal())
  assert.equal(limited.status, 'rate-limited', 'a rate limit is not an empty paradigm')
  assert.match(limited.message, /限流/u)

  const failed = await requestWikitext(respond(503, ''), 'venir', signal())
  assert.equal(failed.status, 'http-error')
  assert.equal(failed.httpStatus, 503)

  const cut = await requestWikitext(respond(200, '{"parse"', true), 'venir', signal())
  assert.equal(cut.status, 'truncated', 'an incomplete body is refused rather than half-parsed')

  const notJson = await requestWikitext(respond(200, '<html>nope</html>'), 'venir', signal())
  assert.equal(notJson.status, 'unreadable')

  const missing = await requestWikitext(respond(200, JSON.stringify({ error: { info: 'There is no page' } })), 'zzz', signal())
  assert.equal(missing.status, 'http-error')
  assert.match(missing.message, /no page/u)

  const threw = await requestWikitext(async () => { throw new Error('offline') }, 'venir', signal())
  assert.equal(threw.status, 'unreadable')
  assert.match(threw.message, /transport failed/u)
})

test('the request URL stays inside the declared endpoint', () => {
  const url = formPageUrl('venir')
  assert.equal(url.startsWith(`${WIKTIONARY_API}?`), true)
  assert.match(url, /action=parse/u)
  assert.match(url, /prop=wikitext/u)
  // A page name with a space or an accent is encoded rather than concatenated.
  assert.match(formPageUrl('avoir été'), /page=avoir%20%C3%A9t%C3%A9/u)
})
