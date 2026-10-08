import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

import { sha256Hex, utf8Bytes } from '../lib/digest.js'

/**
 * The context fingerprint is only worth anything if the digest underneath it is
 * correct, and "looks like 64 hex characters" is not correctness. These tests
 * check the published vectors and then compare the implementation against Node's
 * own SHA-256 for generated content, including the multi-byte and astral cases a
 * French reading tool actually stores.
 */
const nodeSha = (text) => createHash('sha256').update(text, 'utf8').digest('hex')

test('the published SHA-256 vectors match', () => {
  assert.equal(
    sha256Hex(''),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  )
  assert.equal(
    sha256Hex('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  )
  assert.equal(
    sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
    '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
  )
  // Exactly one block, then one byte more: the padding boundary.
  assert.equal(sha256Hex('a'.repeat(55)), nodeSha('a'.repeat(55)))
  assert.equal(sha256Hex('a'.repeat(56)), nodeSha('a'.repeat(56)))
  assert.equal(sha256Hex('a'.repeat(64)), nodeSha('a'.repeat(64)))
  assert.equal(sha256Hex('a'.repeat(1000)), nodeSha('a'.repeat(1000)))
})

test('multi-byte, astral and lone-surrogate text agrees with Node', () => {
  const cases = [
    'Le lecteur n’écarte pas une interprétation sans en avoir d’abord tracé les limites.',
    'àâäçéèêëîïôöùûüÿœæ — Œ Æ',
    '我们必须耕种我们的园地。',
    '👩‍🏫 é\u0301',          // an astral emoji with ZWJ, and a combining accent
    '\u00a0\u2028\u2029',   // no-break space, line and paragraph separators
    '\ud83d',               // a lone high surrogate
    '\udc00',               // a lone low surrogate
  ]
  for (const text of cases) {
    assert.equal(sha256Hex(text), nodeSha(text), `digest of ${JSON.stringify(text)}`)
  }

  // A same-length difference must change the digest: this is the property the
  // fingerprint's refusal of a stale preview rests on.
  assert.equal(utf8Bytes('é').length, 2)
  assert.notEqual(sha256Hex('AAAA'), sha256Hex('AAAB'))
})

test('generated content of every length agrees with Node', () => {
  let state = 0x2545f491
  const nextByte = () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    return state & 0xff
  }
  for (let round = 0; round < 120; round += 1) {
    const length = round * 7
    let text = ''
    for (let index = 0; index < length; index += 1) text += String.fromCharCode(32 + (nextByte() % 0x2000))
    assert.equal(sha256Hex(text), nodeSha(text), `digest of a generated ${String(length)}-character string`)
  }
})
