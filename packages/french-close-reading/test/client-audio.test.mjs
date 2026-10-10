import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { webcrypto } from 'node:crypto'

import { createBacking, ids, openController, passageRequest, signal } from './support/harness.mjs'
import { FRENCH_READER_DOMAIN } from '../lib/domain.js'

/**
 * The audio surface, rendered and exercised.
 *
 * The four rules the reserved contracts state are all about *which call the panel
 * makes and when*, and none of them is visible in a pattern match: "unconfigured
 * must not synthesize", "a cached take must play without synthesizing", "a
 * regeneration appends a new version", "a failure keeps the previous take". So the
 * panel is really rendered — a React shim keeps per-component hook state, runs the
 * effects and flushes the promises — and the eight audio endpoints are stubs that
 * record what they were asked for.
 *
 * Playback is asserted through the browser seam the panel uses: `Blob` →
 * `URL.createObjectURL` → `<audio>`, with `playbackRate` taken from the take.
 */
const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')

/** The one immutable source every assertion below is about. */
const SENTENCE = 'Il faut cultiver notre jardin.'
const passage = {
  id: 'p-1', title: '第 3 章', sourceText: SENTENCE, sourceRevision: 1, segmentationRevision: 1,
  createdAt: '', updatedAt: '', archivedAt: null, archiveOperationId: null,
}
const segmentation = {
  passageId: passage.id, sourceRevision: 1, revision: 1,
  paragraphs: [{
    id: 'p1', text: SENTENCE, start: 0, end: SENTENCE.length,
    sentences: [{ id: 'p1.s1', paragraphId: 'p1', text: SENTENCE, start: 0, end: SENTENCE.length }],
  }],
}
const sentenceSource = {
  passageId: passage.id, sentenceId: 'p1.s1', sourceRevision: 1, sentenceRevision: 1,
  text: SENTENCE, language: 'fr',
}
const sourceKey = `${passage.id}|p1.s1|1|1`

const ok = (value) => ({ ok: true, value })

/**
 * A value built inside the vm realm is not the test realm's value: deep equality
 * compares prototypes, so everything that crossed the boundary is copied back
 * before it is compared.
 */
const rehome = (value) => JSON.parse(JSON.stringify(value))

/** A take exactly as `SentenceAudioTakeView` declares it. */
function take(overrides = {}) {
  return {
    takeId: 'take-1', requestId: 'request-1', source: sentenceSource,
    backend: { kind: 'tts', providerId: 'google', modelId: 'gemini-2.5-flash-preview-tts' },
    voice: { voiceId: null, rate: 1.25 }, previousTakeId: null, audioAssetId: 'audio_take-1',
    mimeType: 'audio/wav', durationMs: 1200, bytes: 2444, createdAt: '2026-01-01T00:00:00.000Z',
    selected: true, ...overrides,
  }
}

const configured = {
  configured: true, reason: null, message: null,
  backend: { kind: 'tts', providerId: 'google', modelId: 'gemini-2.5-flash-preview-tts' },
  streaming: false, cancellation: true, maxCharacters: 400,
}
const unconfigured = {
  configured: false, reason: 'no-api-key', message: '没有配置朗读密钥',
  backend: null, streaming: false, cancellation: false, maxCharacters: 400,
}

const listing = (takes, configuration = configured, selected = takes[0]?.takeId ?? null) =>
  ok({ sourceKey, takes, selectedTakeId: selected, configuration })

/**
 * The library the panel opens into: one passage, already segmented, with the
 * stored reading position pointing at its sentence. Each test overrides only the
 * audio endpoints it is about.
 */
const library = {
  listPassages: async () => ok({
    items: [{
      id: passage.id, title: passage.title, excerpt: SENTENCE,
      characterCount: SENTENCE.length, sourceRevision: 1, createdAt: '', updatedAt: '',
    }],
    offset: 0, total: 1, hasMore: false,
  }),
  getPassage: async () => ok({ passage }),
  getSegmentation: async () => ok({ segmentation }),
  listAnalysis: async () => ok({ analysis: { covered: [] } }),
  listDiscussion: async () => ok({ branches: [], conclusions: [] }),
  listBackends: async () => ok({ backends: [] }),
  listBackendModels: async () => ok({ models: [] }),
}

/**
 * The panel, rendered with a React shim that behaves like React where it matters.
 *
 * Hook state is kept per component identity — the path of React keys down the tree,
 * which is also how React itself decides whether a component is the same one — so a
 * re-render after a click sees the state the click set. Effects run when their
 * dependencies change, and every render round flushes the promise chains the
 * effects and handlers started before the tree is handed back.
 */
