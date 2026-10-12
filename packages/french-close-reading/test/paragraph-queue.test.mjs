import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { segmentSource } from '../lib/segmentation.js'
let registration
vm.runInNewContext(readFileSync(new URL('../client.js', import.meta.url), 'utf8'), {
  window: { __ModuleLoader__: { load(value) { registration = value } } }, AbortController,
})
const { createParagraphQueue, numberedBlocks, normalizeParagraphInput, cleanParagraphStarts } = registration.factory(() => ({
  createElement() {}, Component: class {},
})).__test__
const tick = () => new Promise((resolve) => setImmediate(resolve))
const paragraphs = Array.from({ length: 6 }, (_, index) => ({ id: `p${index + 1}` }))

test('queue caps concurrent paragraphs at two and advances automatically', async () => {
  let active = 0, maximum = 0
  const calls = [], release = []
  const queue = createParagraphQueue(paragraphs, async (paragraph) => {
    calls.push(paragraph.id); maximum = Math.max(maximum, ++active)
    await new Promise((resolve) => release.push(resolve)); active -= 1
  })
  queue.start('p1'); queue.start('p1'); queue.prioritize('p2')
  await tick()
  assert.deepEqual(calls, ['p1', 'p2'])
  while (queue.snapshot().done < 6) { release.splice(0).forEach((resolve) => resolve()); await tick() }
  assert.equal(maximum, 2)
  assert.equal(new Set(calls).size, 6)
  assert.equal(queue.snapshot().failed, 0)
})

test('jump prioritizes the selected paragraph then its neighbours without restarting in-flight work', async () => {
  const calls = [], releases = new Map()
  const queue = createParagraphQueue(paragraphs, (paragraph) => {
    calls.push(paragraph.id)
    return new Promise((resolve) => releases.set(paragraph.id, resolve))
  })
  queue.start('p1'); await tick(); queue.prioritize('p5'); queue.prioritize('p2')
  assert.deepEqual(calls, ['p1', 'p2'])
  queue.prioritize('p5'); releases.get('p1')(); await tick()
  assert.deepEqual(calls, ['p1', 'p2', 'p5'])
  releases.get('p2')(); await tick()
  assert.deepEqual(calls, ['p1', 'p2', 'p5', 'p6'])
  queue.stop(); releases.forEach((resolve) => resolve()); await tick()
})

test('stop aborts running work, retains capacity until settlement and never starts queued tasks', async () => {
  const signals = [], release = []
  const queue = createParagraphQueue(paragraphs, (_, signal) => {
    signals.push(signal); return new Promise((resolve) => release.push(resolve))
  })
  queue.start('p1'); await tick(); queue.stop(); queue.start('p3')
  assert.equal(queue.snapshot().active, 2)
  assert.ok(signals.every((signal) => signal.aborted))
  release.forEach((resolve) => resolve()); await tick()
  assert.equal(signals.length, 2)
  assert.equal(queue.snapshot().active, 0)
  assert.equal(queue.snapshot().tasks[2].state, 'cancelled')
})

test('failure is reported and does not block subsequent paragraphs; single-flight cap is respected', async () => {
  const calls = []
  const queue = createParagraphQueue(paragraphs, async (paragraph) => {
    calls.push(paragraph.id)
    if (paragraph.id === 'p2') throw new Error('provider failed')
  }, () => {}, 1)
  queue.start('p1'); await tick()
  assert.equal(queue.snapshot().done, 5)
  assert.equal(queue.snapshot().failed, 1)
  assert.equal(queue.snapshot().tasks[1].error, 'provider failed')
  assert.deepEqual(calls, paragraphs.map((paragraph) => paragraph.id))
})

