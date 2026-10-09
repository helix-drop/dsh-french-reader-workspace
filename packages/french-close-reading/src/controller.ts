import type { Context } from '@deepseek-ai/cordis'
import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { z } from 'zod'
import { previewImport } from './import-preview.ts'
import {
  appendLexiconOccurrence,
  createLexiconEntry,
  grammarHash,
  listLexicon,
  lookupMot,
  readLexiconEntries,
  rebuildLexiconIndex,
  recordLexiconSource,
  renderLexiconEntry,
  setLexiconSection,
  writeLexiconIndex,
  type RecordTable,
} from './lexicon-store.ts'
import type { SourceFetch } from './source-gate.ts'
import {
  AgyBackend,
} from './agy-backend.ts'
import {
  addConclusion,
  addContextManifest,
  appendMessage,
  branchHistory,
  createBranch,
  listConclusions,
  migrateContextsToPerRecord,
  readContextManifest,
  readDiscussion,
  setBranchStatus,
  setGrammarMastery,
} from './discussion-store.ts'
import {
  ANALYSIS_CONTEXT_CHARACTER_LIMIT,
  analysisPrompt,
  coverageOf,
  selectAnalysisContext,
  parseAnalysisReply,
  publishAnalysisVersion,
  putSentenceAnalysis,
  readAnalysisVersions,
  readSentenceAnalyses,
} from './analysis-store.ts'
import { validateSentenceAnalysis } from './analysis.ts'
import {
  fetchLexiconSource,
  listLexiconSources,
} from './source-fetch.ts'
import {
  compileContext,
  renderAnalysisSystem,
  renderPrompt,
  renderSystem,
} from './context-compiler.ts'
import {
  extractGrammarPoints,
  type ExtractedGrammarPoint,
} from './answer-extraction.ts'
import {
  answerForLemma,
  mergeDataset,
  missingPersons,
  readConjugationRecord,
  writeConjugationDataset,
} from './conjugation-store.ts'
import { fetchConjugationDataset } from './conjugation-fetch.ts'
import type { PageFetcher } from './conjugation-source.ts'
import {
  beginGenerationJob,
  finishGenerationJob,
  listGenerationJobs as listStoredGenerationJobs,
  readGenerationJob,
  reconcileGenerationJobs,
  recordFirstTextDelta,
  recordGenerationPhase,
  recordGenerationProgress,
} from './generation-store.ts'
import {
  DshLlmBackend,
  type GenerateOutcome,
  type GenerationBackend,
} from './generation.ts'
import {
  ANCHOR_ID_PATTERN,
  adoptionsKey,
  analysisKey,
  GRAMMAR_STORE_KEY,
  grammarKey,
  BRANCH_KINDS,
  EXCERPT_CHARACTERS,
  FRENCH_READER_DOMAIN,
  MAX_BRANCH_BODY_CHARACTERS,
  MAX_BRANCHES,
  MAX_BRANCH_TITLE_CHARACTERS,
  MAX_PASSAGES,
  MAX_PAGE_SIZE,
  MAX_SOURCE_CHARACTERS,
  MAX_TITLE_CHARACTERS,
  MAX_TRANSLATION_CHARACTERS,
  runsKey,
  segmentsKey,
  LEXICON_INDEX_KEY,
  lexiconKey,
  SELECTION_GAP,
  selectionAnchorId,
  selectionKey,
  segmentsKeyFor,
  sourceKey,
  TRANSLATION_SOURCES,
  type StoredAnchorRef,
  type StoredAnalysis,
  type StoredBranch,
  type StoredContextManifest,
  type StoredSentenceAnalysis,
  type StoredDiscussionBranch,
  type StoredPassage,
  type StoredRun,
  type StoredRunExtraction,
  type StoredGenerationJob,
  type StoredRunIntent,
  type StoredRuns,
  type StoredSelection,
  type StoredSegmentation,
  type StoredAdoptions,
  type StoredGrammarEntry,
  type StoredGrammarPending,
  type StoredGrammarStore,
  type StoredLexiconEntry,
  type StoredLexiconIndex,
  type StoredSourceRevision,
  type StoredTranslation,
} from './domain.ts'
import {
  findAnchor,
  isKnownAnchor,
  PASSAGE_ANCHOR_ID,
  segmentSource,
  SEGMENTATION_REVISION,
  type ParagraphAnchor,
} from './segmentation.ts'
import type {
  AskInput,
  AskPreview,
  AskRequest,
  AskFrame,
  AskResult,
  BackendModelView,
  BackendStatus,
  CreateBranchRequest,
  CreateBranchValue,
  DiscussionView,
  ListBackendModelsRequest,
  ListBackendModelsValue,
  ListBackendsRequest,
  ListBackendsValue,
  ListDiscussionRequest,
  PreviewAskRequest,
  PreviewAskValue,
  FetchLexiconSourceRequest,
  FetchLexiconSourceValue,
  ListLexiconSourcesRequest,
  ListLexiconSourcesValue,
  ReadContextRequest,
  ReadContextValue,
  AnalyseParagraphRequest,
  AnalyseParagraphResult,
  AnalyseSentenceRequest,
  AnalyseSentenceResult,
  PreviewAnalysisContextRequest,
  PreviewAnalysisContextValue,
  CancelAnalysisRequest,
  CancelAnalysisValue,
  AnalysisCoverageValue,
  ReadAnalysisCoverageRequest,
  PublishAnalysisRequest,
  PublishAnalysisValue,
  PutSentenceAnalysisRequest,
  PutSentenceAnalysisValue,
  ReadSentenceAnalysisRequest,
  ReadSentenceAnalysisValue,
  SetGrammarMasteryRequest,
  SetGrammarMasteryValue,
  RecordConclusionRequest,
  RecordConclusionValue,
  SetBranchStateRequest,
  SetBranchStateValue,
} from './generation-types.ts'
import type {
  AddBranchRequest,
  AnchorStatus,
  AddBranchValue,
  ArchivePassageRequest,
  ArchivePassageValue,
  RestorePassageRequest,
  RestorePassageValue,
  CreateSelectionRequest,
  CreateSelectionValue,
  ListGrammarRequest,
  ListGrammarValue,
  ConjugationRequest,
  FetchConjugationValue,
  ListLexiconRequest,
  ListLexiconValue,
  ReadConjugationValue,
  RenderLexiconRequest,
  RenderLexiconValue,
  ResolveGrammarRequest,
  ResolveGrammarValue,
  CreatePassageRequest,
  CreatePassageValue,
  ExportLibraryRequest,
  ExportLibraryValue,
  ImportLibraryRequest,
  ImportLibraryValue,
  ExportPassagesValue,
  JsonValue,
  GetPassageRequest,
  GetPassageValue,
  ImportPreviewValue,
  PreviewImportRequest,
  GetSegmentationRequest,
  GetSegmentationValue,
  ListAnalysisRequest,
  ListAnalysisValue,
  LexiconLookup,
  LookupMotRequest,
  CreateLexiconEntryRequest,
  CreateLexiconEntryValue,
  AdoptTranslationRequest,
  AdoptTranslationValue,
  LexiconView,
  Reconciliation,
  ReconciliationItem,
  ListPassagesRequest,
  ListPassagesValue,
  Passage,
  PassageSummary,
  SaveTranslationRequest,
  SaveTranslationValue,
} from './types.ts'

const listRequestSchema = z.object({
  offset: z.number().int().min(0).max(MAX_PASSAGES - 1),
  limit: z.number().int().min(1).max(MAX_PAGE_SIZE),
}).strict()

const getRequestSchema = z.object({
  id: z.string().uuid(),
}).strict()

const archiveRequestSchema = z.object({
  passageId: z.string().uuid(),
  operationId: z.string().uuid(),
  expectedSourceRevision: z.number().int().min(1),
}).strict()

const restoreRequestSchema = z.object({
  passageId: z.string().uuid(),
  expectedSourceRevision: z.number().int().min(1),
}).strict()

const importLibraryRequestSchema = z.object({
  schemaVersion: z.literal(1),
  exportedAt: z.string().datetime(),
  records: z.array(z.object({ key: z.string().min(1), record: z.unknown() }).strict()),
}).strict()

const renderLexiconRequestSchema = z.object({
  entryId: z.string().uuid(),
  wantsEtymology: z.boolean(),
}).strict()

const resolveGrammarRequestSchema = z.object({
  pendingId: z.string().uuid(),
  decision: z.enum(['attach', 'create', 'discard']),
  entryId: z.string().uuid().nullable(),
  keyPoints: z.string().max(MAX_TRANSLATION_CHARACTERS).nullable(),
  operationId: z.string().uuid(),
}).strict()

const createSelectionRequestSchema = z.object({
  passageId: z.string().uuid(),
  operationId: z.string().uuid(),
  ranges: z.array(z.object({
    start: z.number().int().min(0),
    end: z.number().int().min(0),
  }).strict()).min(1).max(8),
  note: z.string().max(MAX_BRANCH_TITLE_CHARACTERS),
}).strict()

const previewRequestSchema = z.object({
  title: z.string().max(MAX_TITLE_CHARACTERS),
  sourceText: z.string().min(1).max(MAX_SOURCE_CHARACTERS),
}).strict()

const createRequestSchema = z.object({
  id: z.string().uuid(),
  operationId: z.string().uuid(),
  title: z.string().trim().min(1).max(MAX_TITLE_CHARACTERS),
  sourceText: z.string().min(1).max(MAX_SOURCE_CHARACTERS)
    .refine((value) => value.trim().length > 0, 'source text must not be blank'),
}).strict()

const anchorIdSchema = z.string().min(1).max(40).regex(ANCHOR_ID_PATTERN)

/** Bounded excerpt kept with an anchor: enough to relocate, never the whole document. */
const EXCERPT_LIMIT = 500

const segmentationRequestSchema = z.object({ passageId: z.string().uuid() }).strict()

const backendModelsRequestSchema = z.object({
  backend: z.string().min(1).max(40),
}).strict()

const contextExtraSchema = z.object({
  refId: z.string().min(1).max(120),
  reason: z.string().max(200),
  text: z.string().max(MAX_SOURCE_CHARACTERS),
}).strict()

const previewAskRequestSchema = z.object({
  passageId: z.string().uuid(),
  branchId: z.string().uuid(),
  question: z.string().max(MAX_BRANCH_BODY_CHARACTERS),
  backend: z.string().min(1).max(40),
  model: z.string().min(1).max(160),
  extras: z.array(contextExtraSchema).max(20),
}).strict()

const askRequestSchema = previewAskRequestSchema.extend({
  reasoningEffort: z.string().max(40).nullable(),
  operationId: z.string().uuid(),
  expectedFingerprint: z.string().max(80).nullable(),
}).strict()

const createBranchRequestSchema = z.object({
  passageId: z.string().uuid(),
  anchorId: anchorIdSchema,
  kind: z.enum(['constituents', 'grammar', 'vocabulary', 'translation', 'note', 'discussion']),
  title: z.string().trim().min(1).max(MAX_BRANCH_TITLE_CHARACTERS),
  parentId: z.string().uuid().nullable(),
  forkedFrom: z.object({
    branchId: z.string().uuid(),
    messageId: z.string().uuid(),
  }).strict().nullable(),
  operationId: z.string().uuid(),
}).strict()

const setBranchStateRequestSchema = z.object({
  passageId: z.string().uuid(),
  branchId: z.string().uuid(),
  status: z.enum(['open', 'understood', 'unresolved', 'disputed', 'archived']).nullable(),
  title: z.string().trim().min(1).max(MAX_BRANCH_TITLE_CHARACTERS).nullable(),
}).strict()

const recordConclusionRequestSchema = z.object({
  passageId: z.string().uuid(),
  branchId: z.string().uuid(),
  anchorId: anchorIdSchema,
  messageId: z.string().uuid().nullable(),
  text: z.string().trim().min(1).max(MAX_TRANSLATION_CHARACTERS),
  status: z.enum(['proposed', 'confirmed']),
  operationId: z.string().uuid(),
}).strict()

const conjugationRequestSchema = z.object({
  lemma: z.string().trim().min(1).max(80),
}).strict()

const lookupMotRequestSchema = z.object({
  mot: z.string().trim().min(1).max(80),
  /** Optional hint; a wrong hint must not hide an exact hit, so it only narrows. */
  partOfSpeech: z.string().max(40).nullable(),
}).strict()

const createLexiconEntryRequestSchema = z.object({
  mot: z.string().trim().min(1).max(80),
  partOfSpeech: z.string().trim().min(1).max(40),
  lemma: z.string().trim().min(1).max(80).nullable(),
  forms: z.array(z.string().trim().min(1).max(80)).max(50),
  label: z.string().trim().min(1).max(80),
  definition: z.string().trim().min(1).max(4000),
  provenance: z.enum(['user', 'mixed']).optional(),
  operationId: z.string().uuid(),
  passageId: z.string().uuid(),
  anchorId: anchorIdSchema,
  occurrenceNote: z.string().trim().min(1).max(500),
}).strict()

const createLexiconOccurrenceValueSchema = z.object({
  kind: z.enum(['appended', 'already-appended', 'not-attempted', 'failed']),
  reason: z.string().nullable(),
}).strict()

const createLexiconEntryValueSchema = z.union([
  z.object({
    kind: z.enum(['created', 'exists']), entryId: z.string().uuid(),
    occurrence: createLexiconOccurrenceValueSchema,
  }).strict(),
  z.object({
    kind: z.literal('conflict'), entryId: z.null(),
    reason: z.enum(['passage-unknown', 'anchor-unknown', 'mot-blank', 'key-collision']),
    occurrence: createLexiconOccurrenceValueSchema,
  }).strict(),
])

const adoptTranslationRequestSchema = z.object({
  passageId: z.string().uuid(),
  anchorId: anchorIdSchema,
  translationId: z.string().uuid(),
  operationId: z.string().uuid(),
}).strict()

const fetchLexiconSourceRequestSchema = z.object({
  entryId: z.string().uuid(),
  source: z.string().min(1).max(40),
  section: z.string().min(1).max(40),
  mot: z.string().min(1).max(120),
}).strict()

const listLexiconSourcesRequestSchema = z.object({ scope: z.literal('all') }).strict()

const setGrammarMasteryRequestSchema = z.object({
  entryId: z.string().uuid(),
  mastery: z.enum(['learning', 'reviewing', 'known']),
  expectedRevision: z.number().int().min(1).nullable(),
  operationId: z.string().uuid(),
}).strict()

const sentenceAnalysisRequestSchema = z.object({
  passageId: z.string().uuid(),
  anchorId: anchorIdSchema,
}).strict()

const previewAnalysisContextRequestSchema = z.object({
  passageId: z.string().uuid(),
  anchorId: anchorIdSchema,
  paragraphIds: z.array(z.string().min(1).max(32)).max(3).optional(),
}).strict()

const analyseSentenceRequestSchema = z.object({
  passageId: z.string().uuid(),
  anchorId: anchorIdSchema,
  backend: z.string().min(1).max(40),
  model: z.string().min(1).max(160),
  reasoningEffort: z.string().max(40).nullable(),
  operationId: z.string().uuid(),
  paragraphIds: z.array(z.string().min(1).max(32)).max(3).optional(),
  expectedFingerprint: z.string().min(1).max(128).nullable().optional(),
}).strict()

async function analysisContextFingerprint(input: {
  passageId: string
  sourceRevision: number
  segmentationRevision: number
  anchorId: string
  sentenceText: string
  candidates: NonNullable<ReturnType<typeof selectAnalysisContext>>['candidates']
}): Promise<string> {
  const serialized = JSON.stringify({
    passageId: input.passageId,
    sourceRevision: input.sourceRevision,
    segmentationRevision: input.segmentationRevision,
    anchorId: input.anchorId,
    sentenceText: input.sentenceText,
    materials: input.candidates.filter((candidate) => candidate.included).map(({ paragraphId, relation, text }) => ({ paragraphId, relation, text })),
  })
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

const cancelAnalysisRequestSchema = z.object({
  passageId: z.string().uuid(),
  operationId: z.string().uuid(),
}).strict()

const analyseParagraphRequestSchema = z.object({
  passageId: z.string().uuid(),
  paragraphId: anchorIdSchema,
  backend: z.string().min(1).max(40),
  model: z.string().min(1).max(160),
  reasoningEffort: z.string().max(40).nullable(),
  operationId: z.string().uuid(),
}).strict()

const putSentenceAnalysisRequestSchema = z.object({
  passageId: z.string().uuid(),
  anchorId: anchorIdSchema,
  // The reply travels as text and is read by the same parser a model reply goes
  // through, so there is no second shape to keep in step.
  analysisJson: z.string().min(2).max(MAX_SOURCE_CHARACTERS),
}).strict()

const publishAnalysisRequestSchema = z.object({
  passageId: z.string().uuid(),
  overallTranslation: z.string().max(MAX_TRANSLATION_CHARACTERS).nullable(),
  cohesion: z.string().max(MAX_TRANSLATION_CHARACTERS),
}).strict()

const readContextRequestSchema = z.object({
  passageId: z.string().uuid(),
  contextId: z.string().uuid(),
}).strict()

const saveTranslationRequestSchema = z.object({
  passageId: z.string().uuid(),
  operationId: z.string().uuid(),
  anchorId: anchorIdSchema,
  source: z.enum(TRANSLATION_SOURCES).default('ai'),
  note: z.string().max(MAX_BRANCH_BODY_CHARACTERS).default(''),
  language: z.string().min(2).max(35),
  text: z.string().min(1).max(MAX_TRANSLATION_CHARACTERS)
    .refine((value) => value.trim().length > 0, 'translation text must not be blank'),
}).strict()

const addBranchRequestSchema = z.object({
  passageId: z.string().uuid(),
  operationId: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
  anchorId: anchorIdSchema,
  kind: z.enum(BRANCH_KINDS),
  title: z.string().trim().min(1).max(MAX_BRANCH_TITLE_CHARACTERS),
  body: z.string().max(MAX_BRANCH_BODY_CHARACTERS),
}).strict()

/**
 * Where a controller keeps the context and the injected backend list.
 *
 * Neither can be a private class field: a decorator lowers this class into a
 * wrapper, and a `#field` is brand-checked against the wrapper's instances, which
 * a live run reported as "Cannot read private member #backends from an object
 * whose class did not declare it".
 *
 * A `WeakMap` keyed by the instance is not enough either, and the test that
 * reaches these methods through a wrapper proved it: the call can arrive on an
 * object that merely inherits from the controller. So the state hangs off a
 * **symbol-keyed property**, which is inherited like any other member, is not
 * enumerable in JSON, and cannot collide with a user field. The registry is keyed
 * by a symbol from the global registry so a duplicated module copy finds the same
 * one.
 */
const STATE = Symbol.for('dsh.french-close-reading.controller.state')

interface ControllerState {
  ctx: Context
  backends: GenerationBackend[] | null
}

function stateOf(controller: object): ControllerState {
  const state = (controller as { [STATE]?: ControllerState })[STATE]
  if (state === undefined) throw new Error('french-reader controller state is unavailable')
  return state
}

interface ActiveAnalysisOperation {
  passageId: string
  parentOperationId: string | null
  controller: AbortController
  /** Once the durable write starts, cancellation can no longer promise rollback. */
  phase: 'generating' | 'committing'
}

interface PreparedAnalysisOperation {
  active: ActiveAnalysisOperation
  signal: AbortSignal
  dispose: () => void
}

function linkAbortSignals(signals: readonly AbortSignal[]): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController()
  const listeners: Array<{ signal: AbortSignal; listener: () => void }> = []
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason)
      break
    }
    const listener = () => controller.abort(signal.reason)
    signal.addEventListener('abort', listener, { once: true })
    listeners.push({ signal, listener })
  }
  return {
    signal: controller.signal,
    dispose: () => {
      for (const { signal, listener } of listeners) signal.removeEventListener('abort', listener)
    },
  }
}

/** Host service behind the generated `ctx.remote.frenchReader` namespace. */
export class FrenchReaderController extends TypertRemoteService {
  private writeTail: Promise<void> = Promise.resolve()
  private readonly activeAnalyses = new Map<string, ActiveAnalysisOperation>()
  private readonly queuedAnalysisCancellations = new Map<string, { passageId: string; expiresAt: number }>()

  /** The one storage table this plugin owns; the store modules take it as data. */
  private table(): RecordTable {
    return this.domain.table('records')
  }

  constructor(
    ctx: Context,
    private readonly domain: Domain<typeof FRENCH_READER_DOMAIN>,
    backends: GenerationBackend[] | null = null,
  ) {
    super(ctx, 'frenchReader')
    // These are held beside the instance rather than on it. Two reasons, both
    // learned the hard way: the base class owns the public `ctx` member, so
    // declaring one here would clash with it; and a **private class field does
    // not survive the decorator lowering** — the compiled class wraps the
    // declared one, so `#field` access fails the brand check with "Cannot read
    // private member … from an object whose class did not declare it".
    Object.defineProperty(this, STATE, {
      value: { ctx, backends } satisfies ControllerState,
      enumerable: false, writable: false, configurable: false,
    })
  }