async function openPanel({ services = {}, mount = null } = {}) {
  const calls = []
  const slots = new Map()
  const seen = new Set()
  const pendingEffects = []
  const blobUrls = []
  const revoked = []
  const players = []
  let currentSlot = null
  let cursor = 0
  let dirty = false
  let component = null
  let props = null
  let dictionaries = { zh: {}, en: {} }

  const react = {
    createElement: (type, elementProps, ...children) => ({
      type,
      props: {
        ...(elementProps ?? {}),
        children: children.length === 0 ? undefined : children.length === 1 ? children[0] : children,
      },
    }),
    useState(initial) {
      const at = cursor++
      const slot = currentSlot
      if (!(at in slot.states)) slot.states[at] = typeof initial === 'function' ? initial() : initial
      return [slot.states[at], (next) => {
        const value = typeof next === 'function' ? next(slot.states[at]) : next
        if (Object.is(value, slot.states[at])) return
        slot.states[at] = value
        dirty = true
      }]
    },
    useRef(initial) {
      const at = cursor++
      const slot = currentSlot
      // `undefined` is preserved, as React preserves it: the panel distinguishes
      // "never initialised" (`=== undefined`) from "explicitly nothing".
      slot.refs[at] ??= { current: initial }
      return slot.refs[at]
    },
    useEffect(factory, deps) {
      const at = cursor++
      const slot = currentSlot
      const previous = slot.effects[at]
      const changed = previous === undefined || deps === undefined || deps === null
        || deps.length !== previous.deps.length
        || deps.some((value, index) => !Object.is(value, previous.deps[index]))
      if (changed) pendingEffects.push({ slot, at, factory, deps: deps ?? null })
    },
    useLayoutEffect(factory, deps) { react.useEffect(factory, deps) },
    // Memoised like React's, and — importantly — `useCallback` memoises the
    // function itself: the panel passes async functions to it, so calling the
    // factory (as `useMemo` does) would hand back a promise in its place. A
    // callback that changed identity on every render would also re-run every
    // effect that depends on it, which is an endless loop rather than a test.
    useCallback: (factory, deps) => memo(factory, deps, false),
    useMemo: (factory, deps) => memo(factory, deps, true),
    Component: class { constructor(componentProps) { this.props = componentProps; this.state = {} } },
  }

  function memo(factory, deps, invoke) {
    const at = cursor++
    const slot = currentSlot
    const previous = slot.memos[at]
    const changed = previous === undefined || deps === undefined || deps === null
      || deps.length !== previous.deps.length
      || deps.some((value, index) => !Object.is(value, previous.deps[index]))
    if (changed) slot.memos[at] = { deps: deps ?? null, value: invoke ? factory() : factory }
    return slot.memos[at].value
  }

  class FakeAudio {
    constructor(src) {
      this.src = src
      this.playbackRate = 1
      this.paused = true
      this.played = 0
      this.listeners = {}
      players.push(this)
    }
    addEventListener(type, handler) { this.listeners[type] = handler }
    removeEventListener(type) { delete this.listeners[type] }
    play() { this.paused = false; this.played += 1; return Promise.resolve() }
    pause() { this.paused = true }
    /** What the browser does when the take finishes. */
    end() { this.listeners.ended?.() }
  }

  const browser = {
    window: {
      __ModuleLoader__: { load: (registration) => { component = registration } },
      matchMedia: () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }),
      getSelection: () => ({ toString: () => '', removeAllRanges: () => {} }),
    },
    console,
    TextEncoder,
    crypto: webcrypto,
    AbortController,
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    setTimeout: (...args) => setTimeout(...args).unref(),
    clearTimeout,
    requestAnimationFrame: (callback) => callback(),
    Audio: FakeAudio,
    Blob: class { constructor(parts, options) { this.parts = parts; this.type = options?.type } },
    URL: {
      createObjectURL: (blob) => { const url = `blob:take-${blobUrls.length}`; blobUrls.push(url); return url },
      revokeObjectURL: (url) => { revoked.push(url) },
    },
    document: {
      querySelector: () => null,
      getElementById: () => null,
      createElement: () => ({ style: {}, setAttribute: () => {}, appendChild: () => {}, select: () => {}, remove: () => {}, click: () => {} }),
      body: { appendChild: () => {} },
      activeElement: null,
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    localStorage: {
      getItem: (key) => (key === 'french-close-reading/last-position-v1'
        ? JSON.stringify({
          schemaVersion: 1, passageId: passage.id, title: passage.title, sourceRevision: 1,
          anchorId: 'p1.s1', anchorText: SENTENCE, branchId: null, scrollTop: 0, book: '', chapter: '',
        })
        : null),
      setItem: () => {}, removeItem: () => {},
    },
  }
  const context = vm.createContext(browser)
  vm.runInContext(source, context, { filename: 'client.js' })
  const plugin = component.factory(() => react)

  const api = new Proxy({}, {
    get: (_target, name) => (...args) => {
      calls.push({ endpoint: String(name), args })
      const handler = { ...library, ...services }[name]
      return handler === undefined ? Promise.resolve(ok({})) : handler(...args)
    },
  })
  const ctx = {
    effect: (factory) => factory(),
    locale: {
      register: (_ns, value) => { dictionaries = value },
      bind: () => (key, values) => {
        const template = dictionaries.zh?.[key] ?? key
        return String(template).replace(/\{(\w+)\}/gu, (match, field) => (
          values?.[field] === undefined ? match : String(values[field])))
      },
    },
    plugin: (child) => { child?.apply?.(ctx); return { dispose: async () => {} } },
    layout: { selectPanel: () => {} },
    slots: {
      inject: (_name, register) => register(),
      register: (declaration, value) => {
        if (declaration?.name === 'main') { component = value; props = declaration.inject() }
        return () => {}
      },
    },
    remote: { frenchReader: api, $mount: async () => async () => {} },
  }
  await plugin.apply(ctx)
  assert.notEqual(component, null, 'the panel is registered in the main slot')
  const internals = plugin.__test__
  const root = mount === null
    ? { type: component, props }
    : mount({ internals, t: props.t, face: props })

  function runEffects() {
    const queue = pendingEffects.splice(0)
    for (const entry of queue) {
      const previous = entry.slot.effects[entry.at]
      if (typeof previous?.cleanup === 'function') previous.cleanup()
      entry.slot.effects[entry.at] = { deps: entry.deps, cleanup: entry.factory() }
    }
  }

  function walk(node, key) {
    if (node === null || node === undefined || typeof node !== 'object') return node
    if (Array.isArray(node)) return node.map((child, index) => walk(child, `${key}.${String(index)}`))
    const { type, elementProps } = { type: node.type, elementProps: node.props }
    if (typeof type === 'function') {
      const identity = `${key}:${type.name ?? 'anonymous'}`
      seen.add(identity)
      if (type.prototype !== undefined && typeof type.prototype.render === 'function') {
        return walk(new type(elementProps ?? {}).render(), identity)
      }
      currentSlot = slots.get(identity) ?? { states: [], refs: [], effects: [], memos: [] }
      slots.set(identity, currentSlot)
      cursor = 0
      return walk(type(elementProps ?? {}), identity)
    }
    if (elementProps?.children === undefined) return node
    const children = elementProps.children
    const list = Array.isArray(children) ? children : [children]
    const walked = list.map((child, index) => {
      // React's own identity rule: a keyed child keeps its identity, an unkeyed one
      // is identified by position. State is attached the same way here.
      const childKey = child !== null && typeof child === 'object' && child.key !== undefined && child.key !== null
        ? `k${String(child.key)}`
        : `i${String(index)}`
      return walk(child, `${key}.${childKey}`)
    })
    return { type, props: { ...elementProps, children: Array.isArray(children) ? walked : walked[0] } }
  }

  // `setImmediate`, not a zero timer: the panel's promises are created inside the
  // vm realm, and their continuations are drained on the check phase — a timer can
  // fire before that, which would hand back a tree the effects have not updated.
  const settle = () => new Promise((resolve) => { setImmediate(() => setImmediate(resolve)) })

  async function render() {
    let tree = null
    for (let round = 0; round < 20; round += 1) {
      dirty = false
      pendingEffects.length = 0
      seen.clear()
      tree = walk(root, 'root')
      runEffects()
      // A component that disappeared runs its cleanups, exactly as React would.
      for (const [identity, slot] of [...slots]) {
        if (seen.has(identity)) continue
        for (const entry of slot.effects) if (typeof entry?.cleanup === 'function') entry.cleanup()
        slots.delete(identity)
      }
      await settle()
      if (!dirty) break
    }
    pendingEffects.length = 0
    return walk(root, 'root')
  }

  const findAll = (tree, predicate) => {
    const found = []
    const visit = (node) => {
      if (node === null || node === undefined || typeof node !== 'object') return
      if (Array.isArray(node)) { node.forEach(visit); return }
      if (predicate(node)) found.push(node)
      visit(node.props?.children)
    }
    visit(tree)
    return found
  }
  const textOf = (node) => {
    if (node === null || node === undefined) return ''
    if (Array.isArray(node)) return node.map(textOf).join('')
    if (typeof node !== 'object') return String(node)
    return textOf(node.props?.children)
  }
  const byClass = (tree, token) => findAll(tree, (node) => (
    typeof node.props?.className === 'string' && node.props.className.split(/\s+/u).includes(token)))[0] ?? null

  /** Press a control the way a reader does, then let the panel settle. */
  async function click(node) {
    assert.notEqual(node, null, 'the control exists')
    node.props.onClick?.({ preventDefault: () => {}, stopPropagation: () => {} })
    return render()
  }

  return {
    render,
    click,
    /**
     * Open the passage the stored reading position points at, the way a reader
     * does: the front door offers 继续上次阅读, and the shell follows. Opening the
     * passage must list audio and never synthesize anything.
     */
    async openReading() {
      const tree = await render()
      const resume = findAll(tree, (node) => (
        node.type === 'button' && textOf(node).includes('继续上次阅读')))[0]
      return resume === undefined ? tree : click(resume)
    },
    findAll, textOf, byClass,
    calls,
    endpoints: (name) => calls.filter((call) => call.endpoint === name),
    request: (name) => calls.find((call) => call.endpoint === name)?.args?.[0] ?? null,
    players, blobUrls, revoked,
  }
}

