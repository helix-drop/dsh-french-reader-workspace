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
 *    anything is written. A reply that fails the gate is reported with its errors
 *    and stored nowhere.
 */
import type { PassageRecord } from './domain.ts';
import type { RecordTable } from './lexicon-store.ts';
import type { StoredAnalysisVersion, StoredAnalysisVersions, StoredSentenceAnalyses, StoredSentenceAnalysis } from './analysis.ts';
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
 * batch can be completed one sentence at a time.
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
 * usable". Ranges are left for the model to fill from the sentence it was given;
 * a reply whose ranges do not fit is refused by the gate with the offending range
 * named.
 */
export declare const ANALYSIS_JSON_CONTRACT: {
    readonly translation: "string — 该句的中文译文";
    readonly backbone: "string — 去掉修饰后的句子主干";
    readonly clauses: readonly [{
        readonly role: "string — 主句／关系从句／补语从句…";
        readonly start: "number";
        readonly end: "number";
        readonly text: "string";
        readonly parentIndex: "number|null — 父从句在下标中的位置";
    }];
    readonly constituents: readonly [{
        readonly role: "string — 主语／谓语／直接宾语／表语／宾补／状语…";
        readonly start: "number";
        readonly end: "number";
        readonly text: "string";
        readonly clauseIndex: "number|null";
        readonly partOfSpeech: "string|null — 词性，不是句法功能";
    }];
    readonly morphology: readonly [{
        readonly form: "string";
        readonly lemma: "string|null";
        readonly partOfSpeech: "string|null";
        readonly tense: "string|null";
        readonly mood: "string|null";
        readonly person: "string|null";
        readonly gender: "string|null";
        readonly number: "string|null";
        readonly agreesWith: "string|null";
        readonly note: "string";
    }];
    readonly explanations: readonly [{
        readonly kind: "syntax|context|rhetoric|unverified";
        readonly text: "string";
        readonly start: "number|null";
        readonly end: "number|null";
    }];
};
/** The instruction that asks for one sentence analysis. */
export declare function analysisPrompt(input: {
    sentence: string;
    anchorId: string;
    paragraph: string;
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
}
/**
 * Read a model reply into a stored analysis, or say precisely why it cannot be.
 *
 * The reply is expected to be one JSON object, possibly wrapped in a code fence.
 * Index references (`parentIndex`, `clauseIndex`) are how a model can point at
 * another item without inventing an id; they are resolved here into real ids, and
 * an index that names nothing is a refusal rather than a dropped parent.
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
