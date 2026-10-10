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
    Component: class { constructor(props) { this.props = props; this.state = {} } },
  })).__test__
}

const internals = loadInternals()
const { tokenForRole, renderConstituents, renderMarkdown } = internals
const SENTENCE = 'Il faut cultiver notre jardin.'

/**
 * R7-B04, found in the in-app acceptance run: the library's controls must patch
 * only the field they changed.
 *
 * `setTab('grammar'); setQuery('')` runs both patches in one tick. While the
 * patch carried the whole render-scoped view, the second call re-sent the old
 * tab and undid the first, so clicking 语法 did nothing at all.
 */
test('a library control patches only the field it changed (R7-B04)', () => {
  const calls = []
  const noop = () => {}
  const tree = internals.KnowledgeLibrary({
    t: (key) => String(key),
    listLexicon: () => Promise.resolve({ ok: true, value: { entries: [] } }),
    listGrammar: () => Promise.resolve({ ok: true, value: { entries: [], pending: [] } }),
    resolveGrammarCandidate: noop,
    onReturn: noop,
    onOpenEntry: noop,
    view: { tab: 'vocab', query: 'raison', mastery: 'all' },
    onView: (patch) => calls.push(patch),
  })
  const buttons = []
  const walk = (node) => {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) { node.forEach(walk); return }
    if (node.type === 'button') buttons.push(node)
    // The stub keeps children on the element itself, React keeps them in props.
    walk(node.children ?? node.props?.children)
  }
  walk(tree)
  const label = (button) => JSON.stringify(button.children ?? button.props?.children ?? '')
  const grammarTab = buttons.find((button) => label(button).includes('grammarTab'))
  assert.ok(grammarTab, 'the grammar tab is rendered')

  grammarTab.props.onClick()
  assert.deepEqual(plain(calls), [{ tab: 'grammar' }, { query: '' }])
  assert.equal(calls.some((patch) => patch.tab !== undefined && patch.tab !== 'grammar'), false,
    'no patch carries the tab the click was replacing')
})

/**
 * Duplicate grammar topics are grouped by what the reader reads as the same name:
 * case, spacing, invisible characters and trailing punctuation are not differences.
 */
test('same-named grammar topics group together regardless of punctuation', () => {
  const key = internals.duplicateTopicKey
  assert.equal(key('que 作直接宾语。'), key('que 作直接宾语'))
  assert.equal(key('Que\u200b 作直接宾语'), key('que 作直接宾语'))
  assert.equal(key('que  作直接宾语'), key('que 作直接宾语'))
  assert.notEqual(key('que 作间接宾语'), key('que 作直接宾语'))
})

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

test('ordered lists keep their source numbering across blank-line breaks (F06)', () => {
  const markdown = [
    '1. 先确定中心词。',
    '',
    '2. 再核对性数配合。',
    '',
    '3. 最后放回全句验证。',
    '',
    '4. 结论。',
  ].join('\n')
  const lists = plain(renderMarkdown(markdown)).filter((block) => block.type === 'ol')
  assert.equal(lists.length, 4, 'each break starts its own list, as before')
  assert.deepEqual(
    lists.map((list) => (list.props.start === undefined ? 1 : list.props.start)),
    [1, 2, 3, 4],
    'every fragment carries the number the answer itself wrote',
  )
  assert.ok(lists.every((list) => list.children.length === 1))
})

test('a single interrupted ordered list is one list per fragment with its own start', () => {
  const markdown = ['3. 第三项在先。', '', '4. 第四项随后。'].join('\n')
  const lists = plain(renderMarkdown(markdown)).filter((block) => block.type === 'ol')
  assert.deepEqual(lists.map((list) => list.props.start ?? 1), [3, 4])
})

test('inline code inside bold or italic renders as code, not literal backticks (F06)', () => {
  const [heading] = renderMarkdown('### **Pourquoi le `e` ?**')
  assert.equal(heading.type, 'h3')
  const strong = plain(heading).children[0]
  assert.equal(strong.type, 'strong')
  assert.equal(strong.children[0], 'Pourquoi le ')
  assert.equal(strong.children[1].type, 'code', 'the backticks became a code node')
  assert.equal(strong.children[1].children[0], 'e')
  assert.equal(strong.children[2], ' ?')
  assert.doesNotMatch(JSON.stringify(plain(heading)), /`/u, 'no literal backtick survives')

  const [paragraph] = renderMarkdown('*为什么用 `e` 而不是 `é`？*')
  const em = plain(paragraph).children[0]
  assert.equal(em.type, 'em')
  assert.deepEqual(em.children.filter((child) => typeof child === 'object' && child !== null).map((child) => child.type),
    ['code', 'code'], 'both code spans inside the emphasis parse')
})

test('an announced-but-empty section still renders its slot and the conjugation seam (R6-B01)', () => {
  const { LexiconCard } = loadInternals()
  const t = (key) => (key === 'notRecorded' ? '未记录' : key)
  // What renderLexicon returns for a verb saved as 动词 with no conjugation text:
  // §4 is announced in sections, but the policy skipped it in the rendered text
  // because the section is empty.
  const value = {
    kind: 'card',
    rendered: [
      '§1 总览',
      '词形 aperçue · 原形 apercevoir · 词性 动词',
      '§2 当前含义',
      '1. 瞥见。（本义）',
      '§6 文化语境',
      '未发现可靠关联。',
      '§7 固定表达',
      '未发现可靠关联。',
    ].join('\n'),
    sections: [
      { number: '§1', title: '总览', required: true },
      { number: '§2', title: '当前含义', required: true },
      { number: '§4', title: '动词变位', required: false },
      { number: '§3a', title: '词源', required: false },
      { number: '§3b', title: '语义演变', required: false },
      { number: '§5', title: '词组关联', required: false },
      { number: '§6', title: '文化语境', required: true },
      { number: '§7', title: '固定表达', required: true },
    ],
    errors: [], hints: [],
  }
  const seams = []
  const tree = LexiconCard({
    t, value,
    entry: { mot: 'aperçue', lemma: 'apercevoir', partOfSpeech: '动词' },
    extraForSection: (section) => {
      seams.push(section.number)
      return section.number === '§4' ? { type: 'conjugationView' } : null
    },
  })
  const plainTree = plain(tree)
  // `h(nav, …, parsed.map(…))` nests the button array one level deep.
  const indexLabels = plainTree.children[0].children[0].map((child) => child.children.join(''))
  assert.ok(indexLabels.some((label) => label.includes('§4 动词变位')),
    '§4 is in the section index even though the card has no conjugation text')
  const sections = plainTree.children.slice(1).flat()
  const four = sections.find((section) => section.props.id === 'entry-section-4')
  assert.ok(four, 'a §4 section element exists')
  const seen = inspectTree(four)
  assert.ok(seen.text.join('').includes('动词变位'), 'the §4 heading is rendered')
  assert.ok(seen.types.includes('conjugationView'),
    'the conjugation seam ran inside §4, so the fetch entry is reachable')
  assert.ok(seen.text.includes('未记录'),
    'an empty announced section says it is not recorded instead of vanishing')
  assert.ok(seams.includes('§4'), 'extraForSection was offered to §4')
})
