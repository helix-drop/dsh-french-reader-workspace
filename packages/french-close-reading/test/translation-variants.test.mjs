import test from 'node:test'
import assert from 'node:assert/strict'

import { createBacking, ids, openController, passageRequest, signal } from './support/harness.mjs'
import { FRENCH_READER_DOMAIN } from '../lib/domain.js'
import { buildFrenchReaderTool } from '../lib/tools.js'

const ANCHOR = 'p1.s1'

async function withTool() {
  const backing = createBacking()
  const opened = await openController(backing, FRENCH_READER_DOMAIN)
  await opened.controller.createPassage(passageRequest, signal())
  return { backing, controller: opened.controller, tool: buildFrenchReaderTool(opened.controller) }
}

const aiVariant = {
  action: 'translate', passageId: ids.passage, anchorId: ANCHOR,
  text: '必须耕种我们自己的园地。', source: 'ai',
  operationId: '00000000-0000-4000-8000-0000000000e1',
}
const userVariant = {
  action: 'translate', passageId: ids.passage, anchorId: ANCHOR,
  text: '得把咱们自己的园子种起来。', source: 'user', note: '更口语，保留 faut 的“该当”语气弱化',
  operationId: '00000000-0000-4000-8000-0000000000e2',
}

test('variants coexist and keep their author and comparison note', async () => {
  const { tool } = await withTool()
  await tool.execute(aiVariant)
  await tool.execute(userVariant)

  const analysis = await tool.execute({ action: 'analysis', passageId: ids.passage })
  const variants = analysis.detail.translations.filter((entry) => entry.anchorId === ANCHOR)
  assert.equal(variants.length, 2, 'the AI variant is not replaced by the user variant')
  assert.deepEqual(variants.map((entry) => entry.source).sort(), ['ai', 'user'])
  assert.equal(variants.find((entry) => entry.source === 'user').note.includes('更口语'), true)
  assert.equal(analysis.detail.adopted.length, 0, 'writing a variant is not adopting it')
})

test('adopting a variant moves the pointer, keeps the rest, and is idempotent', async () => {
  const { tool } = await withTool()
  const ai = await tool.execute(aiVariant)
  const user = await tool.execute(userVariant)

  const adopted = await tool.execute({
    action: 'adopt', passageId: ids.passage, anchorId: ANCHOR, translationId: user.detail.translationId,
  })
  assert.equal(adopted.detail.adopted, true)
  assert.equal(adopted.detail.previousId, null)

  const retry = await tool.execute({
    action: 'adopt', passageId: ids.passage, anchorId: ANCHOR, translationId: user.detail.translationId,
  })
  assert.equal(retry.detail.alreadyAdopted, true)

  // Adopting another variant records what it replaced.
  const switched = await tool.execute({
    action: 'adopt', passageId: ids.passage, anchorId: ANCHOR, translationId: ai.detail.translationId,
  })
  assert.equal(switched.detail.adopted, true)
  assert.equal(switched.detail.previousId, user.detail.translationId)

  const analysis = await tool.execute({ action: 'analysis', passageId: ids.passage })
  assert.equal(analysis.detail.adopted.length, 1)
  assert.equal(analysis.detail.adopted[0].translationId, ai.detail.translationId)
  assert.equal(analysis.detail.adopted[0].previousId, user.detail.translationId)
  assert.equal(analysis.detail.translations.length, 2, 'both variants survive every adoption')
})

test('adoption refuses unknown or mismatched variants', async () => {
  const { tool } = await withTool()
  await tool.execute(aiVariant)

  const unknown = await tool.execute({
    action: 'adopt', passageId: ids.passage, anchorId: ANCHOR,
    translationId: '00000000-0000-4000-8000-0000000000f9',
  })
  assert.equal(unknown.ok, false)
  assert.equal(unknown.detail.reason, 'translation-unknown')

  const mismatched = await tool.execute({
    action: 'adopt', passageId: ids.passage, anchorId: 'p2.s1',
    translationId: (await tool.execute({ action: 'analysis', passageId: ids.passage }))
      .detail.translations[0].translationId,
  })
  assert.equal(mismatched.ok, false)
  assert.equal(mismatched.detail.reason, 'anchor-mismatch')
})

