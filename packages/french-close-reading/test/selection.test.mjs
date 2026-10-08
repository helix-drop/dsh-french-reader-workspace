import test from 'node:test'
import assert from 'node:assert/strict'

import { createBacking, ids, openController, passageRequest, signal } from './support/harness.mjs'
import { FRENCH_READER_DOMAIN, selectionKey } from '../lib/domain.js'
import { buildFrenchReaderTool } from '../lib/tools.js'

async function withTool() {
  const backing = createBacking()
  const opened = await openController(backing, FRENCH_READER_DOMAIN)
  await opened.controller.createPassage(passageRequest, signal())
  return { backing, controller: opened.controller, tool: buildFrenchReaderTool(opened.controller) }
}

/** `ne … point` inside the harness passage: two ranges, one anchor. */
const NEGATION_RANGES = [{ start: 24, end: 26 }, { start: 60, end: 65 }]

test('a discontinuous selection becomes one anchor with a gap marker', async () => {
  const { tool } = await withTool()
  const selected = await tool.execute({
    action: 'select', passageId: ids.passage, ranges: NEGATION_RANGES, note: '否定结构',
  })

  assert.equal(selected.detail.created, true)
  assert.match(selected.detail.anchorId, /^sel_[0-9a-f]{16}$/u)
  assert.equal(selected.detail.ranges.length, 2)
  assert.match(selected.detail.excerpt, / … /u, 'a discontinuous selection is joined with a gap marker')

  const source = passageRequest.sourceText
  assert.equal(
    selected.detail.excerpt,
    `${source.slice(24, 26)} … ${source.slice(60, 65)}`,
  )
})

test('selecting the same words again reuses the anchor instead of duplicating it', async () => {
  const { tool, backing } = await withTool()
  const first = await tool.execute({ action: 'select', passageId: ids.passage, ranges: NEGATION_RANGES })
  const second = await tool.execute({
    action: 'select', passageId: ids.passage, ranges: [...NEGATION_RANGES], note: '换个说明',
  })
  assert.equal(second.detail.alreadyExisted, true)
  assert.equal(second.detail.anchorId, first.detail.anchorId)
  const keys = [...backing.tables.get('records').keys()].filter((key) => key.startsWith('selection_'))
  assert.equal(keys.length, 1, 'one stored selection')

  // A different selection is a different anchor.
  const other = await tool.execute({ action: 'select', passageId: ids.passage, ranges: [{ start: 0, end: 8 }] })
  assert.notEqual(other.detail.anchorId, first.detail.anchorId)
})

test('a phrase anchor carries a branch and a translation', async () => {
  const { tool } = await withTool()
  const selected = await tool.execute({ action: 'select', passageId: ids.passage, ranges: NEGATION_RANGES })
  const anchorId = selected.detail.anchorId

  const branch = await tool.execute({
    action: 'branch', passageId: ids.passage, anchorId, kind: 'grammar',
    title: 'ne … point 的不连续否定', body: 'ne 与 point 分列动词两侧，是一个否定结构的两半。',
  })
  assert.equal(branch.ok, true)
  const translated = await tool.execute({
    action: 'translate', passageId: ids.passage, anchorId, text: '不……（否定结构）',
  })
  assert.equal(translated.ok, true)

  const analysis = await tool.execute({ action: 'analysis', passageId: ids.passage })
  const stored = analysis.detail.branches.find((entry) => entry.anchorId === anchorId)
  assert.equal(stored.anchorStatus, 'resolved')
  assert.equal(stored.anchor.anchorId, anchorId)
  assert.equal(stored.anchor.excerpt, selected.detail.excerpt, 'the anchor records the selected text')
  assert.equal(stored.anchor.start, NEGATION_RANGES[0].start, 'the span covers the whole selection')
  assert.equal(stored.anchor.end, NEGATION_RANGES[1].end)
})

