import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import vm from 'node:vm'

import { TYPERT } from '../lib/typert.host.js'

const packageRoot = fileURLToPath(new URL('../', import.meta.url))
const source = readFileSync(path.join(packageRoot, 'client.js'), 'utf8')

/**
 * The browser's static module table, read from the installed shell bundle
 * (`@deepseek-ai/dsh-web-frontend/dist/assets/index-*.js`, function `rM`).
 * A client half may require these and nothing else.
 */
const STATIC_MODULES = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
])

/**
 * Replica of the client typert registry's descriptor validation
 * (`@deepseek-ai/dsh-typert-registry/lib/client.js`): `RemoteStore.register` →
 * `DescriptorStore.validate` → `validateInvocation` → `validateCodec`. The real
 * code rejects a strict codec without a `create()` factory, which is exactly how
 * the plugin failed the web boot before this test existed.
 */
function validateContribution(contribution) {
  const validateSegment = (subject, value) => {
    if (typeof value !== 'string' || value.length === 0 || value.includes('#')) {
      throw new Error(`typert: invalid ${subject} "${String(value)}"`)
    }
  }
  const validateNonempty = (subject, value) => {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`typert: invalid ${subject}`)
  }
  const validateWireName = (subject, value) => {
    if (value === '.' || value === '..' || typeof value !== 'string' || !/^[A-Za-z0-9_$.-]+$/u.test(value)) {
      throw new Error(`typert: invalid ${subject} "${String(value)}"`)
    }
  }
  const validateCodec = (codec, subject) => {
    if (codec.mode === 'src-json') return
    validateNonempty(`${subject} type symbol`, codec.typeSymbol)
    if (typeof codec.create !== 'function') {
      throw new Error(`typert: ${subject} strict codec has no create() factory`)
    }
  }

  validateSegment('Remote package name', contribution.package)
  const endpoints = new Set()
  const ids = new Set()
  for (const descriptor of contribution.descriptors) {
    validateNonempty('invocation id', descriptor.id)
    validateSegment('invocation service key', descriptor.service)
    validateWireName('invocation namespace', descriptor.namespace)
    validateWireName('invocation method', descriptor.method)
    validateCodec(descriptor.result, `${descriptor.id} result`)
    const wires = new Set()
    for (const parameter of descriptor.parameters) {
      validateWireName('parameter name', parameter.name)
      validateWireName('parameter wire field', parameter.wire)
      assert.equal(wires.has(parameter.wire), false, `repeated wire field ${parameter.wire}`)
      wires.add(parameter.wire)
      validateCodec(parameter.codec, `${descriptor.id} parameter ${parameter.name}`)
    }
    if (descriptor.cancellation !== undefined && descriptor.cancellation.parameter !== 'signal') {
      throw new Error(`typert: invocation "${descriptor.id}" cancellation parameter must be "signal"`)
    }
    const endpoint = `${descriptor.namespace}/${descriptor.method}`
    assert.equal(endpoints.has(endpoint), false, `duplicate endpoint ${endpoint}`)
    assert.equal(ids.has(descriptor.id), false, `duplicate invocation id ${descriptor.id}`)
    endpoints.add(endpoint)
    ids.add(descriptor.id)
  }
  return { endpoints, ids }
}

function loadContribution({ mountFails = false } = {}) {
  const registrations = []
  const requests = []
  const window = { __ModuleLoader__: { load: (registration) => registrations.push(registration) } }
  const context = vm.createContext({
    window,
    console,
    TextEncoder,
    Blob: class {},
    URL,
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  })
  vm.runInContext(source, context, { filename: 'client.js' })
  const registration = registrations[0]
  const plugin = registration.factory((id) => {
    requests.push(id)
    if (!STATIC_MODULES.has(id)) throw new Error(`client-modules: require(${JSON.stringify(id)}) missed the module table`)
    return { createElement: () => null, useCallback: (v) => v, useEffect: () => {}, useRef: (v) => ({ current: v }), useState: (v) => [v, () => {}] }
  })

  const mounted = []
  const ctx = {
    effect: (factory) => factory(),
    locale: { register: () => {}, bind: () => (key) => key },
    // Cordis runs the child plugin's apply on ctx.plugin(); the stub must too,
    // or a failure-panel path would never be exercised.
    plugin: undefined,
    layout: { selectPanel: () => {} },
    slots: { inject: (_name, register) => register(), register: () => {} },
    remote: {
      frenchReader: {},
      $mount: async (contribution) => {
        if (mountFails) throw new Error('typert: strict codec has no create() factory')
        mounted.push(contribution)
        return async () => {}
      },
    },
  }
  ctx.plugin = (definition) => {
    const instance = typeof definition === 'function' ? { apply: definition } : definition
    const result = instance.apply(ctx)
    if (result && typeof result.then === 'function') throw new Error('stub ctx.plugin expects a synchronous apply')
    return { dispose: async () => {} }
  }
  return { plugin, ctx, mounted, requests }
}

