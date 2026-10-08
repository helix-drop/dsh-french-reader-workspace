import test from 'node:test'
import assert from 'node:assert/strict'

import { createBacking, ids, openController, passageRequest, signal } from './support/harness.mjs'
import { FRENCH_READER_DOMAIN, analysisKey, runsKey } from '../lib/domain.js'

const ANCHOR = 'p1.s1'

async function withPassage() {
  const backing = createBacking()
  const opened = await openController(backing, FRENCH_READER_DOMAIN)
  await opened.controller.createPassage(passageRequest, signal())
  return { backing, ...opened }
}

const runOperation = '00000000-0000-4000-8000-0000000000f1'

const threeIntents = [
  { kind: 'branch', anchorId: ANCHOR, title: '无人称 il faut', body: 'il 为形式主语。' },
  { kind: 'branch', anchorId: ANCHOR, title: '主有形容词', body: 'notre 与 jardin 配合。' },
  { kind: 'translation', anchorId: ANCHOR, title: '', body: '必须耕种我们自己的园地。' },
]

test('one commit carries the answer and every intended write', async () => {
  const { backing, controller } = await withPassage()
  const value = await controller.commitRun({
    passageId: ids.passage,
    operationId: runOperation,
    anchorId: ANCHOR,
    question: 'il faut 是什么结构？',
    answer: '无人称句：il 是形式主语，faut 是 falloir 的第三人称单数。',
    intents: threeIntents,
  }, signal())

  assert.equal(value.committed, true)
  assert.equal(value.run.intents.length, 3)
  assert.deepEqual(value.run.intents.map((intent) => intent.status), ['applied', 'applied', 'applied'])
  assert.ok(value.run.intents.every((intent) => typeof intent.appliedId === 'string'))

  const analysis = await controller.listAnalysis({ passageId: ids.passage }, signal())
  assert.equal(analysis.analysis.branches.length, 2)
  assert.equal(analysis.analysis.translations.length, 1)
  assert.deepEqual(analysis.analysis.branches.map((branch) => branch.anchorId), [ANCHOR, ANCHOR])

  // The answer itself is durable even before any knowledge write is read.
  const runs = await controller.listRuns(ids.passage, signal())
  assert.equal(runs.length, 1)
  assert.match(runs[0].answer, /falloir/u)
  assert.equal(backing.writesFor(runsKey(ids.passage)) >= 4, true, 'one write per intent plus the commit')
})

test('a retried commit is one run, not a second copy of its writes', async () => {
  const { backing, controller } = await withPassage()
  const input = {
    passageId: ids.passage,
    operationId: runOperation,
    anchorId: ANCHOR,
    question: 'il faut 是什么结构？',
    answer: '无人称句。',
    intents: threeIntents,
  }
  const first = await controller.commitRun(input, signal())
  const retry = await controller.commitRun(input, signal())

  assert.equal(retry.run.id, first.run.id)
  assert.equal(retry.unchanged, true, 'an identical retry changes nothing')
  assert.equal((await controller.listRuns(ids.passage, signal())).length, 1)
  const analysis = await controller.listAnalysis({ passageId: ids.passage }, signal())
  assert.equal(analysis.analysis.branches.length, 2)
  assert.equal(analysis.analysis.translations.length, 1)

  // The same operation id with different content is a caller bug, not a new
  // question: editing the answer under a used id must not silently rewrite it.
  const writesBefore = backing.writesFor(runsKey(ids.passage))
  const different = await controller.commitRun({ ...input, answer: '换了答案' }, signal())
  assert.equal(different.committed, false)
  assert.equal(different.reason, 'operation-used')
  assert.equal((await controller.listRuns(ids.passage, signal())).length, 1, 'same operationId stays one run')
  assert.equal(backing.writesFor(runsKey(ids.passage)), writesBefore, 'a refused write touches nothing')

  // A genuinely new question is a new operation id, and counts as one.
  const second = await controller.commitRun({
    ...input,
    operationId: '00000000-0000-4000-8000-0000000000f9',
  }, signal())
  assert.equal(second.committed, true)
  assert.equal((await controller.listRuns(ids.passage, signal())).length, 2)
})

