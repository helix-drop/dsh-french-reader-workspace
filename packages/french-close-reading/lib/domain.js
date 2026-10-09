import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
import { z } from 'zod';
import { AnalysisVersionSchema, AnalysisVersionsSchema, SentenceAnalysesSchema, SentenceAnalysisSchema, } from "./analysis.js";
import { ConjugationDatasetSchema } from "./conjugation-data.js";
import { ExtractionVerdictSchema, ConclusionSchema, ConclusionsSchema, ContentVersionSchema, ContextManifestSchema, ContextsSchema, DiscussionBranchSchema, DiscussionSchema, } from "./discussion.js";
/**
 * The limits, anchor pattern and record-key helpers live in `limits.ts` so the
 * record modules can import them without a cycle. They are imported here for this
 * module's own use and re-exported, because `domain.ts` is the module consumers
 * already import.
 */
import { AnchorIdSchema, BRANCH_KINDS, TRANSLATION_SOURCES, MAX_BRANCHES, MAX_BRANCH_BODY_CHARACTERS, MAX_BRANCH_TITLE_CHARACTERS, MAX_SOURCE_CHARACTERS, MAX_TITLE_CHARACTERS, MAX_TRANSLATION_CHARACTERS, EXCERPT_CHARACTERS, lexiconKey, selectionKey, sourceKey, } from "./limits.js";
export { ANCHOR_ID_PATTERN, AnchorIdSchema, BRANCH_KINDS, DEFAULT_PAGE_SIZE, EXCERPT_CHARACTERS, GRAMMAR_STORE_KEY, LEXICON_INDEX_KEY, MAX_BRANCHES, MAX_BRANCH_BODY_CHARACTERS, MAX_BRANCH_TITLE_CHARACTERS, MAX_PAGE_SIZE, MAX_PASSAGES, MAX_SOURCE_CHARACTERS, MAX_TITLE_CHARACTERS, MAX_TRANSLATION_CHARACTERS, SAFE_RECORD_KEY_RE, SELECTION_GAP, TRANSLATION_SOURCES, adoptionsKey, analysisKey, grammarKey, lexiconKey, runsKey, segmentsKey, segmentsKeyFor, selectionAnchorId, selectionKey, sourceKey, } from "./limits.js";
export const StoredPassageSchema = z.object({
    id: z.string().uuid(),
    operationId: z.string().uuid(),
    title: z.string().min(1).max(MAX_TITLE_CHARACTERS),
    sourceText: z.string().min(1).max(MAX_SOURCE_CHARACTERS),
    /** Catalogue pointer: which source revision and rule revision are current. */
    sourceRevision: z.number().int().min(1),
    segmentationRevision: z.number().int().min(1),
    status: z.literal('source-only'),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    /** Missing on legacy rows; defaulting preserves backwards compatibility. */
    archivedAt: z.string().datetime().nullable().default(null),
    archiveOperationId: z.string().uuid().nullable().default(null),
}).strict();
/**
 * One immutable source revision. Correcting a source adds a revision; nothing
 * is overwritten, so a discussion anchored to an older revision can still show
 * the text it was written about.
 */
export const SourceRevisionSchema = z.object({
    passageId: z.string().uuid(),
    revision: z.number().int().min(1),
    text: z.string().min(1).max(MAX_SOURCE_CHARACTERS),
    note: z.string().max(MAX_TITLE_CHARACTERS).nullable(),
    operationId: z.string().uuid(),
    createdAt: z.string().datetime(),
}).strict();
/**
 * Anchor ids name the whole passage, a paragraph, a sentence, or a stored
 * selection (`sel_` + 16 hex). A selection keeps one or more ranges, so a
 * discontinuous structure such as `ne … point` is one anchor, not two.
 */
export const SentenceAnchorSchema = z.object({
    id: z.string().min(1).max(40),
    paragraphId: z.string().min(1).max(40),
    text: z.string().min(1),
    start: z.number().int().min(0),
    end: z.number().int().min(0),
}).strict();
export const ParagraphAnchorSchema = z.object({
    id: z.string().min(1).max(40),
    text: z.string().min(1),
    start: z.number().int().min(0),
    end: z.number().int().min(0),
    sentences: z.array(SentenceAnchorSchema).min(1),
}).strict();
export const SegmentationSchema = z.object({
    passageId: z.string().uuid(),
    sourceRevision: z.number().int().min(1),
    revision: z.number().int().min(1),
    paragraphs: z.array(ParagraphAnchorSchema).min(1),
}).strict();
/**
 * What a discussion note is attached to: the exact span of one source revision,
 * not a sentence number. Newer records carry it; legacy records derive it from
 * their `anchorId` until an explicit backfill runs.
 */
