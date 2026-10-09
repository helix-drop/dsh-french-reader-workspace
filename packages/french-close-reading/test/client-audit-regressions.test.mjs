import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import vm from 'node:vm'

const packageRoot = fileURLToPath(new URL('../', import.meta.url))
const clientSource = readFileSync(path.join(packageRoot, 'client.js'), 'utf8')

function makeClient(states = []) {
  let registration
  let hookIndex = 0
  const updates = []
  const createElement = (type, props, ...children) => ({
    type,
    props: props ?? {},
    children: children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false),
  })
  const React = {
    createElement,
    useCallback: (value) => value,
    useEffect: () => {},
    useLayoutEffect: () => {},
    useRef: (value) => ({ current: value }),
    useState: (initial) => {
      const index = hookIndex++
      return [states[index] === undefined ? initial : states[index], (value) => {
        updates.push({ index, value })
      }]
    },
  }
  const window = { __ModuleLoader__: { load: (entry) => { registration = entry } } }
  const context = vm.createContext({
    window,
    console,
    TextEncoder,
    Blob: class {},
    URL,
    crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000099' },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  })
  vm.runInContext(clientSource, context, { filename: 'client.js' })
  assert.ok(registration)
  const module = registration.factory((id) => {
    assert.equal(id, 'react')
    return React
  })
  return { internals: module.__test__, updates, createElement, resetHooks: () => { hookIndex = 0 } }
}

function allNodes(node) {
  if (node === null || node === undefined || typeof node !== 'object') return []
  return [node, ...(node.children ?? []).flatMap(allNodes)]
}

function renderedText(node) {
  if (node === null || node === undefined || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  return (node.children ?? []).map(renderedText).join(' ')
}

const labels = {
  conjugationFetchFailed: 'Fetch failed: {reason}',
  conjugationHint: 'Fetch requested data.',
  conjugationFetching: 'Fetching…',
  conjugationFetch: 'Fetch from source',
  conjugationNoData: 'No data',
  conjModeOral: 'Oral', conjModeBoth: 'Both', conjModeWritten: 'Written',
  conjModeLabel: 'Display mode', conjBaseCount: '{count} bases',
  conjugationTenseLabel: 'Tense', conjugationCellMissing: 'Not covered',
  audioUnavailable: 'Audio unavailable',
  grammarStoredRule: 'Stored rule', grammarRuleEmpty: 'No rule',
  grammarNotes: 'Notes', grammarPitfalls: 'Pitfalls', grammarExamples: 'Examples',
  notRecorded: 'Not recorded', grammarNoBreakdown: 'No separate structure.',
  knowledgeLoading: 'Loading', knowledgeNotFound: 'Not found',
  masteryFilter: 'Mastery', masteryLearning: 'Learning', masteryReviewing: 'Reviewing', masteryKnown: 'Known',
  askCount: '{count} asks', masteryUnknown: 'Unknown', contentAiUnverified: 'Unverified',
  knowledgeUnavailable: 'Could not load: {reason}', knowledgeRetry: 'Retry',
}
const translate = (key) => labels[key] ?? key

test('context preview identity trims the question and binds every request choice', () => {
  const { internals } = makeClient()
  const first = internals.contextPreviewIdentity('p1', 3, 'b1', 'agy', 'model-a', '  où va la négation ?  ')
  assert.equal(first, internals.contextPreviewIdentity('p1', 3, 'b1', 'agy', 'model-a', 'où va la négation ?'))
  for (const changed of [
    ['p2', 3, 'b1', 'agy', 'model-a', 'où va la négation ?'],
    ['p1', 4, 'b1', 'agy', 'model-a', 'où va la négation ?'],
    ['p1', 3, 'b2', 'agy', 'model-a', 'où va la négation ?'],
    ['p1', 3, 'b1', 'stub', 'model-a', 'où va la négation ?'],
    ['p1', 3, 'b1', 'agy', 'model-b', 'où va la négation ?'],
    ['p1', 3, 'b1', 'agy', 'model-a', 'où va la question ?'],
  ]) assert.notEqual(internals.contextPreviewIdentity(...changed), first)
})

test('local backup metadata merges without overwriting existing shelf placement or continuation', () => {
  const { internals } = makeClient()
  const mergedShelf = internals.mergeShelf(
    { books: [{ name: 'Livre', chapters: ['I'] }], placements: { local: { book: 'Livre', chapter: 'I', number: 2 } } },
    { books: [{ name: 'Livre', chapters: ['II'] }, { name: 'Autre', chapters: ['A'] }], placements: {
      local: { book: 'Autre', chapter: 'A', number: 1 }, imported: { book: 'Livre', chapter: 'II', number: 1 },
    } },
  )
  assert.deepEqual(JSON.parse(JSON.stringify(mergedShelf)), {
    books: [{ name: 'Livre', chapters: ['I', 'II'] }, { name: 'Autre', chapters: ['A'] }],
    placements: {
      local: { book: 'Livre', chapter: 'I', number: 2 },
      imported: { book: 'Livre', chapter: 'II', number: 1 },
    },
  })
  assert.deepEqual(JSON.parse(JSON.stringify(internals.mergeContinuationLinks(
    { parent: { id: 'local-next', title: 'Local' } },
    { parent: { id: 'import-next', title: 'Imported' }, another: { id: 'new', title: 'New' } },
  ))), {
    parent: { id: 'local-next', title: 'Local' }, another: { id: 'new', title: 'New' },
  })
})

test('conjugation view uses the Host tense/person codes and selects the requested tense', () => {
  const dataset = {
    state: 'dataset', lemma: 'parler', source: 'fixture', fetchStatus: 'ok', missingForms: [],
    tenses: [
      { mood: 'ind', tense: 'pre', label: 'Présent', bases: [], forms: [{ person: '1s', written: 'je parle', ipa: 'ʒə paʁl', baseIndex: null }], missingPersons: [], notes: [] },
      { mood: 'sub', tense: 'pre', label: 'Présent du subjonctif', bases: [], forms: [{ person: '3s', written: 'qu’il parle', ipa: 'kil paʁl', baseIndex: null }], missingPersons: ['1p'], notes: [] },
    ],
  }
  const { internals } = makeClient([dataset, false, '', 'both', null, null, 1])
  const tree = internals.ConjugationView({
    t: translate,
    lemma: 'parler',
    readConjugation: async () => ({ ok: true, value: dataset }),
    fetchConjugation: async () => ({ ok: true, value: { fetched: true, status: 'ok' } }),
  })
  const nodes = allNodes(tree)
  const tenseSelect = nodes.find((node) => node.type === 'select' && node.props['aria-label'] === 'Tense')
  assert.ok(tenseSelect)
  assert.equal(tenseSelect.props.value, 1)
  const visible = renderedText(tree)
  assert.match(visible, /Présent du subjonctif/u)
  assert.match(visible, /il \/ elle/u)
  assert.doesNotMatch(visible, /je parle/u, 'another tense is not drawn under the selected tense')
  assert.equal(internals.conjugationPersonLabel('1s'), 'je')
  assert.equal(internals.conjugationPersonLabel('2p'), 'vous')
  assert.equal(internals.conjugationPersonLabel('3p'), 'ils / elles')
})

test('conjugation fetch refusal is surfaced with its actual reason', async () => {
  const { internals, updates } = makeClient([
    { state: 'no-data', lemma: 'venir', reason: 'no-record' }, false, '', 'both', null, null, 0,
  ])
  const tree = internals.ConjugationView({
    t: translate,
    lemma: 'venir',
    readConjugation: async () => ({ ok: true, value: { state: 'no-data', lemma: 'venir', reason: 'no-record' } }),
    fetchConjugation: async () => ({ ok: true, value: { fetched: false, reason: 'web-unavailable' } }),
  })
  const fetchButton = allNodes(tree).find((node) => node.type === 'button' && node.children.includes('Fetch from source'))
  assert.ok(fetchButton)
  await fetchButton.props.onClick()
  assert.ok(updates.some(({ index, value }) => index === 2 && value === 'Fetch failed: web-unavailable'))
})

test('grammar card shows the authored notes, example text and pitfalls', () => {
  const { internals } = makeClient()
  const tree = internals.GrammarDetail({
    t: translate,
    entry: {
      keyPoints: 'Use subjunctive after il faut que.',
      notes: 'This clause expresses necessity.',
      exampleTexts: ['Il faut que tu viennes.'],
      pitfallTexts: ['Do not use the infinitive after que.'],
    },
  })
  const visible = renderedText(tree)
  assert.match(visible, /This clause expresses necessity/u)
  assert.match(visible, /Il faut que tu viennes/u)
  assert.match(visible, /Do not use the infinitive/u)
})

test('grammar mastery sends the displayed revision and refreshable operation id', async () => {
  const entry = {
    entryId: 'grammar-1', topic: 'Subjunctive', module: 'Mood', revision: 7,
    mastery: 'learning', askCount: 2, level: null, contentStatus: 'user',
  }
  const { internals } = makeClient([entry, true, false, '', false, 0])
  let request
  const tree = internals.KnowledgeEntry({
    t: translate,
    entryId: entry.entryId,
    tab: 'grammar',
    listLexicon: async () => ({ ok: true, value: { entries: [] } }),
    listGrammar: async () => ({ ok: true, value: { entries: [entry] } }),
    setGrammarMastery: async (value) => {
      request = value
      return { ok: true, value: { kind: 'updated', revision: 8 } }
    },
    children: null,
  })
  const mastery = allNodes(tree).find((node) => node.type === 'select' && node.props['aria-label'] === 'Mastery')
  assert.ok(mastery)
  await mastery.props.onChange({ target: { value: 'known' } })
  assert.deepEqual(JSON.parse(JSON.stringify(request)), {
    entryId: 'grammar-1', mastery: 'known', expectedRevision: 7,
    operationId: '00000000-0000-4000-8000-000000000099',
  })
})

test('archive, restore and full-backup UI are wired to the Remote methods', () => {
  assert.match(clientSource, /listArchivedPassages: \(request\) => api\.listArchivedPassages\(request\)/u)
  assert.match(clientSource, /restorePassage: \(request\) => api\.restorePassage\(request\)/u)
  assert.match(clientSource, /importLibrary: \(request\) => api\.importLibrary\(request\)/u)
  assert.match(clientSource, /browserLibrary:\s*\{\s*schemaVersion: 1,\s*bookshelf: cleanShelf\(shelf\),\s*continuations: cleanContinuationLinks\(nextPassages\)/u)
  assert.match(clientSource, /setShelf\(\(current\) => mergeShelf\(current, browserLibrary\.bookshelf\)\)/u)
  assert.match(clientSource, /setNextPassages\(\(current\) => mergeContinuationLinks\(current, browserLibrary\.continuations\)\)/u)
  assert.match(clientSource, /function archivedPassageRows\(\)/u)
  assert.match(clientSource, /void restoreOne\(item\)/u)
})
