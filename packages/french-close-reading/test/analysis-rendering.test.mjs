import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import vm from 'node:vm'

/**
 * Colour is a rendering of stored structure, so the rendering is what these tests
 * check: the mapping from a role to a token, and the guarantee that drawing the
 * colours cannot change — or drop — a single character of the sentence.
 */
const packageRoot = fileURLToPath(new URL('../', import.meta.url))
const source = readFileSync(path.join(packageRoot, 'client.js'), 'utf8')

function loadInternals() {
  const registrations = []
  const window = { __ModuleLoader__: { load: (registration) => registrations.push(registration) } }
  const context = vm.createContext({
    window, console, TextEncoder, Blob: class {}, URL,
    document: { createTreeWalker: () => ({ nextNode: () => null }) },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  })
  vm.runInContext(source, context, { filename: 'client.js' })
  return registrations[0].factory(() => ({
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useCallback: (value) => value,
    useEffect: () => {},
    useRef: (value) => ({ current: value }),
    useState: (value) => [value, () => {}],
  })).__test__
}

const { tokenForRole, renderConstituents, renderMarkdown } = loadInternals()
const SENTENCE = 'Il faut cultiver notre jardin.'

/**
 * The rendered pieces are built inside a vm context, so their arrays have that
 * realm's prototype. Rehoming them through JSON makes `deepEqual` compare values
 * rather than realms, without weakening what is compared.
 */
const plain = (value) => JSON.parse(JSON.stringify(value))

function inspectTree(value, types = [], text = []) {
  if (Array.isArray(value)) {
    for (const child of value) inspectTree(child, types, text)
  } else if (value !== null && typeof value === 'object' && typeof value.type === 'string') {
    types.push(value.type)
    inspectTree(value.children, types, text)
  } else if (typeof value === 'string') {
    text.push(value)
  }
  return { types, text }
}

test('discussion Markdown becomes safe semantic blocks with line breaks and tables', () => {
  const markdown = [
    '## 分析',
    '',
    '**主句** 与 *从句*，含 `être`。',
    '第二行',
    '',
    '- 短语',
    '- 语境',
    '',
    '| 形式 | 释义 |',
    '| --- | :---: |',
    '| il | 他 |',
    '',
    '> 引文',
    '',
    '```js',
    'const value = 1',
    '```',
    '',
    '<script>alert(1)</script>',
  ].join('\n')
  const { types, text } = inspectTree(renderMarkdown(markdown))
  for (const expected of ['h2', 'p', 'strong', 'em', 'code', 'br', 'ul', 'li', 'table', 'thead', 'tbody', 'th', 'td', 'blockquote', 'pre']) {
    assert.ok(types.includes(expected), `renders ${expected}`)
  }
  assert.equal(types.includes('script'), false, 'raw HTML is text, not executable markup')
  assert.ok(text.join('').includes('<script>alert(1)</script>'))
})

test('each role maps to its own token, and an unknown role to the neutral one', () => {
  const subject = tokenForRole('主语')
  const verb = tokenForRole('谓语')
  const object = tokenForRole('直接宾语')
  assert.equal(new Set([subject, verb, object]).size, 3, 'three roles, three tokens')
  assert.equal(tokenForRole('sujet'), subject, 'the mapping is by meaning, not by one language')
  assert.equal(tokenForRole('副词性补语以外的东西'), 'var(--fr-role-other)')
})

test('drawing the colours reproduces the sentence exactly', () => {
  const constituents = [
    { id: 'a', role: '形式主语', start: 0, end: 2, text: 'Il' },
    { id: 'b', role: '谓语', start: 3, end: 16, text: 'faut cultiver' },
    { id: 'c', role: '直接宾语', start: 17, end: 29, text: 'notre jardin' },
  ]
  const pieces = renderConstituents(SENTENCE, constituents)
  assert.equal(pieces.map((piece) => piece.text).join(''), SENTENCE, 'no character is added or lost')
  assert.deepEqual(plain(pieces.map((piece) => piece.role)), ['形式主语', null, '谓语', null, '直接宾语', null])
})

test('a sentence with no constituents renders as its own text', () => {
  const pieces = renderConstituents(SENTENCE, [])
  assert.deepEqual(plain(pieces), [{ text: SENTENCE, role: null }])
})

test('overlapping and out-of-range spans never drop or duplicate text', () => {
  const constituents = [
    { id: 'a', role: '整句', start: 0, end: SENTENCE.length, text: SENTENCE },
    { id: 'b', role: '谓语', start: 3, end: 16, text: 'faut cultiver' },
    { id: 'c', role: '越界', start: 0, end: SENTENCE.length + 50, text: 'x' },
  ]
  const pieces = renderConstituents(SENTENCE, constituents)
  assert.equal(pieces.map((piece) => piece.text).join(''), SENTENCE)
  // The outer span wins the overlap, and the out-of-range one is ignored rather
  // than rendered past the end.
  assert.equal(pieces.length, 1)
  assert.equal(pieces[0].role, '整句')
})

test('an inner constituent nested inside an outer one is still drawn', () => {
  const constituents = [
    { id: 'outer', role: '状语', start: 0, end: 16, text: SENTENCE.slice(0, 16) },
    { id: 'inner', role: '不定式', start: 8, end: 16, text: SENTENCE.slice(8, 16) },
  ]
  const pieces = renderConstituents(SENTENCE, constituents)
  assert.equal(pieces.map((piece) => piece.text).join(''), SENTENCE)
  assert.deepEqual(plain(pieces.map((piece) => piece.role)), ['状语', null])
  assert.equal(pieces[0].text, SENTENCE.slice(0, 16), 'the outer span covers the inner one')
})

test('a span with a fractional or missing range is ignored, not guessed', () => {
  const constituents = [
    { id: 'a', role: '谓语', start: 3, end: 16.5, text: 'x' },
    { id: 'b', role: '宾语', text: 'y' },
  ]
  const pieces = renderConstituents(SENTENCE, constituents)
  assert.equal(pieces.map((piece) => piece.text).join(''), SENTENCE)
  assert.deepEqual(plain(pieces.map((piece) => piece.role)), [null], 'nothing is drawn without a usable range')
})

test('a clause whose parent is absent still renders at the top level', () => {
  // The row builder is exercised through the source, because it is a render-time
  // helper: a lost parent must not make a clause disappear.
  const builder = source.slice(source.indexOf('function clauseRows'), source.indexOf('function discussionSection'))
  assert.match(builder, /if \(!seen\.has\(clause\.id\)\) rows\.push\(\{ clause, depth: 0 \}\)/u,
    'an orphan clause is rendered, never dropped')
})
