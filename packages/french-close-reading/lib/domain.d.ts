import { z } from 'zod';
import { type StoredExtractionVerdict } from './discussion.ts';
export { ANCHOR_ID_PATTERN, AnchorIdSchema, BRANCH_KINDS, DEFAULT_PAGE_SIZE, EXCERPT_CHARACTERS, GRAMMAR_STORE_KEY, LEXICON_INDEX_KEY, MAX_BRANCHES, MAX_BRANCH_BODY_CHARACTERS, MAX_BRANCH_TITLE_CHARACTERS, MAX_PAGE_SIZE, MAX_PASSAGES, MAX_SOURCE_CHARACTERS, MAX_TITLE_CHARACTERS, MAX_TRANSLATION_CHARACTERS, SAFE_RECORD_KEY_RE, SELECTION_GAP, TRANSLATION_SOURCES, adoptionsKey, analysisKey, grammarKey, lexiconKey, runsKey, segmentsKey, segmentsKeyFor, selectionAnchorId, selectionKey, sourceKey, } from './limits.ts';
export declare const StoredPassageSchema: z.ZodObject<{
    id: z.ZodString;
    operationId: z.ZodString;
    title: z.ZodString;
    sourceText: z.ZodString;
    sourceRevision: z.ZodNumber;
    segmentationRevision: z.ZodNumber;
    status: z.ZodLiteral<"source-only">;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    archivedAt: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    archiveOperationId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}, z.core.$strict>;
export type StoredPassage = z.infer<typeof StoredPassageSchema>;
/**
 * One immutable source revision. Correcting a source adds a revision; nothing
 * is overwritten, so a discussion anchored to an older revision can still show
 * the text it was written about.
 */
export declare const SourceRevisionSchema: z.ZodObject<{
    passageId: z.ZodString;
    revision: z.ZodNumber;
    text: z.ZodString;
    note: z.ZodNullable<z.ZodString>;
    operationId: z.ZodString;
    createdAt: z.ZodString;
}, z.core.$strict>;
export type StoredSourceRevision = z.infer<typeof SourceRevisionSchema>;
/**
 * Anchor ids name the whole passage, a paragraph, a sentence, or a stored
 * selection (`sel_` + 16 hex). A selection keeps one or more ranges, so a
 * discontinuous structure such as `ne … point` is one anchor, not two.
 */
