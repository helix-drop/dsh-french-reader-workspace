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
import type { Context } from '@deepseek-ai/cordis';
import type { BackendCapabilities, BackendModel, BackendTarget, GenerateOutcome, GenerateRequest, GenerationBackend } from './generation.ts';
export interface AgyBackendOptions {
    /** Absolute path to the CLI; overridable so a test never spawns anything. */
    command?: string;
    /** Prompt ceiling in characters. */
    maxPromptCharacters?: number;
    /** Milliseconds before the managed process is stopped. */
    timeoutMs?: number;
    /** Injected for tests: the runner. */
    run?: (argv: readonly string[], signal: AbortSignal, timeoutMs: number) => Promise<RunResult>;
}
export interface RunResult {
    text: string;
    exitCode: number | null;
    /** True when the output was cut off, so a partial answer is never "complete". */
    lossy: boolean;
    timedOut: boolean;
}
export declare class AgyBackend implements GenerationBackend {
    private readonly ctx;
    readonly id = "agy";
    readonly label = "agy \u6865\u63A5";
    private readonly command;
    private readonly maxPromptCharacters;
    private readonly timeoutMs;
    private readonly runner;
    constructor(ctx: Context, options?: AgyBackendOptions);
    get capabilities(): BackendCapabilities;
    available(): {
        available: boolean;
        reason?: string;
    };
    /**
     * The models this CLI offers, read from `agy models` so the picker shows what
     * the installed CLI really serves. An unusable listing yields no models.
     */
    listModels(signal: AbortSignal): Promise<BackendModel[]>;
    generate(target: BackendTarget, request: GenerateRequest): Promise<GenerateOutcome>;
    /** Everything that must be refused before a process exists. */
    private refusal;
    /**
     * Run the CLI once through the Host's subprocess seam.
     *
     * The deadline is enforced here by terminating the managed process; the seam's
     * own grace ladder then does the signalling. Output is collected rather than
     * piped, because the envelope is small and a partial read must be visible as
     * lossy instead of parsed as a whole answer.
     */
    private spawn;
}
/**
 * `agy models` prints `<slug>\t<Display Name>` per line. A malformed listing
 * yields no models instead of invented ones.
 */
export declare function parseModelListing(stdout: string): BackendModel[];
/**
 * The JSON envelope the CLI prints with `--output-format json`.
 *
 * Only `status: 'SUCCESS'` with a string response counts as an answer, and the
 * CLI's own error text is never forwarded: it can carry local paths and account
 * details into a stored message.
 */
export declare function parseEnvelope(stdout: string, requestedModel: string): GenerateOutcome;
