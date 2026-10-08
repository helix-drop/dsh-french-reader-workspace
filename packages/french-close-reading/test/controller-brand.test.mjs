import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { Context } from '@deepseek-ai/cordis'

import { createBacking, ids, openController, passageRequest, signal } from './support/harness.mjs'
import { FRENCH_READER_DOMAIN } from '../lib/domain.js'

/**
 * The controller is a decorated class, and a live run failed with
 *
 *   Cannot read private member #backends from an object whose class did not declare it
 *
 * A decorator lowers the class into a wrapper around the declared one, so a
 * `#field` it declares is brand-checked against the wrapper's instances and the
 * check fails. These tests hold that lesson in place: instance state lives in a
 * side table, and reaching it must not depend on being the exact object the class
 * constructor produced.
 */
const here = path.dirname(fileURLToPath(import.meta.url))
const compiled = readFileSync(path.join(here, '..', 'lib', 'controller.js'), 'utf8')

const uuid = () => globalThis.crypto.randomUUID()

async function withPassage() {
  const backing = createBacking()
  const opened = await openController(backing, FRENCH_READER_DOMAIN)
  await opened.controller.createPassage(passageRequest, signal())
  return opened
}

/**
 * A stand-in for the wrapper: an object that inherits the controller's methods but
 * is not the object its constructor made. A `#field` read through it throws; a
 * side table read does not.
 */
const throughWrapper = (controller) => Object.assign(Object.create(controller), {})

test('the decorated controller declares no private class field', () => {
  // Comments mention `#field` on purpose; only real syntax counts.
  const code = compiled
    .split('\n')
    .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
    .join('\n')
  const privateFields = code.match(/#[a-zA-Z_][a-zA-Z0-9_]*/gu) ?? []
  assert.deepEqual(
    privateFields, [],
    'a private field in a decorated class fails the brand check on the compiled wrapper',
  )
})

test('the generation surface works when reached through a wrapper, not only on the original', async () => {
  const { controller } = await withPassage()
  const wrapped = throughWrapper(controller)

  // Every one of these reads the instance state that used to be `#ctx`/`#backends`.
  const backends = wrapped.listBackends()
  assert.equal(Array.isArray(backends), true)
  assert.equal(backends.length >= 1, true, 'the backends are built from the side-table context')

  const models = await wrapped.listBackendModels('dsh', signal())
  assert.equal(Array.isArray(models.models), true)

  const sources = wrapped.listLexiconSourceKinds()
  assert.equal(sources.length > 0, true)
})

test('a fetch reached through a wrapper uses the side-table context', async () => {
  const { controller } = await withPassage()
  const created = await controller.createLexiconEntry({
    mot: 'ouvrir', partOfSpeech: 'verbe', lemma: null, forms: [], definition: '打开',
    label: '', provenance: 'ai', operationId: uuid(),
  }, signal())

  const wrapped = throughWrapper(controller)
  // The harness provides no `web` service, so this must come back as a refusal
  // *through* the context lookup rather than as a brand-check crash.
  const refused = await wrapped.fetchLexiconSource({
    entryId: created.entryId, source: 'cnrtl', section: 'etymology', mot: 'ouvrir',
  }, signal())
  assert.equal(refused.fetched, false)
  assert.equal(refused.reason, 'web-unavailable')
})

test('the ask path builds its backends from the same state', async () => {
  const { controller } = await withPassage()
  const wrapped = throughWrapper(controller)
  const branch = await wrapped.createDiscussionBranch({
    passageId: ids.passage, anchorId: 'p1.s1', kind: 'discussion', title: '讨论',
    parentId: null, forkedFrom: null, operationId: uuid(),
  }, signal())
  assert.equal(branch.created, true)

  // The compiled context needs the analysis store, the anchors and the branch:
  // all reached through state that must survive the wrapper.
  const preview = wrapped.previewAsk({
    passageId: ids.passage, branchId: branch.branchId, question: '这一句怎么读？',
    backend: 'agy', model: 'gemini-3.8-flash-medium',
  }, signal())
  assert.equal(preview.ok, true, preview.ok ? '' : preview.reason)
  assert.equal(preview.characters > 0, true)
})

test('a controller built without a backend list still reports the real backends', async () => {
  const backing = createBacking()
  const generation = backing.facility()
  const domain = await generation.facility.open(FRENCH_READER_DOMAIN)
  const { FrenchReaderController } = await import('../lib/controller.js')
  const controller = new FrenchReaderController(new Context(), domain)

  const backends = controller.listBackends()
  assert.deepEqual(backends.map((entry) => entry.backend), ['dsh', 'agy'])
  // With no services provided, each says so rather than pretending to work.
  assert.equal(backends[0].available, false)
  assert.equal(backends[0].reason, 'llm-unavailable')
  assert.equal(backends[1].available, false)
  assert.equal(backends[1].reason, 'subprocess-unavailable')
  await domain.close()
})
