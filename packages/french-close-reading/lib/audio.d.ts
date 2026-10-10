/**
 * Reading one sentence (or one conjugated form) aloud.
 *
 * This module owns the provider side and nothing else: it validates that the
 * request really is **one immutable source**, turns the provider's bytes into a
 * playable WAV, and classifies every way it can fail. It never touches storage,
 * never decides which take is current, and never queues anything — the
 * controller owns those rules, and the store owns what survives a restart.
 *
 * Two adapters converge on one boundary:
 *
 * - `live` opens the `bidiGenerateContent` WebSocket (setup → setupComplete →
 *   one user turn → audio frames → turnComplete) and streams;
 * - `tts` posts one `generateContent` and reads one inline audio part.
 *
 * Both return the same shape, so the caller cannot tell which one produced the
 * audio except by the `streaming` flag it reports honestly.
 *
 * The text that may be spoken is exactly one sentence or one form. A paragraph
 * title, paragraph body, translation or discussion must never reach a provider,
 * so the input check is the first thing that runs and a refusal happens before
 * any transport exists.
 */
import { z } from 'zod';
/** Why a synthesis the reader asked for did not produce audio. */
export declare const AUDIO_FAILURE_REASONS: readonly ["unconfigured", "unauthorized", "rate-limited", "timeout", "cancelled", "provider-error"];
export type AudioFailureReason = (typeof AUDIO_FAILURE_REASONS)[number];
/**
 * Why the text itself was refused. A separate vocabulary from
 * {@link AudioFailureReason} on purpose: "this is two sentences" is not a
 * provider failure, and reporting it as one would blame the wrong thing.
 */
export declare const AUDIO_INPUT_REJECTIONS: readonly ["blank", "multi-sentence", "too-long", "not-french"];
export type AudioInputRejection = (typeof AUDIO_INPUT_REJECTIONS)[number];
/** Everything `synthesizeSpeech` can refuse with, refusal and failure kept apart. */
export type SpeechRefusalReason = AudioFailureReason | AudioInputRejection;
/** The one error this module throws; `reason` is the classification. */
export declare class AudioSynthesisError extends Error {
    readonly reason: SpeechRefusalReason;
    /** Set when the provider answered: the HTTP status, for the record. */
    readonly httpStatus: number | null;
    constructor(reason: SpeechRefusalReason, message: string, httpStatus?: number | null);
}
/** Whether the reason came from the input or from the provider. */
export declare function isInputRejection(reason: SpeechRefusalReason): reason is AudioInputRejection;
export declare const AUDIO_BACKEND_KINDS: readonly ["live", "tts"];
export type AudioBackendKind = (typeof AUDIO_BACKEND_KINDS)[number];
export declare const DEFAULT_LIVE_MODEL = "gemini-3.8-live";
export declare const DEFAULT_TTS_MODEL = "gemini-2.5-flash-preview-tts";
export declare const DEFAULT_VOICE = "Kore";
export declare const DEFAULT_TIMEOUT_MS = 30000;
export declare const DEFAULT_MAX_CHARACTERS = 400;
/** The one WebSocket route the live model is reachable through. */
export declare const LIVE_ENDPOINT = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";
/** The REST root the non-streaming model is reached through. */
export declare const TTS_ENDPOINT_ROOT = "https://generativelanguage.googleapis.com/v1beta/models";
/**
 * The audio configuration, as the plugin's own `config.audio` section.
 *
 * Every field carries its default, so a partial or empty section still yields a
 * complete config and only the key decides whether anything can be requested.
 * The key is read from here or from `GEMINI_API_KEY`, and is never written to a
 * record, a log, an error message or the wire.
 */
export declare const SentenceAudioConfigSchema: z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    backend: z.ZodDefault<z.ZodEnum<{
        live: "live";
        tts: "tts";
    }>>;
    apiKey: z.ZodDefault<z.ZodString>;
    liveModel: z.ZodDefault<z.ZodString>;
    ttsModel: z.ZodDefault<z.ZodString>;
    voice: z.ZodDefault<z.ZodString>;
    rate: z.ZodDefault<z.ZodNumber>;
    timeoutMs: z.ZodDefault<z.ZodNumber>;
    maxCharacters: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export type SentenceAudioConfig = z.infer<typeof SentenceAudioConfigSchema>;
/** The provider target one take was produced by, recorded as itself. */
export interface SpeechBackend {
    kind: AudioBackendKind;
    providerId: string;
    modelId: string;
}
export declare const AUDIO_PROVIDER_ID = "google";
/**
 * Why audio is not available, as its own answer.
 *
 * A control that cannot synthesize must say so instead of claiming it is
 * queued, generating or ready, so "unconfigured" is a result and never an
 * exception with no classification.
 */
export type AudioConfiguration = {
    state: 'unconfigured';
    reason: 'disabled' | 'no-api-key' | 'invalid-config' | 'transport-unavailable';
    detail: string;
} | {
    state: 'configured';
    config: SentenceAudioConfig;
    backend: SpeechBackend;
    apiKey: string;
};
interface EnvLike {
    GEMINI_API_KEY?: string | undefined;
}
/**
 * Read one `audio` config section and decide whether anything may be requested.
 *
 * A malformed section is `invalid-config` rather than a silent fallback to
 * defaults: a typo in a model id or a negative timeout must not quietly turn
 * into a request against a model nobody chose.
 */