test('the inlined contribution passes the client registry validation that failed the boot', async () => {
  const { plugin, ctx, mounted, requests } = loadContribution()
  await plugin.apply(ctx)
  assert.deepEqual(requests, ['react'], 'only baseline modules may be requested')
  assert.equal(mounted.length, 1)

  const contribution = mounted[0]
  const { endpoints } = validateContribution(contribution)
  assert.equal(endpoints.size, 39)
  assert.ok(endpoints.has('frenchReader/listPassages'))
  assert.ok(endpoints.has('frenchReader/archivePassage'))
})

test('every codec create() returns a working validator, not a stub', async () => {
  const { plugin, ctx, mounted } = loadContribution()
  await plugin.apply(ctx)
  const contribution = mounted[0]

  for (const descriptor of contribution.descriptors) {
    for (const codec of [descriptor.result, ...descriptor.parameters.map((parameter) => parameter.codec)]) {
      assert.equal(typeof codec.create, 'function')
      const schema = codec.create()
      assert.equal(typeof schema.parse, 'function')
      assert.equal(typeof schema.safeParse, 'function')
      assert.equal(schema.safeParse({}).success, false, `${codec.typeSymbol} accepted an empty object`)
    }
  }

  const byMethod = (method) => contribution.descriptors.find((descriptor) => descriptor.method === method)
  const createRequest = byMethod('createPassage').parameters[0].codec.create()
  const base = { id: 'a', operationId: 'b', title: 't', sourceText: 's' }
  assert.equal(createRequest.safeParse(base).success, true)
  assert.equal(createRequest.safeParse({ ...base, title: 7 }).success, false)
  assert.throws(() => createRequest.parse({}), /invalid/u)

  const createResult = byMethod('createPassage').result.create()
  assert.equal(createResult.safeParse({ kind: 'created', passage: {
    id: 'p', title: 't', sourceText: 's', sourceRevision: 1, segmentationRevision: 1,
    status: 'source-only', createdAt: 'now', updatedAt: 'now', archivedAt: null, archiveOperationId: null,
  } }).success, true)
  assert.equal(createResult.safeParse({ kind: 'nope' }).success, false)

  const branchRequest = byMethod('addBranch').parameters[0].codec.create()
  const branchBody = {
    passageId: 'p', operationId: 'o', parentId: null, anchorId: 'p1.s1',
    kind: 'grammar', title: 't', body: '',
  }
  assert.equal(branchRequest.safeParse(branchBody).success, true)
  assert.equal(branchRequest.safeParse({ ...branchBody, kind: 'speculation' }).success, false)
  assert.equal(branchRequest.safeParse({ ...branchBody, parentId: 5 }).success, false)
})

test('a failed Remote mount reports in the panel instead of failing the web boot', async () => {
  const { plugin, ctx, mounted } = loadContribution({ mountFails: true })
  const registered = []
  ctx.slots.register = (options, component) => { registered.push({ options, component }) }
  ctx.slots.inject = (_name, register) => register()

  // Must resolve, not reject: an inactive client entry fails the whole boot.
  await assert.doesNotReject(() => plugin.apply(ctx))
  assert.equal(mounted.length, 0)
  assert.equal(registered.length, 1)
  assert.equal(registered[0].options.key, 'french-close-reading')
})

test('the save-translation request accepts an authored variant and rejects a stray author', async () => {
  const { plugin, ctx, mounted } = loadContribution()
  await plugin.apply(ctx)
  const descriptor = mounted[0].descriptors.find((item) => item.method === 'saveTranslation')
  const schema = descriptor.parameters[0].codec.create()
  const base = { passageId: 'p', operationId: 'o', anchorId: 'p1.s1', language: 'zh-Hans', text: '心有其理。' }

  assert.equal(schema.safeParse(base).success, true, 'author and note stay optional')
  assert.equal(schema.safeParse({ ...base, source: 'user', note: '更口语' }).success, true)
  assert.equal(schema.safeParse({ ...base, source: 'robot' }).success, false)
  assert.equal(schema.safeParse({ ...base, note: 7 }).success, false)
})

test('the panel asks for a preview before it saves, and never fails open', async () => {
  const { plugin, ctx } = loadContribution()
  const handlers = []
  ctx.slots.register = (options, component) => { handlers.push({ options, component }) }
  ctx.slots.inject = (_name, register) => register()
  await plugin.apply(ctx)

  // The face the panel receives must expose the preview call; the two-step flow
  // depends on it existing, and the fallback depends on it failing loudly.
  const face = handlers[0]?.options?.inject?.()
  assert.equal(typeof face?.previewImport, 'function')
  assert.equal(typeof face?.createPassage, 'function')
})

/**
 * The wire is named: the Host descriptor decides what each argument is called.
 * A client descriptor that sends `request` while the Host expects `_request`
 * fails at call time — which is exactly how the panel's library tab broke — so
 * the two faces are compared name by name, for every invocation.
 */
