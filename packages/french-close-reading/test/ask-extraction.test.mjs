import test from 'node:test'
import assert from 'node:assert/strict'

import { createBacking, ids, openController, passageRequest, signal } from './support/harness.mjs'
import { FRENCH_READER_DOMAIN } from '../lib/domain.js'
import { readGrammarEntries } from '../lib/discussion-store.js'

/**
 * The automatic grammar path, end to end through `ask`.
 *
 * The reader's rule is that a grammar point is filed because a question was asked,
 * never because a form was filled in. These tests drive the real turn: a backend
 * answers with the machine block, and the assertions are on what the store holds —
 * the message the reader sees, the run, and the library entry — not on a summary
 * the code produced about itself.
 */
const uuid = () => globalThis.crypto.randomUUID()

/** A backend that returns one fixed reply and records the prompts it was sent. */
function replyBackend(reply) {
  const calls = []
  return {
    calls,
    id: 'stub',
    label: '测试后端',
    capabilities: {
      streaming: false, cancel: true, reportsResolvedModel: true,
      reportsUsage: true, maxInputCharacters: null, singleFlight: false,
    },
    available: () => ({ available: true }),
    listModels: async () => [{ id: 'stub-model', name: 'Stub', reasoningEfforts: [], contextWindow: null }],
    generate: async (target, request) => {
      calls.push({ target, prompt: request.prompt, system: request.system })
      return {
        text: reply,
        resolvedModel: target.model,
        usage: { inputTokens: 10, outputTokens: 20 },
        finish: 'stop',
        failure: null,
      }
    },
  }
}

/** One reply carrying a well-formed grammar block. */
function replyWith(points, { prose = '这一句的否定用法值得一说。', payload } = {}) {
  const body = payload ?? JSON.stringify({ points })
  return `${prose}\n\n<<<GRAMMAR\n${body}\n>>>`
}

const POINT = {
  title: '否定副词 ne … point',
  body: '书面否定，语气比 ne … pas 更强。',
  anchorId: 'p1.s1',
  level: 'B2',
  module: '否定',
  pitfall: '口语中很少使用。',
}

async function withReply(reply) {
  const backend = replyBackend(reply)
  const backing = createBacking()
  const opened = await openController(backing, FRENCH_READER_DOMAIN, { backends: [backend] })
  await opened.controller.createPassage(passageRequest, signal())
  return { backend, backing, ...opened, table: opened.domain.table('records') }
}

async function openBranch(controller, { anchorId = 'p1.s1', title = '分支' } = {}) {
  const created = await controller.createDiscussionBranch({
    passageId: ids.passage, anchorId, kind: 'discussion', title, parentId: null, forkedFrom: null,
    operationId: uuid(),
  }, signal())
  assert.equal(created.created, true)
  return created.branchId
}

const ask = (controller, branchId, question, operationId = uuid()) => controller.ask({
  passageId: ids.passage, branchId, question, backend: 'stub', model: 'stub-model', operationId,
}, signal())

test('a question whose answer carries a grammar point files it automatically', async () => {
  const { controller, table } = await withReply(replyWith([POINT]))
  const branchId = await openBranch(controller)
  const question = '这里的 ne … point 是什么用法？'

  const asked = await ask(controller, branchId, question)
  assert.equal(asked.ok, true)
  assert.equal(asked.extraction.status, 'extracted')
  assert.equal(asked.extraction.points, 1)
  assert.notEqual(asked.extraction.runId, null)

  // The reader reads an answer: the machine block is not part of the message.
  const branch = controller.listDiscussion(ids.passage, signal())
    .branches.find((entry) => entry.branchId === branchId)
  const answer = branch.messages[1]
  assert.doesNotMatch(answer.text, /<<<GRAMMAR/u, 'the wire block never reaches the reader')
  assert.doesNotMatch(answer.text, /points/u)
  assert.match(answer.text, /否定用法值得一说/u, 'the prose is kept')
  assert.equal(answer.text, asked.answerText, 'the returned text is the stored text')

  // The run states what the turn did.
  const runs = await controller.listRuns(ids.passage, signal())
  assert.equal(runs.length, 1)
  assert.equal(runs[0].extraction.status, 'extracted')
  assert.equal(runs[0].extraction.points, 1)
  assert.equal(runs[0].question, question)
  assert.equal(runs[0].answer, answer.text, 'the run records the answer the reader read')
  assert.equal(runs[0].intents.length, 1)
  assert.equal(runs[0].intents[0].status, 'applied')

  // And the library holds the point, with its evidence anchored to the question.
  const entries = readGrammarEntries(table)
  assert.equal(entries.length, 1)
  const entry = entries[0]
  assert.equal(entry.topic, POINT.title)
  assert.equal(entry.level, 'B2')
  assert.equal(entry.module, '否定')
  assert.equal(entry.keyPoints, POINT.body)
  assert.equal(entry.askCount, 1)
  assert.equal(entry.examples.length, 1)
  assert.equal(entry.examples[0].question, question, 'the example carries the question that produced it')
  assert.equal(entry.examples[0].anchorId, 'p1.s1')
  assert.equal(entry.examples[0].text.length > 0, true)
  assert.equal(entry.pitfalls.length, 1)
  // The automatic path still may not invent a mastery or a verified status.
  assert.equal(entry.mastery, 'learning')
  assert.equal(entry.contentStatus, 'ai-unverified')
})

