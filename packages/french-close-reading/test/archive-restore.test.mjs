import test from 'node:test'
import assert from 'node:assert/strict'

import { createBacking, ids, openController, passageRequest, signal } from './support/harness.mjs'
import { FRENCH_READER_DOMAIN } from '../lib/domain.js'

const uuid = () => globalThis.crypto.randomUUID()

test('archived passages are listable and restore without changing their source or segmentation', async () => {
  const backing = createBacking()
  const opened = await openController(backing, FRENCH_READER_DOMAIN)
  const { controller } = opened
  await controller.createPassage(passageRequest, signal())
  const beforeSegmentation = await controller.getSegmentation({ passageId: ids.passage }, signal())

  const archived = await controller.archivePassage({
    passageId: ids.passage,
    operationId: uuid(),
    expectedSourceRevision: 1,
  }, signal())
  assert.equal(archived.kind, 'archived')
  assert.equal((await controller.listPassages({ offset: 0, limit: 20 }, signal())).total, 0)

  const listed = await controller.listArchivedPassages({ offset: 0, limit: 20 }, signal())
  assert.equal(listed.total, 1)
  assert.equal(listed.items[0].id, ids.passage)
  assert.equal(listed.items[0].title, passageRequest.title)

  const stale = await controller.restorePassage({
    passageId: ids.passage, expectedSourceRevision: 2,
  }, signal())
  assert.deepEqual(stale, { kind: 'conflict', reason: 'revision-conflict' })

  const restored = await controller.restorePassage({
    passageId: ids.passage, expectedSourceRevision: 1,
  }, signal())
  assert.equal(restored.kind, 'restored')
  assert.equal((await controller.listPassages({ offset: 0, limit: 20 }, signal())).total, 1)
  assert.equal((await controller.listArchivedPassages({ offset: 0, limit: 20 }, signal())).total, 0)
  assert.deepEqual(await controller.getSegmentation({ passageId: ids.passage }, signal()), beforeSegmentation)
  assert.equal((await controller.getPassage({ id: ids.passage }, signal())).passage.sourceText, passageRequest.sourceText)
  await opened.domain.close()
})
