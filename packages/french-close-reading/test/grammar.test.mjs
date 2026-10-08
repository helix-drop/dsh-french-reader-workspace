import test from 'node:test'
import assert from 'node:assert/strict'

import { createBacking, ids, openController, passageRequest, signal } from './support/harness.mjs'
import { FRENCH_READER_DOMAIN } from '../lib/domain.js'
import { buildFrenchReaderTool } from '../lib/tools.js'

const ANCHOR = 'p1.s1'
let counter = 0
const nextOperation = () => `00000000-0000-4000-8000-0000000${String(counter++).padStart(5, '0')}`

async function withTool() {
  const backing = createBacking()
  const opened = await openController(backing, FRENCH_READER_DOMAIN)
  await opened.controller.createPassage(passageRequest, signal())
  return { backing, controller: opened.controller, tool: buildFrenchReaderTool(opened.controller) }
}

function answerWith(intents, operationId = nextOperation()) {
  return {
    action: 'answer',
    passageId: ids.passage,
    anchorId: ANCHOR,
    question: 'il faut 是什么结构？',
    answer: '无人称句：il 是形式主语。',
    intents,
    operationId,
  }
}

const grammarIntent = (topic, body = 'il 为形式主语，faut 为 falloir 的第三人称单数。') => ({
  kind: 'grammar', anchorId: ANCHOR, title: topic, body,
})

test('a new grammar point is created as learning and AI-unverified', async () => {
  const { tool } = await withTool()
  const committed = await tool.execute(answerWith([grammarIntent('无人称句 il faut')]))
  assert.equal(committed.detail.applied, 1)

  const grammar = await tool.execute({ action: 'grammar' })
  assert.equal(grammar.detail.total, 1)
  const entry = grammar.detail.entries[0]
  assert.equal(entry.topic, '无人称句 il faut')
  assert.equal(entry.mastery, 'learning', 'a new entry starts as learning')
  assert.equal(entry.contentStatus, 'ai-unverified', 'knowledge state and content state stay apart')
  assert.equal(entry.askCount, 1)
  assert.equal(entry.examples, 1)
  assert.match(entry.keyPoints, /形式主语/u)
})

test('the same question retried never counts twice, a real second question does', async () => {
  const { tool } = await withTool()
  const operationId = nextOperation()
  await tool.execute(answerWith([grammarIntent('无人称句 il faut')], operationId))
  // A retry of the same question: same run, same operation id.
  await tool.execute(answerWith([grammarIntent('无人称句 il faut')], operationId))
  await tool.execute({ action: 'resume', passageId: ids.passage })

  let grammar = await tool.execute({ action: 'grammar' })
  assert.equal(grammar.detail.entries[0].askCount, 1, 'a retry is not a new question')
  assert.equal(grammar.detail.entries[0].examples, 1)

  // Asking again about the same sentence is a new question.
  await tool.execute(answerWith([grammarIntent('无人称句 il faut')]))
  grammar = await tool.execute({ action: 'grammar' })
  assert.equal(grammar.detail.entries[0].askCount, 2)
  assert.equal(grammar.detail.entries[0].examples, 2)
  assert.equal(typeof grammar.detail.entries[0].lastAskedAt, 'string')
})

test('the automatic path only touches whitelisted fields', async () => {
  const { tool } = await withTool()
  await tool.execute(answerWith([grammarIntent('无人称句 il faut')]))
  const before = (await tool.execute({ action: 'grammar' })).detail.entries[0]

  await tool.execute(answerWith([
    grammarIntent('无人称句 il faut', '这次换个说法，但规则本身没变。'),
    { ...grammarIntent('无人称句 il faut'), pitfall: '别把 il 当成实义主语。' },
  ]))

  const after = (await tool.execute({ action: 'grammar' })).detail.entries[0]
  assert.equal(after.entryId, before.entryId, 'a matching topic updates the same entry')
  assert.equal(after.keyPoints, before.keyPoints, 'the rule text is never rewritten automatically')
  assert.equal(after.level, before.level)
  assert.equal(after.module, before.module)
  assert.equal(after.mastery, before.mastery, 'mastery is not changed automatically')
  assert.equal(after.contentStatus, before.contentStatus)
  assert.equal(after.pitfalls, 1, 'a pitfall is appended (whitelisted)')
  // One real question, even with two intents about the same point: one example,
  // and the counter moves once. (Previously both intents appended an example.)
  assert.equal(after.askCount, 2, 'the new question counts once')
  assert.equal(after.examples, 2, 'and contributes exactly one example')
})

