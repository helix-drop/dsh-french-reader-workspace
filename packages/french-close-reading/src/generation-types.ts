/**
 * Wire shapes for generation, discussion and compiled context.
 *
 * These are the panel's view of the Host's state, not the storage records: the
 * client never sees a stored payload. Every field a backend cannot promise stays
 * nullable, and a status that is unknown is reported as unknown rather than
 * filled in.
 */

/** One backend, with what it can honestly do. */
export interface BackendStatus {
  backend: string
  label: string
  available: boolean
  /** Why it is unavailable, when it is; never a guess. */
  reason: string | null
  streaming: boolean
  cancel: boolean
  /** One request at a time in this process. */
  singleFlight: boolean
  maxInputCharacters: number | null
}

export interface BackendModelView {
  id: string
  name: string
  reasoningEfforts: string[]
}

export interface ListBackendsRequest {
  /** Reserved: the listing is always complete. */
  scope: 'all'
}

export interface ListBackendsValue {
  backends: BackendStatus[]
}

export interface ListBackendModelsRequest {
  backend: string
}

export interface ListBackendModelsValue {
  models: BackendModelView[]
  /** Set when the listing could not be produced. */
  reason: string | null
}

/** One material inside a compiled context, as the preview shows it. */
export interface ContextMaterialView {
  kind: string
  refId: string
  reason: string
  characters: number
  /** The head of the exact text that would be sent. */
  excerpt: string
}

export interface PreviewAskRequest {
  passageId: string
  branchId: string
  question: string
  backend: string
  model: string
  extras: ContextExtra[]
}

export interface ContextExtra {
  refId: string
  reason: string
  text: string
}

export type PreviewAskValue =
  | {
    ok: true
    contextId: string
    fingerprint: string
    characters: number
    backend: string
    model: string
    materials: ContextMaterialView[]
    prompt: string
  }
  | { ok: false; reason: string }

export interface AskInput {
  passageId: string
  branchId: string
  question: string
  backend: string
  model: string
  reasoningEffort?: string | null
  extras?: readonly ContextExtra[]
  operationId: string
  /**
   * The fingerprint of the preview the reader approved. A mismatch means the
   * materials changed since the preview, and the turn is refused instead of sent
   * with content nobody looked at.
   */
  expectedFingerprint?: string | null
}

export type AskResult =
  | {
    ok: true
    contextId: string
    fingerprint: string
    characters: number
    finish: 'stop' | 'max-tokens' | 'cancelled' | 'error'
    failure: string | null
    answerText: string
    resolvedModel: string | null
    branchId: string
    messageId: string | null
    usage: { inputTokens: number | null; outputTokens: number | null } | null
    /**
     * How the automatic grammar path read this answer. `status: 'none'` means the
     * reply carried no grammar block, `'invalid'` that it carried an unusable one:
     * both leave the answer intact and are reported rather than hidden. Null when
     * the turn never reached that path.
     */
    extraction: {
      status: 'extracted' | 'none' | 'invalid' | 'failed'
      points: number
      detail: string | null
      runId: string | null
    } | null
    /**
     * True when this answer was replayed from its own stored record instead of
     * being generated again: the same send, answered once.
     */
    replayed?: boolean
  }
  | {
    ok: false
    reason: string
    /** Set when the reason is `model-error`: what the backend reported. */
    failure?: string | null
    contextId?: string
  }

export type AskPreview = PreviewAskValue

/**
 * One frame of a streamed turn.
 *
 * `delta` frames are what the provider has produced so far; exactly one terminal
 * `done` frame follows, carrying the same result the unary `ask` returns — including
 * a refusal, so a streamed turn never ends without saying what happened.
 */
export type AskFrame =
  | { kind: 'delta'; text: string }
  | { kind: 'done'; result: AskResult }

export interface AskRequest extends AskInput {
  /** The request the panel sends; identical to the controller's own input plus nothing. */
  extras: ContextExtra[]
}

/** One message of a branch, as the panel renders it. */
export interface DiscussionMessageView {
  messageId: string
  author: 'user' | 'model'
  text: string
  /** The generation state, when this message was produced by a backend. */
  status: 'draft' | 'complete' | 'partial' | 'failed' | 'cancelled' | null
  backend: string | null
  model: string | null
  resolvedModel: string | null
  failure: string | null
  /** The compiled context this message was sent with. */
  contextId: string | null
  createdAt: string
}