export declare function resolveAudioConfiguration(raw: unknown, options?: {
    env?: EnvLike;
    webSocketAvailable?: boolean;
}): AudioConfiguration;
/** What a backend can do, so a control only offers what really exists. */
export declare function audioCapabilities(backend: SpeechBackend): {
    streaming: boolean;
    cancellation: boolean;
};
/** One sentence, or one form: the text, and nothing around it. */
export interface SpeechSynthesisTarget {
    kind: 'sentence' | 'inflection';
    text: string;
    language: string;
}
export interface SpeechSynthesisResult {
    mimeType: string;
    bytes: Uint8Array;
    durationMs: number;
    modelId: string;
    streaming: boolean;
}
export interface AudioTransports {
    /** Injected by tests; production uses the global fetch. */
    fetch?: typeof globalThis.fetch;
    /** Injected by tests; production uses the global WebSocket. */
    webSocket?: WebSocketFactory;
    /** Injected by tests; production reads the process environment. */
    env?: EnvLike;
}
/** One sentence or one form, checked before any transport exists. */
export type SpeechTextVerdict = {
    ok: true;
    text: string;
} | {
    ok: false;
    reason: AudioInputRejection;
    message: string;
};
/** One sentence, within the configured length, or the reason it is refused. */
export declare function checkSentenceText(text: string, maxCharacters: number): SpeechTextVerdict;
/**
 * One form, spoken as real French.
 *
 * The contract's rule is explicit: the utterance is actual French, never IPA
 * and never slash-separated alternatives. Both are refused here rather than
 * being sent to a provider that would read the notation out.
 */
export declare function checkUtterance(utterance: string, maxCharacters: number): SpeechTextVerdict;
/** The check the target's kind calls for. */
export declare function checkSpeechText(target: SpeechSynthesisTarget, maxCharacters: number): SpeechTextVerdict;
/** A 44-byte RIFF/WAVE header in front of 16-bit little-endian PCM. */
export declare function pcmToWav(pcm: Uint8Array, options: {
    sampleRate: number;
    channels?: number;
}): Uint8Array;
/**
 * The sample rate a provider stated, or the rate the live route uses.
 *
 * The rate is read from the mime type the provider sent (`audio/L16;codec=pcm;rate=24000`,
 * `audio/pcm;rate=24000`) instead of assumed, because a WAV header written at
 * the wrong rate plays at the wrong speed.
 */
export declare function sampleRateFromMime(mimeType: string, fallback?: number): number;
/** Whether the bytes already are a RIFF/WAVE file. */
export declare function isWav(bytes: Uint8Array): boolean;
/** The duration of a WAV file, read from its own header. */
export declare function wavDurationMs(bytes: Uint8Array): number;
/** The duration of raw PCM, from the rate the provider stated. */
export declare function pcmDurationMs(bytes: number, sampleRate: number, channels?: number): number;
/** One provider answer, as playable bytes: wrapped only when it is raw PCM. */
export declare function toPlayableAudio(data: Uint8Array, mimeType: string): {
    mimeType: string;
    bytes: Uint8Array;
    durationMs: number;
};
/** Encode bytes without relying on a binary string, so large audio is safe. */
export declare function bytesToBase64(bytes: Uint8Array): string;
/** Decode provider base64. An unusable payload is a provider error, not audio. */
export declare function base64ToBytes(value: string): Uint8Array;
/** The frame source of one live session, kept structurally minimal for tests. */
export interface AudioSocket {
    send(data: string): void;
    close(): void;
    /**
     * The frame encoding a real socket uses for inbound data. Set to `arraybuffer`
     * when supported so the decode path is deterministic instead of Blob-shaped.
     */
    binaryType?: string;
    addEventListener(type: 'open' | 'message' | 'error' | 'close', listener: (event: {
        data?: unknown;
    }) => void): void;
    removeEventListener?(type: 'open' | 'message' | 'error' | 'close', listener: (event: {
        data?: unknown;
    }) => void): void;
}
export type WebSocketFactory = (url: string) => AudioSocket;
/**
 * One inbound frame as text.
 *
 * A real Gemini Live socket does **not** deliver JSON as a string: frames arrive
 * as `Blob` (or `ArrayBuffer`), so a decoder that only accepts strings silently
 * drops every frame of a working session — the connection opens, the setup is
 * accepted, and the request then sits until it times out. Found against the live
 * endpoint; the scripted socket in the tests had always sent strings.
 */
export declare function decodeSocketFrame(data: unknown): Promise<string>;
/** The WebSocket URL for one live request; the key travels in the query, as the route requires. */
export declare function liveEndpointUrl(modelId: string, apiKey: string): string;
/** The REST URL for one non-streaming request; the key travels in a header, not the URL. */
export declare function ttsEndpointUrl(modelId: string): string;
/** The frames one live session sends, in the order the route requires. */
export declare function liveSetupFrame(backend: SpeechBackend, voice: string): unknown;
export declare function liveContentFrame(text: string): unknown;
/** The body a non-streaming request posts: the sentence and no instruction around it. */
export declare function ttsRequestBody(text: string, voice: string): unknown;
/** Read one audio part out of a `generateContent` response, or say why there is none. */
export declare function readTtsInlineAudio(payload: unknown): {
    data: string;
    mimeType: string;
};
/**
 * Synthesize one sentence or one form, and return playable audio.
 *
 * Resolves to WAV bytes and their measured duration, or throws
 * {@link AudioSynthesisError} with its classification. Input is checked first:
 * a blank, multi-sentence or over-long source is refused before any transport,
 * so nothing is ever sent for text that is not one immutable source.
 */
export declare function synthesizeSpeech(target: SpeechSynthesisTarget, configuration: {
    config: SentenceAudioConfig;
    backend: SpeechBackend;
    apiKey: string;
}, signal: AbortSignal, deps?: AudioTransports): Promise<SpeechSynthesisResult>;
export {};
