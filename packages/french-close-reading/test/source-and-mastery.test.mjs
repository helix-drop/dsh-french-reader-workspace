import test from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'

import { FrenchReaderController } from '../lib/controller.js'
import { createBacking, ids, openController, passageRequest, signal } from './support/harness.mjs'
import { FRENCH_READER_DOMAIN } from '../lib/domain.js'
import { buildFrenchReaderTool } from '../lib/tools.js'
import {
  containsHeadword,
  extractText,
  fetchLexiconSource,
  listLexiconSources,
} from '../lib/source-fetch.js'

const uuid = () => globalThis.crypto.randomUUID()

/**
 * The exact page this machine received from CNRTL on 2026-10-06: 914 bytes of
 * markup whose entire text is "Portail lexical". It is kept verbatim because it is
 * the case that decides whether a card may claim a source.
 */
const MEASURED_CNRTL_STUB = '<!DOCTYPE html><html><head><title>Portail lexical</title></head>'
  + '<body><div id="conteneur"><h1>Portail lexical</h1></div></body></html>'

/**
 * A controller whose Host context carries a stubbed `ctx.web`, so the fetch path
 * is exercised end to end — endpoint included — without touching the network.
 */
function contextWithWeb(fetchImpl) {
  const ctx = new Context()
  // The seam is reached through `ctx.get('web')`, and a plain property assignment
  // is not visible to that lookup: the service has to be provided, which is what
  // the stub does here.
  ctx.provide('web', { fetch: fetchImpl })
  return ctx
}

async function openWithWeb(fetchImpl) {
  const backing = createBacking()
  const generation = backing.facility()
  const domain = await generation.facility.open(FRENCH_READER_DOMAIN)
  return { backing, controller: new FrenchReaderController(contextWithWeb(fetchImpl), domain), domain }
}

async function withEntry() {
  const backing = createBacking()
  const opened = await openController(backing, FRENCH_READER_DOMAIN)
  await opened.controller.createPassage(passageRequest, signal())
  const created = await opened.controller.createLexiconEntry({
    mot: 'ouvrir', partOfSpeech: 'verbe', lemma: 'ouvrir', forms: ['ouvre', 'ouvrait'],
    definition: '打开', label: '基本义', provenance: 'ai', operationId: uuid(),
  }, signal())
  assert.equal(created.created, true)
  return { backing, ...opened, tool: buildFrenchReaderTool(opened.controller), entryId: created.entryId }
}

test('only declared sources are requestable, and only for the fields they support', async () => {
  const { controller } = await withEntry()
  const kinds = controller.listLexiconSourceKinds()
  assert.equal(kinds.length > 0, true)
  for (const kind of kinds) assert.equal(kind.sections.length > 0, true, `${kind.source} declares what it may support`)

  // An invented source never reaches a request.
  const listed = await controller.listLexicon(signal())
  const invented = await controller.fetchLexiconSource({
    entryId: listed[0].entryId, source: 'example.com', section: 'etymology', mot: 'ouvrir',
  }, signal())
  assert.equal(invented.fetched, false)
  assert.equal(invented.reason, 'source-unknown')
})

test('a source cannot be recorded as support for a field it does not cover', async () => {
  let called = false
  const ctx = contextWithWeb(async () => { called = true; throw new Error('must not be reached') })
  const refused = await fetchLexiconSource(ctx, {
    source: 'cnrtl', section: 'conjugation', mot: 'ouvrir',
  }, signal())
  assert.equal(refused.fetched, false)
  assert.equal(refused.reason, 'section-not-supported-by-source')
  assert.equal(called, false, 'no request exists for an unsupported pairing')
})

test('the measured CNRTL page is recorded as a failed fetch, never as live data', async () => {
  const ctx = contextWithWeb(async () => ({
    url: 'https://www.cnrtl.fr/etymologie/ouvrir',
    statusCode: 200,
    body: { kind: 'html', content: MEASURED_CNRTL_STUB },
    truncated: false,
  }))
  const value = await fetchLexiconSource(ctx, { source: 'cnrtl', section: 'etymology', mot: 'ouvrir' }, signal())

  assert.equal(value.fetched, true)
  assert.equal(value.verdict.ok, false, 'an HTTP 200 with chrome only is not success')
  // The gate refuses on the first thing that fails, and on this page the headword
  // is not there at all. Either way the verdict is a failure with its reason, and
  // the important part is that it is never recorded as live data.
  assert.equal(value.fetch.entryFound, false, 'the headword is not on that page')
  assert.equal(value.verdict.outcome, 'not-found')
  assert.match(value.verdict.claim, /回退/u)
})