export interface DiscussionBranchView {
  branchId: string
  anchorId: string
  kind: 'constituents' | 'grammar' | 'vocabulary' | 'translation' | 'note' | 'discussion'
  title: string
  parentId: string | null
  forkedFrom: { branchId: string; messageId: string } | null
  status: 'open' | 'understood' | 'unresolved' | 'disputed' | 'archived'
  createdAt: string
  updatedAt: string
  messages: DiscussionMessageView[]
  /**
   * How many messages a request from this branch would actually carry. It is the
   * branch's own history cut off at its fork point, so a sibling branch's later
   * messages are visibly absent from this number.
   */
  historyCount: number
}

export interface ConclusionView {
  conclusionId: string
  branchId: string
  anchorId: string
  text: string
  status: 'proposed' | 'confirmed' | 'superseded'
  messageId: string | null
}

export interface DiscussionView {
  branches: DiscussionBranchView[]
  conclusions: ConclusionView[]
}

export interface ListDiscussionRequest {
  passageId: string
}

export interface CreateBranchRequest {
  passageId: string
  anchorId: string
  kind: 'constituents' | 'grammar' | 'vocabulary' | 'translation' | 'note' | 'discussion'
  title: string
  parentId: string | null
  forkedFrom: { branchId: string; messageId: string } | null
  operationId: string
}

export type CreateBranchValue =
  | { kind: 'created'; branchId: string }
  | { kind: 'already-created'; branchId: string }
  | { kind: 'conflict'; reason: 'passage-unknown' | 'anchor-unknown' | 'parent-unknown' | 'fork-source-unknown' | 'fork-message-unknown' | 'operation-used' }

export interface SetBranchStateRequest {
  passageId: string
  branchId: string
  status: 'open' | 'understood' | 'unresolved' | 'disputed' | 'archived' | null
  title: string | null
}

export type SetBranchStateValue =
  | { kind: 'updated'; branchId: string }
  | { kind: 'conflict'; reason: 'branch-unknown' }

/** A separate, acknowledged cancellation request for an in-flight analysis. */
export interface CancelAnalysisRequest {
  passageId: string
  operationId: string
}

export type CancelAnalysisValue =
  | { kind: 'cancel-requested' }
  | { kind: 'cancel-queued' }
  | { kind: 'too-late' }
  | { kind: 'already-finished' }

export interface RecordConclusionRequest {
  passageId: string
  branchId: string
  anchorId: string
  messageId: string | null
  text: string
  status: 'proposed' | 'confirmed'
  operationId: string
}

export type RecordConclusionValue =
  | { kind: 'recorded'; conclusionId: string }
  | { kind: 'already-recorded'; conclusionId: string }
  | { kind: 'conflict'; reason: 'branch-unknown' | 'passage-unknown' }

export interface ReadContextRequest {
  passageId: string
  contextId: string
}

/** The exact text a stored message was sent with, so a claim can be audited. */
export type ReadContextValue =
  | {
    kind: 'found'
    contextId: string
    fingerprint: string
    characters: number
    backend: string
    model: string
    materials: ContextMaterialView[]
    prompt: string
  }
  | { kind: 'missing' }

/**
 * One declared lexicon source, so a reader can only ask for a source the plugin
 * actually knows how to request.
 */
export interface LexiconSourceKind {
  source: string
  sections: string[]
}

export interface ListLexiconSourcesRequest {
  scope: 'all'
}

export interface ListLexiconSourcesValue {
  sources: LexiconSourceKind[]
}

export interface FetchLexiconSourceRequest {
  entryId: string
  source: string
  section: string
  /** The exact form to look up; the entry's own Mot is not assumed. */
  mot: string
}

/**
 * What a fetch attempt produced. `ok` is the gate's verdict, never an HTTP 200:
 * a page that loaded without a usable body is reported as a failure with its
 * reason, and the attempt is still recorded on the entry.
 */
export interface FetchLexiconSourceValue {
  fetched: boolean
  reason?: string
  ok?: boolean
  outcome?: string
  note?: string
  stored?: boolean
}

export interface SetGrammarMasteryRequest {
  entryId: string
  mastery: 'learning' | 'reviewing' | 'known'
  /** The revision the reader saw; a mismatch is reported rather than overwritten. */
  expectedRevision: number | null
  operationId: string
}

export type SetGrammarMasteryValue =
  | { kind: 'updated'; revision: number }
  | { kind: 'already-updated'; revision: number }
  | { kind: 'unchanged'; revision: number }
  | { kind: 'conflict'; reason: 'entry-unknown' | 'revision-conflict'; revision: number }

