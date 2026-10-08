/**
 * Storage-independent limits, ids and base schemas.
 *
 * These are declared once and imported by every module that needs them, because
 * the record modules are composed by `domain.ts` and cannot import back from it
 * without a cycle. `domain.ts` re-exports them, so a consumer that already
 * imports the domain keeps working.
 */
import { z } from 'zod';
export declare const MAX_PASSAGES = 250;
export declare const MAX_PAGE_SIZE = 100;
export declare const DEFAULT_PAGE_SIZE = 50;
export declare const MAX_SOURCE_CHARACTERS = 20000;
export declare const MAX_TITLE_CHARACTERS = 160;
export declare const MAX_TRANSLATION_CHARACTERS = 20000;
export declare const MAX_BRANCH_TITLE_CHARACTERS = 160;
export declare const MAX_BRANCH_BODY_CHARACTERS = 20000;
export declare const MAX_BRANCHES = 1000;
/** How many characters of context one vocabulary occurrence keeps. */
export declare const EXCERPT_CHARACTERS = 500;
export declare const BRANCH_KINDS: readonly ["constituents", "grammar", "vocabulary", "translation", "note"];
/**
 * Anchor ids name the whole passage, a paragraph, a sentence, or a stored
 * selection (`sel_` + 16 hex). A selection keeps one or more ranges, so a
 * discontinuous structure such as `ne … point` is one anchor, not two.
 */
export declare const ANCHOR_ID_PATTERN: RegExp;
export declare const AnchorIdSchema: z.ZodString;
/**
 * One record key per derived artifact, so a passage record stays immutable.
 * Keys must be path-safe: the JSON backend uses each per-record key as a file
 * name and rejects anything outside `[a-zA-Z0-9_-]+` at write time.
 */
export declare const SAFE_RECORD_KEY_RE: RegExp;
export declare const segmentsKey: (passageId: string) => string;
export declare const analysisKey: (passageId: string) => string;
export declare const adoptionsKey: (passageId: string) => string;
export declare const grammarKey: (topicHash: string) => string;
export declare const selectionKey: (token: string) => string;
export declare const selectionAnchorId: (token: string) => string;
/** The gap marker used when a selection joins several ranges. */
export declare const SELECTION_GAP = " \u2026 ";
export declare const GRAMMAR_STORE_KEY = "grammar_store";
export declare const runsKey: (passageId: string) => string;
/** Segmentation is keyed by the source revision it was derived from. */
export declare const segmentsKeyFor: (passageId: string, sourceRevision: number) => string;
export declare const sourceKey: (passageId: string, revision: number) => string;
/**
 * One vocabulary entry per hash of `motKey + partOfSpeech`. Hashing keeps keys
 * path-safe for accented forms and apostrophes (`cœur`, `l'être`).
 */
export declare const lexiconKey: (motHash: string) => string;
export declare const LEXICON_INDEX_KEY = "lexicon_index";
export declare const TRANSLATION_SOURCES: readonly ["ai", "user"];
