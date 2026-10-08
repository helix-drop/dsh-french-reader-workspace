import test from 'node:test'
import assert from 'node:assert/strict'

import { createBacking, ids, openController, passageRequest, signal } from './support/harness.mjs'
import { FRENCH_READER_DOMAIN, sourceKey } from '../lib/domain.js'

const ANCHOR = 'p1.s1'
const reviseOperation = '00000000-0000-4000-8000-0000000000a9'

async function withAnnotatedPassage() {
  const backing = createBacking()
  const opened = await openController(backing, FRENCH_READER_DOMAIN)
  await opened.controller.createPassage(passageRequest, signal())
  await opened.controller.getSegmentation({ passageId: ids.passage }, signal())
  const branch = await opened.controller.addBranch({
    passageId: ids.passage,
    operationId: '00000000-0000-4000-8000-0000000000b9',
    parentId: null,
    anchorId: ANCHOR,
    kind: 'constituents',
    title: '主干',
    body: 'Il faut (+ infinitif)。',
  }, signal())
  assert.equal(branch.kind, 'created')
  return { backing, ...opened, branchId: branch.branch.id }
}

test('a note records the span it is about, not just a sentence number', async () => {
  const { controller } = await withAnnotatedPassage()
  const analysis = await controller.listAnalysis({ passageId: ids.passage }, signal())
  const branch = analysis.analysis.branches[0]

  assert.notEqual(branch.anchor, null)
  assert.equal(branch.anchor.anchorId, ANCHOR)
  assert.equal(branch.anchor.sourceRevision, 1)
  assert.equal(branch.anchor.segmentationRevision, 1)
  assert.equal(branch.anchor.excerpt, 'Il faut cultiver notre jardin.')
  assert.equal(branch.anchorStatus, 'resolved')
  assert.equal(branch.currentAnchorId, ANCHOR)
})

test('correcting the source adds an immutable revision instead of overwriting it', async () => {
  const { backing, controller } = await withAnnotatedPassage()
  const result = await controller.reviseSource({
    passageId: ids.passage,
    operationId: reviseOperation,
    expectedSourceRevision: 1,
    sourceText: 'Il faut cultiver notre jardin.\n\n— Mais lequel ? — Le nôtre, dit-il.',
    note: '补上问答两句',
  }, signal())
  assert.equal(result.revised, true)
  assert.equal(result.sourceRevision, 2)

  // The revision-1 text is still readable, so an old note can show what it was
  // written about.
  const first = await controller.readSourceRevision(ids.passage, 1, signal())
  assert.equal(first.found, true)
  assert.equal(first.text, passageRequest.sourceText)

  const second = await controller.readSourceRevision(ids.passage, 2, signal())
  assert.equal(second.found, true)
  assert.match(second.text, /Mais lequel/u)

  // A revision-1 note still finds its sentence in the expanded source.
  const analysis = await controller.listAnalysis({ passageId: ids.passage }, signal())
  const branch = analysis.analysis.branches[0]
  assert.equal(branch.anchorStatus, 'resolved', 'the span still carries the excerpt it was written about')
  assert.equal(branch.anchor.sourceRevision, 1, 'the stored anchor keeps its original revision')

  // Retrying the same revision is idempotent; a stale expectation conflicts.
  const retry = await controller.reviseSource({
    passageId: ids.passage,
    operationId: reviseOperation,
    expectedSourceRevision: 1,
    sourceText: 'ignored',
    note: null,
  }, signal())
  assert.equal(retry.alreadyRevised, true)
  assert.equal(retry.sourceRevision, 2)

  const stale = await controller.reviseSource({
    passageId: ids.passage,
    operationId: '00000000-0000-4000-8000-0000000000aa',
    expectedSourceRevision: 1,
    sourceText: '再次修改',
    note: null,
  }, signal())
  assert.equal(stale.revised, false)
  assert.equal(stale.reason, 'revision-conflict')
  assert.equal(backing.tables.get('records').has(sourceKey(ids.passage, 3)), false)
})

