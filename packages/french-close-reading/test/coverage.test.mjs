import test from 'node:test'
import assert from 'node:assert/strict'

import { checkCoverage, clauseRanges } from '../lib/coverage.js'
import { createBacking, openController } from './support/harness.mjs'
import { FRENCH_READER_DOMAIN } from '../lib/domain.js'
import { buildFrenchReaderTool } from '../lib/tools.js'

const PASCAL = 'Le cœur a ses raisons que la raison ne connaît point ; on le sait en mille choses.'

/** A constituent covering exactly one slice of the sentence. */
const part = (label, sentence, text) => {
  const start = sentence.indexOf(text)
  assert.notEqual(start, -1, `fixture text not found: ${text}`)
  return { label, start, end: start + text.length }
}

test('a clause is found by punctuation, a subordinator, and a coordinator', () => {
  const clauses = clauseRanges(PASCAL).map((clause) => clause.text)
  assert.equal(clauses.some((text) => text.startsWith('que la raison')), true, 'que opens a clause')
  assert.equal(clauses.some((text) => text.startsWith('on le sait')), true, 'the semicolon opens a clause')
  assert.equal(clauses.length >= 3, true, `expected at least three units, got ${String(clauses.length)}`)
})

test('a complete analysis passes, and the sentence itself is not punished', () => {
  const report = checkCoverage(PASCAL, [
    part('主句', PASCAL, 'Le cœur a ses raisons'),
    part('关系从句', PASCAL, 'que la raison ne connaît point'),
    part('并列分句', PASCAL, 'on le sait en mille choses.'),
  ])
  assert.deepEqual(report.errors, [])
  assert.deepEqual(report.hints, [])

  // A genuinely single-clause sentence may be analysed with one constituent.
  const single = 'Le cœur a ses raisons.'
  const one = checkCoverage(single, [part('整句', single, 'Le cœur a ses raisons')])
  assert.deepEqual(one.errors, [])
  assert.deepEqual(one.hints, [], 'a one-clause sentence is not a summary problem')
})

test('a dropped clause is named, with its text and position', () => {
  const report = checkCoverage(PASCAL, [
    part('主句', PASCAL, 'Le cœur a ses raisons'),
    part('并列分句', PASCAL, 'on le sait en mille choses.'),
  ])
  assert.equal(report.errors.some((error) => /漏掉从句：「que la raison ne connaît point」/u.test(error)), true)
  assert.equal(report.errors.some((error) => /未被任何成分覆盖/u.test(error)), true)
})

test('one constituent spanning everything is a summary, not an analysis', () => {
  const report = checkCoverage(PASCAL, [{ label: '整句', start: 0, end: PASCAL.length }])
  assert.deepEqual(report.errors, [], 'nothing is missing, so nothing errors')
  assert.equal(report.hints.some((hint) => /等于没有拆分/u.test(hint)), true)
  assert.equal(report.hints.some((hint) => /句子有 \d+ 个从句单位/u.test(hint)), true)
})

test('overlaps, out-of-range ranges and nameless constituents are refused', () => {
  const overlapping = checkCoverage(PASCAL, [
    { label: 'A', start: 0, end: 20 },
    { label: 'B', start: 10, end: PASCAL.length },
  ])
  assert.equal(overlapping.errors.some((error) => /重叠/u.test(error)), true)

  const outside = checkCoverage(PASCAL, [{ label: 'A', start: 0, end: 9999 }])
  assert.equal(outside.errors.some((error) => /超出句子范围/u.test(error)), true)

  const nameless = checkCoverage(PASCAL, [{ label: '  ', start: 0, end: PASCAL.length }])
  assert.equal(nameless.errors.some((error) => /没有名称的成分/u.test(error)), true)

  const empty = checkCoverage(PASCAL, [])
  assert.equal(empty.errors.some((error) => /未给出任何成分/u.test(error)), true)
})

test('the tool action reports the clause split it used', async () => {
  const backing = createBacking()
  const opened = await openController(backing, FRENCH_READER_DOMAIN)
  const tool = buildFrenchReaderTool(opened.controller)

  const complete = await tool.execute({
    action: 'coverage',
    sentence: PASCAL,
    constituents: [
      part('主句', PASCAL, 'Le cœur a ses raisons'),
      part('关系从句', PASCAL, 'que la raison ne connaît point'),
      part('并列分句', PASCAL, 'on le sait en mille choses.'),
    ],
  })
  assert.deepEqual(complete.detail.errors, [])
  assert.equal(complete.detail.clauses.length >= 3, true)
  assert.equal(complete.detail.clauses.every((clause) => typeof clause.text === 'string'), true)
  assert.match(complete.detail.note, /Nothing is stored/u)

  const dropped = await tool.execute({
    action: 'coverage',
    sentence: PASCAL,
    constituents: [part('主句', PASCAL, 'Le cœur a ses raisons')],
  })
  assert.equal(dropped.detail.errors.length >= 2, true)
  assert.equal(backing.writes.length, 0, 'a check never writes')
})
