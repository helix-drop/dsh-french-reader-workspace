/**
 * The Antigravity (`agy`) generation backend.
 *
 * This runs the local official CLI headless and uses it as a **model endpoint for
 * reading work**: one explicit text prompt in, text out. It is not handed the
 * reading library, and it is never asked to edit anything.
 *
 * The process goes through the Host's own `ctx.subprocess` service rather than
 * `node:child_process`. That is not a detail: the seam owns argv, the execution
 * world's environment, stdio and the teardown ladder, and it is the same service
 * every other capability in this Host uses. Reaching around it with a private
 * `execFile` would give this plugin its own, differently-sandboxed process world.
 *
 * Boundaries kept here, because the CLI is an agent and not a completion endpoint:
 *
 * - text only: the prompt is assembled by our own context compiler, and
 *   `--continue` is never passed, so it cannot inherit context we did not choose;
 * - one task at a time in this process, matching the CLI's single-session model;
 * - a character ceiling enforced *before* spawning, because the prompt travels as
 *   one argv entry;
 * - `--sandbox --mode plan` plus an explicit no-write instruction. That reduces
 *   what the CLI may do; it is **not an operating-system guarantee**;
 * - model and effort are validated argv entries, never a shell string, and an
 *   unknown model fails loudly instead of falling back;
 * - the CLI's own stderr is never forwarded: it can carry local paths and account
 *   details into a stored message.
 *
 * Verified against the installed CLI on this machine: `agy models` lists slugs,
 * and `agy --help` accepts `--model`, `--effort` (low|medium|high|xhigh|max),
 * `--json-schema`, `--output-format`, `--sandbox`, `--mode` and
 * `--disable-slash-commands`.
 */
import type { Context } from '@deepseek-ai/cordis'

import type {
  BackendCapabilities,
  BackendModel,
  BackendTarget,
  GenerateOutcome,
  GenerateRequest,
  GenerationBackend,
} from './generation.ts'

export interface AgyBackendOptions {
  /** Absolute path to the CLI; overridable so a test never spawns anything. */
  command?: string
  /** Prompt ceiling in characters. */
  maxPromptCharacters?: number
  /** Milliseconds before the managed process is stopped. */
  timeoutMs?: number
  /** Injected for tests: the runner. */
  run?: (argv: readonly string[], signal: AbortSignal, timeoutMs: number) => Promise<RunResult>
}

export interface RunResult {
  text: string
  exitCode: number | null
  /** True when the output was cut off, so a partial answer is never "complete". */
  lossy: boolean
  timedOut: boolean
}

const DEFAULT_COMMAND = '/Users/hao/.local/bin/agy'
const DEFAULT_MAX_PROMPT = 6_000
const DEFAULT_TIMEOUT_MS = 240_000
const MODEL_LIST_TIMEOUT_MS = 30_000
/** Collected stdout ceiling; the JSON envelope is far smaller than this. */
const MAX_OUTPUT_BYTES = 1024 * 1024

/** What the CLI is allowed to do here: answer, and nothing else. */
const NO_WRITE_INSTRUCTION = [
  '',
  '---',
  'You are answering a question about a French text. Reply with the analysis only.',
  'Do not modify, create or delete any file. Do not run commands that change state.',
].join('\n')

/**
 * Capacity shared by every instance in this process, matching the CLI's own
 * single-session behaviour: a second concurrent task is refused rather than
 * queued behind a process nobody can see.
 */
const AGY_CAPACITY: unique symbol = Symbol.for('dsh.french-close-reading.agy.capacity')
interface Capacity { running: boolean }

export class AgyBackend implements GenerationBackend {
  readonly id = 'agy'
  readonly label = 'agy 桥接'

  private readonly command: string
  private readonly maxPromptCharacters: number
  private readonly timeoutMs: number
  private readonly runner: (argv: readonly string[], signal: AbortSignal, timeoutMs: number) => Promise<RunResult>

  constructor(private readonly ctx: Context, options: AgyBackendOptions = {}) {
    this.command = options.command ?? DEFAULT_COMMAND
    this.maxPromptCharacters = options.maxPromptCharacters ?? DEFAULT_MAX_PROMPT
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.runner = options.run ?? ((argv, signal, timeoutMs) => this.spawn(argv, signal, timeoutMs))
  }

