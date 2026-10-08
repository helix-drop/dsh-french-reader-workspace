import test from 'node:test'
import assert from 'node:assert/strict'

import { findAnchor, segmentSource } from '../lib/segmentation.js'

/** Sentences of every paragraph, flattened, for compact assertions. */
const sentences = (source) => segmentSource(source).flatMap((p) => p.sentences.map((s) => s.text))

test('paragraphs split on blank lines and offsets index the original source', () => {
  const source = 'Premier paragraphe.\n\nDeuxième paragraphe.\n\n\nTroisième.'
  const paragraphs = segmentSource(source)
  assert.deepEqual(paragraphs.map((p) => p.text), ['Premier paragraphe.', 'Deuxième paragraphe.', 'Troisième.'])
  assert.deepEqual(paragraphs.map((p) => p.id), ['p1', 'p2', 'p3'])
  for (const paragraph of paragraphs) {
    assert.equal(source.slice(paragraph.start, paragraph.end), paragraph.text)
  }
  for (const paragraph of paragraphs) {
    for (const sentence of paragraph.sentences) {
      assert.equal(source.slice(sentence.start, sentence.end), sentence.text)
      assert.equal(sentence.paragraphId, paragraph.id)
    }
  }
})

test('a single newline stays inside one paragraph but a dialogue dash starts a sentence', () => {
  const source = 'Il entra.\n— Bonjour, dit-elle.\n— Bonjour.'
  const paragraphs = segmentSource(source)
  assert.equal(paragraphs.length, 1)
  assert.deepEqual(paragraphs[0].sentences.map((s) => s.text), [
    'Il entra.',
    '— Bonjour, dit-elle.',
    '— Bonjour.',
  ])
  assert.deepEqual(paragraphs[0].sentences.map((s) => s.id), ['p1.s1', 'p1.s2', 'p1.s3'])
})

test('sentence terminators carry their closing quotes and runs of punctuation', () => {
  assert.deepEqual(sentences('Il dit : « Va-t’en. » Puis il partit.'), [
    'Il dit : « Va-t’en. »',
    'Puis il partit.',
  ])
  assert.deepEqual(sentences('Quoi ?! Rien… Vraiment !'), ['Quoi ?!', 'Rien…', 'Vraiment !'])
  assert.deepEqual(sentences('Attends... Non.'), ['Attends...', 'Non.'])
})

test('abbreviations, initials, and decimals hold their period back', () => {
  assert.deepEqual(sentences('M. Dupont est arrivé. Il attend.'), ['M. Dupont est arrivé.', 'Il attend.'])
  assert.deepEqual(sentences('Voir p. 42 pour la suite. Ensuite, cf. l’annexe.'), [
    'Voir p. 42 pour la suite.',
    'Ensuite, cf. l’annexe.',
  ])
  assert.deepEqual(sentences('J. Rousseau écrit. Mme de Staël répond.'), [
    'J. Rousseau écrit.',
    'Mme de Staël répond.',
  ])
  assert.deepEqual(sentences('Le ratio est de 3.14 environ. Voilà.'), [
    'Le ratio est de 3.14 environ.',
    'Voilà.',
  ])
  // etc. is protected, so the following sentence stays attached on purpose.
  assert.deepEqual(sentences('Des pommes, des poires, etc. Et puis rien.'), [
    'Des pommes, des poires, etc. Et puis rien.',
  ])
})

test('a paragraph without terminal punctuation is still exactly one sentence', () => {
  assert.deepEqual(sentences('Titre sans point'), ['Titre sans point'])
  assert.deepEqual(sentences('Premier.\n\nSans point final'), ['Premier.', 'Sans point final'])
})

test('non-breaking spaces and trailing whitespace never leak into anchors', () => {
  const source = '  Bonjour\u00a0!  Comment\u00a0?  '
  const [paragraph] = segmentSource(source)
  assert.deepEqual(paragraph.sentences.map((s) => s.text), ['Bonjour\u00a0!', 'Comment\u00a0?'])
  for (const sentence of paragraph.sentences) {
    assert.equal(source.slice(sentence.start, sentence.end), sentence.text)
  }
})

test('findAnchor resolves paragraphs and sentences and rejects everything else', () => {
  const paragraphs = segmentSource('Un. Deux.\n\nTrois.')
  assert.equal(findAnchor(paragraphs, 'p1')?.text, 'Un. Deux.')
  assert.equal(findAnchor(paragraphs, 'p1.s2')?.text, 'Deux.')
  assert.equal(findAnchor(paragraphs, 'p2.s1')?.text, 'Trois.')
  for (const invalid of ['', 'p0', 'p3', 'p1.s3', 'x1', 'p1.s', '  p1']) {
    assert.equal(findAnchor(paragraphs, invalid), undefined, `expected ${invalid} to be unknown`)
  }
})
