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
      // PassagePage gained three archive-list state slots before its historical
      // reading state indices; keep root seeds mapped by their old test labels.
      const seedAt = active === overrides && at > 0 ? at - 3 : at
      if (active !== null && active.has(seedAt)) return [active.get(seedAt), () => {}]
      return [initial, () => {}]
    },
    useRef: (initial) => ({ current: initial ?? null }),
    useCallback: (fn) => fn,
    Component: class { constructor(props) { this.props = props; this.state = {} } },
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
  // The real dictionaries, so text assertions read what the reader reads.
  let dictionaries = { zh: {}, en: {} }
  const ctx = {
    effect: (factory) => factory(),
    locale: {
      register: (_ns, value) => { dictionaries = value },
      bind: () => (key) => dictionaries.zh?.[key] ?? key,
    },
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
/**
 * Execute the registered wrapper chain (error boundary) so the page body is the
 * depth-0 render that receives the root state seeds.
 */
function renderPage(component, props, react) {
  let node = component(props)
  for (;;) {
    if (Array.isArray(node)) { node = node[0]; continue }
    if (node !== null && typeof node === 'object' && typeof node.type === 'function') {
      if (node.type.prototype !== undefined && typeof node.type.prototype.render === 'function') {
        node = new node.type(node.props).render()
        continue
      }
      node = node.type(node.props)
      break // the page body ran; stop so it stays the depth-0 render below
    }
    break
  }
  return deepRender(node, react)
}

function deepRender(node, react, depth = 0) {
  if (node === null || node === undefined || typeof node !== 'object') return node
  if (Array.isArray(node)) return node.map((child) => deepRender(child, react, depth))
  const { type, props } = node
  if (typeof type === 'function') {
    // Class components (the error boundary) construct and render; in these
    // tests the boundary never holds an error, so its output is its children.
    if (type.prototype !== undefined && typeof type.prototype.render === 'function') {
      const instance = new type(props ?? {})
      return deepRender(instance.render(), react, depth + 1)
    }
    react.__enter(false)
    react.__named(type.name ?? '')
    const out = type(props ?? {})
    react.__enter(depth === 0)
    return deepRender(out, react, depth + 1)
  }
  if (props !== undefined && props.children !== undefined) {
    deepRender(props.children, react, depth + 1)
  }
  return node
}

/**
 * The same walk, collecting text and node matchers for assertions.
 *
 * The seeding order matters: `__enter(false)` restarts the index count, and
 * `__named` then points the count at the component's own seed map — doing them
 * the other way round cleared the seeds before the component ran, which is why
 * the old walk never actually rendered with them.
 */
function collect(node, react, found = { texts: [], nodes: [] }, depth = 0) {
  if (node === null || node === undefined || typeof node === 'boolean') return found
  if (Array.isArray(node)) {
    for (const child of node) collect(child, react, found, depth)
    return found
  }
  if (typeof node !== 'object') {
    found.texts.push(String(node))
    return found
  }
  const { type, props } = node
  if (typeof type === 'function') {
    react.__enter(false)
    react.__named(type.name ?? '')
    collect(type(props ?? {}), react, found, depth + 1)
    react.__enter(depth === 0)
    return found
  }
  found.nodes.push(node)
  if (props !== undefined && props.children !== undefined) collect(props.children, react, found, depth + 1)
  return found
}
const collectText = (node, react) => collect(node, react).texts.join(' ')
const collectNodes = (node, react, predicate) => collect(node, react).nodes.filter(predicate)

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
  const tree = renderPage(component, props, react)
  assert.notEqual(tree, null)
  deepRender(tree, react)
})

test('the knowledge view renders without throwing', async () => {
  // 43 = knowledgeOpen: the branch whose nested component exposed the bug above.
  const { component, props, react } = await mountPanel(new Map([
    [10, passage], [16, segmentation], [18, 'p1.s1'], [43, true],
  ]))
  react.__enter(true)
  renderPage(component, props, react)
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
  renderPage(component, props, react)
})

test('an open word entry renders without throwing', async () => {
  // 44 is `knowledgeEntryId`, 43 is `knowledgeOpen`: this path composes the entry header,
  // the card split by the Host's headings, and the conjugation slot inside its section.
  const { component, props, react } = await mountPanel(new Map([
    [10, passage], [16, segmentation], [18, 'p1.s1'], [43, true], [44, 'entry-1'], [45, 'vocab'],
  ]))
  react.__enter(true)
  renderPage(component, props, react)
})

test('the entry path can be walked, seeding what its effects would have loaded', async () => {
  // The seed map now lands on the real state indices: 5 is KnowledgeSection's
  // open card, so this walk reaches the card render itself.
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
    ['KnowledgeSection', new Map([[1, { entries: [entry], total: 1 }], [2, { entries: [], total: 0 }], [5, card]])],
  ]))
  react.__enter(true)
  renderPage(component, props, react)
})

/**
 * The knowledge detail page is entry-scoped (2026-10-09 acceptance):
 * a word's page is its card, and a grammar entry's page is its rule — the
 * whole-library list and the pending candidates belong to the library tab.
 */
