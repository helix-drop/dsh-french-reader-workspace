/**
 * The per-sentence analysis store.
 *
 * Two things live here that the plan insists on keeping apart:
 *
 * 1. **Storage and versions.** One record holds every sentence analysis of a
 *    passage; a separate record holds analysis *versions*, where a version names
 *    the source revision it was written against and which sentences it covers. A
 *    partial version is therefore visible as partial, and a source correction can
 *    say "this was about the old text" instead of silently re-attaching.
 * 2. **The model-facing shape.** Analysing a sentence is a generation, so the
 *    request carries an explicit JSON contract and the reply is validated before
 *    anything is written. Generated replies may save validated portions with
 *    explicit pending issues; strict manual imports still refuse invalid nodes.
 */
import type { PassageRecord } from './domain.ts';
import type { RecordTable } from './lexicon-store.ts';
import type { StoredAnalysisVersion, StoredAnalysisVersions, StoredSentenceAnalyses, StoredSentenceAnalysis } from './analysis.ts';
import type { ParagraphAnchor } from './segmentation.ts';
export declare const sentenceAnalysesKey: (passageId: string) => string;
export declare const analysisVersionsKey: (passageId: string) => string;
export declare function readSentenceAnalyses(table: RecordTable, passageId: string): StoredSentenceAnalyses;
export declare function writeSentenceAnalyses(table: RecordTable, value: StoredSentenceAnalyses): Promise<void>;
export declare function readAnalysisVersions(table: RecordTable, passageId: string): StoredAnalysisVersions;
export declare function writeAnalysisVersions(table: RecordTable, value: StoredAnalysisVersions): Promise<void>;
/**
 * Store one sentence analysis.
 *
 * The analysis must pass the gate first: an analysis with errors is refused here
 * rather than stored and shown as if it were usable. Re-analysing a sentence
 * replaces that sentence's row and leaves every other sentence untouched, so a
 * batch can be completed one sentence at a time. The revision belongs to the
 * store, not to the draft: the first analysis of a sentence is revision 1 and
 * each replacement increments it, so two analyses of one sentence can be told
 * apart by more than their timestamps.
 */
export declare function putSentenceAnalysis(table: RecordTable, analysis: StoredSentenceAnalysis, sentenceText: string): Promise<{
    stored: boolean;
    errors?: string[];
    hints?: string[];
    replaced?: boolean;
}>;
/**
 * Publish a version: which source revision it was written against, the overall
 * translation, the cohesion notes, and exactly which sentences it covers.
 *
 * Publishing is a pointer move, never a rewrite: earlier versions stay readable,
 * and the coverage list is computed from what is actually stored so a version
 * cannot claim a sentence it does not contain.
 */
export declare function publishAnalysisVersion(table: RecordTable, input: {
    passageId: string;
    sourceRevision: number;
    overallTranslation: string | null;
    cohesion: string;
    sentences: readonly {
        anchorId: string;
        text: string;
    }[];
    backend?: string | null;
    model?: string | null;
}): Promise<{
    published: boolean;
    reason?: string;
    version?: StoredAnalysisVersion;
}>;
/** What the passage's analysis covers right now, measured rather than claimed. */
export declare function coverageOf(table: RecordTable, passageId: string, sentences: readonly {
    id: string;
    text: string;
}[]): {
    covered: string[];
    missing: string[];
    failed: string[];
    stale: string[];
    perSentence: {
        anchorId: string;
        errors: string[];
        hints: string[];
    }[];
};
/**
 * The JSON contract one sentence analysis must satisfy.
 *
 * It is stated to the model as data, and the same shape is what the validator
 * checks, so "the model returned JSON" is never mistaken for "the analysis is
 * usable". Source token anchors are provided by the program; the model identifies
 * syntax and quotes. Unresolved nodes remain pending rather than receiving guessed ranges.
 */