test('several grammar points in one answer are handled separately', async () => {
  const { tool } = await withTool()
  const committed = await tool.execute(answerWith([
    grammarIntent('无人称句 il faut'),
    grammarIntent('主有形容词'),
  ]))
  assert.equal(committed.detail.applied, 2)
  const grammar = await tool.execute({ action: 'grammar' })
  assert.equal(grammar.detail.total, 2)
  assert.deepEqual(grammar.detail.entries.map((entry) => entry.topic).sort(), ['主有形容词', '无人称句 il faut'])
})

test('a near match with two candidates becomes pending, never a silent merge', async () => {
  const { tool } = await withTool()
  const { controller } = await withTool()

  // Two distinct entries that a careless matcher would confuse.
  await tool.execute(answerWith([grammarIntent('关系代词 que 作宾语')]))
  await tool.execute(answerWith([grammarIntent('关系代词 que 作主语')]))

  // A topic sharing every token with both.
  const committed = await tool.execute(answerWith([grammarIntent('关系代词 que')]))
  const intent = committed.detail.intents[0]
  assert.equal(intent.status, 'applied')
  assert.match(intent.detail, /待审/u, 'the caller is told it is awaiting review')

  const grammar = await tool.execute({ action: 'grammar' })
  assert.equal(grammar.detail.total, 2, 'no third entry was created and nothing was merged')
  assert.equal(grammar.detail.pending.length, 1)
  assert.equal(grammar.detail.pending[0].topic, '关系代词 que')
  assert.equal(grammar.detail.pending[0].candidates.length, 2)
  assert.deepEqual(
    grammar.detail.pending[0].candidates.map((candidate) => candidate.topic).sort(),
    ['关系代词 que 作宾语', '关系代词 que 作主语'].sort(),
  )
  // The two existing entries kept their counters.
  for (const entry of grammar.detail.entries) assert.equal(entry.askCount, 1)
  assert.equal(controller !== undefined, true)
})

test('one failing intent does not block its siblings, and the answer survives', async () => {
  const { tool } = await withTool()
  const committed = await tool.execute(answerWith([
    { kind: 'grammar', anchorId: 'p9.s9', title: '错锚点', body: '无法定位。' },
    grammarIntent('无人称句 il faut'),
  ]))

  assert.deepEqual(committed.detail.intents.map((intent) => intent.status), ['failed', 'applied'])
  const runs = await tool.execute({ action: 'runs', passageId: ids.passage })
  assert.equal(runs.detail.runs[0].answer, '无人称句：il 是形式主语。')
  const grammar = await tool.execute({ action: 'grammar' })
  assert.equal(grammar.detail.total, 1, 'the healthy intent landed')
})

/** Two confusable entries plus one ambiguous topic, so a pending candidate exists. */
async function withPending() {
  const context = await withTool()
  await context.tool.execute(answerWith([grammarIntent('关系代词 que 作宾语')]))
  await context.tool.execute(answerWith([grammarIntent('关系代词 que 作主语')]))
  await context.tool.execute(answerWith([grammarIntent('关系代词 que', '这一处 que 在从句里充当宾语。')]))
  const grammar = await context.tool.execute({ action: 'grammar' })
  assert.equal(grammar.detail.pending.length, 1)
  return { ...context, pending: grammar.detail.pending[0], entries: grammar.detail.entries }
}

