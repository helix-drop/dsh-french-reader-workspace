import test from 'node:test'
import assert from 'node:assert/strict'

import { createBacking, ids, openController, passageRequest, signal } from './support/harness.mjs'
import {
  KEY,
  fetchStub,
  jsonResponse,
  noSocket,
  ttsPayload,
} from './support/audio-fakes.mjs'
import { FRENCH_READER_DOMAIN } from '../lib/domain.js'
import { checkUtterance } from '../lib/audio.js'

/**
 * Inflection audio, entirely offline.
 *
 * The contract keeps this surface separate from sentence speech — its own
 * fingerprint, its own selection, its own asset keys — and insists the utterance
 * is real French rather than IPA or slash-separated alternatives. Both are
 * checked here, and so is the one thing that must never happen: an utterance
 * that contradicts the written form, the person, or the language it claims.
 */
const source = (overrides = {}) => ({
  kind: 'inflection',
  formId: 'venir#ind.pre.1p',
  inflectionRevision: 1,
  lemma: 'venir',
  tense: 'ind.pre',
  formKind: 'finite',
  person: 4,
  form: 'venons',
  utterance: 'nous venons',
  language: 'fr',
  ...overrides,
})

const request = (overrides = {}) => ({
  requestId: globalThis.crypto.randomUUID(),
  action: 'generate',
  source: source(),
  previousTakeId: null,
  versionPolicy: 'append',
  voice: null,
  ...overrides,
})

async function openAudio({ config = { apiKey: KEY, backend: 'tts' }, fetchImpl } = {}) {
  const backing = createBacking()
  const opened = await openController(backing, FRENCH_READER_DOMAIN, {
    audio: { config, fetch: fetchImpl, webSocket: noSocket, env: {} },
  })
  return { ...opened, backing }
}

const listOf = (controller, wanted = source()) =>
  controller.listInflectionAudioRemote({ source: wanted }, signal())

test('an utterance must be real French, not a transcription or an alternative', () => {
  assert.deepEqual(checkUtterance('nous venons', 400), { ok: true, text: 'nous venons' })
  assert.deepEqual(checkUtterance('il est venu', 400), { ok: true, text: 'il est venu' })
  assert.equal(checkUtterance('', 400).reason, 'blank')
  assert.equal(checkUtterance('/və.nɔ̃/', 400).reason, 'not-french')
  assert.equal(checkUtterance('venons / venez', 400).reason, 'not-french')
  assert.equal(checkUtterance('və.nɔ̃', 400).reason, 'not-french')
  assert.equal(checkUtterance('venons | venez', 400).reason, 'not-french')
  assert.equal(checkUtterance('nous venons', 4).reason, 'too-long')
  assert.equal(checkUtterance('Viens. Puis parle.', 400).reason, 'multi-sentence')
})

test('one form becomes one take, keyed by the form and its revision', async () => {
  const stub = fetchStub(() => jsonResponse(ttsPayload()))
  const { controller, backing } = await openAudio({ fetchImpl: stub.impl })

  const value = await controller.synthesizeInflectionAudioRemote(request(), signal())
  assert.equal(value.kind, 'ready')
  assert.equal(value.take.selected, true)
  assert.equal(value.take.mimeType, 'audio/wav')
  assert.equal(value.take.bytes, 2444)
  assert.equal(value.take.durationMs, 50)
  assert.equal(value.take.source.formId, 'venir#ind.pre.1p')
  assert.equal(value.take.source.inflectionRevision, 1)
  assert.equal(value.take.source.person, 4)
  assert.equal(stub.calls.length, 1)

  // The provider is asked for the utterance and nothing else.
  const body = JSON.parse(stub.calls[0].init.body)
  assert.deepEqual(body.contents, [{ role: 'user', parts: [{ text: 'nous venons' }] }])

  const listed = await listOf(controller)
  assert.equal(listed.takes.length, 1)
  assert.equal(listed.selectedTakeId, value.take.takeId)
  assert.equal(listed.sourceKey, 'venir#ind.pre.1p|1')
  const recordKeys = [...backing.tables.get('records').keys()].filter((key) => key.startsWith('iaudio_'))
  assert.equal(recordKeys.length, 1, 'a form has its own record namespace')

  const asset = await controller.readInflectionAudioAssetRemote(
    { source: source(), takeId: value.take.takeId }, signal())
  assert.equal(asset.kind, 'found')
  assert.equal(Buffer.from(asset.base64, 'base64').slice(0, 4).toString('ascii'), 'RIFF')
})

