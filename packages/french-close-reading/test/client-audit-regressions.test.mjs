import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const packageRoot = fileURLToPath(new URL('../', import.meta.url))
const client = readFileSync(path.join(packageRoot, 'client.js'), 'utf8')

function section(start, end) {
  const from = client.indexOf(start)
  assert.notEqual(from, -1, `source contains ${start}`)
  const to = client.indexOf(end, from)
  assert.notEqual(to, -1, `source contains ${end}`)
  return client.slice(from, to)
}

test('conclusion UI sends the full strict request and keeps edits open on failure', () => {
  const record = section('async function recordConclusionFor', '/** `openActionDialog')
  for (const field of ['passageId:', 'branchId:', 'anchorId:', 'messageId:', 'text,', "status: 'confirmed'", 'operationId:']) {
    assert.ok(record.includes(field), `conclusion request includes ${field}`)
  }

  const commit = section('async function commitActionDialog', '/**\n       * The prototype\'s three dialogs')
  const save = commit.indexOf('await recordConclusionFor(dialog, text)')
  const close = commit.indexOf('closeActionDialog(false)')
  assert.ok(save >= 0 && close > save, 'dialog closes only after the save reports success')
  assert.match(commit, /else setActionDialog\(\(current\)/u, 'failed writes preserve the edited draft')
})

test('understood is sent with the Host-supported status value', () => {
  assert.match(client, /\? 'understood' : 'open'/u)
  assert.doesNotMatch(client, /\? 'settled' : 'open'/u)
})

test('discussion turns expose elapsed time, preserve the question, and pass cancellation signals', () => {
  const send = section('async function sendTurn(target)', 'async function receiveStream')
  assert.ok(send.includes('streamAsk(request, controller.signal)'))
  assert.ok(send.includes('ask(request, controller.signal)'))
  assert.ok(send.includes('question, passageId, anchorId: target, branchId'))
  assert.match(client, /className: 'askRunStatus'/u)
  assert.match(client, /onClick: cancelAsk/u)
  assert.match(client, /askCancelUnconfirmed/u)
})

test('analysis cancellation waits for Host acknowledgement before aborting the request', () => {
  const cancel = section('function cancelAnalysisRun()', '// Navigating away cancels the run')
  const request = cancel.indexOf('await cancelAnalysis({')
  const acknowledgement = cancel.indexOf("value.kind === 'cancel-requested'")
  const abort = cancel.indexOf('controller.abort()')
  assert.ok(request >= 0 && acknowledgement > request && abort > acknowledgement)
})
