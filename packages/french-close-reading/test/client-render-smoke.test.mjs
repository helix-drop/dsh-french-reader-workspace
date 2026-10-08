import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import vm from 'node:vm'

/**
 * The panel is rendered, not just pattern-matched.
 *
 * The other client tests read `client.js` as text. They cannot see a component body that
 * runs hooks out of order or reads a `const` before its initialiser — and that is exactly
 * what happened: a gesture `useEffect` was placed above the state declarations, so its
 * `[navOpen]` dependency threw `Cannot access 'navOpen' before initialization` on every
 * render. In the app that is the failure card; in the suite nothing complained.
 *
 * This test executes the real component body with a small hook shim, so that class of bug
 * fails the suite instead of the reader's panel.
 */
const packageRoot = fileURLToPath(new URL('../', import.meta.url))
const source = readFileSync(path.join(packageRoot, 'client.js'), 'utf8')

/** Structured elements, and hooks that return their initial value. */
function structuredReact(overrides = new Map(), byName = new Map()) {
  let index = 0
  let active = overrides
  return {
    createElement: (type, props, ...children) => {
      const flat = children.length === 0 ? undefined : children.length === 1 ? children[0] : children
      return { type, props: { ...(props ?? {}), children: flat } }
    },
    useState: (initial) => {
      const at = index
      index += 1
      if (active !== null && active.has(at)) return [active.get(at), () => {}]
      return [initial, () => {}]
    },
    useRef: (initial) => ({ current: initial ?? null }),
    useCallback: (fn) => fn,
    useEffect: () => {},
    useMemo: (fn) => fn(),
    useId: () => 'smoke',
    /** Called before each component body: indices restart, and the right map is chosen. */
    __enter: (root) => { index = 0; active = root ? overrides : null },
    /** `byName` lets a nested component's own state be seeded, as the preview does. */
    __named: (name) => { active = byName.get(name) ?? null; return active !== null },
  }
}

/** Load the bundle, apply the plugin, and hand back the component the `main` slot gets. */
async function mountPanel(overrides, byName = new Map()) {
  const react = structuredReact(overrides, byName)
  const registrations = []
  const context = vm.createContext({
    window: { __ModuleLoader__: { load: (registration) => registrations.push(registration) } },
    console,
    TextEncoder,
    URL,
    Blob: class {},
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  })
  vm.runInContext(source, context, { filename: 'client.js' })
  const plugin = registrations[0].factory((id) => {
    if (id !== 'react') throw new Error(`unexpected require(${id})`)
    return react
  })

  const ok = (value) => async () => ({ ok: true, value })
  const api = new Proxy({}, { get: () => ok({}) })
  let captured = null
  let declaration = null
  const ctx = {
    effect: (factory) => factory(),
    locale: { register: () => {}, bind: () => (key) => key },
    plugin: (child) => {
      const disposer = child?.apply?.(ctx)
      return { dispose: async () => { if (typeof disposer === 'function') await disposer() } }
    },
    layout: { selectPanel: () => {} },
    slots: {
      inject: (_name, register) => register(),
      register: (decl, component) => {
        if (decl?.name === 'main') { captured = component; declaration = decl }
        return () => {}
      },
    },
    remote: { frenchReader: api, $mount: async () => async () => {} },
  }
  await plugin.apply(ctx)
  assert.notEqual(captured, null, 'the panel component is registered in the main slot')
  return { component: captured, props: declaration.inject(), react }
}

/**
 * Walk the tree and actually run every function component.
 *
 * Calling only the root was the hole that let a real defect through: `KnowledgeSection` was
 * never executed, so a `ReferenceError` sitting on a line reached only when a card is loaded
 * passed every test. Depth is where the bugs are, so depth is where the test goes.
 */
function deepRender(node, react, depth = 0) {
  if (node === null || node === undefined || typeof node !== 'object') return node
  if (Array.isArray(node)) return node.map((child) => deepRender(child, react, depth))
  const { type, props } = node
  if (typeof type === 'function') {
    const seeded = react.__named(type.name ?? '')
    react.__enter(false)
    void seeded
    const out = type(props ?? {})
    react.__enter(depth === 0)
    return deepRender(out, react, depth + 1)
  }
  if (props !== undefined && props.children !== undefined) {
    deepRender(props.children, react, depth + 1)
  }
  return node
}

