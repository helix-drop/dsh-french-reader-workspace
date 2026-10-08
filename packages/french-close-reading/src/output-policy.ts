/**
 * Output policy for a vocabulary card.
 *
 * The plan's section order, formats and honesty rules are data and pure rules
 * here, not a prompt the model improvises: the same policy decides what is
 * rendered and what is validated, so a card cannot pass by being pretty.
 *
 * Sections:
 *   §1 overview · §2 current sense · §3 etymology (a: origin, b: evolution)
 *   §4 conjugation · §5 collocations · §6 cultural context · §7 set expressions
 */

export type SectionId = 'overview' | 'sense' | 'etymology' | 'semanticEvolution' | 'conjugation' | 'collocations' | 'culture' | 'fixedExpressions'

export interface SectionSpec {
  id: SectionId
  /** The §number shown to the reader. */
  number: string
  title: string
  /** Must carry content; an empty required section fails validation. */
  required: boolean
  /** How the body is written. Ordered lists carry examples; never a table. */
  format: 'overview' | 'ordered' | 'unordered-bars' | 'prose' | 'paradigm'
}

const OVERVIEW: SectionSpec = { id: 'overview', number: '§1', title: '总览', required: true, format: 'overview' }
const SENSE: SectionSpec = { id: 'sense', number: '§2', title: '当前含义', required: true, format: 'ordered' }
const ETYMOLOGY: SectionSpec = { id: 'etymology', number: '§3a', title: '词源', required: false, format: 'prose' }
const EVOLUTION: SectionSpec = { id: 'semanticEvolution', number: '§3b', title: '语义演变', required: false, format: 'unordered-bars' }
const CONJUGATION: SectionSpec = { id: 'conjugation', number: '§4', title: '动词变位', required: false, format: 'paradigm' }
const COLLOCATIONS: SectionSpec = { id: 'collocations', number: '§5', title: '词组关联', required: false, format: 'unordered-bars' }
const CULTURE: SectionSpec = { id: 'culture', number: '§6', title: '文化语境', required: true, format: 'prose' }
const FIXED: SectionSpec = { id: 'fixedExpressions', number: '§7', title: '固定表达', required: true, format: 'unordered-bars' }

/** Types whose card carries §5, and where it sits before §6. */
const COLLOCATION_TYPES = ['verbe', 'nom', 'adjectif', 'locution', 'idiome']

/**
 * Section order for one part of speech.
 * @param partOfSpeech - The entry's part of speech, as authored.
 * @param options - `wantsEtymology` adds §3 for the types that omit it by default.
 * @returns The ordered sections this card must follow.
 */
export function sectionOrder(partOfSpeech: string, options: { wantsEtymology?: boolean } = {}): SectionSpec[] {
  const kind = classify(partOfSpeech)
  const wantsEtymology = options.wantsEtymology === true

  if (kind === 'verbe') return [OVERVIEW, SENSE, CONJUGATION, ETYMOLOGY, EVOLUTION, COLLOCATIONS, CULTURE, FIXED]
  if (kind === 'nom' || kind === 'adjectif') return [OVERVIEW, SENSE, ETYMOLOGY, EVOLUTION, COLLOCATIONS, CULTURE, FIXED]
  if (kind === 'pronom' || kind === 'article' || kind === 'preposition') {
    return wantsEtymology
      ? [OVERVIEW, SENSE, ETYMOLOGY, EVOLUTION, CULTURE, FIXED]
      : [OVERVIEW, SENSE, CULTURE, FIXED]
  }
  if (kind === 'locution') return [OVERVIEW, SENSE, ETYMOLOGY, EVOLUTION, COLLOCATIONS, CULTURE, FIXED]
  // Adverbs, conjunctions, numerals and anything unclassified get a floor of
  // §1 §2 §6 §7; etymology is added only on request.
  return wantsEtymology
    ? [OVERVIEW, SENSE, ETYMOLOGY, EVOLUTION, CULTURE, FIXED]
    : [OVERVIEW, SENSE, CULTURE, FIXED]
}

export type PartOfSpeechKind = 'verbe' | 'nom' | 'adjectif' | 'pronom' | 'article' | 'preposition' | 'locution' | 'autre'

/**
 * Coarse classification of an authored part of speech.
 *
 * Order matters and the patterns are anchored: `/verb/` alone matches
 * "ad**verb**e", which would hand an adverb a verb's section order — including
 * §4 conjugation. Types the plan does not route anywhere stay `autre`.
 */
