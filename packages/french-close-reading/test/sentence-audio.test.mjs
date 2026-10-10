import test from 'node:test'
import assert from 'node:assert/strict'

import { createBacking, ids, openController, passageRequest, signal } from './support/harness.mjs'
import {
  KEY,
  fetchStub,
  hangingFetch,
  jsonResponse,
  liveServer,
  noSocket,
  pcmBytes,
  ttsPayload,
  until,
} from './support/audio-fakes.mjs'
import { FRENCH_READER_DOMAIN } from '../lib/domain.js'
import {
  checkSentenceText,
  pcmDurationMs,
  pcmToWav,
  resolveAudioConfiguration,
  sampleRateFromMime,
  toPlayableAudio,
  wavDurationMs,
} from '../lib/audio.js'

/**
 * Sentence audio, exercised entirely offline.
 *
 * Both transports are injected — a scripted `fetch` and a scripted WebSocket —
 * so every test below runs without a network and without a key: the string
 * `test-key` is a placeholder that only ever appears in an in-memory config.
 *
 * What is being pinned down is the contract, not the provider: exactly one
 * sentence per request, never overwriting a take, playing a cached take without
 * synthesizing, invalidating takes when the source revision changes, cancelling
 * without storing anything, and idempotency by `requestId`.
 */
const SENTENCE = 'Il faut cultiver notre jardin.'
/** The second paragraph's body: never a synthesis input, whoever asks. */
const PARAGRAPH_TEXT = '— Mais lequel ? — Le nôtre, dit-il.'

/** One open controller over a passage that already has its segmentation. */
async function openAudio({
  config = { apiKey: KEY, backend: 'tts' },
  fetchImpl,
  webSocket,
  env = {},
} = {}) {
  const backing = createBacking()
  const opened = await openController(backing, FRENCH_READER_DOMAIN, {
    audio: { config, fetch: fetchImpl, webSocket: webSocket ?? noSocket, env },
  })
  await opened.controller.createPassage(passageRequest, signal())
  await opened.controller.getSegmentation({ passageId: ids.passage }, signal())
  return { ...opened, backing }
}

/** The one immutable source: exactly the sentence, at the revisions it has. */
const sentenceSource = (overrides = {}) => ({
  passageId: ids.passage,
  sentenceId: 'p1.s1',
  sourceRevision: 1,
  sentenceRevision: 1,
  text: SENTENCE,
  language: 'fr',
  ...overrides,
})

const sentenceRequest = (overrides = {}) => ({
  requestId: globalThis.crypto.randomUUID(),
  action: 'generate',
  source: sentenceSource(),
  previousTakeId: null,
  versionPolicy: 'append',
  voice: null,
  ...overrides,
})

const listOf = (controller, source = sentenceSource()) =>
  controller.listSentenceAudioRemote({ source }, signal())

const recordsJson = (backing) => JSON.stringify([...backing.tables.get('records').entries()])

/* ------------------------------------------------------------------ input --- */

test('only one sentence may be synthesized, and only within the length limit', () => {
  assert.deepEqual(checkSentenceText('  Il part.  ', 400), { ok: true, text: 'Il part.' })
  // A sentence with no final punctuation is still one sentence.
  assert.deepEqual(checkSentenceText('Il faut cultiver notre jardin', 400),
    { ok: true, text: 'Il faut cultiver notre jardin' })
  // An abbreviation is not the end of a sentence, so this stays one sentence.
  assert.deepEqual(checkSentenceText('M. Dupont arrive.', 400), { ok: true, text: 'M. Dupont arrive.' })
  // A closing quote after the full stop is punctuation, not a second sentence.
  assert.deepEqual(checkSentenceText('Il a dit : « Viens. »', 400), { ok: true, text: 'Il a dit : « Viens. »' })

  assert.equal(checkSentenceText('', 400).reason, 'blank')
  assert.equal(checkSentenceText('   ', 400).reason, 'blank')
  assert.equal(checkSentenceText('Il part. Elle arrive.', 400).reason, 'multi-sentence')
  assert.equal(checkSentenceText('Il part ! Puis elle arrive', 400).reason, 'multi-sentence')
  assert.equal(checkSentenceText('Attends… je viens.', 400).reason, 'multi-sentence')
  const long = checkSentenceText(SENTENCE, 10)
  assert.equal(long.reason, 'too-long')
  assert.match(long.message, /10/u)
})

