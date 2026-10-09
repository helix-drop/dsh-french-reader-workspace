export type PassageStatus = 'source-only';
/** Immutable source anchor; later revisions will add segmentation and analysis references. */
export interface Passage {
    id: string;
    title: string;
    sourceText: string;
    sourceRevision: number;
    segmentationRevision: number;
    status: PassageStatus;
    createdAt: string;
    updatedAt: string;
    archivedAt: string | null;
    archiveOperationId: string | null;
}
export interface PassageSummary {
    id: string;
    title: string;
    excerpt: string;
    characterCount: number;
    sourceRevision: number;
    createdAt: string;
    updatedAt: string;
}
export interface ListPassagesRequest {
    offset: number;
    limit: number;
}
export interface ListPassagesValue {
    items: PassageSummary[];
    offset: number;
    total: number;
    hasMore: boolean;
}
export interface GetPassageRequest {
    id: string;
}
export interface GetPassageValue {
    passage: Passage | null;
}
export interface ArchivePassageRequest {
    passageId: string;
    operationId: string;
    expectedSourceRevision: number;
}
export type ArchivePassageValue = {
    kind: 'archived';
    passage: Passage;
} | {
    kind: 'already-archived';
    passage: Passage;
} | {
    kind: 'conflict';
    reason: 'passage-unknown' | 'operation-used' | 'revision-conflict';
};
export interface RestorePassageRequest {
    passageId: string;
    expectedSourceRevision: number;
}
export type RestorePassageValue = {
    kind: 'restored';
    passage: Passage;
} | {
    kind: 'already-active';
    passage: Passage;
} | {
    kind: 'conflict';
    reason: 'passage-unknown' | 'revision-conflict';
};
/** One half-open character range of a phrase selection. */
export interface SelectionRange {
    start: number;
    end: number;
}
export interface CreateSelectionRequest {
    passageId: string;
    operationId: string;
    /** One range for a phrase, several for a discontinuous structure. */
    ranges: SelectionRange[];
    note: string;
}
export type CreateSelectionValue = {
    kind: 'created';
    anchorId: string;
    excerpt: string;
    ranges: SelectionRange[];
} | {
    kind: 'already-existed';
    anchorId: string;
    excerpt: string;
    ranges: SelectionRange[];
} | {
    kind: 'conflict';
    reason: 'passage-unknown' | 'range-out-of-bounds' | 'range-not-integer' | 'ranges-out-of-range';
};
/** One exact sentence boundary displayed inside an import preview paragraph. */
export interface ImportSentencePreview {
    id: string;
    text: string;
    start: number;
    end: number;
}
/** One paragraph as the import preview will store it. */
export interface ImportBlockPreview {
    id: string;
    sentences: number;
    excerpt: string;
    /** Present when the Host supports complete sentence-boundary previews. */
    sentenceDetails?: ImportSentencePreview[];
}
export interface ImportFlagView {
    code: string;
    /** `error` blocks the save; `hint` is the reader's judgement. */
    severity: 'error' | 'hint';
    detail: string;
}
/** What an import would store, before anything is written. */
export interface ImportPreviewValue {
    title: string;
    characters: number;
    paragraphs: number;
    sentences: number;
    blocks: ImportBlockPreview[];
    flags: ImportFlagView[];
    head: string;
    tail: string;
}
export interface PreviewImportRequest {
    title: string;
    sourceText: string;
}
export interface CreatePassageRequest {
    id: string;
    operationId: string;
    title: string;
    sourceText: string;
}
export type CreatePassageValue = {
    kind: 'created';
    passage: Passage;
} | {
    kind: 'already-saved';
    passage: Passage;
} | {
    kind: 'conflict';
    reason: 'id-used' | 'operation-used' | 'limit-reached';
    maxPassages: number;
};
export interface ExportPassagesValue {
    schemaVersion: 1;
    exportedAt: string;
    passages: Passage[];
}
/**
 * The value space a Remote boundary accepts. A stored record is JSON by
 * construction (the domain medium round-trips it as JSON), so the backup can
 * carry records of every kind through one wire shape without asking the Remote
 * layer to accept `unknown`.
 */
export type JsonValue = string | number | boolean | null | JsonValue[] | {
    [key: string]: JsonValue;
};
/**
 * One raw library record with the key it is stored under. The record itself is
 * opaque to the wire: every record kind travels through this one shape, which is
 * what lets a backup restore analysis, discussions and knowledge rather than
 * only the sources.
 */
