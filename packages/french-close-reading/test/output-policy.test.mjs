import test from 'node:test'
import assert from 'node:assert/strict'

import { classify, renderCard, sectionOrder, validateCard } from '../lib/output-policy.js'
import { isStubBody, judgeSource, toSourceRecord } from '../lib/source-gate.js'

/** A card with every default section filled. */
const filled = {
  mot: 'ouvrir',
  lemma: 'ouvrir',
  partOfSpeech: 'verbe',
  senses: [{ label: '本义', definition: '打开。' }],
  sections: {
    overview: '动词，三组。',
    sense: '打开。',
    etymology: '源自拉丁语 aperire。',
    semanticEvolution: '由「开启」扩展到「开始」。',
    conjugation: 'j’ouvre, tu ouvres, il ouvre。',
    collocations: 'ouvrir la porte',
    culture: '未发现可靠关联。',
    fixedExpressions: 'ouvrir l’appétit',
  },
  examples: ['Ouvre la porte.'],
}

test('the section order follows the type, and §5 only appears for its types', () => {
  const numbers = (pos, options) => sectionOrder(pos, options).map((section) => section.number)

  assert.deepEqual(numbers('verbe'), ['§1', '§2', '§4', '§3a', '§3b', '§5', '§6', '§7'])
  assert.deepEqual(numbers('nom masculin'), ['§1', '§2', '§3a', '§3b', '§5', '§6', '§7'])
  assert.deepEqual(numbers('adjectif'), ['§1', '§2', '§3a', '§3b', '§5', '§6', '§7'])
  assert.deepEqual(numbers('pronom relatif'), ['§1', '§2', '§6', '§7'], 'a pronoun omits §3 by default')
  assert.deepEqual(numbers('pronom relatif', { wantsEtymology: true }), ['§1', '§2', '§3a', '§3b', '§6', '§7'])
  assert.deepEqual(numbers('locution verbale'), ['§1', '§2', '§3a', '§3b', '§5', '§6', '§7'])
  // Adverbs, conjunctions and numerals keep the floor and never get §5.
  for (const pos of ['adverbe', 'conjonction', 'numéral']) {
    assert.deepEqual(numbers(pos), ['§1', '§2', '§6', '§7'])
    assert.equal(numbers(pos).includes('§5'), false)
  }
  assert.equal(classify('nom féminin'), 'nom')
  assert.equal(classify('verbe transitif'), 'verbe')
  assert.equal(classify('adverbe de manière'), 'autre', 'an adverb is not a verb')
  assert.equal(classify('adverbe'), 'autre')
  assert.equal(sectionOrder('adverbe').includes('§4'), false, 'no conjugation section for an adverb')
})

test('Chinese part-of-speech labels classify to the same kinds as French ones (F03)', () => {
  assert.equal(classify('动词'), 'verbe')
  assert.equal(classify('名词'), 'nom')
  assert.equal(classify('形容词'), 'adjectif')
  assert.equal(classify('代词'), 'pronom')
  assert.equal(classify('冠词'), 'article')
  assert.equal(classify('介词'), 'preposition')
  assert.equal(classify('副词'), 'autre', 'a Chinese adverb is not a verb either')
  assert.equal(classify('连词'), 'autre')
  assert.equal(classify('数词'), 'autre')
  assert.equal(classify('动词短语'), 'locution', 'a verb phrase is a locution, not a verb')
  assert.equal(classify('verbe（动词）'), 'verbe', 'a mixed label still classifies')
  // The section order is what the card renders: a verb saved with a Chinese
  // label must carry §4 conjugation like any other verb.
  assert.deepEqual(
    sectionOrder('动词').map((section) => section.number),
    ['§1', '§2', '§4', '§3a', '§3b', '§5', '§6', '§7'],
  )
  assert.deepEqual(sectionOrder('名词').map((section) => section.number),
    ['§1', '§2', '§3a', '§3b', '§5', '§6', '§7'])
})

test('§2 renders as an ordered list with examples and no table', () => {
  const card = renderCard({
    ...filled,
    senses: [
      { label: '本义', definition: '打开。' },
      { label: '引申', definition: '开始。' },
    ],
    examples: ['Ouvre la porte.', 'La séance s’ouvre.'],
  })
  assert.match(card, /§2 当前含义\n1\. 打开。（本义） — 例：Ouvre la porte\./)
  assert.match(card, /2\. 开始。（引申） — 例：La séance s’ouvre\./)
  assert.equal(card.includes('|'), false, 'no tables in §2')
})

