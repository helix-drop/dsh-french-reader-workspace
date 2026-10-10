import { Context } from '@deepseek-ai/cordis'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'

import { FrenchReaderController } from '../../lib/controller.js'

/**
 * In-memory kv medium shared by facility generations. Values cross a JSON
 * boundary and every unit instance reads the same backing maps, so a test can
 * prove persistence across a close/reopen cycle the way an app restart does.
 */
/**
 * @param options.failWrites - Simulate an unavailable medium.
 * @param options.schema - The record schema a real backend validates against.
 *   When supplied, a write that would not survive the next `open` is refused
 *   here, exactly as a real medium refuses it. The validation is optional only so
 *   tests that deliberately store shapes from an older build can skip it.
 */
export function createBacking({ failWrites = false, schema = null } = {}) {
  const tables = new Map()
  const writes = []
  let backingSchema = schema
  const unit = () => ({
    async loadAll() {
      const snapshot = {}
      for (const [table, records] of tables) snapshot[table] = Object.fromEntries(records)
      return { tables: snapshot, global: null }
    },
    async putRecord(table, key, value) {
      if (failWrites) throw new Error('medium unavailable')
      // A real backend stores what it is given and then fails validation on the
      // next open, taking the whole domain down with it. Failing at write time
      // instead is the difference between a test that catches a shape bug and a
      // test that hides one until a user restarts the app.
      if (backingSchema !== null && table === 'records') {
        const parsed = backingSchema.safeParse(value)
        if (!parsed.success) {
          const issue = parsed.error.issues[0]
          throw new Error(
            `medium rejected an invalid record at ${key}: `
            + `${issue === undefined ? 'unknown' : `${issue.path.join('.')}: ${issue.message}`}`,
          )
        }
      }
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
    /** Set by `openController`: the record schema the medium validates against. */
    set schema(value) { backingSchema = value },
    get schema() { return backingSchema },
    writesFor(key) {
      return writes.filter(([, , written]) => written === key).length
    },
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

/**
 * Open one domain generation and build a controller over it.
 * @param backing - Result of {@link createBacking}.
 * @param domain - Domain spec to open.
 * @param options.services - Host services to provide on the controller's
 *   context (e.g. `{ web: { fetch } }`), when the code under test needs one.
 * @param options.audio - The audio runtime seam: the `audio` config section and
 *   the transports it is reached through (`fetch`, `webSocket`, `env`). Tests
 *   inject fakes so no request ever leaves the process.
 * @returns The open domain, its controller, and the change events it emitted.
 */
export async function openController(
  backing,
  domain,
  { backends = null, validateWrites = true, services = {}, audio = null } = {},
) {
  // The schema is the real record union, so the medium refuses anything a real
  // backend would refuse on the next open.
  if (validateWrites) backing.schema = domain.tables.records.valueSchema
  const generation = backing.facility()
  const handle = await generation.facility.open(domain)
  // `backends` is the generation test seam: production builds the real DSH and
  // agy backends, a test injects one that answers inline and records its prompt.
  const ctx = new Context()
  for (const [name, service] of Object.entries(services)) ctx.provide(name, service)
  const controller = new FrenchReaderController(ctx, handle, backends, audio)
  return { domain: handle, controller, events: generation.events }
}

export const signal = () => new AbortController().signal

export const ids = {
  passage: '00000000-0000-4000-8000-0000000000a1',
  source: '00000000-0000-4000-8000-0000000000b1',
  translation: '00000000-0000-4000-8000-0000000000c1',
  branch1: '00000000-0000-4000-8000-0000000000d1',
  branch2: '00000000-0000-4000-8000-0000000000d2',
  branch3: '00000000-0000-4000-8000-0000000000d3',
}

export const passageRequest = {
  id: ids.passage,
  operationId: ids.source,
  title: 'La Bruyère · fragment',
  sourceText: 'Il faut cultiver notre jardin.\n\n— Mais lequel ? — Le nôtre, dit-il.',
}
