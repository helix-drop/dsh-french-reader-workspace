import test from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { DomainFacility, DomainError } from '@deepseek-ai/dsh-storage-domain'

import { FrenchReaderController } from '../lib/controller.js'
import { FRENCH_READER_DOMAIN } from '../lib/domain.js'

/**
 * A durable-enough in-memory kv medium shared by facility generations, so one
 * test can prove the record survives a full close/reopen cycle the way an app
 * restart does. Values cross a JSON boundary exactly like a real medium.
 */
function createBacking({ failWrites = false } = {}) {
  const tables = new Map()
  const writes = []
  const unit = () => ({
    async loadAll() {
      const snapshot = {}
      for (const [table, records] of tables) snapshot[table] = Object.fromEntries(records)
      return { tables: snapshot, global: null }
    },
    async putRecord(table, key, value) {
      if (failWrites) throw new Error('medium unavailable')
      writes.push(['put', table, key])
      const records = tables.get(table) ?? new Map()
      records.set(key, JSON.parse(JSON.stringify(value)))
      tables.set(table, records)
    },
    async deleteRecord(table, key) {
      writes.push(['delete', table, key])
      const records = tables.get(table)
      if (records === undefined || !records.has(key)) return false
      records.delete(key)
      return true
    },
    async close() {},
  })
  const backend = { kv: { open: async () => unit() } }
  return {
    tables,
    writes,
    /** A fresh facility over the same medium, as a restarted Host would build. */
    facility() {
      const events = []
      const ctx = {
        storage: { backend: { get: (name) => (name === 'memory' ? backend : undefined) } },
        logger: { warn: () => {}, error: () => {} },
        emit: (event, change) => events.push([event, change]),
      }
      return { facility: new DomainFacility(ctx, { backend: 'memory', routes: {} }), events }
    },
  }
}

const signal = () => new AbortController().signal

const firstRequest = {
  id: '00000000-0000-4000-8000-0000000000a1',
  operationId: '00000000-0000-4000-8000-0000000000b1',
  title: 'Pascal · fragment',
  sourceText: 'Le cœur a ses raisons que la raison ne connaît point.',
}

test('the real storage domain persists, reloads, and rejects writes after close', async () => {
  const backing = createBacking()
  const generation1 = backing.facility()
  const domain = await generation1.facility.open(FRENCH_READER_DOMAIN)
  const ctx = new Context()
  const controller = new FrenchReaderController(ctx, domain)

  const created = await controller.createPassage(firstRequest, signal())
  assert.equal(created.kind, 'created')
  assert.equal(created.passage.sourceText, firstRequest.sourceText)
  assert.deepEqual(backing.writes, [['put', 'records', firstRequest.id]])

  // Reopening one domain name while it is open is a caller bug, not a second handle.
  await assert.rejects(
    generation1.facility.open(FRENCH_READER_DOMAIN),
    (error) => error instanceof DomainError && error.code === 'already-open',
  )

  await domain.close()
  await assert.rejects(
    controller.listPassages({ offset: 0, limit: 10 }, signal()),
    (error) => error instanceof DomainError && error.code === 'closed',
  )

  // A new generation over the same medium sees the committed record.
  const generation2 = backing.facility()
  const reopened = await generation2.facility.open(FRENCH_READER_DOMAIN)
  const controller2 = new FrenchReaderController(new Context(), reopened)
  const restored = await controller2.getPassage({ id: firstRequest.id }, signal())
  assert.deepEqual(restored.passage, created.passage)

  const page = await controller2.listPassages({ offset: 0, limit: 10 }, signal())
  assert.equal(page.total, 1)
  assert.equal(page.items[0].excerpt.startsWith('Le cœur a ses raisons'), true)

  const backup = await controller2.exportPassages(signal())
  assert.equal(backup.passages[0].sourceText, firstRequest.sourceText)

  await reopened.close()
})

test('a successful write emits one change event and a failing medium changes nothing', async () => {
  const backing = createBacking()
  const generation = backing.facility()
  const domain = await generation.facility.open(FRENCH_READER_DOMAIN)
  const controller = new FrenchReaderController(new Context(), domain)

  await controller.createPassage(firstRequest, signal())
  const changes = generation.events.filter(([event]) => event === 'domain/changed')
  assert.equal(changes.length, 1)
  assert.equal(changes[0][1].operation, 'put')
  assert.equal(changes[0][1].table, 'records')
  assert.equal(changes[0][1].key, firstRequest.id)
  await domain.close()

  // Durability precedes the in-memory mutation: a rejected medium write leaves
  // no readable record and emits nothing.
  const failing = createBacking({ failWrites: true })
  const failingGeneration = failing.facility()
  const failingDomain = await failingGeneration.facility.open(FRENCH_READER_DOMAIN)
  await assert.rejects(failingDomain.table('records').put('probe', { value: 1 }))
  assert.equal(failingDomain.table('records').get('probe'), undefined)
  assert.equal(failingDomain.table('records').size, 0)
  assert.deepEqual(failingGeneration.events, [])
  await failingDomain.close()
})

test('a malformed stored record fails the open loudly with its location', async () => {
  const backing = createBacking()
  backing.tables.set('records', new Map([['broken', { kind: 'passage', recordVersion: 1, payload: { id: 'not-a-uuid' } }]]))
  const generation = backing.facility()
  await assert.rejects(
    generation.facility.open(FRENCH_READER_DOMAIN),
    (error) => error instanceof DomainError && error.code === 'invalid-record'
      && error.detail?.table === 'records' && error.detail?.key === 'broken',
  )
})