export interface ExportLibraryRecord {
    key: string;
    record: JsonValue;
}
export interface ExportLibraryValue {
    schemaVersion: 1;
    exportedAt: string;
    records: ExportLibraryRecord[];
}
export interface ExportLibraryRequest {
    /** Reserved: a whole-library backup takes no parameters today. */
    scope: 'all';
}
export interface ImportLibraryRequest extends ExportLibraryValue {
}
export interface ImportLibraryValue {
    imported: number;
    skipped: number;
    conflicts: {
        key: string;
        reason: string;
    }[];
}
/** One sentence inside a paragraph; offsets index the passage source. */
export interface SentenceAnchor {
    id: string;
    paragraphId: string;
    text: string;
    start: number;
    end: number;
}
export interface ParagraphAnchor {
    id: string;
    text: string;
    start: number;
    end: number;
    sentences: SentenceAnchor[];
}
/** Deterministic segmentation of one immutable passage source. */
export interface Segmentation {
    passageId: string;
    sourceRevision: number;
    revision: number;
    paragraphs: ParagraphAnchor[];
}
export interface GetSegmentationRequest {
    passageId: string;
}
export interface GetSegmentationValue {
    segmentation: Segmentation | null;
}
/**
 * A discussion branch is anchored to a passage, paragraph, or sentence and may
 * hang off another branch: the discussion is a tree, not a linear transcript,
 * so sibling branches under one anchor stay independent.
 */
export type BranchKind = 'constituents' | 'grammar' | 'vocabulary' | 'translation' | 'note';
/**
 * Where a stored note sits relative to the current source.
 *
 * - `resolved`  the stored span still carries the excerpt it was written about;
 * - `relocated` the excerpt moved but occurs exactly once, so `currentAnchorId`
 *               names where it is now — the stored anchor is left untouched;
 * - `unresolved` the excerpt is gone or ambiguous; the note keeps its original
 *               anchor and is never re-attached by guesswork.
 */
export type AnchorStatus = 'resolved' | 'relocated' | 'unresolved';
/** The span of one source revision a note is attached to. */
export interface AnchorRef {
    anchorId: string;
    sourceRevision: number;
    segmentationRevision: number;
    start: number;
    end: number;
    excerpt: string;
}
export interface Translation {
    id: string;
    anchorId: string;
    anchor: AnchorRef | null;
    /** Who authored this variant: a user variant is never regenerated away. */
    source: 'ai' | 'user';
    /** Comparison note explaining how this variant differs. */
    note: string;
    language: string;
    text: string;
    createdAt: string;
    operationId: string;
    anchorStatus: AnchorStatus;
    currentAnchorId: string | null;
    /** Why this status: span | relabelled | moved | legacy-resolved | legacy-stale | missing | ambiguous-or-gone. */
    anchorReason: string;
}
export interface Branch {
    id: string;
    parentId: string | null;
    anchorId: string;
    anchor: AnchorRef | null;
    kind: BranchKind;
    title: string;
    body: string;
    createdAt: string;
    operationId: string;
    anchorStatus: AnchorStatus;
    currentAnchorId: string | null;
    /** Why this status: span | relabelled | moved | legacy-resolved | legacy-stale | missing | ambiguous-or-gone. */
    anchorReason: string;
}
export interface Analysis {
    passageId: string;
    translations: Translation[];
    branches: Branch[];
}
export interface SaveTranslationRequest {
    passageId: string;
    operationId: string;
    anchorId: string;
    /** Who authored this variant; defaults to the assistant. */
    source?: 'ai' | 'user';
    /** Comparison note explaining how this variant differs. */
    note?: string;
    language: string;
    text: string;
}
export type SaveTranslationValue = {
    kind: 'saved';
    translation: Translation;
} | {
    kind: 'already-saved';
    translation: Translation;
} | {
    kind: 'conflict';
    reason: 'passage-unknown' | 'anchor-unknown' | 'operation-used';
};
export interface AddBranchRequest {
    passageId: string;
    operationId: string;
    parentId: string | null;
    anchorId: string;
    kind: BranchKind;
    title: string;
    body: string;
}
export type AddBranchValue = {
    kind: 'created';
    branch: Branch;
} | {
    kind: 'already-saved';
    branch: Branch;
} | {
    kind: 'conflict';
    reason: 'passage-unknown' | 'anchor-unknown' | 'parent-unknown' | 'operation-used' | 'limit-reached';
    maxBranches: number;
};
/** One vocabulary entry as the panel and the model read it. */
export interface LexiconSenseView {
    id: string;
    label: string;
    definition: string;
}
export interface LexiconOccurrenceView {
    id: string;
    passageId: string;
    anchorId: string;
    excerpt: string;
    note: string;
    createdAt: string;
}
export interface LexiconSourceView {
    kind: string;
    section: string;
    url: string | null;
    fetchedAt: string | null;
    ok: boolean;
    note: string;
}
export interface LexiconSectionsView {
    overview: string | null;
    etymology: string | null;
    semanticEvolution: string | null;
    collocations: string | null;
    culture: string | null;
    fixedExpressions: string | null;
    conjugation: string | null;
}
/** A grammar entry as the panel lists it. */
export interface GrammarEntryView {
    entryId: string;
    topic: string;
    level: string | null;
    module: string | null;
    mastery: 'learning' | 'reviewing' | 'known';
    /** Who wrote the content, kept apart from how well it is learned. */
    contentStatus: 'ai-unverified' | 'user' | 'mixed';
    askCount: number;
    lastAskedAt: string | null;
    revision: number;
    examples: number;
    exampleTexts: string[];
    notes: string;
    pitfalls: number;
    pitfallTexts: string[];
    keyPoints: string;
}
/** A near match the automatic path refused to choose between. */
export interface GrammarPendingView {
    pendingId: string;
    topic: string;
    body: string;
    candidates: {
        entryId: string;
        topic: string;
    }[];
    resolution: 'attached' | 'created' | 'discarded' | null;
    resolvedEntryId: string | null;
}
export interface ListGrammarValue {
    entries: GrammarEntryView[];
    pending: GrammarPendingView[];
}
export interface ListLexiconValue {
    entries: LexiconView[];
    total: number;
}
/**
 * Pronunciation data for one verb, as the panel reads it.
 *
 * The three states are the point: a dataset with its bases, a fetch that did not
 * finish with its reason, or `no-data` — which is an answer, never a paradigm
 * generated from memory.
 */
