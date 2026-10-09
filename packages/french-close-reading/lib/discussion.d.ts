import { z } from 'zod';
/** The anchor space, named here for callers that reach this module directly. */
export declare const DISCUSSED_ANCHOR_PATTERN: RegExp;
/**
 * One message inside a discussion branch.
 *
 * A branch is a conversation, not a single note: the reader asks, the model
 * answers, and both stay in order. `author` says who wrote it, which is what
 * keeps "the reader's own wording" apart from anything a model produced — a user
 * message is never regenerated away, and an answer never silently replaces one.
 */
/**
 * What the automatic grammar path read out of one answer.
 *
 * It lives on the message as well as on the run: the run owns the intents and their
 * application, while the message carries the verdict the reader is shown. Both are
 * written in the same turn from the same value, so they cannot disagree — and the
 * panel can read it without resolving a run's derived operation id, which is async
 * and would turn every discussion read into a promise.
 */
export declare const ExtractionVerdictSchema: z.ZodObject<{
    status: z.ZodEnum<{
        extracted: "extracted";
        none: "none";
        invalid: "invalid";
        failed: "failed";
    }>;
    detail: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    points: z.ZodDefault<z.ZodNumber>;
}, z.core.$strict>;
export type StoredExtractionVerdict = z.infer<typeof ExtractionVerdictSchema>;
export declare const DiscussionMessageSchema: z.ZodObject<{
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
            cancelled: "cancelled";
            draft: "draft";
            failed: "failed";
            complete: "complete";
            partial: "partial";
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
            extracted: "extracted";
            none: "none";
            invalid: "invalid";
            failed: "failed";
        }>;
        detail: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        points: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strict>>>;
    createdAt: z.ZodString;
    operationId: z.ZodString;
}, z.core.$strict>;
export type StoredDiscussionMessage = z.infer<typeof DiscussionMessageSchema>;
/**
 * One discussion branch: a topic the reader opened against an anchor, with its
 * own message history, its own state, and an explicit fork point.
 *
 * `parentId` records where the branch came from. It is provenance, not context:
 * a sibling branch's messages are never pulled into a request because the tree
 * happens to share an ancestor.
 */
export declare const DiscussionBranchSchema: z.ZodObject<{
    id: z.ZodString;
    passageId: z.ZodString;
    anchorId: z.ZodString;
    kind: z.ZodEnum<{
        constituents: "constituents";
        grammar: "grammar";
        vocabulary: "vocabulary";
        translation: "translation";
        note: "note";
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
                cancelled: "cancelled";
                draft: "draft";
                failed: "failed";
                complete: "complete";
                partial: "partial";
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
                extracted: "extracted";
                none: "none";
                invalid: "invalid";
                failed: "failed";
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
}, z.core.$strict>;
export type StoredDiscussionBranch = z.infer<typeof DiscussionBranchSchema>;
/**
 * One material that went into a request, with the version it was read at.
 *
 * The manifest is the record of what was actually sent. A preview and the real
 * request compile the same object, so what the reader was shown cannot differ
 * from what left the browser.
 */
export declare const ContextMaterialSchema: z.ZodObject<{
    kind: z.ZodEnum<{
        message: "message";
        note: "note";
        passage: "passage";
        paragraph: "paragraph";
        sentence: "sentence";
        selection: "selection";
        analysis: "analysis";
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
}, z.core.$strict>;
export type StoredContextMaterial = z.infer<typeof ContextMaterialSchema>;
/**
 * One compiled context: the immutable answer to "what exactly was sent".
 * `fingerprint` covers the material list, so a preview is stale the moment a
 * material, a version or the question changes.
 */
export declare const ContextManifestSchema: z.ZodObject<{
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
            paragraph: "paragraph";
            sentence: "sentence";
            selection: "selection";
            analysis: "analysis";
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
export type StoredContextManifest = z.infer<typeof ContextManifestSchema>;
/**
 * A conclusion the reader confirmed, extracted from one answer.
 *
 * A conclusion is a decision, not a summary: it points at the message it came
 * from so the reading stays auditable, and it is never rewritten by a later
 * model answer.
 */
export declare const ConclusionSchema: z.ZodObject<{
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
}, z.core.$strict>;
export type StoredConclusion = z.infer<typeof ConclusionSchema>;
/**
 * One version of a mutable artifact (a lexicon section, grammar rule or note).
 *
 * Content revisions are appended, never overwritten: the current pointer moves,
 * and everything it replaced stays readable and comparable.
 */
export declare const ContentVersionSchema: z.ZodObject<{
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
        user: "user";
        ai: "ai";
        mixed: "mixed";
    }>;
    reason: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    replacesId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    createdAt: z.ZodString;
    operationId: z.ZodString;
}, z.core.$strict>;
export type StoredContentVersion = z.infer<typeof ContentVersionSchema>;
export declare const DiscussionSchema: z.ZodObject<{
    passageId: z.ZodString;
    branches: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        passageId: z.ZodString;
        anchorId: z.ZodString;
        kind: z.ZodEnum<{
            constituents: "constituents";
            grammar: "grammar";
            vocabulary: "vocabulary";
            translation: "translation";
            note: "note";
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
                    cancelled: "cancelled";
                    draft: "draft";
                    failed: "failed";
                    complete: "complete";
                    partial: "partial";
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
                    extracted: "extracted";
                    none: "none";
                    invalid: "invalid";
                    failed: "failed";
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
export type StoredDiscussion = z.infer<typeof DiscussionSchema>;
export declare const ContextsSchema: z.ZodObject<{
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
                paragraph: "paragraph";
                sentence: "sentence";
                selection: "selection";
                analysis: "analysis";
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
export type StoredContexts = z.infer<typeof ContextsSchema>;
export declare const ConclusionsSchema: z.ZodObject<{
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
export type StoredConclusions = z.infer<typeof ConclusionsSchema>;
