import test from 'node:test'
import assert from 'node:assert/strict'

import { createBacking, ids, openController, passageRequest, signal } from './support/harness.mjs'
import { FRENCH_READER_DOMAIN } from '../lib/domain.js'

/**
 * The two endpoints the reading surface needs and the tool layer already had:
 * exact-Mot lookup, and adopting a translation variant.
 *
 * The controller methods are covered elsewhere; what is tested here is the **wire**:
 * a malformed request is refused before the method runs, and a valid one returns what
 * the method returns — so the panel and the agent tool cannot drift apart.
 */
const uuid = () => globalThis.crypto.randomUUID()

async function withPassage() {
  const backing = createBacking()
  const opened = await openController(backing, FRENCH_READER_DOMAIN)
  await opened.controller.createPassage(passageRequest, signal())
  return { backing, ...opened }
}

/** The refusal code a Remote raises for a request its schema rejects. */
const refusedBadly = (error) => error?.code === 'gateway/bad-request'

test('lookupMot serves the stored entry for an exact Mot', async () => {
  const { controller } = await withPassage()
  const created = await controller.createLexiconEntry({
    mot: 'jardin', partOfSpeech: '名词', lemma: 'jardin', forms: ['jardin', 'jardins'],
    definition: '花园', label: '园地', provenance: 'user', operationId: uuid(),
  }, signal())
  assert.equal(created.created, true)

  const found = await controller.lookupMotRemote({ mot: 'jardin', partOfSpeech: null }, signal())
  assert.equal(found.found, true, 'an exact Mot is a hit')
  assert.equal(found.entries.length, 1)
  assert.equal(found.entries[0].mot, 'jardin')
  assert.equal(found.motKey, 'jardin')

  // A declared inflected form is related to the entry, never the Mot itself: it appears
  // as a candidate and `found` stays false, so nothing is silently merged.
  const miss = await controller.lookupMotRemote({ mot: 'jardins', partOfSpeech: null }, signal())
  assert.equal(miss.found, false)
  assert.equal(miss.entries.length, 0)
  assert.deepEqual(miss.candidates.map((entry) => entry.mot), ['jardin'])

  // A part-of-speech hint narrows the answer; it never turns a miss into a hit.
  const hinted = await controller.lookupMotRemote({ mot: 'jardins', partOfSpeech: '动词' }, signal())
  assert.equal(hinted.found, false)
  assert.deepEqual(hinted.candidates, [])
})

test('lookupMot refuses a request its schema rejects, before any lookup runs', async () => {
  const { controller } = await withPassage()
  for (const request of [
    { mot: '', partOfSpeech: null },
    { mot: '   ', partOfSpeech: null },
    { mot: 'jardin' },
    { mot: 'jardin', partOfSpeech: null, extra: 1 },
  ]) {
    await assert.rejects(
      () => controller.lookupMotRemote(request, signal()),
      refusedBadly,
      `refused: ${JSON.stringify(request)}`,
    )
  }
})

test('adoptTranslation moves the pointer and is idempotent on the wire', async () => {
  const { controller } = await withPassage()
  const first = await controller.saveTranslation({
    passageId: ids.passage, operationId: uuid(), anchorId: 'p1.s1',
    source: 'user', note: '', language: 'zh-Hans', text: '我们必须耕种我们的园地。',
  }, signal())
  const second = await controller.saveTranslation({
    passageId: ids.passage, operationId: uuid(), anchorId: 'p1.s1',
    source: 'ai', note: '更直译', language: 'zh-Hans', text: '应当耕种我们的园子。',
  }, signal())

  const adopted = await controller.adoptTranslationRemote({
    passageId: ids.passage, anchorId: 'p1.s1', translationId: second.translation.id,
    operationId: uuid(),
  }, signal())
  assert.equal(adopted.adopted, true)
  // `previousId` names the variant this adoption *replaced*. Nothing was adopted for
  // this anchor before, so it is null — the field reports adoptions, not the mere
  // existence of other variants.
  assert.equal(adopted.previousId, null)

  // Adopting the same variant again is a no-op.
  const again = await controller.adoptTranslationRemote({
    passageId: ids.passage, anchorId: 'p1.s1', translationId: second.translation.id,
    operationId: uuid(),
  }, signal())
  assert.equal(again.adopted, false)
  assert.equal(again.alreadyAdopted, true)

  // Switching to the other variant reports what it replaced.
  const switched = await controller.adoptTranslationRemote({
    passageId: ids.passage, anchorId: 'p1.s1', translationId: first.translation.id,
    operationId: uuid(),
  }, signal())
  assert.equal(switched.adopted, true)
  assert.equal(switched.previousId, second.translation.id, 'the replaced variant is reported, not lost')

  const analysis = await controller.listAnalysis({ passageId: ids.passage }, signal())
  assert.equal(analysis.analysis.translations.length, 2, 'adoption never deletes a variant')
  assert.equal(analysis.adoptions.length, 1, 'and one anchor records one current choice')
})

test('adoptTranslation refuses malformed requests and reports an unknown variant', async () => {
  const { controller } = await withPassage()
  await assert.rejects(
    () => controller.adoptTranslationRemote({
      passageId: 'not-a-uuid', anchorId: 'p1.s1', translationId: uuid(), operationId: uuid(),
    }, signal()),
    refusedBadly,
  )
  await assert.rejects(
    () => controller.adoptTranslationRemote({
      passageId: ids.passage, anchorId: 'not an anchor', translationId: uuid(), operationId: uuid(),
    }, signal()),
    refusedBadly,
  )

  // A well-formed request naming something that does not exist is a business answer,
  // not a crash: the caller is told which one was unknown.
  const unknown = await controller.adoptTranslationRemote({
    passageId: ids.passage, anchorId: 'p1.s1', translationId: uuid(), operationId: uuid(),
  }, signal())
  assert.equal(unknown.adopted, false)
  assert.equal(unknown.reason, 'translation-unknown')
})