export interface LookupMotRequest {
    /** The exact form as it appears in the text; never a lemma substituted for it. */
    mot: string;
    /** Optional part-of-speech hint; it narrows, it does not decide a hit. */
    partOfSpeech: string | null;
}
export interface AdoptTranslationRequest {
    passageId: string;
    anchorId: string;
    translationId: string;
    operationId: string;
}
export interface AdoptTranslationValue {
    adopted: boolean;
    alreadyAdopted?: boolean;
    reason?: string;
    previousId?: string | null;
}
export interface ConjugationRequest {
    /** The verb's infinitive, e.g. `venir`. */
    lemma: string;
}
export interface ConjugationBaseView {
    /** The pronounced stem, without syllable notation. */
    ipa: string;
    /** The persons that share it, as `1s`…`3p`. */
    persons: string[];
    /** The shared spelling, when every person of the base spells it the same way. */
    writtenStem: string | null;
}
export interface ConjugationFormView {
    person: string;
    written: string;
    /** The whole form's pronunciation, notation included. */
    ipa: string;
    baseIndex: number | null;
}
export interface ConjugationTenseView {
    mood: string;
    tense: string;
    label: string;
    bases: ConjugationBaseView[];
    forms: ConjugationFormView[];
    /** Persons the data does not cover, so the card can say what is absent. */
    missingPersons: string[];
    notes: string[];
}
export type ReadConjugationValue = {
    state: 'no-data';
    lemma: string;
    reason: string;
} | {
    state: 'pending';
    lemma: string;
    source: string;
    fetchStatus: string;
    reason: string;
    missingForms: string[];
} | {
    state: 'dataset';
    lemma: string;
    source: string;
    fetchStatus: string;
    missingForms: string[];
    tenses: ConjugationTenseView[];
};
export interface FetchConjugationValue {
    fetched: boolean;
    /** Set when nothing was requested: the reason is then a refusal code. */
    reason?: string;
    status?: string;
    bases?: number;
    tenses?: number;
    missingForms?: number;
    requests?: number;
    notes?: string[];
    failure?: string | null;
}
export interface ListLexiconRequest {
    /** Reserved for future filtering; the listing is currently whole-library. */
    scope: 'all';
}
export interface RenderLexiconRequest {
    entryId: string;
    /** Include §3 for types that omit it by default. */
    wantsEtymology: boolean;
}
export interface LexiconSectionView {
    number: string;
    title: string;
    required: boolean;
}
export type RenderLexiconValue = {
    kind: 'card';
    rendered: string;
    sections: LexiconSectionView[];
    errors: string[];
    hints: string[];
} | {
    kind: 'missing';
};
export interface ResolveGrammarRequest {
    pendingId: string;
    decision: 'attach' | 'create' | 'discard';
    /** Required for `attach`: the entry the candidate belongs to. */
    entryId: string | null;
    /** Only when the reader deliberately rewrites the rule wording. */
    keyPoints: string | null;
    operationId: string;
}
export type ResolveGrammarValue = {
    kind: 'attached';
    entryId: string;
    outcome: string;
} | {
    kind: 'created';
    entryId: string;
    outcome: string;
} | {
    kind: 'discarded';
} | {
    kind: 'already-resolved';
    entryId: string | null;
    outcome: string;
} | {
    kind: 'conflict';
    reason: 'pending-unknown' | 'entry-unknown';
};
export interface ListGrammarRequest {
    /** Reserved for future filtering; the listing is currently whole-library. */
    scope: 'all';
}
export interface LexiconView {
    entryId: string;
    mot: string;
    lemma: string | null;
    partOfSpeech: string;
    forms: string[];
    senses: LexiconSenseView[];
    sections: LexiconSectionsView;
    sources: LexiconSourceView[];
    occurrences: LexiconOccurrenceView[];
    provenance: 'ai' | 'user' | 'mixed';
    status: 'draft' | 'reviewed';
    revision: number;
    updatedAt: string;
}
/**
 * Result of an exact-Mot lookup: `found` is true only when the Mot itself is
 * stored. A lemma or inflected-form match appears in `candidates` and never
 * counts as a hit.
 */
