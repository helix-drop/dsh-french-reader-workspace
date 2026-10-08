import test from 'node:test'
import assert from 'node:assert/strict'

import { createBacking, ids, openController, passageRequest, signal } from './support/harness.mjs'
import { FRENCH_READER_DOMAIN, SAFE_RECORD_KEY_RE, analysisKey, segmentsKey, segmentsKeyFor } from '../lib/domain.js'

async function withPassage() {
  const backing = createBacking()
  const opened = await openController(backing, FRENCH_READER_DOMAIN)
  const created = await opened.controller.createPassage(passageRequest, signal())
  assert.equal(created.kind, 'created')
  return { backing, ...opened }
}

test('every record key is path-safe for the file-per-key backend', () => {
  const passageId = 'a8af1efd-c9ff-4a29-a0d1-c6cc5c065e23'
  for (const key of [passageId, segmentsKey(passageId), analysisKey(passageId)]) {
    // The JSON backend rejects a key outside this set at write time.
    assert.match(key, SAFE_RECORD_KEY_RE)
  }
  assert.equal(segmentsKey(passageId), `segments_${passageId}`)
  assert.equal(analysisKey(passageId), `analysis_${passageId}`)
})

test('segmentation is derived once, persisted under its own key, and replayed', async () => {
  const { backing, controller } = await withPassage()

  const first = await controller.getSegmentation({ passageId: ids.passage }, signal())
  assert.equal(first.segmentation.paragraphs.length, 2)
  assert.deepEqual(first.segmentation.paragraphs.map((p) => p.id), ['p1', 'p2'])
  assert.deepEqual(first.segmentation.paragraphs[1].sentences.map((s) => s.text), [
    '— Mais lequel ?',
    '— Le nôtre, dit-il.',
  ])
  assert.equal(first.segmentation.sourceRevision, 1)
  assert.equal(backing.writesFor(segmentsKeyFor(ids.passage, 1)), 1)

  const second = await controller.getSegmentation({ passageId: ids.passage }, signal())
  assert.deepEqual(second, first)
  assert.equal(backing.writesFor(segmentsKeyFor(ids.passage, 1)), 1, 'a stored segmentation is replayed, not rewritten')

  const missing = await controller.getSegmentation({ passageId: '00000000-0000-4000-8000-0000000000ff' }, signal())
  assert.equal(missing.segmentation, null)
})

test('translations are versioned per anchor and idempotent per operation id', async () => {
  const { backing, controller } = await withPassage()

  const saved = await controller.saveTranslation({
    passageId: ids.passage,
    operationId: ids.translation,
    anchorId: 'p1',
    language: 'zh-Hans',
    text: '必须耕种我们自己的园地。',
  }, signal())
  assert.equal(saved.kind, 'saved')
  assert.equal(saved.translation.anchorId, 'p1')

  const retry = await controller.saveTranslation({
    passageId: ids.passage,
    operationId: ids.translation,
    anchorId: 'p1',
    language: 'zh-Hans',
    text: '必须耕种我们自己的园地。',
  }, signal())
  assert.equal(retry.kind, 'already-saved')
  assert.equal(retry.translation.id, saved.translation.id)

  const differentIntent = await controller.saveTranslation({
    passageId: ids.passage,
    operationId: ids.translation,
    anchorId: 'p2',
    language: 'zh-Hans',
    text: '可是哪一块园地？',
  }, signal())
  assert.equal(differentIntent.kind, 'conflict')
  assert.equal(differentIntent.reason, 'operation-used')

  // A second version of the same anchor is a new version, not an overwrite.
  const second = await controller.saveTranslation({
    passageId: ids.passage,
    operationId: '00000000-0000-4000-8000-0000000000c2',
    anchorId: 'p1',
    language: 'zh-Hans',
    text: '应当耕种自己的园地。',
  }, signal())
  assert.equal(second.kind, 'saved')

  const unknownAnchor = await controller.saveTranslation({
    passageId: ids.passage,
    operationId: '00000000-0000-4000-8000-0000000000c3',
    anchorId: 'p9.s9',
    language: 'zh-Hans',
    text: '错位',
  }, signal())
  assert.deepEqual(unknownAnchor, { kind: 'conflict', reason: 'anchor-unknown' })

  const unknownPassage = await controller.saveTranslation({
    passageId: '00000000-0000-4000-8000-0000000000fe',
    operationId: '00000000-0000-4000-8000-0000000000c4',
    anchorId: 'p1',
    language: 'zh-Hans',
    text: '不存在的段落',
  }, signal())
  assert.deepEqual(unknownPassage, { kind: 'conflict', reason: 'passage-unknown' })

  const analysis = await controller.listAnalysis({ passageId: ids.passage }, signal())
  assert.equal(analysis.analysis.translations.length, 2)
  assert.equal(backing.writesFor(analysisKey(ids.passage)), 2)
})