test('an utterance that is not this form, or contradicts its person, is refused', async () => {
  const stub = fetchStub(() => jsonResponse(ttsPayload()))
  const { controller } = await openAudio({ fetchImpl: stub.impl })

  // The reading text does not contain the form at all.
  const wrongForm = await controller.synthesizeInflectionAudioRemote(
    request({ source: source({ utterance: 'nous marchons' }) }), signal())
  assert.equal(wrongForm.kind, 'rejected')
  assert.equal(wrongForm.reason, 'source-mismatch')

  // IPA and slash-separated alternatives are not French to be spoken. Both gates
  // are true of the transcription — it is notation *and* it lacks the form — so
  // either reason is a correct refusal; what matters is that nothing was sent.
  const ipa = await controller.synthesizeInflectionAudioRemote(
    request({ source: source({ utterance: '/və.nɔ̃/' }) }), signal())
  assert.equal(ipa.kind, 'rejected')
  assert.ok(['source-mismatch', 'not-french'].includes(ipa.reason), ipa.reason)
  const slash = await controller.synthesizeInflectionAudioRemote(
    request({ source: source({ utterance: 'venons / venez' }) }), signal())
  assert.equal(slash.kind, 'rejected')
  assert.equal(slash.reason, 'not-french')

  // A plural person read with a singular subject contradicts the row.
  const contradictory = await controller.synthesizeInflectionAudioRemote(
    request({ source: source({ person: 6, form: 'viennent', utterance: 'il vient' }) }), signal())
  assert.equal(contradictory.kind, 'rejected')
  assert.equal(contradictory.reason, 'source-mismatch')

  assert.equal(stub.calls.length, 0, 'nothing refused was ever sent to a provider')

  // The same row with a matching pronoun is accepted, and so is an imperative
  // with no pronoun at all.
  const good = await controller.synthesizeInflectionAudioRemote(
    request({ source: source({ formId: 'venir#ind.pre.3p', person: 6, form: 'viennent', utterance: 'ils viennent' }) }), signal())
  assert.equal(good.kind, 'ready')
  const imperative = await controller.synthesizeInflectionAudioRemote(
    request({ source: source({ formId: 'venir#imp.pre.2s', person: null, form: 'viens', utterance: 'viens !' }) }), signal())
  assert.equal(imperative.kind, 'ready')
  assert.equal(stub.calls.length, 2)
})

test('a stored take of another reading is not a cache hit for this one', async () => {
  const stub = fetchStub(() => jsonResponse(ttsPayload()))
  const { controller } = await openAudio({ fetchImpl: stub.impl })

  // One form id, one revision — and then the reading itself changes. The stored
  // audio belongs to the earlier reading, so it is not offered as this one's.
  const first = await controller.synthesizeInflectionAudioRemote(request(), signal())
  assert.equal(first.kind, 'ready')
  const changed = await controller.synthesizeInflectionAudioRemote(
    request({ source: source({ form: 'viens', person: 2, utterance: 'tu viens' }) }), signal())
  assert.equal(changed.kind, 'ready')
  assert.notEqual(changed.take.takeId, first.take.takeId)
  assert.equal(stub.calls.length, 2)

  const listed = await listOf(controller)
  assert.equal(listed.takes.length, 2, 'both readings are kept under the form and revision')
  assert.equal(listed.takes.find((take) => take.takeId === changed.take.takeId).source.utterance, 'tu viens')

  // And the reading that really is stored is answered from the cache.
  const again = await controller.synthesizeInflectionAudioRemote(
    request({ source: source({ form: 'viens', person: 2, utterance: 'tu viens' }) }), signal())
  assert.equal(again.kind, 'cached')
  assert.equal(stub.calls.length, 2)
})

