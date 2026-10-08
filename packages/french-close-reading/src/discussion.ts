import { z } from 'zod'

import {
  ANCHOR_ID_PATTERN,
  AnchorIdSchema,
  MAX_BRANCH_BODY_CHARACTERS,
  MAX_BRANCH_TITLE_CHARACTERS,
  MAX_SOURCE_CHARACTERS,
  MAX_TRANSLATION_CHARACTERS,
} from './limits.ts'

/** The anchor space, named here for callers that reach this module directly. */
export const DISCUSSED_ANCHOR_PATTERN = ANCHOR_ID_PATTERN

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
export const ExtractionVerdictSchema = z.object({
  status: z.enum(['extracted', 'none', 'invalid', 'failed']),
  detail: z.string().max(2_000).nullable().default(null),
  points: z.number().int().min(0).default(0),
}).strict()

export type StoredExtractionVerdict = z.infer<typeof ExtractionVerdictSchema>

export const DiscussionMessageSchema = z.object({
  id: z.string().uuid(),
  author: z.enum(['user', 'model']),
  /** The question or the answer, exactly as written. */
  text: z.string().min(1).max(MAX_TRANSLATION_CHARACTERS),
  /** How this message was produced, when it was produced by a backend. */
  generation: z.object({
    runId: z.string().uuid().nullable().default(null),
    backend: z.string().min(1).max(40),
    model: z.string().min(1).max(120),
    /** The model the backend confirmed, when it reports one. */
    resolvedModel: z.string().max(120).nullable().default(null),
    attempt: z.number().int().min(1).default(1),
    /**
     * `partial` is a length stop: the provider ended the answer at its limit, so the
     * text is real but unfinished. `complete` therefore means what it says.
     */
    status: z.enum(['draft', 'complete', 'partial', 'failed', 'cancelled']),
    failure: z.string().max(2_000).nullable().default(null),
    usage: z.object({
      inputTokens: z.number().int().min(0).nullable().default(null),
      outputTokens: z.number().int().min(0).nullable().default(null),
    }).strict().nullable().default(null),
  }).strict().nullable().default(null),
  /** The compiled context this message was sent with, when it was sent. */
  contextId: z.string().uuid().nullable().default(null),
  /**
   * The grammar verdict for this answer. Null when no automatic path ran: a user
   * message, or an agent turn whose intents the caller supplied.
   */
  extraction: ExtractionVerdictSchema.nullable().default(null),
  createdAt: z.string().datetime(),
  operationId: z.string().uuid(),
}).strict()

export type StoredDiscussionMessage = z.infer<typeof DiscussionMessageSchema>

/**
 * One discussion branch: a topic the reader opened against an anchor, with its
 * own message history, its own state, and an explicit fork point.
 *
 * `parentId` records where the branch came from. It is provenance, not context:
 * a sibling branch's messages are never pulled into a request because the tree
 * happens to share an ancestor.
 */
