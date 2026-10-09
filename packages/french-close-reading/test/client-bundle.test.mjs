import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import vm from 'node:vm'

import { TYPERT as hostTypert } from '../lib/typert.host.js'

const packageRoot = fileURLToPath(new URL('../', import.meta.url))
const source = readFileSync(path.join(packageRoot, 'client.js'), 'utf8')

/** Module-table baseline: a browser half may require these and nothing else. */
const BASELINE = new Set(['react', 'react-dom', 'react/jsx-runtime'])

function loadBundle() {
  const registrations = []
  const window = {
    __ModuleLoader__: { load: (registration) => registrations.push(registration) },
  }
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

function materialize(registration) {
  const requests = []
  const require = (id) => {
    requests.push(id)
    if (!BASELINE.has(id)) {
      throw new Error(`client-modules: require(${JSON.stringify(id)}) missed the module table`)
    }
    return {
      createElement: () => null,
      useCallback: (value) => value,
      useEffect: () => {},
      useRef: (value) => ({ current: value }),
      useState: (value) => [value, () => {}],
    }
  }
  return { plugin: registration.factory(require), requests }
}

test('the client factory resolves against the baseline module table only', () => {
  const registration = loadBundle()
  assert.equal(registration.id, '@local/french-close-reading')
  const { plugin, requests } = materialize(registration)
  assert.deepEqual(requests, ['react'])
  assert.deepEqual(Array.from(plugin.inject), ['remote', 'locale'])
})

test('apply mounts exactly the endpoints of the generated Host contract', async () => {
  const { plugin } = materialize(loadBundle())
  const mounted = []
  const disposed = []
  const registered = []
  const ctx = {
    effect: (factory) => factory(),
    locale: {
      register: (ns, dictionaries) => { registered.push([ns, Object.keys(dictionaries)]) },
      bind: () => (key) => key,
    },
    plugin: () => ({ dispose: async () => { disposed.push('ui') } }),
    layout: { selectPanel: () => {} },
    slots: {
      inject: (_name, register) => register(),
      register: () => {},
    },
    remote: {
      frenchReader: {
        listPassages: async () => ({ ok: true, value: {} }),
        getPassage: async () => ({ ok: true, value: {} }),
        createPassage: async () => ({ ok: true, value: {} }),
        exportPassages: async () => ({ ok: true, value: {} }),
      },
      $mount: async (contribution) => {
        mounted.push(contribution)
        return async () => { disposed.push('remote') }
      },
    },
  }

  const dispose = await plugin.apply(ctx)
  assert.equal(mounted.length, 1)
  assert.equal(mounted[0].package, '@local/french-close-reading')
  assert.deepEqual(registered, [['french-close-reading', ['zh', 'en']]])

  // Array.from rehomes the cross-realm array the vm context produced.
  const ids = Array.from(mounted[0].descriptors, (descriptor) => descriptor.id).sort()
  assert.deepEqual(ids, hostTypert.invocations.map((item) => item.id).sort())
  for (const descriptor of mounted[0].descriptors) {
    for (const parameter of descriptor.parameters) {
      assert.equal(parameter.codec.mode, 'strict')
      // The client registry rejects a strict codec without a create() factory.
      assert.equal(typeof parameter.codec.create, 'function')
    }
    assert.equal(descriptor.result.mode, 'strict')
    assert.equal(typeof descriptor.result.create, 'function')
    assert.equal(descriptor.cancellation.parameter, 'signal')
  }

  await dispose()
  assert.deepEqual(disposed, ['ui', 'remote'])
})

/**
 * Both themes are live at once, so a raw colour in the stylesheet silently breaks
 * one of them. The live Client Theme provider lists exactly these tokens, and
 * every one requires a light and a dark value.
 */
const LIVE_TOKENS = new Set([
  '--dsw-alias-bg-base', '--dsw-alias-bg-layer-1', '--dsw-alias-bg-layer-2', '--dsw-alias-bg-overlay',
  '--dsw-alias-border-l1', '--dsw-alias-border-l2', '--dsw-alias-brand-primary',
  '--dsw-alias-label-primary', '--dsw-alias-label-secondary',
  '--dsw-alias-state-error-primary', '--dsw-alias-state-idle-primary',
  '--dsw-alias-state-success-primary', '--dsw-alias-state-warn-primary',
  '--dsw-specific-sidebar-fill',
])

test('the panel uses only live theme tokens and no raw colours', () => {
  // Two stylesheets live in this bundle: the transplanted prototype block, and the
  // hand-written `styles` template. The transplanted one is the reader's accepted design
  // moved rule for rule, colours included, so it is exempt — **and light-only**, which is
  // recorded as a limitation rather than hidden (spec §12, handoff M5-G). The rule below
  // therefore protects the part that must adapt to both live themes.
  const at = source.indexOf('const styles = `')
  assert.notEqual(at, -1, 'the hand-written stylesheet is present')
  const close = source.indexOf('`\n', at + 'const styles = `'.length)
  const handWritten = source.slice(at, close)

  // The single documented exception is the constituent-role palette: it declares
  // `--fr-role-*` in both themes, and the next test proves both halves exist. Everywhere
  // else a raw colour is a bug, so the declarations themselves are removed first.
  const withoutRoles = handWritten.replace(/--fr-role-[a-z-]+\s*:\s*[^;]+;/gu, '')
  const raw = [...withoutRoles.matchAll(/(?<![\w-])(?:#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\))/gu)]
    .map((match) => match[0])
  assert.deepEqual(raw, [], 'no raw colour may be hard-coded outside the role palette')

  // Every token it does use must be one the live Theme provider actually declares.
  const used = new Set([...handWritten.matchAll(/var\((--dsw-[a-z0-9-]+)/gu)].map((match) => match[1]))
  const unknown = [...used].filter((token) => !LIVE_TOKENS.has(token))
  assert.deepEqual(unknown, [], 'a token the Theme provider does not declare renders as nothing')
})

/**
 * The one exception, and the guard that makes it safe.
 *
 * A constituent role needs more distinct hues than the live alias tokens provide
 * (subject, verb, object, attribute, adverbial, infinitive, modifier, other), and
 * reusing error/success tokens would make two roles look identical. So the palette
 * is declared as plugin tokens — but every one of them must have a **light and a
 * dark value**, which is exactly the requirement the live Theme provider states
 * for its own tokens and exactly what a bare hex value would fail.
 */
test('every plugin role token has a value for both themes', () => {
  const themeBlock = (selector) => {
    const at = source.indexOf(selector)
    assert.notEqual(at, -1, `${selector} block is declared`)
    const open = source.indexOf('{', at)
    const close = source.indexOf('}', open)
    return source.slice(open + 1, close)
  }
  const declared = (block) => {
    const values = new Map()
    for (const match of block.matchAll(/--fr-role-([a-z-]+)\s*:\s*([^;]+);/gu)) {
      values.set(match[1], match[2].trim())
    }
    return values
  }

  const light = declared(themeBlock(':root{'))
  const dark = declared(themeBlock("[data-theme='dark']{"))
  assert.equal(light.size >= 8, true, 'the role palette covers the roles the mapper knows')

  const missingDark = [...light.keys()].filter((role) => !dark.has(role))
  assert.deepEqual(missingDark, [], 'a role token without a dark value breaks the dark theme')
  const identical = [...light.entries()]
    .filter(([role, value]) => dark.get(role) === value && !value.startsWith('var('))
    .map(([role]) => role)
  assert.deepEqual(identical, [], 'a dark value identical to the light one is a token that does nothing')
})

/** The colour a role maps to is decided in one place, by role text. */
test('the role mapping is by role, with a neutral fallback', () => {
  const mapping = source.slice(source.indexOf('const ROLE_TOKENS'), source.indexOf('const internals'))
  for (const role of ['主语', '谓语', '直接宾语', '表语', '状语', '不定式', '修饰']) {
    assert.equal(mapping.includes(role), true, `the mapper knows ${role}`)
  }
  assert.match(mapping, /--fr-role-other/u, 'an unknown role gets the neutral token, not a guess')
})

/**
 * A panel feature is only real if it is wired into the render tree. Editing the
 * bundle by anchor text once silently dropped a whole component while the strings
 * for it were added, so each capability is now asserted by its definition AND its
 * use, not by a label alone.
 */
test('every panel capability is defined and actually rendered', () => {
  const required = [
    ['knowledge section definition', 'function KnowledgeSection('],
    ['knowledge section rendered', 'h(KnowledgeSection'],
    ['vocabulary tab', "t('lexiconTab')"],
    ['grammar tab', "setTab('grammar')"],
    ['card request', 'renderLexicon({ entryId: entry.entryId'],
    ['card verdict shown', 'card.value.errors'],
    ['decision: attach', "decide(item, 'attach'"],
    ['decision: create', "decide(item, 'create'"],
    ['decision: discard', "decide(item, 'discard'"],
    ['rule rewrite is opt-in', 'keyPoints: rule === undefined || rule.trim()'],
    ['preview before save', "preview === null ? t('preview')"],
    ['confirm before save', "t('confirmSave')"],
    ['selection captured in the quote', 'function captureReadingSelection()'],
    ['the capture is strict about the quote', "start?.closest?.('.quote')"],
    ['the captured word drives the lookup', "void lookupWord(selectedWord)"],
    ['sentences are focusable', 'tabIndex: 0'],
    ['sentences are selectable', "className: 'paragraphSentence"],
    ['keyboard activation', "event.key !== 'Enter'"],
    ['paragraph offsets', "'data-paragraph-id': paragraph.id"],
    // The offset is measured inside the paragraph text element alone; measuring
    // the section would count the chip and badges rendered beside it.
    ['selection captured inside the quote', 'function captureReadingSelection()'],
    ['the lookup acts on the captured word', "void lookupWord(selectedWord)"],
    ['the backup exports the whole library', 'await exportLibrary()'],
    // The generation surface: the reader picks a backend and model, sees what a
    // turn would send, and only then sends it.
    ['the backend list is read', 'await listBackends({ scope: \'all\' })'],
    ['the model list is read', 'await listBackendModels({ backend: name })'],
    ['the context is previewed before sending', 'await previewAsk({'],
    ['the preview fingerprint travels with the send', 'expectedFingerprint: contextPreview === null ? null : contextPreview.fingerprint'],
    // The turn is sent through the stream when the Host offers one, and through the
    // unary call when it does not, so the guard tracks the call, not one branch of it.
    ['the turn is sent', 'unwrap(await ask(request), t)'],
    ['the discussion is read back', 'await listDiscussion({ passageId })'],
    ['a branch is opened from the panel', 'await createBranch({'],
    ['a branch state is set', 'await setBranchState({'],
    // Vocabulary sources and the reader's own mastery decision.
    ['declared sources are read', "listLexiconSources({ scope: 'all' })"],
    ['a source fetch is deliberate', 'await fetchLexiconSource({'],
    ['the source verdict is shown as a result', 'setSourceState({'],
    ['a refused fetch is shown as a refusal', "format(t, 'sourceRefused', { reason: value.reason ?? '' })"],
    ['mastery is the reader\'s act', 'await setGrammarMastery({'],
    ['mastery controls are rendered per entry', 'onClick: () => moveMastery(entry, mastery)'],
    // The six-part analysis: generated through the chosen backend, refused with a
    // reason, and rendered from structure. Version publishing stays a Host
    // capability (the Remote is declared and wired); the panel entry was removed
    // because its handler shadowed the Remote name and recursed into itself, so
    // there is no call site left to pin.
    ['the analysis is read, not generated, on focus', 'await readSentenceAnalysis({ passageId: activePassage.id, anchorId })'],
    ['coverage is measured', 'await readAnalysisCoverage({ passageId })'],
    ['the analysis is generated on demand', 'await analyseSentence({'],
    ['a refused analysis shows the gate reason', "format(t, 'analysisRefused', { reason: value.reason, detail: value.failure ?? '' })"],
    ['the colour comes from the role token', 'color: tokenForRole(piece.role)'],
    ['explanations carry their certainty', 't(`certainty_${explanation.kind}`)'],
    ['clauses are drawn with their nesting', 'clauseRows(found.clauses)'],
    // A reader works a paragraph at a time, and the batch spends one call per
    // sentence, so the label carries the count before anything is sent.
    ['the paragraph batch is wired', 'await analyseParagraph({'],
    ['a failed sentence is named', "format(t, 'paragraphFailed', { anchorId: first.anchorId, reason: first.reason })"],
    ['sources-only export stays separate', 'await exportPassages()'],
    // Both are used through format(t, key, …), so the key is the marker.
    ['endpoint failures are reported', "'knowledgeUnavailable'"],
    ['missing preview endpoint handled', "'previewUnavailable'"],
  ]
  const missing = required.filter(([, marker]) => !source.includes(marker)).map(([label]) => label)
  assert.deepEqual(missing, [], 'a panel capability lost its definition or its use')
})

test('the transplanted palette is tokenised, with its literals declared once', () => {
  const at = source.indexOf('const PROTOTYPE_STYLES = `') + 'const PROTOTYPE_STYLES = `'.length
  const close = source.indexOf('`\n\n    const styles = `', at)
  assert.notEqual(close, -1, 'the transplanted block is present')
  const block = source.slice(at, close)
  // Two declaration blocks — the light values and the dark ones — and no literals in any
  // rule. The dark block is itself a declaration block, so it is excluded from `rules`.
  const lightEnd = block.indexOf('}', block.indexOf('.fr-root{--fr-c'))
  assert.notEqual(lightEnd, -1, 'the light palette block is declared')
  const darkAt = block.indexOf("[data-theme='dark'] .fr-root{")
  assert.notEqual(darkAt, -1, 'the dark palette block is declared')
  const darkEnd = block.indexOf('}', darkAt)
  const declarations = block.slice(0, lightEnd)
  const darkDeclarations = block.slice(darkAt, darkEnd)
  const rules = block.slice(0, block.indexOf('.fr-root{--fr-c')) + block.slice(darkEnd + 1)
  assert.equal((declarations.match(/--fr-c\d+:/gu) ?? []).length, 204, 'every colour has a token')
  assert.deepEqual([...rules.matchAll(/(?<![\w-])#[0-9a-fA-F]{3,8}\b/gu)].map((m) => m[0]), [],
    'no raw colour survives in the rules')
  assert.equal((rules.match(/var\(--fr-c\d+\)/gu) ?? []).length, 220, 'and the rules use them')

  // The dark half: one value per token, and none of them a copy of the light one.
  const dark = [...darkDeclarations.matchAll(/--fr-c(\d+):([^;}]+)/gu)].map((m) => [m[1], m[2].trim()])
  const light = [...declarations.matchAll(/--fr-c(\d+):([^;}]+)/gu)].map((m) => [m[1], m[2].trim()])
  assert.equal(dark.length, 204, 'every token has a dark value')
  assert.deepEqual(dark.filter(([id, value]) => light.find(([l]) => l === id)?.[1] === value), [],
    'a dark value identical to the light one is a token that does nothing')
})