test('a pending candidate can be attached to the entry the reader chooses', async () => {
  const { tool, pending, entries } = await withPending()
  const target = entries.find((entry) => entry.topic === '关系代词 que 作宾语')
  const other = entries.find((entry) => entry.topic === '关系代词 que 作主语')

  const attached = await tool.execute({
    action: 'resolve', pendingId: pending.pendingId, decision: 'attach', entryId: target.entryId,
  })
  assert.equal(attached.detail.resolved, true)
  assert.equal(attached.detail.outcome, 'example-attached')

  const grammar = await tool.execute({ action: 'grammar' })
  const after = grammar.detail.entries.find((entry) => entry.entryId === target.entryId)
  const untouched = grammar.detail.entries.find((entry) => entry.entryId === other.entryId)
  assert.equal(after.askCount, 2, 'the chosen entry gains the question')
  assert.equal(after.examples, 2)
  assert.equal(after.keyPoints, 'il 为形式主语，faut 为 falloir 的第三人称单数。', 'attaching does not rewrite the rule')
  assert.equal(untouched.askCount, 1, 'the other candidate is untouched')
  assert.equal(grammar.detail.pending[0].resolution, 'attached')
  assert.equal(grammar.detail.pending[0].resolvedEntryId, target.entryId)

  const retry = await tool.execute({
    action: 'resolve', pendingId: pending.pendingId, decision: 'attach', entryId: target.entryId,
  })
  assert.equal(retry.detail.alreadyResolved, true)
  const stable = await tool.execute({ action: 'grammar' })
  assert.equal(stable.detail.entries.find((entry) => entry.entryId === target.entryId).askCount, 2,
    'a retried decision never counts twice')
})

test('revising a rule is an explicit act that renames the wording', async () => {
  const { tool, pending, entries } = await withPending()
  const target = entries.find((entry) => entry.topic === '关系代词 que 作宾语')

  const revised = await tool.execute({
    action: 'resolve', pendingId: pending.pendingId, decision: 'attach', entryId: target.entryId,
    keyPoints: 'que 作关系代词时，在从句中充当宾语；判据是去掉它从句缺成分。',
  })
  assert.equal(revised.detail.outcome, 'rule-revised')

  const grammar = await tool.execute({ action: 'grammar' })
  const after = grammar.detail.entries.find((entry) => entry.entryId === target.entryId)
  assert.match(after.keyPoints, /去掉它从句缺成分/u, 'the named wording replaced the rule')
  assert.equal(after.contentStatus, 'mixed', 'AI content plus a human revision is recorded as mixed')
  assert.equal(after.mastery, 'learning')
  assert.equal(after.level, null)
  assert.equal(after.module, null)
})

test('a pending candidate can become its own entry, or be discarded', async () => {
  const created = await withPending()
  const asNew = await created.tool.execute({
    action: 'resolve', pendingId: created.pending.pendingId, decision: 'create',
  })
  assert.equal(asNew.detail.outcome, 'created')
  let grammar = await created.tool.execute({ action: 'grammar' })
  assert.equal(grammar.detail.total, 3)
  const entry = grammar.detail.entries.find((candidate) => candidate.topic === '关系代词 que')
  assert.equal(entry.askCount, 0, 'the rule was made explicitly, not counted as a question')
  assert.equal(entry.mastery, 'learning')
  assert.equal(grammar.detail.pending[0].resolution, 'created')

  const discarded = await withPending()
  const dropped = await discarded.tool.execute({
    action: 'resolve', pendingId: discarded.pending.pendingId, decision: 'discard',
  })
  assert.equal(dropped.detail.outcome, 'discarded')
  grammar = await discarded.tool.execute({ action: 'grammar' })
  assert.equal(grammar.detail.total, 2, 'discarding creates nothing')
  assert.equal(grammar.detail.pending[0].resolution, 'discarded')
  assert.equal(grammar.detail.pending[0].resolvedEntryId, null)
})

