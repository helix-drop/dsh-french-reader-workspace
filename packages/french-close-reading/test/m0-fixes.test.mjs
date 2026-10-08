import test from 'node:test'
import assert from 'node:assert/strict'

import { createBacking, ids, openController, passageRequest, signal } from './support/harness.mjs'
import { FRENCH_READER_DOMAIN, selectionKey } from '../lib/domain.js'
import { buildFrenchReaderTool } from '../lib/tools.js'

const uuid = () => globalThis.crypto.randomUUID()

/** Two passages whose first characters are identical, then one that differs. */
const SECOND = {
  id: '00000000-0000-4000-8000-0000000000a2',
  operationId: '00000000-0000-4000-8000-0000000000b2',
  title: 'Deuxième passage',
  sourceText: 'Il faut cultiver notre jardin. Mais pas le même.',
}

async function withTwoPassages() {
  const backing = createBacking()
  const opened = await openController(backing, FRENCH_READER_DOMAIN)
  await opened.controller.createPassage(passageRequest, signal())
  await opened.controller.createPassage(SECOND, signal())
  return { backing, ...opened, tool: buildFrenchReaderTool(opened.controller) }
}

test('the same range in two passages is two anchors, never one shared record', async () => {
  const { backing, controller } = await withTwoPassages()

  const first = await controller.createSelection({
    passageId: ids.passage, operationId: uuid(), ranges: [{ start: 0, end: 7 }], note: '',
  }, signal())
  const second = await controller.createSelection({
    passageId: SECOND.id, operationId: uuid(), ranges: [{ start: 0, end: 7 }], note: '',
  }, signal())

  assert.equal(first.created, true)
  assert.equal(second.created, true, 'the second passage stores its own selection')
  assert.notEqual(first.anchorId, second.anchorId)
  assert.equal(first.excerpt, passageRequest.sourceText.slice(0, 7))
  assert.equal(second.excerpt, SECOND.sourceText.slice(0, 7))

  const keys = [...backing.tables.get('records').keys()].filter((key) => key.startsWith('selection_'))
  assert.equal(keys.length, 2, 'two selections, two records')

  // And the second passage's anchor actually works for its own passage.
  const branch = await controller.addBranch({
    passageId: SECOND.id, operationId: uuid(), parentId: null,
    anchorId: second.anchorId, kind: 'note', title: '第二篇的笔记', body: '',
  }, signal())
  assert.equal(branch.kind, 'created', 'the anchor belongs to the passage that made it')
})

test('re-selecting the same words in one passage still reuses its anchor', async () => {
  const { backing, controller } = await withTwoPassages()
  const ranges = [{ start: 4, end: 9 }]

  const first = await controller.createSelection({ passageId: ids.passage, operationId: uuid(), ranges, note: '' }, signal())
  const again = await controller.createSelection({ passageId: ids.passage, operationId: uuid(), ranges, note: '改个说明' }, signal())

  assert.equal(again.alreadyExisted, true)
  assert.equal(again.anchorId, first.anchorId)
  const keys = [...backing.tables.get('records').keys()].filter((key) => key.startsWith('selection_'))
  assert.equal(keys.length, 1, 'still one record per passage and range')
})

test('one question with two intents about the same point counts once', async () => {
  const { tool } = await withTwoPassages()
  const intent = (topic) => ({ kind: 'grammar', anchorId: 'p1.s1', title: topic, body: '规则正文。' })

  const committed = await tool.execute({
    action: 'answer', passageId: ids.passage, anchorId: 'p1.s1',
    question: 'il faut 是什么结构？', answer: '无人称句。',
    // The same grammar point reached through two different wordings: one real
    // question, so exactly one count.
    intents: [intent('无人称句 il faut'), { ...intent('无人称句 il faut'), pitfall: 'il 不是实义主语。' }],
  })
  assert.equal(committed.detail.applied, 2)

  const grammar = await tool.execute({ action: 'grammar' })
  assert.equal(grammar.detail.total, 1, 'the two intents share one entry')
  assert.equal(grammar.detail.entries[0].askCount, 1, 'one question is one count')
  assert.equal(grammar.detail.entries[0].examples, 1, 'and one example')
  assert.equal(grammar.detail.entries[0].pitfalls, 1)
})