test('§3b renders as an unordered list with the bar marker', () => {
  const card = renderCard({
    ...filled,
    sections: { ...filled.sections, semanticEvolution: '由「开启」扩展到「开始」\n由空间义扩展到时间义' },
  })
  assert.match(card, /§3b 语义演变\n｜由「开启」扩展到「开始」\n｜由空间义扩展到时间义/)
})

test('a required section that is empty is an error, an explicit statement is not', () => {
  const missing = validateCard({
    ...filled,
    sections: { ...filled.sections, culture: '', fixedExpressions: '   ' },
  })
  assert.equal(missing.errors.length, 2)
  assert.match(missing.errors[0], /§6 文化语境 为空/u)
  assert.match(missing.errors[1], /§7 固定表达 为空/u)

  // Saying "no reliable link found" is content, not an omission.
  const honest = validateCard({ ...filled, sections: { ...filled.sections, culture: '未发现可靠关联。' } })
  assert.deepEqual(honest.errors, [])
})

test('a card without senses, or without a Mot, cannot pass', () => {
  assert.match(validateCard({ ...filled, senses: [] }).errors.join(' '), /§2 缺少义项/u)
  assert.match(validateCard({ ...filled, mot: '  ' }).errors.join(' '), /Mot 为空/u)
  const hints = validateCard({ ...filled, lemma: null }).hints.join(' ')
  assert.match(hints, /不得以原形替代输入词形/u)
})

test('an HTTP 200 with only site chrome is not success', () => {
  // The measured CNRTL behaviour for `ouvrir`.
  const verdict = judgeSource({
    kind: 'cnrtl', section: 'etymology', url: 'https://cnrtl.fr/etymologie/ouvrir',
    httpStatus: 200, body: 'Portail lexical',
  })
  assert.equal(verdict.ok, false)
  assert.equal(verdict.outcome, 'body-missing')
  assert.match(verdict.claim, /按训练数据回退/u)

  assert.equal(isStubBody('Portail lexical'), true)
  assert.equal(isStubBody('CNRTL — Portail lexical — Accueil'), true)
  assert.equal(isStubBody(''), true)
  assert.equal(
    isStubBody('Du latin aperire « ouvrir », le verbe conserve le sens concret d’écarter un obstacle.'),
    false,
  )
})

test('each failure mode is named, and an unusable response never claims a source', () => {
  const cases = [
    [{ httpStatus: 404, body: '' }, 'http-error'],
    [{ httpStatus: 200, body: 'un texte', entryFound: false }, 'not-found'],
    [{ httpStatus: 200, body: 'un texte assez long pour ne pas être du chrome de page' , truncated: true }, 'truncated'],
    [{ httpStatus: 200, body: 'un texte assez long pour ne pas être du chrome de page', parseFailed: true }, 'parse-failed'],
  ]
  for (const [overrides, outcome] of cases) {
    const verdict = judgeSource({
      kind: 'cnrtl', section: 'etymology', url: null, httpStatus: null, body: '', ...overrides,
    })
    assert.equal(verdict.ok, false, `${outcome} must not be ok`)
    assert.equal(verdict.outcome, outcome)
    const record = toSourceRecord({
      kind: 'cnrtl', section: 'etymology', url: null, httpStatus: null, body: '', ...overrides,
    })
    assert.equal(record.ok, false)
    assert.match(record.note, /回退|截断/u, 'the record states the fallback instead of claiming success')
  }

  const good = toSourceRecord({
    kind: 'cnrtl', section: 'etymology', url: 'https://cnrtl.fr/etymologie/ouvrir',
    httpStatus: 200, entryFound: true, fetchedAt: '2026-10-06T11:00:00.000Z',
    body: 'Du latin aperire « ouvrir » ; le sens concret d’écarter un obstacle est attesté dès le XIIe siècle.',
  })
  assert.equal(good.ok, true)
  assert.equal(good.section, 'etymology', 'a source only ever supports the section it was fetched for')
  assert.match(good.note, /仅支持本字段/u)
})