test('branches form independent non-linear trees under one passage', async () => {
  const { controller } = await withPassage()

  const root = await controller.addBranch({
    passageId: ids.passage,
    operationId: ids.branch1,
    parentId: null,
    anchorId: 'p1.s1',
    kind: 'constituents',
    title: '句子成分',
    body: 'Il faut (+ inf.) : tour impersonnel ; cultiver notre jardin : infinitif complément.',
  }, signal())
  assert.equal(root.kind, 'created')
  assert.equal(root.branch.parentId, null)

  const grammar = await controller.addBranch({
    passageId: ids.passage,
    operationId: ids.branch2,
    parentId: root.branch.id,
    anchorId: 'p1.s1',
    kind: 'grammar',
    title: '无人称 il faut',
    body: 'il 为形式主语；faut 为 falloir 的直陈式现在时第三人称单数。',
  }, signal())
  assert.equal(grammar.kind, 'created')

  const vocabulary = await controller.addBranch({
    passageId: ids.passage,
    operationId: ids.branch3,
    parentId: root.branch.id,
    anchorId: 'p2.s2',
    kind: 'vocabulary',
    title: 'nôtre',
    body: '主有代词，与 le 连用指「我们的（园地）」。',
  }, signal())
  assert.equal(vocabulary.kind, 'created')

  const retry = await controller.addBranch({
    passageId: ids.passage,
    operationId: ids.branch1,
    parentId: null,
    anchorId: 'p1.s1',
    kind: 'constituents',
    title: '句子成分',
    body: 'Il faut (+ inf.) : tour impersonnel ; cultiver notre jardin : infinitif complément.',
  }, signal())
  assert.equal(retry.kind, 'already-saved')
  assert.equal(retry.branch.id, root.branch.id)

  const badParent = await controller.addBranch({
    passageId: ids.passage,
    operationId: '00000000-0000-4000-8000-0000000000e1',
    parentId: '00000000-0000-4000-8000-0000000000ef',
    anchorId: 'p1',
    kind: 'note',
    title: '悬空分支',
    body: '',
  }, signal())
  assert.equal(badParent.kind, 'conflict')
  assert.equal(badParent.reason, 'parent-unknown')

  const analysis = await controller.listAnalysis({ passageId: ids.passage }, signal())
  const branches = analysis.analysis.branches
  assert.equal(branches.length, 3)
  // Siblings under one anchor stay independent: two children, two anchors.
  const children = branches.filter((branch) => branch.parentId === root.branch.id)
  assert.equal(children.length, 2)
  assert.deepEqual(children.map((branch) => branch.anchorId).sort(), ['p1.s1', 'p2.s2'])
  assert.deepEqual(children.map((branch) => branch.kind).sort(), ['grammar', 'vocabulary'])
  assert.equal(branches.find((branch) => branch.kind === 'vocabulary').body.length > 0, true)

  // The kind allowlist is enforced before storage: an invented kind is a
  // rejected request, never a stored branch.
  await assert.rejects(
    controller.addBranch({
      passageId: ids.passage,
      operationId: '00000000-0000-4000-8000-0000000000e2',
      parentId: null,
      anchorId: 'p1',
      kind: 'speculation',
      title: '不在允许集合内',
      body: '',
    }, signal()),
    (error) => error.code === 'gateway/bad-request',
  )
  const after = await controller.listAnalysis({ passageId: ids.passage }, signal())
  assert.equal(after.analysis.branches.length, 3)
})

