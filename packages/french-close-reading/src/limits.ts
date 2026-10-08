/**
 * Storage-independent limits, ids and base schemas.
 *
 * These are declared once and imported by every module that needs them, because
 * the record modules are composed by `domain.ts` and cannot import back from it
 * without a cycle. `domain.ts` re-exports them, so a consumer that already
 * imports the domain keeps working.
 */
import { z } from 'zod'

export const MAX_PASSAGES = 250
export const MAX_PAGE_SIZE = 100
export const DEFAULT_PAGE_SIZE = 50
export const MAX_SOURCE_CHARACTERS = 20_000
export const MAX_TITLE_CHARACTERS = 160
export const MAX_TRANSLATION_CHARACTERS = 20_000
export const MAX_BRANCH_TITLE_CHARACTERS = 160
export const MAX_BRANCH_BODY_CHARACTERS = 20_000
export const MAX_BRANCHES = 1000
/** How many characters of context one vocabulary occurrence keeps. */
export const EXCERPT_CHARACTERS = 500

export const BRANCH_KINDS = ['constituents', 'grammar', 'vocabulary', 'translation', 'note'] as const

/**
 * Anchor ids name the whole passage, a paragraph, a sentence, or a stored
 * selection (`sel_` + 16 hex). A selection keeps one or more ranges, so a
 * discontinuous structure such as `ne … point` is one anchor, not two.
 */
export const ANCHOR_ID_PATTERN = /^(?:passage|p[0-9]+(?:\.s[0-9]+)?|sel_[0-9a-f]{16})$/u
export const AnchorIdSchema = z.string().min(1).max(40).regex(ANCHOR_ID_PATTERN)

/**
 * One record key per derived artifact, so a passage record stays immutable.
 * Keys must be path-safe: the JSON backend uses each per-record key as a file
 * name and rejects anything outside `[a-zA-Z0-9_-]+` at write time.
 */
export const SAFE_RECORD_KEY_RE = /^[a-zA-Z0-9_-]+$/u
export const segmentsKey = (passageId: string): string => `segments_${passageId}`
export const analysisKey = (passageId: string): string => `analysis_${passageId}`
export const adoptionsKey = (passageId: string): string => `adoptions_${passageId}`
export const grammarKey = (topicHash: string): string => `grammar_${topicHash}`
export const selectionKey = (token: string): string => `selection_${token}`
export const selectionAnchorId = (token: string): string => `sel_${token}`
/** The gap marker used when a selection joins several ranges. */
export const SELECTION_GAP = ' … '
export const GRAMMAR_STORE_KEY = 'grammar_store'
export const runsKey = (passageId: string): string => `runs_${passageId}`
/** Segmentation is keyed by the source revision it was derived from. */
export const segmentsKeyFor = (passageId: string, sourceRevision: number): string =>
  `segments_${passageId}_${String(sourceRevision)}`
export const sourceKey = (passageId: string, revision: number): string =>
  `source_${passageId}_${String(revision)}`
/**
 * One vocabulary entry per hash of `motKey + partOfSpeech`. Hashing keeps keys
 * path-safe for accented forms and apostrophes (`cœur`, `l'être`).
 */
export const lexiconKey = (motHash: string): string => `lexicon_${motHash}`
export const LEXICON_INDEX_KEY = 'lexicon_index'

export const TRANSLATION_SOURCES = ['ai', 'user'] as const