export declare const SentenceAnchorSchema: z.ZodObject<{
    id: z.ZodString;
    paragraphId: z.ZodString;
    text: z.ZodString;
    start: z.ZodNumber;
    end: z.ZodNumber;
}, z.core.$strict>;
export declare const ParagraphAnchorSchema: z.ZodObject<{
    id: z.ZodString;
    text: z.ZodString;
    start: z.ZodNumber;
    end: z.ZodNumber;
    sentences: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        paragraphId: z.ZodString;
        text: z.ZodString;
        start: z.ZodNumber;
        end: z.ZodNumber;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const SegmentationSchema: z.ZodObject<{
    passageId: z.ZodString;
    sourceRevision: z.ZodNumber;
    revision: z.ZodNumber;
    paragraphs: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        text: z.ZodString;
        start: z.ZodNumber;
        end: z.ZodNumber;
        sentences: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            paragraphId: z.ZodString;
            text: z.ZodString;
            start: z.ZodNumber;
            end: z.ZodNumber;
        }, z.core.$strict>>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type StoredSegmentation = z.infer<typeof SegmentationSchema>;
/**
 * What a discussion note is attached to: the exact span of one source revision,
 * not a sentence number. Newer records carry it; legacy records derive it from
 * their `anchorId` until an explicit backfill runs.
 */
export declare const AnchorRefSchema: z.ZodObject<{
    anchorId: z.ZodString;
    sourceRevision: z.ZodNumber;
    segmentationRevision: z.ZodNumber;
    start: z.ZodNumber;
    end: z.ZodNumber;
    excerpt: z.ZodString;
}, z.core.$strict>;
export type StoredAnchorRef = z.infer<typeof AnchorRefSchema>;
export declare const TranslationSchema: z.ZodObject<{
    id: z.ZodString;
    anchorId: z.ZodString;
    anchor: z.ZodDefault<z.ZodNullable<z.ZodObject<{
        anchorId: z.ZodString;
        sourceRevision: z.ZodNumber;
        segmentationRevision: z.ZodNumber;
        start: z.ZodNumber;
        end: z.ZodNumber;
        excerpt: z.ZodString;
    }, z.core.$strict>>>;
    source: z.ZodDefault<z.ZodEnum<{
        ai: "ai";
        user: "user";
    }>>;
    note: z.ZodDefault<z.ZodString>;
    language: z.ZodString;
    text: z.ZodString;
    createdAt: z.ZodString;
    operationId: z.ZodString;
}, z.core.$strict>;
export type StoredTranslation = z.infer<typeof TranslationSchema>;
export declare const BranchSchema: z.ZodObject<{
    id: z.ZodString;
    parentId: z.ZodNullable<z.ZodString>;
    anchorId: z.ZodString;
    anchor: z.ZodDefault<z.ZodNullable<z.ZodObject<{
        anchorId: z.ZodString;
        sourceRevision: z.ZodNumber;
        segmentationRevision: z.ZodNumber;
        start: z.ZodNumber;
        end: z.ZodNumber;
        excerpt: z.ZodString;
    }, z.core.$strict>>>;
    kind: z.ZodEnum<{
        note: "note";
        constituents: "constituents";
        grammar: "grammar";
        vocabulary: "vocabulary";
        translation: "translation";
    }>;
    title: z.ZodString;
    body: z.ZodString;
    createdAt: z.ZodString;
    operationId: z.ZodString;
}, z.core.$strict>;
export type StoredBranch = z.infer<typeof BranchSchema>;
/**
 * Which variant one anchor currently uses. Adoption lives in its own record so
 * one adoption is one atomic write, and every previous variant stays readable.
 */
export declare const AdoptionEntrySchema: z.ZodObject<{
    anchorId: z.ZodString;
    translationId: z.ZodString;
    previousId: z.ZodNullable<z.ZodString>;
    staleOverallId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    adoptedAt: z.ZodString;
    operationId: z.ZodString;
}, z.core.$strict>;
export type StoredAdoption = z.infer<typeof AdoptionEntrySchema>;
export declare const AdoptionsSchema: z.ZodObject<{
    passageId: z.ZodString;
    entries: z.ZodArray<z.ZodObject<{
        anchorId: z.ZodString;
        translationId: z.ZodString;
        previousId: z.ZodNullable<z.ZodString>;
        staleOverallId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        adoptedAt: z.ZodString;
        operationId: z.ZodString;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type StoredAdoptions = z.infer<typeof AdoptionsSchema>;
export declare const AnalysisSchema: z.ZodObject<{
    passageId: z.ZodString;
    translations: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        anchorId: z.ZodString;
        anchor: z.ZodDefault<z.ZodNullable<z.ZodObject<{
            anchorId: z.ZodString;
            sourceRevision: z.ZodNumber;
            segmentationRevision: z.ZodNumber;
            start: z.ZodNumber;
            end: z.ZodNumber;
            excerpt: z.ZodString;
        }, z.core.$strict>>>;
        source: z.ZodDefault<z.ZodEnum<{
            ai: "ai";
            user: "user";
        }>>;
        note: z.ZodDefault<z.ZodString>;
        language: z.ZodString;
        text: z.ZodString;
        createdAt: z.ZodString;
        operationId: z.ZodString;
    }, z.core.$strict>>;
    branches: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        parentId: z.ZodNullable<z.ZodString>;
        anchorId: z.ZodString;
        anchor: z.ZodDefault<z.ZodNullable<z.ZodObject<{
            anchorId: z.ZodString;
            sourceRevision: z.ZodNumber;
            segmentationRevision: z.ZodNumber;
            start: z.ZodNumber;
            end: z.ZodNumber;
            excerpt: z.ZodString;
        }, z.core.$strict>>>;
        kind: z.ZodEnum<{
            note: "note";
            constituents: "constituents";
            grammar: "grammar";
            vocabulary: "vocabulary";
            translation: "translation";
        }>;
        title: z.ZodString;
        body: z.ZodString;
        createdAt: z.ZodString;
        operationId: z.ZodString;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type StoredAnalysis = z.infer<typeof AnalysisSchema>;
/**
 * Knowledge write an answered question intends to perform. The intent travels
 * with the answer in one record, so a crash between writes leaves the answer
 * readable and each intent either applied or still pending.
 */
export declare const RUN_INTENT_KINDS: readonly ["branch", "translation", "grammar"];
export declare const RunIntentSchema: z.ZodObject<{
    id: z.ZodString;
    kind: z.ZodEnum<{
        grammar: "grammar";
        translation: "translation";
        branch: "branch";
    }>;
    anchorId: z.ZodString;
    title: z.ZodString;
    body: z.ZodString;
    level: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    module: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    pitfall: z.ZodDefault<z.ZodString>;
    status: z.ZodEnum<{
        pending: "pending";
        applied: "applied";
        failed: "failed";
    }>;
    appliedId: z.ZodNullable<z.ZodString>;
    detail: z.ZodNullable<z.ZodString>;
}, z.core.$strict>;
export type StoredRunIntent = z.infer<typeof RunIntentSchema>;
/**
 * How grammar extraction went for one answered question.
 *
 * `null` means no automatic path ran for this run (the agent path that supplies its
 * own intents). Otherwise the status is the honest outcome of reading the answer:
 * `extracted` (points were carried), `none` (the reply carried no block at all),
 * `invalid` (a block was there but unusable), `failed` (the write path refused it).
 */
/** The same shape the message carries: one verdict, declared once. */
export declare const RunExtractionSchema: z.ZodObject<{
    status: z.ZodEnum<{
        failed: "failed";
        extracted: "extracted";
        none: "none";
        invalid: "invalid";
    }>;
    detail: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    points: z.ZodDefault<z.ZodNumber>;
}, z.core.$strict>;
export type StoredRunExtraction = StoredExtractionVerdict;
export declare const RunSchema: z.ZodObject<{
    id: z.ZodString;
    operationId: z.ZodString;
    passageId: z.ZodString;
    anchorId: z.ZodString;
    question: z.ZodString;
    answer: z.ZodString;
    createdAt: z.ZodString;
    intents: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        kind: z.ZodEnum<{
            grammar: "grammar";
            translation: "translation";
            branch: "branch";
        }>;
        anchorId: z.ZodString;
        title: z.ZodString;
        body: z.ZodString;
        level: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        module: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        pitfall: z.ZodDefault<z.ZodString>;
        status: z.ZodEnum<{
            pending: "pending";
            applied: "applied";
            failed: "failed";
        }>;
        appliedId: z.ZodNullable<z.ZodString>;
        detail: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>>;
    extraction: z.ZodDefault<z.ZodNullable<z.ZodObject<{
        status: z.ZodEnum<{
            failed: "failed";
            extracted: "extracted";
            none: "none";
            invalid: "invalid";
        }>;
        detail: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        points: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strict>>>;
}, z.core.$strict>;
export type StoredRun = z.infer<typeof RunSchema>;
export declare const RunsSchema: z.ZodObject<{
    passageId: z.ZodString;
    runs: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        operationId: z.ZodString;
        passageId: z.ZodString;
        anchorId: z.ZodString;
        question: z.ZodString;
        answer: z.ZodString;
        createdAt: z.ZodString;
        intents: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            kind: z.ZodEnum<{
                grammar: "grammar";
                translation: "translation";
                branch: "branch";
            }>;
            anchorId: z.ZodString;
            title: z.ZodString;
            body: z.ZodString;
            level: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            module: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            pitfall: z.ZodDefault<z.ZodString>;
            status: z.ZodEnum<{
                pending: "pending";
                applied: "applied";
                failed: "failed";
            }>;
            appliedId: z.ZodNullable<z.ZodString>;
            detail: z.ZodNullable<z.ZodString>;
        }, z.core.$strict>>;
        extraction: z.ZodDefault<z.ZodNullable<z.ZodObject<{
            status: z.ZodEnum<{
                failed: "failed";
                extracted: "extracted";
                none: "none";
                invalid: "invalid";
            }>;
            detail: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            points: z.ZodDefault<z.ZodNumber>;
        }, z.core.$strict>>>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type StoredRuns = z.infer<typeof RunsSchema>;
/**
 * One vocabulary entry. The Mot is the entry's identity: `motKey` is the exact
 * form normalised for lookup, and the record key is a hash of
 * `motKey + partOfSpeech`, so homographs with different parts of speech are
 * separate entries rather than one merged card.
 */
export declare const LexiconSenseSchema: z.ZodObject<{
    id: z.ZodString;
    label: z.ZodString;
    definition: z.ZodString;
}, z.core.$strict>;
export declare const LexiconOccurrenceSchema: z.ZodObject<{
    id: z.ZodString;
    passageId: z.ZodString;
    anchorId: z.ZodString;
    excerpt: z.ZodString;
    note: z.ZodString;
    operationId: z.ZodString;
    createdAt: z.ZodString;
}, z.core.$strict>;
export declare const LexiconSourceSchema: z.ZodObject<{
    kind: z.ZodString;
    section: z.ZodString;
    url: z.ZodNullable<z.ZodString>;
    fetchedAt: z.ZodNullable<z.ZodString>;
    ok: z.ZodBoolean;
    note: z.ZodString;
}, z.core.$strict>;
export declare const LexiconEntrySchema: z.ZodObject<{
    id: z.ZodString;
    mot: z.ZodString;
    motKey: z.ZodString;
    lemma: z.ZodNullable<z.ZodString>;
    partOfSpeech: z.ZodString;
    forms: z.ZodArray<z.ZodString>;
    senses: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        label: z.ZodString;
        definition: z.ZodString;
    }, z.core.$strict>>;
    sections: z.ZodObject<{
        overview: z.ZodNullable<z.ZodString>;
        etymology: z.ZodNullable<z.ZodString>;
        semanticEvolution: z.ZodNullable<z.ZodString>;
        collocations: z.ZodNullable<z.ZodString>;
        culture: z.ZodNullable<z.ZodString>;
        fixedExpressions: z.ZodNullable<z.ZodString>;
        conjugation: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>;
    sources: z.ZodArray<z.ZodObject<{
        kind: z.ZodString;
        section: z.ZodString;
        url: z.ZodNullable<z.ZodString>;
        fetchedAt: z.ZodNullable<z.ZodString>;
        ok: z.ZodBoolean;
        note: z.ZodString;
    }, z.core.$strict>>;
    occurrences: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        passageId: z.ZodString;
        anchorId: z.ZodString;
        excerpt: z.ZodString;
        note: z.ZodString;
        operationId: z.ZodString;
        createdAt: z.ZodString;
    }, z.core.$strict>>;
    provenance: z.ZodEnum<{
        ai: "ai";
        user: "user";
        mixed: "mixed";
    }>;
    status: z.ZodEnum<{
        draft: "draft";
        reviewed: "reviewed";
    }>;
    revision: z.ZodNumber;
    operationId: z.ZodString;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, z.core.$strict>;
export type StoredLexiconEntry = z.infer<typeof LexiconEntrySchema>;
/** Rebuildable index: form -> entries, never a second editable copy. */
export declare const LexiconIndexSchema: z.ZodObject<{
    byForm: z.ZodRecord<z.ZodString, z.ZodArray<z.ZodObject<{
        entryId: z.ZodString;
        kind: z.ZodEnum<{
            exact: "exact";
            form: "form";
        }>;
    }, z.core.$strict>>>;
}, z.core.$strict>;
export type StoredLexiconIndex = z.infer<typeof LexiconIndexSchema>;
/**
 * One grammar entry. The plan's fields are kept as authored; the automatic path
 * may only touch the whitelisted ones (ask counter, last asked, examples,
 * pitfalls), so a rule never changes behind the reader's back.
 */
export declare const GrammarExampleSchema: z.ZodObject<{
    id: z.ZodString;
    text: z.ZodString;
    passageId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    anchorId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    anchor: z.ZodDefault<z.ZodNullable<z.ZodObject<{
        anchorId: z.ZodString;
        sourceRevision: z.ZodNumber;
        segmentationRevision: z.ZodNumber;
        start: z.ZodNumber;
        end: z.ZodNumber;
        excerpt: z.ZodString;
    }, z.core.$strict>>>;
    question: z.ZodDefault<z.ZodString>;
    intentId: z.ZodString;
    questionId: z.ZodDefault<z.ZodString>;
    createdAt: z.ZodString;
}, z.core.$strict>;
export declare const GrammarPitfallSchema: z.ZodObject<{
    id: z.ZodString;
    text: z.ZodString;
    intentId: z.ZodString;
    createdAt: z.ZodString;
}, z.core.$strict>;
export declare const GrammarEntrySchema: z.ZodObject<{
    id: z.ZodString;
    topic: z.ZodString;
    topicKey: z.ZodString;
    level: z.ZodNullable<z.ZodString>;
    module: z.ZodNullable<z.ZodString>;
    keyPoints: z.ZodString;
    notes: z.ZodString;
    examples: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        text: z.ZodString;
        passageId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        anchorId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        anchor: z.ZodDefault<z.ZodNullable<z.ZodObject<{
            anchorId: z.ZodString;
            sourceRevision: z.ZodNumber;
            segmentationRevision: z.ZodNumber;
            start: z.ZodNumber;
            end: z.ZodNumber;
            excerpt: z.ZodString;
        }, z.core.$strict>>>;
        question: z.ZodDefault<z.ZodString>;
        intentId: z.ZodString;
        questionId: z.ZodDefault<z.ZodString>;
        createdAt: z.ZodString;
    }, z.core.$strict>>;
    pitfalls: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        text: z.ZodString;
        intentId: z.ZodString;
        createdAt: z.ZodString;
    }, z.core.$strict>>;
    mastery: z.ZodEnum<{
        learning: "learning";
        reviewing: "reviewing";
        known: "known";
    }>;
    contentStatus: z.ZodEnum<{
        user: "user";
        mixed: "mixed";
        "ai-unverified": "ai-unverified";
    }>;
    askCount: z.ZodNumber;
    lastAskedAt: z.ZodNullable<z.ZodString>;
    revision: z.ZodNumber;
    operationId: z.ZodString;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, z.core.$strict>;
export type StoredGrammarEntry = z.infer<typeof GrammarEntrySchema>;
/** A near match the automatic path refuses to choose between. */
export declare const GrammarPendingSchema: z.ZodObject<{
    id: z.ZodString;
    topic: z.ZodString;
    body: z.ZodString;
    candidates: z.ZodArray<z.ZodObject<{
        entryId: z.ZodString;
        topic: z.ZodString;
    }, z.core.$strict>>;
    passageId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    anchorId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    question: z.ZodDefault<z.ZodString>;
    intentId: z.ZodString;
    questionId: z.ZodDefault<z.ZodString>;
    createdAt: z.ZodString;
    resolution: z.ZodDefault<z.ZodNullable<z.ZodEnum<{
        attached: "attached";
        created: "created";
        discarded: "discarded";
    }>>>;
    resolvedEntryId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    resolvedAt: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    resolutionOperationId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}, z.core.$strict>;
export type StoredGrammarPending = z.infer<typeof GrammarPendingSchema>;
export declare const GrammarStoreSchema: z.ZodObject<{
    byTopic: z.ZodRecord<z.ZodString, z.ZodArray<z.ZodString>>;
    pending: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        topic: z.ZodString;
        body: z.ZodString;
        candidates: z.ZodArray<z.ZodObject<{
            entryId: z.ZodString;
            topic: z.ZodString;
        }, z.core.$strict>>;
        passageId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        anchorId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        question: z.ZodDefault<z.ZodString>;
        intentId: z.ZodString;
        questionId: z.ZodDefault<z.ZodString>;
        createdAt: z.ZodString;
        resolution: z.ZodDefault<z.ZodNullable<z.ZodEnum<{
            attached: "attached";
            created: "created";
            discarded: "discarded";
        }>>>;
        resolvedEntryId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        resolvedAt: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        resolutionOperationId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type StoredGrammarStore = z.infer<typeof GrammarStoreSchema>;
export declare const SelectionRangeSchema: z.ZodObject<{
    start: z.ZodNumber;
    end: z.ZodNumber;
}, z.core.$strict>;
export declare const SelectionSchema: z.ZodObject<{
    passageId: z.ZodString;
    token: z.ZodString;
    sourceRevision: z.ZodNumber;
    ranges: z.ZodArray<z.ZodObject<{
        start: z.ZodNumber;
        end: z.ZodNumber;
    }, z.core.$strict>>;
    excerpt: z.ZodString;
    note: z.ZodString;
    operationId: z.ZodString;
    createdAt: z.ZodString;
}, z.core.$strict>;
export type StoredSelection = z.infer<typeof SelectionSchema>;
export { AnalysisVersionSchema, AnalysisVersionsSchema, ClauseSchema, ConstituentSchema, ExplanationSchema, MorphologySchema, SentenceAnalysisSchema, SentenceAnalysesSchema, type StoredAnalysisVersion, type StoredAnalysisVersions, type StoredClause, type StoredConstituent, type StoredExplanation, type StoredMorphology, type StoredSentenceAnalyses, type StoredSentenceAnalysis, } from './analysis.ts';
export { ConclusionSchema, ConclusionsSchema, ContentVersionSchema, ContextManifestSchema, ContextMaterialSchema, ContextsSchema, DiscussionBranchSchema, DiscussionMessageSchema, DiscussionSchema, type StoredConclusion, type StoredConclusions, type StoredContentVersion, type StoredContextManifest, type StoredContextMaterial, type StoredContexts, type StoredDiscussion, type StoredDiscussionBranch, type StoredDiscussionMessage, } from './discussion.ts';
/**
 * The audit record of one storage migration.
 *
 * A data move that a reader cannot inspect afterwards is indistinguishable from
 * data loss, so the move writes down what it did: which migration, between which
 * domain versions, how many records it moved, skipped, or emptied, and when.
 */
declare const StorageMigrationSchema: z.ZodObject<{
    name: z.ZodString;
    fromVersion: z.ZodNumber;
    toVersion: z.ZodNumber;
    migratedManifests: z.ZodNumber;
    skippedManifests: z.ZodNumber;
    emptiedLegacyRecords: z.ZodNumber;
    migratedAt: z.ZodString;
}, z.core.$strict>;
export type StoredStorageMigration = z.infer<typeof StorageMigrationSchema>;
/**
 * One lemma's pronunciation dataset, as fetched.
 *
 * `dataset` is null while a fetch is pending or failed: the record then says what
 * happened instead of carrying a paradigm nobody retrieved. `missingForms` names the
 * forms a partial fetch did not get, so an incomplete paradigm can say which.
 */
export declare const ConjugationDatasetRecordSchema: z.ZodObject<{
    id: z.ZodString;
    lemma: z.ZodString;
    source: z.ZodString;
    sourceVersion: z.ZodString;
    fetchStatus: z.ZodEnum<{
        failed: "failed";
        ok: "ok";
        partial: "partial";
        "rate-limited": "rate-limited";
        "no-forms": "no-forms";
    }>;
    failure: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    missingForms: z.ZodDefault<z.ZodArray<z.ZodString>>;
    dataset: z.ZodDefault<z.ZodNullable<z.ZodObject<{
        lemma: z.ZodString;
        source: z.ZodObject<{
            kind: z.ZodString;
            version: z.ZodString;
            fetchedAt: z.ZodString;
        }, z.core.$strict>;
        tenses: z.ZodArray<z.ZodObject<{
            mood: z.ZodString;
            tense: z.ZodString;
            label: z.ZodString;
            bases: z.ZodArray<z.ZodObject<{
                ipa: z.ZodString;
                persons: z.ZodArray<z.ZodEnum<{
                    "1s": "1s";
                    "2s": "2s";
                    "3s": "3s";
                    "1p": "1p";
                    "2p": "2p";
                    "3p": "3p";
                }>>;
                writtenStem: z.ZodNullable<z.ZodString>;
            }, z.core.$strict>>;
            forms: z.ZodArray<z.ZodObject<{
                person: z.ZodEnum<{
                    "1s": "1s";
                    "2s": "2s";
                    "3s": "3s";
                    "1p": "1p";
                    "2p": "2p";
                    "3p": "3p";
                }>;
                written: z.ZodString;
                ipa: z.ZodString;
                baseIndex: z.ZodNullable<z.ZodNumber>;
            }, z.core.$strict>>;
            notes: z.ZodArray<z.ZodString>;
        }, z.core.$strict>>;
    }, z.core.$strict>>>;
    fetchedAt: z.ZodString;
    updatedAt: z.ZodString;
}, z.core.$strict>;
export type StoredConjugationRecord = z.infer<typeof ConjugationDatasetRecordSchema>;
/**
 * One generation the Host owes the reader: created before the model is called,
 * updated as the answer arrives, and left behind with its outcome.
 *
 * The record exists because "what happened to my question" has to survive a
 * restart. A job still `running` when the Host opens again was interrupted by that
 * restart: it is reconciled to `interrupted` rather than pretended complete, and
 * whatever partial text it captured stays readable.
 */
export declare const GenerationJobSchema: z.ZodObject<{
    id: z.ZodString;
    operationId: z.ZodString;
    kind: z.ZodEnum<{
        ask: "ask";
        analyse: "analyse";
    }>;
    passageId: z.ZodString;
    branchId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    anchorId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    backend: z.ZodString;
    model: z.ZodString;
    status: z.ZodEnum<{
        failed: "failed";
        running: "running";
        succeeded: "succeeded";
        cancelled: "cancelled";
        interrupted: "interrupted";
    }>;
    phase: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    attempt: z.ZodDefault<z.ZodNumber>;
    partialText: z.ZodDefault<z.ZodString>;
    finish: z.ZodDefault<z.ZodNullable<z.ZodEnum<{
        error: "error";
        cancelled: "cancelled";
        stop: "stop";
        "max-tokens": "max-tokens";
    }>>>;
    failure: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    resolvedModel: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    usage: z.ZodDefault<z.ZodNullable<z.ZodObject<{
        inputTokens: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
        outputTokens: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
    }, z.core.$strict>>>;
    messageId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    contextId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    startedAt: z.ZodString;
    updatedAt: z.ZodString;
    finishedAt: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}, z.core.$strict>;
export type StoredGenerationJob = z.infer<typeof GenerationJobSchema>;
declare const PassageRecordSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"passage">;
    recordVersion: z.ZodLiteral<1>;
    payload: z.ZodObject<{
        id: z.ZodString;
        operationId: z.ZodString;
        title: z.ZodString;
        sourceText: z.ZodString;
        sourceRevision: z.ZodNumber;
        segmentationRevision: z.ZodNumber;
        status: z.ZodLiteral<"source-only">;
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
        archivedAt: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        archiveOperationId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"segments">;
    recordVersion: z.ZodLiteral<1>;
    payload: z.ZodObject<{
        passageId: z.ZodString;
        sourceRevision: z.ZodNumber;
        revision: z.ZodNumber;
        paragraphs: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            text: z.ZodString;
            start: z.ZodNumber;
            end: z.ZodNumber;
            sentences: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                paragraphId: z.ZodString;
                text: z.ZodString;
                start: z.ZodNumber;
                end: z.ZodNumber;
            }, z.core.$strict>>;
        }, z.core.$strict>>;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"analysis">;
    recordVersion: z.ZodLiteral<1>;
    payload: z.ZodObject<{
        passageId: z.ZodString;
        translations: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            anchorId: z.ZodString;
            anchor: z.ZodDefault<z.ZodNullable<z.ZodObject<{
                anchorId: z.ZodString;
                sourceRevision: z.ZodNumber;
                segmentationRevision: z.ZodNumber;
                start: z.ZodNumber;
                end: z.ZodNumber;
                excerpt: z.ZodString;
            }, z.core.$strict>>>;
            source: z.ZodDefault<z.ZodEnum<{
                ai: "ai";
                user: "user";
            }>>;
            note: z.ZodDefault<z.ZodString>;
            language: z.ZodString;
            text: z.ZodString;
            createdAt: z.ZodString;
            operationId: z.ZodString;
        }, z.core.$strict>>;
        branches: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            parentId: z.ZodNullable<z.ZodString>;
            anchorId: z.ZodString;
            anchor: z.ZodDefault<z.ZodNullable<z.ZodObject<{
                anchorId: z.ZodString;
                sourceRevision: z.ZodNumber;
                segmentationRevision: z.ZodNumber;
                start: z.ZodNumber;
                end: z.ZodNumber;
                excerpt: z.ZodString;
            }, z.core.$strict>>>;
            kind: z.ZodEnum<{
                note: "note";
                constituents: "constituents";
                grammar: "grammar";
                vocabulary: "vocabulary";
                translation: "translation";
            }>;
            title: z.ZodString;
            body: z.ZodString;
            createdAt: z.ZodString;
            operationId: z.ZodString;
        }, z.core.$strict>>;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"runs">;
    recordVersion: z.ZodLiteral<1>;
    payload: z.ZodObject<{
        passageId: z.ZodString;
        runs: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            operationId: z.ZodString;
            passageId: z.ZodString;
            anchorId: z.ZodString;
            question: z.ZodString;
            answer: z.ZodString;
            createdAt: z.ZodString;
            intents: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                kind: z.ZodEnum<{
                    grammar: "grammar";
                    translation: "translation";
                    branch: "branch";
                }>;
                anchorId: z.ZodString;
                title: z.ZodString;
                body: z.ZodString;
                level: z.ZodDefault<z.ZodNullable<z.ZodString>>;
                module: z.ZodDefault<z.ZodNullable<z.ZodString>>;
                pitfall: z.ZodDefault<z.ZodString>;
                status: z.ZodEnum<{
                    pending: "pending";
                    applied: "applied";
                    failed: "failed";
                }>;
                appliedId: z.ZodNullable<z.ZodString>;
                detail: z.ZodNullable<z.ZodString>;
            }, z.core.$strict>>;
            extraction: z.ZodDefault<z.ZodNullable<z.ZodObject<{
                status: z.ZodEnum<{
                    failed: "failed";
                    extracted: "extracted";
                    none: "none";
                    invalid: "invalid";
                }>;
                detail: z.ZodDefault<z.ZodNullable<z.ZodString>>;
                points: z.ZodDefault<z.ZodNumber>;
            }, z.core.$strict>>>;
        }, z.core.$strict>>;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"source">;
    recordVersion: z.ZodLiteral<1>;
    payload: z.ZodObject<{
        passageId: z.ZodString;
        revision: z.ZodNumber;
        text: z.ZodString;
        note: z.ZodNullable<z.ZodString>;
        operationId: z.ZodString;
        createdAt: z.ZodString;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"lexicon">;
    recordVersion: z.ZodLiteral<1>;
    payload: z.ZodObject<{
        id: z.ZodString;
        mot: z.ZodString;
        motKey: z.ZodString;
        lemma: z.ZodNullable<z.ZodString>;
        partOfSpeech: z.ZodString;
        forms: z.ZodArray<z.ZodString>;
        senses: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            label: z.ZodString;
            definition: z.ZodString;
        }, z.core.$strict>>;
        sections: z.ZodObject<{
            overview: z.ZodNullable<z.ZodString>;
            etymology: z.ZodNullable<z.ZodString>;
            semanticEvolution: z.ZodNullable<z.ZodString>;
            collocations: z.ZodNullable<z.ZodString>;
            culture: z.ZodNullable<z.ZodString>;
            fixedExpressions: z.ZodNullable<z.ZodString>;
            conjugation: z.ZodNullable<z.ZodString>;
        }, z.core.$strict>;
        sources: z.ZodArray<z.ZodObject<{
            kind: z.ZodString;
            section: z.ZodString;
            url: z.ZodNullable<z.ZodString>;
            fetchedAt: z.ZodNullable<z.ZodString>;
            ok: z.ZodBoolean;
            note: z.ZodString;
        }, z.core.$strict>>;
        occurrences: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            passageId: z.ZodString;
            anchorId: z.ZodString;
            excerpt: z.ZodString;
            note: z.ZodString;
            operationId: z.ZodString;
            createdAt: z.ZodString;
        }, z.core.$strict>>;
        provenance: z.ZodEnum<{
            ai: "ai";
            user: "user";
            mixed: "mixed";
        }>;
        status: z.ZodEnum<{
            draft: "draft";
            reviewed: "reviewed";
        }>;
        revision: z.ZodNumber;
        operationId: z.ZodString;
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"lexiconIndex">;
    recordVersion: z.ZodLiteral<1>;
    payload: z.ZodObject<{
        byForm: z.ZodRecord<z.ZodString, z.ZodArray<z.ZodObject<{
            entryId: z.ZodString;
            kind: z.ZodEnum<{
                exact: "exact";
                form: "form";
            }>;
        }, z.core.$strict>>>;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"adoptions">;
    recordVersion: z.ZodLiteral<1>;
    payload: z.ZodObject<{
        passageId: z.ZodString;
        entries: z.ZodArray<z.ZodObject<{
            anchorId: z.ZodString;
            translationId: z.ZodString;
            previousId: z.ZodNullable<z.ZodString>;
            staleOverallId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            adoptedAt: z.ZodString;
            operationId: z.ZodString;
        }, z.core.$strict>>;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"grammar">;
    recordVersion: z.ZodLiteral<1>;
    payload: z.ZodObject<{
        id: z.ZodString;
        topic: z.ZodString;
        topicKey: z.ZodString;
        level: z.ZodNullable<z.ZodString>;
        module: z.ZodNullable<z.ZodString>;
        keyPoints: z.ZodString;
        notes: z.ZodString;
        examples: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            text: z.ZodString;
            passageId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            anchorId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            anchor: z.ZodDefault<z.ZodNullable<z.ZodObject<{
                anchorId: z.ZodString;
                sourceRevision: z.ZodNumber;
                segmentationRevision: z.ZodNumber;
                start: z.ZodNumber;
                end: z.ZodNumber;
                excerpt: z.ZodString;
            }, z.core.$strict>>>;
            question: z.ZodDefault<z.ZodString>;
            intentId: z.ZodString;
            questionId: z.ZodDefault<z.ZodString>;
            createdAt: z.ZodString;
        }, z.core.$strict>>;
        pitfalls: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            text: z.ZodString;
            intentId: z.ZodString;
            createdAt: z.ZodString;
        }, z.core.$strict>>;
        mastery: z.ZodEnum<{
            learning: "learning";
            reviewing: "reviewing";
            known: "known";
        }>;
        contentStatus: z.ZodEnum<{
            user: "user";
            mixed: "mixed";
            "ai-unverified": "ai-unverified";
        }>;
        askCount: z.ZodNumber;
        lastAskedAt: z.ZodNullable<z.ZodString>;
        revision: z.ZodNumber;
        operationId: z.ZodString;
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"grammarStore">;
    recordVersion: z.ZodLiteral<1>;
    payload: z.ZodObject<{
        byTopic: z.ZodRecord<z.ZodString, z.ZodArray<z.ZodString>>;
        pending: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            topic: z.ZodString;
            body: z.ZodString;
            candidates: z.ZodArray<z.ZodObject<{
                entryId: z.ZodString;
                topic: z.ZodString;
            }, z.core.$strict>>;
            passageId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            anchorId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            question: z.ZodDefault<z.ZodString>;
            intentId: z.ZodString;
            questionId: z.ZodDefault<z.ZodString>;
            createdAt: z.ZodString;
            resolution: z.ZodDefault<z.ZodNullable<z.ZodEnum<{
                attached: "attached";
                created: "created";
                discarded: "discarded";
            }>>>;
            resolvedEntryId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            resolvedAt: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            resolutionOperationId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        }, z.core.$strict>>;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"selection">;
    recordVersion: z.ZodLiteral<1>;
    payload: z.ZodObject<{
        passageId: z.ZodString;
        token: z.ZodString;
        sourceRevision: z.ZodNumber;
        ranges: z.ZodArray<z.ZodObject<{
            start: z.ZodNumber;
            end: z.ZodNumber;
        }, z.core.$strict>>;
        excerpt: z.ZodString;
        note: z.ZodString;
        operationId: z.ZodString;
        createdAt: z.ZodString;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"discussion">;
    recordVersion: z.ZodLiteral<1>;
    payload: z.ZodObject<{
        passageId: z.ZodString;
        branches: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            passageId: z.ZodString;
            anchorId: z.ZodString;
            kind: z.ZodEnum<{
                note: "note";
                constituents: "constituents";
                grammar: "grammar";
                vocabulary: "vocabulary";
                translation: "translation";
                discussion: "discussion";
            }>;
            title: z.ZodString;
            parentId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            forkedFrom: z.ZodDefault<z.ZodNullable<z.ZodObject<{
                branchId: z.ZodString;
                messageId: z.ZodString;
            }, z.core.$strict>>>;
            status: z.ZodDefault<z.ZodEnum<{
                open: "open";
                understood: "understood";
                unresolved: "unresolved";
                disputed: "disputed";
                archived: "archived";
            }>>;
            messages: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                author: z.ZodEnum<{
                    user: "user";
                    model: "model";
                }>;
                text: z.ZodString;
                generation: z.ZodDefault<z.ZodNullable<z.ZodObject<{
                    runId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
                    backend: z.ZodString;
                    model: z.ZodString;
                    resolvedModel: z.ZodDefault<z.ZodNullable<z.ZodString>>;
                    attempt: z.ZodDefault<z.ZodNumber>;
                    status: z.ZodEnum<{
                        failed: "failed";
                        draft: "draft";
                        partial: "partial";
                        cancelled: "cancelled";
                        complete: "complete";
                    }>;
                    failure: z.ZodDefault<z.ZodNullable<z.ZodString>>;
                    usage: z.ZodDefault<z.ZodNullable<z.ZodObject<{
                        inputTokens: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
                        outputTokens: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
                    }, z.core.$strict>>>;
                }, z.core.$strict>>>;
                contextId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
                extraction: z.ZodDefault<z.ZodNullable<z.ZodObject<{
                    status: z.ZodEnum<{
                        failed: "failed";
                        extracted: "extracted";
                        none: "none";
                        invalid: "invalid";
                    }>;
                    detail: z.ZodDefault<z.ZodNullable<z.ZodString>>;
                    points: z.ZodDefault<z.ZodNumber>;
                }, z.core.$strict>>>;
                createdAt: z.ZodString;
                operationId: z.ZodString;
            }, z.core.$strict>>;
            createdAt: z.ZodString;
            updatedAt: z.ZodString;
            operationId: z.ZodString;
        }, z.core.$strict>>;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"contexts">;
    recordVersion: z.ZodLiteral<1>;
    payload: z.ZodObject<{
        passageId: z.ZodString;
        manifests: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            passageId: z.ZodString;
            branchId: z.ZodString;
            anchorId: z.ZodString;
            question: z.ZodString;
            backend: z.ZodString;
            model: z.ZodString;
            materials: z.ZodArray<z.ZodObject<{
                kind: z.ZodEnum<{
                    message: "message";
                    note: "note";
                    passage: "passage";
                    analysis: "analysis";
                    selection: "selection";
                    paragraph: "paragraph";
                    sentence: "sentence";
                    "branch-history": "branch-history";
                    knowledge: "knowledge";
                    conclusion: "conclusion";
                }>;
                refId: z.ZodString;
                reason: z.ZodString;
                sourceRevision: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
                anchorId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
                text: z.ZodString;
                reduced: z.ZodDefault<z.ZodBoolean>;
            }, z.core.$strict>>;
            characters: z.ZodNumber;
            fingerprint: z.ZodString;
            policyRevision: z.ZodString;
            createdAt: z.ZodString;
        }, z.core.$strict>>;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"contextManifest">;
    recordVersion: z.ZodLiteral<1>;
    payload: z.ZodObject<{
        id: z.ZodString;
        passageId: z.ZodString;
        branchId: z.ZodString;
        anchorId: z.ZodString;
        question: z.ZodString;
        backend: z.ZodString;
        model: z.ZodString;
        materials: z.ZodArray<z.ZodObject<{
            kind: z.ZodEnum<{
                message: "message";
                note: "note";
                passage: "passage";
                analysis: "analysis";
                selection: "selection";
                paragraph: "paragraph";
                sentence: "sentence";
                "branch-history": "branch-history";
                knowledge: "knowledge";
                conclusion: "conclusion";
            }>;
            refId: z.ZodString;
            reason: z.ZodString;
            sourceRevision: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
            anchorId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            text: z.ZodString;
            reduced: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strict>>;
        characters: z.ZodNumber;
        fingerprint: z.ZodString;
        policyRevision: z.ZodString;
        createdAt: z.ZodString;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"storageMigration">;
    recordVersion: z.ZodLiteral<1>;
    payload: z.ZodObject<{
        name: z.ZodString;
        fromVersion: z.ZodNumber;
        toVersion: z.ZodNumber;
        migratedManifests: z.ZodNumber;
        skippedManifests: z.ZodNumber;
        emptiedLegacyRecords: z.ZodNumber;
        migratedAt: z.ZodString;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"generationJob">;
    recordVersion: z.ZodLiteral<1>;
    payload: z.ZodObject<{
        id: z.ZodString;
        operationId: z.ZodString;
        kind: z.ZodEnum<{
            ask: "ask";
            analyse: "analyse";
        }>;
        passageId: z.ZodString;
        branchId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        anchorId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        backend: z.ZodString;
        model: z.ZodString;
        status: z.ZodEnum<{
            failed: "failed";
            running: "running";
            succeeded: "succeeded";
            cancelled: "cancelled";
            interrupted: "interrupted";
        }>;
        phase: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attempt: z.ZodDefault<z.ZodNumber>;
        partialText: z.ZodDefault<z.ZodString>;
        finish: z.ZodDefault<z.ZodNullable<z.ZodEnum<{
            error: "error";
            cancelled: "cancelled";
            stop: "stop";
            "max-tokens": "max-tokens";
        }>>>;
        failure: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        resolvedModel: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        usage: z.ZodDefault<z.ZodNullable<z.ZodObject<{
            inputTokens: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
            outputTokens: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
        }, z.core.$strict>>>;
        messageId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        contextId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        startedAt: z.ZodString;
        updatedAt: z.ZodString;
        finishedAt: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"conjugationDataset">;
    recordVersion: z.ZodLiteral<1>;
    payload: z.ZodObject<{
        id: z.ZodString;
        lemma: z.ZodString;
        source: z.ZodString;
        sourceVersion: z.ZodString;
        fetchStatus: z.ZodEnum<{
            failed: "failed";
            ok: "ok";
            partial: "partial";
            "rate-limited": "rate-limited";
            "no-forms": "no-forms";
        }>;
        failure: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        missingForms: z.ZodDefault<z.ZodArray<z.ZodString>>;
        dataset: z.ZodDefault<z.ZodNullable<z.ZodObject<{
            lemma: z.ZodString;
            source: z.ZodObject<{
                kind: z.ZodString;
                version: z.ZodString;
                fetchedAt: z.ZodString;
            }, z.core.$strict>;
            tenses: z.ZodArray<z.ZodObject<{
                mood: z.ZodString;
                tense: z.ZodString;
                label: z.ZodString;
                bases: z.ZodArray<z.ZodObject<{
                    ipa: z.ZodString;
                    persons: z.ZodArray<z.ZodEnum<{
                        "1s": "1s";
                        "2s": "2s";
                        "3s": "3s";
                        "1p": "1p";
                        "2p": "2p";
                        "3p": "3p";
                    }>>;
                    writtenStem: z.ZodNullable<z.ZodString>;
                }, z.core.$strict>>;
                forms: z.ZodArray<z.ZodObject<{
                    person: z.ZodEnum<{
                        "1s": "1s";
                        "2s": "2s";
                        "3s": "3s";
                        "1p": "1p";
                        "2p": "2p";
                        "3p": "3p";
                    }>;
                    written: z.ZodString;
                    ipa: z.ZodString;
                    baseIndex: z.ZodNullable<z.ZodNumber>;
                }, z.core.$strict>>;
                notes: z.ZodArray<z.ZodString>;
            }, z.core.$strict>>;
        }, z.core.$strict>>>;
        fetchedAt: z.ZodString;
        updatedAt: z.ZodString;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"conclusions">;
    recordVersion: z.ZodLiteral<1>;
    payload: z.ZodObject<{
        passageId: z.ZodString;
        conclusions: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            passageId: z.ZodString;
            branchId: z.ZodString;
            anchorId: z.ZodString;
            messageId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            text: z.ZodString;
            status: z.ZodDefault<z.ZodEnum<{
                proposed: "proposed";
                confirmed: "confirmed";
                superseded: "superseded";
            }>>;
            analysisRevision: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
            createdAt: z.ZodString;
            updatedAt: z.ZodString;
            operationId: z.ZodString;
        }, z.core.$strict>>;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"contentVersion">;
    recordVersion: z.ZodLiteral<1>;
    payload: z.ZodObject<{
        id: z.ZodString;
        target: z.ZodEnum<{
            conclusion: "conclusion";
            "lexicon-section": "lexicon-section";
            "grammar-rule": "grammar-rule";
            "grammar-note": "grammar-note";
        }>;
        targetId: z.ZodString;
        field: z.ZodString;
        text: z.ZodString;
        author: z.ZodEnum<{
            ai: "ai";
            user: "user";
            mixed: "mixed";
        }>;
        reason: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        replacesId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        createdAt: z.ZodString;
        operationId: z.ZodString;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"sentenceAnalyses">;
    recordVersion: z.ZodLiteral<1>;
    payload: z.ZodObject<{
        passageId: z.ZodString;
        sentences: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            passageId: z.ZodString;
            anchorId: z.ZodString;
            text: z.ZodString;
            sourceRevision: z.ZodNumber;
            segmentationRevision: z.ZodNumber;
            translation: z.ZodString;
            backbone: z.ZodDefault<z.ZodString>;
            clauses: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                role: z.ZodString;
                start: z.ZodNumber;
                end: z.ZodNumber;
                text: z.ZodString;
                parentId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            }, z.core.$strict>>;
            constituents: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                role: z.ZodString;
                start: z.ZodNumber;
                end: z.ZodNumber;
                text: z.ZodString;
                clauseId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
                partOfSpeech: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            }, z.core.$strict>>;
            morphology: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                form: z.ZodString;
                lemma: z.ZodDefault<z.ZodNullable<z.ZodString>>;
                partOfSpeech: z.ZodDefault<z.ZodNullable<z.ZodString>>;
                tense: z.ZodDefault<z.ZodNullable<z.ZodString>>;
                mood: z.ZodDefault<z.ZodNullable<z.ZodString>>;
                person: z.ZodDefault<z.ZodNullable<z.ZodString>>;
                gender: z.ZodDefault<z.ZodNullable<z.ZodString>>;
                number: z.ZodDefault<z.ZodNullable<z.ZodString>>;
                agreesWith: z.ZodDefault<z.ZodNullable<z.ZodString>>;
                note: z.ZodDefault<z.ZodString>;
            }, z.core.$strict>>;
            explanations: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                kind: z.ZodEnum<{
                    syntax: "syntax";
                    context: "context";
                    rhetoric: "rhetoric";
                    unverified: "unverified";
                }>;
                text: z.ZodString;
                start: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
                end: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
            }, z.core.$strict>>;
            provenance: z.ZodEnum<{
                ai: "ai";
                user: "user";
                mixed: "mixed";
            }>;
            status: z.ZodEnum<{
                draft: "draft";
                reviewed: "reviewed";
            }>;
            revision: z.ZodNumber;
            createdAt: z.ZodString;
            updatedAt: z.ZodString;
        }, z.core.$strict>>;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"analysisVersions">;
    recordVersion: z.ZodLiteral<1>;
    payload: z.ZodObject<{
        passageId: z.ZodString;
        versions: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            passageId: z.ZodString;
            revision: z.ZodNumber;
            sourceRevision: z.ZodNumber;
            overallTranslation: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            cohesion: z.ZodDefault<z.ZodString>;
            coveredAnchors: z.ZodArray<z.ZodString>;
            backend: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            model: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            createdAt: z.ZodString;
        }, z.core.$strict>>;
        currentId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    }, z.core.$strict>;
}, z.core.$strict>], "kind">;
/** One stored record of the single `records` table, discriminated by `kind`. */
export type PassageRecord = z.infer<typeof PassageRecordSchema>;
/**
 * The plugin's storage domain.
 *
 * Version 2 adds the `contextManifest` and `storageMigration` record kinds. The
 * change is additive — every version 1 record still satisfies these schemas — and
 * `compatibleVersions: [1]` is what says so to the backend: with the `per-record`
 * layout an unlisted version's documents are discarded rather than migrated, so a
 * version bump without this declaration would hide every existing passage.
 */
export declare const FRENCH_READER_DOMAIN: {
    name: string;
    version: number;
    compatibleVersions: number[];
    layout: "per-record";
    tables: {
        records: import("@deepseek-ai/dsh-storage-domain").DomainTableSpec<string, {
            kind: "passage";
            recordVersion: 1;
            payload: {
                id: string;
                operationId: string;
                title: string;
                sourceText: string;
                sourceRevision: number;
                segmentationRevision: number;
                status: "source-only";
                createdAt: string;
                updatedAt: string;
                archivedAt: string | null;
                archiveOperationId: string | null;
            };
        } | {
            kind: "segments";
            recordVersion: 1;
            payload: {
                passageId: string;
                sourceRevision: number;
                revision: number;
                paragraphs: {
                    id: string;
                    text: string;
                    start: number;
                    end: number;
                    sentences: {
                        id: string;
                        paragraphId: string;
                        text: string;
                        start: number;
                        end: number;
                    }[];
                }[];
            };
        } | {
            kind: "analysis";
            recordVersion: 1;
            payload: {
                passageId: string;
                translations: {
                    id: string;
                    anchorId: string;
                    anchor: {
                        anchorId: string;
                        sourceRevision: number;
                        segmentationRevision: number;
                        start: number;
                        end: number;
                        excerpt: string;
                    } | null;
                    source: "ai" | "user";
                    note: string;
                    language: string;
                    text: string;
                    createdAt: string;
                    operationId: string;
                }[];
                branches: {
                    id: string;
                    parentId: string | null;
                    anchorId: string;
                    anchor: {
                        anchorId: string;
                        sourceRevision: number;
                        segmentationRevision: number;
                        start: number;
                        end: number;
                        excerpt: string;
                    } | null;
                    kind: "note" | "constituents" | "grammar" | "vocabulary" | "translation";
                    title: string;
                    body: string;
                    createdAt: string;
                    operationId: string;
                }[];
            };
        } | {
            kind: "runs";
            recordVersion: 1;
            payload: {
                passageId: string;
                runs: {
                    id: string;
                    operationId: string;
                    passageId: string;
                    anchorId: string;
                    question: string;
                    answer: string;
                    createdAt: string;
                    intents: {
                        id: string;
                        kind: "grammar" | "translation" | "branch";
                        anchorId: string;
                        title: string;
                        body: string;
                        level: string | null;
                        module: string | null;
                        pitfall: string;
                        status: "pending" | "applied" | "failed";
                        appliedId: string | null;
                        detail: string | null;
                    }[];
                    extraction: {
                        status: "failed" | "extracted" | "none" | "invalid";
                        detail: string | null;
                        points: number;
                    } | null;
                }[];
            };
        } | {
            kind: "source";
            recordVersion: 1;
            payload: {
                passageId: string;
                revision: number;
                text: string;
                note: string | null;
                operationId: string;
                createdAt: string;
            };
        } | {
            kind: "lexicon";
            recordVersion: 1;
            payload: {
                id: string;
                mot: string;
                motKey: string;
                lemma: string | null;
                partOfSpeech: string;
                forms: string[];
                senses: {
                    id: string;
                    label: string;
                    definition: string;
                }[];
                sections: {
                    overview: string | null;
                    etymology: string | null;
                    semanticEvolution: string | null;
                    collocations: string | null;
                    culture: string | null;
                    fixedExpressions: string | null;
                    conjugation: string | null;
                };
                sources: {
                    kind: string;
                    section: string;
                    url: string | null;
                    fetchedAt: string | null;
                    ok: boolean;
                    note: string;
                }[];
                occurrences: {
                    id: string;
                    passageId: string;
                    anchorId: string;
                    excerpt: string;
                    note: string;
                    operationId: string;
                    createdAt: string;
                }[];
                provenance: "ai" | "user" | "mixed";
                status: "draft" | "reviewed";
                revision: number;
                operationId: string;
                createdAt: string;
                updatedAt: string;
            };
        } | {
            kind: "lexiconIndex";
            recordVersion: 1;
            payload: {
                byForm: Record<string, {
                    entryId: string;
                    kind: "exact" | "form";
                }[]>;
            };
        } | {
            kind: "adoptions";
            recordVersion: 1;
            payload: {
                passageId: string;
                entries: {
                    anchorId: string;
                    translationId: string;
                    previousId: string | null;
                    staleOverallId: string | null;
                    adoptedAt: string;
                    operationId: string;
                }[];
            };
        } | {
            kind: "grammar";
            recordVersion: 1;
            payload: {
                id: string;
                topic: string;
                topicKey: string;
                level: string | null;
                module: string | null;
                keyPoints: string;
                notes: string;
                examples: {
                    id: string;
                    text: string;
                    passageId: string | null;
                    anchorId: string | null;
                    anchor: {
                        anchorId: string;
                        sourceRevision: number;
                        segmentationRevision: number;
                        start: number;
                        end: number;
                        excerpt: string;
                    } | null;
                    question: string;
                    intentId: string;
                    questionId: string;
                    createdAt: string;
                }[];
                pitfalls: {
                    id: string;
                    text: string;
                    intentId: string;
                    createdAt: string;
                }[];
                mastery: "learning" | "reviewing" | "known";
                contentStatus: "user" | "mixed" | "ai-unverified";
                askCount: number;
                lastAskedAt: string | null;
                revision: number;
                operationId: string;
                createdAt: string;
                updatedAt: string;
            };
        } | {
            kind: "grammarStore";
            recordVersion: 1;
            payload: {
                byTopic: Record<string, string[]>;
                pending: {
                    id: string;
                    topic: string;
                    body: string;
                    candidates: {
                        entryId: string;
                        topic: string;
                    }[];
                    passageId: string | null;
                    anchorId: string | null;
                    question: string;
                    intentId: string;
                    questionId: string;
                    createdAt: string;
                    resolution: "attached" | "created" | "discarded" | null;
                    resolvedEntryId: string | null;
                    resolvedAt: string | null;
                    resolutionOperationId: string | null;
                }[];
            };
        } | {
            kind: "selection";
            recordVersion: 1;
            payload: {
                passageId: string;
                token: string;
                sourceRevision: number;
                ranges: {
                    start: number;
                    end: number;
                }[];
                excerpt: string;
                note: string;
                operationId: string;
                createdAt: string;
            };
        } | {
            kind: "discussion";
            recordVersion: 1;
            payload: {
                passageId: string;
                branches: {
                    id: string;
                    passageId: string;
                    anchorId: string;
                    kind: "note" | "constituents" | "grammar" | "vocabulary" | "translation" | "discussion";
                    title: string;
                    parentId: string | null;
                    forkedFrom: {
                        branchId: string;
                        messageId: string;
                    } | null;
                    status: "open" | "understood" | "unresolved" | "disputed" | "archived";
                    messages: {
                        id: string;
                        author: "user" | "model";
                        text: string;
                        generation: {
                            runId: string | null;
                            backend: string;
                            model: string;
                            resolvedModel: string | null;
                            attempt: number;
                            status: "failed" | "draft" | "partial" | "cancelled" | "complete";
                            failure: string | null;
                            usage: {
                                inputTokens: number | null;
                                outputTokens: number | null;
                            } | null;
                        } | null;
                        contextId: string | null;
                        extraction: {
                            status: "failed" | "extracted" | "none" | "invalid";
                            detail: string | null;
                            points: number;
                        } | null;
                        createdAt: string;
                        operationId: string;
                    }[];
                    createdAt: string;
                    updatedAt: string;
                    operationId: string;
                }[];
            };
        } | {
            kind: "contexts";
            recordVersion: 1;
            payload: {
                passageId: string;
                manifests: {
                    id: string;
                    passageId: string;
                    branchId: string;
                    anchorId: string;
                    question: string;
                    backend: string;
                    model: string;
                    materials: {
                        kind: "message" | "note" | "passage" | "analysis" | "selection" | "paragraph" | "sentence" | "branch-history" | "knowledge" | "conclusion";
                        refId: string;
                        reason: string;
                        sourceRevision: number | null;
                        anchorId: string | null;
                        text: string;
                        reduced: boolean;
                    }[];
                    characters: number;
                    fingerprint: string;
                    policyRevision: string;
                    createdAt: string;
                }[];
            };
        } | {
            kind: "contextManifest";
            recordVersion: 1;
            payload: {
                id: string;
                passageId: string;
                branchId: string;
                anchorId: string;
                question: string;
                backend: string;
                model: string;
                materials: {
                    kind: "message" | "note" | "passage" | "analysis" | "selection" | "paragraph" | "sentence" | "branch-history" | "knowledge" | "conclusion";
                    refId: string;
                    reason: string;
                    sourceRevision: number | null;
                    anchorId: string | null;
                    text: string;
                    reduced: boolean;
                }[];
                characters: number;
                fingerprint: string;
                policyRevision: string;
                createdAt: string;
            };
        } | {
            kind: "storageMigration";
            recordVersion: 1;
            payload: {
                name: string;
                fromVersion: number;
                toVersion: number;
                migratedManifests: number;
                skippedManifests: number;
                emptiedLegacyRecords: number;
                migratedAt: string;
            };
        } | {
            kind: "generationJob";
            recordVersion: 1;
            payload: {
                id: string;
                operationId: string;
                kind: "ask" | "analyse";
                passageId: string;
                branchId: string | null;
                anchorId: string | null;
                backend: string;
                model: string;
                status: "failed" | "running" | "succeeded" | "cancelled" | "interrupted";
                attempt: number;
                partialText: string;
                finish: "error" | "cancelled" | "stop" | "max-tokens" | null;
                failure: string | null;
                resolvedModel: string | null;
                usage: {
                    inputTokens: number | null;
                    outputTokens: number | null;
                } | null;
                messageId: string | null;
                contextId: string | null;
                startedAt: string;
                updatedAt: string;
                finishedAt: string | null;
                phase?: string | null | undefined;
            };
        } | {
            kind: "conjugationDataset";
            recordVersion: 1;
            payload: {
                id: string;
                lemma: string;
                source: string;
                sourceVersion: string;
                fetchStatus: "failed" | "ok" | "partial" | "rate-limited" | "no-forms";
                failure: string | null;
                missingForms: string[];
                dataset: {
                    lemma: string;
                    source: {
                        kind: string;
                        version: string;
                        fetchedAt: string;
                    };
                    tenses: {
                        mood: string;
                        tense: string;
                        label: string;
                        bases: {
                            ipa: string;
                            persons: ("1s" | "2s" | "3s" | "1p" | "2p" | "3p")[];
                            writtenStem: string | null;
                        }[];
                        forms: {
                            person: "1s" | "2s" | "3s" | "1p" | "2p" | "3p";
                            written: string;
                            ipa: string;
                            baseIndex: number | null;
                        }[];
                        notes: string[];
                    }[];
                } | null;
                fetchedAt: string;
                updatedAt: string;
            };
        } | {
            kind: "conclusions";
            recordVersion: 1;
            payload: {
                passageId: string;
                conclusions: {
                    id: string;
                    passageId: string;
                    branchId: string;
                    anchorId: string;
                    messageId: string | null;
                    text: string;
                    status: "proposed" | "confirmed" | "superseded";
                    analysisRevision: number | null;
                    createdAt: string;
                    updatedAt: string;
                    operationId: string;
                }[];
            };
        } | {
            kind: "contentVersion";
            recordVersion: 1;
            payload: {
                id: string;
                target: "conclusion" | "lexicon-section" | "grammar-rule" | "grammar-note";
                targetId: string;
                field: string;
                text: string;
                author: "ai" | "user" | "mixed";
                reason: string | null;
                replacesId: string | null;
                createdAt: string;
                operationId: string;
            };
        } | {
            kind: "sentenceAnalyses";
            recordVersion: 1;
            payload: {
                passageId: string;
                sentences: {
                    id: string;
                    passageId: string;
                    anchorId: string;
                    text: string;
                    sourceRevision: number;
                    segmentationRevision: number;
                    translation: string;
                    backbone: string;
                    clauses: {
                        id: string;
                        role: string;
                        start: number;
                        end: number;
                        text: string;
                        parentId: string | null;
                    }[];
                    constituents: {
                        id: string;
                        role: string;
                        start: number;
                        end: number;
                        text: string;
                        clauseId: string | null;
                        partOfSpeech: string | null;
                    }[];
                    morphology: {
                        id: string;
                        form: string;
                        lemma: string | null;
                        partOfSpeech: string | null;
                        tense: string | null;
                        mood: string | null;
                        person: string | null;
                        gender: string | null;
                        number: string | null;
                        agreesWith: string | null;
                        note: string;
                    }[];
                    explanations: {
                        id: string;
                        kind: "syntax" | "context" | "rhetoric" | "unverified";
                        text: string;
                        start: number | null;
                        end: number | null;
                    }[];
                    provenance: "ai" | "user" | "mixed";
                    status: "draft" | "reviewed";
                    revision: number;
                    createdAt: string;
                    updatedAt: string;
                }[];
            };
        } | {
            kind: "analysisVersions";
            recordVersion: 1;
            payload: {
                passageId: string;
                versions: {
                    id: string;
                    passageId: string;
                    revision: number;
                    sourceRevision: number;
                    overallTranslation: string | null;
                    cohesion: string;
                    coveredAnchors: string[];
                    backend: string | null;
                    model: string | null;
                    createdAt: string;
                }[];
                currentId: string | null;
            };
        }>;
    };
};
export type FrenchReaderDomain = typeof FRENCH_READER_DOMAIN;