test('a real body for the requested word is recorded as supporting only that field', async () => {
  const page = '<html><body><h1>ouvrir</h1><p>Du latin <em>aperire</em>, par évolution phonétique.</p>'
    + `<p>${'Texte étymologique détaillé. '.repeat(6)}</p></body></html>`
  const ctx = contextWithWeb(async () => ({
    url: 'https://www.cnrtl.fr/etymologie/ouvrir',
    statusCode: 200,
    body: { kind: 'html', content: page },
    truncated: false,
  }))
  const value = await fetchLexiconSource(ctx, { source: 'cnrtl', section: 'etymology', mot: 'ouvrir' }, signal())

  assert.equal(value.verdict.ok, true)
  assert.equal(value.verdict.outcome, 'ok')
  assert.equal(value.fetch.entryFound, true)
  assert.doesNotMatch(value.fetch.body, /<[a-z]/iu, 'markup never reaches a quoted body')
  assert.match(value.verdict.claim, /仅支持本字段/u, 'a source supports its own section, not the card')
})

test('a page about another word is not a source for this word', async () => {
  const other = `<html><body><h1>ouvroir</h1><p>${'Un autre mot, avec du texte. '.repeat(5)}</p></body></html>`
  const ctx = contextWithWeb(async () => ({
    url: 'https://www.cnrtl.fr/definition/ouvrir',
    statusCode: 200,
    body: { kind: 'html', content: other },
    truncated: false,
  }))
  const value = await fetchLexiconSource(ctx, { source: 'cnrtl-definition', section: 'sense', mot: 'ouvrir' }, signal())
  assert.equal(value.fetch.entryFound, false, 'a near-miss is not a hit')
  assert.equal(value.verdict.ok, false)
  assert.equal(value.verdict.outcome, 'not-found')
})

test('a transport failure is reported as such instead of an invented status', async () => {
  const ctx = contextWithWeb(async () => { throw new Error('network unreachable') })
  const value = await fetchLexiconSource(ctx, { source: 'cnrtl', section: 'etymology', mot: 'ouvrir' }, signal())
  assert.equal(value.fetched, true)
  assert.equal(value.fetch.httpStatus, null, 'no status is invented')
  assert.equal(value.verdict.ok, false)
})

test('the headword check is a word match, not a substring match', () => {
  assert.equal(containsHeadword('voir ouvrir la porte', 'ouvrir'), true)
  assert.equal(containsHeadword('un ouvroir ancien', 'ouvrir'), false)
  assert.equal(containsHeadword('OUVRIR', 'ouvrir'), true)
  assert.equal(containsHeadword('cœur ouvert', 'cœur'), true)
})

test('script and style never leak into a quoted body', () => {
  const html = '<script>var secret = 1;</script><p>Du latin aperire.</p><style>p{color:red}</style>'
  const text = extractText(html)
  assert.doesNotMatch(text, /secret|color:red/u)
  assert.match(text, /aperire/u)
})

test('an unclosed script block is cut to the end rather than leaking code', () => {
  const text = extractText('<p>Du latin aperire.</p><script>var leaked = "x"')
  assert.doesNotMatch(text, /leaked/u)
})

test('the panel endpoint stores the attempt on the entry, success or failure', async () => {
  const { controller, entryId } = await withEntry()
  // The plugin has no `web` provider in this harness, so the fetch is refused
  // before any request; that refusal is a reason, not a recorded source.
  const refused = await controller.fetchLexiconSource({
    entryId, source: 'cnrtl', section: 'etymology', mot: 'ouvrir',
  }, signal())
  assert.equal(refused.fetched, false)
  assert.equal(refused.reason, 'web-unavailable')

  const listed = await controller.listLexicon(signal())
  assert.equal(listed[0].sources.length, 0, 'nothing is recorded when nothing was attempted')
})

test('the source kinds endpoint says what each source may support', async () => {
  const { controller, entryId } = await withEntry()
  const kinds = controller.listLexiconSourceKinds()
  const cnrtl = kinds.find((kind) => kind.source === 'cnrtl')
  assert.deepEqual(cnrtl.sections, ['etymology', 'semanticEvolution'])
  assert.equal(entryId !== undefined, true)
  assert.equal(listLexiconSources().length, kinds.length)
})

