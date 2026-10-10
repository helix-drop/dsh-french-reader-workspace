import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import vm from 'node:vm'

/**
 * The browser half is plain JavaScript loaded raw by the module loader, so its
 * internals are reached the same way the loader does it: evaluate the bundle
 * against a stub `window` and take what the factory returns.
 */
const packageRoot = fileURLToPath(new URL('../', import.meta.url))
const source = readFileSync(path.join(packageRoot, 'client.js'), 'utf8')

/**
 * `document.createTreeWalker` is the one browser API the measurement calls.
 * Node has no DOM, so the harness supplies the two methods it actually uses:
 * walk the element's own children, and hand back the text nodes in order.
 */
const documentStub = {
  createTreeWalker(root, whatToShow) {
    if (whatToShow !== 4) throw new Error('the measurement must ask for text nodes only')
    const queue = [...root.children]
    let index = 0
    return {
      nextNode() {
        while (index < queue.length) {
          const node = queue[index++]
          if (node.nodeType === 3) return node
          if (Array.isArray(node.children)) queue.push(...node.children)
        }
        return null
      },
    }
  },
}

function loadPlugin() {
  const registrations = []
  const window = { __ModuleLoader__: { load: (registration) => registrations.push(registration) } }
  const context = vm.createContext({
    window, console, TextEncoder, Blob: class {}, URL, document: documentStub,
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  })
  vm.runInContext(source, context, { filename: 'client.js' })
  return registrations[0].factory(() => ({
    createElement: () => null,
    useCallback: (value) => value,
    useEffect: () => {},
    useRef: (value) => ({ current: value }),
    useState: (value) => [value, () => {}],
    Component: class { constructor(props) { this.props = props; this.state = {} } },
  }))
}

const plugin = loadPlugin()
const { measureSelection, paragraphOffsetBefore } = plugin.__test__
const PARAGRAPH = 'Le cœur a ses raisons que la raison ne connaît point.'
const PARAGRAPH_ANCHOR = { id: 'p1', start: 100, end: 100 + PARAGRAPH.length, text: PARAGRAPH }

/**
 * The smallest DOM this measurement touches: text nodes with a parent chain, a
 * paragraph element that owns them, and a tree walker over that element. It is
 * deliberately not a DOM implementation — it is the exact surface the
 * measurement reads, so the test exercises the real counting rule.
 */
function dom({ chip = 'p1', badges = '2 条批注' } = {}) {
  const makeText = (parent, data) => ({ nodeType: 3, data, textContent: data, parentElement: parent })
  const makeElement = (tag, attrs = {}) => {
    const element = {
      nodeType: 1, attrs,
      children: [],
      textContent: '',
      getAttribute: (name) => attrs[name] ?? null,
      contains(node) {
        for (let current = node; current; current = current.parentElement) if (current === element) return true
        return false
      },
      querySelector(selector) {
        if (selector !== 'p[data-paragraph-text]') return null
        return element.children.find((child) => child.attrs['data-paragraph-text'] !== undefined) ?? null
      },
      append(child) { child.parentElement = element; element.children.push(child); return child },
      appendText(data) {
        const node = makeText(element, data)
        element.children.push(node)
        // textContent aggregates like the DOM's does, so a container's own text
        // is the sum of its descendants — which is what the old measurement read.
        for (let current = element; current; current = current.parentElement) {
          current.textContent = (current.textContent ?? '') + data
        }
        return node
      },
    }
    return element
  }

  // Mirror the real render shape: a <section data-paragraph-id> holding a header
  // (chip + badges, i.e. chrome) and the <p data-paragraph-text> with the text.
  const section = makeElement('section', { 'data-paragraph-id': PARAGRAPH_ANCHOR.id })
  const head = makeElement('div', { class: 'fr-paraHead' })
  const chipNode = makeElement('button', { class: 'fr-chip' })
  chipNode.appendText(chip)
  const badgeNode = makeElement('span', { class: 'fr-badges' })
  badgeNode.appendText(badges)
  head.append(chipNode).append(badgeNode)
  section.appendText('')
  const para = makeElement('p', { 'data-paragraph-text': '' })
  // Sentence spans, exactly as paragraphBlock builds them.
  const sentences = []
  let cursor = 0
  const size = Math.ceil(PARAGRAPH.length / 3)
  while (cursor < PARAGRAPH.length) {
    const text = PARAGRAPH.slice(cursor, cursor + size)
    sentences.push(para.appendText(text))
    cursor += size
  }
  section.append(head).append(para)
  return { section, head, para, sentences }
}

test('the offset counts paragraph text only, never the paragraph chrome', () => {
  const { section, head, para, sentences } = dom()
  const startNode = sentences[1]
  const localOffset = sentences[0].data.length + 3

  const offset = paragraphOffsetBefore(para, startNode, 3)
  assert.equal(offset, localOffset, 'the walker counts the text nodes before it')

  // The bug this replaces: measuring the whole section added the chip and the
  // badges (and would have counted any other chrome rendered beside the text).
  const chromeLength = head.children[0].textContent.length + head.children[1].textContent.length
  assert.ok(chromeLength > 0, 'the fixture really renders chrome')
  assert.notEqual(offset, localOffset + chromeLength)
  assert.equal(section.getAttribute('data-paragraph-id'), 'p1')
})

test('the chrome is invisible to the measurement, whatever it says', () => {
  const long = dom({ chip: 'p1 —— 很长的段落编号 ——', badges: '12 个分支 · 3 个未解决问题' })
  const short = dom({ chip: '', badges: '' })
  assert.equal(paragraphOffsetBefore(long.para, long.sentences[1], 0), paragraphOffsetBefore(short.para, short.sentences[1], 0))
})

test('a span inside the paragraph reports the offsets the reader sees', () => {
  const { para, sentences } = dom()
  const start = sentences[0].data.length + 2
  const end = start + 5
  const span = measureSelection(para, PARAGRAPH_ANCHOR, sentences[1], 2, sentences[1], 7)
  assert.equal(span.start, start)
  assert.equal(span.end, end)
  assert.equal(span.excerpt, PARAGRAPH.slice(start, end))
})

test('a collapsed or reversed span is refused rather than offered', () => {
  const { para, sentences } = dom()
  assert.equal(measureSelection(para, PARAGRAPH_ANCHOR, sentences[1], 4, sentences[1], 4), null)
  assert.equal(measureSelection(para, PARAGRAPH_ANCHOR, sentences[2], 3, sentences[0], 3), null)
})

test('a position outside the paragraph text is not measured', () => {
  const { para, head } = dom()
  assert.equal(measureSelection(para, PARAGRAPH_ANCHOR, head, 0, head, 2), null, 'the section header is not the text')
  assert.equal(paragraphOffsetBefore(para, { nodeType: 3, data: 'elsewhere', textContent: 'elsewhere' }, 0), null)
})

test('an excerpt that is only whitespace is refused', () => {
  const spaced = 'Un   espace.'
  const para = {
    nodeType: 1, children: [],
    contains: () => true,
    querySelector: () => null,
    getAttribute: () => null,
  }
  const node = { nodeType: 3, data: spaced, textContent: spaced, parentElement: para }
  para.children.push(node)
  assert.equal(
    measureSelection(para, { id: 'p1', start: 0, end: spaced.length, text: spaced }, node, 2, node, 4),
    null,
  )
})
