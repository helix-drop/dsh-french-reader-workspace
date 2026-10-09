import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import vm from 'node:vm'

/**
 * The conjugation tab's client half.
 *
 * Two failure modes are worth a test here, because both are invisible until a reader
 * sees them:
 *
 * 1. **A raw label key in the panel.** `t()` falls back to the key itself, so a
 *    missing dictionary entry renders as `conjugationFetched` on screen. The keys are
 *    read out of the panel's own source, so this test follows the panel rather than a
 *    list someone has to remember to update.
 * 2. **A descriptor that disagrees with the Host.** The remote call is only valid if
 *    the argument is sent under the name the Host declares, and the gateway refuses
 *    anything else.
 */
const packageRoot = fileURLToPath(new URL('../', import.meta.url))
const source = readFileSync(path.join(packageRoot, 'client.js'), 'utf8')

function loadBundle() {
  const registrations = []
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
  assert.equal(registrations.length, 1)
  return registrations[0]
}

/** The two label dictionaries, as the client declares them. */
function dictionaries() {
  const zh = /\n    const zh = \{([\s\S]*?)\n    \}\n/u.exec(source)
  const en = /\n    const en = \{([\s\S]*?)\n    \}\n/u.exec(source)
  assert.notEqual(zh, null, 'the zh dictionary is declared')
  assert.notEqual(en, null, 'the en dictionary is declared')
  const keys = (body) => new Set([...body.matchAll(/(?:^|\s)([A-Za-z][A-Za-z0-9_]*):\s*['"]/gu)].map((match) => match[1]))
  return { zh: keys(zh[1]), en: keys(en[1]) }
}

/** Every label key the conjugation panel asks for. */
function panelKeys() {
  // The conjugation UI is `ConjugationView` now (with `conjTop` / `conjBaseRail` / `conjRow`);
  // the old inline panel it replaced is gone.
  const start = source.indexOf('function ConjugationView(')
  assert.notEqual(start, -1, 'the conjugation renderer is where this test expects it')
  const end = source.indexOf('function LexiconCard(', start)
  const body = source.slice(start, end === -1 ? undefined : end)
  const keys = new Set()
  for (const match of body.matchAll(/t\('([A-Za-z][A-Za-z0-9_]*)'/gu)) keys.add(match[1])
  for (const match of body.matchAll(/format\(t,\s*'([A-Za-z][A-Za-z0-9_]*)'/gu)) keys.add(match[1])
  // `t(\`conjX_${…}\`)` builds a key by template; the certainty-style keys are the only ones
  // this panel does that for, and they are asserted separately.
  return { body, keys }
}

test('the panel declares both conjugation calls against the Host contract', () => {
  const registration = loadBundle()
  const requests = []
  const require = (id) => {
    requests.push(id)
    return {
      createElement: () => null,
      useCallback: (value) => value,
      useEffect: () => {},
      useRef: (value) => ({ current: value }),
      useState: (value) => [value, () => {}],
    }
  }
  registration.factory(require)
  assert.deepEqual([...new Set(requests)], ['react'], 'the client half stays on the baseline table')

  for (const [method, parameter] of [['readConjugation', 'request'], ['fetchConjugation', 'request']]) {
    // Slice from the descriptor's id, because `namespace`/`service` precede `method`.
    const at = source.indexOf(`#frenchReader/${method}'`)
    assert.notEqual(at, -1, `${method} is declared`)
    const block = source.slice(at, at + 1_400)
    assert.match(block, /namespace: 'frenchReader'/u)
    assert.match(block, /invocation: \{ kind: 'direct' \}/u)
    assert.match(block, new RegExp(`name: '${parameter}', wire: '${parameter}'`, 'u'))
    // The client builds strict codecs through its own helper; the registry replica in
    // `client-registry.test.mjs` is what proves they pass validation.
    assert.match(block, /codec: strict\(/u, 'the parameter codec is strict')
    assert.match(block, /result: strict\(/u, 'the result codec is strict')
    assert.match(block, /cancellation: \{ parameter: 'signal' \}/u)
  }
  // The reader's fetch is cancellable and the read is not a mutation: neither is a
  // stream, and neither takes an argument the Host does not declare.
  const read = source.slice(
    source.indexOf("#frenchReader/readConjugation'"), source.indexOf("#frenchReader/fetchConjugation'"),
  )
  assert.match(read, /lemma: S\.str/u, 'the argument the Host declares is the one sent')
})

test('a manually saved verb entry opens at its own conjugation section', () => {
  assert.match(source, /setKnowledgeFocusConjugationEntryId\(draft\.lemma\.trim\(\) === '' \? null : value\.entryId\)/u)
  assert.match(source, /focusConjugation: knowledgeFocusConjugationEntryId === entry\?\.entryId/u)
  assert.match(source, /document\.querySelector\('\.conjugationView'\)/u)
  assert.match(source, /target\.scrollIntoView\(\{ block: 'start'/u)
})

test('every label the conjugation panel uses exists in both dictionaries', () => {
  const { keys } = panelKeys()
  assert.equal(keys.size >= 10, true, `the panel asks for ${String(keys.size)} labels`)
  const { zh, en } = dictionaries()
  const missingZh = [...keys].filter((key) => !zh.has(key))
  const missingEn = [...keys].filter((key) => !en.has(key))
  assert.deepEqual(missingZh, [], 'a missing zh label renders as the raw key in front of the reader')
  assert.deepEqual(missingEn, [], 'a missing en label renders as the raw key too')
  // And the strings the reader sees are not the keys.
  for (const key of keys) {
    // A key may share a line with another (the dictionaries do that where it reads well).
    const line = new RegExp(`[\\s{]${key}: '([^']*)'`, 'u').exec(source)
    assert.notEqual(line, null, `${key} has a value`)
    assert.notEqual(line[1], key, `${key} is not its own label`)
  }
})

test('the panel states the three data states instead of one empty list', () => {
  const { body } = panelKeys()
  // `no-data`, `pending` and `dataset` are rendered as different things, which is the
  // whole reason the Host returns three shapes rather than one.
  // `no-data` and `pending` are matched explicitly; `dataset` is the remaining branch,
  // which is the one that renders the bases.
  // The identifiers moved when the inline panel became `ConjugationView`; the guarantees did
  // not, so the assertions follow the behaviour rather than the old names.
  assert.match(body, /state\.state === 'no-data'/u)
  assert.match(body, /state\.state === 'pending'/u)
  assert.match(body, /tense\.bases/u, 'the bases are what the card shows')
  assert.match(body, /missingPersons/u, 'and what the data does not cover')
  assert.match(body, /readConjugation\(/u, 'reading is separate from fetching')
  assert.match(body, /fetchConjugation\(/u, 'and fetching is the reader’s own button')
})
