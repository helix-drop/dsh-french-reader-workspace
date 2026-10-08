import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { Context } from '@deepseek-ai/cordis'

import { FRENCH_READER_DOMAIN } from '../lib/domain.js'
import { apply, inject, name } from '../lib/index.js'
import { createBacking, ids, passageRequest, signal } from './support/harness.mjs'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * A stand-in for the Host's context: only the services this plugin injects, plus
 * a record of what it registered and what it asked to be cleaned up.
 */
function fakeContext(backing) {
  const generation = backing.facility()
  const tools = new Map()
  const disposers = []
  // A real Context, because the controller mounts its Remote face through the
  // framework and needs the framework's own methods (provide, effect).
  const ctx = new Context()
  let closes = 0
  let opens = 0
  ctx.storageDomain = {
    open: async (domain) => {
      opens += 1
      const handle = await generation.facility.open(domain)
      const close = handle.close.bind(handle)
      handle.close = async () => {
        closes += 1
        return close()
      }
      return handle
    },
  }
  ctx.tools = {
    register(tool) {
      tools.set(tool.name, tool)
      return () => tools.delete(tool.name)
    },
  }
  const frameworkEffect = ctx.effect.bind(ctx)
  ctx.effect = (callback, label) => {
    const disposer = frameworkEffect(callback, label)
    if (typeof disposer === 'function') disposers.push(disposer)
    return disposer
  }
  ctx.logger = { warn: () => {}, error: () => {} }
  return {
    ctx,
    tools,
    events: generation.events,
    opens: () => opens,
    closes: () => closes,
    /** Dispose the way the Host does when the plugin unloads. */
    dispose: () => {
      for (const disposer of disposers.reverse()) {
        if (typeof disposer === 'function') disposer()
      }
    },
  }
}

/**
 * The Host composition is not guaranteed to carry every optional service. A
 * missing `llm` or `web` must make generation and fetching *unavailable*, never
 * make the plugin fail to load — a plugin that throws in `apply` takes its panel
 * and its tool with it.
 */
test('the plugin loads when the optional generation and web services are absent', async () => {
  const backing = createBacking()
  const host = fakeContext(backing)
  // `fakeContext` installs storageDomain and tools only: exactly the services
  // this plugin declares as hard dependencies.
  assert.equal(host.ctx.get('llm'), undefined)
  assert.equal(host.ctx.get('web'), undefined)

  await assert.doesNotReject(() => apply(host.ctx))
  assert.equal(host.tools.has('french_reader'), true, 'the tool is registered anyway')

  const listed = await host.tools.get('french_reader').execute({ action: 'backends' })
  assert.equal(listed.ok, true)
  const dsh = listed.detail.backends.find((entry) => entry.backend === 'dsh')
  assert.equal(dsh.available, false, 'a missing llm service is reported, not assumed')
  assert.equal(dsh.reason, 'llm-unavailable')

  const agy = listed.detail.backends.find((entry) => entry.backend === 'agy')
  assert.equal(agy.available, false)
  assert.equal(agy.reason, 'subprocess-unavailable')

  host.dispose()
})

test('a fetch with no web service is refused with a reason, never with a crash', async () => {
  const backing = createBacking()
  const host = fakeContext(backing)
  await apply(host.ctx)
  await callTool(host, {
    action: 'save', title: 'T', sourceText: 'Il faut cultiver notre jardin.',
    id: ids.passage, operationId: ids.source,
  })
  const stored = await callTool(host, {
    action: 'mot', mot: 'cœur', partOfSpeech: 'nom', create: true, definition: '心。',
  })
  const fetched = await callTool(host, {
    action: 'fetchSource', entryId: stored.detail.entryId, source: 'cnrtl',
    section: 'etymology', mot: 'cœur',
  })
  assert.equal(fetched.ok, false)
  assert.equal(fetched.detail.reason, 'web-unavailable')
  host.dispose()
})

const toolHost = (backing) => fakeContext(backing)
const callTool = (host, args) => host.tools.get('french_reader').execute(args)

test('the plugin declares the services it needs and nothing else', () => {
  assert.equal(name, 'french-close-reading')
  assert.deepEqual([...inject].sort(), ['storageDomain', 'tools', 'typertGateway'])
})