test('an unknown pending or entry is refused and changes nothing', async () => {
  const { tool, pending } = await withPending()
  const unknownPending = await tool.execute({
    action: 'resolve', pendingId: '00000000-0000-4000-8000-0000000000ff', decision: 'discard',
  })
  assert.equal(unknownPending.ok, false)
  assert.equal(unknownPending.detail.reason, 'pending-unknown')

  const unknownEntry = await tool.execute({
    action: 'resolve', pendingId: pending.pendingId, decision: 'attach',
    entryId: '00000000-0000-4000-8000-0000000000fe',
  })
  assert.equal(unknownEntry.ok, false)
  assert.equal(unknownEntry.detail.reason, 'entry-unknown')

  const grammar = await tool.execute({ action: 'grammar' })
  assert.equal(grammar.detail.pending[0].resolution, null, 'the candidate is still awaiting a decision')
  assert.equal(grammar.detail.total, 2)
})

test('the automatic path never resolves a candidate on its own', async () => {
  const { tool, pending, entries } = await withPending()
  const target = entries.find((entry) => entry.topic === '关系代词 que 作宾语')

  // A later, unambiguous question about the same topic updates that entry...
  await tool.execute(answerWith([grammarIntent('关系代词 que 作宾语')]))
  const grammar = await tool.execute({ action: 'grammar' })
  assert.equal(grammar.detail.pending[0].resolution, null, 'the ambiguity still needs a human decision')
  assert.equal(grammar.detail.entries.find((entry) => entry.entryId === target.entryId).askCount, 2)
  assert.equal(pending.pendingId, grammar.detail.pending[0].pendingId)
})

test('the panel decision endpoint closes a candidate, and never double-counts', async () => {
  const { tool, controller, pending, entries } = await withPending()
  const target = entries.find((entry) => entry.topic === '关系代词 que 作宾语')

  const attached = await controller.resolveGrammarCandidateRemote({
    pendingId: pending.pendingId,
    decision: 'attach',
    entryId: target.entryId,
    keyPoints: null,
    operationId: '00000000-0000-4000-8000-0000000000d1',
  }, signal())
  assert.equal(attached.kind, 'attached')
  assert.equal(attached.entryId, target.entryId)

  const grammar = await tool.execute({ action: 'grammar' })
  const after = grammar.detail.entries.find((entry) => entry.entryId === target.entryId)
  assert.equal(after.askCount, 2, 'the chosen entry gained the question')
  assert.equal(after.contentStatus, 'ai-unverified', 'no wording means no rule change')
  assert.equal(grammar.detail.pending[0].resolution, 'attached')

  // A retried decision is idempotent, not a second merge.
  const retry = await controller.resolveGrammarCandidateRemote({
    pendingId: pending.pendingId,
    decision: 'attach',
    entryId: target.entryId,
    keyPoints: null,
    operationId: '00000000-0000-4000-8000-0000000000d2',
  }, signal())
  assert.equal(retry.kind, 'already-resolved')
  const stable = await tool.execute({ action: 'grammar' })
  assert.equal(stable.detail.entries.find((entry) => entry.entryId === target.entryId).askCount, 2)
})

test('the panel decision endpoint reports conflicts and refuses bad requests', async () => {
  const { controller, pending } = await withPending()

  const unknownEntry = await controller.resolveGrammarCandidateRemote({
    pendingId: pending.pendingId,
    decision: 'attach',
    entryId: '00000000-0000-4000-8000-0000000000fe',
    keyPoints: null,
    operationId: '00000000-0000-4000-8000-0000000000d3',
  }, signal())
  assert.equal(unknownEntry.kind, 'conflict')
  assert.equal(unknownEntry.reason, 'entry-unknown')

  await assert.rejects(
    controller.resolveGrammarCandidateRemote({
      pendingId: pending.pendingId,
      decision: 'merge',
      entryId: null,
      keyPoints: null,
      operationId: '00000000-0000-4000-8000-0000000000d4',
    }, signal()),
    (error) => error.code === 'gateway/bad-request',
  )

  // A discard from the panel closes it without touching any entry.
  const discarded = await controller.resolveGrammarCandidateRemote({
    pendingId: pending.pendingId,
    decision: 'discard',
    entryId: null,
    keyPoints: null,
    operationId: '00000000-0000-4000-8000-0000000000d5',
  }, signal())
  assert.equal(discarded.kind, 'discarded')
})
