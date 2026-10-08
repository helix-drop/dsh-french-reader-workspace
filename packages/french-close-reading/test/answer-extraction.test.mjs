import test from 'node:test'
import assert from 'node:assert/strict'

import { extractGrammarPoints, MAX_EXTRACTED_POINTS } from '../lib/answer-extraction.js'

/**
 * The parser's own rules, without a controller in the way.
 *
 * The turn-level behaviour is in `ask-extraction.test.mjs`; this file pins the
 * edge cases that decide whether a reader's answer keeps its text and whether a
 * malformed block is reported or swallowed.
 */
const block = (payload) => `正文第一段。\n\n<<<GRAMMAR\n${payload}\n>>>`

test('a well-formed block is split off and parsed', () => {
  const outcome = extractGrammarPoints(block(JSON.stringify({
    points: [{ title: '虚拟式', body: '主句表达意愿时从句用虚拟式。', anchorId: 'p1.s1', level: 'B1', module: '语式' }],
  })))
  assert.equal(outcome.status, 'extracted')
  assert.equal(outcome.text, '正文第一段。')
  assert.equal(outcome.points.length, 1)
  assert.deepEqual(outcome.points[0], {
    title: '虚拟式',
    body: '主句表达意愿时从句用虚拟式。',
    anchorId: 'p1.s1',
    level: 'B1',
    module: '语式',
    pitfall: '',
  })
})

test('a bare array is accepted, and text around the block is kept', () => {
  const outcome = extractGrammarPoints(
    `前面的话。\n<<<GRAMMAR\n[{"title":"冠词","body":"定冠词指已知。"}]\n>>>\n后面的话。`,
  )
  assert.equal(outcome.status, 'extracted')
  assert.equal(outcome.text, '前面的话。\n\n后面的话。')
  assert.equal(outcome.points[0].anchorId, null, 'an omitted anchor is the caller’s to fill in')
  assert.equal(outcome.points[0].level, null)
})

test('the last block wins, so a quoted format is not mistaken for output', () => {
  const outcome = extractGrammarPoints(
    `格式示例：\n<<<GRAMMAR\n{"points":[]}\n>>>\n真正的正文。\n<<<GRAMMAR\n{"points":[{"title":"真点","body":"真正的点。"}]}\n>>>`,
  )
  assert.equal(outcome.status, 'extracted')
  assert.equal(outcome.points.length, 1)
  assert.equal(outcome.points[0].title, '真点')
  assert.match(outcome.text, /格式示例/u)
  assert.match(outcome.text, /真正的正文/u)
  assert.doesNotMatch(outcome.text, /<<<GRAMMAR/u)
})

test('no block at all is "none", not a failure', () => {
  const outcome = extractGrammarPoints('只有正文，没有任何机器块。')
  assert.equal(outcome.status, 'none')
  assert.equal(outcome.text, '只有正文，没有任何机器块。')
  assert.deepEqual(outcome.points, [])
})

test('malformed payloads are reported with a reason', () => {
  const cases = [
    ['{ not json', /not JSON/u],
    ['{"points":"nope"}', /no points array/u],
    ['{"points":[]}', /no usable point/u],
    ['{"points":[{"title":"有标题没正文"}]}', /has no body/u],
    ['{"points":[{"body":"有正文没标题"}]}', /title is missing/u],
    ['{"points":["字符串不是点"]}', /not an object/u],
  ]
  for (const [payload, pattern] of cases) {
    const outcome = extractGrammarPoints(block(payload))
    assert.equal(outcome.status, 'invalid', `payload ${payload}`)
    assert.match(outcome.detail, pattern)
    assert.equal(outcome.text, '正文第一段。', 'the prose survives an unusable block')
  }
})

test('the point limit is a truncation, and it is stated', () => {
  const points = Array.from({ length: MAX_EXTRACTED_POINTS + 3 }, (_, index) => ({
    title: `点 ${String(index + 1)}`,
    body: '正文',
  }))
  const outcome = extractGrammarPoints(block(JSON.stringify({ points })))
  assert.equal(outcome.status, 'extracted')
  assert.equal(outcome.points.length, MAX_EXTRACTED_POINTS)
  assert.match(outcome.detail, /beyond the limit/u)
})

test('unusable points do not sink the usable ones', () => {
  const outcome = extractGrammarPoints(block(JSON.stringify({
    points: [
      { title: '', body: '没有标题' },
      { title: '可用的点', body: '可用正文' },
    ],
  })))
  assert.equal(outcome.status, 'extracted')
  assert.equal(outcome.points.length, 1)
  assert.match(outcome.detail, /point 1/u, 'the dropped one is named in the detail')
})

test('a syntactically valid but unknown anchor is kept for the controller to refuse', () => {
  const outcome = extractGrammarPoints(block(JSON.stringify({
    points: [{ title: '点', body: '正文', anchorId: 'p9.s9' }],
  })))
  assert.equal(outcome.points[0].anchorId, 'p9.s9')
})