test('applying the plugin registers one tool and opens the domain', async () => {
  const backing = createBacking()
  const host = toolHost(backing)
  await apply(host.ctx)

  assert.equal(host.tools.size, 1)
  const tool = host.tools.get('french_reader')
  assert.equal(tool.name, 'french_reader')
  assert.equal(typeof tool.execute, 'function')
  assert.equal(host.opens(), 1, 'the plugin opened exactly one domain generation')
  assert.equal(host.closes(), 0, 'nothing is closed while the plugin is live')

  const saved = await callTool(host, {
    action: 'save', id: ids.passage, title: passageRequest.title, sourceText: passageRequest.sourceText,
  })
  assert.equal(saved.detail.saved, true)
  host.dispose()
})

test('unloading releases the storage domain exactly once', async () => {
  const backing = createBacking()
  const host = toolHost(backing)
  await apply(host.ctx)
  await callTool(host, {
    action: 'save', id: ids.passage, title: passageRequest.title, sourceText: passageRequest.sourceText,
  })

  host.dispose()
  assert.equal(host.closes(), 1, 'the domain was closed on unload')

  // Disposing twice must not close it twice: a double close would mean the
  // cleanup was registered more than once.
  host.dispose()
  assert.equal(host.closes(), 1, 'disposal is idempotent')

  // A restart opens a fresh generation over the same medium.
  const second = toolHost(backing)
  await apply(second.ctx)
  assert.equal(second.opens(), 1)
  const listed = await callTool(second, { action: 'list' })
  assert.equal(listed.detail.total, 1, 'the library is still there after the reload')
  second.dispose()
  assert.equal(second.closes(), 1)
})

test('a restart keeps the library: a second apply over the same medium sees it', async () => {
  const backing = createBacking()
  const first = toolHost(backing)
  await apply(first.ctx)
  await callTool(first, {
    action: 'save', id: ids.passage, title: passageRequest.title, sourceText: passageRequest.sourceText,
  })
  await callTool(first, { action: 'read', passageId: ids.passage })
  await callTool(first, {
    action: 'branch', passageId: ids.passage, anchorId: 'p1.s1', kind: 'note',
    title: '重启前的注记', body: '这一条必须活过重启。',
  })
  first.dispose()

  const second = toolHost(backing)
  await apply(second.ctx)
  const listed = await callTool(second, { action: 'list' })
  assert.equal(listed.detail.total, 1, 'the passage survived the restart')

  const analysis = await callTool(second, { action: 'analysis', passageId: ids.passage })
  assert.equal(analysis.detail.branches.length, 1)
  assert.equal(analysis.detail.branches[0].title, '重启前的注记')
  assert.equal(analysis.detail.branches[0].anchorStatus, 'resolved', 'the anchor still resolves after a restart')
  second.dispose()
})

test('the plugin only imports its own files, DSH services, and zod', async () => {
  const sources = (await readdir(join(packageRoot, 'src'))).filter((file) => file.endsWith('.ts'))
  assert.equal(sources.length > 5, true, 'the entry really does have sources to check')

  const offenders = []
  for (const file of sources) {
    const text = await readFile(join(packageRoot, 'src', file), 'utf8')
    for (const match of text.matchAll(/^\s*(?:import|export)[^'"\n]*from\s+['"]([^'"]+)['"]/gmu)) {
      const specifier = match[1]
      const allowed = specifier.startsWith('.')
        || specifier === 'zod'
        || specifier.startsWith('@deepseek-ai/')
        || specifier.startsWith('node:')
      if (!allowed) offenders.push(`${file}: ${specifier}`)
    }
  }
  assert.deepEqual(offenders, [], 'no plugin file reaches outside its package, the DSH services, or zod')
})

test('the plugin never writes into the DSH application or the profile', async () => {
  const sources = (await readdir(join(packageRoot, 'src'))).filter((file) => file.endsWith('.ts'))
  const forbidden = /app\.asar|Application Support|\.dsh\/profiles|cordis\.patch|Resources\/app/u
  const hits = []
  for (const file of [...sources, '..']) {
    if (file === '..') break
    const text = await readFile(join(packageRoot, 'src', file), 'utf8')
    if (forbidden.test(text)) hits.push(file)
  }
  assert.deepEqual(hits, [], 'storage goes through the injected domain facility only')
  assert.equal(FRENCH_READER_DOMAIN.name, 'french_reader')
  assert.equal(signal().aborted, false)
})