test('a new question about the same point counts again', async () => {
  const { tool } = await withTwoPassages()
  const ask = (operationId) => tool.execute({
    action: 'answer', passageId: ids.passage, anchorId: 'p1.s1',
    question: 'il faut 是什么结构？', answer: '无人称句。',
    intents: [{ kind: 'grammar', anchorId: 'p1.s1', title: '无人称句 il faut', body: '规则正文。' }],
    operationId,
  })

  await ask('00000000-0000-4000-8000-0000000000e1')
  await ask('00000000-0000-4000-8000-0000000000e2')
  const grammar = await tool.execute({ action: 'grammar' })
  assert.equal(grammar.detail.entries[0].askCount, 2, 'two real questions, two counts')
  assert.equal(grammar.detail.entries[0].examples, 2)
})

test('a grammar example quotes the anchored sentence, not the head of the passage', async () => {
  const { tool } = await withTwoPassages()
  await tool.execute({
    action: 'answer', passageId: ids.passage, anchorId: 'p2.s1',
    question: '这一句是什么结构？', answer: '对话句。',
    intents: [{ kind: 'grammar', anchorId: 'p2.s1', title: '对话破折号', body: '破折号引出对话。' }],
  })

  const analysis = await tool.execute({ action: 'analysis', passageId: ids.passage })
  assert.equal(analysis.ok, true)
  const stored = await tool.execute({ action: 'read', passageId: ids.passage })
  const sentence = stored.detail.paragraphs
    .flatMap((paragraph) => paragraph.sentences ?? [])
    .find((entry) => entry.anchorId === 'p2.s1')
  assert.ok(sentence !== undefined, 'the second paragraph has a first sentence')

  const grammar = await tool.execute({ action: 'grammar' })
  assert.equal(grammar.detail.entries.length, 1)
  const example = grammar.detail.entries[0].exampleList[0]
  assert.equal(example.text, sentence.text, 'the example carries the sentence it came from')
  assert.equal(example.question, '这一句是什么结构？', 'the real question travels with the example')
  assert.equal(example.anchorId, 'p2.s1')
  assert.notEqual(example.text, passageRequest.sourceText.slice(0, 500))
})

test('closing a candidate with create keeps the topic indexed, so the next question matches', async () => {
  const { tool } = await withTwoPassages()
  const intent = (topic) => ({ kind: 'grammar', anchorId: 'p1.s1', title: topic, body: '规则正文。' })

  await tool.execute({ action: 'answer', passageId: ids.passage, anchorId: 'p1.s1', question: 'q1', answer: 'a1', intents: [intent('关系代词 que 作宾语')] })
  await tool.execute({ action: 'answer', passageId: ids.passage, anchorId: 'p1.s1', question: 'q2', answer: 'a2', intents: [intent('关系代词 que 作主语')] })
  await tool.execute({ action: 'answer', passageId: ids.passage, anchorId: 'p1.s1', question: 'q3', answer: 'a3', intents: [intent('关系代词 que')] })

  let grammar = await tool.execute({ action: 'grammar' })
  assert.equal(grammar.detail.pending.length, 1)
  const pendingId = grammar.detail.pending[0].pendingId

  const created = await tool.execute({ action: 'resolve', pendingId, decision: 'create' })
  assert.equal(created.detail.outcome, 'created')
  const entryId = created.detail.entryId
  assert.ok(typeof entryId === 'string' && entryId !== '')

  // The point of this test: the new topic must be indexed. A stale store written
  // after the entry would drop it, and the next question would park a second
  // candidate instead of matching the entry the reader just made.
  await tool.execute({ action: 'answer', passageId: ids.passage, anchorId: 'p1.s1', question: 'q4', answer: 'a4', intents: [intent('关系代词 que')] })

  grammar = await tool.execute({ action: 'grammar' })
  const entry = grammar.detail.entries.find((item) => item.entryId === entryId)
  assert.ok(entry !== undefined, 'the created entry is still there')
  assert.equal(entry.askCount, 1, 'the follow-up question matched the created entry')
  assert.equal(entry.examples, 1)
  assert.equal(
    grammar.detail.pending.filter((item) => item.resolution === null).length,
    0,
    'no second open candidate for a topic that is now indexed',
  )
  assert.equal(grammar.detail.total, 3)
})