test('a drifted anchor stays visible and is reported unresolved, never re-attached', async () => {
  const { backing, controller } = await withPassage()
  await controller.getSegmentation({ passageId: ids.passage }, signal())

  // Fault injection: a stored branch whose anchor the current rules cannot
  // resolve, as if the segmentation rules had changed under an older note.
  const stored = backing.tables.get('records').get(analysisKey(ids.passage)) ?? {
    kind: 'analysis', recordVersion: 1,
    payload: { passageId: ids.passage, translations: [], branches: [] },
  }
  const stray = {
    id: '00000000-0000-4000-8000-0000000000aa',
    parentId: null,
    anchorId: 'p9.s9',
    kind: 'note',
    title: '旧锚点',
    body: '规则变更前写下的笔记。',
    createdAt: new Date().toISOString(),
    operationId: '00000000-0000-4000-8000-0000000000ab',
  }
  backing.tables.set('records', new Map(backing.tables.get('records')).set(analysisKey(ids.passage), {
    ...stored,
    payload: { ...stored.payload, branches: [...stored.payload.branches, stray] },
  }))

  const reopened = await openController(backing, FRENCH_READER_DOMAIN)
  const analysis = await reopened.controller.listAnalysis({ passageId: ids.passage }, signal())
  const drifted = analysis.analysis.branches.find((branch) => branch.id === stray.id)
  assert.equal(drifted.anchorStatus, 'unresolved')
  assert.equal(drifted.anchorId, 'p9.s9', 'the original anchor is kept, not guessed')
  assert.equal(drifted.title, '旧锚点')
  await reopened.domain.close()
})

test('a stored segmentation from another source revision is derived again', async () => {
  const { backing, controller } = await withPassage()
  await controller.getSegmentation({ passageId: ids.passage }, signal())
  assert.equal(backing.writesFor(segmentsKeyFor(ids.passage, 1)), 1)

  // Fault injection: the stored segmentation claims an older source revision.
  const records = new Map(backing.tables.get('records'))
  const stored = records.get(segmentsKeyFor(ids.passage, 1))
  records.set(segmentsKeyFor(ids.passage, 1), {
    ...stored,
    payload: { ...stored.payload, sourceRevision: 99, paragraphs: [{ ...stored.payload.paragraphs[0], text: '陈旧' , sentences: [{ id: 'p1.s1', paragraphId: 'p1', text: '陈旧', start: 0, end: 2 }] }] },
  })
  backing.tables.set('records', records)

  const reopened = await openController(backing, FRENCH_READER_DOMAIN)
  const value = await reopened.controller.getSegmentation({ passageId: ids.passage }, signal())
  assert.equal(value.segmentation.sourceRevision, 1)
  assert.equal(value.segmentation.paragraphs[0].text, 'Il faut cultiver notre jardin.')
  assert.equal(backing.writesFor(segmentsKeyFor(ids.passage, 1)), 2, 'a stale revision is recomputed and persisted')
  await reopened.domain.close()
})

test('the whole reading model survives a close and reopen', async () => {
  const backing = createBacking()
  const first = await openController(backing, FRENCH_READER_DOMAIN)
  await first.controller.createPassage(passageRequest, signal())
  await first.controller.getSegmentation({ passageId: ids.passage }, signal())
  await first.controller.saveTranslation({
    passageId: ids.passage,
    operationId: ids.translation,
    anchorId: 'p2.s1',
    language: 'zh-Hans',
    text: '可是哪一块园地？',
  }, signal())
  const root = await first.controller.addBranch({
    passageId: ids.passage,
    operationId: ids.branch1,
    parentId: null,
    anchorId: 'p2.s1',
    kind: 'translation',
    title: '疑问句语气',
    body: '反问语气，与后句的作答构成对照。',
  }, signal())
  await first.domain.close()

  const reopened = await openController(backing, FRENCH_READER_DOMAIN)
  const segmentation = await reopened.controller.getSegmentation({ passageId: ids.passage }, signal())
  assert.equal(segmentation.segmentation.paragraphs[1].sentences[0].text, '— Mais lequel ?')

  const analysis = await reopened.controller.listAnalysis({ passageId: ids.passage }, signal())
  assert.equal(analysis.analysis.translations.length, 1)
  assert.equal(analysis.analysis.branches.length, 1)
  assert.equal(analysis.analysis.branches[0].id, root.branch.id)
  assert.equal(analysis.analysis.branches[0].anchorId, 'p2.s1')
  assert.equal(backing.writesFor(segmentsKeyFor(ids.passage, 1)), 1, 'the reopened Host reuses the stored segmentation')
  await reopened.domain.close()
})