export const AnchorRefSchema = z.object({
    anchorId: AnchorIdSchema,
    sourceRevision: z.number().int().min(1),
    segmentationRevision: z.number().int().min(1),
    start: z.number().int().min(0),
    end: z.number().int().min(0),
    excerpt: z.string().min(1).max(MAX_SOURCE_CHARACTERS),
}).strict();
export const TranslationSchema = z.object({
    id: z.string().uuid(),
    anchorId: AnchorIdSchema,
    anchor: AnchorRefSchema.nullable().default(null),
    /** Who authored this variant. A user variant is never regenerated away. */
    source: z.enum(TRANSLATION_SOURCES).default('ai'),
    /** Comparison note: why this variant differs from the others. */
    note: z.string().max(MAX_BRANCH_BODY_CHARACTERS).default(''),
    language: z.string().min(2).max(35),
    text: z.string().min(1).max(MAX_TRANSLATION_CHARACTERS),
    createdAt: z.string().datetime(),
    operationId: z.string().uuid(),
}).strict();
export const BranchSchema = z.object({
    id: z.string().uuid(),
    parentId: z.string().uuid().nullable(),
    anchorId: AnchorIdSchema,
    anchor: AnchorRefSchema.nullable().default(null),
    kind: z.enum(BRANCH_KINDS),
    title: z.string().min(1).max(MAX_BRANCH_TITLE_CHARACTERS),
    body: z.string().max(MAX_BRANCH_BODY_CHARACTERS),
    createdAt: z.string().datetime(),
    operationId: z.string().uuid(),
}).strict();
/**
 * Which variant one anchor currently uses. Adoption lives in its own record so
 * one adoption is one atomic write, and every previous variant stays readable.
 */
export const AdoptionEntrySchema = z.object({
    anchorId: AnchorIdSchema,
    translationId: z.string().uuid(),
    previousId: z.string().uuid().nullable(),
    /**
     * The overall translation that was current when this adoption happened.
     * Reconciliation compares identity, not timestamps: two writes in the same
     * millisecond must still order correctly.
     */
    staleOverallId: z.string().uuid().nullable().default(null),
    adoptedAt: z.string().datetime(),
    operationId: z.string().uuid(),
}).strict();
export const AdoptionsSchema = z.object({
    passageId: z.string().uuid(),
    entries: z.array(AdoptionEntrySchema),
}).strict();
export const AnalysisSchema = z.object({
    passageId: z.string().uuid(),
    translations: z.array(TranslationSchema),
    branches: z.array(BranchSchema),
}).strict();
/**
 * Knowledge write an answered question intends to perform. The intent travels
 * with the answer in one record, so a crash between writes leaves the answer
 * readable and each intent either applied or still pending.
 */
export const RUN_INTENT_KINDS = ['branch', 'translation', 'grammar'];
export const RunIntentSchema = z.object({
    id: z.string().uuid(),
    kind: z.enum(RUN_INTENT_KINDS),
    anchorId: AnchorIdSchema,
    title: z.string().max(MAX_BRANCH_TITLE_CHARACTERS),
    body: z.string().max(MAX_BRANCH_BODY_CHARACTERS),
    /** Optional per-intent extras: a pitfall to append, or a level/module hint. */
    level: z.string().max(40).nullable().default(null),
    module: z.string().max(40).nullable().default(null),
    pitfall: z.string().max(MAX_BRANCH_BODY_CHARACTERS).default(''),
    status: z.enum(['pending', 'applied', 'failed']),
    appliedId: z.string().uuid().nullable(),
    detail: z.string().max(2_000).nullable(),
}).strict();
/**
 * How grammar extraction went for one answered question.
 *
 * `null` means no automatic path ran for this run (the agent path that supplies its
 * own intents). Otherwise the status is the honest outcome of reading the answer:
 * `extracted` (points were carried), `none` (the reply carried no block at all),
 * `invalid` (a block was there but unusable), `failed` (the write path refused it).
 */