  @Remote('listPassages')
  async listPassages(request: ListPassagesRequest, signal: AbortSignal): Promise<ListPassagesValue> {
    const parsed = listRequestSchema.safeParse(request)
    if (!parsed.success) throw badRequest('Invalid passage-list request', parsed.error.issues)
    signal.throwIfAborted()

    const rows = this.readPassages()
      .filter((passage) => passage.archivedAt === null)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id))
    const start = parsed.data.offset
    const end = start + parsed.data.limit
    const value: ListPassagesValue = {
      items: rows.slice(start, end).map(toSummary),
      offset: start,
      total: rows.length,
      hasMore: end < rows.length,
    }
    signal.throwIfAborted()
    return value
  }

  @Remote('listArchivedPassages')
  async listArchivedPassages(request: ListPassagesRequest, signal: AbortSignal): Promise<ListPassagesValue> {
    const parsed = listRequestSchema.safeParse(request)
    if (!parsed.success) throw badRequest('Invalid archived-passage list request', parsed.error.issues)
    signal.throwIfAborted()

    const rows = this.readPassages()
      .filter((passage) => passage.archivedAt !== null)
      .sort((left, right) => (right.archivedAt ?? '').localeCompare(left.archivedAt ?? '')
        || left.id.localeCompare(right.id))
    const start = parsed.data.offset
    const end = start + parsed.data.limit
    const value: ListPassagesValue = {
      items: rows.slice(start, end).map(toSummary),
      offset: start,
      total: rows.length,
      hasMore: end < rows.length,
    }
    signal.throwIfAborted()
    return value
  }

  @Remote('getPassage')
  async getPassage(request: GetPassageRequest, signal: AbortSignal): Promise<GetPassageValue> {
    const parsed = getRequestSchema.safeParse(request)
    if (!parsed.success) throw badRequest('Invalid passage identity', parsed.error.issues)
    signal.throwIfAborted()

    const row = this.table().get(parsed.data.id)
    const value: GetPassageValue = {
      passage: row?.kind === 'passage' ? toPassage(row.payload) : null,
    }
    signal.throwIfAborted()
    return value
  }

  // --- generation surface: backends, context, discussion ---------------------

  @Remote('listBackends')
  listBackendsRemote(request: ListBackendsRequest, signal: AbortSignal): ListBackendsValue {
    signal.throwIfAborted()
    void request
    return { backends: this.listBackends() }
  }

  @Remote('listBackendModels')
  async listBackendModelsRemote(request: ListBackendModelsRequest, signal: AbortSignal): Promise<ListBackendModelsValue> {
    const parsed = backendModelsRequestSchema.safeParse(request)
    if (!parsed.success) throw badRequest('Invalid backend-model request', parsed.error.issues)
    signal.throwIfAborted()
    const value = await this.listBackendModels(parsed.data.backend, signal)
    return { models: value.models, reason: value.reason ?? null }
  }

  /**
   * What a turn would send, without sending it. The panel shows this list to the
   * reader, and the same compilation is what the real ask transmits.
   */
  @Remote('previewAsk')
  previewAskRemote(request: PreviewAskRequest, signal: AbortSignal): PreviewAskValue {
    const parsed = previewAskRequestSchema.safeParse(request)
    if (!parsed.success) throw badRequest('Invalid context preview request', parsed.error.issues)
    signal.throwIfAborted()
    return this.previewAsk(parsed.data, signal)
  }

  /**
   * Send one turn to the chosen backend. The model is a decision, not a global:
   * the panel passes the backend and model it showed the reader.
   */
  @Remote('ask')
  async askRemote(request: AskRequest, signal: AbortSignal): Promise<AskResult> {
    const parsed = askRequestSchema.safeParse(request)
    if (!parsed.success) throw badRequest('Invalid ask request', parsed.error.issues)
    signal.throwIfAborted()
    return this.ask(parsed.data, signal)
  }

  @Remote('listDiscussion')
  listDiscussionRemote(request: ListDiscussionRequest, signal: AbortSignal): DiscussionView {
    const parsed = segmentationRequestSchema.safeParse(request)
    if (!parsed.success) throw badRequest('Invalid discussion request', parsed.error.issues)
    signal.throwIfAborted()
    return this.listDiscussion(parsed.data.passageId, signal)
  }

  @Remote('createBranch')
  async createBranchRemote(request: CreateBranchRequest, signal: AbortSignal): Promise<CreateBranchValue> {
    const parsed = createBranchRequestSchema.safeParse(request)
    if (!parsed.success) throw badRequest('Invalid branch request', parsed.error.issues)
    signal.throwIfAborted()
    const value = await this.createDiscussionBranch(parsed.data, signal)
    if (value.created) return { kind: 'created', branchId: value.branchId! }
    if (value.alreadyCreated === true) return { kind: 'already-created', branchId: value.branchId! }
    return { kind: 'conflict', reason: value.reason as CreateBranchValue extends { reason: infer R } ? R : never }
  }

  @Remote('setBranchState')
  async setBranchStateRemote(request: SetBranchStateRequest, signal: AbortSignal): Promise<SetBranchStateValue> {
    const parsed = setBranchStateRequestSchema.safeParse(request)
    if (!parsed.success) throw badRequest('Invalid branch-state request', parsed.error.issues)
    signal.throwIfAborted()
    const value = await this.setDiscussionBranchState({
      passageId: parsed.data.passageId,
      branchId: parsed.data.branchId,
      ...(parsed.data.status === null ? {} : { status: parsed.data.status }),
      ...(parsed.data.title === null ? {} : { title: parsed.data.title }),
    }, signal)
    return value.updated
      ? { kind: 'updated', branchId: parsed.data.branchId }
      : { kind: 'conflict', reason: 'branch-unknown' }
  }

  @Remote('recordConclusion')
  async recordConclusionRemote(request: RecordConclusionRequest, signal: AbortSignal): Promise<RecordConclusionValue> {
    const parsed = recordConclusionRequestSchema.safeParse(request)
    if (!parsed.success) throw badRequest('Invalid conclusion request', parsed.error.issues)
    signal.throwIfAborted()
    const value = await this.recordConclusion(parsed.data, signal)
    if (value.added) return { kind: 'recorded', conclusionId: value.conclusionId! }
    if (value.alreadyAdded === true && value.conclusionId !== undefined) {
      return { kind: 'already-recorded', conclusionId: value.conclusionId }
    }
    return { kind: 'conflict', reason: (value.reason ?? 'branch-unknown') as 'branch-unknown' }
  }

  /**
   * Explicitly revoke a sentence or paragraph analysis before its durable commit.
   * The separate request does not depend on the original Remote transport's
   * AbortSignal reaching the Host; `too-late` names the write boundary honestly.
   */
  @Remote('cancelAnalysis')
  async cancelAnalysisRemote(request: CancelAnalysisRequest, signal: AbortSignal): Promise<CancelAnalysisValue> {
    const parsed = cancelAnalysisRequestSchema.safeParse(request)
    if (!parsed.success) throw badRequest('Invalid analysis-cancellation request', parsed.error.issues)
    signal.throwIfAborted()

    const targets = [...this.activeAnalyses.entries()]
      .filter(([operationId, active]) => (operationId === parsed.data.operationId
        || active.parentOperationId === parsed.data.operationId)
        && active.passageId === parsed.data.passageId)
    if (targets.some(([, active]) => active.phase === 'committing')) return { kind: 'too-late' }
    if (targets.length > 0) {
      for (const [, active] of targets) active.controller.abort()
      return { kind: 'cancel-requested' }
    }

    const job = readGenerationJob(this.table(), 'analyse', parsed.data.operationId)
    if (job !== undefined && job.passageId === parsed.data.passageId && job.status !== 'running') {
      return { kind: 'already-finished' }
    }
    this.rememberAnalysisCancellation(parsed.data.passageId, parsed.data.operationId)
    return { kind: 'cancel-queued' }
  }

  /**
   * How much of the passage is analysed, measured against the current sentences
   * rather than claimed.
   */
  @Remote('readAnalysisCoverage')
  readAnalysisCoverageRemote(request: ReadAnalysisCoverageRequest, signal: AbortSignal): AnalysisCoverageValue {
    const parsed = segmentationRequestSchema.safeParse(request)
    if (!parsed.success) throw badRequest('Invalid coverage request', parsed.error.issues)
    signal.throwIfAborted()
    return this.readAnalysisCoverage(parsed.data.passageId, signal)
  }

  /** One sentence's stored analysis, with the gate's verdict attached. */
  @Remote('readSentenceAnalysis')
  readSentenceAnalysisRemote(request: ReadSentenceAnalysisRequest, signal: AbortSignal): ReadSentenceAnalysisValue {
    const parsed = sentenceAnalysisRequestSchema.safeParse(request)
    if (!parsed.success) throw badRequest('Invalid analysis request', parsed.error.issues)
    signal.throwIfAborted()
    const value = this.readSentenceAnalysis(parsed.data.passageId, parsed.data.anchorId, signal)
    if (value.found !== true || value.analysis === undefined) {
      // A stale analysis exists but describes text that is no longer the
      // sentence: it is named as stale rather than served as usable or as gone.
      return value.stale === true ? { kind: 'stale' } : { kind: 'missing' }
    }
    const analysis = value.analysis
    return {
      kind: 'found',
      analysis: {
        anchorId: analysis.anchorId,
        text: analysis.text,
        translation: analysis.translation,
        backbone: analysis.backbone,
        clauses: analysis.clauses.map((clause) => ({
          id: clause.id, role: clause.role, start: clause.start, end: clause.end,
          text: clause.text, parentId: clause.parentId,
        })),
        constituents: analysis.constituents.map((item) => ({
          id: item.id, role: item.role, start: item.start, end: item.end,
          text: item.text, clauseId: item.clauseId, partOfSpeech: item.partOfSpeech,
        })),
        morphology: analysis.morphology.map((item) => ({
          id: item.id, form: item.form, lemma: item.lemma, partOfSpeech: item.partOfSpeech,
          tense: item.tense, mood: item.mood, person: item.person, gender: item.gender,
          number: item.number, agreesWith: item.agreesWith, note: item.note,
        })),
        explanations: analysis.explanations.map((item) => ({
          id: item.id, kind: item.kind, text: item.text, start: item.start, end: item.end,
        })),
        provenance: analysis.provenance,
        status: analysis.status,
        revision: analysis.revision,
      },
      errors: value.errors ?? [],
      hints: value.hints ?? [],
    }
  }

  /** Preview same-passage paragraph context before any sentence model call. */
  @Remote('previewAnalysisContext')
  async previewAnalysisContextRemote(request: PreviewAnalysisContextRequest, signal: AbortSignal): Promise<PreviewAnalysisContextValue> {
    const parsed = previewAnalysisContextRequestSchema.safeParse(request)
    if (!parsed.success) throw badRequest('Invalid analysis context preview request', parsed.error.issues)
    signal.throwIfAborted()
    const passage = this.readPassage(parsed.data.passageId)
    if (passage === undefined) throw badRequest('Unknown passage', [{ passageId: parsed.data.passageId }])
    const segmentation = this.readSegmentation(passage) ?? await this.serialize(() => this.persistSegmentation(passage))
    const sentence = segmentation.paragraphs.flatMap((paragraph) => paragraph.sentences)
      .find((entry) => entry.id === parsed.data.anchorId)
    if (sentence === undefined) throw badRequest('Analysis context requires a sentence anchor', [{ anchorId: parsed.data.anchorId }])
    const selection = selectAnalysisContext(segmentation.paragraphs, sentence.id, parsed.data.paragraphIds)
    if (selection === null) throw badRequest('Analysis context paragraph could not be resolved', [{ anchorId: sentence.id }])
    const fingerprint = selection.ok ? await analysisContextFingerprint({
      passageId: passage.id,
      sourceRevision: passage.sourceRevision,
      segmentationRevision: segmentation.revision,
      anchorId: sentence.id,
      sentenceText: sentence.text,
      candidates: selection.candidates,
    }) : null
    return {
      ok: selection.ok,
      reason: selection.reason,
      anchorId: sentence.id,
      currentParagraphId: selection.currentParagraphId,
      characterLimit: ANALYSIS_CONTEXT_CHARACTER_LIMIT,
      characters: selection.characters,
      materials: selection.candidates,
      includedParagraphIds: selection.includedParagraphIds,
      omittedParagraphIds: selection.omittedParagraphIds,
      fingerprint,
    }
  }

  /** Generate one sentence analysis and store it only if it passes the gate. */
  @Remote('analyseSentence')
  async analyseSentenceRemote(request: AnalyseSentenceRequest, signal: AbortSignal): Promise<AnalyseSentenceResult> {
    const parsed = analyseSentenceRequestSchema.safeParse(request)
    if (!parsed.success) throw badRequest('Invalid analysis generation request', parsed.error.issues)
    signal.throwIfAborted()
    return this.analyseSentence(parsed.data, signal)
  }

  /**
   * Generate the analyses one paragraph is missing, one model call per sentence.
   */
  @Remote('analyseParagraph')
  async analyseParagraphRemote(request: AnalyseParagraphRequest, signal: AbortSignal): Promise<AnalyseParagraphResult> {
    const parsed = analyseParagraphRequestSchema.safeParse(request)
    if (!parsed.success) throw badRequest('Invalid paragraph analysis request', parsed.error.issues)
    signal.throwIfAborted()
    return this.analyseParagraph(parsed.data, signal)
  }

  /** Write one sentence analysis supplied directly, through the same gate. */
  @Remote('putSentenceAnalysis')
  async putSentenceAnalysisRemote_(request: PutSentenceAnalysisRequest, signal: AbortSignal): Promise<PutSentenceAnalysisValue> {
    const parsed = putSentenceAnalysisRequestSchema.safeParse(request)
    if (!parsed.success) throw badRequest('Invalid analysis write', parsed.error.issues)
    signal.throwIfAborted()
    return this.putSentenceAnalysisRemote(parsed.data, signal)
  }

  /**
   * Publish the analysis as a version, naming the source revision it was written
   * against. Coverage is computed from what is stored.
   */
  @Remote('publishAnalysis')
  async publishAnalysisRemote(request: PublishAnalysisRequest, signal: AbortSignal): Promise<PublishAnalysisValue> {
    const parsed = publishAnalysisRequestSchema.safeParse(request)
    if (!parsed.success) throw badRequest('Invalid publish request', parsed.error.issues)
    signal.throwIfAborted()
    const value = await this.publishAnalysis(parsed.data, signal)
    return value.published
      ? {
        kind: 'published',
        versionId: value.versionId!,
        revision: value.revision ?? 0,
        coveredCount: value.coveredCount ?? 0,
      }
      : { kind: 'conflict', reason: value.reason ?? 'not-published' }
  }

  /**
   * Fetch one declared source for one entry. The verdict the gate reached is what
   * the caller stores; the panel shows it, and a failure is shown as a failure.
   */
  @Remote('fetchLexiconSource')
  async fetchLexiconSourceRemote(request: FetchLexiconSourceRequest, signal: AbortSignal): Promise<FetchLexiconSourceValue> {
    const parsed = fetchLexiconSourceRequestSchema.safeParse(request)
    if (!parsed.success) throw badRequest('Invalid source-fetch request', parsed.error.issues)
    signal.throwIfAborted()
    return this.fetchLexiconSource(parsed.data, signal)
  }

  @Remote('listLexiconSources')
  listLexiconSourcesRemote(request: ListLexiconSourcesRequest, signal: AbortSignal): ListLexiconSourcesValue {
    signal.throwIfAborted()
    void request
    return { sources: this.listLexiconSourceKinds() }
  }

  /**
   * The reader's own mastery decision for one grammar point. Nothing automatic
   * writes this field.
   */
  @Remote('setGrammarMastery')
  async setGrammarMasteryRemote(request: SetGrammarMasteryRequest, signal: AbortSignal): Promise<SetGrammarMasteryValue> {
    const parsed = setGrammarMasteryRequestSchema.safeParse(request)
    if (!parsed.success) throw badRequest('Invalid mastery request', parsed.error.issues)
    signal.throwIfAborted()
    const value = await this.setGrammarMastery(parsed.data, signal)
    if (value.updated) return { kind: 'updated', revision: value.revision ?? 0 }
    if (value.alreadyUpdated === true) return { kind: 'already-updated', revision: value.revision ?? 0 }
    if (value.reason === 'entry-unknown') {
      return { kind: 'conflict', reason: 'entry-unknown', revision: value.revision ?? 0 }
    }
    if (value.reason === 'revision-conflict') {
      return { kind: 'conflict', reason: 'revision-conflict', revision: value.revision ?? 0 }
    }
    return { kind: 'unchanged', revision: value.revision ?? 0 }
  }

  /** The exact text one stored answer was sent with, so a claim can be audited. */
  @Remote('readContext')
  readContextRemote(request: ReadContextRequest, signal: AbortSignal): ReadContextValue {
    const parsed = readContextRequestSchema.safeParse(request)
    if (!parsed.success) throw badRequest('Invalid context request', parsed.error.issues)
    signal.throwIfAborted()
    const found = this.readContext(parsed.data.passageId, parsed.data.contextId, signal)
    if (found.found !== true || found.manifest === undefined) return { kind: 'missing' }
    const manifest = found.manifest
    return {
      kind: 'found',
      contextId: manifest.id,
      fingerprint: manifest.fingerprint,
      characters: manifest.characters,
      backend: manifest.backend,
      model: manifest.model,
      materials: manifest.materials.map((material) => ({
        kind: material.kind,
        refId: material.refId,
        reason: material.reason,
        characters: material.text.length,
        excerpt: material.text.slice(0, 400),
      })),
      prompt: renderPrompt(manifest),
    }
  }

  /**
   * Archiving is the default removal path. It changes only the library index
   * state; source and analysis records remain exportable and recoverable.
   */
  @Remote('archivePassage')
  async archivePassage(request: ArchivePassageRequest, signal: AbortSignal): Promise<ArchivePassageValue> {
    const parsed = archiveRequestSchema.safeParse(request)
    if (!parsed.success) throw badRequest('Invalid archive request', parsed.error.issues)
    const input = parsed.data
    signal.throwIfAborted()

    return this.serialize(async () => {
      signal.throwIfAborted()
      const table = this.table()
      const record = table.get(input.passageId)
      if (record?.kind !== 'passage') return { kind: 'conflict', reason: 'passage-unknown' }
      if (record.payload.archivedAt !== null) return { kind: 'already-archived', passage: toPassage(record.payload) }
      if (record.payload.sourceRevision !== input.expectedSourceRevision) {
        return { kind: 'conflict', reason: 'revision-conflict' }
      }
      const operationUsed = this.readPassages().some((item) =>
        item.id !== input.passageId && item.archiveOperationId === input.operationId)
      if (operationUsed) return { kind: 'conflict', reason: 'operation-used' }

      const passage: StoredPassage = {
        ...record.payload,
        archivedAt: new Date().toISOString(),
        archiveOperationId: input.operationId,
      }
      await table.put(input.passageId, { kind: 'passage', recordVersion: 1, payload: passage })
      return { kind: 'archived', passage: toPassage(passage) }
    })
  }

  @Remote('restorePassage')
  async restorePassage(request: RestorePassageRequest, signal: AbortSignal): Promise<RestorePassageValue> {
    const parsed = restoreRequestSchema.safeParse(request)
    if (!parsed.success) throw badRequest('Invalid restore request', parsed.error.issues)
    const input = parsed.data

    return this.serialize(async () => {
      signal.throwIfAborted()
      const table = this.table()
      const record = table.get(input.passageId)
      if (record?.kind !== 'passage') return { kind: 'conflict', reason: 'passage-unknown' }
      if (record.payload.sourceRevision !== input.expectedSourceRevision) {
        return { kind: 'conflict', reason: 'revision-conflict' }
      }
      if (record.payload.archivedAt === null) {
        return { kind: 'already-active', passage: toPassage(record.payload) }
      }
      const passage: StoredPassage = {
        ...record.payload,
        archivedAt: null,
        archiveOperationId: null,
      }
      await table.put(input.passageId, { kind: 'passage', recordVersion: 1, payload: passage })
      return { kind: 'restored', passage: toPassage(passage) }
    })
  }

  /**
   * What an import would store. Read-only by construction: the panel shows the
   * boundaries and the flags, and nothing reaches storage until the reader
   * confirms and calls `createPassage`.
   */
  /**
   * Store a reader's phrase selection as an anchor the panel can then use for
   * translations, branches and grammar notes.
   */
  /**
   * A vocabulary card as its output policy renders it, with the policy's own
   * verdict attached: the panel shows the gaps instead of a tidy card.
   */
  @Remote('renderLexicon')
  async renderLexiconRemote(request: RenderLexiconRequest, signal: AbortSignal): Promise<RenderLexiconValue> {
    const parsed = renderLexiconRequestSchema.safeParse(request)
    if (!parsed.success) throw badRequest('Invalid render request', parsed.error.issues)
    const value = await this.renderLexiconEntry(parsed.data, signal)
    if (value.found !== true) return { kind: 'missing' }
    return {
      kind: 'card',
      rendered: value.rendered ?? '',
      sections: value.sections ?? [],
      errors: value.errors ?? [],
      hints: value.hints ?? [],
    }
  }

  /**
   * Close one pending candidate from the panel. The decision is the reader's:
   * attaching without new wording only adds the example, naming new wording
   * revises the rule, and neither can happen by accident.
   */
  @Remote('resolveGrammarCandidate')
  async resolveGrammarCandidateRemote(request: ResolveGrammarRequest, signal: AbortSignal): Promise<ResolveGrammarValue> {
    const parsed = resolveGrammarRequestSchema.safeParse(request)
    if (!parsed.success) throw badRequest('Invalid grammar decision', parsed.error.issues)
    const value = await this.resolveGrammarPending(parsed.data, signal)
    if (value.alreadyResolved === true) {
      return { kind: 'already-resolved', entryId: value.entryId ?? null, outcome: value.outcome ?? 'resolved' }
    }
    if (value.resolved === false) {
      return { kind: 'conflict', reason: (value.reason ?? 'pending-unknown') as 'pending-unknown' }
    }
    if (value.outcome === 'discarded') return { kind: 'discarded' }
    const entryId = value.entryId
    if (entryId === undefined || entryId === null) return { kind: 'conflict', reason: 'entry-unknown' }
    return value.outcome === 'created'
      ? { kind: 'created', entryId, outcome: 'created' }
      : { kind: 'attached', entryId, outcome: value.outcome ?? 'attached' }
  }

  /**
   * The vocabulary library as the panel lists it, projected to the wire shape so
   * the client never sees storage internals.
   */
  @Remote('listLexicon')
  async listLexiconRemote(request: ListLexiconRequest, signal: AbortSignal): Promise<ListLexiconValue> {
    signal.throwIfAborted()
    void request
    const entries = await this.listLexicon(signal)
    return { entries, total: entries.length }
  }

  /**
   * Grammar entries and the candidates still awaiting a human decision. The
   * panel shows both; decisions themselves go through their own endpoint.
   */
  @Remote('listGrammar')
  async listGrammarRemote(request: ListGrammarRequest, signal: AbortSignal): Promise<ListGrammarValue> {
    void request
    const value = await this.listGrammar(signal)
    return {
      entries: value.entries.map((entry) => ({
        entryId: entry.id,
        topic: entry.topic,
        level: entry.level,
        module: entry.module,
        mastery: entry.mastery,
        contentStatus: entry.contentStatus,
        askCount: entry.askCount,
        lastAskedAt: entry.lastAskedAt,
        revision: entry.revision,
        examples: entry.examples.length,
        exampleTexts: entry.examples.map((example) => example.text),
        notes: entry.notes,
        pitfalls: entry.pitfalls.length,
        pitfallTexts: entry.pitfalls.map((pitfall) => pitfall.text),
        keyPoints: entry.keyPoints,
      })),
      pending: value.pending.map((item) => ({
        pendingId: item.id,
        topic: item.topic,
        body: item.body,
        candidates: item.candidates,
        resolution: item.resolution,
        resolvedEntryId: item.resolvedEntryId,
      })),
    }
  }

  @Remote('createSelection')
  async createSelectionRemote(request: CreateSelectionRequest, signal: AbortSignal): Promise<CreateSelectionValue> {
    const parsed = createSelectionRequestSchema.safeParse(request)
    if (!parsed.success) throw badRequest('Invalid selection request', parsed.error.issues)
    const value = await this.createSelection(parsed.data, signal)
    if (value.anchorId === undefined || value.excerpt === undefined || value.ranges === undefined) {
      return { kind: 'conflict', reason: (value.reason ?? 'ranges-out-of-range') as 'range-out-of-bounds' }
    }
    return value.created
      ? { kind: 'created', anchorId: value.anchorId, excerpt: value.excerpt, ranges: value.ranges }
      : { kind: 'already-existed', anchorId: value.anchorId, excerpt: value.excerpt, ranges: value.ranges }
  }

  @Remote('previewImport')
  async previewImport(request: PreviewImportRequest, signal: AbortSignal): Promise<ImportPreviewValue> {
    const parsed = previewRequestSchema.safeParse(request)
    if (!parsed.success) throw badRequest('Invalid import preview request', parsed.error.issues)
    signal.throwIfAborted()
    const preview = previewImport(parsed.data)
    signal.throwIfAborted()
    return {
      title: preview.title,
      characters: preview.characters,
      paragraphs: preview.paragraphs,
      sentences: preview.sentences,
      blocks: preview.blocks,
      flags: preview.flags.map((flag) => ({ code: flag.code, severity: flag.severity, detail: flag.detail })),
      head: preview.head,
      tail: preview.tail,
    }
  }

  @Remote('createPassage')
  async createPassage(request: CreatePassageRequest, signal: AbortSignal): Promise<CreatePassageValue> {
    const parsed = createRequestSchema.safeParse(request)
    if (!parsed.success) throw badRequest('Invalid passage source', parsed.error.issues)
    const input = parsed.data
    signal.throwIfAborted()

    return this.serialize(async () => {
      signal.throwIfAborted()
      const table = this.table()
      let operationMatch: { key: string; payload: StoredPassage } | undefined

      for (const [key, record] of table.entries()) {
        if (record.kind !== 'passage' || record.payload.operationId !== input.operationId) continue
        operationMatch = { key, payload: record.payload }
        break
      }

      if (operationMatch !== undefined) {
        const sameIntent = operationMatch.key === input.id
          && operationMatch.payload.title === input.title
          && operationMatch.payload.sourceText === input.sourceText
        return sameIntent
          ? { kind: 'already-saved', passage: toPassage(operationMatch.payload) }
          : { kind: 'conflict', reason: 'operation-used', maxPassages: MAX_PASSAGES }
      }

      if (table.get(input.id) !== undefined) {
        return { kind: 'conflict', reason: 'id-used', maxPassages: MAX_PASSAGES }
      }

      const currentPassages = this.readPassages().filter((passage) => passage.archivedAt === null).length
      if (currentPassages >= MAX_PASSAGES) {
        return { kind: 'conflict', reason: 'limit-reached', maxPassages: MAX_PASSAGES }
      }

      const now = new Date().toISOString()
      const passage: StoredPassage = {
        id: input.id,
        operationId: input.operationId,
        title: input.title,
        sourceText: input.sourceText,
        sourceRevision: 1,
        segmentationRevision: 1,
        status: 'source-only',
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
        archiveOperationId: null,
      }
      await table.put(input.id, { kind: 'passage', recordVersion: 1, payload: passage })
      return { kind: 'created', passage: toPassage(passage) }
    })
  }

  @Remote('exportPassages')
  async exportPassages(signal: AbortSignal): Promise<ExportPassagesValue> {
    signal.throwIfAborted()
    const passages = this.readPassages()
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
      .map(toPassage)
    signal.throwIfAborted()
    return { schemaVersion: 1, exportedAt: new Date().toISOString(), passages }
  }

  /**
   * Segmentation is derived from the immutable source, so the first call
   * persists it and every later call returns the stored anchors: anchor ids in
   * translations and branches must keep pointing at the same text.
   */
  @Remote('getSegmentation')
  async getSegmentation(request: GetSegmentationRequest, signal: AbortSignal): Promise<GetSegmentationValue> {
    const parsed = segmentationRequestSchema.safeParse(request)
    if (!parsed.success) throw badRequest('Invalid segmentation request', parsed.error.issues)
    signal.throwIfAborted()

    const passage = this.readPassage(parsed.data.passageId)
    if (passage === undefined) return { segmentation: null }
    const stored = this.readSegmentation(passage)
    if (stored !== undefined) return { segmentation: stored }

    return this.serialize(async () => {
      signal.throwIfAborted()
      const current = this.readPassage(passage.id)
      if (current === undefined) return { segmentation: null }
      const existing = this.readSegmentation(current)
      if (existing !== undefined) return { segmentation: existing }
      return { segmentation: await this.persistSegmentation(current) }
    })
  }

  @Remote('saveTranslation')
  async saveTranslation(request: SaveTranslationRequest, signal: AbortSignal): Promise<SaveTranslationValue> {
    const parsed = saveTranslationRequestSchema.safeParse(request)
    if (!parsed.success) throw badRequest('Invalid translation', parsed.error.issues)
    const input = parsed.data
    signal.throwIfAborted()

    return this.serialize(async () => {
      signal.throwIfAborted()
      const passage = this.readPassage(input.passageId)
      if (passage === undefined) return { kind: 'conflict', reason: 'passage-unknown' }
      const segmentation = this.readSegmentation(passage) ?? await this.persistSegmentation(passage)
      if (!this.resolveAnchorId(passage.id, segmentation, input.anchorId).ok) {
        return { kind: 'conflict', reason: 'anchor-unknown' }
      }

      const resolve = (entry: StoredTranslation | StoredBranch): AnchorResolution =>
        this.resolveAnchor(passage, segmentation.paragraphs, entry)

      const analysis = this.readAnalysis(passage.id)
      const repeated = analysis.translations.find((entry) => entry.operationId === input.operationId)
      if (repeated !== undefined) {
        const sameIntent = repeated.anchorId === input.anchorId
          && repeated.language === input.language
          && repeated.text === input.text
          && repeated.source === input.source
          && repeated.note === input.note
        return sameIntent
          ? { kind: 'already-saved', translation: { ...repeated, ...resolve(repeated) } }
          : { kind: 'conflict', reason: 'operation-used' }
      }

      const translation: StoredTranslation = {
        id: globalThis.crypto.randomUUID(),
        anchorId: input.anchorId,
        anchor: this.anchorRef(passage, segmentation, input.anchorId),
        source: input.source,
        note: input.note,
        language: input.language,
        text: input.text,
        createdAt: new Date().toISOString(),
        operationId: input.operationId,
      }
      await this.writeAnalysis(passage.id, {
        ...analysis,
        translations: [...analysis.translations, translation],
      })
      return { kind: 'saved', translation: { ...translation, ...resolve(translation) } }
    })
  }

  @Remote('addBranch')
  async addBranch(request: AddBranchRequest, signal: AbortSignal): Promise<AddBranchValue> {
    const parsed = addBranchRequestSchema.safeParse(request)
    if (!parsed.success) throw badRequest('Invalid branch', parsed.error.issues)
    const input = parsed.data
    signal.throwIfAborted()

    return this.serialize(async () => {
      signal.throwIfAborted()
      const passage = this.readPassage(input.passageId)
      if (passage === undefined) return { kind: 'conflict', reason: 'passage-unknown', maxBranches: MAX_BRANCHES }
      const segmentation = this.readSegmentation(passage) ?? await this.persistSegmentation(passage)
      if (!this.resolveAnchorId(passage.id, segmentation, input.anchorId).ok) {
        return { kind: 'conflict', reason: 'anchor-unknown', maxBranches: MAX_BRANCHES }
      }

      const resolve = (entry: StoredTranslation | StoredBranch): AnchorResolution =>
        this.resolveAnchor(passage, segmentation.paragraphs, entry)

      const analysis = this.readAnalysis(passage.id)
      const repeated = analysis.branches.find((entry) => entry.operationId === input.operationId)
      if (repeated !== undefined) {
        const sameIntent = repeated.parentId === input.parentId
          && repeated.anchorId === input.anchorId
          && repeated.kind === input.kind
          && repeated.title === input.title
          && repeated.body === input.body
        return sameIntent
          ? { kind: 'already-saved', branch: { ...repeated, ...resolve(repeated) } }
          : { kind: 'conflict', reason: 'operation-used', maxBranches: MAX_BRANCHES }
      }

      if (input.parentId !== null && !analysis.branches.some((entry) => entry.id === input.parentId)) {
        return { kind: 'conflict', reason: 'parent-unknown', maxBranches: MAX_BRANCHES }
      }
      if (analysis.branches.length >= MAX_BRANCHES) {
        return { kind: 'conflict', reason: 'limit-reached', maxBranches: MAX_BRANCHES }
      }

      const branch: StoredBranch = {
        id: globalThis.crypto.randomUUID(),
        parentId: input.parentId,
        anchorId: input.anchorId,
        anchor: this.anchorRef(passage, segmentation, input.anchorId),
        kind: input.kind,
        title: input.title,
        body: input.body,
        createdAt: new Date().toISOString(),
        operationId: input.operationId,
      }
      await this.writeAnalysis(passage.id, {
        ...analysis,
        branches: [...analysis.branches, branch],
      })
      return { kind: 'created', branch: { ...branch, ...resolve(branch) } }
    })
  }

  @Remote('listAnalysis')
  async listAnalysis(request: ListAnalysisRequest, signal: AbortSignal): Promise<ListAnalysisValue> {
    const parsed = segmentationRequestSchema.safeParse(request)
    if (!parsed.success) throw badRequest('Invalid analysis request', parsed.error.issues)
    signal.throwIfAborted()

    const passage = this.readPassage(parsed.data.passageId)
    if (passage === undefined) {
      return { analysis: null, adoptions: [], reconciliation: { passageTranslationId: null, needed: false, items: [] } }
    }
    const analysis = this.readAnalysis(passage.id)
    // Anchors were resolved against the segmentation that existed when they were
    // written. Re-resolving them now is a projection, not a repair: a note whose
    // text moved is reported as relocated, and one whose text is gone keeps its
    // original anchor and is reported unresolved. Nothing is re-attached silently.
    const current = segmentSource(passage.sourceText)
    const status = (entry: StoredTranslation | StoredBranch): AnchorResolution =>
      this.resolveAnchor(passage, current, entry)
    signal.throwIfAborted()
    const adoptions = this.readAdoptions(passage.id)
    return {
      analysis: {
        passageId: passage.id,
        translations: analysis.translations.map((entry) => ({ ...entry, ...status(entry) })),
        branches: analysis.branches.map((entry) => ({ ...entry, ...status(entry) })),
      },
      adoptions: adoptions.entries
        .map((entry) => ({
          anchorId: entry.anchorId,
          translationId: entry.translationId,
          previousId: entry.previousId,
          staleOverallId: entry.staleOverallId,
          adoptedAt: entry.adoptedAt,
        }))
        .sort((left, right) => left.anchorId.localeCompare(right.anchorId)),
      reconciliation: this.reconciliationOf(passage.id, analysis, adoptions),
    }
  }

  /**
   * Where does a stored note sit in the current source?
   *
   * Same revisions and the stored span still carries the excerpt → resolved.
   * Otherwise the excerpt is looked up in the current text: exactly one match
   * relocates the note (the plan tolerates a deterministic move, never a guess),
   * no match or several matches leaves it unresolved with its old anchor.
   */
  private resolveAnchor(
    passage: StoredPassage,
    current: readonly ParagraphAnchor[],
    entry: StoredTranslation | StoredBranch,
  ): AnchorResolution {
    const ref = entry.anchor
    // A selection's excerpt is a reconstruction: discontinuous ranges are joined
    // with a gap marker, so it is never a contiguous slice of the source. The
    // selection is re-derived and compared instead, and a selection that no
    // longer reproduces itself is reported unresolved rather than relocated.
    if (ref !== null && ref.anchorId.startsWith('sel_')) {
      const record = this.table().get(selectionKey(ref.anchorId.slice(4)))
      const selection = record?.kind === 'selection' ? record.payload : undefined
      if (selection !== undefined && selection.sourceRevision === passage.sourceRevision) {
        const rebuilt = selection.ranges
          .map((range) => passage.sourceText.slice(range.start, range.end))
          .join(SELECTION_GAP)
          .slice(0, EXCERPT_LIMIT)
        if (rebuilt.startsWith(ref.excerpt)) {
          return { anchorStatus: 'resolved', currentAnchorId: ref.anchorId, anchorReason: 'span' }
        }
      }
      return { anchorStatus: 'unresolved', currentAnchorId: null, anchorReason: 'selection-stale' }
    }

    if (ref === null) {
      // A record written before spans existed. Its id can only be trusted while
      // the source never moved: after a revision the same id may name different
      // text, and reporting "resolved" there would be a silent mis-attachment.
      if (passage.sourceRevision > 1) {
        return { anchorStatus: 'unresolved', currentAnchorId: null, anchorReason: 'legacy-stale' }
      }
      return isKnownAnchor(current, entry.anchorId)
        ? { anchorStatus: 'resolved', currentAnchorId: entry.anchorId, anchorReason: 'legacy-resolved' }
        : { anchorStatus: 'unresolved', currentAnchorId: null, anchorReason: 'missing' }
    }
    // The stored span still carries the excerpt it was written about: the note
    // is about the same text, whatever the revision numbers say. Only the label
    // moves when the segmentation rules change.
    if (passage.sourceText.slice(ref.start, ref.end).startsWith(ref.excerpt)) {
      const label = ref.anchorId === PASSAGE_ANCHOR_ID
        ? PASSAGE_ANCHOR_ID
        : anchorAt(current, ref.start, isSentenceAnchor(ref.anchorId) ? 'sentence' : 'paragraph')
      if (label === null) return { anchorStatus: 'unresolved', currentAnchorId: null, anchorReason: 'missing' }
      return label === ref.anchorId
        ? { anchorStatus: 'resolved', currentAnchorId: label, anchorReason: 'span' }
        : { anchorStatus: 'relocated', currentAnchorId: label, anchorReason: 'relabelled' }
    }

    const at = relocate(passage.sourceText, ref.excerpt)
    if (at === null) return { anchorStatus: 'unresolved', currentAnchorId: null, anchorReason: 'ambiguous-or-gone' }
    if (ref.anchorId === PASSAGE_ANCHOR_ID) {
      return { anchorStatus: 'relocated', currentAnchorId: PASSAGE_ANCHOR_ID, anchorReason: 'moved' }
    }
    const anchorId = anchorAt(current, at, isSentenceAnchor(ref.anchorId) ? 'sentence' : 'paragraph')
    return anchorId === null
      ? { anchorStatus: 'unresolved', currentAnchorId: null, anchorReason: 'missing' }
      : { anchorStatus: 'relocated', currentAnchorId: anchorId, anchorReason: 'moved' }
  }

  /**
   * Correct a stored source. The new revision is written first and the catalogue
   * pointer flips afterwards, so a crash in between leaves an unreferenced
   * revision instead of a half-updated passage. Nothing overwrites history.
   */
  async reviseSource(input: {
    passageId: string
    operationId: string
    expectedSourceRevision: number
    sourceText: string
    note: string | null
  }, signal: AbortSignal): Promise<{ revised: boolean; alreadyRevised?: boolean; reason?: string; sourceRevision?: number }> {
    if (input.sourceText.trim() === '') return { revised: false, reason: 'source-blank' }
    if (input.sourceText.length > MAX_SOURCE_CHARACTERS) return { revised: false, reason: 'source-too-long' }
    return this.serialize(async () => {
      signal.throwIfAborted()
      const table = this.table()
      const record = table.get(input.passageId)
      if (record?.kind !== 'passage') return { revised: false, reason: 'passage-unknown' }
      const passage = record.payload

      const already = this.findSourceByOperation(passage, input.operationId)
      if (already !== undefined) {
        return { revised: false, alreadyRevised: true, sourceRevision: passage.sourceRevision }
      }
      if (passage.sourceRevision !== input.expectedSourceRevision) {
        return { revised: false, reason: 'revision-conflict' }
      }

      // A passage created before revisions were recorded has no history row;
      // snapshot its current text before the pointer moves.
      const previousKey = sourceKey(passage.id, passage.sourceRevision)
      if (table.get(previousKey) === undefined) {
        await table.put(previousKey, {
          kind: 'source',
          recordVersion: 1,
          payload: {
            passageId: passage.id,
            revision: passage.sourceRevision,
            text: passage.sourceText,
            note: null,
            operationId: passage.operationId,
            createdAt: passage.createdAt,
          },
        })
      }

      const next = passage.sourceRevision + 1
      const revision: StoredSourceRevision = {
        passageId: passage.id,
        revision: next,
        text: input.sourceText,
        note: input.note,
        operationId: input.operationId,
        createdAt: new Date().toISOString(),
      }
      await table.put(sourceKey(passage.id, next), { kind: 'source', recordVersion: 1, payload: revision })
      const updated: StoredPassage = {
        ...passage,
        sourceText: input.sourceText,
        sourceRevision: next,
        segmentationRevision: SEGMENTATION_REVISION,
        updatedAt: revision.createdAt,
      }
      await table.put(passage.id, { kind: 'passage', recordVersion: 1, payload: updated })
      return { revised: true, sourceRevision: next }
    })
  }

  /**
   * The text of one revision. A never-revised passage has no history row: its
   * current text *is* revision 1. History rows appear from the first correction
   * onwards, which also backfills the revision being replaced.
   */
  async readSourceRevision(passageId: string, revision: number, signal: AbortSignal):
  Promise<{ found: boolean; text?: string; operationId?: string }> {
    signal.throwIfAborted()
    const table = this.table()
    const stored = table.get(sourceKey(passageId, revision))
    if (stored?.kind === 'source') {
      return { found: true, text: stored.payload.text, operationId: stored.payload.operationId }
    }
    const passage = this.readPassage(passageId)
    if (passage !== undefined && passage.sourceRevision === revision) {
      return { found: true, text: passage.sourceText, operationId: passage.operationId }
    }
    return { found: false }
  }

  private findSourceByOperation(passage: StoredPassage, operationId: string): StoredSourceRevision | undefined {
    const table = this.table()
    for (let revision = passage.sourceRevision; revision >= 2; revision -= 1) {
      const record = table.get(sourceKey(passage.id, revision))
      if (record?.kind === 'source' && record.payload.operationId === operationId) return record.payload
    }
    return undefined
  }


  // --- vocabulary ---------------------------------------------------------

  /**
   * Exact-Mot lookup. No model call and no network request happens here: a hit
   * returns the stored entry, a miss returns only *candidates*. The rules live in
   * `lexicon-store`, which reads and writes the same table this controller owns.
   */
  async lookupMot(mot: string, partOfSpeech: string | null, signal: AbortSignal): Promise<LexiconLookup> {
    signal.throwIfAborted()
    return lookupMot(this.table(), mot, partOfSpeech)
  }

  /**
   * Create one entry for an exact Mot. An existing entry is never overwritten:
   * the caller gets `exists` with the entry id and decides whether to append an
   * occurrence or edit deliberately.
   */
  async createLexiconEntry(input: {
    mot: string
    partOfSpeech: string
    lemma: string | null
    forms: readonly string[]
    definition: string
    label: string
    provenance: 'ai' | 'user' | 'mixed'
    operationId: string
  }, signal: AbortSignal): Promise<{ created: boolean; exists?: boolean; entryId?: string; reason?: string }> {
    return this.serialize(async () => {
      signal.throwIfAborted()
      return createLexiconEntry(this.table(), input)
    })
  }

  /**
   * Append a context note for one reading. It lives in the occurrence list, so a
   * single reading never rewrites the entry's general senses or sections.
   */
  async appendLexiconOccurrence(input: {
    entryId: string
    passageId: string
    anchorId: string
    excerpt: string
    note: string
    operationId: string
  }, signal: AbortSignal): Promise<{ appended: boolean; alreadyAppended?: boolean; reason?: string; occurrenceId?: string }> {
    return this.serialize(async () => {
      signal.throwIfAborted()
      return appendLexiconOccurrence(this.table(), input)
    })
  }

  /** Rebuild the derived index from the entries themselves. Explicit and verifiable. */
  async rebuildLexiconIndex(signal: AbortSignal): Promise<{ entries: number; forms: number; repaired: number }> {
    return this.serialize(async () => {
      signal.throwIfAborted()
      return rebuildLexiconIndex(this.table())
    })
  }

  async listLexicon(signal: AbortSignal): Promise<LexiconView[]> {
    signal.throwIfAborted()
    return listLexicon(this.table())
  }

  private readLexiconEntries(): StoredLexiconEntry[] {
    return readLexiconEntries(this.table())
  }

  private readPassage(passageId: string): StoredPassage | undefined {
    const record = this.table().get(passageId)
    return record?.kind === 'passage' ? record.payload : undefined
  }

  /**
   * Only a segmentation of the current source revision *and* the current rule
   * revision is reusable: a bump of `SEGMENTATION_REVISION` means stored
   * anchors were computed by different rules and must be derived again.
   */
  private readSegmentation(passage: StoredPassage): StoredSegmentation | undefined {
    const table = this.table()
    const candidates = [segmentsKeyFor(passage.id, passage.sourceRevision)]
    // Records written before segmentations were keyed per revision.
    if (passage.sourceRevision === 1) candidates.push(segmentsKey(passage.id))
    for (const key of candidates) {
      const record = table.get(key)
      if (record?.kind !== 'segments') continue
      if (record.payload.sourceRevision !== passage.sourceRevision) continue
      if (record.payload.revision !== SEGMENTATION_REVISION) continue
      return record.payload
    }
    return undefined
  }

  private async persistSegmentation(passage: StoredPassage): Promise<StoredSegmentation> {
    const segmentation: StoredSegmentation = {
      passageId: passage.id,
      sourceRevision: passage.sourceRevision,
      revision: SEGMENTATION_REVISION,
      paragraphs: segmentSource(passage.sourceText),
    }
    await this.table().put(segmentsKeyFor(passage.id, passage.sourceRevision), {
      kind: 'segments',
      recordVersion: 1,
      payload: segmentation,
    })
    return segmentation
  }

  /**
   * Whether an anchor id names something in this passage: the passage itself, one
   * of its paragraphs or sentences, or a stored selection.
   */
  private resolveAnchorId(
    passageId: string,
    segmentation: StoredSegmentation,
    anchorId: string,
  ): { ok: boolean; selection?: StoredSelection } {
    if (!anchorId.startsWith('sel_')) {
      return { ok: isKnownAnchor(segmentation.paragraphs, anchorId) }
    }
    const record = this.table().get(selectionKey(anchorId.slice(4)))
    if (record?.kind !== 'selection' || record.payload.passageId !== passageId) return { ok: false }
    if (record.payload.sourceRevision !== segmentation.sourceRevision) return { ok: false }
    return { ok: true, selection: record.payload }
  }

  /**
   * Store one reader selection as a reusable anchor.
   *
   * The token is derived from the revision and the ranges, so selecting the same
   * words again returns the same anchor instead of piling up duplicates. A
   * discontinuous selection keeps its ranges and joins its text with a gap
   * marker, so `ne … point` is one anchor rather than two unrelated ones.
   */
  async createSelection(input: {
    passageId: string
    ranges: readonly { start: number; end: number }[]
    note: string
    operationId: string
  }, signal: AbortSignal): Promise<{ created: boolean; alreadyExisted?: boolean; reason?: string; anchorId?: string; excerpt?: string; ranges?: { start: number; end: number }[] }> {
    return this.serialize(async () => {
      signal.throwIfAborted()
      const passage = this.readPassage(input.passageId)
      if (passage === undefined) return { created: false, reason: 'passage-unknown' }
      if (input.ranges.length === 0 || input.ranges.length > 8) return { created: false, reason: 'ranges-out-of-range' }
      const length = passage.sourceText.length
      for (const range of input.ranges) {
        if (!Number.isInteger(range.start) || !Number.isInteger(range.end)) return { created: false, reason: 'range-not-integer' }
        if (range.start < 0 || range.end > length || range.end <= range.start) return { created: false, reason: 'range-out-of-bounds' }
      }

      const excerpt = input.ranges
        .map((range) => passage.sourceText.slice(range.start, range.end))
        .join(SELECTION_GAP)
        .slice(0, EXCERPT_CHARACTERS)
      const token = await selectionToken(passage.id, passage.sourceRevision, input.ranges)
      const anchorId = selectionAnchorId(token)
      const existing = this.table().get(selectionKey(token))
      if (existing?.kind === 'selection') {
        // A token collision is only a reuse when it names the same selection:
        // same passage, same revision, same ranges. Anything else is reported
        // instead of handing back another passage's excerpt.
        const sameIntent = existing.payload.passageId === passage.id
          && existing.payload.sourceRevision === passage.sourceRevision
          && sameRanges(existing.payload.ranges, input.ranges)
        if (sameIntent) {
          return { created: false, alreadyExisted: true, anchorId, excerpt: existing.payload.excerpt, ranges: existing.payload.ranges }
        }
        return { created: false, reason: 'selection-token-collision' }
      }

      const selection: StoredSelection = {
        passageId: passage.id,
        token,
        sourceRevision: passage.sourceRevision,
        ranges: input.ranges.map((range) => ({ start: range.start, end: range.end })),
        excerpt,
        note: input.note,
        operationId: input.operationId,
        createdAt: new Date().toISOString(),
      }
      await this.table().put(selectionKey(token), {
        kind: 'selection',
        recordVersion: 1,
        payload: selection,
      })
      return { created: true, anchorId, excerpt, ranges: selection.ranges }
    })
  }

  /**
   * Resolve one anchor id to the span it names, so a discussion note records the
   * text it is about rather than a sentence number that later revisions may move.
   */
  private anchorRef(
    passage: StoredPassage,
    segmentation: StoredSegmentation,
    anchorId: string,
  ): StoredAnchorRef | null {
    const base = {
      anchorId,
      sourceRevision: passage.sourceRevision,
      segmentationRevision: segmentation.revision,
    }
    if (anchorId === PASSAGE_ANCHOR_ID) {
      return { ...base, start: 0, end: passage.sourceText.length, excerpt: passage.sourceText.slice(0, EXCERPT_LIMIT) }
    }
    const selection = this.resolveAnchorId(passage.id, segmentation, anchorId).selection
    if (selection !== undefined) {
      return {
        ...base,
        start: selection.ranges[0].start,
        end: selection.ranges[selection.ranges.length - 1].end,
        excerpt: selection.excerpt.slice(0, EXCERPT_LIMIT),
      }
    }
    const found = findAnchor(segmentation.paragraphs, anchorId)
    if (found === undefined) return null
    return { ...base, start: found.start, end: found.end, excerpt: found.text.slice(0, EXCERPT_LIMIT) }
  }

  private readAnalysis(passageId: string): StoredAnalysis {
    const record = this.table().get(analysisKey(passageId))
    return record?.kind === 'analysis'
      ? record.payload
      : { passageId, translations: [], branches: [] }
  }

  /**
   * Commit one answered question together with the knowledge writes it intends.
   *
   * The answer and every intent land in a single record, so the durable state is
   * never "answer lost because the third write failed". Intents are then applied
   * one by one, each marked in the same run record: a crash mid-way leaves the
   * answer readable, the finished intents valid, and the rest pending for
   * `resumeRuns`.
   */
  async commitRun(input: {
    passageId: string
    operationId: string
    anchorId: string
    question: string
    answer: string
    intents: readonly {
      kind: 'branch' | 'translation' | 'grammar'
      anchorId: string
      title: string
      body: string
      level?: string | null
      module?: string | null
      pitfall?: string
    }[]
    /**
     * How the automatic grammar path read this answer. The agent path that supplies
     * its own intents leaves it out; the ask path records what it found, including
     * the honest "there was nothing usable here".
     */
    extraction?: StoredRunExtraction | null
  }, signal: AbortSignal): Promise<{ committed: boolean; reason?: string; unchanged?: boolean; run?: StoredRun }> {
    const passage = this.readPassage(input.passageId)
    if (passage === undefined) return { committed: false, reason: 'passage-unknown' }
    const segmentation = this.readSegmentation(passage) ?? await this.serialize(() => this.persistSegmentation(passage))
    // `resolveAnchorId` rather than `isKnownAnchor`: a branch may be anchored on a
    // reader selection, which is not part of the segmentation but is a real anchor.
    if (!this.resolveAnchorId(passage.id, segmentation, input.anchorId).ok) {
      return { committed: false, reason: 'anchor-unknown' }
    }
    const extraction = input.extraction ?? null

    return this.serialize(async () => {
      signal.throwIfAborted()
      const store = this.readRuns(passage.id)
      const repeated = store.runs.find((run) => run.operationId === input.operationId)
      if (repeated !== undefined) {
        // The same operation id is a retry only when it carries the same intent.
        // Reusing it with different content is a caller bug, not a new question:
        // accepting it would silently answer a question the reader never asked.
        const sameIntent = repeated.anchorId === input.anchorId
          && repeated.question === input.question
          && repeated.answer === input.answer
        if (!sameIntent) return { committed: false, reason: 'operation-used' }
        if (repeated.intents.every((intent) => intent.status !== 'pending')) {
          // The intents are settled, so nothing is applied twice. The extraction
          // verdict is metadata rather than work, so a differing one is corrected
          // in place instead of being reported as a conflict.
          if (sameExtraction(repeated.extraction ?? null, extraction)) {
            return { committed: true, unchanged: true, run: repeated }
          }
          const corrected: StoredRun = { ...repeated, extraction }
          await this.writeRuns(passage.id, {
            passageId: passage.id,
            runs: store.runs.map((entry) => entry.id === repeated.id ? corrected : entry),
          })
          return { committed: true, unchanged: true, run: corrected }
        }
      }
      const run: StoredRun = repeated ?? {
        id: globalThis.crypto.randomUUID(),
        operationId: input.operationId,
        passageId: passage.id,
        anchorId: input.anchorId,
        question: input.question,
        answer: input.answer,
        createdAt: new Date().toISOString(),
        intents: input.intents.map((intent) => ({
          id: globalThis.crypto.randomUUID(),
          kind: intent.kind,
          anchorId: intent.anchorId,
          title: intent.title,
          body: intent.body,
          level: intent.level ?? null,
          module: intent.module ?? null,
          pitfall: intent.pitfall ?? '',
          status: 'pending' as const,
          appliedId: null,
          detail: null,
        })),
        extraction,
      }
      // One write holds the answer and every pending intent.
      await this.writeRuns(passage.id, repeated === undefined
        ? { passageId: passage.id, runs: [...store.runs, run] }
        : store)
      const applied = await this.applyPendingIntents(passage, run)
      return { committed: true, run: applied }
    })
  }

  /** Finish whatever a previous call left pending. Idempotent. */
  async resumeRuns(passageId: string, signal: AbortSignal): Promise<{ resumed: number; runs: StoredRun[] }> {
    const passage = this.readPassage(passageId)
    if (passage === undefined) return { resumed: 0, runs: [] }
    return this.serialize(async () => {
      signal.throwIfAborted()
      const store = this.readRuns(passageId)
      const runs: StoredRun[] = []
      let resumed = 0
      for (const run of store.runs) {
        const pending = run.intents.filter((intent) => intent.status === 'pending').length
        const next = pending === 0 ? run : await this.applyPendingIntents(passage, run)
        resumed += pending
        runs.push(next)
      }
      return { resumed, runs }
    })
  }

  /**
   * Adopt one variant for one anchor. The paragraph's overall translation is not
   * touched: adoption only moves the sentence pointer and records what it
   * replaced, so the disagreement surfaces instead of being overwritten.
   */
  async adoptTranslation(input: {
    passageId: string
    anchorId: string
    translationId: string
    operationId: string
  }, signal: AbortSignal): Promise<{ adopted: boolean; alreadyAdopted?: boolean; reason?: string; previousId?: string | null }> {
    return this.serialize(async () => {
      signal.throwIfAborted()
      const passage = this.readPassage(input.passageId)
      if (passage === undefined) return { adopted: false, reason: 'passage-unknown' }
      const analysis = this.readAnalysis(passage.id)
      const variant = analysis.translations.find((entry) => entry.id === input.translationId)
      if (variant === undefined) return { adopted: false, reason: 'translation-unknown' }
      if (variant.anchorId !== input.anchorId) return { adopted: false, reason: 'anchor-mismatch' }

      const store = this.readAdoptions(passage.id)
      const current = store.entries.find((entry) => entry.anchorId === input.anchorId)
      const repeated = store.entries.find((entry) => entry.operationId === input.operationId)
      if (repeated !== undefined) {
        return repeated.anchorId === input.anchorId && repeated.translationId === input.translationId
          ? { adopted: false, alreadyAdopted: true, previousId: repeated.previousId }
          : { adopted: false, reason: 'operation-used' }
      }
      if (current?.translationId === input.translationId) {
        return { adopted: false, alreadyAdopted: true, previousId: current.previousId }
      }

      const entry = {
        anchorId: input.anchorId,
        translationId: input.translationId,
        previousId: current?.translationId ?? null,
        staleOverallId: this.currentOverallId(analysis),
        adoptedAt: new Date().toISOString(),
        operationId: input.operationId,
      }
      await this.writeAdoptions(passage.id, {
        passageId: passage.id,
        entries: [...store.entries.filter((candidate) => candidate.anchorId !== input.anchorId), entry],
      })
      return { adopted: true, previousId: entry.previousId }
    })
  }

  /** The overall translation currently on record: the latest one written. */
  private currentOverall(analysis: StoredAnalysis): StoredTranslation | undefined {
    return analysis.translations
      .filter((entry) => entry.anchorId === PASSAGE_ANCHOR_ID)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))[0]
  }

  private currentOverallId(analysis: StoredAnalysis): string | null {
    return this.currentOverall(analysis)?.id ?? null
  }

  private readAdoptions(passageId: string): StoredAdoptions {
    const record = this.table().get(adoptionsKey(passageId))
    return record?.kind === 'adoptions' ? record.payload : { passageId, entries: [] }
  }

  private async writeAdoptions(passageId: string, store: StoredAdoptions): Promise<void> {
    await this.table().put(adoptionsKey(passageId), {
      kind: 'adoptions',
      recordVersion: 1,
      payload: store,
    })
  }

  /**
   * Which sentences were adopted after the current overall translation was
   * written. Derived on read, so it cannot drift from the records themselves.
   */
  private reconciliationOf(passageId: string, analysis: StoredAnalysis, store: StoredAdoptions): Reconciliation {
    const overall = this.currentOverall(analysis)
    if (overall === undefined) return { passageTranslationId: null, needed: false, items: [] }

    const items: ReconciliationItem[] = []
    for (const adoption of store.entries) {
      if (adoption.anchorId === PASSAGE_ANCHOR_ID) continue
      // The sentence changed *after* the overall translation now on record.
      if (adoption.staleOverallId !== overall.id) continue
      const current = analysis.translations.find((entry) => entry.id === adoption.translationId)
      if (current === undefined) continue
      const previous = adoption.previousId === null
        ? undefined
        : analysis.translations.find((entry) => entry.id === adoption.previousId)
      items.push({
        anchorId: adoption.anchorId,
        previousText: previous?.text ?? null,
        currentText: current.text,
      })
    }
    return {
      passageTranslationId: overall.id,
      needed: items.length > 0,
      items: items.sort((left, right) => left.anchorId.localeCompare(right.anchorId)),
    }
  }

  /**
   * Explicit migration for records written before spans existed. The caller
   * *names* the revision those records were written under, so the derived span
   * is evidence-backed rather than guessed; records whose anchor does not exist
   * in that revision are reported, never invented.
   */
  async backfillAnchors(input: {
    passageId: string
    sourceRevision: number
  }, signal: AbortSignal): Promise<{ backfilled: boolean; reason?: string; migrated: number; skipped: { id: string; anchorId: string }[] }> {
    return this.serialize(async () => {
      signal.throwIfAborted()
      const passage = this.readPassage(input.passageId)
      if (passage === undefined) return { backfilled: false, reason: 'passage-unknown', migrated: 0, skipped: [] }
      const source = await this.readSourceRevision(passage.id, input.sourceRevision, signal)
      if (source.found !== true || source.text === undefined) {
        return { backfilled: false, reason: 'revision-unknown', migrated: 0, skipped: [] }
      }
      const paragraphs = segmentSource(source.text)
      const skipped: { id: string; anchorId: string }[] = []
      const spanFor = (anchorId: string): StoredAnchorRef | null => {
        const base = { anchorId, sourceRevision: input.sourceRevision, segmentationRevision: SEGMENTATION_REVISION }
        if (anchorId === PASSAGE_ANCHOR_ID) {
          return { ...base, start: 0, end: source.text!.length, excerpt: source.text!.slice(0, EXCERPT_LIMIT) }
        }
        const found = findAnchor(paragraphs, anchorId)
        return found === undefined
          ? null
          : { ...base, start: found.start, end: found.end, excerpt: found.text.slice(0, EXCERPT_LIMIT) }
      }
      const migrate = <T extends { id: string; anchorId: string; anchor: StoredAnchorRef | null }>(entry: T): T => {
        if (entry.anchor !== null) return entry
        const span = spanFor(entry.anchorId)
        if (span === null) {
          skipped.push({ id: entry.id, anchorId: entry.anchorId })
          return entry
        }
        return { ...entry, anchor: span }
      }

      const analysis = this.readAnalysis(passage.id)
      const translations = analysis.translations.map(migrate)
      const branches = analysis.branches.map(migrate)
      const migrated = translations.filter((entry, index) => entry !== analysis.translations[index]).length
        + branches.filter((entry, index) => entry !== analysis.branches[index]).length
      if (migrated > 0) await this.writeAnalysis(passage.id, { ...analysis, translations, branches })
      return { backfilled: migrated > 0, migrated, skipped }
    })
  }

  // --- generation: backends, context, ask -----------------------------------

  /** Every backend this plugin can send a turn to, with its honest status. */
  listBackends(): BackendStatus[] {
    return this.backends().map((backend) => {
      const status = backend.available()
      return {
        backend: backend.id,
        label: backend.label,
        available: status.available,
        reason: status.reason ?? null,
        streaming: backend.capabilities.streaming,
        cancel: backend.capabilities.cancel,
        singleFlight: backend.capabilities.singleFlight,
        maxInputCharacters: backend.capabilities.maxInputCharacters,
      }
    })
  }

  async listBackendModels(backendId: string, signal: AbortSignal): Promise<{ models: BackendModelView[]; reason?: string }> {
    const backend = this.backends().find((entry) => entry.id === backendId)
    if (backend === undefined) return { models: [], reason: 'backend-unknown' }
    const status = backend.available()
    if (!status.available) return { models: [], reason: status.reason ?? 'backend-unavailable' }
    const models = await backend.listModels(signal)
    return {
      models: models.map((model) => ({
        id: model.id,
        name: model.name,
        reasoningEfforts: [...model.reasoningEfforts],
      })),
    }
  }

  /**
   * Compile a turn's context without sending it. This is the same code path the
   * real ask uses, so what the reader is shown is what would be sent.
   */
  previewAsk(input: {
    passageId: string
    branchId: string
    question: string
    backend: string
    model: string
    extras?: readonly { refId: string; reason: string; text: string }[]
  }, signal: AbortSignal): AskPreview {
    signal.throwIfAborted()
    const compiled = this.compileTurn(input)
    if (compiled.ok === false) return { ok: false, reason: compiled.reason }
    const manifest = compiled.manifest
    return {
      ok: true,
      contextId: manifest.id,
      fingerprint: manifest.fingerprint,
      characters: manifest.characters,
      backend: manifest.backend,
      model: manifest.model,
      materials: manifest.materials.map((material) => ({
        kind: material.kind,
        refId: material.refId,
        reason: material.reason,
        characters: material.text.length,
        excerpt: material.text.slice(0, 400),
      })),
      prompt: renderPrompt(manifest),
    }
  }

  /**
   * Send one turn: compile, generate, and store the question and the answer as
   * branch messages.
   *
   * The question is stored before the model is called, so a timeout cannot lose
   * what was asked; the compiled manifest is stored with the answer, so "what was
   * it allowed to see" survives a restart. A failure stores a failed attempt
   * rather than an empty turn.
   */
  async ask(
    input: AskInput,
    signal: AbortSignal,
    /**
     * Called with each delta as the provider produces it. The generation job records
     * progress either way; this is how a streamed turn shows it while it arrives.
     */
    observe?: (delta: string) => void,
  ): Promise<AskResult> {
    const backend = this.backends().find((entry) => entry.id === input.backend)
    if (backend === undefined) return { ok: false, reason: 'backend-unknown' }
    const status = backend.available()
    if (!status.available) return { ok: false, reason: status.reason ?? 'backend-unavailable' }

    // The answer's own operation id is derived once: both the refusal path and
    // the real answer must be able to recognise a retry of the same ask.
    const answerId = await answerOperationId(input.operationId)

    // A settled job means this exact send already has an answer. Returning it is
    // the whole point of the record: a retry after a network hiccup must not buy a
    // second answer, and recompiling would now describe a different conversation
    // anyway (the first answer is part of the history).
    const settled = readGenerationJob(this.table(), 'ask', input.operationId)
    if (settled !== undefined && settled.status === 'succeeded') {
      const replay = await this.replaySettledAsk(input, settled, answerId)
      if (replay !== null) return replay
    }

    const first = this.compileTurn(input)
    if (first.ok === false) {
      // The materials this branch already has cannot be sent at all, so the
      // question is not worth storing on its own. The turn is still recorded —
      // question and explanation together — because a reader who asked something
      // must never be left looking at an empty branch with no reason given.
      await this.serialize(() => appendMessage(this.table(), {
        passageId: input.passageId,
        branchId: input.branchId,
        author: 'user',
        text: input.question,
        operationId: input.operationId,
      }))
      await this.serialize(() => appendMessage(this.table(), {
        passageId: input.passageId,
        branchId: input.branchId,
        author: 'model',
        text: `（本次提问未发送：${first.reason}）`,
        generation: {
          runId: null, backend: backend.id, model: input.model, resolvedModel: null,
          attempt: 1, status: 'failed', failure: first.reason, usage: null,
        },
        contextId: null,
        operationId: answerId,
      }))
      return { ok: false, reason: first.reason }
    }
    if (input.expectedFingerprint !== undefined && input.expectedFingerprint !== null
      && input.expectedFingerprint !== first.manifest.fingerprint) {
      return { ok: false, reason: 'context-changed' }
    }

    // The reader's question is durable before the model is called.
    const asked = await this.serialize(() => appendMessage(this.table(), {
      passageId: input.passageId,
      branchId: input.branchId,
      author: 'user',
      text: input.question,
      operationId: input.operationId,
    }))
    if (asked.appended === false && asked.alreadyAppended !== true) {
      return { ok: false, reason: asked.reason ?? 'message-refused' }
    }

    // The manifest compiled before the question was appended is the one that is
    // sent. It already carries the question — in its own field, rendered once by
    // renderPrompt — and the history exactly as the reader previewed it. The
    // former second compile happened *after* the append, so it produced a prompt
    // that differed from the approved preview and quoted the question twice (once
    // in history, once as the question). One compile, one sent context.
    const manifest = first.manifest
    await this.serialize(() => addContextManifest(this.table(), input.passageId, manifest))

    // The job exists before the model is called, so an interruption has something
    // to land on. Partial text is written as it arrives — at most a few times a
    // second, because each write is a durable medium write — so a cancelled or
    // interrupted answer is readable for what it got to, not lost.
    let job = await this.serialize(() => beginGenerationJob(this.table(), {
      kind: 'ask',
      operationId: input.operationId,
      passageId: input.passageId,
      branchId: input.branchId,
      anchorId: first.branchAnchorId,
      backend: backend.id,
      model: input.model,
    }))
    let partial = ''
    let lastFlush = 0
    const onDelta = (delta: string): void => {
      partial += delta
      // The observer sees every delta; the durable write is throttled, because a
      // medium write per token would cost more than the progress is worth.
      observe?.(delta)
      const now = Date.now()
      if (now - lastFlush < 500) return
      lastFlush = now
      const snapshot = partial
      void this.serialize(() => recordGenerationProgress(this.table(), job, snapshot)).then(
        (next) => { job = next },
        () => {},
      )
    }

    let outcome: GenerateOutcome
    try {
      outcome = await backend.generate(
        { backend: backend.id, model: input.model, reasoningEffort: input.reasoningEffort ?? undefined },
        {
          system: renderSystem(), prompt: renderPrompt(manifest), signal, onDelta,
          onFirstTextDelta: (elapsedMs) => {
            void this.serialize(() => recordFirstTextDelta(this.table(), job, elapsedMs)).then(
              (next) => { job = next },
              () => {},
            )
          },
        },
      )
    } catch (error) {
      outcome = { text: '', resolvedModel: null, usage: null, finish: 'error', failure: String(error) }
    }
    // Whatever the streaming buffer missed is still the answer the provider sent.
    if (partial.length < outcome.text.length && outcome.text.startsWith(partial)) partial = outcome.text

    // The grammar block is split off before anything is stored: the reader reads
    // an answer, not a wire format, and everything downstream (the message, the
    // run, the returned text) uses the same cleaned string.
    const extraction = extractGrammarPoints(outcome.text)
    const answerText = extraction.text.trim() === ''
      ? (outcome.text.trim() === '' ? `（本次生成未返回内容：${outcome.failure ?? outcome.finish}）` : extraction.text)
      : extraction.text
    const stored = await this.serialize(() => appendMessage(this.table(), {
      passageId: input.passageId,
      branchId: input.branchId,
      author: 'model',
      text: answerText,
      generation: {
        runId: null,
        backend: backend.id,
        model: input.model,
        resolvedModel: outcome.resolvedModel,
        attempt: job.attempt,
        status: outcome.finish === 'stop'
          ? 'complete'
          // A length stop is not a finished answer: marking it `partial` keeps the
          // reader from reading a truncated answer as a whole one.
          : outcome.finish === 'cancelled' ? 'cancelled' : outcome.finish === 'max-tokens' ? 'partial' : 'failed',
        failure: outcome.failure,
        usage: outcome.usage,
      },
      contextId: manifest.id,
      extraction: {
        status: extraction.status,
        detail: extraction.detail,
        points: extraction.points.length,
      },
      operationId: answerId,
    }))
    if (stored.appended === false && stored.alreadyAppended !== true) {
      return { ok: false, reason: stored.reason ?? 'message-refused' }
    }
    // The job is settled with what actually happened, for every ending, so the
    // record never claims a completion that was not seen.
    await this.serialize(() => finishGenerationJob(this.table(), job, {
      status: outcome.finish === 'stop' ? 'succeeded'
        : outcome.finish === 'cancelled' ? 'cancelled'
          : outcome.finish === 'max-tokens' ? 'succeeded' : 'failed',
      finish: outcome.finish,
      failure: outcome.failure,
      resolvedModel: outcome.resolvedModel,
      usage: outcome.usage,
      messageId: stored.messageId ?? null,
      contextId: manifest.id,
      modelCallMs: outcome.modelCallMs,
      firstTextDeltaMs: outcome.firstTextDeltaMs,
      partialText: outcome.finish === 'stop' ? '' : partial,
    }))
    // A failed generation is not a successful turn: the attempt is stored, and
    // the caller is told what the backend reported.
    if (outcome.finish === 'error') {
      return { ok: false, reason: 'model-error', failure: outcome.failure, contextId: manifest.id }
    }

    // The reader's rule: a grammar point enters the library because a question was
    // asked, so the turn that produced the answer is the turn that files it. The
    // run is keyed by the answer's own operation id, which makes a retried send
    // land on the same run instead of counting the question twice. A failure here
    // never costs the reader the answer — it is already durable above.
    const run = await this.recordTurnGrammar({
      passageId: input.passageId,
      anchorId: first.branchAnchorId,
      question: input.question,
      answer: answerText,
      extraction,
      answerId,
    }, signal)

    return {
      ok: true,
      contextId: manifest.id,
      fingerprint: manifest.fingerprint,
      characters: manifest.characters,
      finish: outcome.finish,
      failure: outcome.failure,
      answerText,
      resolvedModel: outcome.resolvedModel,
      branchId: input.branchId,
      messageId: stored.messageId ?? null,
      usage: outcome.usage,
      extraction: {
        status: extraction.status,
        points: extraction.points.length,
        detail: extraction.detail,
        runId: run.runId,
      },
    }
  }

  /**
   * File one answered turn's grammar points.
   *
   * Single turn means the points arrive with the answer; this only has to write
   * them. Every outcome is recorded, including the ones with nothing to write, so
   * "this question raised no reusable rule" and "the reply was unusable" are
   * distinguishable afterwards instead of both looking like silence.
   */
  private async recordTurnGrammar(input: {
    passageId: string
    anchorId: string
    question: string
    answer: string
    extraction: ReturnType<typeof extractGrammarPoints>
    answerId: string
  }, signal: AbortSignal): Promise<{ runId: string | null }> {
    const points: ExtractedGrammarPoint[] = input.extraction.points
    try {
      const committed = await this.commitRun({
        passageId: input.passageId,
        operationId: await derivedOperationId(input.answerId, 'grammar-run'),
        anchorId: input.anchorId,
        question: input.question,
        answer: input.answer,
        intents: points.map((point) => ({
          kind: 'grammar' as const,
          // A point may name its own anchor; anything else is about the branch's
          // own anchor, which is the text the reader was looking at.
          anchorId: point.anchorId ?? input.anchorId,
          title: point.title,
          body: point.body,
          level: point.level,
          module: point.module,
          pitfall: point.pitfall,
        })),
        extraction: {
          status: input.extraction.status,
          detail: input.extraction.detail,
          points: points.length,
        },
      }, signal)
      return { runId: committed.run?.id ?? null }
    } catch (error) {
      // The answer is durable; the extraction verdict is recorded on a run that
      // says it failed rather than being dropped, so a reader can see that this
      // turn's automatic path did not complete.
      const failed = await this.commitRun({
        passageId: input.passageId,
        operationId: await derivedOperationId(input.answerId, 'grammar-run'),
        anchorId: input.anchorId,
        question: input.question,
        answer: input.answer,
        intents: [],
        extraction: { status: 'failed', detail: String(error), points: 0 },
      }, signal).catch(() => null)
      return { runId: failed?.run?.id ?? null }
    }
  }

  /** Every branch of one passage, with its messages and their generation state. */
  listDiscussion(passageId: string, signal: AbortSignal): DiscussionView {
    signal.throwIfAborted()
    const store = readDiscussion(this.table(), passageId)
    const conclusions = listConclusions(this.table(), passageId)
    return {
      branches: store.branches.map((branch) => ({
        branchId: branch.id,
        anchorId: branch.anchorId,
        kind: branch.kind,
        title: branch.title,
        parentId: branch.parentId,
        forkedFrom: branch.forkedFrom,
        status: branch.status,
        createdAt: branch.createdAt,
        updatedAt: branch.updatedAt,
        messages: branch.messages.map((message) => ({
          messageId: message.id,
          author: message.author,
          text: message.text,
          status: message.generation?.status ?? null,
          backend: message.generation?.backend ?? null,
          model: message.generation?.model ?? null,
          resolvedModel: message.generation?.resolvedModel ?? null,
          failure: message.generation?.failure ?? null,
          contextId: message.contextId,
          // The verdict the reader is shown, carried by the message itself so a
          // discussion read stays synchronous.
          extraction: message.extraction ?? null,
          createdAt: message.createdAt,
        })),
        historyCount: branchHistory(store, branch).length,
      })),
      conclusions: conclusions.map((conclusion) => ({
        conclusionId: conclusion.id,
        branchId: conclusion.branchId,
        anchorId: conclusion.anchorId,
        text: conclusion.text,
        status: conclusion.status,
        messageId: conclusion.messageId,
      })),
    }
  }

  async createDiscussionBranch(input: {
    passageId: string
    anchorId: string
    kind: StoredDiscussionBranch['kind']
    title: string
    parentId?: string | null
    forkedFrom?: { branchId: string; messageId: string } | null
    operationId: string
  }, signal: AbortSignal): Promise<{ created: boolean; alreadyCreated?: boolean; reason?: string; branchId?: string }> {
    const passage = this.readPassage(input.passageId)
    if (passage === undefined) return { created: false, reason: 'passage-unknown' }
    const segmentation = this.readSegmentation(passage) ?? await this.serialize(() => this.persistSegmentation(passage))
    if (!this.resolveAnchorId(passage.id, segmentation, input.anchorId).ok) {
      return { created: false, reason: 'anchor-unknown' }
    }
    return this.serialize(async () => {
      signal.throwIfAborted()
      const value = await createBranch(this.table(), input)
      return { created: value.created, alreadyCreated: value.alreadyCreated, reason: value.reason, branchId: value.branch?.id }
    })
  }

  async setDiscussionBranchState(input: {
    passageId: string
    branchId: string
    status?: StoredDiscussionBranch['status']
    title?: string
  }, signal: AbortSignal): Promise<{ updated: boolean; reason?: string }> {
    return this.serialize(async () => {
      signal.throwIfAborted()
      const value = await setBranchStatus(this.table(), input)
      return { updated: value.updated, reason: value.reason }
    })
  }

  /** Record a conclusion the reader confirmed, with the message it came from. */
  async recordConclusion(input: {
    passageId: string
    branchId: string
    anchorId: string
    messageId: string | null
    text: string
    status: 'proposed' | 'confirmed'
    operationId: string
  }, signal: AbortSignal): Promise<{ added: boolean; alreadyAdded?: boolean; reason?: string; conclusionId?: string }> {
    return this.serialize(async () => {
      signal.throwIfAborted()
      const value = await addConclusion(this.table(), {
        ...input,
        analysisRevision: this.readPassage(input.passageId)?.sourceRevision ?? null,
      })
      return { added: value.added, alreadyAdded: value.alreadyAdded, reason: value.reason, conclusionId: value.conclusion?.id }
    })
  }

  /**
   * Fetch one declared source for one entry, deliberately.
   *
   * The model never triggers this: the reader asks, the Host fetches through
   * `ctx.web`, and the response is judged and stored with what it actually
   * supports. The gate's verdict is returned, not a claim.
   */
  async fetchLexiconSource(input: {
    entryId: string
    source: string
    section: string
    mot: string
  }, signal: AbortSignal): Promise<{
    fetched: boolean
    reason?: string
    ok?: boolean
    outcome?: string
    note?: string
    stored?: boolean
  }> {
    signal.throwIfAborted()
    const entry = this.readLexiconEntries().find((candidate) => candidate.id === input.entryId)
    if (entry === undefined) return { fetched: false, reason: 'entry-unknown' }

    // The requested entry owns its headword. Never trust a redundant caller
    // field to decide which word the source request describes.
    const value = await fetchLexiconSource(stateOf(this).ctx, {
      source: input.source,
      section: input.section,
      mot: entry.mot,
    }, signal)
    const fetched = value.fetch
    if (fetched === undefined) return { fetched: false, reason: value.reason ?? 'fetch-refused' }

    // Network latency must not hold the controller's global write queue. Only
    // the durable record is serialized, and the entry is checked again after
    // the fetch in case it disappeared or changed while the request was away.
    return this.serialize(async () => {
      signal.throwIfAborted()
      const current = this.readLexiconEntries().find((candidate) => candidate.id === input.entryId)
      if (current === undefined) return { fetched: false, reason: 'entry-unknown' }
      if (current.mot !== entry.mot) return { fetched: false, reason: 'entry-changed' }
      // The attempt is recorded either way: a failed fetch is a fact about the
      // card, and hiding it would let the reader believe a source was consulted.
      const recorded = await recordLexiconSource(this.table(), {
        ...fetched,
        entryId: input.entryId,
      })
      return {
        fetched: true,
        ok: value.verdict?.ok ?? false,
        outcome: value.verdict?.outcome ?? 'unknown',
        note: value.verdict?.claim ?? '',
        stored: recorded.recorded,
      }
    })
  }

  /**
   * Exact-Mot lookup, as the reader's own act.
   *
   * The lookup path never calls a model and never fetches: a hit is the stored entry
   * returned as is, and a miss returns related forms as *candidates* that are never
   * silently merged into the Mot. This is the endpoint the reading surface needs to
   * show a word without collecting it — lookup and collection stay separate.
   */
  @Remote('lookupMot')
  async lookupMotRemote(request: LookupMotRequest, signal: AbortSignal): Promise<LexiconLookup> {
    const parsed = lookupMotRequestSchema.safeParse(request)
    if (!parsed.success) throw badRequest('Invalid lookup request', parsed.error.issues)
    signal.throwIfAborted()
    return this.lookupMot(parsed.data.mot, parsed.data.partOfSpeech, signal)
  }

  /**
   * Create a reader-confirmed exact-Mot entry and record the source passage it came
   * from. Model-assisted drafts may retain mixed provenance. The entry and occurrence are sequential durable writes, not a transaction;
   * the result reports them separately so a partial outcome is never disguised.
   */
  @Remote('createLexiconEntry')
  async createLexiconEntryRemote(request: CreateLexiconEntryRequest, signal: AbortSignal): Promise<CreateLexiconEntryValue> {
    const parsed = createLexiconEntryRequestSchema.safeParse(request)
    if (!parsed.success) throw badRequest('Invalid lexicon entry', parsed.error.issues)
    const input = parsed.data
    return this.serialize(async () => {
      signal.throwIfAborted()
      const passage = this.readPassage(input.passageId)
      if (passage === undefined) {
        return {
          kind: 'conflict', entryId: null, reason: 'passage-unknown',
          occurrence: { kind: 'not-attempted', reason: null },
        }
      }
      const segmentation = this.readSegmentation(passage) ?? await this.persistSegmentation(passage)
      const anchor = this.anchorRef(passage, segmentation, input.anchorId)
      if (anchor === null) {
        return {
          kind: 'conflict', entryId: null, reason: 'anchor-unknown',
          occurrence: { kind: 'not-attempted', reason: null },
        }
      }

      const created = await createLexiconEntry(this.table(), {
        mot: input.mot,
        partOfSpeech: input.partOfSpeech,
        lemma: input.lemma,
        forms: input.forms,
        definition: input.definition,
        label: input.label,
        provenance: input.provenance ?? 'user',
        operationId: input.operationId,
      })
      if (created.created !== true && created.exists !== true) {
        return {
          kind: 'conflict', entryId: null,
          reason: created.reason === 'mot-blank' ? 'mot-blank' : 'key-collision',
          occurrence: { kind: 'not-attempted', reason: null },
        }
      }
      if (created.entryId === undefined) {
        return {
          kind: 'conflict', entryId: null, reason: 'key-collision',
          occurrence: { kind: 'not-attempted', reason: null },
        }
      }

      const sameOperation = created.created === true
        || readLexiconEntries(this.table()).some((entry) => entry.id === created.entryId && entry.operationId === input.operationId)
      if (!sameOperation) {
        return {
          kind: 'exists', entryId: created.entryId,
          occurrence: { kind: 'not-attempted', reason: null },
        }
      }

      let occurrence: CreateLexiconEntryValue['occurrence']
      try {
        const appended = await appendLexiconOccurrence(this.table(), {
          entryId: created.entryId,
          passageId: input.passageId,
          anchorId: input.anchorId,
          excerpt: anchor.excerpt,
          note: input.occurrenceNote,
          operationId: await derivedOperationId(input.operationId, 'lexicon-occurrence'),
        })
        occurrence = appended.appended
          ? { kind: 'appended', reason: null }
          : appended.alreadyAppended === true
            ? { kind: 'already-appended', reason: null }
            : { kind: 'failed', reason: appended.reason ?? 'occurrence-refused' }
      } catch {
        occurrence = { kind: 'failed', reason: 'occurrence-write-failed' }
      }
      return {
        kind: created.created === true ? 'created' : 'exists',
        entryId: created.entryId,
        occurrence,
      }
    })
  }

  /**
   * Adopt one translation variant for one anchor.
   *
   * Adoption moves the sentence pointer and records what it replaced; the paragraph's
   * overall translation is deliberately not rewritten, so the disagreement surfaces
   * instead of being overwritten.
   */
  @Remote('adoptTranslation')
  async adoptTranslationRemote(request: AdoptTranslationRequest, signal: AbortSignal): Promise<AdoptTranslationValue> {
    const parsed = adoptTranslationRequestSchema.safeParse(request)
    if (!parsed.success) throw badRequest('Invalid adoption request', parsed.error.issues)
    signal.throwIfAborted()
    return this.adoptTranslation(parsed.data, signal)
  }

  @Remote('readConjugation')
  readConjugationRemote(request: ConjugationRequest, signal: AbortSignal): ReadConjugationValue {
    const parsed = conjugationRequestSchema.safeParse(request)
    if (!parsed.success) throw badRequest('Invalid conjugation request', parsed.error.issues)
    signal.throwIfAborted()
    return this.readConjugation(parsed.data, signal)
  }

  @Remote('fetchConjugation')
  async fetchConjugationRemote(request: ConjugationRequest, signal: AbortSignal): Promise<FetchConjugationValue> {
    const parsed = conjugationRequestSchema.safeParse(request)
    if (!parsed.success) throw badRequest('Invalid conjugation request', parsed.error.issues)
    signal.throwIfAborted()
    return this.fetchConjugation(parsed.data, signal)
  }

  /** The sources this plugin may request, so a caller cannot invent one. */
  listLexiconSourceKinds(): { source: string; sections: string[] }[] {
    return listLexiconSources()
  }

  /**
   * Fetch one verb's pronunciation dataset, because the reader asked for it.
   *
   * Nothing fetches on its own and no model triggers this: the reader opens a
   * conjugation card and asks for the data. What comes back is derived from the
   * source's own forms, and every ending — including "not now" — is stored, so the
   * card can say which of the three things is true: here are the bases, the paradigm
   * is incomplete, or nothing has been fetched.
   */
  async fetchConjugation(input: ConjugationRequest, signal: AbortSignal): Promise<FetchConjugationValue> {
    const web = stateOf(this).ctx.get('web')
    if (web === undefined) return { fetched: false, reason: 'web-unavailable' }
    const lemma = input.lemma.trim()
    if (lemma === '') return { fetched: false, reason: 'lemma-blank' }

    const fetchPage: PageFetcher = async (url, pageSignal) => {
      const response = await web.fetch({ url }, pageSignal)
      return { statusCode: response.statusCode, body: response.body, truncated: response.truncated }
    }
    const outcome = await fetchConjugationDataset({ lemma, fetchPage, signal })
    await this.serialize(async () => {
      // A failed or empty re-fetch reports its failure on the record, but it
      // must not destroy the data an earlier fetch proved: the old dataset
      // stays. A fetch that did produce forms merges tense by tense, so tenses
      // this run did not reach are kept rather than discarded.
      const existing = readConjugationRecord(this.table(), lemma)
      await writeConjugationDataset(this.table(), {
        lemma,
        dataset: outcome.dataset === null
          ? (existing?.dataset ?? null)
          : mergeDataset(existing?.dataset ?? null, outcome.dataset),
        source: 'fr-wiktionary',
        sourceVersion: 'api',
        fetchStatus: outcome.status === 'ok' ? 'ok'
          : outcome.status === 'partial' ? 'partial'
            : outcome.status === 'rate-limited' ? 'rate-limited'
              : outcome.status === 'no-forms' ? 'no-forms' : 'failed',
        failure: outcome.failure,
        // When nothing new was derived, the paradigm's gaps are still what the
        // previous fetch found — not this run's "everything is missing".
        missingForms: outcome.dataset === null && existing?.dataset != null
          ? existing.missingForms
          : outcome.missingForms,
      })
    })
    return {
      fetched: true,
      status: outcome.status,
      bases: outcome.dataset === null
        ? 0
        : outcome.dataset.tenses.reduce((total, tense) => total + tense.bases.length, 0),
      tenses: outcome.dataset?.tenses.length ?? 0,
      missingForms: outcome.missingForms.length,
      requests: outcome.requests,
      notes: outcome.notes,
      failure: outcome.failure,
    }
  }

  /**
   * What is known about one verb, without fetching anything.
   *
   * The three states are reported as themselves: a dataset with its bases, a fetch
   * that did not finish with its reason, or `no-data` — which is an answer, not an
   * error, and never a paradigm generated from memory.
   */
  readConjugation(input: ConjugationRequest, signal: AbortSignal): ReadConjugationValue {
    signal.throwIfAborted()
    const lemma = input.lemma.trim()
    const answer = answerForLemma(this.table(), lemma)
    if (answer.kind === 'no-data') {
      return { state: 'no-data', lemma, reason: answer.reason }
    }
    if (answer.kind === 'pending') {
      return {
        state: 'pending',
        lemma,
        source: answer.record.source,
        fetchStatus: answer.record.fetchStatus,
        reason: answer.reason,
        missingForms: [...answer.record.missingForms],
      }
    }
    const dataset = answer.record.dataset
    if (dataset === null) {
      // The union allows a stored record with no dataset only through the pending
      // branch above; reaching here means the record disagrees with itself, which is
      // reported as a fetch that did not finish rather than as data.
      return {
        state: 'pending',
        lemma,
        source: answer.record.source,
        fetchStatus: answer.record.fetchStatus,
        reason: '记录中没有数据集',
        missingForms: [...answer.record.missingForms],
      }
    }
    return {
      state: 'dataset',
      lemma,
      source: answer.record.source,
      fetchStatus: answer.record.fetchStatus,
      missingForms: [...answer.record.missingForms],
      tenses: dataset.tenses.map((tense) => ({
        mood: tense.mood,
        tense: tense.tense,
        label: tense.label,
        bases: tense.bases.map((base) => ({
          ipa: base.ipa,
          persons: [...base.persons],
          writtenStem: base.writtenStem,
        })),
        forms: tense.forms.map((form) => ({
          person: form.person,
          written: form.written,
          ipa: form.ipa,
          baseIndex: form.baseIndex,
        })),
        // A card must be able to say what is absent rather than implying completeness.
        missingPersons: missingPersons(dataset, { mood: tense.mood, tense: tense.tense }),
        notes: [...tense.notes],
      })),
    }
  }

  /** Every verb with stored pronunciation data, newest first. */
  listConjugationRecords(): { lemma: string; source: string; fetchStatus: string; fetchedAt: string }[] {
    const rows: { lemma: string; source: string; fetchStatus: string; fetchedAt: string }[] = []
    for (const [key] of this.table().entries()) {
      if (!key.startsWith('conj_')) continue
      const record = this.table().get(key)
      if (record?.kind !== 'conjugationDataset') continue
      rows.push({
        lemma: record.payload.lemma,
        source: record.payload.source,
        fetchStatus: record.payload.fetchStatus,
        fetchedAt: record.payload.fetchedAt,
      })
    }
    return rows.sort((left, right) => right.fetchedAt.localeCompare(left.fetchedAt))
  }

  /**
   * Move one grammar entry's mastery, as the reader's own act.
   *
   * The automatic accumulation path may never do this; it is the one write that
   * says how well the reader knows a point, and it is recorded as a version.
   */
  async setGrammarMastery(input: {
    entryId: string
    mastery: 'learning' | 'reviewing' | 'known'
    expectedRevision: number | null
    operationId: string
  }, signal: AbortSignal): Promise<{
    updated: boolean
    alreadyUpdated?: boolean
    reason?: string
    revision?: number
    previous?: string
  }> {
    return this.serialize(async () => {
      signal.throwIfAborted()
      return setGrammarMastery(this.table(), input)
    })
  }

  // --- sentence analysis -----------------------------------------------------

  /**
   * What the passage's analysis covers, measured against the current sentences.
   *
   * A sentence with no analysis is missing, one whose analysis has errors is
   * failed, and one whose analysis describes different text is stale — so "every
   * sentence is analysed" is a number rather than a claim.
   */
  readAnalysisCoverage(passageId: string, signal: AbortSignal): AnalysisCoverageValue {
    signal.throwIfAborted()
    const passage = this.readPassage(passageId)
    if (passage === undefined) return { found: false }
    const segmentation = this.readSegmentation(passage) ?? {
      passageId: passage.id, sourceRevision: passage.sourceRevision,
      revision: SEGMENTATION_REVISION, paragraphs: segmentSource(passage.sourceText),
    }
    const sentences = segmentation.paragraphs
      .flatMap((paragraph) => paragraph.sentences)
      .map((sentence) => ({ id: sentence.id, text: sentence.text }))
    const coverage = coverageOf(this.table(), passage.id, sentences)
    const versions = readAnalysisVersions(this.table(), passage.id)
    const current = versions.versions.find((version) => version.id === versions.currentId)
    return {
      found: true,
      sourceRevision: passage.sourceRevision,
      total: sentences.length,
      covered: coverage.covered,
      missing: coverage.missing,
      failed: coverage.failed,
      stale: coverage.stale,
      perSentence: coverage.perSentence.map((entry) => ({
        anchorId: entry.anchorId, errors: entry.errors, hints: entry.hints,
      })),
      currentVersion: current === undefined
        ? null
        : {
          versionId: current.id,
          revision: current.revision,
          sourceRevision: current.sourceRevision,
          coveredCount: current.coveredAnchors.length,
          overallTranslation: current.overallTranslation,
          createdAt: current.createdAt,
        },
      versionCount: versions.versions.length,
    }
  }

  /**
   * One sentence's stored analysis, as the panel renders it.
   *
   * The analysis is read against the *current* sentence, never against the text
   * it remembers: a source correction moves the sentence, and then the stored
   * analysis is stale — reported as such, with the same text comparison
   * `analysisCoverage` uses, rather than returned as a usable analysis.
   */
  readSentenceAnalysis(passageId: string, anchorId: string, signal: AbortSignal):
  { found: boolean; stale?: boolean; analysis?: StoredSentenceAnalysis; errors?: string[]; hints?: string[] } {
    signal.throwIfAborted()
    const passage = this.readPassage(passageId)
    if (passage === undefined) return { found: false }
    const analysis = readSentenceAnalyses(this.table(), passage.id).sentences
      .find((entry) => entry.anchorId === anchorId)
    if (analysis === undefined) return { found: false }
    const segmentation = this.readSegmentation(passage) ?? {
      passageId: passage.id, sourceRevision: passage.sourceRevision,
      revision: SEGMENTATION_REVISION, paragraphs: segmentSource(passage.sourceText),
    }
    const sentence = segmentation.paragraphs
      .flatMap((paragraph) => paragraph.sentences)
      .find((entry) => entry.id === anchorId)
    if (sentence === undefined || sentence.text !== analysis.text) {
      // The anchor may exist and still not name this text any more: either way
      // the analysis describes a sentence that is no longer there.
      return { found: false, stale: true }
    }
    const report = validateSentenceAnalysis(analysis, sentence.text)
    return { found: true, analysis, errors: report.errors, hints: report.hints }
  }

  /**
   * Generate one sentence analysis through the chosen backend and store it if it
   * passes the gate.
   *
   * The reply is parsed, validated and only then written. A reply that fails is
   * reported with the gate's own errors and stored nowhere, because storing it
   * would put an unusable analysis on screen next to a usable one.
   */
  async analyseSentence(input: {
    passageId: string
    anchorId: string
    backend: string
    model: string
    reasoningEffort?: string | null
    operationId: string
    parentOperationId?: string
    paragraphIds?: string[]
    expectedFingerprint?: string | null
  }, callerSignal: AbortSignal): Promise<AnalyseSentenceResult> {
    const prepared = this.prepareAnalysisOperation(
      input.passageId, input.operationId, input.parentOperationId ?? null, callerSignal,
    )
    if (prepared === 'cancelled') return { ok: false, reason: 'cancelled' }
    if (prepared === 'duplicate') return { ok: false, reason: 'operation-already-running' }
    try {
      return await this.runSentenceAnalysis(input, prepared.signal, prepared.active)
    } finally {
      this.finishAnalysisOperation(input.operationId, prepared)
    }
  }

  private async runSentenceAnalysis(input: {
    passageId: string
    anchorId: string
    backend: string
    model: string
    reasoningEffort?: string | null
    operationId: string
    parentOperationId?: string
    paragraphIds?: string[]
    expectedFingerprint?: string | null
  }, signal: AbortSignal, active: ActiveAnalysisOperation): Promise<AnalyseSentenceResult> {
    if (signal.aborted) return { ok: false, reason: 'cancelled' }
    const backend = this.backends().find((entry) => entry.id === input.backend)
    if (backend === undefined) return { ok: false, reason: 'backend-unknown' }
    const status = backend.available()
    if (!status.available) return { ok: false, reason: status.reason ?? 'backend-unavailable' }
    const passage = this.readPassage(input.passageId)
    if (passage === undefined) return { ok: false, reason: 'passage-unknown' }
    const segmentation = this.readSegmentation(passage) ?? await this.serialize(() => this.persistSegmentation(passage))
    const sentence = segmentation.paragraphs
      .flatMap((paragraph) => paragraph.sentences)
      .find((entry) => entry.id === input.anchorId)
    if (sentence === undefined) {
      // The anchor may well exist — a paragraph or the passage itself. Saying
      // "unknown" would send the reader looking for a missing sentence when the
      // real answer is "this granularity is not analysed sentence by sentence".
      return {
        ok: false,
        reason: this.resolveAnchorId(passage.id, segmentation, input.anchorId).ok
          ? 'anchor-not-a-sentence'
          : 'anchor-unknown',
        hints: ['逐句解析以句子为锚点：请先点选某一句（pN.sM），而不是段落或整篇。'],
      }
    }
    const context = selectAnalysisContext(segmentation.paragraphs, sentence.id, input.paragraphIds)
    if (context === null) return { ok: false, reason: 'analysis-context-unavailable' }
    if (!context.ok) {
      return {
        ok: false,
        reason: context.reason ?? 'analysis-context-invalid',
        failure: `${context.characters}/${ANALYSIS_CONTEXT_CHARACTER_LIMIT} 字符`,
        hints: ['当前段落必须完整提供；请在材料预览中减少相邻段落，不能截断段落。'],
      }
    }
    if (input.paragraphIds !== undefined && typeof input.expectedFingerprint !== 'string') {
      return { ok: false, reason: 'analysis-context-preview-required', hints: ['请先预览并确认本次材料。'] }
    }
    const fingerprint = await analysisContextFingerprint({
      passageId: passage.id,
      sourceRevision: passage.sourceRevision,
      segmentationRevision: segmentation.revision,
      anchorId: sentence.id,
      sentenceText: sentence.text,
      candidates: context.candidates,
    })
    if (typeof input.expectedFingerprint === 'string' && input.expectedFingerprint !== fingerprint) {
      return { ok: false, reason: 'analysis-context-stale', hints: ['材料已变化，请重新预览并确认。'] }
    }
    const currentParagraph = context.candidates.find((candidate) => candidate.relation === 'current')!
    const prompt = analysisPrompt({
      sentence: sentence.text,
      anchorId: sentence.id,
      paragraph: currentParagraph.text,
      contextMaterials: context.candidates.filter((candidate) => candidate.included),
      omittedParagraphIds: context.omittedParagraphIds,
    })
    // One job per attempt: whatever happens to this call — cancel, timeout,
    // restart, provider silence — the record answers "did it reach the provider,
    // did any text arrive, where was it waiting". The phase field is the answer:
    // 'preparing' means metadata/路由解析 never returned; 'streaming' means the
    // provider stream was open and the wait was on the model.
    let job = await this.serialize(() => beginGenerationJob(this.table(), {
      kind: 'analyse',
      operationId: input.operationId,
      passageId: passage.id,
      branchId: null,
      anchorId: sentence.id,
      backend: backend.id,
      model: input.model,
    }))
    let receivedText = ''
    let writeChain: Promise<void> = Promise.resolve()
    const queueWrite = (write: (current: StoredGenerationJob) => Promise<StoredGenerationJob>) => {
      writeChain = writeChain
        .then(() => write(job))
        .then((next) => { job = next })
        .catch(() => { /* evidence writes are best-effort; the result stands alone */ })
    }
    let lastProgressWrite = 0
    let outcome: GenerateOutcome | null = null
    const result = await (async (): Promise<AnalyseSentenceResult> => {
      try {
        outcome = await backend.generate(
          { backend: backend.id, model: input.model, reasoningEffort: input.reasoningEffort ?? undefined },
          // Sentence analysis runs on its own output protocol: the system
          // instruction asks for one JSON object and nothing else. The
          // discussion system prompt (renderSystem) asks for a grammar block
          // after the answer — the two cannot be mixed into one call.
          {
            system: renderAnalysisSystem(), prompt, signal,
            onFirstTextDelta: (elapsedMs) => {
              queueWrite((current) => recordFirstTextDelta(this.table(), current, elapsedMs))
            },
            onDelta: (delta) => {
              receivedText += delta
              const now = Date.now()
              // First delta at once (that timestamp is the evidence for 首帧),
              // then at most every couple of seconds.
              if (now - lastProgressWrite > 2_000) {
                lastProgressWrite = now
                const text = receivedText
                queueWrite((current) => recordGenerationProgress(this.table(), current, text))
              }
            },
            onPhase: (phase) => {
              queueWrite((current) => recordGenerationPhase(this.table(), current, phase))
            },
          },
        )
      } catch (error) {
        return {
          ok: false,
          reason: signal.aborted ? 'cancelled' : 'model-error',
          failure: String(error),
        }
      }
      if (outcome.finish === 'error') {
        const failure = outcome.failure ?? ''
        const reason = failure.startsWith('agy-busy:') ? 'agy-busy'
          : failure.startsWith('stub-busy:') ? 'stub-busy'
            : 'model-error'
        return { ok: false, reason, failure }
      }
      // A cancelled generation has no usable reply; reporting it as anything else
      // sends the reader looking at the wrong layer. A provider that ignored the
      // cancel and still answered `stop` lands here too: the reader revoked this
      // turn, and its late reply is not a result.
      if (outcome.finish === 'cancelled' || signal.aborted) {
        return { ok: false, reason: 'cancelled', failure: outcome.failure }
      }

      const parsed = parseAnalysisReply(outcome.text, {
        passageId: passage.id,
        anchorId: sentence.id,
        text: sentence.text,
        sourceRevision: passage.sourceRevision,
        segmentationRevision: segmentation.revision,
        backend: backend.id,
        model: input.model,
      })
      // A truncated reply that fails the parse is reported as truncated, not as
      // "the model did not answer with JSON".
      if (parsed.ok === false) {
        return {
          ok: false,
          reason: outcome.finish === 'max-tokens' ? 'model-truncated' : parsed.reason,
          failure: parsed.detail,
        }
      }

      // The gate decides, not the model: an analysis with errors is reported and
      // never stored. The write itself re-checks everything the reply was
      // computed against, because both a cancel and a source revision can land
      // while this call waits its turn in the write queue:
      // - a cancel that arrived after the parse still refuses the store;
      // - a source revision made the sentence this analysis describes no longer
      //   the current one, so storing it would attach it to text it is not about.
      const stored = await this.serialize(async () => {
        if (signal.aborted) return { stored: false as const, cancelled: true as const }
        const current = this.readPassage(passage.id)
        const currentSegmentation = current === undefined ? undefined : this.readSegmentation(current)
        const currentSentence = currentSegmentation?.paragraphs
          .flatMap((entry) => entry.sentences)
          .find((entry) => entry.id === sentence.id)
        if (current === undefined
          || current.sourceRevision !== passage.sourceRevision
          || current.segmentationRevision !== passage.segmentationRevision
          || currentSentence === undefined
          || currentSentence.text !== sentence.text) {
          return { stored: false as const, revised: true as const }
        }
        // Cancellation and commit have one linearization point. Until this line,
        // the explicit cancel endpoint may revoke the operation. Once the durable
        // write starts, it returns `too-late` instead of promising rollback.
        active.phase = 'committing'
        return putSentenceAnalysis(this.table(), parsed.analysis, sentence.text)
      })
      if ('cancelled' in stored && stored.cancelled === true) {
        return { ok: false, reason: 'cancelled', failure: outcome.failure }
      }
      if ('revised' in stored && stored.revised === true) {
        return {
          ok: false,
          reason: 'source-revised',
          failure: '生成期间原文已被修订：这条解析对应的是旧文本，未写入；请基于新原文重新解析。',
        }
      }
      if (stored.stored === false) {
        return {
          ok: false,
          reason: 'analysis-rejected',
          failure: (stored.errors ?? []).join('；'),
          hints: stored.hints ?? [],
        }
      }
      const coverage = this.readAnalysisCoverage(passage.id, signal)
      return {
        ok: true,
        anchorId: sentence.id,
        backend: backend.id,
        model: input.model,
        resolvedModel: outcome.resolvedModel,
        replaced: stored.replaced === true,
        hints: stored.hints ?? [],
        covered: coverage.covered?.length ?? 0,
        missing: coverage.missing?.length ?? 0,
        failed: coverage.failed?.length ?? 0,
        stale: coverage.stale?.length ?? 0,
        operationId: input.operationId,
      }
    })()
    // Settle the job with the truth of the whole call — the reply text keeps
    // whatever the model actually returned, which is what a rejected or
    // unparsable reply needs to be judged against afterwards.
    await writeChain
    try {
      await this.serialize(() => finishGenerationJob(this.table(), job, {
        status: result.ok === true ? 'succeeded' : result.reason === 'cancelled' ? 'cancelled' : 'failed',
        finish: outcome?.finish ?? null,
        failure: result.ok === true ? null : String(result.failure ?? result.reason).slice(0, 2_000),
        resolvedModel: outcome?.resolvedModel ?? null,
        usage: outcome?.usage ?? null,
        modelCallMs: outcome?.modelCallMs,
        firstTextDeltaMs: outcome?.firstTextDeltaMs,
        partialText: outcome?.text ?? receivedText,
      }))
    } catch {
      // A failure to write the record never invalidates the call's own result.
    }
    return result
  }

  /**
   * Generate the analyses this paragraph is missing, one sentence at a time.
   *
   * The reader sees the count before pressing: this spends one model call per
   * sentence, so it is never started silently. A sentence whose reply fails the
   * gate is reported and skipped — the run continues with the others rather than
   * discarding the work that succeeded.
   */
  async analyseParagraph(input: {
    passageId: string
    paragraphId: string
    backend: string
    model: string
    reasoningEffort?: string | null
    operationId: string
  }, callerSignal: AbortSignal): Promise<AnalyseParagraphResult> {
    const prepared = this.prepareAnalysisOperation(
      input.passageId, input.operationId, null, callerSignal,
    )
    if (prepared === 'cancelled') return { ok: false, reason: 'cancelled' }
    if (prepared === 'duplicate') return { ok: false, reason: 'operation-already-running' }
    try {
      return await this.runParagraphAnalysis(input, prepared.signal)
    } finally {
      this.finishAnalysisOperation(input.operationId, prepared)
    }
  }

  private async runParagraphAnalysis(input: {
    passageId: string
    paragraphId: string
    backend: string
    model: string
    reasoningEffort?: string | null
    operationId: string
  }, signal: AbortSignal): Promise<AnalyseParagraphResult> {
    const passage = this.readPassage(input.passageId)
    if (passage === undefined) return { ok: false, reason: 'passage-unknown' }
    const segmentation = this.readSegmentation(passage) ?? await this.serialize(() => this.persistSegmentation(passage))
    const paragraph = segmentation.paragraphs.find((entry) => entry.id === input.paragraphId)
    if (paragraph === undefined) {
      return this.resolveAnchorId(passage.id, segmentation, input.paragraphId).ok
        ? { ok: false, reason: 'anchor-not-a-paragraph' }
        : { ok: false, reason: 'anchor-unknown' }
    }

    const coverage = this.readAnalysisCoverage(passage.id, signal)
    const missing = paragraph.sentences
      .map((sentence) => sentence.id)
      .filter((anchorId) => (coverage.missing ?? []).includes(anchorId)
        || (coverage.failed ?? []).includes(anchorId)
        || (coverage.stale ?? []).includes(anchorId))
    if (missing.length === 0) {
      return { ok: true, asked: 0, stored: 0, failed: [], note: '这一段没有缺解析的句子。' }
    }

    const stored: string[] = []
    const failed: { anchorId: string; reason: string }[] = []
    let asked = 0
    for (const anchorId of missing) {
      signal.throwIfAborted()
      // One id per sentence, derived from the caller's: a retry of this run
      // recognises the sentences it already did instead of asking again.
      asked += 1
      const value = await this.analyseSentence({
        passageId: passage.id,
        anchorId,
        backend: input.backend,
        model: input.model,
        reasoningEffort: input.reasoningEffort ?? null,
        operationId: await derivedOperationId(input.operationId, anchorId),
        parentOperationId: input.operationId,
      }, signal)
      if (value.ok === true) stored.push(anchorId)
      else failed.push({ anchorId, reason: value.reason })
      // A busy single-flight backend cannot answer the next one: stop and let the
      // caller retry the rest rather than burning attempts on refusals.
      if (value.ok === false && (value.reason === 'agy-busy' || value.reason === 'stub-busy')) break
    }

    const after = this.readAnalysisCoverage(passage.id, signal)
    return {
      ok: true,
      asked,
      stored: stored.length,
      failed,
      covered: after.covered?.length ?? 0,
      missing: after.missing?.length ?? 0,
      failedCount: after.failed?.length ?? 0,
      stale: after.stale?.length ?? 0,
    }
  }

  /** Write one sentence analysis a reader or an editor supplies directly. */
  async putSentenceAnalysisRemote(input: {
    passageId: string
    anchorId: string
    analysisJson: string
  }, signal: AbortSignal): Promise<{ stored: boolean; reason?: string; errors?: string[]; hints?: string[] }> {
    const passage = this.readPassage(input.passageId)
    if (passage === undefined) return { stored: false, reason: 'passage-unknown' }
    const segmentation = this.readSegmentation(passage) ?? await this.serialize(() => this.persistSegmentation(passage))
    const sentence = segmentation.paragraphs
      .flatMap((paragraph) => paragraph.sentences)
      .find((entry) => entry.id === input.anchorId)
    if (sentence === undefined) {
      return {
        stored: false,
        reason: 'anchor-not-a-sentence',
        errors: ['逐句解析以句子为锚点：段落与整篇不逐句解析。'],
      }
    }
    const parsed = parseAnalysisReply(input.analysisJson, {
      passageId: passage.id,
      anchorId: sentence.id,
      text: sentence.text,
      sourceRevision: passage.sourceRevision,
      segmentationRevision: segmentation.revision,
      backend: null,
      model: null,
      provenance: 'user',
    })
    if (parsed.ok === false) return { stored: false, reason: parsed.reason, errors: [parsed.detail] }
    const stored = await this.serialize(() => putSentenceAnalysis(this.table(), parsed.analysis, sentence.text))
    return {
      stored: stored.stored,
      errors: stored.errors,
      hints: stored.hints,
      reason: stored.stored ? undefined : 'analysis-rejected',
    }
  }

  /**
   * Publish the analysis as a version.
   *
   * Publishing names the source revision and computes coverage from what is
   * stored, so a version cannot claim a sentence it does not contain, and a later
   * source correction leaves the old version readable as "about the old text".
   */
  async publishAnalysis(input: {
    passageId: string
    overallTranslation: string | null
    cohesion: string
  }, signal: AbortSignal): Promise<{ published: boolean; reason?: string; versionId?: string; revision?: number; coveredCount?: number }> {
    const passage = this.readPassage(input.passageId)
    if (passage === undefined) return { published: false, reason: 'passage-unknown' }
    const segmentation = this.readSegmentation(passage) ?? await this.serialize(() => this.persistSegmentation(passage))
    const sentences = segmentation.paragraphs
      .flatMap((paragraph) => paragraph.sentences)
      .map((sentence) => ({ anchorId: sentence.id, text: sentence.text }))
    return this.serialize(async () => {
      signal.throwIfAborted()
      const value = await publishAnalysisVersion(this.table(), {
        passageId: passage.id,
        sourceRevision: passage.sourceRevision,
        overallTranslation: input.overallTranslation,
        cohesion: input.cohesion,
        sentences,
      })
      if (value.published === false || value.version === undefined) {
        return { published: false, reason: value.reason ?? 'not-published' }
      }
      return {
        published: true,
        versionId: value.version.id,
        revision: value.version.revision,
        coveredCount: value.version.coveredAnchors.length,
      }
    })
  }

  /**
   * The same turn, streamed.
   *
   * It is the *same* code path: `ask` does the work and this only forwards what it
   * reports, so a streamed turn cannot diverge from a unary one — the stored message,
   * the run, the job and the grammar extraction are identical. The stream adds
   * exactly one thing: the reader can see the answer while it is being written.
   *
   * The terminal frame always arrives, including when the turn was refused, because a
   * stream that simply stops leaves the reader unable to tell "still coming" from
   * "failed" — which is the failure this whole milestone exists to remove.
   */
  @Remote({ mode: 'stream' })
  async *streamAsk(request: AskRequest, signal: AbortSignal): AsyncIterable<AskFrame> {
    const parsed = askRequestSchema.safeParse(request)
    if (!parsed.success) {
      yield { kind: 'done', result: { ok: false, reason: 'bad-request' } }
      return
    }
    const frames: { kind: 'delta'; text: string }[] = []
    let wake: (() => void) | null = null
    let settled = false
    let result: AskResult | null = null
    let failure: string | null = null

    const nudge = (): void => {
      const waiting = wake
      wake = null
      waiting?.()
    }

    const running = this.ask(parsed.data, signal, (delta) => {
      frames.push({ kind: 'delta', text: delta })
      nudge()
    }).then(
      (value) => { result = value },
      (error: unknown) => { failure = String(error) },
    ).finally(() => {
      settled = true
      nudge()
    })

    while (!settled || frames.length > 0) {
      if (frames.length === 0) {
        await new Promise<void>((resolve) => { wake = resolve })
        continue
      }
      yield frames.shift()!
    }
    await running
    yield {
      kind: 'done',
      result: result ?? { ok: false, reason: 'stream-failed', failure },
    }
  }

  /**
   * One settled ask, rebuilt from what it stored, with no backend involved.
   *
   * Returns null when any piece is missing, because a partial replay would be worse
   * than generating again: the caller then takes the normal path.
   */
  private async replaySettledAsk(
    input: AskInput,
    job: StoredGenerationJob,
    answerId: string,
  ): Promise<AskResult | null> {
    if (job.messageId === null || job.contextId === null) return null
    const branch = readDiscussion(this.table(), input.passageId).branches
      .find((entry) => entry.id === input.branchId)
    // Replaying is only right when this really is the same send. The same operation
    // id carrying different words is a caller bug, and the append path refuses it
    // with `operation-used`; answering it from the first turn would hide that.
    const asked = branch?.messages.find((entry) => entry.operationId === input.operationId)
    if (asked === undefined || asked.author !== 'user' || asked.text !== input.question) return null
    const message = branch?.messages.find((entry) => entry.id === job.messageId)
    if (message === undefined) return null
    const manifest = readContextManifest(this.table(), input.passageId, job.contextId)
    if (manifest === undefined) return null

    const runOperationId = await derivedOperationId(answerId, 'grammar-run')
    const run = this.readRuns(input.passageId).runs.find((entry) => entry.operationId === runOperationId)
    const extraction = run?.extraction ?? null
    return {
      ok: true,
      contextId: manifest.id,
      fingerprint: manifest.fingerprint,
      characters: manifest.characters,
      finish: job.finish ?? 'stop',
      failure: job.failure,
      answerText: message.text,
      resolvedModel: job.resolvedModel,
      branchId: input.branchId,
      messageId: message.id,
      usage: job.usage,
      extraction: extraction === null
        ? null
        : {
          status: extraction.status,
          points: extraction.points,
          detail: extraction.detail,
          runId: run?.id ?? null,
        },
      replayed: true,
    }
  }

  /**
   * Every generation job on record, newest first.
   *
   * A reader-facing answer to "what happened to my question": finished, cancelled
   * with partial text, or interrupted by a restart.
   */
  listGenerationJobs(passageId: string | null, signal: AbortSignal): StoredGenerationJob[] {
    signal.throwIfAborted()
    return listStoredGenerationJobs(this.table(), passageId ?? undefined)
  }

  /**
   * Settle jobs a previous Host lifetime left running.
   *
   * Called once at open. Nothing is inferred as complete: an in-flight job whose
   * process is gone is `interrupted`, with whatever partial text it captured kept.
   */
  async settleInterruptedJobs(signal?: AbortSignal): Promise<{ interrupted: number }> {
    signal?.throwIfAborted()
    const interrupted = await this.serialize(() => reconcileGenerationJobs(this.table()))
    return { interrupted: interrupted.length }
  }

  /** The compiled context one stored message was sent with, for auditing. */
  readContext(passageId: string, contextId: string, signal: AbortSignal): { found: boolean; manifest?: StoredContextManifest } {
    signal.throwIfAborted()
    const manifest = readContextManifest(this.table(), passageId, contextId)
    return manifest === undefined ? { found: false } : { found: true, manifest }
  }

  /**
   * Bring stored records forward to the current shape, once, at Host open.
   *
   * The move is idempotent and never destructive-first: every manifest is durable
   * in its own record before any legacy array is emptied, so an interrupted run
   * leaves the old data readable and is simply retried on the next open. A caller
   * that cannot migrate (a read-only medium) still gets a working plugin: reads
   * fall back to the legacy arrays, and only retention is affected.
   *
   * @returns What this run moved.
   */
  async migrateStoredRecords(signal?: AbortSignal): Promise<{ ran: boolean; migrated: number; skipped: number; emptied: number }> {
    signal?.throwIfAborted()
    return this.serialize(() => migrateContextsToPerRecord(this.table(), {
      fromVersion: 1,
      toVersion: FRENCH_READER_DOMAIN.version,
    }))
  }

  /** Resolve everything one turn needs, or say precisely what is missing. */
  private compileTurn(input: {
    passageId: string
    branchId: string
    question: string
    backend: string
    model: string
    extras?: readonly { refId: string; reason: string; text: string }[]
  }): { ok: true; manifest: StoredContextManifest; branchAnchorId: string } | { ok: false; reason: string } {
    const backend = this.backends().find((entry) => entry.id === input.backend)
    if (backend === undefined) return { ok: false, reason: 'backend-unknown' }
    const passage = this.readPassage(input.passageId)
    if (passage === undefined) return { ok: false, reason: 'passage-unknown' }
    const discussion = readDiscussion(this.table(), passage.id)
    const branch = discussion.branches.find((entry) => entry.id === input.branchId)
    if (branch === undefined) return { ok: false, reason: 'branch-unknown' }
    const segmentation = this.readSegmentation(passage) ?? {
      passageId: passage.id,
      sourceRevision: passage.sourceRevision,
      revision: SEGMENTATION_REVISION,
      paragraphs: segmentSource(passage.sourceText),
    }
    // A selection is not part of the segmentation, so the compiler cannot find
    // its text on its own. It travels with the compile input; a selection that no
    // longer reproduces itself (a revised source, a deleted record) refuses the
    // turn instead of asking about words the model cannot see.
    const selection = this.selectionText(passage, branch.anchorId)
    if (selection === 'stale') {
      return {
        ok: false,
        reason: 'selection-stale: 选区锚点无法在当前修订的原文中复现（原文可能已修订），本次未发送；请重新选择文本。',
      }
    }
    const compiled = compileContext({
      passage,
      segmentation,
      discussion,
      analysis: this.readAnalysis(passage.id),
      branch,
      question: input.question,
      backend: backend.id,
      model: input.model,
      extras: input.extras ?? [],
      selection: selection ?? null,
      // A backend with a hard input limit sets the ceiling here, so a refusal
      // happens before anything is sent rather than by truncating silently.
      maxCharacters: backend.capabilities.maxInputCharacters,
    })
    if (compiled.ok === false || compiled.manifest === undefined) {
      return { ok: false, reason: compiled.reason ?? 'context-refused' }
    }
    return { ok: true, manifest: compiled.manifest, branchAnchorId: branch.anchorId }
  }

  /**
   * The selection one anchor names, when the anchor names one.
   *
   * A selection anchor is only meaningful while the stored ranges still reproduce
   * the excerpt the reader selected: the same token after a source revision would
   * quote different words, and quoting the stored excerpt on trust would send text
   * the reader never chose. `undefined` means "not a selection anchor"; `'stale'`
   * means the turn must be refused rather than sent without its object.
   */
  private selectionText(
    passage: StoredPassage,
    anchorId: string,
  ): { refId: string; text: string } | 'stale' | undefined {
    if (!anchorId.startsWith('sel_')) return undefined
    const record = this.table().get(selectionKey(anchorId.slice(4)))
    if (record?.kind !== 'selection') return 'stale'
    const selection = record.payload
    if (selection.passageId !== passage.id || selection.sourceRevision !== passage.sourceRevision) return 'stale'
    // Rebuilt from the ranges and compared, the same way anchor resolution does it:
    // a discontinuous selection joins its ranges with a gap marker, so this is the
    // only honest way to know the excerpt still describes the source.
    const rebuilt = selection.ranges
      .map((range) => passage.sourceText.slice(range.start, range.end))
      .join(SELECTION_GAP)
      .slice(0, EXCERPT_CHARACTERS)
    if (!rebuilt.startsWith(selection.excerpt)) return 'stale'
    return { refId: anchorId, text: selection.excerpt }
  }

  /** The backends, in a fixed order so a listing is stable. */
  private backends(): GenerationBackend[] {    const state = stateOf(this)
    return state.backends ?? [new DshLlmBackend(state.ctx), new AgyBackend(state.ctx)]
  }

  /**
   * Whole-library export: raw records with their keys, so an import can restore
   * every relationship (source revisions, discussions, variants, adoptions,
   * runs, vocabulary) rather than a lossy projection.
   */
  async exportLibrary(signal: AbortSignal): Promise<{ schemaVersion: 1; exportedAt: string; records: { key: string; record: unknown }[] }> {
    signal.throwIfAborted()
    const records: { key: string; record: unknown }[] = []
    for (const [key, record] of this.table().entries()) {
      records.push({ key, record: structuredClone(record) })
    }
    records.sort((left, right) => left.key.localeCompare(right.key))
    return { schemaVersion: 1, exportedAt: new Date().toISOString(), records }
  }

  /**
   * The whole library as the panel's backup: every record with its key, so the
   * backup holds analysis, discussions, vocabulary and runs — not only sources.
   */
  @Remote('exportLibrary')
  async exportLibraryRemote(request: ExportLibraryRequest, signal: AbortSignal): Promise<ExportLibraryValue> {
    signal.throwIfAborted()
    void request
    const bundle = await this.exportLibrary(signal)
    signal.throwIfAborted()
    return {
      schemaVersion: 1,
      exportedAt: bundle.exportedAt,
      // The domain medium round-trips records as JSON, so a record is a
      // `JsonValue` by construction; the cast states that invariant once here
      // instead of widening every named record type.
      records: bundle.records.map((entry) => ({ key: entry.key, record: entry.record as JsonValue })),
    }
  }

  @Remote('importLibrary')
  async importLibraryRemote(request: ImportLibraryRequest, signal: AbortSignal): Promise<ImportLibraryValue> {
    const parsed = importLibraryRequestSchema.safeParse(request)
    if (!parsed.success) throw badRequest('Invalid library backup', parsed.error.issues)
    signal.throwIfAborted()
    return this.importLibrary(parsed.data, signal)
  }

  /**
   * Restore an exported library without ever overwriting local work.
   *
   * Every record is compared before it is written: absent → imported, identical
   * → skipped, different → reported as a conflict and left alone. A partial
   * import stays valid because each record is independent.
   */
  async importLibrary(bundle: {
    schemaVersion?: unknown
    records?: readonly { key?: unknown; record?: unknown }[]
  }, signal: AbortSignal): Promise<{ imported: number; skipped: number; conflicts: { key: string; reason: string }[] }> {
    if (bundle?.schemaVersion !== 1 || !Array.isArray(bundle.records)) {
      return { imported: 0, skipped: 0, conflicts: [{ key: '', reason: 'unsupported-bundle' }] }
    }
    const incoming = bundle.records
    // Every imported record must satisfy the domain schema: an import must never
    // plant a record that would fail the next open.
    const schema = FRENCH_READER_DOMAIN.tables.records.valueSchema
    return this.serialize(async () => {
      const table = this.table()
      const conflicts: { key: string; reason: string }[] = []
      let imported = 0
      let skipped = 0
      for (const entry of incoming) {
        signal.throwIfAborted()
        if (typeof entry?.key !== 'string' || entry.key === '' || entry.record === undefined) {
          conflicts.push({ key: String(entry?.key ?? ''), reason: 'malformed-entry' })
          continue
        }
        const parsed = schema.safeParse(entry.record)
        if (!parsed.success) {
          conflicts.push({ key: entry.key, reason: 'schema-invalid' })
          continue
        }
        const existing = table.get(entry.key)
        if (existing === undefined) {
          await table.put(entry.key, parsed.data)
          imported += 1
          continue
        }
        if (JSON.stringify(existing) === JSON.stringify(entry.record)) {
          skipped += 1
          continue
        }
        conflicts.push({ key: entry.key, reason: 'content-differs' })
      }
      return { imported, skipped, conflicts }
    })
  }

  async listRuns(passageId: string, signal: AbortSignal): Promise<StoredRun[]> {
    signal.throwIfAborted()
    return this.readRuns(passageId).runs
  }

  private readRuns(passageId: string): StoredRuns {
    const record = this.table().get(runsKey(passageId))
    return record?.kind === 'runs' ? record.payload : { passageId, runs: [] }
  }

  private async writeRuns(passageId: string, store: StoredRuns): Promise<void> {
    await this.table().put(runsKey(passageId), {
      kind: 'runs',
      recordVersion: 1,
      payload: store,
    })
  }

  /**
   * Apply every pending intent of one run, persisting after each so the run
   * record always states what actually completed. An intent whose write fails
   * is marked failed and never blocks its siblings.
   */
  private async applyPendingIntents(passage: StoredPassage, run: StoredRun): Promise<StoredRun> {
    let store = this.readRuns(passage.id)
    let current = store.runs.find((entry) => entry.id === run.id) ?? run

    for (const intent of current.intents) {
      if (intent.status !== 'pending') continue
      let next: StoredRunIntent
      if (intent.kind === 'grammar') {
        const value = await this.accumulateGrammar(passage, intent, {
          question: current.question,
          questionId: run.id,
          intentId: intent.id,
        })
        next = {
          ...intent,
          status: value.outcome === 'failed' ? 'failed' : 'applied',
          appliedId: value.entryId ?? null,
          detail: value.detail,
        }
      } else if (intent.kind === 'translation') {
        const value = await this.writeTranslation(passage, intent)
        next = value.kind === 'conflict'
          ? { ...intent, status: 'failed', detail: value.reason }
          : { ...intent, status: 'applied', appliedId: value.translation.id, detail: null }
      } else {
        const value = await this.writeBranch(passage, intent)
        next = value.kind === 'conflict'
          ? { ...intent, status: 'failed', detail: value.reason }
          : { ...intent, status: 'applied', appliedId: value.branch.id, detail: null }
      }

      current = { ...current, intents: current.intents.map((entry) => entry.id === intent.id ? next : entry) }
      store = { ...store, runs: store.runs.map((entry) => entry.id === current.id ? current : entry) }
      await this.writeRuns(passage.id, store)
    }
    return current
  }

  /**
   * Automatic grammar accumulation, restricted by the whitelist.
   *
   * The automatic path may only touch the ask counter, the last-asked stamp, the
   * examples and the pitfalls. `keyPoints`, `level`, `module` and `mastery` are
   * never rewritten here — a rule change needs its own explicit action. A near
   * match the rules cannot decide between becomes a pending candidate instead of
   * a silent merge.
   */
  private async accumulateGrammar(
    passage: StoredPassage,
    intent: StoredRunIntent,
    source: { question: string; questionId: string; intentId: string },
  ): Promise<{ entryId?: string; outcome: string; detail: string | null }> {
    const topic = intent.title.trim() === '' ? '语法点' : intent.title.trim()
    // An example must be locatable: an unknown anchor fails this intent instead
    // of storing an example that points nowhere.
    const segmentation = this.readSegmentation(passage) ?? await this.persistSegmentation(passage)
    if (!this.resolveAnchorId(passage.id, segmentation, intent.anchorId).ok) {
      return { outcome: 'failed', detail: 'anchor-unknown' }
    }
    const store = this.readGrammarStore()
    const byId = new Map(this.readGrammarEntries().map((entry) => [entry.id, entry]))
    // One real question is one question, whatever it answers with: two intents
    // about the same point inside one run must not count twice, while a genuinely
    // new question reuses the write path and does count again.
    const counted = this.grammarIntentsAlreadyCounted(passage.id, source.questionId, intent.id)
    const exampleText = exampleTextFor(passage, segmentation.paragraphs, intent.anchorId)

    const exact = (store.byTopic[normaliseGrammarTopic(topic)] ?? [])
      .map((id) => byId.get(id))
      .filter((entry): entry is StoredGrammarEntry => entry !== undefined)
    const near = exact.length > 0 ? [] : this.nearGrammarMatches(topic, byId, store)

    if (exact.length > 1 || near.length > 1) {
      const candidates = [...exact, ...near].map((entry) => ({ entryId: entry.id, topic: entry.topic }))
      const pending: StoredGrammarPending = {
        id: globalThis.crypto.randomUUID(),
        topic,
        body: intent.body,
        candidates,
        passageId: passage.id,
        anchorId: intent.anchorId,
        question: source.question,
        intentId: intent.id,
        questionId: source.questionId,
        createdAt: new Date().toISOString(),
        resolution: null,
        resolvedEntryId: null,
        resolvedAt: null,
        resolutionOperationId: null,
      }
      // A retry of the same question replaces its own candidate; a second intent
      // about the same topic inside one question does not pile up another one.
      const kept = store.pending.filter((entry) =>
        entry.intentId !== intent.id
        && !(entry.questionId === source.questionId && entry.topic === topic && entry.resolution === null))
      await this.writeGrammarStore({ ...store, pending: [...kept, pending] })
      return {
        outcome: 'pending-review',
        detail: `近似匹配不唯一（${String(candidates.length)} 条候选），已保留待审，未改动任何条目`,
      }
    }

    const now = new Date().toISOString()
    const matched = exact[0] ?? near[0]
    if (matched !== undefined) {
      const countedForThisQuestion = counted.has(matched.id)
      const already = countedForThisQuestion
        || matched.examples.some((example) => example.intentId === intent.id)
      const examples = already
        ? matched.examples
        : [...matched.examples, {
          id: globalThis.crypto.randomUUID(),
          text: exampleText,
          passageId: passage.id,
          anchorId: intent.anchorId,
          anchor: this.anchorRef(passage, segmentation, intent.anchorId),
          question: source.question,
          intentId: intent.id,
          questionId: source.questionId,
          createdAt: now,
        }]
      const pitfalls = intent.pitfall.trim() === '' || matched.pitfalls.some((item) => item.intentId === intent.id)
        ? matched.pitfalls
        : [...matched.pitfalls, {
          id: globalThis.crypto.randomUUID(),
          text: intent.pitfall,
          intentId: intent.id,
          createdAt: now,
        }]
      // Only whitelisted fields are written back.
      const updated: StoredGrammarEntry = {
        ...matched,
        examples,
        pitfalls,
        askCount: already ? matched.askCount : matched.askCount + 1,
        lastAskedAt: already ? matched.lastAskedAt : now,
        revision: matched.revision + 1,
        updatedAt: now,
      }
      await this.writeGrammarEntry(updated)
      return {
        entryId: updated.id,
        outcome: already ? 'already-counted' : 'updated',
        detail: already
          ? (countedForThisQuestion ? '同一次提问已计入该条目，未重复计数' : '同一写入重试，未重复计数')
          : null,
      }
    }

    const entry: StoredGrammarEntry = {
      id: globalThis.crypto.randomUUID(),
      topic,
      topicKey: normaliseGrammarTopic(topic),
      level: intent.level,
      module: intent.module,
      keyPoints: intent.body,
      notes: '',
      examples: [{
        id: globalThis.crypto.randomUUID(),
        text: exampleText,
        passageId: passage.id,
        anchorId: intent.anchorId,
        anchor: this.anchorRef(passage, segmentation, intent.anchorId),
        question: source.question,
        intentId: intent.id,
        questionId: source.questionId,
        createdAt: now,
      }],
      pitfalls: intent.pitfall.trim() === ''
        ? []
        : [{ id: globalThis.crypto.randomUUID(), text: intent.pitfall, intentId: intent.id, createdAt: now }],
      mastery: 'learning',
      contentStatus: 'ai-unverified',
      askCount: 1,
      lastAskedAt: now,
      revision: 1,
      operationId: intent.id,
      createdAt: now,
      updatedAt: now,
    }
    await this.writeGrammarEntry(entry)
    await this.writeGrammarStore(addGrammarToStore(store, entry))
    return { entryId: entry.id, outcome: 'created', detail: '新建条目，默认「在学」、内容状态「AI 生成待核实」' }
  }

  /**
   * Which grammar entries one real question has already been counted against.
   *
   * The unit of counting is the question, not the write: a question that yields
   * two intents about the same point is still one question. Reading the marker
   * off the stored examples means the record itself is the evidence, so a crash
   * or a retry cannot count twice.
   */
  private grammarIntentsAlreadyCounted(
    passageId: string,
    questionId: string,
    intentId: string,
  ): Set<string> {
    const counted = new Set<string>()
    for (const entry of this.readGrammarEntries()) {
      const already = entry.examples.some((example) =>
        example.intentId === intentId
        || (questionId !== '' && example.questionId === questionId && example.passageId === passageId))
      if (already) counted.add(entry.id)
    }
    return counted
  }

  /** Entries whose topic shares every significant token — a near, not exact, match. */
  private nearGrammarMatches(
    topic: string,
    byId: ReadonlyMap<string, StoredGrammarEntry>,
    store: StoredGrammarStore,
  ): StoredGrammarEntry[] {
    const tokens = grammarTokens(topic)
    if (tokens.length === 0) return []
    const matches: StoredGrammarEntry[] = []
    for (const ids of Object.values(store.byTopic)) {
      for (const id of ids) {
        const entry = byId.get(id)
        if (entry === undefined || matches.includes(entry)) continue
        const other = grammarTokens(entry.topic)
        if (other.length === 0) continue
        const shared = tokens.filter((token) => other.includes(token)).length
        if (shared === Math.min(tokens.length, other.length)) matches.push(entry)
      }
    }
    return matches
  }

  /**
   * Close one pending candidate. This is the explicit human decision the plan
   * requires: the automatic path never merges an ambiguous match, and revising a
   * rule is only ever done here, by naming the new wording.
   */
  async resolveGrammarPending(input: {
    pendingId: string
    decision: 'attach' | 'create' | 'discard'
    entryId?: string | null
    keyPoints?: string | null
    operationId: string
  }, signal: AbortSignal): Promise<{
    resolved: boolean
    alreadyResolved?: boolean
    reason?: string
    entryId?: string | null
    outcome?: string
  }> {
    return this.serialize(async () => {
      signal.throwIfAborted()
      const store = this.readGrammarStore()
      const pending = store.pending.find((entry) => entry.id === input.pendingId)
      if (pending === undefined) return { resolved: false, reason: 'pending-unknown' }

      if (pending.resolution !== null) {
        return {
          resolved: false,
          alreadyResolved: true,
          entryId: pending.resolvedEntryId,
          outcome: pending.resolution,
        }
      }

      // One accumulator for the whole decision. Writing a store built from a
      // stale snapshot is how the `create` path used to lose the freshly added
      // topic index: the entry existed, but nothing ever indexed it again.
      let nextStore: StoredGrammarStore = store

      const close = async (
        resolution: 'attached' | 'created' | 'discarded',
        entryId: string | null,
      ): Promise<void> => {
        nextStore = {
          ...nextStore,
          pending: nextStore.pending.map((entry) => entry.id === pending.id
            ? {
              ...entry,
              resolution,
              resolvedEntryId: entryId,
              resolvedAt: new Date().toISOString(),
              resolutionOperationId: input.operationId,
            }
            : entry),
        }
        await this.writeGrammarStore(nextStore)
      }

      if (input.decision === 'discard') {
        await close('discarded', null)
        return { resolved: true, outcome: 'discarded' }
      }

      if (input.decision === 'create') {
        const existing = this.readGrammarEntries().find((entry) => entry.topicKey === normaliseGrammarTopic(pending.topic))
        if (existing !== undefined) {
          await close('created', existing.id)
          return { resolved: true, entryId: existing.id, outcome: 'already-exists' }
        }
        const now = new Date().toISOString()
        const entry: StoredGrammarEntry = {
          id: globalThis.crypto.randomUUID(),
          topic: pending.topic,
          topicKey: normaliseGrammarTopic(pending.topic),
          level: null,
          module: null,
          keyPoints: pending.body,
          notes: '',
          examples: [],
          pitfalls: [],
          mastery: 'learning',
          contentStatus: 'ai-unverified',
          askCount: 0,
          lastAskedAt: null,
          revision: 1,
          operationId: input.operationId,
          createdAt: now,
          updatedAt: now,
        }
        await this.writeGrammarEntry(entry)
        nextStore = addGrammarToStore(nextStore, entry)
        await close('created', entry.id)
        return { resolved: true, entryId: entry.id, outcome: 'created' }
      }

      // attach: the caller names the entry it belongs to.
      const target = this.readGrammarEntries().find((entry) => entry.id === input.entryId)
      if (target === undefined) return { resolved: false, reason: 'entry-unknown' }

      const now = new Date().toISOString()
      // The same question must not be counted twice: the marker is read off the
      // stored examples, so a retry of this decision is recognised even if the
      // decision itself was re-sent with a new operation id.
      const already = target.examples.some((example) =>
        example.intentId === pending.intentId
        || (pending.questionId !== ''
          && example.questionId === pending.questionId
          && example.passageId === pending.passageId))
      const examples = already
        ? target.examples
        : [...target.examples, {
          id: globalThis.crypto.randomUUID(),
          text: pending.body.slice(0, EXCERPT_CHARACTERS),
          passageId: pending.passageId,
          anchorId: pending.anchorId,
          anchor: null,
          question: pending.question,
          intentId: pending.intentId,
          questionId: pending.questionId,
          createdAt: now,
        }]
      const revising = typeof input.keyPoints === 'string' && input.keyPoints.trim() !== ''
      const updated: StoredGrammarEntry = {
        ...target,
        examples,
        // Revising the rule is the explicit act this action exists for; nothing
        // else about the entry moves.
        keyPoints: revising ? input.keyPoints!.trim() : target.keyPoints,
        contentStatus: revising && target.contentStatus === 'ai-unverified' ? 'mixed' : target.contentStatus,
        askCount: already ? target.askCount : target.askCount + 1,
        lastAskedAt: already ? target.lastAskedAt : now,
        revision: target.revision + 1,
        updatedAt: now,
      }
      await this.writeGrammarEntry(updated)
      await close('attached', updated.id)
      return { resolved: true, entryId: updated.id, outcome: revising ? 'rule-revised' : 'example-attached' }
    })
  }

  // --- vocabulary cards: policy and sources ---------------------------------

  /**
   * Render one entry through its policy and report what the policy refuses.
   * Rendering and validation use the same sections, so a card cannot look
   * complete while the gate disagrees.
   */
  async renderLexiconEntry(input: { entryId: string; wantsEtymology?: boolean }, signal: AbortSignal):
  Promise<{ found: boolean; rendered?: string; sections?: { number: string; title: string; required: boolean }[]; errors?: string[]; hints?: string[] }> {
    signal.throwIfAborted()
    return renderLexiconEntry(this.table(), input)
  }

  /**
   * Record what a source fetch may be claimed for.
   *
   * The response is judged, never assumed: an HTTP 200 with only site chrome is
   * stored as a failed fetch with its reason, so the card shows the attempt
   * instead of asserting a source it does not have.
   */
  async recordLexiconSource(input: SourceFetch & { entryId: string }, signal: AbortSignal):
  Promise<{ recorded: boolean; reason?: string; ok?: boolean; outcome?: string; note?: string }> {
    return this.serialize(async () => {
      signal.throwIfAborted()
      return recordLexiconSource(this.table(), input)
    })
  }

  /**
   * Write one section explicitly. A stored entry is authoritative, so a missing
   * section is filled by a deliberate act — never by fetching on the reader's
   * behalf.
   */
  async setLexiconSection(input: { entryId: string; section: string; text: string }, signal: AbortSignal):
  Promise<{ updated: boolean; reason?: string; errors?: string[] }> {
    return this.serialize(async () => {
      signal.throwIfAborted()
      return setLexiconSection(this.table(), input)
    })
  }

  async listGrammar(signal: AbortSignal): Promise<{ entries: StoredGrammarEntry[]; pending: StoredGrammarPending[] }> {
    signal.throwIfAborted()
    const store = this.readGrammarStore()
    return {
      entries: this.readGrammarEntries().sort((left, right) => left.topicKey.localeCompare(right.topicKey)),
      pending: store.pending,
    }
  }

  private readGrammarEntries(): StoredGrammarEntry[] {
    const entries: StoredGrammarEntry[] = []
    for (const [, record] of this.table().entries()) {
      if (record.kind === 'grammar') entries.push(record.payload)
    }
    return entries
  }

  private readGrammarStore(): StoredGrammarStore {
    const record = this.table().get(GRAMMAR_STORE_KEY)
    return record?.kind === 'grammarStore' ? record.payload : { byTopic: {}, pending: [] }
  }

  private async writeGrammarEntry(entry: StoredGrammarEntry): Promise<void> {
    await this.table().put(await grammarStorageKey(entry.topicKey), {
      kind: 'grammar', recordVersion: 1, payload: entry,
    })
  }

  private async writeGrammarStore(store: StoredGrammarStore): Promise<void> {
    await this.table().put(GRAMMAR_STORE_KEY, {
      kind: 'grammarStore',
      recordVersion: 1,
      payload: store,
    })
  }

  private async writeTranslation(passage: StoredPassage, intent: StoredRunIntent):
  Promise<{ kind: 'saved'; translation: StoredTranslation } | { kind: 'conflict'; reason: string }> {
    const segmentation = this.readSegmentation(passage) ?? await this.persistSegmentation(passage)
    if (!this.resolveAnchorId(passage.id, segmentation, intent.anchorId).ok) {
      return { kind: 'conflict', reason: 'anchor-unknown' }
    }
    const analysis = this.readAnalysis(passage.id)
    const already = analysis.translations.find((entry) => entry.operationId === intent.id)
    if (already !== undefined) return { kind: 'saved', translation: already }
    const translation: StoredTranslation = {
      id: globalThis.crypto.randomUUID(),
      anchorId: intent.anchorId,
      anchor: this.anchorRef(passage, segmentation, intent.anchorId),
      source: 'ai',
      note: '',
      language: 'zh-Hans',
      text: intent.body,
      createdAt: new Date().toISOString(),
      operationId: intent.id,
    }
    await this.writeAnalysis(passage.id, {
      ...analysis,
      translations: [...analysis.translations, translation],
    })
    return { kind: 'saved', translation }
  }

  private async writeBranch(passage: StoredPassage, intent: StoredRunIntent):
  Promise<{ kind: 'created'; branch: StoredBranch } | { kind: 'conflict'; reason: string }> {
    const segmentation = this.readSegmentation(passage) ?? await this.persistSegmentation(passage)
    if (!this.resolveAnchorId(passage.id, segmentation, intent.anchorId).ok) {
      return { kind: 'conflict', reason: 'anchor-unknown' }
    }
    const analysis = this.readAnalysis(passage.id)
    const already = analysis.branches.find((entry) => entry.operationId === intent.id)
    if (already !== undefined) return { kind: 'created', branch: already }
    if (analysis.branches.length >= MAX_BRANCHES) return { kind: 'conflict', reason: 'limit-reached' }
    const branch: StoredBranch = {
      id: globalThis.crypto.randomUUID(),
      parentId: null,
      anchorId: intent.anchorId,
      anchor: this.anchorRef(passage, segmentation, intent.anchorId),
      kind: 'grammar',
      title: intent.title === '' ? '语法点' : intent.title,
      body: intent.body,
      createdAt: new Date().toISOString(),
      operationId: intent.id,
    }
    await this.writeAnalysis(passage.id, {
      ...analysis,
      branches: [...analysis.branches, branch],
    })
    return { kind: 'created', branch }
  }

  private async writeAnalysis(passageId: string, analysis: StoredAnalysis): Promise<void> {
    await this.table().put(analysisKey(passageId), {
      kind: 'analysis',
      recordVersion: 1,
      payload: analysis,
    })
  }

  private readPassages(): StoredPassage[] {
    const rows: StoredPassage[] = []
    for (const [key, record] of this.table().entries()) {
      if (record.kind !== 'passage') continue
      if (record.payload.id !== key) {
        throw new Error(`Stored passage key mismatch for ${key}`)
      }
      rows.push(record.payload)
    }
    return rows
  }

  private prepareAnalysisOperation(
    passageId: string,
    operationId: string,
    parentOperationId: string | null,
    callerSignal: AbortSignal,
  ): PreparedAnalysisOperation | 'cancelled' | 'duplicate' {
    this.pruneAnalysisCancellations()
    const queued = this.queuedAnalysisCancellations.get(operationId)
    if (queued !== undefined) {
      this.queuedAnalysisCancellations.delete(operationId)
      if (queued.passageId === passageId) return 'cancelled'
    }
    if (this.activeAnalyses.has(operationId)) return 'duplicate'

    const controller = new AbortController()
    const linked = linkAbortSignals([callerSignal, controller.signal])
    const active: ActiveAnalysisOperation = {
      passageId, parentOperationId, controller, phase: 'generating',
    }
    this.activeAnalyses.set(operationId, active)
    return { active, signal: linked.signal, dispose: linked.dispose }
  }

  private finishAnalysisOperation(operationId: string, prepared: PreparedAnalysisOperation): void {
    if (this.activeAnalyses.get(operationId) === prepared.active) this.activeAnalyses.delete(operationId)
    prepared.dispose()
  }

  private rememberAnalysisCancellation(passageId: string, operationId: string): void {
    this.pruneAnalysisCancellations()
    while (this.queuedAnalysisCancellations.size >= 128) {
      const oldest = this.queuedAnalysisCancellations.keys().next().value
      if (oldest === undefined) break
      this.queuedAnalysisCancellations.delete(oldest)
    }
    this.queuedAnalysisCancellations.set(operationId, {
      passageId,
      expiresAt: Date.now() + 120_000,
    })
  }

  private pruneAnalysisCancellations(): void {
    const now = Date.now()
    for (const [operationId, pending] of this.queuedAnalysisCancellations) {
      if (pending.expiresAt <= now) this.queuedAnalysisCancellations.delete(operationId)
    }
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const pending = this.writeTail.then(operation, operation)
    this.writeTail = pending.then(() => undefined, () => undefined)
    return pending
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host service and Remote namespace owner for French close reading. */
    frenchReader: FrenchReaderController
  }
}

