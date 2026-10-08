import test from 'node:test'
import assert from 'node:assert/strict'

import { createBacking, ids, openController, passageRequest, signal } from './support/harness.mjs'
import { FRENCH_READER_DOMAIN, LEXICON_INDEX_KEY } from '../lib/domain.js'
import { buildFrenchReaderTool } from '../lib/tools.js'

async function withTool() {
  const backing = createBacking()
  const opened = await openController(backing, FRENCH_READER_DOMAIN)
  await opened.controller.createPassage(passageRequest, signal())
  return { backing, controller: opened.controller, tool: buildFrenchReaderTool(opened.controller) }
}

const heart = {
  action: 'mot', mot: 'cœur', partOfSpeech: 'nom masculin', create: true,
  definition: '心；本句中指情感与直觉的所在。', label: '心', lemma: 'cœur',
}

test('a stored Mot is returned as is, with no generation and no network', async () => {
  const { tool } = await withTool()
  const created = await tool.execute(heart)
  assert.equal(created.detail.generated, true)
  assert.equal(created.detail.found, true)
  assert.equal(created.detail.motKey, 'cœur')

  const listing = await tool.execute({ action: 'lexicon' })

  const again = await tool.execute({ action: 'mot', mot: 'cœur' })
  assert.equal(again.detail.found, true)
  assert.equal(again.detail.generated, false, 'a hit is final: nothing is regenerated')
  assert.deepEqual(again.detail.entries[0].senses, ['心；本句中指情感与直觉的所在。'])

  // Accents and ligatures survive as the lookup key, while the record key is a
  // hash, so accented forms are storable under a path-safe key at all.
  assert.ok(listing.detail.entries[0].motKey === 'cœur' || listing.detail.entries[0].mot === 'cœur')
  assert.equal(listing.detail.total, 1)
  assert.equal(listing.detail.entries[0].mot, 'cœur')
})

test('an inflected form is never silently merged into its lemma', async () => {
  const { tool } = await withTool()
  await tool.execute({
    action: 'mot', mot: 'ouvrir', partOfSpeech: 'verbe', create: true,
    definition: '打开。', forms: ['ouvrait', 'ouvre'],
  })

  const inflected = await tool.execute({ action: 'mot', mot: 'ouvrait' })
  assert.equal(inflected.detail.found, false, 'the exact form is not stored')
  assert.equal(inflected.detail.entries.length, 0)
  assert.equal(inflected.detail.candidates.length, 1, 'the lemma entry is a candidate')
  assert.equal(inflected.detail.candidates[0].mot, 'ouvrir')

  const lemma = await tool.execute({ action: 'mot', mot: 'ouvrir' })
  assert.equal(lemma.detail.found, true)
  assert.equal(lemma.detail.candidates.length, 0, 'the lemma itself is a hit, not a candidate')
})

test('homographs with different parts of speech stay separate entries', async () => {
  const { tool } = await withTool()
  await tool.execute({
    action: 'mot', mot: 'que', partOfSpeech: 'pronom relatif', create: true,
    definition: '关系代词，充当从句的宾语。',
  })
  await tool.execute({
    action: 'mot', mot: 'que', partOfSpeech: 'conjonction', create: true,
    definition: '连词，引导名词性从句。',
  })

  const both = await tool.execute({ action: 'mot', mot: 'que' })
  assert.equal(both.detail.found, true)
  assert.equal(both.detail.entries.length, 2, 'one spelling, two entries')
  assert.deepEqual(both.detail.entries.map((entry) => entry.partOfSpeech).sort(), ['conjonction', 'pronom relatif'])

  const one = await tool.execute({ action: 'mot', mot: 'que', partOfSpeech: 'conjonction' })
  assert.equal(one.detail.entries.length, 1)
  assert.equal(one.detail.entries[0].partOfSpeech, 'conjonction')
})

test('a duplicate create is refused, and concurrent creates end with one entry', async () => {
  const { tool } = await withTool()
  const first = await tool.execute(heart)
  const second = await tool.execute(heart)
  assert.equal(second.detail.found, true)
  assert.equal(second.detail.generated, false, 'the existing entry is authoritative')

  const third = await tool.execute({ ...heart, definition: '别的解释' })
  assert.equal((await tool.execute({ action: 'lexicon' })).detail.total, 1)
  const stored = await tool.execute({ action: 'mot', mot: 'cœur' })
  assert.deepEqual(stored.detail.entries[0].senses, ['心；本句中指情感与直觉的所在。'],
    'a second create never overwrites the stored sense')
  assert.equal(first.detail.entryId, third.detail.entryId)

  const racing = await Promise.all([
    tool.execute({ action: 'mot', mot: 'raison', partOfSpeech: 'nom féminin', create: true, definition: '理由。' }),
    tool.execute({ action: 'mot', mot: 'raison', partOfSpeech: 'nom féminin', create: true, definition: '理由。' }),
    tool.execute({ action: 'mot', mot: 'raison', partOfSpeech: 'nom féminin', create: true, definition: '理由。' }),
  ])
  const created = racing.filter((result) => result.detail.generated === true)
  assert.equal(created.length, 1, 'the serialised write chain admits one creator')
  assert.equal((await tool.execute({ action: 'lexicon' })).detail.total, 2)
})