test('a cached form is played, and regenerate appends a new version', async () => {
  const stub = fetchStub((url, init, call) => jsonResponse(ttsPayload({ fill: call })))
  const { controller } = await openAudio({ fetchImpl: stub.impl })

  const first = await controller.synthesizeInflectionAudioRemote(request(), signal())
  assert.equal(first.kind, 'ready')
  const cached = await controller.synthesizeInflectionAudioRemote(request(), signal())
  assert.equal(cached.kind, 'cached')
  assert.equal(cached.take.takeId, first.take.takeId)
  assert.equal(stub.calls.length, 1)

  const regenerate = await controller.synthesizeInflectionAudioRemote(
    request({ action: 'regenerate', previousTakeId: first.take.takeId }), signal())
  assert.equal(regenerate.kind, 'ready')
  assert.equal(regenerate.take.previousTakeId, first.take.takeId)
  const listed = await listOf(controller)
  assert.equal(listed.takes.length, 2)
  assert.equal(listed.selectedTakeId, regenerate.take.takeId)

  const replay = await controller.synthesizeInflectionAudioRemote(
    request({ requestId: regenerate.take.requestId, action: 'regenerate' }), signal())
  assert.equal(replay.kind, 'replayed')
  assert.equal(replay.take.takeId, regenerate.take.takeId)
  assert.equal(stub.calls.length, 2, 'a retried request id is answered, not repeated')
})

test('a changed inflection revision makes the earlier take unusable', async () => {
  const stub = fetchStub(() => jsonResponse(ttsPayload()))
  const { controller } = await openAudio({ fetchImpl: stub.impl })
  const first = await controller.synthesizeInflectionAudioRemote(request(), signal())

  const revised = source({ inflectionRevision: 2, utterance: 'nous venons', form: 'venons' })
  const afterRevision = await listOf(controller, revised)
  assert.deepEqual(afterRevision.takes, [])
  assert.equal(afterRevision.selectedTakeId, null)

  const crossed = await controller.selectInflectionAudioRemote(
    { source: revised, takeId: first.take.takeId }, signal())
  assert.equal(crossed.kind, 'conflict')
  assert.equal(crossed.reason, 'unknown-source')

  // The earlier revision's take is still there: nothing was rewritten.
  assert.equal((await listOf(controller)).takes.length, 1)
})

test('sentence audio and inflection audio share no key and no selection', async () => {
  const stub = fetchStub(() => jsonResponse(ttsPayload()))
  const backing = createBacking()
  const opened = await openController(backing, FRENCH_READER_DOMAIN, {
    audio: { config: { apiKey: KEY, backend: 'tts' }, fetch: stub.impl, webSocket: noSocket, env: {} },
  })
  await opened.controller.createPassage(passageRequest, signal())
  await opened.controller.getSegmentation({ passageId: ids.passage }, signal())

  const sentence = await opened.controller.synthesizeSentenceAudioRemote({
    requestId: globalThis.crypto.randomUUID(),
    action: 'generate',
    source: {
      passageId: ids.passage,
      sentenceId: 'p1.s1',
      sourceRevision: 1,
      sentenceRevision: 1,
      text: 'Il faut cultiver notre jardin.',
      language: 'fr',
    },
    previousTakeId: null,
    versionPolicy: 'append',
    voice: null,
  }, signal())
  const form = await opened.controller.synthesizeInflectionAudioRemote(request(), signal())
  assert.equal(sentence.kind, 'ready')
  assert.equal(form.kind, 'ready')

  const keys = [...backing.tables.get('records').keys()].filter((key) => /audio_/u.test(key))
  assert.equal(keys.length, 2)
  assert.equal(keys.filter((key) => key.startsWith('saudio_')).length, 1)
  assert.equal(keys.filter((key) => key.startsWith('iaudio_')).length, 1)

  // Selecting the form's audio leaves the sentence's current take alone.
  const formAgain = await opened.controller.synthesizeInflectionAudioRemote(
    request({ action: 'regenerate' }), signal())
  const sentenceList = await opened.controller.listSentenceAudioRemote({
    source: {
      passageId: ids.passage,
      sentenceId: 'p1.s1',
      sourceRevision: 1,
      sentenceRevision: 1,
      text: 'Il faut cultiver notre jardin.',
      language: 'fr',
    },
  }, signal())
  assert.equal(sentenceList.selectedTakeId, sentence.take.takeId)
  assert.equal(sentenceList.takes.length, 1)
  assert.equal(formAgain.take.selected, true)
})

test('an unconfigured host produces no form audio either', async () => {
  const stub = fetchStub(() => jsonResponse(ttsPayload()))
  const { controller } = await openAudio({ config: {}, fetchImpl: stub.impl })
  const value = await controller.synthesizeInflectionAudioRemote(request(), signal())
  assert.equal(value.kind, 'unconfigured')
  assert.equal(value.reason, 'no-api-key')
  assert.equal(stub.calls.length, 0)
  const listed = await listOf(controller)
  assert.equal(listed.configuration.configured, false)
  assert.deepEqual(listed.takes, [])
})
