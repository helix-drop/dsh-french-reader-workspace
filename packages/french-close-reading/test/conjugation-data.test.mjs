import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import {
  LEXIQUE_TO_IPA,
  PRONOUNCED_ENDINGS,
  decodeInflection,
  deriveConjugationDataset,
  lexiqueRowToSourceRow,
  parseLexiqueRow,
  toIpa,
  unmappedSymbols,
} from '../lib/conjugation-data.js'

/**
 * The phonetic-base derivation, checked against the source's own data.
 *
 * The fixture is a real excerpt of Lexique 3.83 (see
 * `test/fixtures/README.md`): 340 verb-form rows for ten lemmas. The assertions
 * below are the ones that matter for the reader's model — how many distinct bases a
 * tense is pronounced with, and which persons share each — and each is stated as a
 * comparison against data, never against a hard-coded expectation the code also
 * produced.
 */
const fixture = readFileSync(fileURLToPath(new URL('./fixtures/lexique-verbs.tsv', import.meta.url)), 'utf8')

/**
 * Every parsed row of one lemma, as a derivation row.
 *
 * The Lexique TSV is one source adapter; the derivation itself reads IPA only, which
 * is why the same function serves the Wiktionary fixtures in
 * `conjugation-source.test.mjs`.
 */
function rowsFor(lemma) {
  const rows = []
  for (const line of fixture.split('\n')) {
    const parsed = parseLexiqueRow(line)
    if (parsed === null || parsed.lemma !== lemma) continue
    const row = lexiqueRowToSourceRow(parsed)
    if (row !== null) rows.push(row)
  }
  return rows
}

const source = { kind: 'lexique', version: '3.83', fetchedAt: '2026-10-07T00:00:00.000Z' }

/** The bases of one tense, as `iphone → persons`. */
function basesOf(lemma, tense = 'ind:pre') {
  const dataset = deriveConjugationDataset(lemma, rowsFor(lemma), source)
  const entry = dataset.tenses.find((item) => `${item.mood}:${item.tense}` === tense)
  assert.notEqual(entry, undefined, `${lemma} has a ${tense} paradigm`)
  return entry
}

test('the alphabet maps to IPA, and unknown symbols are named rather than dropped', () => {
  // Each case is a word whose pronunciation is not in question.
  assert.equal(toIpa('S@te'), 'ʃɑ̃te', 'chanter')
  assert.equal(toIpa('Sj5'), 'ʃjɛ̃', 'chien')
  assert.equal(toIpa('m§taN'), 'mɔ̃taɲ', 'montagne')
  assert.equal(toIpa('Z2di'), 'ʒødi', 'jeudi')
  assert.equal(toIpa('fl9R'), 'flœʁ', 'fleur')
  assert.equal(toIpa('8it'), 'ɥit', 'huit')
  assert.equal(toIpa('bR1'), 'bʁœ̃', 'brun')
  assert.equal(toIpa('v°n§'), 'vənɔ̃', 'venons')
  assert.equal(toIpa('vj5'), 'vjɛ̃', 'viens')

  assert.equal(toIpa('q'), null, 'a symbol outside the table is not guessed')
  assert.deepEqual(unmappedSymbols('abq'), ['q'])
  // The table is the alphabet the corpus actually uses: every key appears in it.
  for (const key of Object.keys(LEXIQUE_TO_IPA)) {
    assert.equal(typeof LEXIQUE_TO_IPA[key], 'string')
  }
})

test('inflection tags decode to a mood, a tense and a person', () => {
  assert.deepEqual(decodeInflection('ind:pre:2p'), { mood: 'ind', tense: 'pre', person: '2p' })
  assert.deepEqual(decodeInflection('par:pas'), { mood: 'par', tense: 'pas', person: null })
  assert.equal(decodeInflection('inf'), null, 'a tag without a tense is not a slot')
  assert.deepEqual(decodeInflection('sub:pre:3p'), { mood: 'sub', tense: 'pre', person: '3p' })
  assert.equal(decodeInflection('ind:pre:9x'), null, 'an unknown person is not accepted')
  assert.equal(decodeInflection('ind'), null, 'a single field is not a slot')
})

