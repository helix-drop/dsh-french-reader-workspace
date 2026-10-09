import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

/**
 * The reading pane, checked against the prototype's interaction model.
 *
 * `french-frontend-port-spec.md` is the checklist: the reader's rule is that a frontend
 * which does not reproduce the prototype's interaction is not accepted. This file pins
 * the parts of that model which live in the source pane, so a later edit cannot quietly
 * drop them.
 */
const packageRoot = fileURLToPath(new URL('../', import.meta.url))
const source = readFileSync(path.join(packageRoot, 'client.js'), 'utf8')
// The prototype never leaves `data-view="focus"`, which hides `readerPane`; the
// sentences the reader meets are the rows of the navigation cards, so that is where
// these interactions must live (spec §11a).
// The sentence rows are their own renderer, so the row assertions read from there and the
// card assertions from the card itself.
const navCard = source.slice(source.indexOf('function navCard('), source.indexOf('function paragraphBlock('))
const navRow = source.slice(source.indexOf('function navSentenceRow('), source.indexOf('function navCard('))

test('a paragraph carries the prototype\'s label line, and only the focused one is marked', () => {
  // The prototype's own card markup: `.paragraphHeading` with `段落 N`, and a row per
  // sentence whose ordinal lives in `.lineNumber`.
  assert.match(navCard, /className: 'paragraphHeading'/u)
  assert.match(navCard, /format\(t, 'paragraphLabel'/u)
  assert.match(navRow, /className: 'lineNumber'/u)
  assert.match(navRow, /String\(rowIndex \+ 1\)\.padStart\(2, '0'\)/u)
  // Positions come from the prototype's constants, not from document order.
  assert.match(source, /const NAV_ROW_HEIGHT = 215/u)
  assert.match(source, /left: '30px', top: `\$\{top\}px`/u)
})

test('clicking a sentence refuses to move the focus while text is selected', () => {
  // The prototype guards exactly this, so a drag-select across sentences survives.
  assert.match(navRow, /if \(navPanned\(\)\) return/u, 'a pan must not select a sentence')
  assert.match(navRow, /if \(window\.getSelection\(\)\?\.toString\(\)\.trim\(\)\) return/u,
    'a drag-select must not move the focus')
})

test('unavailable audio controls are absent from ordinary reading and route rows', () => {
  // Without an audio provider, disabled per-sentence buttons are noise rather than
  // capability. Keep this honest by not rendering controls until an action works.
  assert.doesNotMatch(navRow, /sentenceAudioMini|audioGenerate|audioRegenerateShort|audioReserved/u)
  assert.doesNotMatch(source, /function requestSentenceAudio\(/u)
  const readingActions = source.slice(source.indexOf("className: 'readingActions'"), source.indexOf("className: 'branchStrip'"))
  assert.doesNotMatch(readingActions, /audioNotWired|audioGenerate/u)
})

test('only the paragraphs the prototype shows are rendered', () => {
  // Spec §11a: `focus` is the only view the prototype ever sets, and it hides
  // `readerPane` and `graphPane`, so rendering them would be a departure.
  const shell = source.slice(source.indexOf('function readingShell(passage)'))
  assert.match(shell, /className: 'top compactTop'/u)
  assert.match(shell, /className: 'workspace', 'data-view': 'focus'/u)
  assert.match(shell, /className: `navigation\$\{navOpen \? '' : ' closed'\}`/u)
  assert.match(shell, /className: `pane detailPane/u)
  assert.equal(shell.includes("'pane readerPane'"), false, 'readerPane is not rendered')
  assert.equal(shell.includes("'pane graphPane'"), false, 'graphPane is not rendered')
})

test('both dictionaries carry the new labels, and neither repeats a key', () => {
  const zh = /\n    const zh = \{([\s\S]*?)\n    \}\n/u.exec(source)
  const en = /\n    const en = \{([\s\S]*?)\n    \}\n/u.exec(source)
  assert.notEqual(zh, null)
  assert.notEqual(en, null)
  for (const [name, body] of [['zh', zh[1]], ['en', en[1]]]) {
    const keys = [...body.matchAll(/(?:^|\s)([A-Za-z][A-Za-z0-9_]*):\s*['"]/gu)].map((match) => match[1])
    const seen = new Set()
    const duplicates = keys.filter((key) => (seen.has(key) ? true : (seen.add(key), false)))
    assert.deepEqual(duplicates, [], `${name} has no duplicate key`)
    for (const key of ['analyseThisSentence', 'viewAnalysis', 'paragraphLabel', 'sentenceMark']) {
      assert.equal(seen.has(key), true, `${name} defines ${key}`)
    }
  }
})
