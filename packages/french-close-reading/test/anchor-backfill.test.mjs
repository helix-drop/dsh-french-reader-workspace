import test from 'node:test'
import assert from 'node:assert/strict'

import { createBacking, ids, openController, passageRequest, signal } from './support/harness.mjs'
import { FRENCH_READER_DOMAIN, analysisKey } from '../lib/domain.js'

const ANCHOR = 'p1.s1'

/** Records exactly as an older build wrote them: no span, no author, no note. */
function legacyAnalysis() {
  const now = '2026-10-06T09:55:30.467Z'
  return {
    kind: 'analysis', recordVersion: 1,
    payload: {
      passageId: ids.passage,
      translations: [{
        id: '00000000-0000-4000-8000-0000000000c1', anchorId: ANCHOR, language: 'zh-Hans',
        text: '必须耕种我们自己的园地。', createdAt: now, operationId: '00000000-0000-4000-8000-0000000000c2',
      }],
      branches: [{
        id: '00000000-0000-4000-8000-0000000000d1', parentId: null, anchorId: 'p1',
        kind: 'constituents', title: '主干', body: 'Il faut + infinitif。', createdAt: now,
        operationId: '00000000-0000-4000-8000-0000000000d2',
      }],
    },
  }
}

function legacyPassage() {
  const now = '2026-10-06T09:55:30.467Z'
  return {
    kind: 'passage', recordVersion: 1,
    payload: {
      id: ids.passage, operationId: '00000000-0000-4000-8000-0000000000b1',
      title: passageRequest.title, sourceText: passageRequest.sourceText, sourceRevision: 1,
      segmentationRevision: 1, status: 'source-only', createdAt: now, updatedAt: now,
      archivedAt: null, archiveOperationId: null,
    },
  }
}

async function withLegacyPassage() {
  const backing = createBacking()
  backing.tables.set('records', new Map([
    [ids.passage, legacyPassage()],
    [analysisKey(ids.passage), legacyAnalysis()],
  ]))
  const opened = await openController(backing, FRENCH_READER_DOMAIN)
  return { backing, ...opened }
}

test('a span-less note is trusted while the source never moved', async () => {
  const { controller } = await withLegacyPassage()
  const value = await controller.listAnalysis({ passageId: ids.passage }, signal())
  for (const entry of [...value.analysis.translations, ...value.analysis.branches]) {
    assert.equal(entry.anchor, null)
    assert.equal(entry.anchorStatus, 'resolved')
    assert.equal(entry.anchorReason, 'legacy-resolved')
    assert.equal(entry.currentAnchorId, entry.anchorId)
  }
})

test('after a revision a span-less note is unresolved, never silently re-attached', async () => {
  const { controller } = await withLegacyPassage()
  await controller.reviseSource({
    passageId: ids.passage,
    operationId: '00000000-0000-4000-8000-0000000000e1',
    expectedSourceRevision: 1,
    sourceText: 'Phrase ajoutée devant.\n\nIl faut cultiver notre jardin.',
    note: 'prepend',
  }, signal())

  const value = await controller.listAnalysis({ passageId: ids.passage }, signal())
  const translation = value.analysis.translations[0]
  // `p1.s1` still exists — it now names different text. Reporting "resolved"
  // here is exactly the silent mis-attachment the plan forbids.
  assert.equal(translation.anchorStatus, 'unresolved')
  assert.equal(translation.anchorReason, 'legacy-stale')
  assert.equal(translation.currentAnchorId, null)
  assert.equal(translation.anchorId, ANCHOR, 'the original id is kept for the migration')
})

test('the explicit backfill derives spans from a named revision and then relocates', async () => {
  const { backing, controller } = await withLegacyPassage()
  await controller.reviseSource({
    passageId: ids.passage,
    operationId: '00000000-0000-4000-8000-0000000000e2',
    expectedSourceRevision: 1,
    sourceText: 'Phrase ajoutée devant.\n\nIl faut cultiver notre jardin.',
    note: 'prepend',
  }, signal())

  const unknown = await controller.backfillAnchors({ passageId: ids.passage, sourceRevision: 7 }, signal())
  assert.equal(unknown.backfilled, false)
  assert.equal(unknown.reason, 'revision-unknown')

  const migrated = await controller.backfillAnchors({ passageId: ids.passage, sourceRevision: 1 }, signal())
  assert.equal(migrated.backfilled, true)
  assert.equal(migrated.migrated, 2, 'both the translation and the branch gain a span')
  assert.deepEqual(migrated.skipped, [])

  const value = await controller.listAnalysis({ passageId: ids.passage }, signal())
  const translation = value.analysis.translations[0]
  assert.equal(translation.anchor.sourceRevision, 1, 'the span names the revision it was derived from')
  assert.equal(translation.anchor.excerpt, 'Il faut cultiver notre jardin.')
  assert.equal(translation.anchorStatus, 'relocated')
  assert.equal(translation.anchorReason, 'moved')
  assert.equal(translation.currentAnchorId, 'p2.s1', 'the text now lives in paragraph 2')
  assert.equal(translation.anchorId, ANCHOR, 'the stored id is left as it was')

  const branch = value.analysis.branches[0]
  assert.equal(branch.anchor.anchorId, 'p1', 'the paragraph anchor was migrated too')
  assert.equal(branch.anchorStatus, 'relocated')
  assert.equal(branch.currentAnchorId, 'p2', 'the paragraph moved as a whole')

  const again = await controller.backfillAnchors({ passageId: ids.passage, sourceRevision: 1 }, signal())
  assert.equal(again.migrated, 0, 'a second migration is a no-op')
  // One migration write for the whole analysis, not one per record.
  assert.equal(backing.writesFor(analysisKey(ids.passage)), 1)
})

test('the backfill reports anchors that do not exist in the named revision', async () => {
  const backing = createBacking()
  const records = new Map([
    [ids.passage, legacyPassage()],
    [analysisKey(ids.passage), legacyAnalysis()],
  ])
  const broken = records.get(analysisKey(ids.passage))
  broken.payload.branches[0].anchorId = 'p9.s9'
  backing.tables.set('records', records)
  const opened = await openController(backing, FRENCH_READER_DOMAIN)

  const result = await opened.controller.backfillAnchors({ passageId: ids.passage, sourceRevision: 1 }, signal())
  assert.equal(result.migrated, 1, 'the translation still migrates')
  assert.deepEqual(result.skipped, [{ id: '00000000-0000-4000-8000-0000000000d1', anchorId: 'p9.s9' }])
  assert.equal(result.skipped[0].anchorId, 'p9.s9', 'nothing was invented for it')
})