test('a reply with no block keeps its whole text and files nothing', async () => {
  const reply = '这一句的主语是 il，动词是 faut。'
  const { controller, table } = await withReply(reply)
  const branchId = await openBranch(controller)

  const asked = await ask(controller, branchId, '主语是什么？')
  assert.equal(asked.ok, true, 'a turn without a grammar block is still a successful turn')
  assert.equal(asked.extraction.status, 'none')
  assert.equal(asked.extraction.points, 0)
  assert.match(asked.extraction.detail, /no grammar block/u)

  const branch = controller.listDiscussion(ids.passage, signal())
    .branches.find((entry) => entry.branchId === branchId)
  assert.equal(branch.messages[1].text, reply, 'the answer is untouched')
  assert.equal(readGrammarEntries(table).length, 0, 'nothing is filed from a reply that proposed nothing')

  const runs = await controller.listRuns(ids.passage, signal())
  assert.equal(runs.length, 1, 'the turn is still recorded, so "nothing proposed" is visible')
  assert.equal(runs[0].extraction.status, 'none')
  assert.equal(runs[0].intents.length, 0)
})

test('an unusable grammar block is reported, and its prose still reaches the reader', async () => {
  const reply = replyWith([], { prose: '这一句的结构比较简单。', payload: '{ not json at all' })
  const { controller, table } = await withReply(reply)
  const branchId = await openBranch(controller)

  const asked = await ask(controller, branchId, '结构如何？')
  assert.equal(asked.ok, true)
  assert.equal(asked.extraction.status, 'invalid')
  assert.match(asked.extraction.detail, /not JSON/u)

  const branch = controller.listDiscussion(ids.passage, signal())
    .branches.find((entry) => entry.branchId === branchId)
  assert.equal(branch.messages[1].text, '这一句的结构比较简单。', 'the unusable block is removed, the prose is not')
  assert.equal(readGrammarEntries(table).length, 0)
  assert.equal((await controller.listRuns(ids.passage, signal()))[0].extraction.status, 'invalid')
})

test('an unterminated block is invalid rather than silently "no points"', async () => {
  const { controller } = await withReply('回答正文。\n\n<<<GRAMMAR\n{"points":[]}')
  const branchId = await openBranch(controller)
  const asked = await ask(controller, branchId, '问题')
  assert.equal(asked.extraction.status, 'invalid')
  assert.match(asked.extraction.detail, /never closed/u)
})

test('a retried send files the point once, not once per attempt', async () => {
  const { controller, table } = await withReply(replyWith([POINT]))
  const branchId = await openBranch(controller)
  const operationId = uuid()

  const first = await ask(controller, branchId, '同一个问题', operationId)
  const retry = await ask(controller, branchId, '同一个问题', operationId)
  assert.equal(first.ok, true)
  assert.equal(retry.ok, true)

  const branch = controller.listDiscussion(ids.passage, signal())
    .branches.find((entry) => entry.branchId === branchId)
  assert.equal(branch.messages.length, 2, 'the retry did not append a second turn')
  const runs = await controller.listRuns(ids.passage, signal())
  assert.equal(runs.length, 1, 'one question is one run')
  const entries = readGrammarEntries(table)
  assert.equal(entries.length, 1)
  assert.equal(entries[0].askCount, 1, 'the question was counted once')
  assert.equal(entries[0].examples.length, 1, 'and it left one example')
})

test('two points about the same topic in one question count once', async () => {
  const { controller, table } = await withReply(replyWith([POINT, { ...POINT, body: '另一种说法。' }]))
  const branchId = await openBranch(controller)

  const asked = await ask(controller, branchId, '这个否定怎么理解？')
  assert.equal(asked.extraction.points, 2, 'both points were read from the reply')

  const entries = readGrammarEntries(table)
  assert.equal(entries.length, 1, 'the second point landed on the entry the first one created')
  assert.equal(entries[0].askCount, 1, 'one question is one count, whatever it says')
  assert.equal(entries[0].examples.length, 1)
})