/**
 * Merge same-named grammar entries into one.
 *
 * Duplicate topics are real: the automatic path keys an entry by its topic, and
 * two answers that phrase the same rule differently legitimately produce two
 * entries. Merging is the reader's decision — this call is the only thing that
 * may delete one.
 */
export interface MergeGrammarEntriesRequest {
  /** The entry that survives, with its rule text and mastery. */
  keepEntryId: string
  /** The same-named entries whose examples and pitfalls move into it. */
  mergeEntryIds: string[]
  operationId: string
}

export type MergeGrammarEntriesValue =
  | {
    kind: 'merged'
    entryId: string
    revision: number
    /** How many examples and pitfalls were actually moved in. */
    examples: number
    pitfalls: number
    mastery: 'learning' | 'reviewing' | 'known'
  }
  | { kind: 'already-merged'; entryId: string }
  | { kind: 'conflict'; reason: 'entry-unknown' | 'nothing-to-merge' | 'revision-conflict' }

/** One sentence's stored analysis, as the panel renders it. */
export interface ReadSentenceAnalysisRequest {
  passageId: string
  anchorId: string
}

export type ReadSentenceAnalysisValue =
  | {
    kind: 'found'
    analysis: {
      anchorId: string
      text: string
      translation: string
      backbone: string
      clauses: { id: string; role: string; start: number; end: number; text: string; parentId: string | null }[]
      constituents: { id: string; role: string; start: number; end: number; text: string; clauseId: string | null; partOfSpeech: string | null }[]
      morphology: {
        id: string; form: string; lemma: string | null; partOfSpeech: string | null
        tense: string | null; mood: string | null; person: string | null
        gender: string | null; number: string | null; agreesWith: string | null; note: string
      }[]
      explanations: { id: string; kind: 'syntax' | 'context' | 'rhetoric' | 'unverified'; text: string; start: number | null; end: number | null }[]
      provenance: 'ai' | 'user' | 'mixed'
      status: 'draft' | 'reviewed'
      revision: number
    }
    errors: string[]
    hints: string[]
  }
  /** An analysis exists but describes text that is no longer the sentence. */
  | { kind: 'stale' }
  | { kind: 'missing' }

/**
 * How much of the passage is analysed, measured against the current sentences.
 * `stale` means the analysis describes text that is no longer the sentence.
 */
export interface AnalysisCoverageValue {
  found: boolean
  sourceRevision?: number
  total?: number
  covered?: string[]
  missing?: string[]
  failed?: string[]
  stale?: string[]
  perSentence?: { anchorId: string; errors: string[]; hints: string[] }[]
  currentVersion?: {
    versionId: string
    revision: number
    sourceRevision: number
    coveredCount: number
    overallTranslation: string | null
    createdAt: string
  } | null
  versionCount?: number
}

export interface ReadAnalysisCoverageRequest {
  passageId: string
}

export type AnalysisContextRelation = 'previous' | 'current' | 'next'

export interface AnalysisContextMaterial {
  paragraphId: string
  relation: AnalysisContextRelation
  text: string
  start: number
  end: number
  included: boolean
  reason: 'included' | 'not-selected' | 'over-budget'
}

export interface PreviewAnalysisContextRequest {
  passageId: string
  anchorId: string
  /** Omitted means the default: current + previous first, then next if it fits. */
  paragraphIds?: string[]
}

export interface PreviewAnalysisContextValue {
  ok: boolean
  reason: 'current-paragraph-too-long' | 'selected-context-too-long' | 'selection-invalid' | null
  anchorId: string
  currentParagraphId: string
  characterLimit: number
  characters: number
  materials: AnalysisContextMaterial[]
  includedParagraphIds: string[]
  omittedParagraphIds: string[]
  fingerprint: string | null
}

export interface AnalyseSentenceRequest {
  passageId: string
  anchorId: string
  backend: string
  model: string
  reasoningEffort: string | null
  operationId: string
  paragraphIds?: string[]
  expectedFingerprint?: string | null
}

/**
 * A refused analysis is refused with the gate's own reason: an analysis that
 * fails validation is never stored and never shown next to a usable one.
 */
export type AnalyseSentenceResult =
  | {
    ok: true
    anchorId: string
    backend: string
    model: string
    resolvedModel: string | null
    replaced: boolean
    hints: string[]
    covered: number
    missing: number
    failed: number
    stale: number
    operationId: string
  }
  | { ok: false; reason: string; failure?: string | null; hints?: string[] }

