import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { webcrypto } from 'node:crypto'

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const passage = { id: 'parent', title: '第 3 章', sourceText: 'Je lis.', sourceRevision: 1 }

async function panel(services = {}, browser = {}) {
  let stateIndex = 0, refIndex = 0, registration, component, props
  // The panel gained three archive-list state slots. Keep older test call sites
  // expressed in their established indices while storing current React indices.
  const toRuntimeStateIndex = (index) => typeof index === 'number' && index > 0 ? index + 3 : index
  const stateValues = new Map([[13, passage], [19, { paragraphs: [] }]])
  const values = {
    get: (index) => stateValues.get(toRuntimeStateIndex(index)),
    set: (index, value) => { stateValues.set(toRuntimeStateIndex(index), value); return values },
    values: () => stateValues.values(),
    *[Symbol.iterator]() {
      for (const [index, value] of stateValues) yield [index > 0 ? index - 3 : index, value]
    },
  }
  const refs = []
  const effects = []
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) {
      const index = stateIndex++
      if (!stateValues.has(index)) stateValues.set(index, initial)
      return [stateValues.get(index), (next) => stateValues.set(index, typeof next === 'function' ? next(stateValues.get(index)) : next)]
    },
    useRef(initial) { const index = refIndex++; return refs[index] ??= { current: initial } },
    useEffect(factory) { effects.push(factory) }, useLayoutEffect() {}, useCallback: (fn) => fn, useMemo: (fn) => fn(),
  }
  const storage = new Map()
  const memoryStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) }
  const context = vm.createContext({
    window: { __ModuleLoader__: { load: (value) => { registration = value } } }, console,
    setTimeout: (...args) => setTimeout(...args).unref(), clearTimeout,
    TextEncoder, crypto: webcrypto, AbortController, sessionStorage: memoryStorage, localStorage: memoryStorage, ...browser,
  })
  vm.runInContext(source, context)
  const api = new Proxy(services, { get: (target, key) => target[key] ?? (async () => ({ ok: true, value: {} })) })
  let dictionaries
  const ctx = {
    effect: (factory) => factory(),
    locale: { register: (_ns, value) => { dictionaries = value }, bind: () => (key) => dictionaries.zh?.[key] ?? key },
    plugin: (child) => { child?.apply?.(ctx); return { dispose() {} } },
    layout: { selectPanel() {} },
    slots: { inject: (_name, factory) => factory(), register: (declaration, value) => {
      if (declaration.name === 'main') { component = value; props = declaration.inject() }
      return () => {}
    } },
    remote: { frenchReader: api, $mount: async () => async () => {} },
  }
  await registration.factory(() => React).apply(ctx)
  return { render() { stateIndex = 0; refIndex = 0; return component(props) }, values, effects, refs, storage, memoryStorage }
}
function all(node, predicate) {
  if (node == null || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap((child) => all(child, predicate))
  return [...(predicate(node) ? [node] : []), ...all(node.props?.children, predicate)]
}
function text(node) {
  if (node == null) return ''
  if (Array.isArray(node)) return node.map(text).join('')
  return typeof node === 'object' ? text(node.props?.children) : String(node)
}
function button(tree, label) { return all(tree, (node) => node.type === 'button' && text(node) === label)[0] }
const ok = (value) => ({ ok: true, value })
const submit = { preventDefault() {} }

test('route keyboard zoom, pan, and Escape execute the component handlers', async () => {
  const p = await panel()
  const stage = () => all(p.render(), (node) => node.props?.className === 'navStage')[0]
  const target = {}
  let prevented = 0
  const press = (key, extras = {}) => stage().props.onKeyDown({ key, target, currentTarget: target,
    preventDefault() { prevented += 1 }, stopPropagation() {}, ...extras })
  const camera = () => [...p.values.values()].find((value) => value && typeof value === 'object' && typeof value.scale === 'number')
  p.render()
  const original = { ...camera() }
  press('+')
  assert.equal(camera().scale, original.scale * 1.25)
  press('-')
  assert.equal(camera().scale, original.scale)
  const x = camera().x
  press('ArrowRight')
  assert.equal(camera().x, x - 40)
  press('Escape', { isComposing: true })
  assert.ok(button(p.render(), '收起路线'))
  press('Escape')
  assert.ok(button(p.render(), '打开路线'))
  assert.equal(prevented, 4)
})

test('knowledge navigation closes the route overlay before showing the library', async () => {
  const p = await panel()
  assert.ok(button(p.render(), '收起路线'))
  button(p.render(), '知识库').props.onClick()
  const tree = p.render()
  assert.ok(button(tree, '打开路线'))
  assert.ok(all(tree, (node) => node.type === 'section' && node.props['aria-label'] === '知识库')[0])
})

test('continue reading restores the exact sentence, discussion branch and scroll position', async () => {
  const point = { schemaVersion: 1, passageId: 'parent', title: '第 3 章', sourceRevision: 1,
    anchorId: 'p1.s1', anchorText: 'Je lis.', branchId: 'b1', scrollTop: 72, book: 'Livre', chapter: 'Chapitre 1' }
  const storage = new Map([['french-close-reading/last-position-v1', JSON.stringify(point)]])
  const scroll = { scrollTop: 0 }
  const p = await panel({
    getPassage: async () => ok({ passage }),
    getSegmentation: async () => ok({ segmentation: { paragraphs: [{ id: 'p1', text: 'Je lis.', start: 0, end: 7, sentences: [{ id: 'p1.s1', text: 'Je lis.', start: 0, end: 7 }] }] } }),
    listDiscussion: async () => ok({ branches: [{ branchId: 'b1', anchorId: 'p1.s1', parentId: null, kind: 'note', title: '讨论', status: 'open' }], conclusions: [] }),
    listAnalysis: async () => ok({ analysis: { covered: [] } }),
  }, {
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    requestAnimationFrame: (callback) => callback(),
  })
  p.values.set(0, [passage])
  const initialTree = p.render()
  const resumeButton = button(initialTree, '继续上次阅读')
  assert.ok(resumeButton, text(initialTree).slice(-400))
  resumeButton.props.onClick()
  await new Promise((resolve) => setImmediate(resolve))
  p.render()
  p.effects.filter((factory) => factory.toString().includes('loadDiscussion(activePassage.id)')).at(-1)()
  await new Promise((resolve) => setImmediate(resolve))
  const tree = p.render()
  all(tree, (node) => node.props?.className === 'detailScroll')[0].props.ref.current = scroll
  p.effects.filter((factory) => factory.toString().includes('point.anchorMatched') && factory.toString().includes('readingLoadedFor.current')).at(-1)()

  assert.ok([...p.values.values()].includes('p1.s1'))
  assert.ok([...p.values.values()].some((value) => value?.id === 'b1'))
  assert.equal(scroll.scrollTop, 72)
  assert.equal(JSON.parse(storage.get('french-close-reading/last-position-v1')).anchorId, 'p1.s1')
})

test('reading-position storage is read once per mounted reader', async () => {
  let positionReads = 0
  const p = await panel({}, { localStorage: { getItem: (key) => {
    if (key === 'french-close-reading/last-position-v1') positionReads += 1
    return null
  }, setItem() {}, removeItem() {} } })
  p.render(); p.render(); p.render()
  assert.equal(positionReads, 1)
})

test('a revised source relocates a uniquely matching sentence before resuming', async () => {
  const point = { schemaVersion: 1, passageId: 'parent', title: '第 3 章', sourceRevision: 1,
    anchorId: 'p1.s1', anchorText: 'Je lis.', branchId: null, scrollTop: 88, book: '', chapter: '' }
  const storage = new Map([['french-close-reading/last-position-v1', JSON.stringify(point)]])
  const scroll = { scrollTop: 0 }
  const currentPassage = { ...passage, sourceRevision: 2, sourceText: 'Bonjour.\n\nJe lis.' }
  const p = await panel({
    getPassage: async () => ok({ passage: currentPassage }),
    getSegmentation: async () => ok({ segmentation: { paragraphs: [
      { id: 'p1', text: 'Bonjour.', start: 0, end: 8, sentences: [{ id: 'p1.s1', text: 'Bonjour.', start: 0, end: 8 }] },
      { id: 'p2', text: 'Je lis.', start: 10, end: 17, sentences: [{ id: 'p2.s1', text: 'Je lis.', start: 10, end: 17 }] },
    ] } }),
    listDiscussion: async () => ok({ branches: [], conclusions: [] }),
    listAnalysis: async () => ok({ analysis: { covered: [] } }),
  }, {
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    requestAnimationFrame: (callback) => callback(),
  })
  p.values.set(0, [currentPassage])
  button(p.render(), '继续上次阅读').props.onClick()
  await new Promise((resolve) => setImmediate(resolve))
  p.render()
  p.effects.filter((factory) => factory.toString().includes('loadDiscussion(activePassage.id)')).at(-1)()
  await new Promise((resolve) => setImmediate(resolve))
  const tree = p.render()
  all(tree, (node) => node.props?.className === 'detailScroll')[0].props.ref.current = scroll
  p.effects.filter((factory) => factory.toString().includes('point.anchorMatched') && factory.toString().includes('readingLoadedFor.current')).at(-1)()
  const restored = p.render()
  assert.ok([...p.values.values()].includes('p2.s1'))
  assert.equal(scroll.scrollTop, 88)
  assert.match(text(restored), /原文版本已更新/u)
  const saved = JSON.parse(storage.get('french-close-reading/last-position-v1'))
  assert.equal(saved.sourceRevision, 2)
  assert.equal(saved.anchorId, 'p2.s1')
})

test('a revised source with no unique sentence match returns to the start with a warning', async () => {
  const point = { schemaVersion: 1, passageId: 'parent', title: '第 3 章', sourceRevision: 1,
    anchorId: 'p1.s1', anchorText: 'Je lis.', branchId: null, scrollTop: 72, book: '', chapter: '' }
  const storage = new Map([['french-close-reading/last-position-v1', JSON.stringify(point)]])
  const scroll = { scrollTop: 72 }
  const currentPassage = { ...passage, sourceRevision: 2, sourceText: 'Bonjour. Salut.' }
  const p = await panel({
    getPassage: async () => ok({ passage: currentPassage }),
    getSegmentation: async () => ok({ segmentation: { paragraphs: [{ id: 'p1', text: 'Bonjour. Salut.', start: 0, end: 15, sentences: [
      { id: 'p1.s1', text: 'Bonjour.', start: 0, end: 8 }, { id: 'p1.s2', text: 'Salut.', start: 9, end: 15 },
    ] }] } }),
    listDiscussion: async () => ok({ branches: [], conclusions: [] }),
    listAnalysis: async () => ok({ analysis: { covered: [] } }),
  }, {
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    requestAnimationFrame: (callback) => callback(),
  })
  p.values.set(0, [currentPassage])
  button(p.render(), '继续上次阅读').props.onClick()
  await new Promise((resolve) => setImmediate(resolve))
  p.render()
  p.effects.filter((factory) => factory.toString().includes('loadDiscussion(activePassage.id)')).at(-1)()
  await new Promise((resolve) => setImmediate(resolve))
  const tree = p.render()
  all(tree, (node) => node.props?.className === 'detailScroll')[0].props.ref.current = scroll
  p.effects.filter((factory) => factory.toString().includes('point.anchorMatched') && factory.toString().includes('readingLoadedFor.current')).at(-1)()
  const restored = p.render()

  assert.ok([...p.values.values()].includes('p1.s1'))
  assert.equal(scroll.scrollTop, 0, 'stale scroll offset is not applied')
  assert.match(text(restored), /原文已修订，无法唯一定位上次句子/u)
  assert.equal(JSON.parse(storage.get('french-close-reading/last-position-v1')).sourceRevision, 1, 'stale pointer is not silently rewritten')
})

test('a late passage response cannot replace the passage selected afterward', async () => {
  const responses = new Map()
  const slow = { ...passage, id: 'slow', title: 'Slow passage' }
  const fast = { ...passage, id: 'fast', title: 'Fast passage' }
  const p = await panel({ getPassage: ({ id }) => new Promise((resolve) => responses.set(id, resolve)) })
  p.values.set(0, [slow, fast])
  const choose = (title) => all(p.render(), (node) => node.type === 'button' && node.props.className?.includes('shelfPassage') && text(node).includes(title))[0].props.onClick()
  choose('Slow passage')
  choose('Fast passage')
  responses.get('fast')(ok({ passage: fast }))
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(p.values.get(10).id, 'fast')
  responses.get('slow')(ok({ passage: slow }))
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(p.values.get(10).id, 'fast')
})

async function openNext(panel) {
  button(panel.render(), '录入下一段').props.onClick()
  // Let the asynchronous list call and state updates finish.
  await new Promise((resolve) => setImmediate(resolve))
  return panel.render()
}

test('next title leaves chapter numbers alone and checks titles on later library pages', async () => {
  const offsets = []
  const p = await panel({ listPassages: async ({ offset }) => {
    offsets.push(offset)
    return ok({ items: [{ title: offset === 0 ? 'unrelated' : '第 3 章 · 段落 02' }], hasMore: offset === 0 })
  } })
  const tree = await openNext(p)
  assert.deepEqual(offsets, [0, 1])
  const title = all(tree, (node) => node.type === 'input' && node.props['aria-label'] === '标题')[0]
  assert.equal(title.props.value, '第 3 章 · 段落 03')
  all(tree, (node) => node.type === 'textarea')[0].props.onChange({ target: { value: 'Nous continuons.' } })
  button(p.render(), '返回当前段').props.onClick()
  const reopened = await openNext(p)
  assert.equal(all(reopened, (node) => node.type === 'textarea')[0].props.value, 'Nous continuons.')
})

test('preview then save preserves current passage and switches only on the next-reading click', async () => {
  const created = [], opened = []
  const next = { id: 'next', title: '第 3 章 · 段落 02', sourceText: 'Nous continuons.' }
  const p = await panel({
    listPassages: async () => ok({ items: [], hasMore: false }),
    previewImport: async () => ok({ paragraphs: 1, sentences: 1 }),
    createPassage: async (request) => { created.push(request); return ok({ kind: 'saved', passage: next }) },
    getPassage: async ({ id }) => { opened.push(id); return ok({ passage: next }) },
  })
  let tree = await openNext(p)
  all(tree, (node) => node.type === 'textarea')[0].props.onChange({ target: { value: next.sourceText } })
  await all(p.render(), (node) => node.type === 'form')[0].props.onSubmit(submit)
  tree = p.render()
  assert.match(text(tree), /将切分为 1 段、1 句/u)
  assert.equal(created.length, 0)
  assert.ok(button(tree, '保存，继续当前段'))
  await all(tree, (node) => node.type === 'form')[0].props.onSubmit(submit)
  tree = p.render()
  assert.equal(created.length, 1)
  assert.equal(p.values.get(10).id, 'parent')
  assert.deepEqual(opened, [])
  assert.ok(button(tree, '开始下一段'))
  button(tree, '开始下一段').props.onClick()
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(opened, ['next'])
  assert.equal(p.values.get(10).id, 'next')
  tree = await openNext(p)
  assert.equal(all(tree, (node) => node.type === 'input' && node.props['aria-label'] === '标题')[0].props.value, '第 3 章 · 段落 03')
})

test('failed preview cannot save and shows its error inside the dialog', async () => {
  let created = 0
  const p = await panel({
    listPassages: async () => ok({ items: [], hasMore: false }),
    previewImport: async () => { throw new Error('offline') },
    createPassage: async () => { created++; return ok({}) },
  })
  const tree = await openNext(p)
  all(tree, (node) => node.type === 'textarea')[0].props.onChange({ target: { value: 'Je lis.' } })
  for (let i = 0; i < 2; i++) await all(p.render(), (node) => node.type === 'form')[0].props.onSubmit(submit)
  assert.equal(created, 0)
  const dialog = all(p.render(), (node) => node.props?.role === 'dialog')[0]
  assert.match(text(dialog), /offline/u)
  assert.ok(button(dialog, '预览切分'))
})

test('route toggle and zoom handlers change their displayed state', async () => {
  const p = await panel()
  let tree = p.render()
  const toggle = all(tree, (node) => node.props?.className === 'navToggle')[0]
  const wasOpen = toggle.props['aria-expanded'] === 'true'
  toggle.props.onClick()
  tree = p.render()
  assert.equal(button(tree, wasOpen ? '打开路线' : '收起路线')?.props['aria-expanded'], wasOpen ? 'false' : 'true')
  const before = text(all(tree, (node) => node.props?.id === 'navScale')[0])
  all(tree, (node) => node.props?.['aria-label'] === '放大')[0].props.onClick()
  tree = p.render()
  assert.notEqual(text(all(tree, (node) => node.props?.id === 'navScale')[0]), before)
  all(tree, (node) => node.props?.['aria-label'] === '缩小')[0].props.onClick()
  assert.equal(text(all(p.render(), (node) => node.props?.id === 'navScale')[0]), before)
})

function field(tree, label) { return all(tree, (node) => node.type === 'input' && node.props['aria-label'] === label)[0] }
function enter(tree, label, value) { field(tree, label).props.onChange({ target: { value } }) }

test('book and chapter creation is local and the tree can accept a passage within that chapter', async () => {
  let writes = 0
  const p = await panel({ createPassage: async () => { writes++; return ok({}) } })
  button(p.render(), '添加书籍').props.onClick()
  enter(p.render(), '书名', 'Pensées')
  enter(p.render(), '章节', 'Fragment 277')
  button(p.render(), '保存位置').props.onClick()
  let tree = p.render()
  assert.equal(writes, 0)
  assert.match(text(all(tree, (node) => node.props?.id === 'book-directory')[0]), /PenséesFragment 277/u)
  button(tree, '＋ 录入段落').props.onClick()
  tree = p.render()
  assert.equal(field(tree, '书名').props.value, 'Pensées')
  assert.equal(field(tree, '章节').props.value, 'Fragment 277')
  assert.equal(field(tree, '段落序号').props.value, 1)
})

test('filing a passage updates the tree and breadcrumbs, and continuation inherits its chapter', async () => {
  const p = await panel({ listPassages: async () => ok({ items: [passage], hasMore: false }) })
  button(p.render(), '归类与排序').props.onClick()
  enter(p.render(), '书名', 'Book A')
  enter(p.render(), '章节', 'Chapter 2')
  enter(p.render(), '段落序号', '7')
  button(p.render(), '保存位置').props.onClick()
  p.values.set(19, { paragraphs: [{ id: 'p1', text: 'Je lis.', start: 0, end: 7, sentences: [{ id: 'p1.s1', text: 'Je lis.', start: 0, end: 7 }] }] })
  let tree = p.render()
  assert.match(text(tree), /Book A \/ Chapter 2 \/ 段落 7/u)
  const routeChapter = all(tree, (node) => node.props?.className === 'chapterHeading')[0]
  assert.match(text(routeChapter), /Chapter 2/u, 'route uses the saved chapter name instead of its generic ordinal')
  tree = await openNext(p)
  assert.equal(field(tree, '书名').props.value, 'Book A')
  assert.equal(field(tree, '章节').props.value, 'Chapter 2')
  assert.equal(field(tree, '段落序号').props.value, 8)
  button(tree, '返回当前段').props.onClick()
  button(p.render(), '归类与排序').props.onClick()
  button(p.render(), '移出书籍').props.onClick()
  assert.match(text(p.render()), /未归类/u)
  assert.ok(button(p.render(), '移除空书籍'))
})

test('reading tools have one analyse action in the sentence workspace and no global analyse button', async () => {
  const p = await panel()
  p.values.set(18, 'p1.s1')
  const tree = p.render()
  const header = all(tree, (node) => node.type === 'header')[0]
  assert.equal(button(header, '预览材料并解析'), undefined)
  const workbench = all(tree, (node) => node.props?.className === 'sentenceWorkspace')[0]
  assert.ok(button(workbench, '预览材料并解析'))
  assert.equal(all(tree, (node) => node.type === 'button' && text(node) === '预览材料并解析').length, 1)
  assert.equal(button(tree, '▷ 发音'), undefined, 'no unusable pronunciation control remains in the reading toolbar')
  const context = all(tree, (node) => node.props?.className === 'readingSource')[0]
  assert.equal(context.type, 'details')
})

test('a late failed read cannot blank the newer passage or show its error', async () => {
  const responses = new Map()
  const slow = { ...passage, id: 'slow', title: 'Slow passage' }
  const fast = { ...passage, id: 'fast', title: 'Fast passage' }
  const p = await panel({ getPassage: ({ id }) => new Promise((resolve, reject) => responses.set(id, { resolve, reject })) })
  p.values.set(0, [slow, fast])
  const choose = (title) => all(p.render(), (node) => node.type === 'button' && node.props.className?.includes('shelfPassage') && text(node).includes(title))[0].props.onClick()
  choose('Slow passage'); choose('Fast passage')
  responses.get('fast').resolve(ok({ passage: fast }))
  await new Promise((resolve) => setImmediate(resolve))
  responses.get('slow').reject(new Error('old request failed'))
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(p.values.get(10).id, 'fast')
  assert.equal(p.values.get(14), '')
  assert.equal(p.values.get(5), false)
})

test('returning to the bookshelf invalidates an unfinished passage read', async () => {
  let resolveRead
  const p = await panel({ getPassage: () => new Promise((resolve) => { resolveRead = resolve }) })
  p.values.set(0, [passage])
  all(p.render(), (node) => node.type === 'button' && node.props.className?.includes('shelfPassage'))[0].props.onClick()
  button(p.render(), '书架').props.onClick()
  resolveRead(ok({ passage }))
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(p.values.get(10), null)
  assert.equal(p.values.get(5), false)
  assert.equal(p.values.get(9), '')
})

test('selecting A again does not accept the first unfinished read of A', async () => {
  const responses = []
  const a = { ...passage, id: 'a', title: 'Passage A' }
  const b = { ...passage, id: 'b', title: 'Passage B' }
  const p = await panel({ getPassage: () => new Promise((resolve) => responses.push(resolve)) })
  p.values.set(0, [a, b])
  const choose = (title) => all(p.render(), (node) => node.type === 'button' && node.props.className?.includes('shelfPassage') && text(node).includes(title))[0].props.onClick()
  choose('Passage A'); choose('Passage B'); choose('Passage A')
  responses[2](ok({ passage: { ...a, sourceText: 'Latest A' } }))
  await new Promise((resolve) => setImmediate(resolve))
  responses[0](ok({ passage: { ...a, sourceText: 'Obsolete A' } }))
  responses[1](ok({ passage: b }))
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(p.values.get(10).sourceText, 'Latest A')
})

test('the discussion dialog ignores composing Escape and closes on normal Escape', async () => {
  const p = await panel()
  button(p.render(), '＋ 讨论').props.onClick()
  const dialog = all(p.render(), (node) => node.props?.role === 'dialog' && node.props['aria-labelledby'] === 'modalTitle')[0]
  assert.ok(dialog)
  const event = { key: 'Escape', isComposing: true, preventDefault() {}, stopPropagation() {} }
  dialog.props.onKeyDown(event)
  assert.ok(all(p.render(), (node) => node.props?.role === 'dialog' && node.props['aria-labelledby'] === 'modalTitle').length)
  event.isComposing = false
  dialog.props.onKeyDown(event)
  assert.equal(all(p.render(), (node) => node.props?.role === 'dialog' && node.props['aria-labelledby'] === 'modalTitle').length, 0)
})

test('lookup dialog supports composing Escape and ordinary Escape', async () => {
  const p = await panel()
  button(p.render(), '查词').props.onClick()
  const dialog = all(p.render(), (node) => node.props?.role === 'dialog' && node.props['aria-labelledby'] === 'lookupTitle')[0]
  const event = { key: 'Escape', isComposing: true, preventDefault() {}, stopPropagation() {} }
  dialog.props.onKeyDown(event)
  assert.equal(all(p.render(), (node) => node.props?.role === 'dialog' && node.props['aria-labelledby'] === 'lookupTitle').length, 1)
  event.isComposing = false
  dialog.props.onKeyDown(event)
  assert.equal(all(p.render(), (node) => node.props?.role === 'dialog' && node.props['aria-labelledby'] === 'lookupTitle').length, 0)
})

test('a lookup result from the previous passage cannot replace the current node', async () => {
  let resolveLookup
  const fast = { ...passage, id: 'fast', title: 'Fast passage' }
  const p = await panel({ lookupMot: () => new Promise((resolve) => { resolveLookup = resolve }), getPassage: async () => ok({ passage: fast }) })
  p.values.set(0, [fast])
  button(p.render(), '查词').props.onClick()
  all(p.render(), (node) => node.props?.id === 'lookupInput')[0].props.onChange({ target: { value: 'ancien' } })
  button(p.render(), '查阅').props.onClick()
  all(p.render(), (node) => node.type === 'button' && node.props.className?.includes('shelfPassage'))[0].props.onClick()
  await new Promise((resolve) => setImmediate(resolve))
  resolveLookup(ok({ found: true, entries: [{ senses: [{ definition: 'Obsolete definition' }] }], candidates: [] }))
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal([...p.values.values()].some((value) => value?.id === 'lookup-ancien'), false)
})

test('next-paragraph preparation does not open its dialog after switching passages', async () => {
  let resolveList
  const fast = { ...passage, id: 'fast', title: 'Fast passage' }
  const p = await panel({ listPassages: () => new Promise((resolve) => { resolveList = resolve }), getPassage: async () => ok({ passage: fast }) })
  p.values.set(0, [fast])
  const preparing = button(p.render(), '录入下一段').props.onClick()
  all(p.render(), (node) => node.type === 'button' && node.props.className?.includes('shelfPassage'))[0].props.onClick()
  await new Promise((resolve) => setImmediate(resolve))
  resolveList(ok({ items: [], hasMore: false }))
  await preparing
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(all(p.render(), (node) => node.props?.role === 'dialog' && node.props['aria-labelledby'] === 'switchTitle').length, 0)
  assert.equal(p.values.get(10).id, 'fast')
})

test('two overlapping lookups keep the newer word result', async () => {
  const responses = []
  const p = await panel({ lookupMot: () => new Promise((resolve) => responses.push(resolve)) })
  const lookup = (word) => {
    button(p.render(), '查词').props.onClick()
    all(p.render(), (node) => node.props?.id === 'lookupInput')[0].props.onChange({ target: { value: word } })
    button(p.render(), '查阅').props.onClick()
  }
  lookup('ancien'); lookup('nouveau')
  const result = (definition) => ok({ found: true, entries: [{ senses: [{ definition }] }], candidates: [] })
  responses[1](result('New definition'))
  await new Promise((resolve) => setImmediate(resolve))
  responses[0](result('Old definition'))
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal([...p.values.values()].some((value) => value?.id === 'lookup-nouveau'), true)
  assert.equal([...p.values.values()].some((value) => value?.id === 'lookup-ancien'), false)
})

test('a lookup result does not replace the view after changing sentence', async () => {
  let resolveLookup
  const p = await panel({ lookupMot: () => new Promise((resolve) => { resolveLookup = resolve }) })
  button(p.render(), '查词').props.onClick()
  all(p.render(), (node) => node.props?.id === 'lookupInput')[0].props.onChange({ target: { value: 'ancien' } })
  button(p.render(), '查阅').props.onClick()
  p.values.set(18, 'p1.s2')
  p.render()
  resolveLookup(ok({ found: false, entries: [], candidates: [] }))
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal([...p.values.values()].some((value) => value?.id === 'lookup-ancien'), false)
})

test('editing previewed text returns the composer to preview before saving', async () => {
  let created = 0
  const p = await panel({ listPassages: async () => ok({ items: [], hasMore: false }), previewImport: async () => ok({ paragraphs: 1, sentences: 1 }), createPassage: async () => { created++; return ok({ passage }) } })
  await openNext(p)
  all(p.render(), (node) => node.type === 'textarea' && node.props['aria-label'] === '法语原文')[0].props.onChange({ target: { value: 'Je lis.' } })
  await all(p.render(), (node) => node.type === 'form')[0].props.onSubmit({ preventDefault() {} })
  await new Promise((resolve) => setImmediate(resolve))
  assert.ok(button(p.render(), '保存，继续当前段'))
  all(p.render(), (node) => node.type === 'textarea' && node.props['aria-label'] === '法语原文')[0].props.onChange({ target: { value: 'Je continue.' } })
  assert.ok(button(p.render(), '预览切分'))
  assert.equal(button(p.render(), '保存，继续当前段'), undefined)
  assert.equal(created, 0)
})

test('cancelling invalid next-paragraph input clears its error from the reading page', async () => {
  for (const method of ['button', 'Escape']) {
    const p = await panel({ listPassages: async () => ok({ items: [], hasMore: false }) })
    await openNext(p)
    await all(p.render(), (node) => node.type === 'form')[0].props.onSubmit({ preventDefault() {} })
    assert.equal(p.values.get(14), '请粘贴法语原文。')
    assert.equal(all(p.render(), (node) => node.props?.role === 'alert').length, 1)
    if (method === 'button') button(p.render(), '返回当前段').props.onClick()
    else all(p.render(), (node) => node.props?.role === 'dialog' && node.props['aria-labelledby'] === 'switchTitle')[0].props.onKeyDown({ key: 'Escape', isComposing: false, preventDefault() {}, stopPropagation() {} })
    assert.equal(p.values.get(14), '')
    assert.equal(p.values.get(10).id, 'parent')
    assert.equal(all(p.render(), (node) => node.props?.role === 'dialog').length, 0)
  }
})

test('lookup results show the word and return to analysis without claiming a confirmed conclusion', async () => {
  const p = await panel({ lookupMot: async () => ok({ found: true, entries: [{ senses: [{ definition: '心；情感与直觉的所在。' }] }], candidates: [] }) })
  button(p.render(), '查词').props.onClick()
  all(p.render(), (node) => node.props?.id === 'lookupInput')[0].props.onChange({ target: { value: 'cœur' } })
  button(p.render(), '查阅').props.onClick()
  await new Promise((resolve) => setImmediate(resolve))
  const result = all(p.render(), (node) => node.props?.className === 'lookupResult')[0]
  assert.ok(result)
  assert.match(text(result), /cœur/u)
  assert.match(text(result), /心；情感与直觉的所在/u)
  assert.doesNotMatch(text(result), /已确认的学习结论|返回来源讨论/u)
  button(p.render(), '← 返回解析').props.onClick()
  assert.equal(all(p.render(), (node) => node.props?.className === 'lookupResult').length, 0)
})

test('repeated compact resizes preserve the route preference from the wide layout', async () => {
  let resize
  class Observer {
    constructor(callback) { resize = callback }
    observe() {}
    disconnect() {}
  }
  const p = await panel({}, { ResizeObserver: Observer })
  let box = { width: 1280, height: 900 }
  const root = all(p.render(), (node) => node.props?.className === 'fr-root bookLayout')[0]
  root.props.ref.current = { getBoundingClientRect: () => box }
  p.effects.find((factory) => factory.toString().includes('wideNavPreference.current'))()
  assert.ok(button(p.render(), '收起路线'))
  box = { width: 390, height: 844 }; resize()
  assert.ok(button(p.render(), '打开路线'))
  box = { width: 320, height: 568 }; resize()
  box = { width: 844, height: 390 }; resize()
  box = { width: 1280, height: 900 }; resize()
  assert.ok(button(p.render(), '收起路线'))
  button(p.render(), '收起路线').props.onClick()
  box = { width: 390, height: 844 }; resize()
  box = { width: 320, height: 568 }; resize()
  box = { width: 1280, height: 900 }; resize()
  assert.ok(button(p.render(), '打开路线'))
})


test('new-passage preview and save prevent switching to the list until their responses settle', async () => {
  let resolvePreview, resolveSave, markSaveStarted
  const saveStarted = new Promise((resolve) => { markSaveStarted = resolve })
  const p = await panel({
    previewImport: () => new Promise((resolve) => { resolvePreview = resolve }),
    createPassage: () => new Promise((resolve) => { resolveSave = resolve; markSaveStarted() }),
  })
  button(p.render(), '段落管理').props.onClick()
  button(p.render(), '新建段落').props.onClick()
  enter(p.render(), '标题', 'Test passage')
  all(p.render(), (node) => node.type === 'textarea')[0].props.onChange({ target: { value: 'Je lis.' } })
  const pending = all(p.render(), (node) => node.type === 'form')[0].props.onSubmit(submit)
  const locked = button(p.render(), '段落列表').props.disabled
  assert.ok(button(p.render(), '正在预览切分…'))
  resolvePreview(ok({ paragraphs: 1, sentences: 1 }))
  await pending
  assert.equal(locked, true)
  assert.equal(button(p.render(), '段落列表').props.disabled, false)
  assert.ok(button(p.render(), '确认保存'))
  const saving = all(p.render(), (node) => node.type === 'form')[0].props.onSubmit(submit)
  await saveStarted
  const saveLocked = button(p.render(), '段落列表').props.disabled
  assert.ok(button(p.render(), '正在安全保存…'))
  resolveSave(ok({ kind: 'conflict', reason: 'limit-reached' }))
  await saving
  assert.equal(saveLocked, true)
  assert.equal(button(p.render(), '段落列表').props.disabled, false)
  assert.match(text(all(p.render(), (node) => node.props?.role === 'dialog')[0]), /250/u)
})


test('continuation skips chapter numbers occupied after a title collision advances its suffix', async () => {
  const p = await panel({
    listPassages: async () => ok({ items: [{ title: '第 3 章 · 段落 02' }], hasMore: false }),
    previewImport: async () => ok({ paragraphs: 1, sentences: 1 }),
  })
  button(p.render(), '归类与排序').props.onClick()
  enter(p.render(), '书名', 'Book A')
  enter(p.render(), '章节', 'Chapter A')
  enter(p.render(), '段落序号', '1')
  button(p.render(), '保存位置').props.onClick()
  const [index, shelf] = [...p.values].find(([, value]) => value?.books && value?.placements)
  p.values.set(index, { ...shelf, placements: { ...shelf.placements,
    occupied: { book: 'Book A', chapter: 'Chapter A', number: 3 },
  } })
  let tree = await openNext(p)
  assert.equal(field(tree, '段落序号').props.value, 4)
  assert.equal(field(tree, '标题').props.value, '第 3 章 · 段落 04')
  all(tree, (node) => node.type === 'textarea')[0].props.onChange({ target: { value: 'Nous continuons.' } })
  await all(p.render(), (node) => node.type === 'form')[0].props.onSubmit(submit)
  assert.ok(button(p.render(), '保存，继续当前段'))
})


test('retrying a failed continuation save keeps the same operation and current reading', async () => {
  const requests = []
  const p = await panel({
    listPassages: async () => ok({ items: [], hasMore: false }),
    previewImport: async () => ok({ paragraphs: 1, sentences: 1 }),
    createPassage: async (request) => {
      requests.push(request)
      if (requests.length === 1) throw new Error('connection lost')
      return ok({ kind: 'already-saved', passage: { id: request.id, title: request.title, sourceText: request.sourceText } })
    },
  })
  await openNext(p)
  all(p.render(), (node) => node.type === 'textarea')[0].props.onChange({ target: { value: 'Nous continuons.' } })
  const form = () => all(p.render(), (node) => node.type === 'form')[0]
  await form().props.onSubmit(submit)
  await form().props.onSubmit(submit)
  assert.match(text(all(p.render(), (node) => node.props?.role === 'dialog')[0]), /connection lost/u)
  assert.equal(all(p.render(), (node) => node.type === 'textarea')[0].props.value, 'Nous continuons.')
  await form().props.onSubmit(submit)
  assert.equal(requests.length, 2)
  assert.deepEqual(requests[1], requests[0])
  assert.equal(p.values.get(10).id, 'parent')
  assert.ok(button(p.render(), '开始下一段'))
  assert.equal(all(p.render(), (node) => node.props?.role === 'dialog').length, 0)
})


test('ordinary new-passage entry does not reuse a cancelled continuation draft', async () => {
  const p = await panel({ listPassages: async () => ok({ items: [], hasMore: false }) })
  await openNext(p)
  all(p.render(), (node) => node.type === 'textarea')[0].props.onChange({ target: { value: 'Continuation draft.' } })
  button(p.render(), '返回当前段').props.onClick()
  button(p.render(), '段落管理').props.onClick()
  button(p.render(), '新建段落').props.onClick()
  const newTree = p.render()
  assert.equal(field(newTree, '标题').props.value, '')
  assert.equal(all(newTree, (node) => node.type === 'textarea')[0].props.value, '')
  enter(newTree, '标题', 'Independent passage')
  all(p.render(), (node) => node.type === 'textarea')[0].props.onChange({ target: { value: 'Independent draft.' } })
  button(p.render(), '取消').props.onClick()
  button(p.render(), '取消').props.onClick()
  const nextTree = await openNext(p)
  assert.equal(field(nextTree, '标题').props.value, '第 3 章 · 段落 02')
  assert.equal(all(nextTree, (node) => node.type === 'textarea')[0].props.value, 'Continuation draft.')
})


test('chapter entry preserves a parked continuation including its preview and manual title', async () => {
  const p = await panel({
    listPassages: async () => ok({ items: [], hasMore: false }),
    previewImport: async () => ok({ paragraphs: 1, sentences: 1 }),
  })
  button(p.render(), '归类与排序').props.onClick()
  enter(p.render(), '书名', 'Book A')
  enter(p.render(), '章节', 'Chapter A')
  enter(p.render(), '段落序号', '7')
  button(p.render(), '保存位置').props.onClick()
  await openNext(p)
  enter(p.render(), '标题', 'Manually named continuation')
  all(p.render(), (node) => node.type === 'textarea')[0].props.onChange({ target: { value: 'Nous continuons.' } })
  await all(p.render(), (node) => node.type === 'form')[0].props.onSubmit(submit)
  button(p.render(), '返回当前段').props.onClick()
  button(p.render(), '＋ 录入段落').props.onClick()
  assert.equal(all(p.render(), (node) => node.type === 'textarea')[0].props.value, '')
  button(p.render(), '取消').props.onClick()
  button(p.render(), '取消').props.onClick()
  const tree = await openNext(p)
  assert.equal(field(tree, '标题').props.value, 'Manually named continuation')
  assert.equal(field(tree, '书名').props.value, 'Book A')
  assert.equal(field(tree, '段落序号').props.value, 8)
  assert.equal(all(tree, (node) => node.type === 'textarea')[0].props.value, 'Nous continuons.')
  assert.ok(button(tree, '保存，继续当前段'))
})


test('saving an independent passage leaves the parked continuation attached to its original parent', async () => {
  const records = new Map([['parent', passage]])
  const requests = []
  const p = await panel({
    listPassages: async () => ok({ items: [...records.values()], hasMore: false }),
    previewImport: async () => ok({ paragraphs: 1, sentences: 1 }),
    createPassage: async (request) => {
      requests.push(request)
      const saved = { id: request.id, title: request.title, sourceText: request.sourceText, sourceRevision: 1 }
      records.set(saved.id, saved)
      return ok({ kind: 'saved', passage: saved })
    },
    getPassage: async ({ id }) => ok({ passage: records.get(id) }),
  })
  await openNext(p)
  all(p.render(), (node) => node.type === 'textarea')[0].props.onChange({ target: { value: 'Nous continuons.' } })
  button(p.render(), '返回当前段').props.onClick()
  button(p.render(), '段落管理').props.onClick()
  button(p.render(), '新建段落').props.onClick()
  enter(p.render(), '标题', 'Independent passage')
  all(p.render(), (node) => node.type === 'textarea')[0].props.onChange({ target: { value: 'Je lis un autre livre.' } })
  const save = () => all(p.render(), (node) => node.type === 'form')[0].props.onSubmit(submit)
  await save(); await save()
  assert.equal(p.values.get(10).title, 'Independent passage')
  const selectParent = all(p.render(), (node) => node.type === 'button' && node.props.className?.includes('shelfPassage') && text(node).includes('第 3 章'))[0]
  selectParent.props.onClick()
  await new Promise((resolve) => setImmediate(resolve))
  let tree = await openNext(p)
  assert.equal(all(tree, (node) => node.type === 'textarea')[0].props.value, 'Nous continuons.')
  await save(); await save()
  assert.equal(requests.length, 2)
  assert.equal(requests[0].sourceText, 'Je lis un autre livre.')
  assert.equal(requests[1].sourceText, 'Nous continuons.')
  assert.equal(p.values.get(10).id, 'parent')
  const links = [...p.values.values()].find((value) => value?.parent?.id === requests[1].id)
  assert.deepEqual(Object.keys(links), ['parent'])
  assert.ok(button(p.render(), '开始下一段'))
})


test('continuation saved notification expires rather than persisting into later reading', async () => {
  let timer
  const p = await panel({
    listPassages: async () => ok({ items: [], hasMore: false }),
    previewImport: async () => ok({ paragraphs: 1, sentences: 1 }),
    createPassage: async (request) => ok({ kind: 'saved', passage: { id: request.id, title: request.title } }),
  }, { setTimeout: (callback, delay) => { timer = { callback, delay }; return 1 }, clearTimeout() {} })
  await openNext(p)
  all(p.render(), (node) => node.type === 'textarea')[0].props.onChange({ target: { value: 'Nous continuons.' } })
  const save = () => all(p.render(), (node) => node.type === 'form')[0].props.onSubmit(submit)
  await save(); await save()
  const statuses = () => all(p.render(), (node) => node.props?.role === 'status').map(text)
  assert.ok(statuses().includes('下一段已保存，准备好后即可开始。'))
  assert.equal(timer.delay, 2600)
  timer.callback()
  assert.ok(!statuses().includes('下一段已保存，准备好后即可开始。'))
  assert.ok(button(p.render(), '开始下一段'))
})


test('failed previews do not display a successful zero-paragraph split summary', async () => {
  const p = await panel({
    listPassages: async () => ok({ items: [], hasMore: false }),
    previewImport: async () => { throw new Error('offline') },
  })
  await openNext(p)
  all(p.render(), (node) => node.type === 'textarea')[0].props.onChange({ target: { value: 'Je lis.' } })
  await all(p.render(), (node) => node.type === 'form')[0].props.onSubmit(submit)
  const dialog = all(p.render(), (node) => node.props?.role === 'dialog')[0]
  assert.match(text(dialog), /offline/u)
  assert.doesNotMatch(text(dialog), /将切分为|直接保存/u)
  assert.match(text(dialog), /重试预览/u)
  assert.ok(button(dialog, '预览切分'))
})

test('directory loads every page and keeps the previous complete list if a later page fails', async () => {
  const entries = Array.from({ length: 27 }, (_, index) => ({ ...passage, id: `item-${index}`, title: `Passage ${index}` }))
  const calls = []
  let fail = false
  const p = await panel({ listPassages: async ({ offset, limit }) => {
    calls.push([offset, limit])
    if (fail && offset > 0) throw new Error('page unavailable')
    return ok({ items: entries.slice(offset, offset + limit), total: entries.length, hasMore: offset + limit < entries.length })
  } })
  p.render()
  const refresh = p.effects.find((factory) => factory.toString().includes('refreshList(0)'))
  refresh()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(p.values.get(0).length, 27)
  assert.equal(p.values.get(0)[26].title, 'Passage 26')
  assert.deepEqual(calls, [[0, 25], [25, 25]])
  fail = true
  refresh()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(p.values.get(0).length, 27)
  assert.match(text(p.render()), /page unavailable/u)
})

test('empty input and source length boundaries do not reach save or invalid preview requests', async () => {
  let previews = 0, saves = 0
  const p = await panel({
    listPassages: async () => ok({ items: [], hasMore: false }),
    previewImport: async () => { previews++; return ok({ paragraphs: 1, sentences: 1 }) },
    createPassage: async () => { saves++; return ok({}) },
  })
  await openNext(p)
  const sourceField = () => all(p.render(), (node) => node.type === 'textarea')[0]
  const submitForm = () => all(p.render(), (node) => node.type === 'form')[0].props.onSubmit(submit)
  enter(p.render(), '标题', '   ')
  sourceField().props.onChange({ target: { value: 'Je lis.' } })
  await submitForm()
  assert.match(text(p.render()), /请填写标题/u)
  enter(p.render(), '标题', 'Boundary')
  sourceField().props.onChange({ target: { value: '   ' } })
  await submitForm()
  assert.match(text(p.render()), /请粘贴法语原文/u)
  sourceField().props.onChange({ target: { value: 'a'.repeat(20001) } })
  await submitForm()
  assert.match(text(p.render()), /20,000/u)
  assert.equal(previews, 0)
  sourceField().props.onChange({ target: { value: 'a'.repeat(20000) } })
  await submitForm()
  assert.equal(previews, 1)
  assert.equal(saves, 0)
})

/**
 * Discussion turns belong to the passage they started on (M4-02): a preview, a
 * stream delta, a terminal frame or a `finally` that arrives after the reader
 * moved to another passage must not touch that passage's composer.
 *
 * State indices are the component's useState order: 27 backend, 29 model,
 * 30 discussion, 31 askDraft, 32 contextPreview, 33 askBusy, 34 askStatus,
 * 35 streamText, 50 selectedNode.
 */
const discussionBranch = (branchId, anchorId = 'p1.s1') => ({
  branchId, anchorId, kind: 'discussion', title: `分支 ${anchorId}`, parentId: null,
  forkedFrom: null, status: 'open', messages: [], historyCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
})

/** Put the composer on screen for one branch, with a draft question typed. */
function openComposer(p, branch, { preview = null, draft = '这一句怎么读？' } = {}) {
  p.values.set(27, 'stub')
  p.values.set(29, 'stub-model')
  p.values.set(30, { branches: [branch], conclusions: [] })
  p.values.set(31, draft)
  const passageId = p.values.get(10)?.id ?? null
  const requestId = p.refs[26]?.current ?? 0
  const previewWithIdentity = preview === null ? null : {
    ...preview,
    previewIdentity: JSON.stringify([passageId, requestId, branch.branchId, 'stub', 'stub-model', draft.trim()]),
  }
  p.values.set(32, previewWithIdentity)
  p.values.set(50, { id: branch.branchId, anchorId: branch.anchorId, kind: 'discussion', title: branch.title })
}

const flush = async (times = 3) => {
  for (let index = 0; index < times; index += 1) await new Promise((resolve) => setImmediate(resolve))
}

/** Select another passage from the shelf and run the passage-switch reset effect. */
async function switchTo(p, title) {
  all(p.render(), (node) => node.type === 'button' && node.props.className?.includes('shelfPassage') && text(node).includes(title))[0].props.onClick()
  await flush()
  p.effects.filter((factory) => factory.toString().includes('loadDiscussion(activePassage.id)')).pop()()
  await flush()
}

/** A manually driven async iterable for streamAsk: frames arrive when pushed. */
function manualStream() {
  const frames = []
  let waiter = null
  const pump = () => {
    while (waiter !== null && frames.length > 0) {
      const resolve = waiter
      waiter = null
      resolve(frames.shift())
    }
  }
  return {
    push(frame) { frames.push({ value: frame, done: false }); pump() },
    close() { frames.push({ value: undefined, done: true }); pump() },
    [Symbol.asyncIterator]() {
      return {
        next() {
          if (frames.length > 0) return Promise.resolve(frames.shift())
          return new Promise((resolve) => { waiter = resolve })
        },
      }
    },
  }
}

test('a stored answer opens its original context snapshot, never a recompiled preview', async () => {
  const requests = []
  let previewCalls = 0
  const contextId = '00000000-0000-4000-8000-0000000000f1'
  const message = {
    messageId: 'm1', author: 'model', text: 'Elle lui répond.', contextId,
    createdAt: '2026-01-02T03:04:05.000Z', extraction: null,
  }
  const p = await panel({
    readContext: async (request) => {
      requests.push(request)
      return ok({
        kind: 'found', contextId, fingerprint: 'saved-fingerprint', characters: 143,
        backend: 'deepseek', model: 'deepseek-v4.1-flash',
        materials: [{ kind: 'source', refId: 'p1.s1', reason: null, characters: 17, excerpt: 'La voilà. Elle lui répond.' }],
        prompt: 'EXACT SAVED PROMPT: use the previous paragraph to resolve the pronouns.',
      })
    },
    previewAsk: async () => { previewCalls += 1; return ok({}) },
  })
  openComposer(p, { ...discussionBranch('b1'), messages: [message] })
  const answerActions = all(p.render(), (node) => node.props?.className === 'answerActions')[0]
  button(answerActions, '查看当时材料').props.onClick()
  await flush()

  assert.equal(requests.length, 1)
  assert.equal(requests[0].passageId, 'parent')
  assert.equal(requests[0].contextId, contextId)
  assert.equal(previewCalls, 0, 'history lookup does not compile new material')
  const dialog = all(p.render(), (node) => node.props?.role === 'dialog' && node.props['aria-labelledby'] === 'sentContextTitle')[0]
  assert.ok(dialog)
  assert.match(text(dialog), /EXACT SAVED PROMPT/u)
  assert.match(text(dialog), /La voilà\. Elle lui répond/u)
  assert.match(text(dialog), /deepseek-v4\.1-flash/u)
})

test('a missing historical snapshot is explicit and is never replaced with a new preview', async () => {
  let previewCalls = 0
  const message = {
    messageId: 'm-missing', author: 'model', text: 'Réponse.',
    contextId: '00000000-0000-4000-8000-0000000000f2',
    createdAt: '2026-01-02T03:04:05.000Z', extraction: null,
  }
  const p = await panel({
    readContext: async () => ok({ kind: 'missing' }),
    previewAsk: async () => { previewCalls += 1; return ok({}) },
  })
  openComposer(p, { ...discussionBranch('b1'), messages: [message] })
  const answerActions = all(p.render(), (node) => node.props?.className === 'answerActions')[0]
  button(answerActions, '查看当时材料').props.onClick()
  await flush()

  assert.equal(previewCalls, 0)
  const dialog = all(p.render(), (node) => node.props?.role === 'dialog' && node.props['aria-labelledby'] === 'sentContextTitle')[0]
  assert.match(text(dialog), /材料快照缺失/u)
})

test('a preview that answers after the reader switched passages changes nothing there', async () => {
  const slow = { ...passage, id: 'slow', title: 'Slow passage' }
  const fast = { ...passage, id: 'fast', title: 'Fast passage' }
  let resolvePreview
  const p = await panel({
    previewAsk: () => new Promise((resolve) => { resolvePreview = resolve }),
    getPassage: async ({ id }) => ok({ passage: id === 'fast' ? fast : slow }),
  })
  p.values.set(0, [slow, fast])
  p.values.set(10, slow)
  openComposer(p, discussionBranch('b1'))
  button(p.render(), '查看本次上下文').props.onClick()
  await flush()
  assert.equal(p.values.get(33), true, 'the preview is in flight')

  await switchTo(p, 'Fast passage')
  resolvePreview(ok({ ok: true, characters: 12, materials: [{ refId: 'p1' }], fingerprint: 'f1' }))
  await flush()

  assert.equal(p.values.get(10).id, 'fast')
  assert.equal(p.values.get(32), null, 'the late preview is not shown on the new passage')
  assert.equal(p.values.get(14), '', 'and no error from it either')
  assert.equal(p.values.get(33), false, 'the switch reset the busy flag; the late finally left it alone')
})

test('stream deltas from the previous passage never reach the new passage', async () => {
  const slow = { ...passage, id: 'slow', title: 'Slow passage' }
  const fast = { ...passage, id: 'fast', title: 'Fast passage' }
  const stream = manualStream()
  const p = await panel({
    streamAsk: () => stream,
    getPassage: async ({ id }) => ok({ passage: id === 'fast' ? fast : slow }),
  })
  p.values.set(0, [slow, fast])
  p.values.set(10, slow)
  openComposer(p, discussionBranch('b1'), { preview: { fingerprint: 'f1', characters: 12, materials: [{}] } })
  button(p.render(), '发送').props.onClick()
  stream.push({ kind: 'delta', text: '前半句' })
  await flush()
  assert.equal(p.values.get(35), '前半句', 'the delta arrives while the turn is current')

  await switchTo(p, 'Fast passage')
  p.values.set(31, '给 B 的问题')
  p.values.set(32, { fingerprint: 'f2', characters: 9, materials: [{}] })
  stream.push({ kind: 'delta', text: '后半句' })
  stream.push({ kind: 'done', result: { ok: true, finish: 'stop', model: 'stub-model', resolvedModel: 'stub-model' } })
  stream.close()
  await flush()

  assert.equal(p.values.get(35), '', 'a late delta from the old passage is refused')
  assert.equal(p.values.get(31), '给 B 的问题', 'the new passage’s draft is untouched')
  assert.deepEqual(p.values.get(32), { fingerprint: 'f2', characters: 9, materials: [{}] }, 'its context preview too')
  assert.equal(p.values.get(34), '', 'and the old turn’s success is not reported here')
})

test('an old turn’s finally does not clear the new passage’s busy state', async () => {
  const slow = { ...passage, id: 'slow', title: 'Slow passage' }
  const fast = { ...passage, id: 'fast', title: 'Fast passage' }
  const streams = new Map([['b1', manualStream()], ['b2', manualStream()]])
  const p = await panel({
    streamAsk: (request) => streams.get(request.branchId),
    getPassage: async ({ id }) => ok({ passage: id === 'fast' ? fast : slow }),
  })
  p.values.set(0, [slow, fast])
  p.values.set(10, slow)
  openComposer(p, discussionBranch('b1'), { preview: { fingerprint: 'f1', characters: 12, materials: [{}] } })
  button(p.render(), '发送').props.onClick()
  await flush()
  assert.equal(p.values.get(33), true)

  await switchTo(p, 'Fast passage')
  assert.equal(p.values.get(33), false, 'the switch hands the busy state to the new passage')
  openComposer(p, discussionBranch('b2'), { preview: { fingerprint: 'f2', characters: 9, materials: [{}] }, draft: 'B 的问题' })
  button(p.render(), '发送').props.onClick()
  await flush()
  assert.equal(p.values.get(33), true, 'the new passage’s turn is busy')

  // The old turn only now finishes: its finally must not touch the new turn.
  streams.get('b1').push({ kind: 'done', result: { ok: true, finish: 'stop', model: 'stub-model', resolvedModel: 'stub-model' } })
  streams.get('b1').close()
  await flush()
  assert.equal(p.values.get(33), true, 'the new turn is still busy')
  assert.equal(p.values.get(35), '', 'and no stream text leaked across')
  streams.get('b2').push({ kind: 'done', result: { ok: true, finish: 'stop', model: 'stub-model', resolvedModel: 'stub-model' } })
  streams.get('b2').close()
  await flush()
  assert.equal(p.values.get(33), false, 'the new turn settles its own state')
})

test('a preview failure from the previous passage shows no error on the new one', async () => {
  const slow = { ...passage, id: 'slow', title: 'Slow passage' }
  const fast = { ...passage, id: 'fast', title: 'Fast passage' }
  let rejectPreview
  const p = await panel({
    previewAsk: () => new Promise((resolve, reject) => { rejectPreview = reject }),
    getPassage: async ({ id }) => ok({ passage: id === 'fast' ? fast : slow }),
  })
  p.values.set(0, [slow, fast])
  p.values.set(10, slow)
  openComposer(p, discussionBranch('b1'))
  button(p.render(), '查看本次上下文').props.onClick()
  await flush()

  await switchTo(p, 'Fast passage')
  rejectPreview(new Error('old preview failed'))
  await flush()
  assert.equal(p.values.get(14), '', 'the old failure is not the new passage’s error')
})

/**
 * The branch strip (P1 regression, 2026-10-09 acceptance): a branch button used
 * to be bound to the auto-titled creation path, so clicking an existing branch
 * spawned another one. Clicking must select the branch — messages and composer
 * appear — and never call createBranch.
 *
 * State indices: 18 anchorId, 30 discussion, 50 selectedNode, 51 branchDialog.
 */
test('clicking a branch in the strip selects it and never creates a branch', async () => {
  let created = 0
  const p = await panel({ createBranch: async () => { created += 1; return ok({ kind: 'created', branchId: 'new' }) } })
  const branch = discussionBranch('b1')
  p.values.set(18, 'p1.s1')
  p.values.set(30, { branches: [branch], conclusions: [] })

  const strip = () => all(p.render(), (node) => node.props?.id === 'branchStrip')[0]
  const branchButton = all(strip(), (node) => node.type === 'button' && text(node) === branch.title)[0]
  assert.ok(branchButton, 'the branch appears in the strip under its own title')
  branchButton.props.onClick()
  await flush()

  assert.equal(created, 0, 'selecting a branch never creates one')
  const selected = p.values.get(50)
  assert.equal(selected?.id, 'b1', 'the branch node is selected')
  assert.equal(selected?.kind, 'discussion')
  const tree = p.render()
  assert.ok(all(tree, (node) => node.props?.className === 'composer').length > 0, 'the composer appears for the selected branch')
  assert.ok(button(tree, '查看本次上下文'), 'the composer offers the context preview')
  const buttons = all(strip(), (node) => node.type === 'button')
  assert.equal(buttons.length, 2, 'the strip is unchanged: the one branch plus ＋ 讨论')
  assert.equal(buttons[0].props.className.includes('active'), true, 'the selected branch reads as active')

  // Clicking it again keeps the selection and still creates nothing.
  buttons[0].props.onClick()
  await flush()
  assert.equal(created, 0)
  assert.equal(all(strip(), (node) => node.type === 'button').length, 2)
})

test('the ＋讨论 entry starts with a first question and an optional editable derived title', async () => {
  const requests = []
  const p = await panel({
    createBranch: async (value) => {
      requests.push(value)
      if (requests.length === 1) throw new Error('temporary connection loss')
      return ok({ kind: 'created', branch: { id: 'new-branch', title: value.title } })
    },
    listDiscussion: async () => ok({ branches: [branch], conclusions: [] }),
  })
  p.values.set(18, 'p1.s1')
  p.values.set(16, { paragraphs: [{ id: 'p1', text: 'Je lis.', start: 0, end: 7,
    sentences: [{ id: 'p1.s1', text: 'Je lis.', start: 0, end: 7 }] }] })
  p.values.set(30, { branches: [], conclusions: [] })
  const strip = all(p.render(), (node) => node.props?.id === 'branchStrip')[0]
  button(strip, '＋ 讨论').props.onClick()
  await flush()
  assert.equal(requests.length, 0, 'opening the first-question form is not a creation')
  assert.notEqual(p.values.get(51), null, 'the first-question form opened')
  let tree = p.render()
  const questionInput = all(tree, (node) => node.type === 'textarea' && node.props.id === 'branchQuestionInput')[0]
  const titleInput = all(tree, (node) => node.type === 'input' && node.props.id === 'branchInput')[0]
  assert.ok(questionInput && titleInput)
  assert.equal(titleInput.props.value, '', 'a title is not required before asking')
  questionInput.props.onChange({ target: { value: '这里的 allée 是什么形式？' } })
  tree = p.render()
  const generatedTitleInput = all(tree, (node) => node.type === 'input' && node.props.id === 'branchInput')[0]
  assert.equal(generatedTitleInput.props.value, '讨论 · 这里的 allée 是什么形式？')
  generatedTitleInput.props.onChange({ target: { value: '自定义标题' } })
  button(p.render(), '继续提问').props.onClick()
  await flush()
  assert.equal(requests.length, 1)
  tree = p.render()
  assert.equal(all(tree, (node) => node.type === 'textarea' && node.props.id === 'branchQuestionInput')[0].props.value,
    '这里的 allée 是什么形式？', 'a failed create keeps the first question in the open form')
  assert.match(text(tree), /无法确认讨论是否已创建/u)
  assert.match(text(all(tree, (node) => node.type === 'details' && node.props.className === 'operationDiagnostic')[0]), /temporary connection loss/u)
  button(tree, '继续提问').props.onClick()
  await flush()
  assert.equal(requests.length, 2)
  assert.equal(requests[0].operationId, requests[1].operationId, 'an ambiguous retry reuses the same idempotency key')
  assert.equal(requests[1].title, '自定义标题', 'the reader can edit the title derived from the first question')
  assert.equal(requests[1].forkedFrom, null, 'a new root discussion is not attached to an unrelated parent')
  assert.equal(p.values.get(50)?.id, 'new-branch', 'creation selects the new discussion')
  assert.equal(p.values.get(31), '这里的 allée 是什么形式？', 'the first question becomes the composer draft')
  tree = p.render()
  assert.ok(all(tree, (node) => node.props?.className === 'composer')[0], 'the question composer opens immediately')
})

test('a first-question fork keeps the exact parent message and passage captured at open', async () => {
  const requests = []
  const branch = {
    ...discussionBranch('parent-branch'),
    messages: [
      { messageId: 'm1', author: 'model', text: '第一轮回答', status: 'complete', backend: 'stub', model: 'stub-model' },
      { messageId: 'm2', author: 'model', text: '第二轮回答', status: 'complete', backend: 'stub', model: 'stub-model' },
    ],
  }
  const p = await panel({
    createBranch: async (value) => { requests.push(value); return ok({ kind: 'created', branch: { id: 'child-branch', title: value.title } }) },
    listDiscussion: async () => ok({ branches: [branch], conclusions: [] }),
  })
  p.values.set(30, { branches: [branch], conclusions: [] })
  p.values.set(50, { id: 'parent-branch', anchorId: 'p1.s1', kind: 'discussion', title: branch.title })
  button(p.render(), '⑂ 分叉').props.onClick()
  let tree = p.render()
  all(tree, (node) => node.type === 'textarea' && node.props.id === 'branchQuestionInput')[0]
    .props.onChange({ target: { value: '为什么这里这样表达？' } })
  p.values.set(30, { branches: [], conclusions: [] })
  button(p.render(), '继续提问').props.onClick()
  await flush()
  assert.equal(requests.length, 1)
  assert.equal(requests[0].passageId, 'parent')
  assert.equal(requests[0].anchorId, 'p1.s1')
  assert.equal(requests[0].parentId, 'parent-branch')
  assert.equal(requests[0].forkedFrom.branchId, 'parent-branch')
  assert.equal(requests[0].forkedFrom.messageId, 'm1')
  assert.equal(p.values.get(31), '为什么这里这样表达？')
  assert.equal(p.values.get(50)?.id, 'child-branch')
})

test('a failed conclusion save keeps the edit and exposes collapsed copyable diagnostics', async () => {
  const requests = []
  const branch = {
    ...discussionBranch('b1'),
    messages: [{ messageId: 'm1', author: 'model', text: '原回答', status: 'complete',
      backend: 'stub', model: 'stub-model', contextId: null, createdAt: '2026-01-01T00:00:00.000Z' }],
  }
  const p = await panel({ recordConclusion: async (request) => { requests.push(request); throw new Error('gateway wire field mismatch') } })
  p.values.set(30, { branches: [branch], conclusions: [] })
  p.values.set(50, { id: 'b1', anchorId: 'p1.s1', kind: 'discussion', title: branch.title })
  button(p.render(), '提炼结论').props.onClick()
  let tree = p.render()
  const editor = all(tree, (node) => node.type === 'textarea' && node.props.id === 'actionText')[0]
  editor.props.onChange({ target: { value: '我编辑的结论' } })
  button(p.render(), '确认').props.onClick()
  await flush()
  tree = p.render()
  assert.equal(all(tree, (node) => node.type === 'textarea' && node.props.id === 'actionText')[0].props.value, '我编辑的结论')
  assert.match(text(tree), /尚未确认结论是否保存；编辑内容仍保留/u)
  assert.ok(button(tree, '用同一内容重试'))
  button(tree, '用同一内容重试').props.onClick()
  await flush()
  assert.equal(requests.length, 2)
  assert.equal(requests[0].operationId, requests[1].operationId, 'retrying unchanged content reuses its operation id')
  tree = p.render()
  all(tree, (node) => node.type === 'textarea' && node.props.id === 'actionText')[0]
    .props.onChange({ target: { value: '更新后的结论' } })
  button(p.render(), '确认').props.onClick()
  await flush()
  assert.equal(requests.length, 3)
  assert.notEqual(requests[1].operationId, requests[2].operationId, 'editing after failure starts a distinct write')
  assert.equal(requests[2].text, '更新后的结论')
  tree = p.render()
  const details = all(tree, (node) => node.type === 'details' && node.props.className === 'operationDiagnostic')[0]
  assert.ok(details, 'technical information is available in a disclosure')
  assert.equal(details.props.open, undefined, 'technical details stay collapsed by default')
  assert.match(text(details), /gateway wire field mismatch/u)
  assert.ok(button(details, '复制诊断'))
})

test('a failed branch-status update preserves the discussion and shows retryable diagnostics', async () => {
  const branch = { ...discussionBranch('b1'), title: '分支一', status: 'open' }
  const p = await panel({ setBranchState: async () => { throw new Error('status revision conflict') } })
  p.values.set(30, { branches: [branch], conclusions: [] })
  p.values.set(50, { id: 'b1', anchorId: 'p1.s1', kind: 'discussion', title: branch.title })
  button(p.render(), '✓ 我已理解').props.onClick()
  await flush()
  const tree = p.render()
  assert.match(text(tree), /未能确认理解状态是否已更新；讨论内容仍保留/u)
  const details = all(tree, (node) => node.type === 'details' && node.props.className === 'operationDiagnostic')[0]
  assert.ok(details)
  assert.match(text(details), /status revision conflict/u)
  assert.ok(button(details, '复制诊断'))
})

test('the preview dialog shows the actual split: paragraph blocks and flags', async () => {
  const p = await panel({
    listPassages: async () => ok({ items: [], hasMore: false }),
    previewImport: async () => ok({
      title: '段落 02', characters: 41, paragraphs: 1, sentences: 2,
      blocks: [{ id: 'p1', sentences: 2, excerpt: 'Il vient de Paris. Nous lisons un livre.', sentenceDetails: [
        { id: 'p1.s1', text: 'Il vient de Paris.', start: 0, end: 18 },
        { id: 'p1.s2', text: 'Nous lisons un livre.', start: 19, end: 40 },
      ] }],
      flags: [{ code: 'double-space', severity: 'hint', detail: '有 1 处连续空格' }],
      head: 'Il vient de Paris. Nous lisons un livre.', tail: '',
    }),
  })
  await openNext(p)
  all(p.render(), (node) => node.type === 'textarea')[0].props.onChange({ target: { value: 'Il vient de Paris. Nous lisons un livre.' } })
  await all(p.render(), (node) => node.type === 'form')[0].props.onSubmit(submit)
  const tree = p.render()
  assert.match(text(tree), /将切分为 1 段、2 句/u)
  assert.match(text(tree), /p1 · 2 句/u, 'the paragraph boundary is shown, not just counted')
  const previewSentences = all(tree, (node) => node.props?.className === 'previewSentenceText').map(text)
  assert.deepEqual(previewSentences, ['Il vient de Paris.', 'Nous lisons un livre.'], 'every full sentence is visible without excerpt truncation')
  assert.deepEqual(all(tree, (node) => node.props?.className === 'previewExcerpt'), [], 'sentence details replace the truncated paragraph excerpt')
  assert.ok(button(tree, '保存，继续当前段'), 'the confirmation action remains in the dialog DOM after preview')
  assert.match(text(tree), /连续空格/u, 'and the damage flags are shown')
})

test('a lookup miss says the lexicon is local and offers the library', async () => {
  const p = await panel({ lookupMot: async () => ok({ found: false, entries: [], candidates: [] }) })
  button(p.render(), '查词').props.onClick()
  all(p.render(), (node) => node.props?.id === 'lookupInput')[0].props.onChange({ target: { value: 'connaît' } })
  button(p.render(), '查阅').props.onClick()
  await flush()
  const result = all(p.render(), (node) => node.props?.className === 'lookupResult')[0]
  assert.ok(result, 'the miss view is shown')
  assert.match(text(result), /本地词库未命中/u)
  assert.doesNotMatch(text(result), /未收藏/u, 'the empty state is stated once without collector language')
  assert.match(text(result), /只读本地词库/u, 'the miss says what the lookup actually read')
  assert.ok(button(result, '打开知识库'), 'and offers the real next step')
  assert.ok(button(result, '手动添加词条'), 'the reader can explicitly author an entry')
  assert.ok(button(result, '在讨论中询问'), 'the reader can ask the current model about it')
  assert.ok(button(result, '← 返回解析'))
})

test('a reader-authored exact Mot is saved with the lemma and opens its entry card', async () => {
  const requests = []
  const p = await panel({
    lookupMot: async () => ok({ found: false, entries: [], candidates: [] }),
    createLexiconEntry: async (request) => {
      requests.push(request)
      return ok({ kind: 'created', entryId: 'entry-allée', occurrence: { kind: 'appended', reason: null } })
    },
  })
  button(p.render(), '查词').props.onClick()
  all(p.render(), (node) => node.props?.id === 'lookupInput')[0].props.onChange({ target: { value: 'allée' } })
  button(p.render(), '查阅').props.onClick()
  await flush()
  const result = all(p.render(), (node) => node.props?.className === 'lookupResult')[0]
  button(result, '手动添加词条').props.onClick()
  const dialog = p.render()
  assert.match(text(dialog), /此处只保存你填写的内容/u)
  assert.equal(all(dialog, (node) => node.props?.id === 'entryExample')[0].props.readOnly, true, 'the current sentence is shown as the occurrence example')
  all(dialog, (node) => node.props?.id === 'entryLemma')[0].props.onChange({ target: { value: 'aller' } })
  all(dialog, (node) => node.props?.id === 'entryPartOfSpeech')[0].props.onChange({ target: { value: 'verbe' } })
  all(dialog, (node) => node.props?.id === 'entryLabel')[0].props.onChange({ target: { value: 'participe passé' } })
  all(dialog, (node) => node.props?.id === 'entryDefinition')[0].props.onChange({ target: { value: 'Participe passé féminin singulier de aller.' } })
  all(dialog, (node) => node.props?.id === 'entryForms')[0].props.onChange({ target: { value: 'allées' } })
  button(p.render(), '保存词条').props.onClick()
  await flush()

  assert.equal(requests.length, 1)
  assert.equal(requests[0].mot, 'allée')
  assert.equal(requests[0].lemma, 'aller')
  assert.equal(requests[0].partOfSpeech, 'verbe')
  assert.equal(requests[0].forms.join(','), 'allées')
  assert.equal(requests[0].provenance, undefined, 'the Host marks an explicit panel entry as reader-authored')
  assert.equal(p.values.get(43), true, 'the knowledge view opens after saving')
  assert.equal(p.values.get(44), 'entry-allée', 'the exact created entry, not the lemma, is selected')
})

test('a new answer offers an in-place jump when the reader has scrolled away', async () => {
  const branchId = 'b-discussion'
  const original = {
    branchId, anchorId: 'p1.s1', kind: 'discussion', title: '原讨论', parentId: null,
    status: 'open', messages: [], historyCount: 0,
  }
  const answer = {
    messageId: 'answer-new', author: 'model', text: '这是新回答。', status: 'complete',
    backend: 'stub', model: 'stub-model', resolvedModel: 'stub-model', failure: null,
    contextId: 'context-new', createdAt: '2026-01-01T00:00:00.000Z', extraction: null,
  }
  const updated = { ...original, messages: [
    { messageId: 'question-new', author: 'user', text: '这一句怎么读？', status: null, createdAt: '2026-01-01T00:00:00.000Z' },
    answer,
  ], historyCount: 2 }
  let asks = 0
  const p = await panel({
    streamAsk: () => (async function* () {
      asks += 1
      yield { kind: 'done', result: { ok: true, finish: 'stop', model: 'stub-model', resolvedModel: 'stub-model' } }
    })(),
    listDiscussion: async () => ok({ branches: [updated], conclusions: [] }),
  })
  p.values.set(30, { branches: [original], conclusions: [] })
  p.values.set(50, { id: branchId, anchorId: 'p1.s1', kind: 'discussion', title: original.title })
  openComposer(p, original, { preview: { ok: true, fingerprint: 'fingerprint-new', characters: 0, materials: [], prompt: '' } })
  let tree = p.render()
  const scroller = { scrollTop: 400, scrollHeight: 1000, clientHeight: 300 }
  all(tree, (node) => node.props?.className === 'detailScroll')[0].props.ref.current = scroller
  button(tree, '发送').props.onClick()
  await flush()
  assert.equal(p.values.get(14), '', 'the reviewed preview identity is current')
  assert.equal(asks, 1, 'the reviewed context allows the turn to complete')
  tree = p.render()
  const revealEffect = p.effects.filter((factory) => factory.toString().includes('pendingAnswerRevealRef.current') && factory.toString().includes('previousMessageId')).at(-1)
  assert.ok(revealEffect)
  revealEffect()
  tree = p.render()
  assert.ok(button(tree, '新回答已生成 · 跳转到回答'), 'the new answer is announced without moving the reader unexpectedly')
  assert.equal(all(tree, (node) => node.props?.id === 'discussion-message-answer-new').length, 1)
})

test('sentence analysis previews paragraph materials before a fingerprinted confirmation', async () => {
  const previewCalls = [], generationCalls = []
  const preview = {
    ok: true, reason: null, anchorId: 'p2.s1', currentParagraphId: 'p2',
    characterLimit: 3500, characters: 15,
    materials: [
      { paragraphId: 'p1', relation: 'previous', text: 'Avant.', start: 0, end: 6, included: false, reason: 'over-budget' },
      { paragraphId: 'p2', relation: 'current', text: 'Je lis.', start: 8, end: 15, included: true, reason: 'included' },
      { paragraphId: 'p3', relation: 'next', text: 'Après.', start: 17, end: 23, included: true, reason: 'included' },
    ],
    includedParagraphIds: ['p2', 'p3'], omittedParagraphIds: ['p1'], fingerprint: 'context-fingerprint',
  }
  const p = await panel({
    previewAnalysisContext: async (request) => { previewCalls.push(request); return ok(preview) },
    analyseSentence: async (request) => {
      generationCalls.push(request)
      return ok({ ok: true, covered: 1, missing: 0, failed: 0, stale: 0, model: 'stub-model', resolvedModel: 'stub-model' })
    },
    readSentenceAnalysis: async () => ok({ kind: 'found', analysis: { constituents: [] } }),
    readAnalysisCoverage: async () => ok({ total: 1, covered: [], missing: ['p2.s1'], failed: [], stale: [] }),
  })
  p.values.set(16, { paragraphs: [
    { id: 'p1', text: 'Avant.', start: 0, end: 6, sentences: [{ id: 'p1.s1', text: 'Avant.', start: 0, end: 6 }] },
    { id: 'p2', text: 'Je lis.', start: 8, end: 15, sentences: [{ id: 'p2.s1', text: 'Je lis.', start: 8, end: 15 }] },
    { id: 'p3', text: 'Après.', start: 17, end: 23, sentences: [{ id: 'p3.s1', text: 'Après.', start: 17, end: 23 }] },
  ] })
  p.values.set(18, 'p2.s1')
  p.values.set(27, 'stub')
  p.values.set(29, 'stub-model')
  const startButton = all(p.render(), (node) => node.type === 'button' && node.props.id === 'start')[0]
  startButton.props.onClick()
  await flush()
  assert.equal(previewCalls.length, 1)
  assert.equal(generationCalls.length, 0, 'opening the preview never calls the model')
  let tree = p.render()
  assert.ok(text(tree).includes('本次解析材料'))
  const currentMaterial = all(tree, (node) => node.type === 'label' && text(node).includes('当前段 · p2'))[0]
  assert.ok(currentMaterial)
  const currentCheckbox = currentMaterial.props.children[0]
  assert.equal(currentCheckbox.props.disabled, true, 'the current paragraph is mandatory')
  button(tree, '确认材料并生成解析').props.onClick()
  await flush()
  assert.equal(generationCalls.length, 1)
  assert.deepEqual(generationCalls[0].paragraphIds, ['p2', 'p3'])
  assert.equal(generationCalls[0].expectedFingerprint, 'context-fingerprint')
})

test('a vocabulary discussion answer can seed a confirmed, still-unverified lexicon draft', async () => {
  const requests = []
  const p = await panel({
    createLexiconEntry: async (request) => {
      requests.push(request)
      return ok({ kind: 'created', entryId: 'entry-allée', occurrence: { kind: 'appended', reason: null } })
    },
  })
  const message = {
    messageId: 'message-vocab-1', author: 'model', text: 'Participe passé féminin singulier de aller.',
    status: 'complete', backend: 'stub', model: 'stub-model', resolvedModel: 'stub-model', failure: null,
    contextId: 'context-1', createdAt: '2026-01-01T00:00:00.000Z', extraction: null,
  }
  const branch = {
    branchId: 'b-word', anchorId: 'p1.s1', kind: 'vocabulary', title: 'allée', parentId: null,
    status: 'open', messages: [message], historyCount: 1,
  }
  p.values.set(30, { branches: [branch], conclusions: [] })
  p.values.set(50, { id: 'b-word', anchorId: 'p1.s1', kind: 'knowledge', title: 'allée' })

  let tree = p.render()
  const node = all(tree, (entry) => entry.props?.className === 'discussionNode')[0]
  button(node, '整理为词条').props.onClick()
  tree = p.render()
  assert.equal(all(tree, (entry) => entry.props?.id === 'entryMot')[0].props.value, 'allée')
  assert.equal(all(tree, (entry) => entry.props?.id === 'entryMot')[0].props.readOnly, false, 'the exact Mot is user-confirmable')
  assert.equal(all(tree, (entry) => entry.props?.id === 'entryDefinition')[0].props.value, message.text)
  assert.match(text(tree), /未经独立核实/u)
  all(tree, (entry) => entry.props?.id === 'entryPartOfSpeech')[0].props.onChange({ target: { value: 'verbe' } })
  all(p.render(), (entry) => entry.props?.id === 'entryLabel')[0].props.onChange({ target: { value: 'participe passé' } })
  button(p.render(), '保存词条').props.onClick()
  await flush()
  assert.equal(requests.length, 0, 'the model suggestion requires explicit confirmation')
  assert.match(text(p.render()), /保存前请确认/u)

  all(p.render(), (entry) => entry.type === 'input' && entry.props.type === 'checkbox')[0].props.onChange({ target: { checked: true } })
  button(p.render(), '保存词条').props.onClick()
  await flush()
  assert.equal(requests.length, 1)
  assert.equal(requests[0].mot, 'allée')
  assert.equal(requests[0].provenance, 'mixed')
  assert.match(requests[0].occurrenceNote, /message-vocab-1/u)
  assert.match(requests[0].occurrenceNote, /未经独立核实/u)
})

test('asking about a miss creates a ready discussion without another title dialog', async () => {
  const created = []
  const branch = { branchId: 'b-word', anchorId: 'passage', kind: 'vocabulary', title: 'allée', parentId: null, messages: [] }
  const p = await panel({
    lookupMot: async () => ok({ found: false, entries: [], candidates: [] }),
    createBranch: async (request) => { created.push(request); return ok({ kind: 'created', branch: { id: 'b-word', title: request.title } }) },
    listDiscussion: async () => ok({ branches: [branch], conclusions: [] }),
  })
  button(p.render(), '查词').props.onClick()
  all(p.render(), (node) => node.props?.id === 'lookupInput')[0].props.onChange({ target: { value: 'allée' } })
  button(p.render(), '查阅').props.onClick()
  await flush()
  button(all(p.render(), (node) => node.props?.className === 'lookupResult')[0], '在讨论中询问').props.onClick()
  await flush()

  assert.equal(created.length, 1)
  assert.equal(created[0].title, 'allée', 'the queried exact Mot remains available as the branch title')
  assert.equal(created[0].kind, 'vocabulary')
  assert.equal(created[0].anchorId, 'passage')
  const tree = p.render()
  assert.match(p.values.get(31), /原形、词性、在此句中的含义/u, 'the composer is prefilled with a focused question')
  assert.ok(button(tree, '查看本次上下文'), 'the model turn still requires an explicit context review')
})

test('a lookup miss names each candidate and opens it with one click', async () => {
  const lookups = []
  const p = await panel({
    lookupMot: async ({ mot }) => {
      lookups.push(mot)
      if (mot === 'connaît') {
        return ok({
          found: false, entries: [],
          candidates: [{ entryId: 'e1', mot: 'connaître', lemma: 'connaître', senses: [{ id: 's1', label: '动词', definition: '知道；认得。' }] }],
        })
      }
      return ok({ found: true, entries: [{ senses: [{ id: 's2', label: '动词', definition: '知道；认得。' }] }], candidates: [] })
    },
  })
  button(p.render(), '查词').props.onClick()
  all(p.render(), (node) => node.props?.id === 'lookupInput')[0].props.onChange({ target: { value: 'connaît' } })
  button(p.render(), '查阅').props.onClick()
  await flush()
  const result = all(p.render(), (node) => node.props?.className === 'lookupResult')[0]
  const candidate = all(result, (node) => node.type === 'button' && text(node).includes('connaître'))[0]
  assert.ok(candidate, 'the candidate is named, not just counted')
  candidate.props.onClick()
  await flush()
  assert.deepEqual(lookups, ['connaît', 'connaître'], 'clicking looks up the candidate itself')
  const opened = all(p.render(), (node) => node.props?.className === 'lookupResult')[0]
  assert.match(text(opened), /知道；认得。/u, 'the candidate’s entry is shown')
})