  get capabilities(): BackendCapabilities {
    return {
      streaming: false,
      cancel: true,
      reportsResolvedModel: true,
      reportsUsage: true,
      maxInputCharacters: this.maxPromptCharacters,
      singleFlight: true,
    }
  }

  available(): { available: boolean; reason?: string } {
    return this.ctx.get('subprocess') === undefined
      ? { available: false, reason: 'subprocess-unavailable' }
      : { available: true }
  }

  /**
   * The models this CLI offers, read from `agy models` so the picker shows what
   * the installed CLI really serves. An unusable listing yields no models.
   */
  async listModels(signal: AbortSignal): Promise<BackendModel[]> {
    if (!this.available().available) return []
    try {
      const result = await this.runner([this.command, 'models'], signal, MODEL_LIST_TIMEOUT_MS)
      return result.exitCode === 0 ? parseModelListing(result.text) : []
    } catch {
      return []
    }
  }

  async generate(target: BackendTarget, request: GenerateRequest): Promise<GenerateOutcome> {
    const refused = this.refusal(target, request)
    if (refused !== null) return refused

    const capacity = (globalThis as unknown as Record<symbol, Capacity>)[AGY_CAPACITY]
      ?? ((globalThis as unknown as Record<symbol, Capacity>)[AGY_CAPACITY] = { running: false })
    if (capacity.running) {
      return failureOutcome('agy-busy', 'agy 已有任务在运行；请等待它结束或取消后重试。')
    }

    const prompt = `${request.prompt}${NO_WRITE_INSTRUCTION}`
    const argv = [
      this.command,
      '--print', prompt,
      '--model', target.model,
      '--output-format', 'json',
      '--mode', 'plan',
      '--sandbox',
      '--disable-slash-commands',
    ]
    if (target.reasoningEffort !== undefined && target.reasoningEffort !== '') {
      // The CLI validates the value itself; an invalid effort fails the run
      // loudly rather than being silently dropped here.
      argv.push('--effort', target.reasoningEffort)
    }

    capacity.running = true
    try {
      const result = await this.runner(argv, request.signal, this.timeoutMs)
      if (request.signal.aborted) {
        return { text: '', resolvedModel: null, usage: null, finish: 'cancelled', failure: null }
      }
      if (result.timedOut) return failureOutcome('agy-timeout', 'agy 在时限内没有完成，进程已停止。')
      if (result.exitCode !== 0) return failureOutcome('agy-failed', 'agy 报告本次运行未成功。')
      if (result.lossy) return failureOutcome('agy-output-truncated', 'agy 的输出被截断，不能当作完整回答。')
      return parseEnvelope(result.text, target.model)
    } catch {
      return failureOutcome('agy-spawn-failed', '无法启动本机 agy CLI。')
    } finally {
      capacity.running = false
    }
  }

  /** Everything that must be refused before a process exists. */
  private refusal(target: BackendTarget, request: GenerateRequest): GenerateOutcome | null {
    const status = this.available()
    if (!status.available) {
      return failureOutcome('agy-unavailable', `本机 agy 不可用（${status.reason ?? 'unknown'}）。`)
    }
    if (target.model.trim() === '') {
      return failureOutcome('agy-model-required', '必须明确选择 agy 模型：这里不提供默认回退。')
    }
    const length = request.prompt.length + NO_WRITE_INSTRUCTION.length
    if (length > this.maxPromptCharacters) {
      return failureOutcome(
        'agy-input-too-long',
        `本次上下文约 ${String(length)} 字符，超过 agy 的 ${String(this.maxPromptCharacters)} 字符上限；请缩减引用或改用 DSH 模型。`,
      )
    }
    if (request.signal.aborted) {
      return { text: '', resolvedModel: null, usage: null, finish: 'cancelled', failure: null }
    }
    return null
  }