const passage = {
  id: 'p', title: 'Test', sourceText: 'Le lecteur n’écarte pas une interprétation.',
  sourceRevision: 1, segmentationRevision: 1, createdAt: '', updatedAt: '', archivedAt: null,
}
const segmentation = {
  passageId: 'p', sourceRevision: 1, revision: 1,
  paragraphs: [{
    id: 'p1', text: passage.sourceText, start: 0, end: passage.sourceText.length,
    sentences: [{ id: 'p1.s1', paragraphId: 'p1', text: passage.sourceText, start: 0, end: passage.sourceText.length }],
  }],
}

test('the reading shell renders without throwing', async () => {
  // 10 = activePassage, 16 = segmentation, 18 = anchorId, 26/27/28/29 = backends and model.
  const { component, props, react } = await mountPanel(new Map([
    [10, passage], [16, segmentation], [18, 'p1.s1'],
    [26, [{ backend: 'stub', label: 'Stub', available: true, reason: null }]],
    [27, 'stub'],
    [28, [{ id: 'stub', name: 'Stub', reasoningEfforts: [], contextWindow: null }]],
    [29, 'stub'],
  ]))
  react.__enter(true)
  const tree = component(props)
  assert.notEqual(tree, null)
  deepRender(tree, react)
})

test('the knowledge view renders without throwing', async () => {
  // 43 = knowledgeOpen: the branch whose nested component exposed the bug above.
  const { component, props, react } = await mountPanel(new Map([
    [10, passage], [16, segmentation], [18, 'p1.s1'], [43, true],
  ]))
  react.__enter(true)
  deepRender(component(props), react)
})

test('a discussion node renders without throwing', async () => {
  // 46 = selectedNode: the composer only exists on this branch.
  const { component, props, react } = await mountPanel(new Map([
    [10, passage], [16, segmentation], [18, 'p1.s1'],
    [30, { branches: [{
      branchId: 'b1', anchorId: 'p1.s1', kind: 'discussion', title: 'Q', parentId: null,
      forkedFrom: null, status: 'open', createdAt: '', updatedAt: '', historyCount: 1,
      messages: [{ messageId: 'm1', author: 'model', text: 'A', status: 'complete', backend: null,
        model: null, resolvedModel: null, failure: null, contextId: null, extraction: null, createdAt: '' }],
    }], conclusions: [] }],
    [46, { id: 'b1', anchorId: 'p1.s1', kind: 'discussion', title: 'Q', status: 'open' }],
  ]))
  react.__enter(true)
  deepRender(component(props), react)
})

test('an open word entry renders without throwing', async () => {
  // 44 is `knowledgeEntryId`, 43 is `knowledgeOpen`: this path composes the entry header,
  // the card split by the Host's headings, and the conjugation slot inside its section.
  const { component, props, react } = await mountPanel(new Map([
    [10, passage], [16, segmentation], [18, 'p1.s1'], [43, true], [44, 'entry-1'], [45, 'vocab'],
  ]))
  react.__enter(true)
  deepRender(component(props), react)
})

test('the entry path can be walked, seeding what its effects would have loaded', async () => {
  // What this does **not** do yet, stated plainly: it does not reach the line that renders a
  // loaded card. Proof: with that line deliberately broken (`LexiconCardX`), this test still
  // passes. The `extraForSection` bug in `KnowledgeSection`'s destructuring was found by the
  // **preview harness**, not by the suite, and the suite still does not guard it.
  // Kept because it does walk the entry path (header, bar, grammar slot) — but not sold as
  // more than that.
  const entry = {
    entryId: 'entry-1', mot: 'écarter', lemma: 'écarter', partOfSpeech: '动词',
    forms: ['écarte'], provenance: 'user', status: 'draft', revision: 1,
    senses: [], sections: {}, sources: [], occurrences: [],
  }
  const card = {
    mot: 'écarter', entryId: 'entry-1',
    value: {
      kind: 'card',
      rendered: '§1 词条总览\n词形 écarter',
      sections: [{ number: '§1', title: '词条总览', required: true }],
      errors: [], hints: [],
    },
  }
  const { component, props, react } = await mountPanel(new Map([
    [10, passage], [16, segmentation], [18, 'p1.s1'], [43, true], [44, 'entry-1'], [45, 'vocab'],
  ]), new Map([
    ['KnowledgeEntry', new Map([[0, entry]])],
    ['KnowledgeSection', new Map([[1, { entries: [entry], total: 1 }], [2, { entries: [], total: 0 }], [6, card]])],
  ]))
  react.__enter(true)
  deepRender(component(props), react)
})