test('a crash between writes resumes only what is still pending', async () => {
  const { backing, controller } = await withPassage()
  const committed = await controller.commitRun({
    passageId: ids.passage,
    operationId: runOperation,
    anchorId: ANCHOR,
    question: 'il faut 是什么结构？',
    answer: '无人称句。',
    intents: threeIntents,
  }, signal())
  const applied = committed.run.intents.filter((intent) => intent.status === 'applied')
  assert.equal(applied.length, 3)

  // Fault injection: as if the process died after the second intent. The run
  // record still holds the answer; the first two writes stay valid; the third
  // is pending again.
  const records = new Map(backing.tables.get('records'))
  const stored = records.get(runsKey(ids.passage))
  const rewound = {
    ...stored,
    payload: {
      ...stored.payload,
      runs: stored.payload.runs.map((run) => ({
        ...run,
        intents: run.intents.map((intent, index) => index < 2
          ? intent
          : { ...intent, status: 'pending', appliedId: null }),
      })),
    },
  }
  records.set(runsKey(ids.passage), rewound)
  // Drop the third write so resuming must actually write it again.
  const analysis = records.get(analysisKey(ids.passage))
  const thirdWrite = applied[2].appliedId
  records.set(analysisKey(ids.passage), {
    ...analysis,
    payload: {
      ...analysis.payload,
      translations: analysis.payload.translations.filter((entry) => entry.id !== thirdWrite),
      branches: analysis.payload.branches.filter((entry) => entry.id !== thirdWrite),
    },
  })
  backing.tables.set('records', records)

  const resumed = await openController(backing, FRENCH_READER_DOMAIN)
  const result = await resumed.controller.resumeRuns(ids.passage, signal())
  assert.equal(result.resumed, 1, 'only the pending intent is finished')
  assert.deepEqual(result.runs[0].intents.map((intent) => intent.status), ['applied', 'applied', 'applied'])

  // The two already-applied writes were not duplicated.
  const after = await resumed.controller.listAnalysis({ passageId: ids.passage }, signal())
  assert.equal(after.analysis.branches.length, 2)
  assert.equal(after.analysis.translations.length, 1)
  assert.equal(after.analysis.translations.length, 1, 'the lost write is recreated exactly once')
  assert.equal(
    after.analysis.translations[0].operationId,
    committed.run.intents[2].id,
    'the recreated record is bound to its intent, so a later resume dedupes on it',
  )

  const again = await resumed.controller.resumeRuns(ids.passage, signal())
  assert.equal(again.resumed, 0, 'resuming twice is a no-op')
  await resumed.domain.close()
})

test('a failing intent is reported without blocking its siblings', async () => {
  const { controller } = await withPassage()
  const value = await controller.commitRun({
    passageId: ids.passage,
    operationId: '00000000-0000-4000-8000-0000000000f2',
    anchorId: ANCHOR,
    question: '混合意图',
    answer: '答案照常保存。',
    intents: [
      { kind: 'branch', anchorId: 'p9.s9', title: '错锚点', body: '无法定位。' },
      { kind: 'branch', anchorId: ANCHOR, title: '正确锚点', body: '正常写入。' },
    ],
  }, signal())

  assert.deepEqual(value.run.intents.map((intent) => intent.status), ['failed', 'applied'])
  assert.equal(value.run.intents[0].detail, 'anchor-unknown')
  assert.equal(value.run.intents[1].appliedId !== null, true)

  const runs = await controller.listRuns(ids.passage, signal())
  assert.equal(runs[0].answer, '答案照常保存。', 'the answer survives a failed knowledge write')
})

test('an unknown passage or anchor is refused before anything is written', async () => {
  const { backing, controller } = await withPassage()
  const before = backing.writes.length

  const unknownPassage = await controller.commitRun({
    passageId: '00000000-0000-4000-8000-0000000000fe',
    operationId: '00000000-0000-4000-8000-0000000000f3',
    anchorId: ANCHOR,
    question: 'q',
    answer: 'a',
    intents: [],
  }, signal())
  assert.deepEqual(unknownPassage, { committed: false, reason: 'passage-unknown' })

  const unknownAnchor = await controller.commitRun({
    passageId: ids.passage,
    operationId: '00000000-0000-4000-8000-0000000000f4',
    anchorId: 'p9.s9',
    question: 'q',
    answer: 'a',
    intents: [],
  }, signal())
  assert.deepEqual(unknownAnchor, { committed: false, reason: 'anchor-unknown' })
  assert.equal(backing.writesFor(runsKey(ids.passage)), 0, 'a refused commit writes no run record')
  assert.equal(
    backing.writes.filter(([kind, , key]) => kind === 'put' && key === analysisKey(ids.passage)).length,
    0,
    'a refused commit touches no analysis',
  )
  assert.ok(backing.writes.length >= before)
})