export interface LexiconLookup {
    mot: string;
    motKey: string;
    found: boolean;
    entries: LexiconView[];
    candidates: LexiconView[];
}
/** Create one exact Mot entry from an explicit reader action, never from a lookup alone. */
export interface CreateLexiconEntryRequest {
    mot: string;
    partOfSpeech: string;
    lemma: string | null;
    forms: string[];
    label: string;
    definition: string;
    /** Explicit reader-authored entries default to user; model-assisted drafts retain mixed provenance. */
    provenance?: 'user' | 'mixed';
    operationId: string;
    passageId: string;
    anchorId: string;
    occurrenceNote: string;
}
export interface CreateLexiconOccurrenceValue {
    kind: 'appended' | 'already-appended' | 'not-attempted' | 'failed';
    reason: string | null;
}
export type CreateLexiconEntryValue = {
    kind: 'created' | 'exists';
    entryId: string;
    occurrence: CreateLexiconOccurrenceValue;
} | {
    kind: 'conflict';
    entryId: null;
    reason: 'passage-unknown' | 'anchor-unknown' | 'mot-blank' | 'key-collision';
    occurrence: CreateLexiconOccurrenceValue;
};
/** Which variant one anchor currently uses. */
export interface Adoption {
    anchorId: string;
    translationId: string;
    previousId: string | null;
    /** Overall translation that was current when this adoption happened. */
    staleOverallId: string | null;
    adoptedAt: string;
}
/** One sentence whose adopted variant is newer than the overall translation. */
export interface ReconciliationItem {
    anchorId: string;
    previousText: string | null;
    currentText: string;
}
/**
 * The overall translation is a decision, so it is never rewritten silently:
 * this says which sentences changed under it and what they used to say.
 */
export interface Reconciliation {
    passageTranslationId: string | null;
    needed: boolean;
    items: ReconciliationItem[];
}
export interface ListAnalysisRequest {
    passageId: string;
}
export interface ListAnalysisValue {
    analysis: Analysis | null;
    adoptions: Adoption[];
    reconciliation: Reconciliation;
}
/**
 * The generation, context and discussion surface lives in its own module so the
 * request shapes stay readable; it is re-exported here because that is where the
 * public `./types` subpath is declared.
 */
export type { AskInput, AskRequest, AskFrame, AskResult, BackendModelView, BackendStatus, CancelAnalysisRequest, CancelAnalysisValue, ConclusionView, ContextExtra, ContextMaterialView, CreateBranchRequest, CreateBranchValue, DiscussionBranchView, DiscussionMessageView, AnalyseParagraphRequest, AnalyseParagraphResult, AnalyseSentenceRequest, AnalyseSentenceResult, AnalysisCoverageValue, AnalysisContextRelation, AnalysisContextMaterial, PreviewAnalysisContextRequest, PreviewAnalysisContextValue, DiscussionView, FetchLexiconSourceRequest, FetchLexiconSourceValue, LexiconSourceKind, ListBackendModelsRequest, ListBackendModelsValue, ListBackendsRequest, ListBackendsValue, ListDiscussionRequest, ListLexiconSourcesRequest, ListLexiconSourcesValue, PreviewAskRequest, PreviewAskValue, PublishAnalysisRequest, PublishAnalysisValue, PutSentenceAnalysisRequest, PutSentenceAnalysisValue, ReadAnalysisCoverageRequest, ReadContextRequest, ReadContextValue, ReadSentenceAnalysisRequest, ReadSentenceAnalysisValue, RecordConclusionRequest, RecordConclusionValue, SetBranchStateRequest, SetBranchStateValue, SetGrammarMasteryRequest, SetGrammarMasteryValue, } from './generation-types.ts';