export interface PutSentenceAnalysisRequest {
  passageId: string
  anchorId: string
  /**
   * The analysis serialized as JSON, in the same shape the model is asked for.
   * It travels as text because that is exactly what a model reply is, so the same
   * parser reads both and a caller cannot bypass the gate by sending a
   * differently-shaped object.
   */
  analysisJson: string
}

export interface PutSentenceAnalysisValue {
  stored: boolean
  reason?: string
  errors?: string[]
  hints?: string[]
}

export interface PublishAnalysisRequest {
  passageId: string
  /** The passage-wide translation, or null while it has not been written. */
  overallTranslation: string | null
  /** Discourse links and pronouns that only make sense across the paragraph. */
  cohesion: string
}

export type PublishAnalysisValue =
  | { kind: 'published'; versionId: string; revision: number; coveredCount: number }
  | { kind: 'conflict'; reason: string }

export interface AnalyseParagraphRequest {
  passageId: string
  /** The paragraph whose missing sentences should be analysed. */
  paragraphId: string
  backend: string
  model: string
  reasoningEffort: string | null
  operationId: string
}

/**
 * The outcome of one paragraph run. `asked` is what it set out to do and `stored`
 * what actually passed the gate, so a partial run is visible as partial.
 */
export interface AnalyseParagraphResult {
  ok: boolean
  reason?: string
  asked?: number
  stored?: number
  failed?: { anchorId: string; reason: string }[]
  covered?: number
  missing?: number
  failedCount?: number
  stale?: number
  note?: string
}

/* --------------------------------------------------------------- reading --- */

/**
 * Reading one sentence, or one conjugated form, aloud.
 *
 * Exactly one immutable source per request. The source is named in full —
 * passage, sentence, both revisions and the sentence's own text — so a result is
 * routed by `sentenceId + revision + requestId` and never by whatever the panel
 * currently has selected. A paragraph title, a paragraph body, a translation or
 * a discussion has no field to travel in, which is what keeps them out of the
 * synthesis input.
 */

/** The one immutable source a sentence's audio belongs to. */
export interface SentenceSpeechSourceView {
  passageId: string
  sentenceId: string
  /** The passage source revision the sentence was read from. */
  sourceRevision: number
  /** The segmentation revision the sentence came from (`getSegmentation`). */
  sentenceRevision: number
  /** Exactly one sentence. This is the only text that is ever synthesized. */
  text: string
  language: string
}

/** The one form a conjugation row's audio belongs to. */
export interface InflectionSpeechSourceView {
  kind: 'inflection'
  formId: string
  inflectionRevision: number
  lemma: string
  tense: string
  formKind: 'finite' | 'compound-infinitive' | 'participle'
  person: 1 | 2 | 3 | 4 | 5 | 6 | null
  form: string
  /** Real French, never IPA and never slash-separated alternatives. */
  utterance: string
  language: string
}

export interface AudioVoiceView {
  /** null means the voice the Host is configured with. */
  voiceId: string | null
  /** Playback speed; it is part of a take's identity. */
  rate: number
}

export interface SpeechBackendView {
  kind: 'live' | 'tts'
  providerId: string
  modelId: string
}

/** One stored audio version. The bytes stay in the Host; readAsset returns them. */
export interface SentenceAudioTakeView {
  takeId: string
  requestId: string
  source: SentenceSpeechSourceView
  backend: SpeechBackendView
  voice: AudioVoiceView
  previousTakeId: string | null
  audioAssetId: string
  mimeType: string
  durationMs: number
  bytes: number
  createdAt: string
  /** True for the take the Host currently plays for this exact source. */
  selected: boolean
}

export interface InflectionAudioTakeView {
  takeId: string
  requestId: string
  source: InflectionSpeechSourceView
  backend: SpeechBackendView
  voice: AudioVoiceView
  previousTakeId: string | null
  audioAssetId: string
  mimeType: string
  durationMs: number
  bytes: number
  createdAt: string
  selected: boolean
}

export interface SynthesizeSentenceAudioRequest {
  /** The caller's request id. Retrying the same one never queues a second synthesis. */
  requestId: string
  /** `generate` reuses a cached take when one matches; `regenerate` always appends. */
  action: 'generate' | 'regenerate'
  source: SentenceSpeechSourceView
  /** The take this one follows, when the reader regenerated an existing sentence. */
  previousTakeId: string | null
  /** A regeneration appends; a request that asks to overwrite anything is refused. */
  versionPolicy: 'append'
  /** null means the configured voice. */
  voice: AudioVoiceView | null
}