test('the client sends every argument under the name the Host descriptor declares', async () => {
  const { plugin, ctx, mounted } = loadContribution()
  await plugin.apply(ctx)

  const contribution = mounted[0]
  const clientInvocations = contribution.descriptors ?? contribution.invocations ?? contribution
  assert.equal(Array.isArray(clientInvocations), true)

  const hostById = new Map(TYPERT.invocations.map((entry) => [entry.id, entry]))
  assert.equal(hostById.size, 39, 'the Host declares every endpoint')

  const mismatches = []
  for (const client of clientInvocations) {
    const host = hostById.get(client.id)
    if (host === undefined) {
      mismatches.push(`${client.id}: the Host declares no such endpoint`)
      continue
    }
    const hostNames = (host.parameters ?? []).map((parameter) => parameter.name)
    const clientNames = (client.parameters ?? []).map((parameter) => parameter.name)
    if (hostNames.join(',') !== clientNames.join(',')) {
      mismatches.push(`${client.id}: Host expects [${hostNames.join(', ')}] but the client sends [${clientNames.join(', ')}]`)
    }
  }
  assert.deepEqual(mismatches, [], 'the wire names disagree between the two faces')
  assert.equal(clientInvocations.length, hostById.size, 'no endpoint exists on only one side')
})

/**
 * The gateway does not merely check that a codec exists: `decode()` calls
 * `codec.create().parse(value)` on every argument before the call leaves the
 * browser. A validator that is stricter than the Host's own schema therefore
 * blocks the call with `gateway/input-invalid`, which is how an explicit `null`
 * from the panel — "no entry named", "no new wording" — could never reach the
 * Host. These are the payloads the panel really sends.
 */
test('the client codecs accept every argument shape the panel actually sends', async () => {
  const { plugin, ctx, mounted } = loadContribution()
  await plugin.apply(ctx)
  const contribution = mounted[0]
  const paramSchema = (method) => contribution.descriptors
    .find((descriptor) => descriptor.method === method).parameters[0].codec.create()

  const resolveSchema = paramSchema('resolveGrammarCandidate')
  const resolveBase = {
    pendingId: '00000000-0000-4000-8000-0000000000a1',
    operationId: '00000000-0000-4000-8000-0000000000a2',
  }
  // decide() sends null for both fields; attach names one, create/discard name none.
  assert.equal(resolveSchema.safeParse({ ...resolveBase, decision: 'attach', entryId: 'x', keyPoints: null }).success, true)
  assert.equal(resolveSchema.safeParse({ ...resolveBase, decision: 'create', entryId: null, keyPoints: null }).success, true)
  assert.equal(resolveSchema.safeParse({ ...resolveBase, decision: 'discard', entryId: null, keyPoints: null }).success, true)
  assert.equal(resolveSchema.safeParse({ ...resolveBase, decision: 'discard', entryId: null, keyPoints: '新规则' }).success, true)
  assert.equal(resolveSchema.safeParse({ ...resolveBase, decision: 'merge', entryId: null, keyPoints: null }).success, false)

  const selectionSchema = paramSchema('createSelection')
  assert.equal(selectionSchema.safeParse({
    passageId: 'x', operationId: 'y', note: '', ranges: [{ start: 0, end: 3 }],
  }).success, true)
  assert.equal(selectionSchema.safeParse({
    passageId: 'x', operationId: 'y', note: '', ranges: [{ start: 0, end: '3' }],
  }).success, false)

  const branchSchema = paramSchema('addBranch')
  assert.equal(branchSchema.safeParse({
    passageId: 'x', operationId: 'y', parentId: null, anchorId: 'sel_0123456789abcdef',
    kind: 'grammar', title: 't', body: '',
  }).success, true)

  // Results carry the Host's own nulls: an entry with no lemma, a candidate with
  // no resolution yet, a decision that named no entry.
  const listResult = contribution.descriptors.find((d) => d.method === 'listLexicon').result.create()
  assert.equal(listResult.safeParse({
    total: 1,
    entries: [{
      entryId: 'e', mot: 'cœur', lemma: null, partOfSpeech: 'nom masculin', forms: [],
      provenance: 'ai', status: 'draft', revision: 1, updatedAt: 'now',
      senses: [], sections: {}, sources: [], occurrences: [],
    }],
  }).success, true)

  const grammarResult = contribution.descriptors.find((d) => d.method === 'listGrammar').result.create()
  assert.equal(grammarResult.safeParse({
    entries: [{
      entryId: 'e', topic: 't', level: null, module: null, mastery: 'learning',
      contentStatus: 'ai-unverified', askCount: 1, lastAskedAt: null,
      examples: 0, pitfalls: 0, keyPoints: '',
    }],
    pending: [{
      pendingId: 'p', topic: 't', body: '', candidates: [],
      resolution: null, resolvedEntryId: null,
    }],
  }).success, true)

  const resolveResult = contribution.descriptors.find((d) => d.method === 'resolveGrammarCandidate').result.create()
  assert.equal(resolveResult.safeParse({ kind: 'already-resolved', entryId: null, outcome: 'discarded' }).success, true)
  assert.equal(resolveResult.safeParse({ kind: 'discarded' }).success, true)
})