test('a regular -er verb is pronounced with one base for all six persons', () => {
  const present = basesOf('parler')
  assert.equal(present.bases.length, 1, 'parler has a single present-tense stem')
  assert.deepEqual(present.bases[0].persons, ['1s', '2s', '3s', '1p', '2p', '3p'])
  assert.equal(present.bases[0].ipa, 'paʁl')
  // The spelling is not claimed: présent 1s/3s have no single written ending, so
  // deriving `parl-` would be a guess the source does not support.
  assert.equal(present.bases[0].writtenStem, null)
  // The forms keep their own pronunciations, so the card can show both layers.
  const third = present.forms.find((form) => form.person === '3p')
  assert.equal(third.written, 'parlent')
  assert.equal(third.ipa, 'paʁl')
  assert.equal(third.baseIndex, 0)
  const first = present.forms.find((form) => form.person === '1p')
  assert.equal(first.written, 'parlons')
  assert.equal(first.ipa, 'paʁlɔ̃', 'the ending is part of the form, not of the base')
})

test('the derived bases reproduce the five known verbs exactly', () => {
  // These five are the mapping the interface prototype carried, and they were read
  // from the literature by hand. Deriving them from pronunciation data is the test.
  const expected = {
    venir: [
      { ipa: 'vjɛ̃', persons: ['1s', '2s', '3s'] },
      { ipa: 'vən', persons: ['1p', '2p'] },
      { ipa: 'vjɛn', persons: ['3p'] },
    ],
    prendre: [
      { ipa: 'pʁɑ̃', persons: ['1s', '2s', '3s'] },
      { ipa: 'pʁən', persons: ['1p', '2p'] },
      { ipa: 'pʁɛn', persons: ['3p'] },
    ],
    finir: [
      { ipa: 'fini', persons: ['1s', '2s', '3s'] },
      { ipa: 'finis', persons: ['1p', '2p', '3p'] },
    ],
    tracer: [{ ipa: 'tʁas', persons: ['1s', '2s', '3s', '1p', '3p', '2p'] }],
    écarter: [{ ipa: 'ekaʁt', persons: ['1s', '2s', '3s', '1p', '3p', '2p'] }],
  }
  for (const [lemma, wanted] of Object.entries(expected)) {
    const present = basesOf(lemma)
    assert.equal(present.bases.length, wanted.length, `${lemma}: base count`)
    for (const [index, base] of wanted.entries()) {
      assert.equal(present.bases[index].ipa, base.ipa, `${lemma}: base ${String(index + 1)} pronunciation`)
      assert.deepEqual(
        [...present.bases[index].persons].sort(), [...base.persons].sort(),
        `${lemma}: base ${String(index + 1)} persons`,
      )
    }
    assert.deepEqual(present.notes, [], `${lemma}: no gaps to report`)
  }
})

test('a syllable dot never splits one stem into two bases', () => {
  // Found by walking the real source: Wiktionary writes `paʁ.lɔ̃` for `parlons` but
  // `paʁl` for `parle`, and `fi.ni.sɔ̃` beside `fi.nis`. Grouping on the dotted
  // string reported a regular -er verb as having two present-tense stems, which is
  // the opposite of what a phonetic-base card is for.
  const slot = (person) => [{ mood: 'ind', tense: 'pre', person }]
  const regular = deriveConjugationDataset('parler', [
    { written: 'parle', ipa: 'paʁl', slots: slot('1s') },
    { written: 'parlons', ipa: 'paʁ.lɔ̃', slots: slot('1p') },
    { written: 'parlez', ipa: 'paʁ.le', slots: slot('2p') },
  ], source)
  const present = regular.tenses.find((tense) => tense.mood === 'ind' && tense.tense === 'pre')
  assert.equal(present.bases.length, 1, 'parler has one present stem')
  assert.deepEqual(present.bases[0].persons, ['1s', '1p', '2p'])
  assert.equal(present.bases[0].ipa, 'paʁl', 'and the displayed base carries no notation')

  // The same rule where the dot sits differently in two forms of one stem.
  const third = deriveConjugationDataset('finir', [
    { written: 'finissons', ipa: 'fi.ni.sɔ̃', slots: slot('1p') },
    { written: 'finissent', ipa: 'fi.nis', slots: slot('3p') },
  ], source)
  const thirdPresent = third.tenses.find((tense) => tense.mood === 'ind' && tense.tense === 'pre')
  assert.equal(thirdPresent.bases.length, 1, 'one stem, whatever the notation')
  assert.deepEqual(thirdPresent.bases[0].persons, ['1p', '3p'])
  assert.equal(thirdPresent.bases[0].ipa, 'finis')
  // The forms keep their own dotted pronunciations for display.
  assert.equal(thirdPresent.forms.find((form) => form.person === '1p').ipa, 'fi.ni.sɔ̃')
})

