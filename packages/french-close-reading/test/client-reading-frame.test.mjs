import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

/**
 * The reading frame (M5.1), asserted structurally.
 *
 * Ported from the prototype the reader accepted: one compact bar instead of a tall
 * header, and panes separated by hairlines instead of floating cards. I cannot see the
 * pixels from here, so what this file pins is the *shape* — the classes that exist, the
 * frame the markup builds, and the constraints the reader already complained about
 * (a tall top bar, and a composer that gets clipped in a short window).
 *
 * Appearance is the reader's acceptance run; this test is what stops the frame from
 * silently reverting.
 */
const packageRoot = fileURLToPath(new URL('../', import.meta.url))
const source = readFileSync(path.join(packageRoot, 'client.js'), 'utf8')

/** One CSS rule body, by selector prefix. */
function rule(selector) {
  const at = source.indexOf(`\n      ${selector}{`)
  assert.notEqual(at, -1, `the rule ${selector} exists`)
  const end = source.indexOf('}', at)
  return source.slice(at, end)
}

function dictionaries() {
  const zh = /\n    const zh = \{([\s\S]*?)\n    \}\n/u.exec(source)
  const en = /\n    const en = \{([\s\S]*?)\n    \}\n/u.exec(source)
  assert.notEqual(zh, null)
  assert.notEqual(en, null)
  const keys = (body) => new Set([...body.matchAll(/(?:^|\s)([A-Za-z][A-Za-z0-9_]*):\s*['"]/gu)].map((match) => match[1]))
  return { zh: keys(zh[1]), en: keys(en[1]) }
}



test('the markup builds the prototype\'s frame, not the interim one', () => {
  const at = source.indexOf('function readingShell(passage)')
  const shell = source.slice(at, source.indexOf('function failurePlugin(', at))
  for (const marker of [
    "className: 'top compactTop'",
    "className: 'topLeft'",
    "className: 'navToggle'",
    "className: 'topActions'",
    "className: 'progressWrap'",
    "className: 'workspace', 'data-view': 'focus'",
    "className: `navigation",
    "className: 'navStage'",
    "className: 'navFoot'",
    "className: `pane detailPane",
  ]) {
    assert.equal(shell.includes(marker), true, `the frame builds ${marker}`)
  }
  // The interim frame I invented is gone, and so are the panes the prototype hides.
  for (const gone of ['fr-topbar', 'fr-workspace', "'pane readerPane'", "'pane graphPane'"]) {
    assert.equal(shell.includes(gone), false, `${gone} is gone`)
  }
  // The canvas is what carries the paragraphs now, through the prototype's geometry.
  assert.match(shell, /navWorld\(segmentation\.paragraphs/u)
  assert.match(source, /className: 'navWorld'/u, 'the world element exists in its renderer')
})

test('the reader-facing labels exist in both dictionaries', () => {
  const { zh, en } = dictionaries()
  for (const key of ['readingPaneTitle', 'readingEyebrow']) {
    assert.equal(zh.has(key), true, `${key} has a Chinese label`)
    assert.equal(en.has(key), true, `${key} has an English label`)
  }
  for (const key of ['readingPaneTitle', 'readingEyebrow']) {
    // Two short labels can share one line, so the key may follow a space rather than
    // start the line.
    const line = new RegExp(`[\\s{]${key}: '([^']*)'`, 'u').exec(source)
    assert.notEqual(line, null)
    assert.notEqual(line[1], key, `${key} is not its own label`)
  }
})


test('the new frame colours itself from live tokens only', () => {
  const frame = source.slice(source.indexOf('/* ---- reading frame:'), source.indexOf('.fr-paraActive{'))
  const raw = [...frame.matchAll(/(?<![\w-])(?:#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\))/gu)].map((match) => match[0])
  assert.deepEqual(raw, [], 'no raw colour may be hard-coded')
  assert.equal(frame.includes('var(--dsw-alias-'), true, 'and it does use the live tokens')
})

test('the canvas follows the prototype\'s gesture and resize semantics', () => {
  // Anchor-point zoom, clamped exactly as the prototype clamps it.
  const zoom = source.slice(source.indexOf('function zoomNavigation('), source.indexOf('function zoomNavBy('))
  assert.match(zoom, /Math\.max\(0\.2, Math\.min\(2\.4,/u)
  assert.match(zoom, /cx - \(cx - current\.x\) \* next \/ previous/u, 'zoom keeps the anchor point still')
  assert.match(zoom, /cy - \(cy - current\.y\) \* next \/ previous/u)

  // A gesture synthesises wheels right after it ends; they are ignored for 100ms.
  assert.match(source, /ignoreWheelUntil\.current = Date\.now\(\) \+ 100/u)
  assert.match(source, /Date\.now\(\) < ignoreWheelUntil\.current/u)

  // `gesture*` is not a React synthetic event, so the stage binds it itself.
  for (const event of ['gesturestart', 'gesturechange', 'gestureend']) {
    assert.equal(source.includes(`addEventListener('${event}'`), true, `${event} is bound`)
    assert.equal(source.includes(`removeEventListener('${event}'`), true, `${event} is unbound`)
  }
  assert.match(source, /ResizeObserver/u)

  // `syncStageSize()` moves the world by half the difference, so the centre holds.
  // `syncStageSize` is defined after the wheel handler, so read forward from it.
  const syncAt = source.indexOf('function syncStageSize(')
  const sync = source.slice(syncAt, syncAt + 900)
  assert.match(sync, /\(box\.width - previous\.width\) \/ 2/u)
  assert.match(sync, /\(box\.height - previous\.height\) \/ 2/u)
})

test('the knowledge library is the prototype\'s list, not the old panel view', () => {
  const at = source.indexOf('function KnowledgeLibrary(')
  assert.notEqual(at, -1, 'the library component exists')
  const library = source.slice(at, source.indexOf('function KnowledgeSection(', at))
  // `renderLibraryList()`: its bar, title, the two counted tabs, the search row with both
  // filters, one row per entry, and the policy note.
  for (const marker of [
    "className: 'kbBar'", "className: 'kbReturn'", "className: 'kbTabs'", "className: 'kbSearch'",
    "className: 'kbRows'", "className: 'kbRow'", "className: 'kbEmpty'", "className: 'policyNote'",
    "id: 'kbSearch'", "className: 'kbStatus'", "className: 'name'", "className: 'subline'",
  ]) {
    assert.equal(library.includes(marker), true, `the library builds ${marker}`)
  }
  // The two tabs are counted, and the filters come from the prototype's own list.
  assert.match(library, /t\('lexiconTab'\)\} \$\{\(lexicon\?\.entries/u)
  assert.match(library, /t\('grammarTab'\)\} \$\{\(grammar\?\.entries/u)
  assert.match(library, /t\('masteryFilter'\)/u)
  assert.match(library, /t\('scopeFilter'\)/u)
  // `kbUI.mode`: the entry opens on top of the list, and the bar walks back.
  assert.match(source, /knowledgeEntryId === null/u)
  assert.match(source, /onOpenEntry: \(id, tab\) => \{ setKnowledgeEntryId\(id\); setKnowledgeTab\(tab\) \}/u)
  assert.match(source, /t\('backToEntryList'\)/u)

  // `renderKnowledgeEntry()`'s header: the word/grammar title, the intro line, and the meta
  // row — with the mastery control only where the Host actually stores a mastery.
  const entry = source.slice(source.indexOf('function KnowledgeEntry('), source.indexOf('function KnowledgeSection('))
  for (const marker of ["className: isWord ? 'kbWord' : 'detailTitle'", "className: 'kbIntro'", "className: 'kbMeta'", 'setGrammarMastery({ entryId: entry.entryId, mastery: next })']) {
    assert.equal(entry.includes(marker), true, `the entry header builds ${marker}`)
  }
  assert.match(entry, /isWord \|\| entry === null \? null : h\('select'/u,
    'no mastery control for a word: the lexicon view has no mastery field')
})

test('the reading scroll container hands over below 500px of height', () => {
  // `shortReadingQuery` + `readingScroller()`: the offset follows the reader and the old
  // container is reset, which is what the prototype does when the layout switches.
  assert.match(source, /matchMedia\('\(max-height: 500px\)'\)/u)
  assert.match(source, /const offset = from\?\.scrollTop \?\? 0/u)
  assert.match(source, /to\.scrollTop = offset/u)
  assert.match(source, /from\.scrollTop = 0/u)
  // Both containers exist and are addressed by ref, not by querySelector.
  assert.match(source, /ref: readingPaneRef/u)
  assert.match(source, /className: 'detailScroll', ref: detailScrollRef/u)
  // The short layout is a visible state, so the CSS the prototype ships can act on it.
  assert.match(source, /shortReading \? ' shortReading' : ''/u)
})

test('the card is rebuilt from the Host\'s own section headings, in the Host\'s order', () => {
  const at = source.indexOf('function LexiconCard(')
  assert.notEqual(at, -1, 'the card renderer exists')
  const card = source.slice(at, source.indexOf('function KnowledgeEntry(', at))
  // Sections are split on the headings `renderCard()` emits, not on a guess.
  assert.match(card, /\/\^\(§\\S\+\)\\s\+\(\.\*\)\$\/u/u, 'the Host heading shape is matched')
  assert.match(card, /value\.sections \?\? \[\]/u, 'the section list comes from the Host')
  assert.match(card, /byNumber\.get\(head\[1\]\)/u, 'and a heading is only recognised if the Host listed it')
  // The prototype's structure: the index nav, one section each, and the gap line.
  for (const marker of ["className: 'entryIndex'", "className: 'entrySection'", "className: 'entryHeading'",
    "className: 'num'", "? 'missingSection' : 'entryBody'"]) {
    assert.equal(card.includes(marker), true, `the card builds ${marker}`)
  }
  // `entryJump()` scrolls a section into view and respects reduced motion.
  assert.match(card, /scrollIntoView\(\{ block: 'start', behavior: reduce \? 'auto' : 'smooth' \}\)/u)
  assert.match(card, /prefers-reduced-motion: reduce/u)
  // The card path renders through the section renderer. (`fr-cardBody` still exists for the
  // activation-failure card, which really does show one blob of error text.)
  assert.match(source, /h\(LexiconCard, \{ t, value: card\.value, extraForSection, entry \}\)/u,
    'the card uses the section renderer, with the section slot and the entry fields')
})

test('the knowledge round-trip restores where the reader was', () => {
  // `saveReadingPoint()`: the sentence, the selected node and the scroll offset are kept.
  const save = source.slice(source.indexOf('function openKnowledge()'), source.indexOf('function returnToAnalysis()'))
  assert.match(save, /returnPoint\.current = \{/u)
  assert.match(save, /scroll: scroller\?\.scrollTop \?\? 0/u)
  assert.match(save, /shortReading \? readingPaneRef\.current : detailScrollRef\.current/u,
    'the scroller is the one `readingScroller()` would name')

  // `returnToReading()`: all three come back, the scroll after the pane is visible again.
  const back = source.slice(source.indexOf('function returnToAnalysis()'), source.indexOf('function returnToAnalysis()') + 900)
  assert.match(back, /setAnchorId\(point\.anchorId\)/u)
  assert.match(back, /setSelectedNode\(point\.selectedNode\)/u)
  assert.match(back, /scroller\.scrollTop = point\.scroll/u)
  assert.match(back, /requestAnimationFrame/u, 'the offset is applied once the pane is back')

  // Both ways in and out go through them, so no path skips the restore.
  assert.match(source, /if \(knowledgeOpen\) \{ returnToAnalysis\(\); return \}\n\s*openKnowledge\(\)/u,
    'the 知识库 button enters and leaves through the point')
  assert.match(source, /onReturn: returnToAnalysis/u)
  assert.match(source, /onClick: returnToAnalysis/u)
})

test('the compact layout closes the drawer and keeps the focus reachable', () => {
  // The breakpoint measures the **panel's** box (ResizeObserver on the root), not the
  // window: the shell's sidebar is outside the panel's width arithmetic, and the
  // stylesheet mirrors this with container queries on `.fr-root`.
  assert.match(source, /new ResizeObserver\(apply\)/u)
  assert.match(source, /observer\.observe\(root\)/u)
  assert.match(source, /box\.width <= 1190 \|\| box\.width \/ Math\.max\(1, box\.height\) <= 1/u,
    'compact below 1190px of panel width or in a portrait panel')
  assert.match(source, /container-type:inline-size/, 'the stylesheet queries the container')
  assert.match(source, /@container \(max-width:1190px\), \(max-aspect-ratio:1\/1\)/u)
  // The wide layout's choice is remembered, and the drawer closes when compact.
  assert.match(source, /if \(!compact\) wideNavPreference\.current = next/u)
  assert.match(source, /wideNavPreference\.current = open/u)
  // Focus inside the navigation moves to the toggle instead of vanishing.
  const effect = source.slice(source.indexOf("if (typeof ResizeObserver === 'undefined') return undefined"))
  assert.match(effect.slice(0, 1400), /navToggleRef\.current\?\.focus\?\.\(\{ preventScroll: true \}\)/u)
  assert.match(effect.slice(0, 1400), /pane\.contains\(active\)/u)
  // Opening the drawer in compact mode hands the focus to the canvas.
  assert.match(source, /if \(next && !wasOpen && compact\)/u)
  assert.match(source, /stage\.focus\(\{ preventScroll: true \}\)/u)
  // The reading pane is inert behind the drawer.
  assert.match(source, /pane\.inert = compact && navOpen/u)
  assert.match(source, /'data-navigation': navOpen \? 'open' : 'closed'/u)
})

test('the entry field grid renders what the Host has, and says what it has not', () => {
  const at = source.indexOf('function entryMetaGrid(')
  assert.notEqual(at, -1, 'the field grid exists')
  const grid = source.slice(at, source.indexOf('function LexiconCard(', at))
  assert.match(grid, /className: 'entryMetaGrid'/u, 'the prototype\'s dl')
  for (const field of ["row('Mot'", "row('Lemme'", "t('partOfSpeechLabel')", "row('IPA'", "t('registerFrequencyLabel')"]) {
    assert.equal(grid.includes(field), true, `the grid has the ${field} row`)
  }
  // The Host records neither IPA nor register, and the prototype renders exactly these
  // placeholders when it has nothing — so the honest row is also the faithful one.
  assert.match(grid, /t\('notRecorded'\)/u)
  assert.match(grid, /t\('notRated'\)/u)
  // It sits at the top of the first section, where `renderWordDetail` puts it.
  assert.match(source, /position === 0 && entry !== null/u)
})

test('reading shows the syntax legend with an analysis; other detail branches retain it', () => {
  // Empty reading states have no syntax colors to explain. Keep the legend beside
  // an available analysis without spending reading space before generation.
  assert.match(source, /function detailReading\(\) \{\n\s*return h\('div', null, sentenceAnalysis\?\.kind === 'found' \? syntaxLegend\(\) : null, detailReadingBody\(\)\)/u)
  const content = source.slice(source.indexOf('function detailContent()'), source.indexOf('function detailReading()'))
  assert.match(content, /return h\('div', null, syntaxLegend\(\), discussionNode\(node\)\)/u, 'the discussion branch')
  assert.match(content, /syntaxLegend\(\),\n\s*h\('div', \{ className: 'sectionLabel' \}/u, 'the knowledge branch')
})

test('the passage switcher is built from the prototype\'s own vocabulary', () => {
  const at = source.indexOf('function passageSwitcher()')
  assert.notEqual(at, -1, 'the switcher exists')
  const body = source.slice(at, source.indexOf('function closeButton(', at))
  // The prototype has no passage list, so this is an extra capability — and the rule for
  // those is that it invents no look: it reuses the dialog and knowledge-list vocabulary.
  for (const marker of ["className: 'modalBackdrop'", "className: 'modal switcher'", "className: 'modalFoot'",
    "className: 'kbRows'", "className: 'kbRow'", "className: 'kbField'", "className: 'kbBar'"]) {
    assert.equal(body.includes(marker), true, `the switcher builds ${marker}`)
  }
  // It reuses the panel's handlers rather than re-implementing them.
  for (const handler of ['openPassage(item.id)', 'onSubmit: submit', 'onClick: exportBackup', 'onClick: exportSources']) {
    assert.equal(body.includes(handler), true, `the switcher uses ${handler}`)
  }
  // The brand title opens it; nothing else does.
  assert.match(source, /onClick: \(\) => \{ setSwitcherMode\('list'\); setSwitcherOpen\(true\) \}/u)
  assert.match(source, /switcherOpen \? passageSwitcher\(\) : null/u)
})

test('archiving a passage is reachable, and takes the revision the reader saw', () => {
  // The endpoint existed from the start but nothing called it: archiving was unreachable.
  const at = source.indexOf('async function archiveOne(')
  assert.notEqual(at, -1, 'the archive handler exists')
  const body = source.slice(at, at + 900)
  assert.match(body, /await archivePassage\(\{/u)
  assert.match(body, /expectedSourceRevision: item\.sourceRevision \?\? 1/u,
    'a passage that changed underneath is refused, not archived anyway')
  assert.match(body, /value\.kind === 'conflict'/u, 'and the refusal is reported')
  // Reachable from the switcher's rows, and from nowhere else.
  const switcher = source.slice(source.indexOf('function passageSwitcher()'), source.indexOf('function closeButton('))
  assert.match(switcher, /void archiveOne\(item\)/u)
  assert.match(source, /archivePassage: \(request\) => api\.archivePassage\(request\)/u, 'the face exposes it')
})
