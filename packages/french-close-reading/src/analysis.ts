/**
 * Structured per-sentence analysis.
 *
 * The plan is explicit that colour is a rendering of structure, not the data:
 * part of speech, syntactic function and semantic reading are three different
 * things and must not be collapsed into one coloured span. This module declares
 * that structure and validates it. It does not generate: an analysis arrives from
 * somewhere else and is checked here.
 *
 * The honesty rules the validator enforces:
 *
 * - every part of the sentence is accounted for by some constituent, or the gap is
 *   named with its text;
 * - a single constituent spanning several clauses is a summary, not an analysis;
 * - a judgement is labelled as a syntactic fact, a contextual reading, a
 *   rhetorical interpretation, or something still to be verified — so "Foucault
 *   means this" is never displayed with the same certainty as "the subject is X".
 */
import { z } from 'zod'

import { AnchorIdSchema, MAX_SOURCE_CHARACTERS, MAX_TRANSLATION_CHARACTERS } from './limits.ts'

/** How sure the analysis is of one explanation. */
export const EXPLANATION_KINDS = ['syntax', 'context', 'rhetoric', 'unverified'] as const

/**
 * One clause of a sentence: the main clause, a relative clause, a complement
 * clause, a participle construction, and so on.
 *
 * Ranges are half-open offsets into the sentence text, so a clause can be
 * highlighted without the data ever holding markup.
 */
export const ClauseSchema = z.object({
  id: z.string().uuid(),
  /** The clause's own role, as the analysis names it (主句／关系从句／补语从句…). */
  role: z.string().min(1).max(60),
  start: z.number().int().min(0),
  end: z.number().int().min(0),
  text: z.string().max(MAX_SOURCE_CHARACTERS),
  /** The clause this one is nested inside, when it is subordinate. */
  parentId: z.string().uuid().nullable().default(null),
}).strict()

export type StoredClause = z.infer<typeof ClauseSchema>

/**
 * One constituent and the syntactic function it carries.
 *
 * `partOfSpeech` and `function` are separate fields on purpose: "adjective" is a
 * part of speech, "attribut" is a function, and one label cannot be both.
 */
export const ConstituentSchema = z.object({
  id: z.string().uuid(),
  /** 主语／谓语／直接宾语／表语／宾补／状语／修饰语… */
  role: z.string().min(1).max(60),
  start: z.number().int().min(0),
  end: z.number().int().min(0),
  text: z.string().max(MAX_SOURCE_CHARACTERS),
  /** Which clause this constituent belongs to. */
  clauseId: z.string().uuid().nullable().default(null),
  /** The part of speech, when the analysis states one. Never a function. */
  partOfSpeech: z.string().max(60).nullable().default(null),
}).strict()

export type StoredConstituent = z.infer<typeof ConstituentSchema>

/** One word's morphology: lemma, part of speech, tense, agreement. */
export const MorphologySchema = z.object({
  id: z.string().uuid(),
  form: z.string().min(1).max(120),
  lemma: z.string().max(120).nullable().default(null),
  partOfSpeech: z.string().max(60).nullable().default(null),
  /** 现在时／未完成过去时／过去分词… */
  tense: z.string().max(60).nullable().default(null),
  mood: z.string().max(60).nullable().default(null),
  person: z.string().max(20).nullable().default(null),
  gender: z.string().max(20).nullable().default(null),
  number: z.string().max(20).nullable().default(null),
  /** What this form agrees with, when it agrees with something. */
  agreesWith: z.string().max(120).nullable().default(null),
  note: z.string().max(MAX_TRANSLATION_CHARACTERS).default(''),
}).strict()

export type StoredMorphology = z.infer<typeof MorphologySchema>

/** One explanation, labelled with how certain it is. */
export const ExplanationSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(EXPLANATION_KINDS),
  text: z.string().min(1).max(MAX_TRANSLATION_CHARACTERS),
  /** The part of the sentence this is about, when it is about a part. */
  start: z.number().int().min(0).nullable().default(null),
  end: z.number().int().min(0).nullable().default(null),
}).strict()

export type StoredExplanation = z.infer<typeof ExplanationSchema>