export const DiscussionBranchSchema = z.object({
  id: z.string().uuid(),
  passageId: z.string().uuid(),
  anchorId: AnchorIdSchema,
  kind: z.enum(['constituents', 'grammar', 'vocabulary', 'translation', 'note', 'discussion']),
  title: z.string().min(1).max(MAX_BRANCH_TITLE_CHARACTERS),
  parentId: z.string().uuid().nullable().default(null),
  /**
   * The message this branch forked from, when it was forked rather than opened
   * fresh. History stops there: later messages of the source branch are not part
   * of this branch's context.
   */
  forkedFrom: z.object({
    branchId: z.string().uuid(),
    messageId: z.string().uuid(),
  }).strict().nullable().default(null),
  status: z.enum(['open', 'understood', 'unresolved', 'disputed', 'archived']).default('open'),
  messages: z.array(DiscussionMessageSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  operationId: z.string().uuid(),
}).strict()

export type StoredDiscussionBranch = z.infer<typeof DiscussionBranchSchema>

/**
 * One material that went into a request, with the version it was read at.
 *
 * The manifest is the record of what was actually sent. A preview and the real
 * request compile the same object, so what the reader was shown cannot differ
 * from what left the browser.
 */
export const ContextMaterialSchema = z.object({
  kind: z.enum([
    'passage', 'paragraph', 'sentence', 'selection',
    'analysis', 'branch-history', 'message', 'knowledge', 'conclusion', 'note',
  ]),
  /** Stable identity of the material inside this plugin. */
  refId: z.string().min(1).max(120),
  /** Why it was included, in the reader's own terms. */
  reason: z.string().max(200),
  /** The version pinned when this material was read. */
  sourceRevision: z.number().int().min(1).nullable().default(null),
  anchorId: z.string().max(40).nullable().default(null),
  /** The exact text that was sent, after any reduction. */
  text: z.string().max(MAX_SOURCE_CHARACTERS),
  /** True when the text is a derived reduction rather than the source itself. */
  reduced: z.boolean().default(false),
}).strict()

export type StoredContextMaterial = z.infer<typeof ContextMaterialSchema>

/**
 * One compiled context: the immutable answer to "what exactly was sent".
 * `fingerprint` covers the material list, so a preview is stale the moment a
 * material, a version or the question changes.
 */
export const ContextManifestSchema = z.object({
  id: z.string().uuid(),
  passageId: z.string().uuid(),
  branchId: z.string().uuid(),
  anchorId: AnchorIdSchema,
  question: z.string().max(MAX_BRANCH_BODY_CHARACTERS),
  backend: z.string().min(1).max(40),
  model: z.string().min(1).max(120),
  materials: z.array(ContextMaterialSchema),
  /** Estimated characters, the one budget every backend can be held to. */
  characters: z.number().int().min(0),
  fingerprint: z.string().min(1).max(80),
  /** The output-policy revision the model was asked to follow. */
  policyRevision: z.string().min(1).max(40),
  createdAt: z.string().datetime(),
}).strict()

export type StoredContextManifest = z.infer<typeof ContextManifestSchema>

/**
 * A conclusion the reader confirmed, extracted from one answer.
 *
 * A conclusion is a decision, not a summary: it points at the message it came
 * from so the reading stays auditable, and it is never rewritten by a later
 * model answer.
 */
export const ConclusionSchema = z.object({
  id: z.string().uuid(),
  passageId: z.string().uuid(),
  branchId: z.string().uuid(),
  anchorId: AnchorIdSchema,
  messageId: z.string().uuid().nullable().default(null),
  text: z.string().min(1).max(MAX_TRANSLATION_CHARACTERS),
  status: z.enum(['proposed', 'confirmed', 'superseded']).default('proposed'),
  /** The analysis version this conclusion was drawn from. */
  analysisRevision: z.number().int().min(1).nullable().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  operationId: z.string().uuid(),
}).strict()

export type StoredConclusion = z.infer<typeof ConclusionSchema>

/**
 * One version of a mutable artifact (a lexicon section, grammar rule or note).
 *
 * Content revisions are appended, never overwritten: the current pointer moves,
 * and everything it replaced stays readable and comparable.
 */
export const ContentVersionSchema = z.object({
  id: z.string().uuid(),
  target: z.enum(['lexicon-section', 'grammar-rule', 'grammar-note', 'conclusion']),
  targetId: z.string().min(1).max(120),
  /** Which field of the target this version replaces (§id or rule name). */
  field: z.string().min(1).max(60),
  text: z.string().max(MAX_TRANSLATION_CHARACTERS),
  author: z.enum(['ai', 'user', 'mixed']),
  reason: z.string().max(200).nullable().default(null),
  replacesId: z.string().uuid().nullable().default(null),
  createdAt: z.string().datetime(),
  operationId: z.string().uuid(),
}).strict()

export type StoredContentVersion = z.infer<typeof ContentVersionSchema>

export const DiscussionSchema = z.object({
  passageId: z.string().uuid(),
  branches: z.array(DiscussionBranchSchema),
}).strict()

export type StoredDiscussion = z.infer<typeof DiscussionSchema>

export const ContextsSchema = z.object({
  passageId: z.string().uuid(),
  manifests: z.array(ContextManifestSchema),
}).strict()

export type StoredContexts = z.infer<typeof ContextsSchema>

export const ConclusionsSchema = z.object({
  passageId: z.string().uuid(),
  conclusions: z.array(ConclusionSchema),
}).strict()

export type StoredConclusions = z.infer<typeof ConclusionsSchema>
