import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { webcrypto } from 'node:crypto'

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const passage = { id: 'parent', title: '第 3 章', sourceText: 'Je lis.', sourceRevision: 1 }

async function panel(services = {}, browser = {}) {
  let stateIndex = 0, refIndex = 0, registration, component, props
  const values = new Map([[10, passage], [16, { paragraphs: [] }]])
  const refs = []
  const effects = []
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) {
      const index = stateIndex++
      if (!values.has(index)) values.set(index, initial)
      return [values.get(index), (next) => values.set(index, typeof next === 'function' ? next(values.get(index)) : next)]
    },
    useRef(initial) { const index = refIndex++; return refs[index] ??= { current: initial } },
    useEffect(factory) { effects.push(factory) }, useLayoutEffect() {}, useCallback: (fn) => fn, useMemo: (fn) => fn(),
  }
  const storage = new Map()
  const memoryStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) }
  const context = vm.createContext({
    window: { __ModuleLoader__: { load: (value) => { registration = value } } }, console,
    setTimeout: (...args) => setTimeout(...args).unref(), clearTimeout,
    TextEncoder, crypto: webcrypto, sessionStorage: memoryStorage, localStorage: memoryStorage, ...browser,
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
  return { render() { stateIndex = 0; refIndex = 0; return component(props) }, values, effects }
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
  let tree = p.render()
  assert.match(text(tree), /Book A \/ Chapter 2 \/ 段落 7/u)
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
  assert.equal(button(header, '解析'), undefined)
  const workbench = all(tree, (node) => node.props?.className === 'sentenceWorkspace')[0]
  assert.ok(button(workbench, '解析'))
  assert.equal(all(tree, (node) => node.type === 'button' && text(node) === '解析').length, 1)
  assert.equal(button(tree, '▷ 发音').props.disabled, true)
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