test('an unconfigured Host disables 发音, says 未配置, and is never asked to synthesize', async () => {
  const listed = []
  const panel = await openPanel({
    services: {
      getPassage: async () => ok({ passage }),
      getSegmentation: async () => ok({ segmentation }),
      listSentenceAudio: async (request) => { listed.push(request.source); return listing([], unconfigured, null) },
    },
  })
  const tree = await panel.openReading()
  const group = panel.byClass(tree, 'audioGroup')
  assert.notEqual(group, null,
    `the reading toolbar carries the audio control; calls=${panel.calls.map((call) => call.endpoint).join(',')}`)
  const speak = panel.byClass(tree, 'audioSpeak')
  assert.equal(speak.props.disabled, true, 'an unconfigured control is disabled')
  const status = panel.textOf(panel.byClass(tree, 'audioStatus'))
  assert.match(status, /未配置/u, 'the control says 未配置')
  // Rule 4: it may not claim any of the states it cannot reach.
  for (const claim of ['生成中', '播放中', '已存']) assert.equal(status.includes(claim), false, `${claim} is not claimed`)
  assert.equal(listed.length, 1)
  assert.deepEqual(rehome(listed[0]), sentenceSource, 'the listing was asked for the sentence, not the paragraph')
  // A press that reaches the handler anyway (a stale DOM node, a re-render race)
  // must still request nothing.
  await panel.click(speak)
  assert.equal(panel.endpoints('synthesizeSentenceAudio').length, 0, 'nothing was synthesized')
  assert.equal(panel.endpoints('readSentenceAudioAsset').length, 0, 'and nothing was read')
})