test('a retried decision is not counted twice even with a fresh operation id', async () => {
  const { tool } = await withTwoPassages()
  const intent = (topic) => ({ kind: 'grammar', anchorId: 'p1.s1', title: topic, body: '规则正文。' })

  await tool.execute({ action: 'answer', passageId: ids.passage, anchorId: 'p1.s1', question: 'q1', answer: 'a1', intents: [intent('关系代词 que 作宾语')] })
  await tool.execute({ action: 'answer', passageId: ids.passage, anchorId: 'p1.s1', question: 'q2', answer: 'a2', intents: [intent('关系代词 que 作主语')] })
  await tool.execute({ action: 'answer', passageId: ids.passage, anchorId: 'p1.s1', question: 'q3', answer: 'a3', intents: [intent('关系代词 que')] })

  let grammar = await tool.execute({ action: 'grammar' })
  const pendingId = grammar.detail.pending[0].pendingId
  const target = grammar.detail.entries.find((entry) => entry.topic === '关系代词 que 作宾语')
  const before = target.askCount

  const first = await tool.execute({ action: 'resolve', pendingId, decision: 'attach', entryId: target.entryId })
  assert.equal(first.detail.outcome, 'example-attached')

  // A second, differently-keyed attempt at the same decision must not re-count.
  const replay = await tool.execute({
    action: 'resolve', pendingId, decision: 'attach', entryId: target.entryId,
    operationId: '00000000-0000-4000-8000-0000000000e9',
  })
  assert.equal(replay.detail.alreadyResolved, true, 'the candidate records its own resolution')

  grammar = await tool.execute({ action: 'grammar' })
  const after = grammar.detail.entries.find((entry) => entry.entryId === target.entryId)
  assert.equal(after.askCount, before + 1)
})

test('a decided candidate keeps the question it came from', async () => {
  const { tool } = await withTwoPassages()
  const intent = (topic) => ({ kind: 'grammar', anchorId: 'p1.s1', title: topic, body: '规则正文。' })
  await tool.execute({ action: 'answer', passageId: ids.passage, anchorId: 'p1.s1', question: 'q1', answer: 'a1', intents: [intent('关系代词 que 作宾语')] })
  await tool.execute({ action: 'answer', passageId: ids.passage, anchorId: 'p1.s1', question: 'q2', answer: 'a2', intents: [intent('关系代词 que 作主语')] })
  await tool.execute({
    action: 'answer', passageId: ids.passage, anchorId: 'p1.s1',
    question: '这里的 que 是什么成分？', answer: 'a3', intents: [intent('关系代词 que')],
  })

  const grammar = await tool.execute({ action: 'grammar' })
  assert.equal(grammar.detail.pending[0].question, '这里的 que 是什么成分？', 'the candidate records the real question')
})

test('the derived selection key stays path-safe and unique per passage', async () => {
  const { backing, controller } = await withTwoPassages()
  await controller.createSelection({ passageId: ids.passage, operationId: uuid(), ranges: [{ start: 1, end: 5 }], note: '' }, signal())
  await controller.createSelection({ passageId: SECOND.id, operationId: uuid(), ranges: [{ start: 1, end: 5 }], note: '' }, signal())
  for (const key of backing.tables.get('records').keys()) {
    if (key.startsWith('selection_')) assert.match(key, /^[a-zA-Z0-9_-]+$/u)
  }
  const stored = [...backing.tables.get('records').entries()].filter(([key]) => key.startsWith('selection_'))
  assert.equal(stored.length, 2)
  assert.equal(
    new Set(stored.map(([, record]) => record.payload.passageId)).size,
    2,
    'the two records name different passages',
  )
  assert.equal(selectionKey(stored[0][0].slice('selection_'.length)), stored[0][0])
})
