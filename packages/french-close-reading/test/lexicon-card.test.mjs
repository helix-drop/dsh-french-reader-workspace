import test from 'node:test'
import assert from 'node:assert/strict'

import { createBacking, ids, openController, passageRequest, signal } from './support/harness.mjs'
import { FRENCH_READER_DOMAIN } from '../lib/domain.js'
import { buildFrenchReaderTool } from '../lib/tools.js'

async function withEntry(partOfSpeech = 'verbe') {
  const backing = createBacking()
  const opened = await openController(backing, FRENCH_READER_DOMAIN)
  await opened.controller.createPassage(passageRequest, signal())
  const tool = buildFrenchReaderTool(opened.controller)
  const created = await tool.execute({
    action: 'mot', mot: 'ouvrir', partOfSpeech, create: true, lemma: 'ouvrir',
    definition: '打开。', label: '本义', forms: ['ouvre', 'ouvrait'],
  })
  return { backing, controller: opened.controller, tool, entryId: created.detail.entryId }
}

test('a fresh card renders in policy order and names the sections it is missing', async () => {
  const { tool } = await withEntry('verbe')
  const rendered = await tool.execute({ action: 'render', entryId: (await tool.execute({ action: 'lexicon' })).detail.entries[0].entryId })

  assert.equal(rendered.detail.found, true)
  assert.deepEqual(
    rendered.detail.sections.map((section) => section.number),
    ['§1', '§2', '§4', '§3a', '§3b', '§5', '§6', '§7'],
    'a verb card follows the verb order',
  )
  assert.match(rendered.detail.rendered, /§1 总览\n词形 ouvrir · 原形 ouvrir · 词性 verbe/)
  assert.match(rendered.detail.rendered, /§2 当前含义\n1\. 打开。（本义）/)
  // §6 and §7 are required: an empty one is an error, not a cosmetic gap.
  assert.equal(rendered.detail.errors.length, 2)
  assert.match(rendered.detail.errors.join(' '), /§6 文化语境 为空/u)
  assert.match(rendered.detail.errors.join(' '), /§7 固定表达 为空/u)
  // The gap is rendered as a gap rather than hidden behind a neat heading.
  assert.match(rendered.detail.rendered, /§6 文化语境\n（待补：该章节为空）/)
})

test('writing a section explicitly clears its error, and the policy re-checks', async () => {
  const { tool, entryId } = await withEntry('nom masculin')

  const filled = await tool.execute({
    action: 'section', entryId, section: 'culture', text: '未发现可靠关联。',
  })
  assert.equal(filled.detail.updated, true)
  assert.match(filled.detail.errors.join(' '), /§7 固定表达 为空/u, 'the remaining gap is still reported')

  const done = await tool.execute({
    action: 'section', entryId, section: 'fixedExpressions', text: 'ouvrir la porte',
  })
  assert.deepEqual(done.detail.errors, [])

  const rendered = await tool.execute({ action: 'render', entryId })
  // A noun card has no §4 and never gains one from a write.
  assert.equal(rendered.detail.sections.some((section) => section.number === '§4'), false)
  assert.match(rendered.detail.rendered, /§6 文化语境\n未发现可靠关联。/)
  assert.match(rendered.detail.rendered, /§7 固定表达\n｜ouvrir la porte/, '§7 renders as an unordered list')

  const unknown = await tool.execute({ action: 'section', entryId, section: 'invented', text: 'x' })
  assert.equal(unknown.ok, false)
  assert.equal(unknown.detail.reason, 'section-unknown')
})

test('a 200 response with only site chrome is recorded as a failed fetch', async () => {
  const { tool, entryId } = await withEntry()

  const chrome = await tool.execute({
    action: 'lexiconSource', entryId, section: 'etymology', kind: 'cnrtl',
    url: 'https://cnrtl.fr/etymologie/ouvrir', httpStatus: 200, body: 'Portail lexical',
    entryFound: true,
  })
  assert.equal(chrome.detail.recorded, true)
  assert.equal(chrome.detail.ok, false, 'HTTP 200 alone is not success')
  assert.equal(chrome.detail.outcome, 'body-missing')
  assert.match(chrome.detail.note, /按训练数据回退/u)

  const good = await tool.execute({
    action: 'lexiconSource', entryId, section: 'etymology', kind: 'cnrtl',
    url: 'https://cnrtl.fr/etymologie/ouvrir', httpStatus: 200, entryFound: true,
    body: 'Du latin aperire « ouvrir » ; le sens concret est attesté dès le XIIe siècle.',
  })
  assert.equal(good.detail.ok, true)
  assert.match(good.detail.note, /仅支持本字段/u)

  // Both attempts are kept, so the card shows what happened instead of hiding it.
  const analysis = await tool.execute({ action: 'mot', mot: 'ouvrir' })
  assert.equal(analysis.detail.entries[0].occurrences, 0)
  const rendered = await tool.execute({ action: 'render', entryId })
  assert.equal(rendered.detail.found, true)
})

test('a source cannot be recorded for an entry or section that does not exist', async () => {
  const { tool, entryId } = await withEntry()
  const unknownEntry = await tool.execute({
    action: 'lexiconSource', entryId: '00000000-0000-4000-8000-0000000000ff',
    section: 'etymology', body: 'whatever',
  })
  assert.equal(unknownEntry.ok, false)
  assert.equal(unknownEntry.detail.reason, 'entry-unknown')

  const unknownSection = await tool.execute({
    action: 'lexiconSource', entryId, section: 'not-a-section', body: 'whatever',
  })
  assert.equal(unknownSection.ok, false)
  assert.equal(unknownSection.detail.reason, 'section-unknown')
})

test('rendering does not mutate the entry it renders', async () => {
  const { tool, entryId, backing } = await withEntry()
  const before = backing.writes.length
  await tool.execute({ action: 'render', entryId })
  await tool.execute({ action: 'render', entryId, wantsEtymology: true })
  assert.equal(backing.writes.length, before, 'rendering is a read')
})

test('the Remote card view carries the policy verdict, not just the text', async () => {
  const { tool, entryId, controller } = await withEntry('verbe')

  const fresh = await controller.renderLexiconRemote({ entryId, wantsEtymology: false }, signal())
  assert.equal(fresh.kind, 'card')
  assert.deepEqual(fresh.sections.map((section) => section.number), ['§1', '§2', '§4', '§3a', '§3b', '§5', '§6', '§7'])
  assert.equal(fresh.errors.length, 2, '§6 and §7 are still missing, and the panel is told')
  assert.match(fresh.rendered, /（待补：该章节为空）/, 'the gap is visible in the rendered card')

  await tool.execute({ action: 'section', entryId, section: 'culture', text: '未发现可靠关联。' })
  await tool.execute({ action: 'section', entryId, section: 'fixedExpressions', text: 'ouvrir la porte' })
  const complete = await controller.renderLexiconRemote({ entryId, wantsEtymology: false }, signal())
  assert.deepEqual(complete.errors, [])
  assert.match(complete.rendered, /｜ouvrir la porte/)

  const missing = await controller.renderLexiconRemote(
    { entryId: '00000000-0000-4000-8000-0000000000ff', wantsEtymology: false }, signal())
  assert.equal(missing.kind, 'missing')

  await assert.rejects(
    controller.renderLexiconRemote({ entryId: 'not-a-uuid', wantsEtymology: false }, signal()),
    (error) => error.code === 'gateway/bad-request',
  )
})