test('a sentence adopted after the overall translation reports a reconciliation, and never rewrites it', async () => {
  const { tool } = await withTool()
  const overall = await tool.execute({
    action: 'translate', passageId: ids.passage, anchorId: 'passage',
    text: '必须耕种我们自己的园地。', source: 'ai',
    operationId: '00000000-0000-4000-8000-0000000000e5',
  })
  const before = await tool.execute({ action: 'analysis', passageId: ids.passage })
  assert.equal(before.detail.reconciliation.needed, false, 'nothing changed under the overall translation yet')

  const user = await tool.execute(userVariant)
  await tool.execute({
    action: 'adopt', passageId: ids.passage, anchorId: ANCHOR, translationId: user.detail.translationId,
  })

  const after = await tool.execute({ action: 'analysis', passageId: ids.passage })
  const report = after.detail.reconciliation
  assert.equal(report.needed, true)
  assert.equal(report.passageTranslationId, overall.detail.translationId, 'the overall translation is named, not changed')
  assert.equal(report.items.length, 1)
  assert.equal(report.items[0].anchorId, ANCHOR)
  assert.equal(report.items[0].currentText, userVariant.text)
  assert.equal(report.items[0].previousText, null, 'nothing was adopted before, so there is no previous wording')

  // The overall translation itself is byte-identical: it is a decision, not a cache.
  const stored = after.detail.translations.find((entry) => entry.translationId === overall.detail.translationId)
  assert.equal(stored.text, '必须耕种我们自己的园地。')
  assert.equal(stored.source, 'ai')
})

test('writing a new overall translation clears the reconciliation, and switching back restores it', async () => {
  const { tool } = await withTool()
  const ai = await tool.execute(aiVariant)
  const user = await tool.execute(userVariant)
  await tool.execute({ action: 'adopt', passageId: ids.passage, anchorId: ANCHOR, translationId: user.detail.translationId })

  // A fresh overall translation written after the adoption coordinates again.
  await tool.execute({
    action: 'translate', passageId: ids.passage, anchorId: 'passage',
    text: '得耕种自己的园地；这层“该当”不可省。', source: 'user',
    operationId: '00000000-0000-4000-8000-0000000000e6',
  })
  const coordinated = await tool.execute({ action: 'analysis', passageId: ids.passage })
  assert.equal(coordinated.detail.reconciliation.needed, false)

  // Switching the sentence afterwards makes it stale again — the report shows
  // what the sentence said before, so a diff is possible.
  await tool.execute({ action: 'adopt', passageId: ids.passage, anchorId: ANCHOR, translationId: ai.detail.translationId })
  const again = await tool.execute({ action: 'analysis', passageId: ids.passage })
  assert.equal(again.detail.reconciliation.needed, true)
  assert.equal(again.detail.reconciliation.items[0].previousText, userVariant.text)
  assert.equal(again.detail.reconciliation.items[0].currentText, aiVariant.text)
})

test('a user variant survives a retried identical write and is never duplicated', async () => {
  const { tool } = await withTool()
  const first = await tool.execute(userVariant)
  const retry = await tool.execute(userVariant)
  assert.equal(retry.detail.alreadySaved, true)
  assert.equal(retry.detail.translationId, first.detail.translationId)

  const analysis = await tool.execute({ action: 'analysis', passageId: ids.passage })
  assert.equal(analysis.detail.translations.length, 1)

  // The same text from the other author is a different variant, not a duplicate.
  await tool.execute({ ...userVariant, source: 'ai', operationId: '00000000-0000-4000-8000-0000000000e7' })
  const both = await tool.execute({ action: 'analysis', passageId: ids.passage })
  assert.equal(both.detail.translations.length, 2)
  assert.deepEqual(both.detail.translations.map((entry) => entry.source).sort(), ['ai', 'user'])
})
