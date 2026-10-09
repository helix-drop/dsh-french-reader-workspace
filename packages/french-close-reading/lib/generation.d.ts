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
import type { Context } from '@deepseek-ai/cordis';
/** What one backend can do, so a caller never assumes more. */
export interface BackendCapabilities {
    /** Whether the backend streams partial text or answers in one piece. */
    readonly streaming: boolean;
    /** Whether the request can be cancelled after it started. */
    readonly cancel: boolean;
    /** Whether the backend reports the model that actually answered. */
    readonly reportsResolvedModel: boolean;
    /** Whether the backend reports token usage. */
    readonly reportsUsage: boolean;
    /** Whether the backend enforces a hard input character limit. */
    readonly maxInputCharacters: number | null;
    /** Whether the backend runs one request at a time in this process. */
    readonly singleFlight: boolean;
}
/** One model a backend can be asked for. */
export interface BackendModel {
    id: string;
    name: string;
    /** Reasoning efforts this exact model accepts, in the backend's own ids. */
    reasoningEfforts: string[];
    /** Absent means the backend does not know. */
    contextWindow: number | null;
}
export interface BackendTarget {
    backend: string;
    model: string;
    reasoningEffort?: string | undefined;
}
export interface GenerateRequest {
    system: string;
    /** The assembled user turn: compiled materials plus the question. */
    prompt: string;
    signal: AbortSignal;
    /**
     * Called with each text delta as the backend produces it.
     *
     * Optional because a backend that answers in one piece has no deltas to report
     * (`capabilities.streaming` says which it is); a caller that wants progress
     * durable while the answer is still arriving passes this.
     */
    onDelta?: (delta: string) => void;
    /**
     * Called once for the first text delta, with milliseconds since backend dispatch.
     * This is not necessarily the first reasoning token: adapters may expose reasoning
     * separately or include it only in usage.
     */
    onFirstTextDelta?: (elapsedMs: number) => void;
    /**
     * Called once per stage boundary: 'preparing' (metadata/路由解析, not yet at
     * the provider) and 'streaming' (provider stream open). A caller that records
     * these can tell afterwards where a stalled call was waiting.
     */
    onPhase?: (phase: string) => void;
}
export interface GenerateOutcome {
    text: string;
    /** The model the backend confirmed, when it confirms one. */
    resolvedModel: string | null;
    usage: {
        inputTokens: number | null;
        outputTokens: number | null;
    } | null;
    /** How the generation ended, so a partial answer is never stored as complete. */
    finish: 'stop' | 'max-tokens' | 'cancelled' | 'error';
    failure: string | null;
    /** Milliseconds from backend dispatch to its terminal result; null if no call began. */
    modelCallMs?: number | null;
    /** Milliseconds to first text delta; null for backends that do not stream text. */
    firstTextDeltaMs?: number | null;
}
export interface GenerationBackend {
    readonly id: string;
    readonly label: string;
    readonly capabilities: BackendCapabilities;
    /** False when the backend is not usable right now; `reason` says why. */
    available(): {
        available: boolean;
        reason?: string;
    };
    listModels(signal: AbortSignal): Promise<BackendModel[]>;
    generate(target: BackendTarget, request: GenerateRequest): Promise<GenerateOutcome>;
}
/**
 * The DSH model routes, via `ctx.llm`.
 *
 * The adapter is resolved through `prepareCall`, so the route that answers the
 * request is the one the capability check saw — a configuration change between
 * the two cannot mix two adapters into one call.
 */
export declare class DshLlmBackend implements GenerationBackend {
    private readonly ctx;
    readonly id = "dsh";
    readonly label = "DSH \u6A21\u578B";
    constructor(ctx: Context);
    get capabilities(): BackendCapabilities;
    available(): {
        available: boolean;
        reason?: string;
    };
    listModels(signal: AbortSignal): Promise<BackendModel[]>;
    /** The reasoning efforts one exact route accepts, for the model picker. */
    resolveReasoningEfforts(model: string, signal?: AbortSignal): Promise<string[]>;
    generate(target: BackendTarget, request: GenerateRequest): Promise<GenerateOutcome>;
}
/** Split a `provider/model` id, or null when the id is not a route. */
export declare function splitRoute(model: string): {
    provider: string;
    model: string;
} | null;