/** Why the text or the source was refused before any request existed. */
export type AudioInputRejectionView =
  | 'blank'
  | 'multi-sentence'
  | 'too-long'
  | 'not-french'
  | 'source-unknown'
  | 'source-mismatch'
  | 'revision-mismatch'
  | 'voice-invalid'

/** Why a synthesis the reader asked for produced no audio. */
export type AudioFailureView =
  | 'unconfigured'
  | 'unauthorized'
  | 'rate-limited'
  | 'timeout'
  | 'cancelled'
  | 'provider-error'

export type AudioConfigurationView = {
  /** Audio cannot be requested at all until this says otherwise. */
  configured: boolean
  reason: 'disabled' | 'no-api-key' | 'invalid-config' | 'transport-unavailable' | null
  message: string | null
  backend: SpeechBackendView | null
  streaming: boolean
  cancellation: boolean
  maxCharacters: number
}

export type SynthesizeSentenceAudioValue =
  /** A new take was synthesized and appended. */
  | { kind: 'ready'; take: SentenceAudioTakeView }
  /** A take already existed for this source, backend and voice: nothing was requested. */
  | { kind: 'cached'; take: SentenceAudioTakeView }
  /** This requestId already produced a take: the same request, answered once. */
  | { kind: 'replayed'; take: SentenceAudioTakeView }
  /** The same requestId is already being synthesized; no second job was started. */
  | { kind: 'generating'; requestId: string }
  | { kind: 'unconfigured'; reason: 'disabled' | 'no-api-key' | 'invalid-config' | 'transport-unavailable'; message: string }
  | { kind: 'rejected'; reason: AudioInputRejectionView; message: string }
  | { kind: 'cancelled'; requestId: string }
  | { kind: 'failed'; reason: AudioFailureView; message: string }

export interface ListSentenceAudioRequest {
  source: SentenceSpeechSourceView
}

export interface SentenceAudioListValue {
  sourceKey: string
  takes: SentenceAudioTakeView[]
  selectedTakeId: string | null
  configuration: AudioConfigurationView
}

export interface SelectSentenceAudioRequest {
  source: SentenceSpeechSourceView
  takeId: string
}

export type SelectSentenceAudioValue =
  | { kind: 'selected'; takeId: string }
  | { kind: 'already-selected'; takeId: string }
  | { kind: 'conflict'; reason: 'unknown-source' | 'unknown-take' | 'revision-mismatch' }

export interface ReadSentenceAudioAssetRequest {
  source: SentenceSpeechSourceView
  takeId: string
}

export interface ReadSentenceAudioAssetValue {
  kind: 'found' | 'missing'
  takeId: string
  mimeType: string | null
  /** The WAV bytes, base64. Empty when the take is missing. */
  base64: string
  bytes: number
  durationMs: number
  createdAt: string | null
}

export interface SynthesizeInflectionAudioRequest {
  requestId: string
  action: 'generate' | 'regenerate'
  source: InflectionSpeechSourceView
  previousTakeId: string | null
  versionPolicy: 'append'
  voice: AudioVoiceView | null
}

export type SynthesizeInflectionAudioValue =
  | { kind: 'ready'; take: InflectionAudioTakeView }
  | { kind: 'cached'; take: InflectionAudioTakeView }
  | { kind: 'replayed'; take: InflectionAudioTakeView }
  | { kind: 'generating'; requestId: string }
  | { kind: 'unconfigured'; reason: 'disabled' | 'no-api-key' | 'invalid-config' | 'transport-unavailable'; message: string }
  | { kind: 'rejected'; reason: AudioInputRejectionView; message: string }
  | { kind: 'cancelled'; requestId: string }
  | { kind: 'failed'; reason: AudioFailureView; message: string }

export interface ListInflectionAudioRequest {
  source: InflectionSpeechSourceView
}

export interface InflectionAudioListValue {
  sourceKey: string
  takes: InflectionAudioTakeView[]
  selectedTakeId: string | null
  configuration: AudioConfigurationView
}

export interface SelectInflectionAudioRequest {
  source: InflectionSpeechSourceView
  takeId: string
}

export type SelectInflectionAudioValue =
  | { kind: 'selected'; takeId: string }
  | { kind: 'already-selected'; takeId: string }
  | { kind: 'conflict'; reason: 'unknown-source' | 'unknown-take' | 'revision-mismatch' }

export interface ReadInflectionAudioAssetRequest {
  source: InflectionSpeechSourceView
  takeId: string
}

export interface ReadInflectionAudioAssetValue {
  kind: 'found' | 'missing'
  takeId: string
  mimeType: string | null
  base64: string
  bytes: number
  durationMs: number
  createdAt: string | null
}