function toPassage(record: StoredPassage): Passage {
  return {
    id: record.id,
    title: record.title,
    sourceText: record.sourceText,
    sourceRevision: record.sourceRevision,
    segmentationRevision: record.segmentationRevision,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    archivedAt: record.archivedAt,
    archiveOperationId: record.archiveOperationId,
  }
}

function toSummary(record: StoredPassage): PassageSummary {
  return {
    id: record.id,
    title: record.title,
    excerpt: record.sourceText.replace(/\s+/gu, ' ').slice(0, 180),
    characterCount: [...record.sourceText].length,
    sourceRevision: record.sourceRevision,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

/** Projection of one stored note onto the source as it stands now. */
interface AnchorResolution {
  anchorStatus: AnchorStatus
  currentAnchorId: string | null
  anchorReason: string
}

/** Stable, path-safe token for one selection: same passage, revision and ranges, same anchor. */
async function selectionToken(
  passageId: string,
  sourceRevision: number,
  ranges: readonly { start: number; end: number }[],
): Promise<string> {
  // The passage id is part of the identity. Without it, two passages selecting
  // the same character range in the same revision produced one shared record:
  // the second passage received the first passage's excerpt, and every note it
  // tried to anchor was then refused as `anchor-unknown`.
  const shape = [
    passageId,
    String(sourceRevision),
    ranges.map((range) => `${String(range.start)}-${String(range.end)}`).join(','),
  ].join('|')
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(shape)))
  return [...digest.slice(0, 8)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Whether two stored range lists name the same selection, in order. */
function sameRanges(
  left: readonly { start: number; end: number }[],
  right: readonly { start: number; end: number }[],
): boolean {
  if (left.length !== right.length) return false
  return left.every((range, index) => range.start === right[index].start && range.end === right[index].end)
}

function normaliseGrammarTopic(topic: string): string {
  return topic.normalize('NFC').trim().toLowerCase().replace(/\s+/gu, ' ')
}

/** Significant words of a topic, used for near matching only. */
function grammarTokens(topic: string): string[] {
  return normaliseGrammarTopic(topic)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 1)
}

/**
 * The text one grammar example quotes: the anchored sentence, paragraph or whole
 * passage — never the head of the document. An example that cannot be located
 * falls back to an explicit marker instead of silently quoting other prose.
 */
function exampleTextFor(
  passage: StoredPassage,
  paragraphs: readonly ParagraphAnchor[],
  anchorId: string,
): string {
  if (anchorId === PASSAGE_ANCHOR_ID) return passage.sourceText.slice(0, EXCERPT_CHARACTERS)
  const found = findAnchor(paragraphs, anchorId)
  if (found === undefined) return `（锚点 ${anchorId} 未能定位，无法引用原句）`
  const text = found.text.trim() === '' ? passage.sourceText.slice(found.start, found.end) : found.text
  return text.slice(0, EXCERPT_CHARACTERS)
}

/**
 * The operation id for the answer half of one ask.
 *
 * It must be a UUID: the message schema declares one, and a real storage backend
 * validates on write, so a suffixed string would be refused at write time and
 * would fail the domain validation on the next open. Deriving it keeps the pair
 * (question, answer) traceable to one ask without inventing a second identity.
 */
async function answerOperationId(askOperationId: string): Promise<string> {
  // Shape it as a version-4 UUID: the schema validates the format, not the source
  // of the randomness, and this id is deterministic on purpose.
  return derivedOperationId(askOperationId, 'answer')
}

/**
 * Whether two extraction verdicts say the same thing.
 *
 * Compared field by field rather than by identity: the run record and the caller's
 * value are separate objects carrying the same three facts.
 */
function sameExtraction(left: StoredRunExtraction | null, right: StoredRunExtraction | null): boolean {
  if (left === null || right === null) return left === right
  return left.status === right.status
    && (left.detail ?? null) === (right.detail ?? null)
    && left.points === right.points
}

/** A valid UUID derived from one operation id and one discriminator. */
async function derivedOperationId(operationId: string, discriminator: string): Promise<string> {  const bytes = new TextEncoder().encode(`${discriminator}\u0000${operationId}`)
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))
  const hex = [...digest.slice(0, 16)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

/** The storage key one grammar topic is written under, derived in one place. */
async function grammarStorageKey(topicKey: string): Promise<string> {
  return grammarKey(await grammarHash(topicKey))
}

function addGrammarToStore(store: StoredGrammarStore, entry: StoredGrammarEntry): StoredGrammarStore {
  const byTopic = { ...store.byTopic }
  const ids = byTopic[entry.topicKey] ?? []
  if (!ids.includes(entry.id)) byTopic[entry.topicKey] = [...ids, entry.id]
  return { ...store, byTopic }
}

/** Exact-form lookup key: Unicode-normalised and lowercased, never stemmed. */
function normaliseMot(mot: string): string {
  return mot.normalize('NFC').trim().toLowerCase()
}

/** Stable, path-safe record key for one Mot + part of speech. */
async function lexiconHash(motKey: string, partOfSpeech: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${motKey}\u0000${partOfSpeech}`)
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))
  return [...digest.slice(0, 16)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function addToIndex(index: StoredLexiconIndex, entry: StoredLexiconEntry): StoredLexiconIndex {
  const byForm: StoredLexiconIndex['byForm'] = { ...index.byForm }
  const link = (form: string, kind: 'exact' | 'form'): void => {
    const key = normaliseMot(form)
    if (key === '') return
    const links = byForm[key] ?? []
    if (links.some((candidate) => candidate.entryId === entry.id && candidate.kind === kind)) return
    byForm[key] = [...links, { entryId: entry.id, kind }]
  }
  link(entry.mot, 'exact')
  link(entry.motKey, 'exact')
  for (const form of entry.forms) link(form, 'form')
  return { byForm }
}

function toLexiconView(entry: StoredLexiconEntry): LexiconView {
  return {
    entryId: entry.id,
    mot: entry.mot,
    lemma: entry.lemma,
    partOfSpeech: entry.partOfSpeech,
    forms: [...entry.forms],
    senses: entry.senses.map((sense) => ({ id: sense.id, label: sense.label, definition: sense.definition })),
    sections: { ...entry.sections },
    sources: entry.sources.map((source) => ({ ...source })),
    occurrences: entry.occurrences.map((occurrence) => ({ ...occurrence })),
    provenance: entry.provenance,
    status: entry.status,
    revision: entry.revision,
    updatedAt: entry.updatedAt,
  }
}

/** Offset of an excerpt that occurs exactly once, or null when absent or ambiguous. */
function relocate(text: string, excerpt: string): number | null {
  if (excerpt === '') return null
  const first = text.indexOf(excerpt)
  if (first === -1) return null
  return text.indexOf(excerpt, first + 1) === -1 ? first : null
}

/**
 * The anchor of the current segmentation containing one offset, at the same
 * granularity as the note being relocated: a paragraph note stays a paragraph
 * note instead of silently becoming a sentence note.
 */
function anchorAt(
  paragraphs: readonly ParagraphAnchor[],
  offset: number,
  granularity: 'paragraph' | 'sentence',
): string | null {
  for (const paragraph of paragraphs) {
    if (offset < paragraph.start || offset >= paragraph.end) continue
    if (granularity === 'paragraph') return paragraph.id
    for (const sentence of paragraph.sentences) {
      if (offset >= sentence.start && offset < sentence.end) return sentence.id
    }
    return paragraph.id
  }
  return null
}

/** Whether a stored anchor id names a sentence rather than a paragraph. */
const isSentenceAnchor = (anchorId: string): boolean => anchorId.includes('.s')

function badRequest(message: string, issues: readonly object[]): RemoteError<'gateway/bad-request'> {
  return new RemoteError('gateway/bad-request', message, { issues })
}