export declare const ANALYSIS_JSON_CONTRACT: {
    readonly translation: "string — 简体中文译文";
    readonly backbone: "string — 法语主干，保留否定、必要补语与原词";
    readonly clauses: readonly [{
        readonly id: "string — 唯一标识，例如 c1";
        readonly role: "string — 中文从句类型";
        readonly startToken: "number — 首词段编号";
        readonly endToken: "number — 末词段编号，包含此词段";
        readonly text: "string — 连续的准确原文";
        readonly parentId: "string|null — 父从句标识";
    }];
    readonly constituents: readonly [{
        readonly role: "string — 中文句法功能";
        readonly startToken: "number";
        readonly endToken: "number";
        readonly text: "string — 连续的准确原文";
        readonly clauseId: "string|null — 所属从句标识";
        readonly partOfSpeech: "string|null — 中文词性";
        readonly gloss: "string — 一两句中文句意，内部成分可为空";
    }];
    readonly morphology: readonly [];
    readonly explanations: readonly [{
        readonly kind: "context|rhetoric|unverified";
        readonly text: "string — 简短说明";
        readonly start: null;
        readonly end: null;
    }];
};
export declare const ANALYSIS_CONTEXT_CHARACTER_LIMIT = 3500;
type AnalysisContextRole = 'previous' | 'current' | 'next';
export interface AnalysisContextCandidate {
    paragraphId: string;
    relation: AnalysisContextRole;
    text: string;
    start: number;
    end: number;
    included: boolean;
    reason: 'included' | 'not-selected' | 'over-budget';
}
export interface AnalysisContextSelection {
    ok: boolean;
    reason: 'current-paragraph-too-long' | 'selected-context-too-long' | 'selection-invalid' | null;
    currentParagraphId: string;
    characters: number;
    candidates: AnalysisContextCandidate[];
    includedParagraphIds: string[];
    omittedParagraphIds: string[];
}
/** Same-passage, paragraph-atomic context; the target sentence's paragraph is mandatory. */
export declare function selectAnalysisContext(paragraphs: ParagraphAnchor[], anchorId: string, requestedParagraphIds?: string[]): AnalysisContextSelection | null;
/** The instruction that asks for one sentence analysis. */
export declare function analysisPrompt(input: {
    sentence: string;
    anchorId: string;
    paragraph: string;
    previousParagraph?: string;
    nextParagraph?: string;
    contextMaterials?: {
        paragraphId: string;
        relation: AnalysisContextRole;
        text: string;
    }[];
    omittedParagraphIds?: string[];
}): string;
export type AnalysisRecord = Extract<PassageRecord, {
    kind: 'sentenceAnalyses' | 'analysisVersions';
}>;
export interface AnalysisDraftInput {
    passageId: string;
    anchorId: string;
    /** The sentence text as it stands now: the ranges are checked against it. */
    text: string;
    sourceRevision: number;
    segmentationRevision: number;
    backend: string | null;
    model: string | null;
    provenance?: 'ai' | 'user' | 'mixed';
    /** Generated results may retain valid spans while unresolved nodes remain pending. */
    allowPartial?: boolean;
}
/**
 * Read a model reply into a stored analysis, or say precisely why it cannot be.
 *
 * The reply is expected to be one JSON object, possibly wrapped in a code fence.
 * Wire token anchors and stable labels are normalized before storage UUIDs are
 * generated. Legacy offsets and numeric references remain supported. Strict
 * imports refuse invalid nodes; allowPartial retains only validated nodes and
 * records every unresolved quotation/reference instead of guessing a parent.
 */
export declare function parseAnalysisReply(reply: string, input: AnalysisDraftInput): {
    ok: true;
    analysis: StoredSentenceAnalysis;
} | {
    ok: false;
    reason: string;
    detail: string;
};
/** The first JSON object in a reply, tolerating a code fence around it. */
export declare function extractJsonObject(reply: string): Record<string, unknown> | null;
export {};