export function classify(partOfSpeech: string): PartOfSpeechKind {
  const text = partOfSpeech.normalize('NFC').toLowerCase()
  if (/locution|idiome|expression/.test(text)) return 'locution'
  if (/\badverbe|\badv\b/.test(text)) return 'autre'
  if (/\bverbe|\bverb\b/.test(text)) return 'verbe'
  if (/\badj/.test(text)) return 'adjectif'
  if (/\bnom\b|substantif/.test(text)) return 'nom'
  if (/\bpron/.test(text)) return 'pronom'
  if (/\bart\b|\barticle\b/.test(text)) return 'article'
  if (/\bpr[ée]p/.test(text)) return 'preposition'
  return 'autre'
}

/** What is known about the entry, as far as the policy cares. */
export interface PolicyInput {
  partOfSpeech: string
  mot: string
  lemma: string | null
  senses: readonly { label: string; definition: string }[]
  sections: Record<SectionId, string | null>
  examples?: readonly string[]
}

export interface PolicyReport {
  sections: SectionSpec[]
  errors: string[]
  hints: string[]
}

/**
 * Validate a card against its policy.
 *
 * A required section that is empty is an error — the plan forbids "每句只有一句
 * 概括也算完成" for analysis and the same discipline applies here. A section the
 * author genuinely cannot fill must say so explicitly (`未发现可靠关联`), which
 * counts as content; silently omitting it does not.
 */
export function validateCard(input: PolicyInput, options: { wantsEtymology?: boolean } = {}): PolicyReport {
  const sections = sectionOrder(input.partOfSpeech, options)
  const errors: string[] = []
  const hints: string[] = []

  if (input.mot.trim() === '') errors.push('Mot 为空：词卡必须以精确词形为入口')
  if (input.senses.length === 0) errors.push('§2 缺少义项')

  for (const section of sections) {
    if (!section.required) continue
    // §1 is generated from the entry's own form/lemma/part of speech, so it can
    // never be "missing"; the stored text is optional detail.
    if (section.id === 'overview') continue
    const body = input.sections[section.id]
    if (body === null || body.trim() === '') {
      errors.push(`${section.number} ${section.title} 为空：要么写内容，要么明确说明未发现可靠内容`)
    }
  }
  const omitted = (['collocations', 'conjugation'] as const)
    .filter((id) => sections.every((section) => section.id !== id) && (input.sections[id] ?? '') !== '')
  for (const id of omitted) hints.push(`${id} 不属于该词性的默认章节，内容已保留但不在默认顺序中`)
  if (input.lemma === null) hints.push('未记录原形：命中时不得以原形替代输入词形')
  return { sections, errors, hints }
}

/**
 * Render a card in policy order.
 * @param input - The entry being rendered.
 * @param options - `wantsEtymology` includes §3 for types that omit it by default.
 * @returns The card text, in order, with each section's own format.
 */
export function renderCard(input: PolicyInput, options: { wantsEtymology?: boolean } = {}): string {
  const { sections } = validateCard(input, options)
  const lines: string[] = []
  for (const section of sections) {
    const body = (input.sections[section.id] ?? '').trim()
    if (body === '' && !section.required) continue
    lines.push(`${section.number} ${section.title}`)
    // A required section that is empty is shown as an explicit gap: omitting the
    // heading would hide the very thing the gate complains about. §1 is exempt —
    // it is derived from the entry itself, so it is never genuinely empty.
    if (body === '' && section.id !== 'overview') {
      lines.push('（待补：该章节为空）')
      continue
    }
    if (section.id === 'overview') {
      lines.push(renderOverview(input))
      continue
    }
    if (section.id === 'sense') {
      // Ordered list with examples; the plan forbids a table here.
      lines.push(...input.senses.map((sense, index) =>
        `${String(index + 1)}. ${sense.definition}${sense.label === '' ? '' : `（${sense.label}）`}${exampleFor(input, index)}`))
      continue
    }
    if (section.format === 'unordered-bars') {
      lines.push(...body.split('\n').filter((line) => line.trim() !== '').map((line) => `｜${line.trim()}`))
      continue
    }
    lines.push(body)
  }
  return lines.join('\n')
}

function renderOverview(input: PolicyInput): string {
  const detail = (input.sections.overview ?? '').trim()
  const head = `词形 ${input.mot} · 原形 ${input.lemma ?? '—'} · 词性 ${input.partOfSpeech}`
  return detail === '' ? head : `${head} · ${detail}`
}

function exampleFor(input: PolicyInput, index: number): string {
  const example = input.examples?.[index]
  return example === undefined ? '' : ` — 例：${example}`
}