/** The same shape the message carries: one verdict, declared once. */
export const RunExtractionSchema = ExtractionVerdictSchema;
export const RunSchema = z.object({
    id: z.string().uuid(),
    operationId: z.string().uuid(),
    passageId: z.string().uuid(),
    anchorId: AnchorIdSchema,
    question: z.string().min(1).max(MAX_SOURCE_CHARACTERS),
    answer: z.string().min(1).max(MAX_TRANSLATION_CHARACTERS),
    createdAt: z.string().datetime(),
    intents: z.array(RunIntentSchema),
    /**
     * Added after the first runs were stored, so it is optional-with-default: a run
     * written by an earlier build loads with `null` instead of failing the open.
     */
    extraction: RunExtractionSchema.nullable().default(null),
}).strict();
export const RunsSchema = z.object({
    passageId: z.string().uuid(),
    runs: z.array(RunSchema),
}).strict();
/**
 * One vocabulary entry. The Mot is the entry's identity: `motKey` is the exact
 * form normalised for lookup, and the record key is a hash of
 * `motKey + partOfSpeech`, so homographs with different parts of speech are
 * separate entries rather than one merged card.
 */
export const LexiconSenseSchema = z.object({
    id: z.string().uuid(),
    label: z.string().max(120),
    definition: z.string().min(1).max(MAX_TRANSLATION_CHARACTERS),
}).strict();
export const LexiconOccurrenceSchema = z.object({
    id: z.string().uuid(),
    passageId: z.string().uuid(),
    anchorId: AnchorIdSchema,
    excerpt: z.string().min(1).max(EXCERPT_CHARACTERS),
    note: z.string().max(MAX_BRANCH_BODY_CHARACTERS),
    operationId: z.string().uuid(),
    createdAt: z.string().datetime(),
}).strict();
export const LexiconSourceSchema = z.object({
    kind: z.string().min(1).max(40),
    section: z.string().min(1).max(40),
    url: z.string().max(2_000).nullable(),
    fetchedAt: z.string().datetime().nullable(),
    ok: z.boolean(),
    note: z.string().max(2_000),
}).strict();
export const LexiconEntrySchema = z.object({
    id: z.string().uuid(),
    /** The exact form the reader looked up, accents and ligatures included. */
    mot: z.string().min(1).max(120),
    /** `mot` normalised (NFC, lowercased) — the exact-lookup key. */
    motKey: z.string().min(1).max(120),
    /** A related base form. Never a lookup key: a lemma hit is only a candidate. */
    lemma: z.string().min(1).max(120).nullable(),
    partOfSpeech: z.string().min(1).max(40),
    /** Inflected forms this entry explicitly claims, e.g. `ouvrait` for `ouvrir`. */
    forms: z.array(z.string().min(1).max(120)),
    senses: z.array(LexiconSenseSchema),
    sections: z.object({
        overview: z.string().max(MAX_TRANSLATION_CHARACTERS).nullable(),
        etymology: z.string().max(MAX_TRANSLATION_CHARACTERS).nullable(),
        semanticEvolution: z.string().max(MAX_TRANSLATION_CHARACTERS).nullable(),
        collocations: z.string().max(MAX_TRANSLATION_CHARACTERS).nullable(),
        culture: z.string().max(MAX_TRANSLATION_CHARACTERS).nullable(),
        fixedExpressions: z.string().max(MAX_TRANSLATION_CHARACTERS).nullable(),
        conjugation: z.string().max(MAX_TRANSLATION_CHARACTERS).nullable(),
    }).strict(),
    sources: z.array(LexiconSourceSchema),
    /** Context notes are kept per occurrence, never merged into the entry body. */
    occurrences: z.array(LexiconOccurrenceSchema),
    provenance: z.enum(['ai', 'user', 'mixed']),
    status: z.enum(['draft', 'reviewed']),
    revision: z.number().int().min(1),
    operationId: z.string().uuid(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
}).strict();
/** Rebuildable index: form -> entries, never a second editable copy. */
export const LexiconIndexSchema = z.object({
    byForm: z.record(z.string(), z.array(z.object({
        entryId: z.string().uuid(),
        kind: z.enum(['exact', 'form']),
    }).strict())),
}).strict();
/**
 * One grammar entry. The plan's fields are kept as authored; the automatic path
 * may only touch the whitelisted ones (ask counter, last asked, examples,
 * pitfalls), so a rule never changes behind the reader's back.
 */
export const GrammarExampleSchema = z.object({
    id: z.string().uuid(),
    text: z.string().min(1).max(MAX_SOURCE_CHARACTERS),
    passageId: z.string().uuid().nullable().default(null),
    anchorId: AnchorIdSchema.nullable().default(null),
    /** The span this example was taken from, when it came from a passage. */
    anchor: AnchorRefSchema.nullable().default(null),
    question: z.string().max(MAX_SOURCE_CHARACTERS).default(''),
    /** The write that produced this example, so a retry cannot double-count. */
    intentId: z.string().uuid(),
    /**
     * The real question this example came from. Counting dedupes on this, not on
     * the intent: one question that yields two intents about the same point is
     * still one question, and a retried write keeps its original id.
     *
     * Empty string is the recorded "no question" marker — the writer emits it and
     * the readers test `!== ''` — so the schema must accept it: a `min(1)` here
     * contradicted this field's own default and rejected real stored rows on open.
     */
    questionId: z.string().max(120).default(''),
    createdAt: z.string().datetime(),
}).strict();
export const GrammarPitfallSchema = z.object({
    id: z.string().uuid(),
    text: z.string().min(1).max(MAX_BRANCH_BODY_CHARACTERS),
    intentId: z.string().uuid(),
    createdAt: z.string().datetime(),
}).strict();
export const GrammarEntrySchema = z.object({
    id: z.string().uuid(),
    topic: z.string().min(1).max(MAX_BRANCH_TITLE_CHARACTERS),
    topicKey: z.string().min(1).max(MAX_BRANCH_TITLE_CHARACTERS),
    /** Never changed by the automatic path. */
    level: z.string().max(40).nullable(),
    module: z.string().max(40).nullable(),
    keyPoints: z.string().max(MAX_TRANSLATION_CHARACTERS),
    notes: z.string().max(MAX_TRANSLATION_CHARACTERS),
    examples: z.array(GrammarExampleSchema),
    pitfalls: z.array(GrammarPitfallSchema),
    mastery: z.enum(['learning', 'reviewing', 'known']),
    /** Who wrote the content, kept apart from how well it is learned. */
    contentStatus: z.enum(['ai-unverified', 'user', 'mixed']),
    askCount: z.number().int().min(0),
    lastAskedAt: z.string().datetime().nullable(),
    revision: z.number().int().min(1),
    operationId: z.string().uuid(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
}).strict();
/** A near match the automatic path refuses to choose between. */
export const GrammarPendingSchema = z.object({
    id: z.string().uuid(),
    topic: z.string().min(1).max(MAX_BRANCH_TITLE_CHARACTERS),
    body: z.string().max(MAX_BRANCH_BODY_CHARACTERS),
    candidates: z.array(z.object({ entryId: z.string().uuid(), topic: z.string() }).strict()),
    passageId: z.string().uuid().nullable().default(null),
    anchorId: AnchorIdSchema.nullable().default(null),
    question: z.string().max(MAX_SOURCE_CHARACTERS).default(''),
    intentId: z.string().uuid(),
    /** The real question this candidate came from; empty when none — see {@link GrammarExampleSchema}. */
    questionId: z.string().max(120).default(''),
    createdAt: z.string().datetime(),
    /** Set once a human decision closes the candidate; the row is kept as a trace. */
    resolution: z.enum(['attached', 'created', 'discarded']).nullable().default(null),
    resolvedEntryId: z.string().uuid().nullable().default(null),
    resolvedAt: z.string().datetime().nullable().default(null),
    resolutionOperationId: z.string().uuid().nullable().default(null),
}).strict();
export const GrammarStoreSchema = z.object({
    /** Rebuildable map: normalised topic -> entry ids. */
    byTopic: z.record(z.string(), z.array(z.string().uuid())),
    pending: z.array(GrammarPendingSchema),
}).strict();
export const SelectionRangeSchema = z.object({
    start: z.number().int().min(0),
    end: z.number().int().min(0),
}).strict();
export const SelectionSchema = z.object({
    passageId: z.string().uuid(),
    /** The stable token used as `anchorId` by every note that points here. */
    token: z.string().regex(/^[0-9a-f]{16}$/u),
    sourceRevision: z.number().int().min(1),
    ranges: z.array(SelectionRangeSchema).min(1).max(8),
    /** The selected text; discontinuous ranges are joined with a gap marker. */
    excerpt: z.string().min(1).max(EXCERPT_CHARACTERS),
    note: z.string().max(MAX_BRANCH_TITLE_CHARACTERS),
    operationId: z.string().uuid(),
    createdAt: z.string().datetime(),
}).strict();
export { AnalysisVersionSchema, AnalysisVersionsSchema, ClauseSchema, ConstituentSchema, ExplanationSchema, MorphologySchema, SentenceAnalysisSchema, SentenceAnalysesSchema, } from "./analysis.js";
export { ConclusionSchema, ConclusionsSchema, ContentVersionSchema, ContextManifestSchema, ContextMaterialSchema, ContextsSchema, DiscussionBranchSchema, DiscussionMessageSchema, DiscussionSchema, } from "./discussion.js";
/**
 * The audit record of one storage migration.
 *
 * A data move that a reader cannot inspect afterwards is indistinguishable from
 * data loss, so the move writes down what it did: which migration, between which
 * domain versions, how many records it moved, skipped, or emptied, and when.
 */
const StorageMigrationSchema = z.object({
    name: z.string().min(1).max(64),
    fromVersion: z.number().int().min(0),
    toVersion: z.number().int().min(0),
    migratedManifests: z.number().int().min(0),
    skippedManifests: z.number().int().min(0),
    emptiedLegacyRecords: z.number().int().min(0),
    migratedAt: z.string().datetime(),
}).strict();
/**
 * One lemma's pronunciation dataset, as fetched.
 *
 * `dataset` is null while a fetch is pending or failed: the record then says what
 * happened instead of carrying a paradigm nobody retrieved. `missingForms` names the
 * forms a partial fetch did not get, so an incomplete paradigm can say which.
 */
export const ConjugationDatasetRecordSchema = z.object({
    id: z.string().uuid(),
    lemma: z.string().min(1).max(80),
    source: z.string().min(1).max(40),
    sourceVersion: z.string().min(1).max(40),
    fetchStatus: z.enum(['ok', 'partial', 'rate-limited', 'failed', 'no-forms']),
    failure: z.string().max(2_000).nullable().default(null),
    missingForms: z.array(z.string().max(80)).default([]),
    dataset: ConjugationDatasetSchema.nullable().default(null),
    fetchedAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
}).strict();
/**
 * One generation the Host owes the reader: created before the model is called,
 * updated as the answer arrives, and left behind with its outcome.
 *
 * The record exists because "what happened to my question" has to survive a
 * restart. A job still `running` when the Host opens again was interrupted by that
 * restart: it is reconciled to `interrupted` rather than pretended complete, and
 * whatever partial text it captured stays readable.
 */
export const GenerationJobSchema = z.object({
    id: z.string().uuid(),
    /** The caller's operation id, so a retried send finds its own job. */
    operationId: z.string().uuid(),
    kind: z.enum(['ask', 'analyse']),
    passageId: z.string().uuid(),
    branchId: z.string().uuid().nullable().default(null),
    anchorId: AnchorIdSchema.nullable().default(null),
    backend: z.string().min(1).max(40),
    model: z.string().min(1).max(160),
    status: z.enum(['running', 'succeeded', 'failed', 'cancelled', 'interrupted']),
    /**
     * How far the call got: dispatched → preparing (metadata/路由解析) → streaming
     * (provider stream open). A job that stops updating while `phase` is
     * 'preparing' has not reached the provider yet; while 'streaming' it has, and
     * is waiting on the model. The evidence for "where is it stuck" lives here.
     *
     * Optional without a default on purpose: a parse must never inject a key, or
     * an imported record stops being byte-identical to the record in the bundle
     * and a second import reports it as changed. Field order matches the writer
     * for the same reason.
     */
    phase: z.string().max(24).nullable().optional(),
    /** How many times this operation has been attempted; a retry increments it. */
    attempt: z.number().int().min(1).default(1),
    /** Text captured while the answer was still arriving. */
    partialText: z.string().max(MAX_TRANSLATION_CHARACTERS).default(''),
    finish: z.enum(['stop', 'max-tokens', 'cancelled', 'error']).nullable().default(null),
    failure: z.string().max(2_000).nullable().default(null),
    resolvedModel: z.string().max(120).nullable().default(null),
    usage: z.object({
        inputTokens: z.number().int().min(0).nullable().default(null),
        outputTokens: z.number().int().min(0).nullable().default(null),
    }).strict().nullable().default(null),
    /** The answer message and the context it was sent with, once there are any. */
    messageId: z.string().uuid().nullable().default(null),
    contextId: z.string().uuid().nullable().default(null),
    startedAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    finishedAt: z.string().datetime().nullable().default(null),
}).strict();
const PassageRecordSchema = z.discriminatedUnion('kind', [z.object({
        kind: z.literal('passage'),
        recordVersion: z.literal(1),
        payload: StoredPassageSchema,
    }).strict(),
    z.object({
        kind: z.literal('segments'),
        recordVersion: z.literal(1),
        payload: SegmentationSchema,
    }).strict(),
    z.object({
        kind: z.literal('analysis'),
        recordVersion: z.literal(1),
        payload: AnalysisSchema,
    }).strict(),
    z.object({
        kind: z.literal('runs'),
        recordVersion: z.literal(1),
        payload: RunsSchema,
    }).strict(),
    z.object({
        kind: z.literal('source'),
        recordVersion: z.literal(1),
        payload: SourceRevisionSchema,
    }).strict(),
    z.object({
        kind: z.literal('lexicon'),
        recordVersion: z.literal(1),
        payload: LexiconEntrySchema,
    }).strict(),
    z.object({
        kind: z.literal('lexiconIndex'),
        recordVersion: z.literal(1),
        payload: LexiconIndexSchema,
    }).strict(),
    z.object({
        kind: z.literal('adoptions'),
        recordVersion: z.literal(1),
        payload: AdoptionsSchema,
    }).strict(),
    z.object({
        kind: z.literal('grammar'),
        recordVersion: z.literal(1),
        payload: GrammarEntrySchema,
    }).strict(),
    z.object({
        kind: z.literal('grammarStore'),
        recordVersion: z.literal(1),
        payload: GrammarStoreSchema,
    }).strict(),
    z.object({
        kind: z.literal('selection'),
        recordVersion: z.literal(1),
        payload: SelectionSchema,
    }).strict(),
    z.object({
        kind: z.literal('discussion'),
        recordVersion: z.literal(1),
        payload: DiscussionSchema,
    }).strict(),
    z.object({
        kind: z.literal('contexts'),
        recordVersion: z.literal(1),
        payload: ContextsSchema,
    }).strict(),
    z.object({
        kind: z.literal('contextManifest'),
        recordVersion: z.literal(1),
        payload: ContextManifestSchema,
    }).strict(),
    z.object({
        kind: z.literal('storageMigration'),
        recordVersion: z.literal(1),
        payload: StorageMigrationSchema,
    }).strict(),
    z.object({
        kind: z.literal('generationJob'),
        recordVersion: z.literal(1),
        payload: GenerationJobSchema,
    }).strict(),
    z.object({
        kind: z.literal('conjugationDataset'),
        recordVersion: z.literal(1),
        payload: ConjugationDatasetRecordSchema,
    }).strict(),
    z.object({
        kind: z.literal('conclusions'),
        recordVersion: z.literal(1),
        payload: ConclusionsSchema,
    }).strict(),
    z.object({
        kind: z.literal('contentVersion'),
        recordVersion: z.literal(1),
        payload: ContentVersionSchema,
    }).strict(),
    z.object({
        kind: z.literal('sentenceAnalyses'),
        recordVersion: z.literal(1),
        payload: SentenceAnalysesSchema,
    }).strict(),
    z.object({
        kind: z.literal('analysisVersions'),
        recordVersion: z.literal(1),
        payload: AnalysisVersionsSchema,
    }).strict(),
]);
/**
 * The plugin's storage domain.
 *
 * Version 2 adds the `contextManifest` and `storageMigration` record kinds. The
 * change is additive — every version 1 record still satisfies these schemas — and
 * `compatibleVersions: [1]` is what says so to the backend: with the `per-record`
 * layout an unlisted version's documents are discarded rather than migrated, so a
 * version bump without this declaration would hide every existing passage.
 */
export const FRENCH_READER_DOMAIN = defineDomain({
    name: 'french_reader',
    version: 2,
    compatibleVersions: [1],
    layout: 'per-record',
    tables: {
        records: domainTable(PassageRecordSchema),
    },
});