/**
 * One sentence's full analysis: the six parts the plan requires.
 *
 * `sourceRevision` and `segmentationRevision` pin what this was written against,
 * so a later source correction can say "this was about the old text" instead of
 * silently re-attaching.
 */
export const SentenceAnalysisSchema = z.object({
  id: z.string().uuid(),
  passageId: z.string().uuid(),
  anchorId: AnchorIdSchema,
  /** The exact sentence text this analysis is about. */
  text: z.string().min(1).max(MAX_SOURCE_CHARACTERS),
  sourceRevision: z.number().int().min(1),
  segmentationRevision: z.number().int().min(1),
  /** 1. The sentence's own translation. */
  translation: z.string().min(1).max(MAX_TRANSLATION_CHARACTERS),
  /** 2. The core structure with modifiers stripped. */
  backbone: z.string().max(MAX_TRANSLATION_CHARACTERS).default(''),
  clauses: z.array(ClauseSchema),
  constituents: z.array(ConstituentSchema),
  morphology: z.array(MorphologySchema),
  explanations: z.array(ExplanationSchema),
  /** Who wrote this analysis, and whether a reader has looked at it. */
  provenance: z.enum(['ai', 'user', 'mixed']),
  status: z.enum(['draft', 'reviewed']),
  revision: z.number().int().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict()

export type StoredSentenceAnalysis = z.infer<typeof SentenceAnalysisSchema>

/** One whole-passage analysis version: the overall translation plus per-sentence rows. */
export const AnalysisVersionSchema = z.object({
  id: z.string().uuid(),
  passageId: z.string().uuid(),
  /** Monotonic per passage; the pointer names which one is current. */
  revision: z.number().int().min(1),
  sourceRevision: z.number().int().min(1),
  /** The passage-wide translation, or null while it has not been written. */
  overallTranslation: z.string().max(MAX_TRANSLATION_CHARACTERS).nullable().default(null),
  /** Discourse links and pronouns that only make sense across the paragraph. */
  cohesion: z.string().max(MAX_TRANSLATION_CHARACTERS).default(''),
  /** Which sentences this version covers, so a partial version is visible as partial. */
  coveredAnchors: z.array(z.string().max(40)),
  backend: z.string().max(40).nullable().default(null),
  model: z.string().max(120).nullable().default(null),
  createdAt: z.string().datetime(),
}).strict()

export type StoredAnalysisVersion = z.infer<typeof AnalysisVersionSchema>

export const SentenceAnalysesSchema = z.object({
  passageId: z.string().uuid(),
  sentences: z.array(SentenceAnalysisSchema),
}).strict()

export type StoredSentenceAnalyses = z.infer<typeof SentenceAnalysesSchema>

export const AnalysisVersionsSchema = z.object({
  passageId: z.string().uuid(),
  versions: z.array(AnalysisVersionSchema),
  /** Which version is current; null while none has been published. */
  currentId: z.string().uuid().nullable().default(null),
}).strict()

export type StoredAnalysisVersions = z.infer<typeof AnalysisVersionsSchema>

export interface AnalysisReport {
  errors: string[]
  hints: string[]
}

/**
 * Validate one sentence analysis.
 *
 * @param analysis - The analysis to check.
 * @param sentenceText - The sentence text as it stands in the current source, so
 *   a range that no longer fits is caught rather than rendered.
 * @returns Errors that must be fixed, and hints a reader should judge.
 */
export function validateSentenceAnalysis(
  analysis: StoredSentenceAnalysis,
  sentenceText: string,
): AnalysisReport {
  const errors: string[] = []
  const hints: string[] = []

  if (analysis.translation.trim() === '') errors.push('缺少译文：每句都必须有译文，空着不算完成')
  if (analysis.clauses.length === 0) errors.push('没有从句结构：至少要有主句')

  // Every range must fit the sentence it claims to describe.
  const ranged = [
    ...analysis.clauses.map((clause) => ({ what: `从句「${clause.role}」`, start: clause.start, end: clause.end })),
    ...analysis.constituents.map((item) => ({ what: `成分「${item.role}」`, start: item.start, end: item.end })),
  ]
  for (const item of ranged) {
    if (item.end <= item.start) errors.push(`${item.what} 的区间为空或反向（${String(item.start)}–${String(item.end)}）`)
    else if (item.end > sentenceText.length) {
      errors.push(`${item.what} 的区间超出句子长度（${String(item.end)} > ${String(sentenceText.length)}）`)
    }
  }

  // The sentence must be covered, and a single constituent spanning everything is
  // a summary rather than an analysis.
  const constituents = [...analysis.constituents]
    .filter((item) => item.end > item.start && item.end <= sentenceText.length)
    .sort((left, right) => left.start - right.start || left.end - right.end)
  if (constituents.length === 0) {
    errors.push('没有任何成分分析：只给一句概括不算逐句解析')
  } else {
    const whole = constituents.find((item) => item.start === 0 && item.end >= sentenceText.length)
    if (whole !== undefined && analysis.clauses.length > 1) {
      hints.push(`成分「${whole.role}」覆盖整句而句子含 ${String(analysis.clauses.length)} 个从句：这是概括，不是成分分析`)
    }
    let cursor = 0
    const gaps: { start: number; end: number }[] = []
    for (const item of constituents) {
      if (item.start > cursor) gaps.push({ start: cursor, end: item.start })
      cursor = Math.max(cursor, item.end)
    }
    if (cursor < sentenceText.length) gaps.push({ start: cursor, end: sentenceText.length })
    for (const gap of gaps) {
      const text = sentenceText.slice(gap.start, gap.end)
      // Whitespace and punctuation between constituents are not unanalysed words.
      if (/[\p{L}\p{N}]/u.test(text)) {
        errors.push(`未被分析的原文片段「${text.slice(0, 40)}」（${String(gap.start)}–${String(gap.end)}）`)
      }
    }
  }

  // A clause structure that does not nest properly is not a structure.
  const ids = new Set(analysis.clauses.map((clause) => clause.id))
  for (const clause of analysis.clauses) {
    if (clause.parentId === null) continue
    if (!ids.has(clause.parentId)) errors.push(`从句「${clause.role}」的父从句不存在`)
    if (clause.parentId === clause.id) errors.push(`从句「${clause.role}」把自己当作父从句`)
  }

  // Certainty must be visible: an interpretation is not a fact.
  if (analysis.explanations.length === 0) {
    hints.push('没有解释性内容：句法事实之外，语篇与表达层面的说明也应记录')
  }
  const unlabelled = analysis.explanations.filter((item) => item.kind === 'syntax' && /作者|福柯|意图|意味着/u.test(item.text))
  if (unlabelled.length > 0) {
    hints.push('有解释被标为句法事实，却写着作者意图：请改为语境解释或修辞解读')
  }
  if (analysis.provenance === 'ai' && analysis.status === 'reviewed') {
    hints.push('内容由 AI 生成却标为已审校：请确认有人真的读过')
  }
  return { errors, hints }
}

/**
 * What one passage's analysis covers, so "every sentence has an analysis" is a
 * measurement rather than a claim.
 */
export function analysisCoverage(
  sentenceAnchors: readonly { id: string; text: string }[],
  analyses: readonly StoredSentenceAnalysis[],
): { covered: string[]; missing: string[]; failed: string[]; stale: string[]; perSentence: { anchorId: string; errors: string[]; hints: string[] }[] } {
  const byAnchor = new Map(analyses.map((analysis) => [analysis.anchorId, analysis]))
  const covered: string[] = []
  const missing: string[] = []
  const stale: string[] = []
  const perSentence: { anchorId: string; errors: string[]; hints: string[] }[] = []
  for (const anchor of sentenceAnchors) {
    const analysis = byAnchor.get(anchor.id)
    if (analysis === undefined) {
      missing.push(anchor.id)
      continue
    }
    if (analysis.text !== anchor.text) {
      // The sentence changed under the analysis: it describes text that is no
      // longer there, and saying it is "covered" would be a false claim.
      stale.push(anchor.id)
      continue
    }
    const report = validateSentenceAnalysis(analysis, anchor.text)
    perSentence.push({ anchorId: anchor.id, errors: report.errors, hints: report.hints })
    if (report.errors.length === 0) covered.push(anchor.id)
  }
  return { covered, missing, failed: perSentence.filter((item) => item.errors.length > 0).map((item) => item.anchorId), stale, perSentence }
}