test('out-of-bounds, inverted, and empty selections are refused', async () => {
  const { tool, backing } = await withTool()
  const before = backing.writes.length

  for (const [ranges, reason] of [
    [[{ start: 0, end: 9999 }], 'range-out-of-bounds'],
    [[{ start: 30, end: 30 }], 'range-out-of-bounds'],
    [[{ start: 40, end: 10 }], 'range-out-of-bounds'],
    [[{ start: 0, end: 1.5 }], 'range-not-integer'],
  ]) {
    const refused = await tool.execute({ action: 'select', passageId: ids.passage, ranges })
    assert.equal(refused.ok, false, `${JSON.stringify(ranges)} must be refused`)
    assert.equal(refused.detail.reason, reason)
  }
  // No ranges at all is a caller error, reported as such rather than stored.
  const empty = await tool.execute({ action: 'select', passageId: ids.passage, ranges: [] })
  assert.equal(empty.ok, false)
  assert.match(empty.detail.error, /ranges is required/u)
  assert.equal(backing.writes.length, before, 'nothing was stored for a refused selection')
})

test('an unknown selection token is not a valid anchor', async () => {
  const { tool } = await withTool()
  const refused = await tool.execute({
    action: 'branch', passageId: ids.passage, anchorId: 'sel_0123456789abcdef',
    kind: 'note', title: '悬空', body: '并不存在这个选区。',
  })
  assert.equal(refused.ok, false)
  assert.equal(refused.detail.reason, 'anchor-unknown')
})

test('a selection from another revision does not silently anchor new notes', async () => {
  const { backing, controller, tool } = await withTool()
  const selected = await tool.execute({ action: 'select', passageId: ids.passage, ranges: NEGATION_RANGES })

  await controller.reviseSource({
    passageId: ids.passage,
    operationId: '00000000-0000-4000-8000-0000000000f1',
    expectedSourceRevision: 1,
    sourceText: `Préambule. ${passageRequest.sourceText}`,
    note: '前置一段',
  }, signal())

  const refused = await tool.execute({
    action: 'branch', passageId: ids.passage, anchorId: selected.detail.anchorId,
    kind: 'note', title: '旧选区', body: '这一锚点属于第 1 版。',
  })
  assert.equal(refused.ok, false)
  assert.equal(refused.detail.reason, 'anchor-unknown', 'an old selection is not reused for new notes')

  // The record itself is still there: nothing was deleted, it simply does not
  // apply to the current revision.
  assert.equal(backing.tables.get('records').has(selectionKey(selected.detail.anchorId.slice(4))), true)
})

test('the Remote selection endpoint returns the same anchor as the tool', async () => {
  const backing = createBacking()
  const opened = await openController(backing, FRENCH_READER_DOMAIN)
  await opened.controller.createPassage(passageRequest, signal())

  const created = await opened.controller.createSelectionRemote({
    passageId: ids.passage,
    operationId: '00000000-0000-4000-8000-0000000000c1',
    ranges: NEGATION_RANGES,
    note: 'panel selection',
  }, signal())
  assert.equal(created.kind, 'created')
  assert.match(created.anchorId, /^sel_[0-9a-f]{16}$/u)
  assert.match(created.excerpt, / … /u)

  const again = await opened.controller.createSelectionRemote({
    passageId: ids.passage,
    operationId: '00000000-0000-4000-8000-0000000000c2',
    ranges: NEGATION_RANGES,
    note: 'again',
  }, signal())
  assert.equal(again.kind, 'already-existed')
  assert.equal(again.anchorId, created.anchorId)

  const outOfBounds = await opened.controller.createSelectionRemote({
    passageId: ids.passage,
    operationId: '00000000-0000-4000-8000-0000000000c3',
    ranges: [{ start: 0, end: 9999 }],
    note: '',
  }, signal())
  assert.equal(outOfBounds.kind, 'conflict')
  assert.equal(outOfBounds.reason, 'range-out-of-bounds')

  await assert.rejects(
    opened.controller.createSelectionRemote({
      passageId: ids.passage,
      operationId: '00000000-0000-4000-8000-0000000000c4',
      ranges: [],
      note: '',
    }, signal()),
    (error) => error.code === 'gateway/bad-request',
  )
})