test('a word entry page renders its card, never the grammar empty state nor the library list', async () => {
  const entry = {
    entryId: 'entry-1', mot: 'cœur', lemma: 'cœur', partOfSpeech: '名词',
    forms: [], provenance: 'user', status: 'draft', revision: 1,
    senses: [{ id: 's1', label: '名词', definition: '心；情感与直觉的所在。' }], sections: {}, sources: [], occurrences: [],
  }
  const card = {
    mot: 'cœur', entryId: 'entry-1',
    value: {
      kind: 'card',
      rendered: '§1 词条总览\n词形 cœur\n§2 释义\n心；情感与直觉的所在。',
      sections: [
        { number: '§1', title: '词条总览', required: true },
        { number: '§2', title: '释义', required: true },
      ],
      errors: [], hints: [],
    },
  }
  const { component, props, react } = await mountPanel(new Map([
    [10, passage], [16, segmentation], [18, 'p1.s1'], [43, true], [44, 'entry-1'], [45, 'vocab'],
  ]), new Map([
    ['KnowledgeEntry', new Map([[0, entry]])],
    ['KnowledgeSection', new Map([[5, card]])],
  ]))
  react.__enter(true)
  const tree = renderPage(component, props, react)
  const text = collectText(tree, react)
  assert.match(text, /词形 cœur/u, 'the card body is on the page')
  assert.match(text, /心；情感与直觉的所在/u, 'the definition is on the page')
  assert.equal(text.includes('语法库还是空的'), false, 'no wrong empty state on a word page')
  assert.equal(
    collectNodes(tree, react, (node) => node.props?.className === 'fr-entryList').length, 0,
    'the whole-library list is not part of one entry’s page',
  )
})

test('a verb entry renders its card and its conjugation slot (R7-B01)', async () => {
  // The verb card is the one that carries §4: it is the path that mounted
  // ConjugationView, whose undefined face entry used to unmount the whole panel.
  const entry = {
    entryId: 'entry-1', mot: 'arrivée', lemma: 'arriver', partOfSpeech: '动词',
    forms: ['arrivé', 'arriver'], provenance: 'user', status: 'draft', revision: 1,
    senses: [{ id: 's1', label: '到达', definition: '到达；抵达。' }], sections: {}, sources: [], occurrences: [],
  }
  const card = {
    mot: 'arrivée', entryId: 'entry-1',
    value: {
      kind: 'card',
      rendered: '§1 总览\n词形 arrivée · 原形 arriver · 词性 动词\n§2 当前含义\n1. 到达；抵达。（到达）',
      sections: [
        { number: '§1', title: '总览', required: true },
        { number: '§2', title: '当前含义', required: true },
        { number: '§4', title: '动词变位', required: false },
      ],
      errors: [], hints: [],
    },
  }
  const { component, props, react } = await mountPanel(new Map([
    [10, passage], [16, segmentation], [18, 'p1.s1'], [43, true], [44, 'entry-1'], [45, 'vocab'],
  ]), new Map([
    ['KnowledgeEntry', new Map([[0, entry]])],
    ['KnowledgeSection', new Map([[5, card]])],
  ]))
  react.__enter(true)
  const tree = renderPage(component, props, react)
  const text = collectText(tree, react)
  assert.match(text, /词形 arrivée/u, 'the card body is on the page')
  assert.match(text, /动词变位/u, 'the conjugation section the verb card announces is reachable')
  assert.match(text, /arriver/u, 'and it names the lemma it would conjugate')
})

test('a grammar entry page renders its own rule, not the whole library', async () => {
  const entry = {
    entryId: 'g1', topic: 'Étant donné que 引导原因从句', keyPoints: 'étant donné que + 从句表原因。',
    module: '状语从句', mastery: 'learning', askCount: 1, level: 'B1', contentStatus: 'ai-unverified',
    pitfalls: 0,
  }
  const { component, props, react } = await mountPanel(new Map([
    [10, passage], [16, segmentation], [18, 'p1.s1'], [43, true], [44, 'g1'], [45, 'grammar'],
  ]), new Map([
    ['KnowledgeEntry', new Map([[0, entry]])],
  ]))
  react.__enter(true)
  const tree = renderPage(component, props, react)
  const text = collectText(tree, react)
  assert.match(text, /étant donné que \+ 从句表原因。/u, 'the entry’s own rule is on the page')
  assert.equal(text.includes('待审候选'), false, 'global pending candidates are not the entry’s content')
  assert.equal(
    collectNodes(tree, react, (node) => node.props?.className === 'fr-entryList').length, 0,
    'no library list below the rule',
  )
})

test('the library grammar tab carries the pending candidates, clearly sectioned', async () => {
  const grammar = {
    entries: [{
      entryId: 'g1', topic: 'Étant donné que 引导原因从句', keyPoints: '…', module: '状语从句',
      mastery: 'learning', askCount: 1, level: 'B1', contentStatus: 'ai-unverified', pitfalls: 0,
    }],
    pending: [{
      pendingId: 'pd1', topic: 'que 作关系代词', body: '…', resolution: null,
      candidates: [{ entryId: 'g1', topic: 'Étant donné que 引导原因从句' }],
    }],
  }
  // 78 is the page's `knowledgeList` view state: the library tab lives there now,
  // so opening an entry and coming back cannot reset it (R7-B04).
  const { component, props, react } = await mountPanel(new Map([
    [10, passage], [16, segmentation], [18, 'p1.s1'], [43, true], [44, null],
    [78, { tab: 'grammar', query: '', mastery: 'all' }],
  ]), new Map([
    ['KnowledgeLibrary', new Map([[1, grammar]])],
  ]))
  react.__enter(true)
  const tree = renderPage(component, props, react)
  const text = collectText(tree, react)
  assert.match(text, /待审候选/u, 'the pending section is titled as itself')
  assert.match(text, /que 作关系代词/u, 'and the candidate is listed in it')
})