  /**
   * Run the CLI once through the Host's subprocess seam.
   *
   * The deadline is enforced here by terminating the managed process; the seam's
   * own grace ladder then does the signalling. Output is collected rather than
   * piped, because the envelope is small and a partial read must be visible as
   * lossy instead of parsed as a whole answer.
   */
  private spawn(argv: readonly string[], signal: AbortSignal, timeoutMs: number): Promise<RunResult> {
    const subprocess = this.ctx.get('subprocess')
    if (subprocess === undefined) return Promise.reject(new Error('subprocess-unavailable'))
    const handle = subprocess.spawn({
      argv: [...argv],
      // The CLI is run from the user's home directory: it must not treat the
      // reading workspace as a project to inspect.
      cwd: homeDirectory(),
      stdio: {
        stdin: 'ignore',
        stdout: { maxBytes: MAX_OUTPUT_BYTES },
        stderr: { maxBytes: 8_192 },
      },
      graceMs: 2_000,
      signal,
    })

    let timedOut = false
    const deadline = globalThis.setTimeout(() => {
      timedOut = true
      handle.terminate()
    }, timeoutMs)

    return handle.done.then((outcome: { exitCode: number | null }) => {
      globalThis.clearTimeout(deadline)
      const reader = handle.collected.stdout
      const read = reader === undefined
        ? { text: '', lossy: false }
        : reader.readFrom(0)
      return {
        text: read.text,
        exitCode: outcome.exitCode,
        lossy: read.lossy,
        timedOut,
      }
    }, (error: unknown) => {
      globalThis.clearTimeout(deadline)
      throw error
    })
  }
}

/**
 * The user's home directory, used as the CLI's working directory so the reading
 * workspace is never treated as a project to inspect. Read as an untyped host
 * global because this package is compiled without Node's type definitions.
 */
function homeDirectory(): string {
  const proc = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process
  const home = proc?.env?.HOME
  return typeof home === 'string' && home !== '' ? home : '/'
}

/**
 * `agy models` prints `<slug>\t<Display Name>` per line. A malformed listing
 * yields no models instead of invented ones.
 */
export function parseModelListing(stdout: string): BackendModel[] {
  const models: BackendModel[] = []
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('Fetching')) continue
    const [slug, ...rest] = trimmed.split('\t')
    if (slug === undefined || !/^[a-z0-9][a-z0-9._-]*$/u.test(slug)) continue
    const name = rest.join(' ').trim()
    models.push({
      id: slug,
      name: name === '' ? slug : name,
      // The CLI takes effort as a separate flag; the model list does not
      // advertise per-model efforts, so none are claimed.
      reasoningEfforts: [],
      contextWindow: null,
    })
  }
  return models
}

/**
 * The JSON envelope the CLI prints with `--output-format json`.
 *
 * Only `status: 'SUCCESS'` with a string response counts as an answer, and the
 * CLI's own error text is never forwarded: it can carry local paths and account
 * details into a stored message.
 */
export function parseEnvelope(stdout: string, requestedModel: string): GenerateOutcome {
  let envelope: unknown
  try {
    envelope = JSON.parse(stdout)
  } catch {
    return failureOutcome('agy-invalid-json', 'agy 未返回可解析的 JSON。')
  }
  if (envelope === null || typeof envelope !== 'object') {
    return failureOutcome('agy-invalid-envelope', 'agy 返回的 JSON 不是对象。')
  }
  const record = envelope as Record<string, unknown>
  if (record.status !== 'SUCCESS' || typeof record.response !== 'string') {
    return failureOutcome('agy-failed', 'agy 报告本次运行未成功。')
  }
  const usage = record.usage !== null && typeof record.usage === 'object'
    ? record.usage as Record<string, unknown>
    : null
  // The envelope does not always name the model: the pinned one is what answered,
  // and it is reported as such rather than left blank.
  const model = typeof record.model === 'string' && record.model !== '' ? record.model : requestedModel
  return {
    text: record.response,
    resolvedModel: model,
    usage: usage === null
      ? null
      : {
        inputTokens: typeof usage.input_tokens === 'number' ? usage.input_tokens : null,
        outputTokens: typeof usage.output_tokens === 'number' ? usage.output_tokens : null,
      },
    finish: 'stop',
    failure: null,
  }
}

function failureOutcome(code: string, message: string): GenerateOutcome {
  return { text: '', resolvedModel: null, usage: null, finish: 'error', failure: `${code}: ${message}` }
}