test('a moved sentence is relocated; an ambiguous or vanished one stays unresolved', async () => {
  const { controller } = await withAnnotatedPassage()

  // The sentence survives, but a new paragraph now precedes it.
  await controller.reviseSource({
    passageId: ids.passage,
    operationId: '00000000-0000-4000-8000-0000000000ab',
    expectedSourceRevision: 1,
    sourceText: 'Préambule ajouté.\n\nIl faut cultiver notre jardin.',
    note: '在前面加一段',
  }, signal())

  const moved = await controller.listAnalysis({ passageId: ids.passage }, signal())
  const relocated = moved.analysis.branches[0]
  assert.equal(relocated.anchorStatus, 'relocated')
  assert.equal(relocated.currentAnchorId, 'p2.s1', 'the same sentence text is now paragraph 2')
  assert.equal(relocated.anchorId, ANCHOR, 'the stored anchor is left untouched')

  // Duplicating the sentence elsewhere leaves the annotated span itself intact,
  // so the note stays attached to the occurrence it was written about.
  await controller.reviseSource({
    passageId: ids.passage,
    operationId: '00000000-0000-4000-8000-0000000000ac',
    expectedSourceRevision: 2,
    sourceText: 'Préambule.\n\nIl faut cultiver notre jardin.\n\nIl faut cultiver notre jardin.',
    note: '重复该句',
  }, signal())
  const ambiguous = await controller.listAnalysis({ passageId: ids.passage }, signal())
  // Offsets shifted AND the excerpt now occurs twice: relocation is not
  // deterministic, so the note keeps its anchor and is reported unresolved.
  assert.equal(ambiguous.analysis.branches[0].anchorStatus, 'unresolved')
  assert.equal(ambiguous.analysis.branches[0].currentAnchorId, null)
  assert.equal(ambiguous.analysis.branches[0].anchorId, ANCHOR, 'never re-attached by guesswork')

  // And when the text is gone entirely.
  await controller.reviseSource({
    passageId: ids.passage,
    operationId: '00000000-0000-4000-8000-0000000000ad',
    expectedSourceRevision: 3,
    sourceText: 'Texte entièrement remplacé.',
    note: '替换全文',
  }, signal())
  const vanished = await controller.listAnalysis({ passageId: ids.passage }, signal())
  assert.equal(vanished.analysis.branches[0].anchorStatus, 'unresolved')
  assert.equal(vanished.analysis.branches[0].anchor.excerpt, 'Il faut cultiver notre jardin.')
})

test('a new revision gets its own segmentation and a legacy record still loads', async () => {
  const { backing, controller } = await withAnnotatedPassage()
  await controller.reviseSource({
    passageId: ids.passage,
    operationId: '00000000-0000-4000-8000-0000000000ae',
    expectedSourceRevision: 1,
    sourceText: 'Un. Deux.\n\nTrois.',
    note: null,
  }, signal())

  const value = await controller.getSegmentation({ passageId: ids.passage }, signal())
  assert.equal(value.segmentation.sourceRevision, 2)
  assert.deepEqual(value.segmentation.paragraphs.map((paragraph) => paragraph.id), ['p1', 'p2'])
  // Revision 1's segmentation is still on disk for resolving old notes.
  assert.equal(backing.tables.get('records').has(`segments_${ids.passage}_1`), true)
  assert.equal(backing.tables.get('records').has(`segments_${ids.passage}_2`), true)
})

test('records written before revisions existed still load and resolve', async () => {
  const backing = createBacking()
  const passageId = ids.passage
  const text = passageRequest.sourceText
  const now = '2026-10-06T09:55:30.467Z'
  // Exactly the shape the running Host already wrote: no anchor ref, literal
  // revisions, segmentation under the legacy key.
  backing.tables.set('records', new Map([
    [passageId, {
      kind: 'passage', recordVersion: 1,
      payload: {
        id: passageId, operationId: '00000000-0000-4000-8000-0000000000b1',
        title: passageRequest.title, sourceText: text, sourceRevision: 1, segmentationRevision: 1,
        status: 'source-only', createdAt: now, updatedAt: now,
        archivedAt: null, archiveOperationId: null,
      },
    }],
    [`segments_${passageId}`, {
      kind: 'segments', recordVersion: 1,
      payload: {
        passageId, sourceRevision: 1, revision: 1,
        paragraphs: [{
          id: 'p1', text: 'Il faut cultiver notre jardin.', start: 0, end: 30,
          sentences: [{ id: 'p1.s1', paragraphId: 'p1', text: 'Il faut cultiver notre jardin.', start: 0, end: 30 }],
        }],
      },
    }],
    [`analysis_${passageId}`, {
      kind: 'analysis', recordVersion: 1,
      payload: {
        passageId,
        translations: [{
          id: '00000000-0000-4000-8000-0000000000c1', anchorId: 'passage', language: 'zh-Hans',
          text: '必须耕种我们自己的园地。', createdAt: now, operationId: '00000000-0000-4000-8000-0000000000c2',
        }],
        branches: [{
          id: '00000000-0000-4000-8000-0000000000d1', parentId: null, anchorId: 'p1.s1',
          kind: 'constituents', title: '主干', body: 'Il faut + infinitif。', createdAt: now,
          operationId: '00000000-0000-4000-8000-0000000000d2',
        }],
      },
    }],
  ]))

  const opened = await openController(backing, FRENCH_READER_DOMAIN)
  const value = await opened.controller.listAnalysis({ passageId }, signal())
  assert.equal(value.analysis.translations.length, 1)
  assert.equal(value.analysis.branches.length, 1)
  const branch = value.analysis.branches[0]
  assert.equal(branch.anchor, null, 'a legacy record carries no span yet')
  assert.equal(branch.anchorStatus, 'resolved')
  assert.equal(branch.currentAnchorId, 'p1.s1')

  // Its segmentation is replayed from the legacy key instead of being rewritten.
  const segmentation = await opened.controller.getSegmentation({ passageId }, signal())
  assert.equal(segmentation.segmentation.sourceRevision, 1)
  assert.equal(backing.writesFor(`segments_${passageId}`), 0)
  await opened.domain.close()
})
