import test from 'node:test'
import assert from 'node:assert/strict'

import { createBacking, ids, openController, passageRequest, signal } from './support/harness.mjs'
import { KEY, fetchStub, liveServer, noSocket } from './support/audio-fakes.mjs'
import { FRENCH_READER_DOMAIN } from '../lib/domain.js'
import { decodeSocketFrame } from '../lib/audio.js'

/**
 * How a live frame reaches the adapter.
 *
 * The real `bidiGenerateContent` endpoint sends JSON inside **Blob** frames, not
 * strings. A decoder that only accepted strings dropped every frame of a working
 * session: the socket opened, the setup was accepted, and the request sat until
 * it timed out — a failure the scripted socket could not show while it kept
 * emitting strings. These tests pin all three encodings.
 */
const SENTENCE = 'Il faut cultiver notre jardin.'

test('the frame decoder accepts every encoding a real socket uses', async () => {
  const raw = '{"setupComplete":{}}'
  assert.equal(await decodeSocketFrame(raw), raw, 'a string frame passes through')
  assert.equal(
    await decodeSocketFrame(new TextEncoder().encode(raw).buffer), raw,
    'an ArrayBuffer frame (binaryType=arraybuffer) decodes',
  )
  assert.equal(await decodeSocketFrame(new TextEncoder().encode(raw)), raw, 'a typed-array view decodes')
  assert.equal(await decodeSocketFrame({ text: async () => raw }), raw, 'a Blob frame decodes')
  assert.equal(await decodeSocketFrame(null), '', 'an unknown frame is empty, never a crash')
  assert.equal(await decodeSocketFrame({}), '', 'and so is an object with no reader')
})

for (const frameEncoding of ['string', 'blob', 'arraybuffer']) {
  test(`a live session completes when frames arrive as ${frameEncoding}`, async () => {
    const server = liveServer({ frameEncoding })
    const backing = createBacking()
    const opened = await openController(backing, FRENCH_READER_DOMAIN, {
      audio: {
        config: { enabled: true, backend: 'live', apiKey: KEY },
        fetch: fetchStub({}), webSocket: server.factory, env: {},
      },
    })
    await opened.controller.createPassage(passageRequest, signal())
    await opened.controller.getSegmentation({ passageId: ids.passage }, signal())
    const value = await opened.controller.synthesizeSentenceAudioRemote({
      requestId: globalThis.crypto.randomUUID(),
      action: 'generate',
      source: {
        passageId: ids.passage, sentenceId: 'p1.s1', sourceRevision: 1, sentenceRevision: 1,
        text: SENTENCE, language: 'fr',
      },
      previousTakeId: null,
      versionPolicy: 'append',
      voice: null,
    }, signal())
    assert.equal(value.kind, 'ready', `${frameEncoding} frames are read, not dropped`)
    assert.equal(value.take.mimeType, 'audio/wav')
    assert.ok(value.take.bytes > 0, 'audio reached the take')
  })
}