test('raw PCM is wrapped as WAV and a WAV answer is passed through', () => {
  const pcm = pcmBytes(2400)
  const wav = pcmToWav(pcm, { sampleRate: 24_000 })
  assert.equal(wav.length, 44 + pcm.length)
  assert.equal(Buffer.from(wav.slice(0, 4)).toString('ascii'), 'RIFF')
  assert.equal(Buffer.from(wav.slice(8, 12)).toString('ascii'), 'WAVE')
  assert.equal(wavDurationMs(wav), 50)
  assert.equal(pcmDurationMs(pcm.length, 24_000), 50)
  assert.equal(sampleRateFromMime('audio/L16;codec=pcm;rate=22050'), 22_050)
  assert.equal(sampleRateFromMime('audio/pcm'), 24_000)

  const wrapped = toPlayableAudio(pcm, 'audio/L16;codec=pcm;rate=24000')
  assert.equal(wrapped.mimeType, 'audio/wav')
  assert.equal(wrapped.durationMs, 50)
  const passed = toPlayableAudio(wav, 'audio/wav')
  assert.equal(passed.bytes.length, wav.length)
  assert.equal(passed.durationMs, 50)
})

/* --------------------------------------------------------------- the happy --- */

test('one sentence becomes one WAV take, appended and selected', async () => {
  const stub = fetchStub(() => jsonResponse(ttsPayload()))
  const { controller, backing } = await openAudio({ fetchImpl: stub.impl })

  const value = await controller.synthesizeSentenceAudioRemote(sentenceRequest(), signal())
  assert.equal(value.kind, 'ready')
  assert.equal(value.take.selected, true)
  assert.equal(value.take.mimeType, 'audio/wav')
  assert.equal(value.take.bytes, 2444)
  assert.equal(value.take.durationMs, 50)
  assert.equal(value.take.voice.voiceId, 'Kore')
  assert.equal(value.take.backend.modelId, 'gemini-2.5-flash-preview-tts')
  assert.equal(value.take.source.text, SENTENCE)

  // One request, to the model's own route, with the sentence as the only content.
  assert.equal(stub.calls.length, 1)
  assert.match(stub.calls[0].url, /gemini-2\.5-flash-preview-tts:generateContent$/u)
  const body = JSON.parse(stub.calls[0].init.body)
  assert.deepEqual(body.contents, [{ role: 'user', parts: [{ text: SENTENCE }] }])
  assert.deepEqual(body.generationConfig.responseModalities, ['AUDIO'])
  assert.equal(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Kore')
  // The key travels in the header the route expects, and never in the URL.
  assert.equal(stub.calls[0].init.headers['x-goog-api-key'], KEY)
  assert.equal(stub.calls[0].url.includes(KEY), false)

  const asset = await controller.readSentenceAudioAssetRemote(
    { source: sentenceSource(), takeId: value.take.takeId }, signal())
  assert.equal(asset.kind, 'found')
  assert.equal(asset.bytes, 2444)
  assert.equal(asset.durationMs, 50)
  const bytes = Buffer.from(asset.base64, 'base64')
  assert.equal(bytes.length, 2444)
  assert.equal(bytes.slice(0, 4).toString('ascii'), 'RIFF')
  assert.equal(bytes.slice(8, 12).toString('ascii'), 'WAVE')

  const listed = await listOf(controller)
  assert.equal(listed.takes.length, 1)
  assert.equal(listed.selectedTakeId, value.take.takeId)
  assert.equal(listed.configuration.configured, true)
  assert.equal(listed.configuration.maxCharacters, 400)
  // A take is stored as itself, with the fingerprint that names its source.
  assert.equal(listed.sourceKey, `${ids.passage}|p1.s1|1|1`)
  const recordKeys = [...backing.tables.get('records').keys()].filter((key) => key.startsWith('saudio_'))
  assert.equal(recordKeys.length, 1, 'one record per source fingerprint')
  const stored = backing.tables.get('records').get(recordKeys[0])
  assert.equal(stored.kind, 'sentenceAudioTake')
  assert.equal(stored.payload.fingerprint, `${ids.passage}|p1.s1|1|1`)
  assert.equal(stored.payload.takes.length, 1)
  assert.equal(stored.payload.selectedTakeId, value.take.takeId)
  assert.equal(stored.payload.takes[0].audioBase64, asset.base64, 'the bytes live in the record')
})

test('a cached take is played without synthesizing again, and regenerate appends', async () => {
  // Each answer carries different bytes, so two takes are two distinct assets.
  const stub = fetchStub((url, init, call) => jsonResponse(ttsPayload({ fill: call })))
  const { controller } = await openAudio({ fetchImpl: stub.impl })

  const first = await controller.synthesizeSentenceAudioRemote(sentenceRequest(), signal())
  assert.equal(first.kind, 'ready')
  assert.equal(stub.calls.length, 1)

  // The reader opens the same sentence again: the stored take is the answer.
  const cached = await controller.synthesizeSentenceAudioRemote(sentenceRequest(), signal())
  assert.equal(cached.kind, 'cached')
  assert.equal(cached.take.takeId, first.take.takeId)
  assert.equal(stub.calls.length, 1, 'a cache hit never reaches the provider')

  // Regenerating is a separate action: a new version, and the old one survives.
  const regenerate = await controller.synthesizeSentenceAudioRemote(
    sentenceRequest({ action: 'regenerate', previousTakeId: first.take.takeId }), signal())
  assert.equal(regenerate.kind, 'ready')
  assert.equal(stub.calls.length, 2)
  assert.notEqual(regenerate.take.takeId, first.take.takeId)
  assert.equal(regenerate.take.previousTakeId, first.take.takeId)

  const listed = await listOf(controller)
  assert.equal(listed.takes.length, 2)
  assert.equal(listed.selectedTakeId, regenerate.take.takeId)
  assert.equal(listed.takes.some((take) => take.takeId === first.take.takeId), true,
    'the earlier take is still versioned, never overwritten')

  const old = await controller.readSentenceAudioAssetRemote(
    { source: sentenceSource(), takeId: first.take.takeId }, signal())
  const fresh = await controller.readSentenceAudioAssetRemote(
    { source: sentenceSource(), takeId: regenerate.take.takeId }, signal())
  assert.equal(old.base64.length > 0, true)
  assert.notEqual(old.base64, fresh.base64, 'two regenerations are two distinct assets')

  // Selecting the older take is a deliberate act, and it works.
  const selected = await controller.selectSentenceAudioRemote(
    { source: sentenceSource(), takeId: first.take.takeId }, signal())
  assert.equal(selected.kind, 'selected')
  const again = await controller.selectSentenceAudioRemote(
    { source: sentenceSource(), takeId: first.take.takeId }, signal())
  assert.equal(again.kind, 'already-selected')
  const relisted = await listOf(controller)
  assert.equal(relisted.selectedTakeId, first.take.takeId)
  assert.equal(relisted.takes.find((take) => take.takeId === first.take.takeId).selected, true)
})

/* ----------------------------------------------------------------- revision --- */

test('a changed source revision makes the old takes unusable', async () => {
  const stub = fetchStub(() => jsonResponse(ttsPayload()))
  const { controller } = await openAudio({ fetchImpl: stub.impl })
  const first = await controller.synthesizeSentenceAudioRemote(sentenceRequest(), signal())

  // A corroborated correction bumps the source revision.
  const revised = await controller.reviseSource({
    passageId: ids.passage,
    operationId: globalThis.crypto.randomUUID(),
    expectedSourceRevision: 1,
    sourceText: `${SENTENCE}\n\nEncore une phrase.`,
    note: null,
  }, signal())
  assert.equal(revised.revised, true)
  assert.equal(revised.sourceRevision, 2)
  await controller.getSegmentation({ passageId: ids.passage }, signal())

  const atRevisionTwo = sentenceSource({ sourceRevision: 2 })
  const afterRevision = await listOf(controller, atRevisionTwo)
  assert.deepEqual(afterRevision.takes, [], 'audio of an earlier revision is not offered as current')
  assert.equal(afterRevision.selectedTakeId, null)

  // The old take is still readable where it belongs: it was not deleted.
  const stillThere = await listOf(controller)
  assert.equal(stillThere.takes.length, 1)

  // And it cannot be selected as the current revision's audio.
  const crossed = await controller.selectSentenceAudioRemote(
    { source: atRevisionTwo, takeId: first.take.takeId }, signal())
  assert.equal(crossed.kind, 'conflict')
  assert.equal(crossed.reason, 'unknown-source')

  // The corrected source is synthesized as its own version rather than reused.
  const fresh = await controller.synthesizeSentenceAudioRemote(
    sentenceRequest({ source: atRevisionTwo }), signal())
  assert.equal(fresh.kind, 'ready')
  assert.equal(stub.calls.length, 2)
})

/* -------------------------------------------------------------- idempotency --- */

test('the same requestId never queues or stores a second piece of work', async () => {
  const stub = fetchStub(() => jsonResponse(ttsPayload()))
  const { controller } = await openAudio({ fetchImpl: stub.impl })
  const requestId = globalThis.crypto.randomUUID()
  const request = sentenceRequest({ requestId, action: 'regenerate' })

  const first = await controller.synthesizeSentenceAudioRemote(request, signal())
  assert.equal(first.kind, 'ready')
  const replay = await controller.synthesizeSentenceAudioRemote(request, signal())
  assert.equal(replay.kind, 'replayed')
  assert.equal(replay.take.takeId, first.take.takeId)
  assert.equal(stub.calls.length, 1, 'a retried request id is answered, not repeated')
  assert.equal((await listOf(controller)).takes.length, 1)

  // Two calls in flight with one requestId: the second reports the first.
  let release = () => {}
  const gate = new Promise((resolve) => { release = resolve })
  const slow = fetchStub(async () => {
    await gate
    return jsonResponse(ttsPayload())
  })
  const opened = await openAudio({ fetchImpl: slow.impl })
  const inFlight = sentenceRequest({ action: 'regenerate' })
  const running = opened.controller.synthesizeSentenceAudioRemote(inFlight, signal())
  await Promise.resolve()
  const concurrent = await opened.controller.synthesizeSentenceAudioRemote(inFlight, signal())
  assert.equal(concurrent.kind, 'generating')
  assert.equal(concurrent.requestId, inFlight.requestId)
  release()
  const settled = await running
  assert.equal(settled.kind, 'ready')
  assert.equal(slow.calls.length, 1, 'the duplicate never opened a second request')
})

/* -------------------------------------------------------------- cancellation --- */

test('an aborted request is cancelled and stores nothing', async () => {
  const hanging = hangingFetch()
  const { controller } = await openAudio({ fetchImpl: hanging.impl })
  const abort = new AbortController()
  const pending = controller.synthesizeSentenceAudioRemote(sentenceRequest(), abort.signal)
  assert.equal(await until(() => hanging.calls.length > 0), true, 'the provider request really started')
  abort.abort()
  const value = await pending
  assert.equal(value.kind, 'cancelled')
  assert.equal(hanging.calls.length, 1)
  assert.equal(hanging.calls[0].init.signal.aborted, true, 'the provider request was aborted too')
  const listed = await listOf(controller)
  assert.deepEqual(listed.takes, [], 'a cancelled synthesis produces no take')
  assert.equal(listed.selectedTakeId, null)

  const timeout = hangingFetch()
  const slow = await openAudio({ fetchImpl: timeout.impl, config: { apiKey: KEY, backend: 'tts', timeoutMs: 1_000 } })
  const timedOut = await slow.controller.synthesizeSentenceAudioRemote(sentenceRequest(), signal())
  assert.equal(timedOut.kind, 'failed')
  assert.equal(timedOut.reason, 'timeout')
  assert.deepEqual((await listOf(slow.controller)).takes, [])
})

/* ------------------------------------------------------------ unconfigured --- */

test('an unconfigured host refuses before any request exists', async () => {
  const stub = fetchStub(() => jsonResponse(ttsPayload()))
  const { controller } = await openAudio({ fetchImpl: stub.impl, config: {} })
  const value = await controller.synthesizeSentenceAudioRemote(sentenceRequest(), signal())
  assert.equal(value.kind, 'unconfigured')
  assert.equal(value.reason, 'no-api-key')
  assert.equal(stub.calls.length, 0, 'nothing was requested')

  const listed = await listOf(controller)
  assert.equal(listed.configuration.configured, false)
  assert.equal(listed.configuration.reason, 'no-api-key')
  assert.equal(listed.configuration.backend, null)
  assert.equal(listed.configuration.streaming, false)
  assert.deepEqual(listed.takes, [], 'unconfigured never claims a take is ready')

  // The environment is the documented fallback, and only a fallback.
  const fromEnv = await openAudio({
    fetchImpl: stub.impl, config: { backend: 'tts' }, env: { GEMINI_API_KEY: KEY },
  })
  const generated = await fromEnv.controller.synthesizeSentenceAudioRemote(sentenceRequest(), signal())
  assert.equal(generated.kind, 'ready')

  const disabled = await openAudio({ fetchImpl: stub.impl, config: { apiKey: KEY, enabled: false } })
  const off = await disabled.controller.synthesizeSentenceAudioRemote(sentenceRequest(), signal())
  assert.equal(off.kind, 'unconfigured')
  assert.equal(off.reason, 'disabled')

  const broken = await openAudio({ fetchImpl: stub.impl, config: { apiKey: KEY, backend: 'not-a-backend' } })
  const invalid = await broken.controller.synthesizeSentenceAudioRemote(sentenceRequest(), signal())
  assert.equal(invalid.kind, 'unconfigured')
  assert.equal(invalid.reason, 'invalid-config')
  assert.equal(stub.calls.length, 1, 'only the configured host ever reached the provider')
})

test('a host without a socket reports the live backend as not configured here', () => {
  // No transport is not a provider failure: nothing was ever requested.
  const withoutSocket = resolveAudioConfiguration(
    { apiKey: KEY, backend: 'live' }, { env: {}, webSocketAvailable: false })
  assert.equal(withoutSocket.state, 'unconfigured')
  assert.equal(withoutSocket.reason, 'transport-unavailable')
  const withoutKey = resolveAudioConfiguration({ backend: 'tts' }, { env: {} })
  assert.equal(withoutKey.reason, 'no-api-key')
  const fromEnv = resolveAudioConfiguration({ backend: 'tts' }, { env: { GEMINI_API_KEY: KEY } })
  assert.equal(fromEnv.state, 'configured')
  assert.equal(fromEnv.apiKey, KEY)
  assert.equal(fromEnv.backend.modelId, 'gemini-2.5-flash-preview-tts')
  // A malformed section is its own reason, never a silent fall back to defaults.
  const malformed = resolveAudioConfiguration({ timeoutMs: -1 }, { env: { GEMINI_API_KEY: KEY } })
  assert.equal(malformed.state, 'unconfigured')
  assert.equal(malformed.reason, 'invalid-config')
})

/* ------------------------------------------------------------ the boundary --- */

test('a paragraph, a stray sentence or a second sentence is refused before dispatch', async () => {
  const stub = fetchStub(() => jsonResponse(ttsPayload()))
  const { controller } = await openAudio({ fetchImpl: stub.impl })

  // The paragraph's own text is not this sentence: no request exists for it.
  const paragraph = await controller.synthesizeSentenceAudioRemote(
    sentenceRequest({ source: sentenceSource({ text: PARAGRAPH_TEXT }) }), signal())
  assert.equal(paragraph.kind, 'rejected')
  assert.equal(paragraph.reason, 'source-mismatch')
  assert.equal(stub.calls.length, 0)

  const unknownSentence = await controller.synthesizeSentenceAudioRemote(
    sentenceRequest({ source: sentenceSource({ sentenceId: 'p9.s9' }) }), signal())
  assert.equal(unknownSentence.kind, 'rejected')
  assert.equal(unknownSentence.reason, 'source-unknown')

  const unknownPassage = await controller.synthesizeSentenceAudioRemote(
    sentenceRequest({ source: sentenceSource({ passageId: '00000000-0000-4000-8000-0000000000ff' }) }), signal())
  assert.equal(unknownPassage.kind, 'rejected')
  assert.equal(unknownPassage.reason, 'source-unknown')

  const wrongRevision = await controller.synthesizeSentenceAudioRemote(
    sentenceRequest({ source: sentenceSource({ sentenceRevision: 7 }) }), signal())
  assert.equal(wrongRevision.kind, 'rejected')
  assert.equal(wrongRevision.reason, 'revision-mismatch')

  // With no stored segmentation for this source revision there is no evidence to
  // compare against, so the text check itself is what refuses a second sentence,
  // a blank and an over-long source — still without any request.
  const noEvidence = { sourceRevision: 3 }
  const multi = await controller.synthesizeSentenceAudioRemote(
    sentenceRequest({ source: sentenceSource({ ...noEvidence, text: 'Il part. Elle arrive.' }) }), signal())
  assert.equal(multi.kind, 'rejected')
  assert.equal(multi.reason, 'multi-sentence')

  const blank = await controller.synthesizeSentenceAudioRemote(
    sentenceRequest({ source: sentenceSource({ ...noEvidence, text: '   ' }) }), signal())
  assert.equal(blank.kind, 'rejected')
  assert.equal(blank.reason, 'blank')

  const tooLong = await openAudio({ fetchImpl: stub.impl, config: { apiKey: KEY, backend: 'tts', maxCharacters: 10 } })
  const long = await tooLong.controller.synthesizeSentenceAudioRemote(sentenceRequest(), signal())
  assert.equal(long.kind, 'rejected')
  assert.equal(long.reason, 'too-long')

  assert.equal(stub.calls.length, 0, 'no refused request ever reached a provider')
})

/* --------------------------------------------------------------- ordering --- */

test('a late take is appended but never preempts a newer request', async () => {
  const gates = []
  const stub = fetchStub(async () => {
    await new Promise((resolve) => gates.push(resolve))
    return jsonResponse(ttsPayload())
  })
  const { controller } = await openAudio({ fetchImpl: stub.impl })

  const firstRequest = sentenceRequest({ action: 'regenerate' })
  const secondRequest = sentenceRequest({ action: 'regenerate' })
  const first = controller.synthesizeSentenceAudioRemote(firstRequest, signal())
  const second = controller.synthesizeSentenceAudioRemote(secondRequest, signal())
  assert.equal(await until(() => gates.length === 2), true, 'both requests are in flight')

  // The newer request finishes first and becomes current.
  gates[1]()
  const settled = await Promise.race([
    second.then(() => 'second'),
    first.then(() => 'first'),
    new Promise((resolve) => setTimeout(() => resolve('none'), 50)),
  ])
  assert.equal(settled, 'second', 'the second call reached the provider second')
  const secondValue = await second
  assert.equal(secondValue.kind, 'ready')
  assert.equal(secondValue.take.selected, true)

  // The older one then lands: it is kept as a version, and does not take over.
  gates[0]()
  const firstValue = await first
  assert.equal(firstValue.kind, 'ready')
  assert.notEqual(firstValue.take.takeId, secondValue.take.takeId)
  assert.equal(firstValue.take.selected, false)

  const listed = await listOf(controller)
  assert.equal(listed.takes.length, 2)
  assert.equal(listed.selectedTakeId, secondValue.take.takeId,
    'the newer request keeps the current take')
})

/* ----------------------------------------------------------------- errors --- */

test('provider failures arrive classified and never as a lost answer', async () => {
  const cases = [
    [401, 'unauthorized'],
    [403, 'unauthorized'],
    [429, 'rate-limited'],
    [500, 'provider-error'],
  ]
  for (const [status, reason] of cases) {
    const stub = fetchStub(() => jsonResponse({ error: { message: 'nope' } }, status))
    const { controller } = await openAudio({ fetchImpl: stub.impl })
    const value = await controller.synthesizeSentenceAudioRemote(sentenceRequest(), signal())
    assert.equal(value.kind, 'failed', `HTTP ${String(status)} is a failure`)
    assert.equal(value.reason, reason)
    assert.equal(typeof value.message, 'string')
    assert.match(value.message, new RegExp(String(status), 'u'))
  }

  // An answer without audio is a provider error, not a silent empty take.
  const empty = fetchStub(() => jsonResponse({ candidates: [{ finishReason: 'STOP' }] }))
  const { controller } = await openAudio({ fetchImpl: empty.impl })
  const value = await controller.synthesizeSentenceAudioRemote(sentenceRequest(), signal())
  assert.equal(value.kind, 'failed')
  assert.equal(value.reason, 'provider-error')
  assert.match(value.message, /STOP/u)
})

/* ------------------------------------------------------------------- live --- */

test('the live backend streams over the socket and ignores frames that carry no audio', async () => {
  const server = liveServer({ chunks: 2, chunkBytes: 1200, noise: true })
  const { controller } = await openAudio({
    config: { apiKey: KEY, backend: 'live' },
    webSocket: server.factory,
  })

  const value = await controller.synthesizeSentenceAudioRemote(sentenceRequest(), signal())
  assert.equal(value.kind, 'ready')
  assert.equal(value.take.backend.kind, 'live')
  assert.equal(value.take.backend.modelId, 'gemini-3.8-live')
  assert.equal(value.take.bytes, 44 + 2400)
  assert.equal(value.take.durationMs, 50)

  assert.equal(server.sockets.length, 1)
  const socket = server.sockets[0]
  assert.match(socket.url, /BidiGenerateContent\?key=/u)
  const setup = socket.sent.find((frame) => frame.setup !== undefined)
  assert.equal(setup.setup.model, 'models/gemini-3.8-live')
  assert.deepEqual(setup.setup.generationConfig.responseModalities, ['AUDIO'])
  assert.equal(setup.setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Kore')
  const turn = socket.sent.find((frame) => frame.clientContent !== undefined)
  assert.deepEqual(turn.clientContent.turns, [{ role: 'user', parts: [{ text: SENTENCE }] }])
  assert.equal(turn.clientContent.turnComplete, true)
  assert.equal(socket.closed, true, 'the session is closed once the turn completes')
})

test('cancelling a live request closes the socket and stores nothing', async () => {
  const server = liveServer({ complete: false })
  const { controller } = await openAudio({
    config: { apiKey: KEY, backend: 'live' },
    webSocket: server.factory,
  })
  const abort = new AbortController()
  const pending = controller.synthesizeSentenceAudioRemote(sentenceRequest(), abort.signal)
  assert.equal(await until(() => server.sockets.length === 1), true, 'the socket was opened')
  abort.abort()
  const value = await pending
  assert.equal(value.kind, 'cancelled')
  assert.equal(server.sockets[0].closed, true, 'cancelling a live request closes the socket')
  assert.deepEqual((await listOf(controller)).takes, [])
})

/* ------------------------------------------------------------------ secret --- */

test('the key is read from config or the environment and never stored or returned', async () => {
  const stub = fetchStub(() => jsonResponse(ttsPayload()))
  const { controller, backing } = await openAudio({ fetchImpl: stub.impl })
  const value = await controller.synthesizeSentenceAudioRemote(sentenceRequest(), signal())
  assert.equal(value.kind, 'ready')
  const listed = await listOf(controller)
  assert.equal(JSON.stringify(listed).includes(KEY), false)
  assert.equal(JSON.stringify(value).includes(KEY), false)
  assert.equal(recordsJson(backing).includes(KEY), false, 'no stored record carries the key')
})
