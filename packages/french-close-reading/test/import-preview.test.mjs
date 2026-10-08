import test from 'node:test'
import assert from 'node:assert/strict'

import { previewImport } from '../lib/import-preview.js'
import { createBacking, ids, openController, passageRequest, signal } from './support/harness.mjs'
import { FRENCH_READER_DOMAIN } from '../lib/domain.js'
import { buildFrenchReaderTool } from '../lib/tools.js'

const codes = (preview) => preview.flags.map((flag) => flag.code)

test('a clean source previews its boundaries and raises nothing', () => {
  const preview = previewImport({
    title: 'Pascal',
    sourceText: 'Le cœur a ses raisons.\n\n— Mais lequel ? — Le nôtre, dit-il.',
  })
  assert.equal(preview.paragraphs, 2)
  assert.equal(preview.sentences, 3, 'the dialogue dash still starts a sentence')
  assert.deepEqual(preview.blocks.map((block) => block.id), ['p1', 'p2'])
  assert.deepEqual(preview.flags, [])
  assert.equal(preview.head.startsWith('Le cœur'), true)
})

test('encoding damage is an error, not a style note', () => {
  const preview = previewImport({ title: '', sourceText: 'Le cÅ“ur a ses raisons.' })
  const mojibake = preview.flags.find((flag) => flag.code === 'mojibake')
  assert.equal(mojibake.severity, 'error')
  assert.match(mojibake.detail, /编码损坏/u)

  const replacement = previewImport({ title: '', sourceText: 'Le c�ur a ses raisons.' })
  assert.equal(codes(replacement).includes('mojibake'), true)

  // The most common French case: é and œ read as Latin-1.
  for (const damaged of ['Le cÅ“ur a ses raisons.', 'Jâ€™ai dit Ã  voix haute.']) {
    assert.equal(codes(previewImport({ title: '', sourceText: damaged })).includes('mojibake'), true, damaged)
  }
  const bom = previewImport({ title: '', sourceText: '\uFEFFLe c\u0153ur a ses raisons.' })
  assert.equal(codes(bom).includes('byte-order-mark'), true)
  assert.equal(bom.flags.find((flag) => flag.code === 'byte-order-mark').severity, 'error')
  // Legitimate French accents must not be mistaken for damage.
  for (const clean of ['Il se promène â âme reposée.', 'Ça et là, des éclats.']) {
    assert.equal(codes(previewImport({ title: '', sourceText: clean })).includes('mojibake'), false, clean)
  }
})

test('an empty import is refused before anything is stored', () => {
  const preview = previewImport({ title: '', sourceText: '   \n\n  ' })
  const empty = preview.flags.find((flag) => flag.code === 'empty')
  assert.equal(empty.severity, 'error')
  assert.equal(preview.paragraphs, 0)
})

test('typography and boundaries are reported as hints the reader judges', () => {
  const preview = previewImport({
    title: '',
    sourceText: 'Il dit : « Va-t’en.\n\ncoeur  à  coeur\u00a0!  \n',
  })
  const found = codes(preview)
  assert.equal(found.includes('unbalanced-guillemets'), true, 'one « without »')
  assert.equal(found.includes('ligature-missing'), true, 'coeur written without the ligature')
  assert.equal(found.includes('non-breaking-space'), true)
  assert.equal(found.includes('double-space'), true)
  assert.equal(found.includes('trailing-whitespace'), true)
  assert.equal(preview.flags.every((flag) => flag.code === 'empty' || flag.severity === 'hint'), true)
})

test('a long paragraph and a truncated tail are called out', () => {
  const long = previewImport({ title: '', sourceText: `${'mot '.repeat(300)}fin` })
  assert.equal(codes(long).includes('paragraph-too-long'), true)
  assert.equal(codes(long).includes('no-terminal-punctuation'), true, 'the text ends without a stop')

  const complete = previewImport({ title: '', sourceText: 'Une phrase complète.' })
  assert.equal(codes(complete).includes('no-terminal-punctuation'), false)
})

test('the preview writes nothing, and the tool asks for confirmation before saving', async () => {
  const backing = createBacking()
  const opened = await openController(backing, FRENCH_READER_DOMAIN)
  const tool = buildFrenchReaderTool(opened.controller)

  const preview = await tool.execute({ action: 'preview', title: passageRequest.title, sourceText: passageRequest.sourceText })
  assert.equal(preview.ok, true)
  assert.equal(preview.detail.paragraphs, 2)
  assert.equal(preview.detail.errors, 0)
  assert.match(preview.detail.note, /Nothing was stored/u)
  assert.equal(backing.writes.length, 0, 'a preview never touches storage')

  const listing = await tool.execute({ action: 'list' })
  assert.equal(listing.detail.total, 0)

  // Confirming is the separate act that stores it.
  const saved = await tool.execute({
    action: 'save', id: ids.passage, title: passageRequest.title, sourceText: passageRequest.sourceText,
  })
  assert.equal(saved.detail.saved, true)
  assert.equal((await tool.execute({ action: 'list' })).detail.total, 1)
})

test('the preview reports an error for the damaged source the reader must fix first', async () => {
  const backing = createBacking()
  const opened = await openController(backing, FRENCH_READER_DOMAIN)
  const tool = buildFrenchReaderTool(opened.controller)
  const preview = await tool.execute({ action: 'preview', title: 'x', sourceText: 'Le cÅ“ur a ses raisons.' })
  assert.equal(preview.detail.errors, 1)
  assert.equal(backing.writes.length, 0)
})

test('the Remote preview is read-only and matches the tool preview', async () => {
  const backing = createBacking()
  const opened = await openController(backing, FRENCH_READER_DOMAIN)

  const damaged = await opened.controller.previewImport(
    { title: 'x', sourceText: 'Le cÅ“ur a ses raisons.' }, signal())
  assert.equal(damaged.paragraphs, 1)
  assert.equal(damaged.flags.some((flag) => flag.severity === 'error' && flag.code === 'mojibake'), true)

  const clean = await opened.controller.previewImport(
    { title: passageRequest.title, sourceText: passageRequest.sourceText }, signal())
  assert.equal(clean.paragraphs, 2)
  assert.equal(clean.sentences, 3)
  assert.deepEqual(clean.flags, [])
  assert.deepEqual(clean.blocks.map((block) => block.id), ['p1', 'p2'])
  assert.equal(backing.writes.length, 0, 'the Remote preview writes nothing either')

  // Invalid requests are refused before the preview runs.
  await assert.rejects(
    opened.controller.previewImport({ title: 'x', sourceText: '' }, signal()),
    (error) => error.code === 'gateway/bad-request',
  )
})
