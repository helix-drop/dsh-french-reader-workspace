/**
 * Generation backends.
 *
 * A backend turns one compiled context into one answer. Two very different
 * things sit behind this interface — DSH's own model routes and the local
 * Antigravity CLI bridge — so the interface states only what both can honestly
 * do: send text, stream or return text, report who actually answered, cancel.
 *
 * Everything a backend cannot promise stays nullable. A backend that does not
 * report a model says so; nothing is filled in by guessing.
 */
import type { Context } from '@deepseek-ai/cordis'

/** What one backend can do, so a caller never assumes more. */
export interface BackendCapabilities {
  /** Whether the backend streams partial text or answers in one piece. */
  readonly streaming: boolean
  /** Whether the request can be cancelled after it started. */
  readonly cancel: boolean
  /** Whether the backend reports the model that actually answered. */
  readonly reportsResolvedModel: boolean
  /** Whether the backend reports token usage. */
  readonly reportsUsage: boolean
  /** Whether the backend enforces a hard input character limit. */
  readonly maxInputCharacters: number | null
  /** Whether the backend runs one request at a time in this process. */
  readonly singleFlight: boolean
}

/** One model a backend can be asked for. */
export interface BackendModel {
  id: string
  name: string
  /** Reasoning efforts this exact model accepts, in the backend's own ids. */
  reasoningEfforts: string[]
  /** Absent means the backend does not know. */
  contextWindow: number | null
}

export interface BackendTarget {
  backend: string
  model: string
  reasoningEffort?: string | undefined
}

export interface GenerateRequest {
  system: string
  /** The assembled user turn: compiled materials plus the question. */
  prompt: string
  signal: AbortSignal
  /**
   * Called with each text delta as the backend produces it.
   *
   * Optional because a backend that answers in one piece has no deltas to report
   * (`capabilities.streaming` says which it is); a caller that wants progress
   * durable while the answer is still arriving passes this.
   */
  onDelta?: (delta: string) => void
  /**
   * Called once per stage boundary: 'preparing' (metadata/路由解析, not yet at
   * the provider) and 'streaming' (provider stream open). A caller that records
   * these can tell afterwards where a stalled call was waiting.
   */
  onPhase?: (phase: string) => void
}

export interface GenerateOutcome {
  text: string
  /** The model the backend confirmed, when it confirms one. */
  resolvedModel: string | null
  usage: { inputTokens: number | null; outputTokens: number | null } | null
  /** How the generation ended, so a partial answer is never stored as complete. */
  finish: 'stop' | 'max-tokens' | 'cancelled' | 'error'
  failure: string | null
}

export interface GenerationBackend {
  readonly id: string
  readonly label: string
  readonly capabilities: BackendCapabilities
  /** False when the backend is not usable right now; `reason` says why. */
  available(): { available: boolean; reason?: string }
  listModels(signal: AbortSignal): Promise<BackendModel[]>
  generate(target: BackendTarget, request: GenerateRequest): Promise<GenerateOutcome>
}

/**
 * The DSH model routes, via `ctx.llm`.
 *
 * The adapter is resolved through `prepareCall`, so the route that answers the
 * request is the one the capability check saw — a configuration change between
 * the two cannot mix two adapters into one call.
 */
export class DshLlmBackend implements GenerationBackend {
  readonly id = 'dsh'
  readonly label = 'DSH 模型'

  constructor(private readonly ctx: Context) {}

  get capabilities(): BackendCapabilities {
    return {
      streaming: true,
      cancel: true,
      reportsResolvedModel: true,
      reportsUsage: true,
      maxInputCharacters: null,
      singleFlight: false,
    }
  }

  available(): { available: boolean; reason?: string } {
    const llm = this.ctx.get('llm')
    if (llm === undefined) return { available: false, reason: 'llm-unavailable' }
    if (llm.listProviders().length === 0) return { available: false, reason: 'no-provider-registered' }
    return { available: true }
  }

  async listModels(signal: AbortSignal): Promise<BackendModel[]> {
    const llm = this.ctx.get('llm')
    if (llm === undefined) return []
    const models: BackendModel[] = []
    for (const provider of llm.listProviders()) {
      signal.throwIfAborted()
      for (const model of await llm.listModels(provider.id)) {
        // The backend id keeps the provider: two providers may serve one model id.
        models.push({
          id: `${provider.id}/${model.id}`,
          name: `${model.name} · ${provider.name}`,
          reasoningEfforts: [],
          contextWindow: null,
        })
      }
    }
    // Reasoning efforts are model-specific and only known after resolution, so
    // they are read lazily per chosen model (see resolveReasoningEfforts).
    return models
  }