test('numbering validates both ends of the range, and input normalization preserves paragraph content', () => {
  const input = '  Un.\r\nUne ligne.\r\n \t\r\nDeux.\r\n\r\n\r\nTrois.  '
  const source = normalizeParagraphInput(input)
  const blocks = segmentSource(source)
  assert.deepEqual(blocks.map((block) => block.text), ['Un.\nUne ligne.', 'Deux.', 'Trois.'])
  assert.deepEqual(Array.from(numberedBlocks(blocks, 12), (block) => block.number), [12, 13, 14])
  for (const block of blocks) assert.equal(source.slice(block.start, block.end), block.text)
  for (const first of [0, -1, 1.2, NaN, Infinity, Number.MAX_SAFE_INTEGER]) assert.throws(() => numberedBlocks(blocks, first))
  assert.deepEqual(Object.entries(cleanParagraphStarts(null)), [])
  assert.deepEqual(Object.entries(cleanParagraphStarts({ p: 12, bad: 0 })), [['p', 12]])
})

test('maximum safe integer permits one paragraph but rejects two without rounded intermediate arithmetic', () => {
  assert.equal(numberedBlocks([{}], Number.MAX_SAFE_INTEGER)[0].number, Number.MAX_SAFE_INTEGER)
  assert.throws(() => numberedBlocks([{}, {}], Number.MAX_SAFE_INTEGER))
  assert.equal(numberedBlocks([{}, {}], Number.MAX_SAFE_INTEGER - 1)[1].number, Number.MAX_SAFE_INTEGER)
  assert.throws(() => numberedBlocks([], 0))
})

test('streaming grammar blocks never appear even when the delimiter is split at every possible boundary', () => {
  const { visibleStreamText, wordOccurs } = registration.factory(() => ({ createElement() {}, Component: class {} })).__test__
  const marker = '<<<GRAMMAR'
  for (let size = 1; size <= marker.length; size++) assert.equal(visibleStreamText(`正文\n${marker.slice(0, size)}`).trim(), '正文')
  assert.equal(visibleStreamText('正文\n<<<GRAMMAR\n{"points":[] }'), '正文')
  assert.equal(visibleStreamText('普通正文'), '普通正文')
  assert.equal(wordOccurs('Elle fait attention.', 'attention'), true)
  assert.equal(wordOccurs('Elle fait attention.', 'ouvrait'), false)
  assert.equal(wordOccurs('Attentionnée.', 'attention'), false)
  assert.equal(wordOccurs("L’attention est utile.", 'attention'), true)
})

test('thinking preference is scoped to the exact model and rejects stale unsupported choices', () => {
  const { analysisEffortChoice } = registration.factory(() => ({ createElement() {}, Component: class {} })).__test__
  const saved = { 'p/a': 'high', 'p/b': 'none', 'p/c': 'max' }
  assert.equal(analysisEffortChoice('p/a', ['none', 'high'], saved), 'high')
  assert.equal(analysisEffortChoice('p/b', ['none', 'high'], saved), 'none')
  assert.equal(analysisEffortChoice('p/c', ['none', 'high'], saved), null)
  assert.equal(analysisEffortChoice('p/d', ['none', 'high'], saved), null)
  assert.equal(analysisEffortChoice('p/a', [], saved), null)
})

test('cache reuses equivalent recommended and explicit high settings without accepting another mode or source', () => {
  const { analysisCacheMatches } = registration.factory(() => ({ createElement() {}, Component: class {} })).__test__
  const model = 'deepseek-official/deepseek-flash'
  const identity = JSON.stringify(['dsh', model, null, 'source-a'])
  assert.equal(analysisCacheMatches(identity, 'dsh', model, 'high', 'source-a', ['high', 'none']), true)
  assert.equal(analysisCacheMatches(identity, 'dsh', model, 'none', 'source-a', ['high', 'none']), false)
  assert.equal(analysisCacheMatches(identity, 'dsh', model, 'high', 'source-b', ['high', 'none']), false)
  assert.equal(analysisCacheMatches(identity, 'dsh', model, 'high', 'source-a', []), false)
  assert.equal(analysisCacheMatches(JSON.stringify(['dsh', 'p/other', null, 'source-a']), 'dsh', 'p/other', 'high', 'source-a', ['high']), false)
})
