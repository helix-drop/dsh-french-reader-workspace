import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

/**
 * The client half of the streamed turn.
 *
 * The Host side is tested behaviourally in `stream-ask.test.mjs` (including that a
 * refusal still ends the stream). What matters here is that the panel *uses* it and
 * that a stream which ends without a terminal frame is an error rather than an empty
 * answer — "still arriving" and "failed" must not look the same to the reader.
 */
const packageRoot = fileURLToPath(new URL('../', import.meta.url))
const source = readFileSync(path.join(packageRoot, 'client.js'), 'utf8')

function dictionaries() {
  const zh = /\n    const zh = \{([\s\S]*?)\n    \}\n/u.exec(source)
  const en = /\n    const en = \{([\s\S]*?)\n    \}\n/u.exec(source)
  assert.notEqual(zh, null)
  assert.notEqual(en, null)
  const keys = (body) => new Set([...body.matchAll(/(?:^|\s)([A-Za-z][A-Za-z0-9_]*):\s*['"]/gu)].map((match) => match[1]))
  return { zh: keys(zh[1]), en: keys(en[1]) }
}

test('the stream endpoint is declared as a stream with a strict frame codec', () => {
  const at = source.indexOf("#frenchReader/streamAsk'")
  assert.notEqual(at, -1, 'the streamed endpoint is declared')
  const block = source.slice(at, at + 1_600)
  assert.match(block, /mode: 'stream'/u, 'the descriptor says it is a stream, not a unary call')
  assert.match(block, /namespace: 'frenchReader'/u)
  assert.match(block, /invocation: \{ kind: 'direct' \}/u)
  assert.match(block, /name: 'request', wire: 'request'/u)
  assert.match(block, /codec: strict\(/u)
  assert.match(block, /result: strict\(`\$\{TYPES\}AskFrame`/u)
  assert.match(block, /kind: S\.lit\('delta'\)/u, 'a frame can be a delta')
  assert.match(block, /kind: S\.lit\('done'\)/u, 'and a frame can be the end')
  assert.match(block, /result: askResultShape/u, 'the terminal frame carries the same result shape as the unary call')
  assert.match(block, /cancellation: \{ parameter: 'signal' \}/u)
})

test('the panel streams when it can and sends unary when it cannot', () => {
  const at = source.indexOf('async function sendTurn(')
  assert.notEqual(at, -1)
  const body = source.slice(at, source.indexOf('/** The branch a turn on this anchor belongs to', at))
  assert.match(body, /typeof streamAsk === 'function'/u, 'the stream is used when the Host provides it')
  assert.match(body, /receiveStream\(streamAsk\(request, controller\.signal\)/u)
  assert.match(body, /unwrap\(await ask\(request, controller\.signal\), t\)/u, 'and the unary call is the fallback, not the only path')
  assert.match(body, /setStreamText\(''\)/u, 'the arriving text is cleared when the turn settles')
})

test('a stream without a terminal frame is an error, not an empty answer', () => {
  const at = source.indexOf('async function receiveStream(')
  assert.notEqual(at, -1, 'the stream reader exists')
  const body = source.slice(at, at + 900)
  assert.match(body, /frame\.kind === 'delta'/u)
  assert.match(body, /frame\.kind === 'done'/u)
  assert.match(body, /result === null/u, 'the absence of a terminal frame is detected')
  assert.match(body, /throw new Error\(translate\('streamEndedEarly'\)\)/u, 'and reported, never returned as empty text')
  const { zh, en } = dictionaries()
  assert.equal(zh.has('streamEndedEarly'), true, 'the message is translated')
  assert.equal(en.has('streamEndedEarly'), true)
})

test('the arriving text is rendered where the finished answer will appear', () => {
  assert.match(source, /className: 'streamText'/u, 'the partial answer has its own element (the prototype\'s class)')
  // The attribute key is quoted in the source, because it has a hyphen.
  assert.match(source, /'aria-live': 'polite'/u, 'and is announced without interrupting')
  assert.match(source, /\.streamText\{/u, 'with a style rule')
  // The style must use live theme tokens: a raw colour would break one of the two themes.
  const rule = /\.streamText\{([\s\S]*?)\}/u.exec(source)
  assert.notEqual(rule, null)
  const tokens = [...rule[1].matchAll(/var\((--dsw-alias-[a-z0-9-]+)\)/gu)].map((match) => match[1])
  assert.equal(tokens.length >= 3, true, 'the rule colours itself from tokens')
  assert.equal(/(?<![\w-])(?:#[0-9a-fA-F]{3,8}\b|rgba?\()/u.test(rule[1]), false, 'and hard-codes no colour')
})
