import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { createBacking, openController, signal } from './support/harness.mjs'
import { FRENCH_READER_DOMAIN } from '../lib/domain.js'

/**
 * The domain version bump, checked against the reader's own store.
 *
 * Adding record kinds is additive, so every existing record must still satisfy the
 * schema — but that is a claim about real data, not about this repository's
 * fixtures. This test reads the actual storage directory when it exists and proves
 * three things:
 *
 * 1. every stored record still validates under the new spec, so opening the domain
 *    cannot reject the reader's library;
 * 2. every stored version stamp is one the backend accepts, and the accepted set is
 *    exactly `[version, ...compatibleVersions]` — the installed
 *    `dsh-storage-json` (`parseRecord`/`acceptedStamps`) discards a record stamped
 *    outside it, so this is the difference between "upgraded" and "22 files gone";
 * 3. the records open into a working controller, and the migration finds nothing to
 *    move.
 *
 * The directory is read only; nothing here writes to it. When it does not exist the
 * test skips rather than pretending to have checked.
 */
const STORE = join(homedir(), '.dsh', 'storages', 'french_reader', 'records')

/** Every per-record document: `{ version, record }` as the JSON backend writes it. */
function readStore() {
  const documents = []
  for (const file of readdirSync(STORE)) {
    if (!file.endsWith('.json')) continue
    documents.push({ file, document: JSON.parse(readFileSync(join(STORE, file), 'utf8')) })
  }
  return documents
}

test('every record in the real store still validates and is stamped acceptably', (t) => {
  if (!existsSync(STORE)) {
    t.skip(`no reader store at ${STORE}`)
    return
  }
  const documents = readStore()
  assert.ok(documents.length > 0, 'the store is not empty')

  const schema = FRENCH_READER_DOMAIN.tables.records.valueSchema
  const rejected = documents
    .map(({ file, document }) => ({ file, parsed: schema.safeParse(document.record) }))
    .filter((entry) => !entry.parsed.success)
    .map((entry) => `${entry.file}: ${entry.parsed.error.issues[0]?.message ?? 'invalid'}`)
  assert.deepEqual(rejected, [], 'a record the new schema rejects would take the whole domain down on open')

  // The accepted stamps, exactly as the installed per-record backend computes them:
  // current version plus the declared compatible versions, and nothing else.
  const accepted = [FRENCH_READER_DOMAIN.version, ...(FRENCH_READER_DOMAIN.compatibleVersions ?? [])]
  const stamps = new Set(documents.map(({ document }) => document.version))
  for (const stamp of stamps) {
    assert.ok(accepted.includes(stamp), `stamp ${String(stamp)} is accepted by the backend`)
  }
  assert.ok(stamps.has(1), 'the store carries version 1 documents, which is what the bump must keep readable')
  assert.ok(accepted.includes(1), 'compatibleVersions lists 1; without it every existing record would read as absent')

  // And the failure this guards against, stated so a future edit cannot drop it
  // quietly: at version 2 with no compatible versions, every pre-bump record is
  // foreign. (Records written by the current code carry the current stamp and
  // coexist here legitimately — the corpus the bump must keep is version 1.)
  const withoutCompatibility = [FRENCH_READER_DOMAIN.version]
  const discarded = documents.filter(({ document }) => !withoutCompatibility.includes(document.version))
  const legacy = documents.filter(({ document }) => document.version === 1)
  assert.ok(legacy.length > 0, 'the pre-bump corpus is still here and must stay readable')
  assert.equal(discarded.filter(({ document }) => document.version === 1).length, legacy.length,
    'the whole pre-bump corpus would be discarded without the declaration')
})

test('the real records open into a working controller', async (t) => {
  if (!existsSync(STORE)) {
    t.skip(`no reader store at ${STORE}`)
    return
  }
  const backing = createBacking()
  const records = new Map()
  for (const { file, document } of readStore()) records.set(file.replace(/\.json$/u, ''), document.record)
  backing.tables.set('records', records)

  const opened = await openController(backing, FRENCH_READER_DOMAIN)
  const passages = await opened.controller.listPassages({ offset: 0, limit: 100 }, signal())
  assert.ok(passages.total > 0, 'the reader’s passages are readable after the version bump')
  for (const passage of passages.items) assert.ok(passage.title.length > 0)

  const grammar = await opened.controller.listGrammar(signal())
  assert.ok(grammar.entries.length > 0, 'accumulated grammar survives')

  const lexicon = await opened.controller.listLexicon(signal())
  assert.ok(lexicon.length > 0, 'the vocabulary library survives')

  // The migration is a no-op on a store that has no legacy manifest arrays; the
  // run must say so instead of writing a marker for work it did not do.
  const report = await opened.controller.migrateStoredRecords(signal())
  assert.equal(report.ran, false)
})