test('a context note stays separate from the entry body and is idempotent', async () => {
  const { tool } = await withTool()
  const created = await tool.execute(heart)
  const entryId = created.detail.entryId

  const added = await tool.execute({
    action: 'occurrence', entryId, passageId: ids.passage, anchorId: 'p1.s1',
    excerpt: 'Le cœur a ses raisons.', note: '此处与 la raison 对举。',
    operationId: '00000000-0000-4000-8000-0000000000c7',
  })
  assert.equal(added.detail.appended, true)

  const retry = await tool.execute({
    action: 'occurrence', entryId, passageId: ids.passage, anchorId: 'p1.s1',
    excerpt: 'Le cœur a ses raisons.', note: '此处与 la raison 对举。',
    operationId: '00000000-0000-4000-8000-0000000000c7',
  })
  assert.equal(retry.detail.alreadyAppended, true)
  assert.equal(retry.detail.occurrenceId, added.detail.occurrenceId)

  const entry = await tool.execute({ action: 'mot', mot: 'cœur' })
  assert.equal(entry.detail.entries[0].occurrences, 1)
  assert.deepEqual(entry.detail.entries[0].senses, ['心；本句中指情感与直觉的所在。'],
    'one reading never rewrites the general sense')
})

test('the derived index can be dropped and rebuilt from the entries', async () => {
  const { backing, controller, tool } = await withTool()
  await tool.execute(heart)
  await tool.execute({
    action: 'mot', mot: 'raison', partOfSpeech: 'nom féminin', create: true,
    definition: '理由；理性。', forms: ['raisons'],
  })

  const records = new Map(backing.tables.get('records'))
  records.delete(LEXICON_INDEX_KEY)
  backing.tables.set('records', records)
  // The open domain holds its own state, so the drop only takes effect in a new
  // generation — exactly as a restart would see it.
  const reopened = await openController(backing, FRENCH_READER_DOMAIN)
  const broken = await reopened.controller.lookupMot('cœur', null, signal())
  assert.equal(broken.found, false, 'without the index a lookup cannot see the entry')

  // A generation that starts without an index rebuilds it from the entries.
  const rebuilt = await reopened.controller.rebuildLexiconIndex(signal())
  assert.equal(rebuilt.entries, 2)
  assert.equal(rebuilt.repaired, 2, 'both entries were missing from the derived index')
  const repaired = await reopened.controller.lookupMot('cœur', null, signal())
  assert.equal(repaired.found, true)
  const form = await reopened.controller.lookupMot('raisons', null, signal())
  assert.equal(form.found, false)
  assert.equal(form.candidates.length, 1, 'a declared inflection is a candidate after the rebuild too')

  // The entries themselves were never touched by any of this.
  assert.equal((await controller.listLexicon(signal())).length, 2)
  await reopened.domain.close()
})

test('lookup misses leave nothing behind', async () => {
  const { tool } = await withTool()
  const missing = await tool.execute({ action: 'mot', mot: 'inconnu' })
  assert.equal(missing.detail.found, false)
  assert.equal(missing.detail.generated, false)
  assert.match(missing.detail.hint, /create: true/u)
  assert.equal((await tool.execute({ action: 'lexicon' })).detail.total, 0)

  const refused = await tool.execute({ action: 'mot', mot: 'sans', create: true })
  assert.equal(refused.ok, false)
  assert.match(refused.detail.error, /partOfSpeech is required/u)
  assert.equal((await tool.execute({ action: 'lexicon' })).detail.total, 0)
})

test('the panel listing endpoints project what the libraries hold', async () => {
  const backing = createBacking()
  const opened = await openController(backing, FRENCH_READER_DOMAIN)
  await opened.controller.createPassage(passageRequest, signal())
  const tool = buildFrenchReaderTool(opened.controller)

  await tool.execute({
    action: 'mot', mot: 'cœur', partOfSpeech: 'nom masculin', create: true,
    definition: '心。', label: '本义', forms: ['cœurs'],
  })
  await tool.execute({
    action: 'answer', passageId: ids.passage, anchorId: 'p1.s1',
    question: 'il faut 是什么结构？', answer: '无人称句。',
    intents: [
      { kind: 'grammar', anchorId: 'p1.s1', title: '无人称句 il faut', body: 'il 为形式主语。' },
      { kind: 'grammar', anchorId: 'p1.s1', title: '关系代词 que 作宾语', body: 'que 作宾语。' },
      { kind: 'grammar', anchorId: 'p1.s1', title: '关系代词 que 作主语', body: 'que 作主语。' },
      { kind: 'grammar', anchorId: 'p1.s1', title: '关系代词 que', body: '歧义主题。' },
    ],
  })

  const lexicon = await opened.controller.listLexiconRemote({ scope: 'all' }, signal())
  assert.equal(lexicon.total, 1)
  assert.equal(lexicon.entries[0].mot, 'cœur')
  assert.deepEqual(lexicon.entries[0].forms, ['cœurs'])

  const grammar = await opened.controller.listGrammarRemote({ scope: 'all' }, signal())
  assert.equal(grammar.entries.length, 3, 'the ambiguous topic created none')
  assert.equal(grammar.pending.length, 1)
  assert.equal(grammar.pending[0].resolution, null)
  assert.equal(grammar.pending[0].candidates.length, 2)
  const counts = grammar.entries.map((entry) => entry.askCount)
  assert.deepEqual(counts.every((count) => count === 1), true)
  assert.equal(grammar.entries.every((entry) => entry.mastery === 'learning'), true)
  assert.equal(grammar.entries.every((entry) => entry.contentStatus === 'ai-unverified'), true)
})