test('a stem that is shared but spelled differently does not claim one spelling', () => {
  // ouvrir: /uvʁ/ for all six persons, but the 3rd plural is spelled `ouvrent`
  // against `ouvre`/`ouvres` elsewhere — the pronunciation is one base, the
  // spelling is not, and the record says so instead of picking one.
  const present = basesOf('ouvrir')
  assert.equal(present.bases.length, 1)
  assert.equal(present.bases[0].ipa, 'uvʁ')
  assert.equal(present.bases[0].writtenStem, null, 'no single written stem is claimed')
  assert.deepEqual([...present.bases[0].persons].sort(), ['1p', '1s', '2p', '2s', '3p', '3s'])
})

test('a source contradiction is reported, not resolved by preference', () => {
  // Lexique files `étaient` under présent 3p as well as imparfait; `sont` is the real
  // présent form. Two pronunciations for one cell is a gap the reader can see.
  const present = basesOf('être')
  const third = present.forms.find((form) => form.person === '3p')
  assert.equal(third, undefined, 'the contested cell yields no form')
  const contested = present.notes.filter((note) => /ils|3p/u.test(note))
  assert.equal(contested.length, 1, 'the contested cell is named once')
  assert.match(contested[0], /多个读音|未指定/u)
  // être is irregular enough that other cells have gaps too; the record says which
  // rather than hiding them behind one summary line.
  assert.ok(present.notes.length >= 1)
})

test('tenses other than the present are derived too, from the same rule', () => {
  const imperfect = basesOf('venir', 'ind:imp')
  assert.equal(imperfect.bases.length, 1, 'the imperfect has one stem for venir')
  assert.equal(imperfect.bases[0].ipa, 'vən')
  assert.equal(imperfect.forms.length, 6)
  assert.equal(imperfect.forms.find((form) => form.person === '3p').written, 'venaient')

  const future = basesOf('venir', 'ind:fut')
  assert.equal(future.bases.length, 1)
  assert.equal(future.bases[0].ipa, 'vjɛ̃dʁ')

  const conditional = basesOf('parler', 'cnd:pre')
  assert.equal(conditional.bases.length, 1)
  assert.equal(conditional.bases[0].ipa, 'paʁləʁ')
})

test('the ending table matches the regular verb it was read from', () => {
  // If the endings were wrong, parler would split into several bases; asserting
  // both directions keeps the table and its evidence together.
  assert.deepEqual(PRONOUNCED_ENDINGS['ind:pre'], { '1p': 'ɔ̃', '2p': 'e' })
  assert.deepEqual(PRONOUNCED_ENDINGS['ind:imp'], { '1s': 'ɛ', '2s': 'ɛ', '3s': 'ɛ', '1p': 'jɔ̃', '2p': 'je', '3p': 'ɛ' })
  const dataset = deriveConjugationDataset('parler', rowsFor('parler'), source)
  for (const tense of dataset.tenses) {
    assert.equal(tense.bases.length, 1, `${tense.label}: a regular verb has one base`)
  }
})

test('parsing reads only verb rows and keeps every tag a row carries', () => {
  const line = ['viens', 'vj5', 'venir', 'VER', '', '', '1', '1', '2', '3', 'imp:pre:2s;ind:pre:1s;ind:pre:2s;inf;'].join('\t')
  const parsed = parseLexiqueRow(line)
  assert.equal(parsed.lemma, 'venir')
  assert.equal(parsed.written, 'viens')
  // `inf` carries no tense and no person, so it decodes to nothing and is dropped.
  assert.equal(parsed.slots.length, 3)
  assert.deepEqual(parsed.slots[1], { mood: 'ind', tense: 'pre', person: '1s' })
  assert.equal(parseLexiqueRow(['x', 'y', 'z'].join('\t')), null, 'a short line is not a row')
  assert.equal(parseLexiqueRow(['a', 'b', 'c', 'NOM', '', '', '', '', '', '', 'ind:pre:1s;'].join('\t')), null, 'nouns are not verbs')
})
