import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { webcrypto } from 'node:crypto'

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const passage = { id: 'parent', title: '第 3 章', sourceText: 'Je lis.', sourceRevision: 1 }

async function panel(services = {}) {
  let stateIndex = 0, refIndex = 0, registration, component, props
  const values = new Map([[10, passage], [16, { paragraphs: [] }]])
  const refs = []
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) {
      const index = stateIndex++
      if (!values.has(index)) values.set(index, initial)
      return [values.get(index), (next) => values.set(index, typeof next === 'function' ? next(values.get(index)) : next)]
    },
    useRef(initial) { const index = refIndex++; return refs[index] ??= { current: initial } },
    useEffect() {}, useLayoutEffect() {}, useCallback: (fn) => fn, useMemo: (fn) => fn(),
  }
  const storage = new Map()
  const memoryStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) }
  const context = vm.createContext({
    window: { __ModuleLoader__: { load: (value) => { registration = value } } }, console,
    setTimeout: (...args) => setTimeout(...args).unref(), clearTimeout,
    TextEncoder, crypto: webcrypto, sessionStorage: memoryStorage, localStorage: memoryStorage,
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
  return { render() { stateIndex = 0; refIndex = 0; return component(props) }, values }
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