test('a stored take plays through readAsset, without synthesizing', async () => {
  const panel = await openPanel({
    services: {
      getPassage: async () => ok({ passage }),
      getSegmentation: async () => ok({ segmentation }),
      listSentenceAudio: async () => listing([take()]),
      readSentenceAudioAsset: async () => ok({
        kind: 'found', takeId: 'take-1', mimeType: 'audio/wav',
        base64: Buffer.from('RIFF....WAVEfmt ').toString('base64'), bytes: 16, durationMs: 1200,
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    },
  })
  const tree = await panel.openReading()
  const status = panel.textOf(panel.byClass(tree, 'audioStatus'))
  assert.match(status, /直接播放/u, 'the reader is told the stored take is what plays')
  assert.equal(panel.endpoints('synthesizeSentenceAudio').length, 0, 'listing is not a synthesis')

  await panel.click(panel.byClass(tree, 'audioSpeak'))
  assert.equal(panel.endpoints('synthesizeSentenceAudio').length, 0, 'playing a cache hit never synthesizes')
  const read = panel.endpoints('readSentenceAudioAsset')
  assert.equal(read.length, 1)
  assert.deepEqual(rehome(read[0].args[0]), { source: sentenceSource, takeId: 'take-1' })
  // The bytes went through the browser's own playback seam, at the take's rate.
  assert.equal(panel.blobUrls.length, 1)
  assert.equal(panel.players.length, 1)
  assert.equal(panel.players[0].src, panel.blobUrls[0])
  assert.equal(panel.players[0].playbackRate, 1.25, 'rate becomes playbackRate')
  assert.equal(panel.players[0].played, 1)
  // A take the Host already calls current needs no selection call.
  assert.equal(panel.endpoints('selectSentenceAudio').length, 0)
  // An object URL is released when the take finishes, not left behind.
  panel.players[0].end()
  assert.deepEqual(panel.revoked, [panel.blobUrls[0]])
})

test('重新生成 appends a new version with its own requestId', async () => {
  const requests = []
  let next = 2
  const panel = await openPanel({
    services: {
      getPassage: async () => ok({ passage }),
      getSegmentation: async () => ok({ segmentation }),
      listSentenceAudio: async () => listing([take()]),
      synthesizeSentenceAudio: async (request) => {
        requests.push(request)
        const produced = take({
          takeId: `take-${String(next)}`, requestId: request.requestId, previousTakeId: request.previousTakeId,
          createdAt: `2026-01-0${String(next)}T00:00:00.000Z`,
        })
        next += 1
        return ok({ kind: 'ready', take: produced })
      },
      readSentenceAudioAsset: async (request) => ok({
        kind: 'found', takeId: request.takeId, mimeType: 'audio/wav',
        base64: Buffer.from('RIFF....WAVEfmt ').toString('base64'), bytes: 16, durationMs: 1200,
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    },
  })
  let tree = await panel.openReading()
  const regenerate = panel.findAll(tree, (node) => (
    node.type === 'button' && panel.textOf(node).includes('重新生成')))[0]
  assert.notEqual(regenerate, undefined, '重新生成 is its own entry')

  tree = await panel.click(regenerate)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].action, 'regenerate')
  assert.equal(requests[0].versionPolicy, 'append', 'a regeneration appends, never overwrites')
  assert.equal(requests[0].previousTakeId, 'take-1', 'it names the take it follows')
  assert.equal(requests[0].voice, null, 'null is the Host’s configured voice')
  assert.deepEqual(rehome(requests[0].source), sentenceSource)
  assert.equal(typeof requests[0].requestId, 'string')
  assert.ok(requests[0].requestId.length > 0)

  // A second regeneration is a new request, and the first version stays in the list.
  const again = panel.findAll(tree, (node) => (
    node.type === 'button' && panel.textOf(node).includes('重新生成')))[0]
  tree = await panel.click(again)
  assert.equal(requests.length, 2)
  assert.notEqual(requests[1].requestId, requests[0].requestId, 'a new intent mints a new requestId')
  assert.equal(requests[1].previousTakeId, 'take-2')
  assert.equal(requests[1].versionPolicy, 'append')
  assert.equal(panel.endpoints('listSentenceAudio').length, 1, 'appending is local: the cache is not re-read')
  // The take that just arrived is what plays; once it finishes the panel says how
  // many versions are stored — which is how "append, never overwrite" is visible.
  assert.match(panel.textOf(panel.byClass(tree, 'audioStatus')), /播放中/u)
  panel.players.at(-1).end()
  tree = await panel.render()
  assert.match(panel.textOf(panel.byClass(tree, 'audioStatus')), /3 个版本/u, 'all three takes are listed')
})

test('a failed regeneration keeps the previous take playable', async () => {
  const panel = await openPanel({
    services: {
      getPassage: async () => ok({ passage }),
      getSegmentation: async () => ok({ segmentation }),
      listSentenceAudio: async () => listing([take()]),
      synthesizeSentenceAudio: async () => ok({ kind: 'failed', reason: 'timeout', message: '合成超时' }),
      readSentenceAudioAsset: async (request) => ok({
        kind: 'found', takeId: request.takeId, mimeType: 'audio/wav',
        base64: Buffer.from('RIFF....WAVEfmt ').toString('base64'), bytes: 16, durationMs: 1200,
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    },
  })
  let tree = await panel.openReading()
  const regenerate = panel.findAll(tree, (node) => (
    node.type === 'button' && panel.textOf(node).includes('重新生成')))[0]
  tree = await panel.click(regenerate)
  const status = panel.textOf(panel.byClass(tree, 'audioStatus'))
  assert.match(status, /发音失败/u, 'the reason is shown')
  assert.match(status, /合成超时/u)
  assert.equal(panel.endpoints('synthesizeSentenceAudio').length, 1)
  // Rule 3: the old take is still there, and 发音 still plays it.
  await panel.click(panel.byClass(tree, 'audioSpeak'))
  const read = panel.endpoints('readSentenceAudioAsset')
  assert.equal(read.length, 1)
  assert.equal(read[0].args[0].takeId, 'take-1', 'the previous take is what plays')
  assert.equal(panel.endpoints('synthesizeSentenceAudio').length, 1, 'playing it is not another synthesis')
  assert.equal(panel.players[0].played, 1)
})

test('a running synthesis offers 取消, which aborts the Remote call’s own signal', async () => {
  const signals = []
  const panel = await openPanel({
    services: {
      getPassage: async () => ok({ passage }),
      getSegmentation: async () => ok({ segmentation }),
      listSentenceAudio: async () => listing([], configured, null),
      // Never answers: this is the state the reader is looking at while a take is
      // being made, and the only cancel there is is aborting this signal.
      synthesizeSentenceAudio: async (_request, signal) => {
        signals.push(signal)
        return new Promise(() => {})
      },
    },
  })
  let tree = await panel.openReading()
  tree = await panel.click(panel.byClass(tree, 'audioSpeak'))
  assert.equal(signals.length, 1)
  assert.match(panel.textOf(panel.byClass(tree, 'audioStatus')), /生成中/u)
  const cancel = panel.findAll(tree, (node) => node.type === 'button' && panel.textOf(node) === '取消')[0]
  assert.notEqual(cancel, undefined, '生成中 is cancellable')
  tree = await panel.click(cancel)
  assert.equal(signals[0].aborted, true, 'cancelling aborts the call')
  assert.match(panel.textOf(panel.byClass(tree, 'audioStatus')), /已取消生成/u)
})

test('every conjugation row speaks its own form through the inflection endpoints', async () => {
  const conjSource = (overrides = {}) => ({
    kind: 'inflection', formId: 'venir#ind.pre.1s', inflectionRevision: 1, lemma: 'venir',
    tense: 'ind.pre', formKind: 'finite', person: 1, form: 'viens', utterance: 'je viens',
    language: 'fr', ...overrides,
  })
  const listed = []
  const synthesized = []
  const panel = await openPanel({
    services: {
      readConjugation: async () => ok({
        state: 'dataset', lemma: 'venir', source: 'dataset', fetchStatus: 'ok', missingForms: [],
        tenses: [{
          mood: 'ind', tense: 'pre', label: 'présent',
          bases: [{ ipa: 'vjɛ̃', persons: ['1s', '2s', '3s'], writtenStem: 'vien' }],
          forms: [
            { person: '1s', written: 'viens', ipa: 'vjɛ̃', baseIndex: 0 },
            { person: '1p', written: 'venons', ipa: 'və.nɔ̃', baseIndex: 1 },
          ],
          missingPersons: [], notes: [],
        }],
      }),
      listInflectionAudio: async (request) => {
        listed.push(request.source)
        return ok({
          sourceKey: `${request.source.formId}|${String(request.source.inflectionRevision)}`,
          takes: [], selectedTakeId: null, configuration: configured,
        })
      },
      synthesizeInflectionAudio: async (request) => {
        synthesized.push(request)
        return ok({
          kind: 'ready',
          take: {
            takeId: 'form-take', requestId: request.requestId, source: request.source,
            backend: { kind: 'tts', providerId: 'google', modelId: 'gemini-2.5-flash-preview-tts' },
            voice: { voiceId: null, rate: 1 }, previousTakeId: null, audioAssetId: 'audio_form-take',
            mimeType: 'audio/wav', durationMs: 900, bytes: 1800, createdAt: '2026-01-01T00:00:00.000Z',
            selected: true,
          },
        })
      },
      readInflectionAudioAsset: async () => ok({
        kind: 'found', takeId: 'form-take', mimeType: 'audio/wav',
        base64: Buffer.from('RIFF....WAVEfmt ').toString('base64'), bytes: 16, durationMs: 900,
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    },
    mount: ({ internals, t, face }) => ({
      type: internals.ConjugationView,
      props: {
        t, lemma: 'venir',
        readConjugation: face.readConjugation, fetchConjugation: face.fetchConjugation,
        audioCalls: {
          list: face.listInflectionAudio, synthesize: face.synthesizeInflectionAudio,
          select: face.selectInflectionAudio, readAsset: face.readInflectionAudioAsset,
        },
      },
    }),
  })
  const tree = await panel.render()
  const buttons = panel.findAll(tree, (node) => node.props?.className === 'conjSpeak')
  assert.equal(buttons.length, 2, 'every row carries its own speak button')
  assert.ok(listed.some((entry) => entry.formId === 'venir#ind.pre.1s'), 'the first form is listed')
  assert.ok(listed.every((entry) => entry.kind === 'inflection'))

  await panel.click(buttons[1])
  assert.equal(synthesized.length, 1, 'one row, one request')
  assert.deepEqual(rehome(synthesized[0].source), conjSource({
    formId: 'venir#ind.pre.1p', person: 4, form: 'venons', utterance: 'nous venons',
  }), 'the form is read with its subject, as real French')
  assert.equal(synthesized[0].versionPolicy, 'append')
  assert.equal(synthesized[0].voice, null)
  // The two surfaces share no state: nothing here touched the sentence endpoints.
  assert.equal(panel.endpoints('synthesizeSentenceAudio').length, 0)
  assert.equal(panel.endpoints('readSentenceAudioAsset').length, 0)
})

test('retrying a request that never got an answer reuses its requestId', async () => {
  const requests = []
  let reachable = false
  const panel = await openPanel({
    services: {
      listSentenceAudio: async () => listing([], configured, null),
      // The first attempt never reaches the Host; the second does. The contract's
      // idempotency rule is that this is *one* request, not two jobs.
      synthesizeSentenceAudio: async (request) => {
        requests.push(request)
        if (!reachable) throw new Error('transport unavailable')
        return ok({
          kind: 'ready',
          take: take({ takeId: 'take-9', requestId: request.requestId, previousTakeId: null }),
        })
      },
      readSentenceAudioAsset: async () => ok({
        kind: 'found', takeId: 'take-9', mimeType: 'audio/wav',
        base64: Buffer.from('RIFF....WAVEfmt ').toString('base64'), bytes: 16, durationMs: 900,
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    },
  })
  let tree = await panel.openReading()
  tree = await panel.click(panel.byClass(tree, 'audioSpeak'))
  assert.equal(requests.length, 1)
  assert.match(panel.textOf(panel.byClass(tree, 'audioStatus')), /发音失败/u)

  reachable = true
  await panel.click(panel.byClass(tree, 'audioSpeak'))
  assert.equal(requests.length, 2, 'the retry is the same request, sent again')
  assert.equal(requests[1].requestId, requests[0].requestId,
    'a retry of the same attempt reuses its idempotency key')
  // A new intent — 重新生成 — is the thing that mints a new one.
  const regenerate = panel.findAll(await panel.render(), (node) => (
    node.type === 'button' && panel.textOf(node).includes('重新生成')))[0]
  await panel.click(regenerate)
  assert.equal(requests.length, 3)
  assert.notEqual(requests[2].requestId, requests[0].requestId)
  assert.equal(requests[2].action, 'regenerate')
})

test('opening another sentence lists its own audio and never synthesizes', async () => {
  const second = 'Le lecteur hésite.'
  const twoSentences = {
    passageId: passage.id, sourceRevision: 1, revision: 1,
    paragraphs: [{
      id: 'p1', text: `${SENTENCE} ${second}`, start: 0, end: SENTENCE.length + 1 + second.length,
      sentences: [
        { id: 'p1.s1', paragraphId: 'p1', text: SENTENCE, start: 0, end: SENTENCE.length },
        {
          id: 'p1.s2', paragraphId: 'p1', text: second,
          start: SENTENCE.length + 1, end: SENTENCE.length + 1 + second.length,
        },
      ],
    }],
  }
  const listed = []
  const panel = await openPanel({
    services: {
      getSegmentation: async () => ok({ segmentation: twoSentences }),
      // Only the first sentence has audio; the second must be listed in its own
      // right rather than shown the first one's take.
      listSentenceAudio: async (request) => {
        listed.push(request.source.sentenceId)
        return request.source.sentenceId === 'p1.s1'
          ? listing([take()])
          : ok({ sourceKey: `${passage.id}|p1.s2|1|1`, takes: [], selectedTakeId: null, configuration: configured })
      },
    },
  })
  const tree = await panel.openReading()
  assert.match(panel.textOf(panel.byClass(tree, 'audioStatus')), /直接播放/u)
  const row = panel.findAll(tree, (node) => node.props?.['data-sentence-id'] === 'p1.s2')[0]
  assert.notEqual(row, undefined, 'the second sentence is on the reading route')
  const after = await panel.click(panel.findAll(row, (node) => node.type === 'button')[0])

  // Navigating lists the new sentence and synthesizes nothing, and the previous
  // sentence's take is not shown as if it belonged to this one.
  assert.equal(panel.endpoints('synthesizeSentenceAudio').length, 0, 'navigation never synthesizes')
  assert.ok(listed.includes('p1.s2'), 'the new sentence is listed by its own id')
  const status = panel.textOf(panel.byClass(after, 'audioStatus'))
  assert.equal(status.includes('直接播放'), false, 'another sentence’s take is not claimed here')
})

/**
 * The control must not be silently unusable.
 *
 * The round-6 report was a press that changed nothing: no take stored, no text
 * anywhere, and therefore nothing to diagnose from the outside. The one state
 * that produced it is "the listing answered, but under another fingerprint" —
 * the control is disabled by a fact the reader cannot see. It now says which
 * fact, names both fingerprints, and records a refused press.
 */
test('a listing that answers under another fingerprint explains itself', async () => {
  const elsewhere = `${passage.id}|p1.s1|2|1`
  const panel = await openPanel({
    services: {
      // A different source revision: this take belongs to a corrected sentence,
      // not to the one on screen.
      listSentenceAudio: async () => ok({
        sourceKey: elsewhere, takes: [], selectedTakeId: null, configuration: configured,
      }),
    },
  })
  const tree = await panel.openReading()
  const status = panel.byClass(tree, 'audioStatus')
  assert.notEqual(status, undefined, 'the refusal is stated, not silent')
  assert.match(panel.textOf(status), /未匹配本句/u)
  assert.match(panel.textOf(status), new RegExp(sourceKey.slice(0, 12), 'u'))
  const diagnostic = panel.textOf(panel.byClass(tree, 'audioDiagnostic'))
  assert.match(diagnostic, new RegExp(sourceKey, 'u'))
  assert.match(diagnostic, /\|2\|1/u)

  // Nothing is requested in this state, and the press is recorded rather than lost.
  const speak = panel.findAll(tree, (node) => node.props?.['aria-label'] === '朗读当前句')[0]
  assert.equal(speak.props.disabled, true, 'a mismatched listing disables the control')
  const after = await panel.click(speak)
  assert.equal(panel.endpoints('synthesizeSentenceAudio').length, 0, 'a mismatch never synthesizes')
  assert.equal(panel.endpoints('readSentenceAudioAsset').length, 0, 'and never reads an asset')
  assert.match(panel.textOf(panel.byClass(after, 'audioDiagnostic')), /press-refused/u)
})

/**
 * A read that fails is not the same as a read that says "nothing stored": the
 * panel must say the read failed instead of showing an empty, disabled control.
 */
test('a failed listing is reported instead of leaving a mute control', async () => {
  const panel = await openPanel({
    services: {
      listSentenceAudio: async () => { throw new Error('gateway unavailable') },
    },
  })
  const tree = await panel.openReading()
  const status = panel.byClass(tree, 'audioStatus')
  assert.notEqual(status, undefined, 'the failure is on the panel')
  assert.match(panel.textOf(status), /无法读取发音记录/u)
  assert.match(panel.textOf(status), /gateway unavailable/u)
  assert.equal(status.props.role, 'alert')
  // A failed read never synthesizes on its own: it is a read, and only a press asks.
  assert.equal(panel.endpoints('synthesizeSentenceAudio').length, 0)
})

/**
 * The seam this panel broke on is *between* the two halves: the browser computes
 * a fingerprint, and the Host recomputes it from what actually arrived and stores
 * the take under that. Unit tests on either side cannot see a disagreement, so
 * this test builds the source the browser really builds and hands it to the real
 * `listSentenceAudio` Remote.
 *
 * The path is the toolbar's own: `getSegmentation` → the focused sentence anchor
 * → `sentenceSpeechSource`. The revisions are the ones the reading page has
 * (the passage's `sourceRevision`, the segmentation's `revision`), and the id is
 * the anchor id (`p1.s1`) rather than any internal sentence UUID.
 */
test('the browser’s sentence source is accepted by the real listSentenceAudio Remote', async () => {
  // The real panel is opened once, only to reach the builders it really runs.
  const panel = await openPanel({ mount: ({ internals }) => ({ type: 'div', props: { internals } }) })
  const internals = (await panel.render()).props.internals

  const opened = await openController(createBacking(), FRENCH_READER_DOMAIN, {
    audio: {
      config: { enabled: true, backend: 'live', apiKey: 'probe-key' },
      env: {},
      // The desktop Host has WebSockets; without this the live backend reports
      // `transport-unavailable` and the probe would be measuring the wrong thing.
      webSocketAvailable: true,
    },
  })
  await opened.controller.createPassage(passageRequest, signal())
  // The segmentation the reading page really reads: `revision` is the sentence
  // revision the browser puts in the source, and the anchor id is `p1.s1`.
  const stored = await opened.controller.getSegmentation({ passageId: ids.passage }, signal())
  const read = stored.segmentation
  assert.notEqual(read, null, 'the passage has a segmentation to read')
  assert.equal(read.passageId, ids.passage)
  assert.equal(read.sourceRevision, 1)
  assert.equal(read.revision, 1)
  const [first] = read.paragraphs[0].sentences
  assert.equal(first.id, 'p1.s1')

  // Built exactly as the toolbar builds it: the reading page's passage (id and
  // revision), the segmentation it read, and the focused sentence anchor.
  const source = internals.sentenceSpeechSource(
    { id: ids.passage, sourceRevision: read.sourceRevision }, read, first)
  assert.equal(source.sentenceId, 'p1.s1', 'the source carries the anchor id, not a UUID')
  assert.equal(source.sentenceRevision, read.revision)
  assert.equal(source.text, first.text)
  assert.equal(source.language, 'fr')

  const listed = await opened.controller.listSentenceAudioRemote({ source }, signal())
  assert.equal(listed.configuration.configured, true, 'the Desktop Host has audio configured')
  assert.equal(listed.sourceKey, internals.audioSourceKey('sentence', source),
    'both halves fingerprint this sentence identically')
  assert.deepEqual(rehome(listed.takes), [], 'nothing is stored yet, and nothing was synthesized')

  // The fingerprint is the whole point: a different revision is a different
  // sentence as far as the audio is concerned, and both halves must say so.
  const corrected = { ...source, sentenceRevision: read.revision + 1 }
  const moved = await opened.controller.listSentenceAudioRemote({ source: corrected }, signal())
  assert.notEqual(moved.sourceKey, listed.sourceKey, 'a new revision is not this take’s source')
  assert.equal(moved.sourceKey, internals.audioSourceKey('sentence', corrected))
})

test('the source builders keep the contract’s own examples', async () => {
  const panel = await openPanel({ mount: ({ internals }) => ({ type: 'div', props: { internals } }) })
  const internals = (await panel.render()).props.internals
  assert.equal(internals.inflectionUtterance('1p', 'venons'), 'nous venons')
  assert.equal(internals.inflectionUtterance('3s', 'vient'), 'il vient')
  assert.equal(internals.inflectionUtterance('3p', 'viennent'), 'ils viennent')
  // `je` elides before a vowel; a leading `h` keeps the subject, since mute and
  // aspirated `h` cannot be told apart from spelling.
  assert.equal(internals.inflectionUtterance('1s', 'écarte'), 'j’écarte')
  assert.equal(internals.inflectionUtterance('1s', 'habite'), 'je habite')
  assert.equal(internals.inflectionUtterance('1s', 'viens'), 'je viens')
  assert.equal(internals.audioSourceKey('inflection', { formId: 'venir#ind.pre.1p', inflectionRevision: 1 }),
    'venir#ind.pre.1p|1')
  assert.equal(internals.audioSourceKey('sentence', sentenceSource), sourceKey)
  assert.deepEqual(rehome(internals.sentenceSpeechSource(passage, segmentation,
    segmentation.paragraphs[0].sentences[0])), sentenceSource)
})