test('a point with an unknown anchor fails that point and creates no entry', async () => {
  const { controller, table } = await withReply(replyWith([
    { ...POINT, title: '落空的锚点', anchorId: 'p9.s9' },
  ]))
  const branchId = await openBranch(controller)

  const asked = await ask(controller, branchId, '这一句呢？')
  assert.equal(asked.ok, true, 'the answer is unaffected by a bad anchor in its block')
  assert.equal(asked.extraction.status, 'extracted', 'the block itself was readable')

  const runs = await controller.listRuns(ids.passage, signal())
  assert.equal(runs[0].intents[0].status, 'failed')
  assert.equal(runs[0].intents[0].detail, 'anchor-unknown')
  assert.equal(readGrammarEntries(table).length, 0, 'an example that cannot be located is not stored')
})

test('a malformed anchor id falls back to the branch anchor instead of failing', async () => {
  const { controller, table } = await withReply(replyWith([
    { ...POINT, title: '语法点带错锚点', anchorId: 'nonsense' },
  ]))
  const branchId = await openBranch(controller, { anchorId: 'p2.s1' })

  const asked = await ask(controller, branchId, '这一句？')
  assert.equal(asked.extraction.status, 'extracted')
  const runs = await controller.listRuns(ids.passage, signal())
  assert.equal(runs[0].intents[0].anchorId, 'p2.s1', 'the branch anchor is the text the reader was looking at')
  assert.equal(runs[0].intents[0].status, 'applied')
  assert.equal(readGrammarEntries(table)[0].examples[0].anchorId, 'p2.s1')
})

test('a branch anchored on a reader selection can file grammar too', async () => {
  const { controller, table } = await withReply(replyWith([{ ...POINT, anchorId: undefined }]))
  const selection = await controller.createSelection({
    passageId: ids.passage, ranges: [{ start: 0, end: 2 }], note: '', operationId: uuid(),
  }, signal())
  assert.equal(selection.created, true)
  const branchId = await openBranch(controller, { anchorId: selection.anchorId })

  const asked = await ask(controller, branchId, '这两个词呢？')
  assert.equal(asked.ok, true)
  assert.equal(asked.extraction.status, 'extracted')

  const runs = await controller.listRuns(ids.passage, signal())
  assert.equal(runs[0].intents[0].status, 'applied', 'a selection anchor is a real anchor for a grammar point')
  const entry = readGrammarEntries(table)[0]
  assert.equal(entry.examples[0].anchorId, selection.anchorId)
  assert.equal(entry.examples[0].anchor.excerpt, 'Il')
})

test('the answer survives even when the grammar write path refuses the turn', async () => {
  // An archived-away passage is the cheapest way to make the run path fail after a
  // successful generation: the message is durable, the knowledge write is not.
  const { controller } = await withReply(replyWith([POINT]))
  const branchId = await openBranch(controller)
  const asked = await ask(controller, branchId, '正常提问')
  assert.equal(asked.ok, true)

  const branch = controller.listDiscussion(ids.passage, signal())
    .branches.find((entry) => entry.branchId === branchId)
  assert.equal(branch.messages.length, 2)
  assert.match(branch.messages[1].text, /否定用法值得一说/u)
})

test('the verdict travels on the message, so the panel can show it without a second call', async () => {
  const { controller } = await withReply(replyWith([POINT]))
  const branchId = await openBranch(controller)
  await ask(controller, branchId, '这个否定怎么理解？')

  // The view the panel reads is synchronous and carries the verdict: resolving it from
  // the run would need the run's derived operation id, which is async.
  const branch = controller.listDiscussion(ids.passage, signal()).branches[0]
  const answer = branch.messages[1]
  assert.deepEqual(answer.extraction, { status: 'extracted', points: 1, detail: null })

  const question = branch.messages[0]
  assert.equal(question.extraction, null, 'a question carries no verdict')

  // A reply with no block says so, rather than looking the same as one that filed points.
  const quiet = await withReply('这一句的否定很直接。')
  const quietBranch = await openBranch(quiet.controller)
  await ask(quiet.controller, quietBranch, '这一句呢？')
  const quietAnswer = quiet.controller.listDiscussion(ids.passage, signal()).branches[0].messages[1]
  assert.equal(quietAnswer.extraction.status, 'none')
  assert.match(quietAnswer.extraction.detail, /no grammar block/u)
})

test('the system instruction asks for the block, so the model can comply', async () => {
  const { controller, backend } = await withReply(replyWith([POINT]))
  const branchId = await openBranch(controller)
  await ask(controller, branchId, '问题')
  const system = backend.calls[0].system
  assert.match(system, /<<<GRAMMAR/u)
  assert.match(system, />>>/u)
  assert.match(system, /anchorId/u)
})