test('mastery moves only as the reader\'s own act, and is recorded as a version', async () => {
  const { controller } = await withEntry()
  const committed = await controller.commitRun({
    passageId: ids.passage, operationId: uuid(), anchorId: 'p1.s1',
    question: 'il faut 是什么结构？', answer: '无人称句。',
    intents: [{ kind: 'grammar', anchorId: 'p1.s1', title: '无人称句 il faut', body: 'il 为形式主语。' }],
  }, signal())
  assert.equal(committed.committed, true)
  const entry = (await controller.listGrammar(signal())).entries[0]
  assert.equal(entry.mastery, 'learning', 'the automatic path creates it as learning')

  const moved = await controller.setGrammarMastery({
    entryId: entry.id, mastery: 'known', expectedRevision: entry.revision, operationId: uuid(),
  }, signal())
  assert.equal(moved.updated, true)
  assert.equal(moved.previous, 'learning')
  assert.equal(moved.revision, entry.revision + 1)

  const after = (await controller.listGrammar(signal())).entries[0]
  assert.equal(after.mastery, 'known')
  assert.equal(after.keyPoints, entry.keyPoints, 'moving mastery does not touch the rule')
  assert.equal(after.askCount, entry.askCount, 'nor the counter')
})

test('mastery refuses a write based on a stale revision, and a repeat changes nothing', async () => {
  const { controller } = await withEntry()
  await controller.commitRun({
    passageId: ids.passage, operationId: uuid(), anchorId: 'p1.s1',
    question: 'q', answer: 'a',
    intents: [{ kind: 'grammar', anchorId: 'p1.s1', title: '关系代词 que', body: '规则。' }],
  }, signal())
  const entry = (await controller.listGrammar(signal())).entries[0]

  const first = await controller.setGrammarMastery({
    entryId: entry.id, mastery: 'reviewing', expectedRevision: entry.revision, operationId: uuid(),
  }, signal())
  assert.equal(first.updated, true)

  // A second write carrying the revision the caller last saw is stale now.
  const stale = await controller.setGrammarMastery({
    entryId: entry.id, mastery: 'known', expectedRevision: entry.revision, operationId: uuid(),
  }, signal())
  assert.equal(stale.updated, false)
  assert.equal(stale.reason, 'revision-conflict')
  assert.equal(stale.revision, entry.revision + 1, 'the actual revision is reported')
  assert.equal((await controller.listGrammar(signal())).entries[0].mastery, 'reviewing', 'the stale write changed nothing')

  const operationId = uuid()
  await controller.setGrammarMastery({
    entryId: entry.id, mastery: 'known', expectedRevision: null, operationId,
  }, signal())
  const retry = await controller.setGrammarMastery({
    entryId: entry.id, mastery: 'known', expectedRevision: null, operationId,
  }, signal())
  assert.equal(retry.alreadyUpdated, true, 'a retried decision is recognised, not re-applied')

  const same = await controller.setGrammarMastery({
    entryId: entry.id, mastery: 'known', expectedRevision: null, operationId: uuid(),
  }, signal())
  assert.equal(same.updated, false)
  assert.equal(same.reason, 'unchanged', 'setting the value it already has is not a change')
})

test('the automatic accumulation path still never touches mastery', async () => {
  const { controller } = await withEntry()
  const first = await controller.commitRun({
    passageId: ids.passage, operationId: uuid(), anchorId: 'p1.s1',
    question: 'q1', answer: 'a1',
    intents: [{ kind: 'grammar', anchorId: 'p1.s1', title: '无人称句 il faut', body: '规则。' }],
  }, signal())
  assert.equal(first.committed, true)
  const entry = (await controller.listGrammar(signal())).entries[0]
  await controller.setGrammarMastery({
    entryId: entry.id, mastery: 'known', expectedRevision: entry.revision, operationId: uuid(),
  }, signal())

  // A later question about the same point must not reset what the reader decided.
  await controller.commitRun({
    passageId: ids.passage, operationId: uuid(), anchorId: 'p1.s1',
    question: 'q2', answer: 'a2',
    intents: [{ kind: 'grammar', anchorId: 'p1.s1', title: '无人称句 il faut', body: '规则。', pitfall: 'il 不是实义主语。' }],
  }, signal())

  const after = (await controller.listGrammar(signal())).entries[0]
  assert.equal(after.mastery, 'known', 'the reader\'s own judgement survives a new question')
  assert.equal(after.askCount, 2)
})