  /** The reasoning efforts one exact route accepts, for the model picker. */
  async resolveReasoningEfforts(model: string, signal?: AbortSignal): Promise<string[]> {
    const llm = this.ctx.get('llm')
    const route = splitRoute(model)
    if (llm === undefined || route === null) return []
    try {
      const info = await llm.resolveModelInfo(route.provider, route.model, signal)
      const efforts: readonly { id: unknown }[] = info.reasoning?.efforts ?? []
      return efforts.map((effort) => String(effort.id))
    } catch {
      // A model whose metadata cannot be read is offered without effort choices
      // rather than with invented ones.
      return []
    }
  }

  async generate(target: BackendTarget, request: GenerateRequest): Promise<GenerateOutcome> {
    const llm = this.ctx.get('llm')
    if (llm === undefined) {
      return { text: '', resolvedModel: null, usage: null, finish: 'error', failure: 'llm-unavailable' }
    }
    const route = splitRoute(target.model)
    if (route === null) {
      return { text: '', resolvedModel: null, usage: null, finish: 'error', failure: 'model-route-invalid' }
    }
    if (request.signal.aborted) {
      return { text: '', resolvedModel: null, usage: null, finish: 'cancelled', failure: null }
    }

    let prepared
    request.onPhase?.('preparing')
    try {
      prepared = await llm.prepareCall({
        provider: route.provider,
        model: route.model,
        ...(target.reasoningEffort === undefined
          ? {}
          : { reasoningEffort: target.reasoningEffort as never }),
      }, request.signal)
    } catch (error) {
      return {
        text: '', resolvedModel: null, usage: null,
        // An abort (reader cancel or caller timeout) is not a model failure.
        finish: request.signal.aborted ? 'cancelled' : 'error',
        failure: failureText(error),
      }
    }

    let text = ''
    let usage: GenerateOutcome['usage'] = null
    let finish: GenerateOutcome['finish'] = 'stop'
    let failure: string | null = null
    let sawFinish = false
    try {
      // The dispatch carries the *prepared* config verbatim, plus this turn's
      // messages. The runtime compares the two and refuses a mismatch, and an
      // omitted `temperature` is not the same value as one the adapter resolved
      // from its own defaults — so the config travels through untouched rather
      // than being reconstructed field by field from what seemed relevant.
      const dispatched = {
        ...prepared.config,
        messages: [{ role: 'user' as const, content: [{ type: 'text' as const, text: request.prompt }] }],
        system: request.system,
        signal: request.signal,
      }
      // The provider stream is open: from here on, a wait is a wait on the model.
      request.onPhase?.('streaming')
      for await (const chunk of prepared.stream(dispatched)) {
        if (chunk.type === 'text-delta') {
          text += chunk.text
          // Handed to the caller as it arrives, so a turn in progress has something
          // durable behind it rather than appearing only once it is finished.
          request.onDelta?.(chunk.text)
        } else if (chunk.type === 'usage') {
          usage = { inputTokens: chunk.usage.inputTokens, outputTokens: chunk.usage.outputTokens }
        } else if (chunk.type === 'finish') {
          sawFinish = true
          if (chunk.reason.kind === 'aborted') {
            finish = 'cancelled'
            failure = chunk.reason.failure.message
          } else if (chunk.reason.kind === 'error') {
            finish = 'error'
            failure = chunk.reason.failure.message
          } else if (chunk.reason.kind === 'max-tokens') {
            finish = 'max-tokens'
          }
        }
      }
    } catch (error) {
      return {
        text, resolvedModel: target.model, usage,
        finish: request.signal.aborted ? 'cancelled' : 'error',
        failure: failureText(error),
      }
    }
    // A provider stream that ends without a terminal frame is a failure, not a
    // completed empty turn — silence must never be read as success.
    if (!sawFinish) {
      return {
        text, resolvedModel: target.model, usage, finish: 'error',
        failure: 'stream-ended-without-finish',
      }
    }
    // A provider may ignore the cancel and still end its stream with `stop`:
    // the turn was revoked, and a late "success" must never be handed back as a
    // usable result — downstream stores whatever this returns.
    if (request.signal.aborted) {
      return { text, resolvedModel: target.model, usage, finish: 'cancelled', failure }
    }

    // A route that answered is named by the request's own route; the backend does
    // not pretend to know a different one after the fact.
    return { text, resolvedModel: target.model, usage, finish, failure }
  }
}

/** Split a `provider/model` id, or null when the id is not a route. */
export function splitRoute(model: string): { provider: string; model: string } | null {
  const at = model.indexOf('/')
  if (at <= 0 || at === model.length - 1) return null
  return { provider: model.slice(0, at), model: model.slice(at + 1) }
}

function failureText(error: unknown): string {
  if (error !== null && typeof error === 'object' && 'message' in error) return String(error.message)
  return String(error)
}
