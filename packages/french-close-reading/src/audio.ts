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
import { z } from 'zod'

/** Why a synthesis the reader asked for did not produce audio. */
export const AUDIO_FAILURE_REASONS = [
  'unconfigured',
  'unauthorized',
  'rate-limited',
  'timeout',
  'cancelled',
  'provider-error',
] as const

export type AudioFailureReason = (typeof AUDIO_FAILURE_REASONS)[number]

/**
 * Why the text itself was refused. A separate vocabulary from
 * {@link AudioFailureReason} on purpose: "this is two sentences" is not a
 * provider failure, and reporting it as one would blame the wrong thing.
 */
export const AUDIO_INPUT_REJECTIONS = ['blank', 'multi-sentence', 'too-long', 'not-french'] as const

export type AudioInputRejection = (typeof AUDIO_INPUT_REJECTIONS)[number]

/** Everything `synthesizeSpeech` can refuse with, refusal and failure kept apart. */
export type SpeechRefusalReason = AudioFailureReason | AudioInputRejection

/** The one error this module throws; `reason` is the classification. */
export class AudioSynthesisError extends Error {
  readonly reason: SpeechRefusalReason
  /** Set when the provider answered: the HTTP status, for the record. */
  readonly httpStatus: number | null

  constructor(reason: SpeechRefusalReason, message: string, httpStatus: number | null = null) {
    super(message)
    this.name = 'AudioSynthesisError'
    this.reason = reason
    this.httpStatus = httpStatus
  }
}

/** Whether the reason came from the input or from the provider. */
export function isInputRejection(reason: SpeechRefusalReason): reason is AudioInputRejection {
  return (AUDIO_INPUT_REJECTIONS as readonly string[]).includes(reason)
}

export const AUDIO_BACKEND_KINDS = ['live', 'tts'] as const
export type AudioBackendKind = (typeof AUDIO_BACKEND_KINDS)[number]

export const DEFAULT_LIVE_MODEL = 'gemini-3.8-live'
export const DEFAULT_TTS_MODEL = 'gemini-2.5-flash-preview-tts'
export const DEFAULT_VOICE = 'Kore'
export const DEFAULT_TIMEOUT_MS = 30_000
export const DEFAULT_MAX_CHARACTERS = 400

/** The one WebSocket route the live model is reachable through. */
export const LIVE_ENDPOINT =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'
/** The REST root the non-streaming model is reached through. */
export const TTS_ENDPOINT_ROOT = 'https://generativelanguage.googleapis.com/v1beta/models'

/**
 * A neutral system instruction for the live model. It deliberately does **not**
 * contain the sentence: the sentence travels in its own user turn, so no model
 * can read the instruction back as text and no reading instruction is ever
 * treated as content.
 */
const LIVE_SYSTEM_INSTRUCTION = 'Speak the user text aloud in the given language. Do not add words.'

/**
 * The audio configuration, as the plugin's own `config.audio` section.
 *
 * Every field carries its default, so a partial or empty section still yields a
 * complete config and only the key decides whether anything can be requested.
 * The key is read from here or from `GEMINI_API_KEY`, and is never written to a
 * record, a log, an error message or the wire.
 */
export const SentenceAudioConfigSchema = z.object({
  enabled: z.boolean().default(true),
  backend: z.enum(AUDIO_BACKEND_KINDS).default('live'),
  /** Never logged, never stored, never returned. */
  apiKey: z.string().max(400).default(''),
  liveModel: z.string().min(1).max(160).default(DEFAULT_LIVE_MODEL),
  ttsModel: z.string().min(1).max(160).default(DEFAULT_TTS_MODEL),
  voice: z.string().min(1).max(80).default(DEFAULT_VOICE),
  /** Playback speed for the client; it is part of a take's identity, not a request field. */
  rate: z.number().min(0.25).max(4).default(1),
  timeoutMs: z.number().int().min(1_000).max(600_000).default(DEFAULT_TIMEOUT_MS),
  maxCharacters: z.number().int().min(1).max(4_000).default(DEFAULT_MAX_CHARACTERS),
})

export type SentenceAudioConfig = z.infer<typeof SentenceAudioConfigSchema>

/** The provider target one take was produced by, recorded as itself. */
export interface SpeechBackend {
  kind: AudioBackendKind
  providerId: string
  modelId: string
}

export const AUDIO_PROVIDER_ID = 'google'

/**
 * Why audio is not available, as its own answer.
 *
 * A control that cannot synthesize must say so instead of claiming it is
 * queued, generating or ready, so "unconfigured" is a result and never an
 * exception with no classification.
 */
export type AudioConfiguration =
  | { state: 'unconfigured'; reason: 'disabled' | 'no-api-key' | 'invalid-config' | 'transport-unavailable'; detail: string }
  | { state: 'configured'; config: SentenceAudioConfig; backend: SpeechBackend; apiKey: string }

interface EnvLike {
  GEMINI_API_KEY?: string | undefined
}

/** The process environment, read without assuming a Node type surface. */
function defaultEnv(): EnvLike {
  const host = globalThis as { process?: { env?: Record<string, string | undefined> } }
  return host.process?.env ?? {}
}

/**
 * Read one `audio` config section and decide whether anything may be requested.
 *
 * A malformed section is `invalid-config` rather than a silent fallback to
 * defaults: a typo in a model id or a negative timeout must not quietly turn
 * into a request against a model nobody chose.
 */
export function resolveAudioConfiguration(
  raw: unknown,
  options: { env?: EnvLike; webSocketAvailable?: boolean } = {},
): AudioConfiguration {
  const parsed = SentenceAudioConfigSchema.safeParse(raw ?? {})
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      state: 'unconfigured',
      reason: 'invalid-config',
      detail: issue === undefined ? '音频配置无效' : `${issue.path.join('.')}: ${issue.message}`,
    }
  }
  const config = parsed.data
  if (!config.enabled) {
    return { state: 'unconfigured', reason: 'disabled', detail: '音频功能已关闭' }
  }
  const configuredKey = config.apiKey.trim()
  const envKey = (options.env ?? defaultEnv()).GEMINI_API_KEY?.trim() ?? ''
  const apiKey = configuredKey !== '' ? configuredKey : envKey
  if (apiKey === '') {
    return { state: 'unconfigured', reason: 'no-api-key', detail: '未配置音频密钥（config.audio.apiKey 或 GEMINI_API_KEY）' }
  }
  if (config.backend === 'live' && options.webSocketAvailable === false) {
    // The live adapter is the only one that needs a socket; without one the
    // honest answer is "not configured here", not a provider failure.
    return { state: 'unconfigured', reason: 'transport-unavailable', detail: '当前 Host 没有 WebSocket 传输' }
  }
  const modelId = config.backend === 'live' ? config.liveModel : config.ttsModel
  return {
    state: 'configured',
    config,
    apiKey,
    backend: { kind: config.backend, providerId: AUDIO_PROVIDER_ID, modelId },
  }
}

/** What a backend can do, so a control only offers what really exists. */
export function audioCapabilities(backend: SpeechBackend): { streaming: boolean; cancellation: boolean } {
  return backend.kind === 'live'
    ? { streaming: true, cancellation: true }
    : { streaming: false, cancellation: true }
}

/** One sentence, or one form: the text, and nothing around it. */
export interface SpeechSynthesisTarget {
  kind: 'sentence' | 'inflection'
  text: string
  language: string
}

export interface SpeechSynthesisResult {
  mimeType: string
  bytes: Uint8Array
  durationMs: number
  modelId: string
  streaming: boolean
}

export interface AudioTransports {
  /** Injected by tests; production uses the global fetch. */
  fetch?: typeof globalThis.fetch
  /** Injected by tests; production uses the global WebSocket. */
  webSocket?: WebSocketFactory
  /** Injected by tests; production reads the process environment. */
  env?: EnvLike
}

/* ------------------------------------------------------------------ input --- */

/** How a sentence ends. An ellipsis is a sentence end like any other. */
const SENTENCE_ENDS = new Set(['.', '!', '?', '…'])

/**
 * Abbreviations whose full stop does not end a sentence. Without this list
 * `M. Dupont arrive.` is refused as two sentences, which is a false refusal of
 * exactly the kind a real paragraph produces.
 */
const ABBREVIATIONS = new Set([
  'm', 'mm', 'mme', 'mmes', 'mlle', 'mlles', 'dr', 'pr', 'st', 'ste', 'mr', 'mrs',
  'cf', 'etc', 'p', 'pp', 'vol', 'chap', 'no', 'nos', 'ed', 'trad', 'av', 'apr',
  'env', 'ex', 'ibid', 'op', 'cit', 'ca', 'c.-a-d', 'j.-c',
])

/**
 * Characters and marks that may follow a sentence end without being a word:
 * quotes, brackets, dashes, spaces. Everything else after the end means a
 * second sentence is present.
 */
const NOT_A_WORD = /[\s\p{P}\p{S}]/u

/** One sentence or one form, checked before any transport exists. */
export type SpeechTextVerdict =
  | { ok: true; text: string }
  | { ok: false; reason: AudioInputRejection; message: string }

/**
 * The first position whose full stop, exclamation or question mark ends the
 * sentence, or -1 when the text ends without one.
 */
function sentenceEndAt(text: string): number {
  for (let at = 0; at < text.length; at += 1) {
    const character = text[at]!
    if (!SENTENCE_ENDS.has(character)) continue
    if (character !== '.') return at
    // An ellipsis run (`...`) is one end, reported at its first dot.
    const word = /([\p{L}\p{M}.'’-]*)$/u.exec(text.slice(0, at))?.[1] ?? ''
    const bare = word.toLowerCase().replace(/\.+$/u, '')
    if (bare.length === 1 && /\p{Lu}/u.test(word.slice(0, 1))) continue // an initial: J. Dupont
    if (ABBREVIATIONS.has(bare)) continue
    return at
  }
  return -1
}

/** True when anything that could be a word follows the sentence end. */
function hasWordsAfter(text: string, end: number): boolean {
  for (const character of text.slice(end + 1)) {
    if (!NOT_A_WORD.test(character)) return true
  }
  return false
}

/** One sentence, within the configured length, or the reason it is refused. */
export function checkSentenceText(text: string, maxCharacters: number): SpeechTextVerdict {
  const trimmed = text.trim()
  if (trimmed === '') {
    return { ok: false, reason: 'blank', message: '没有可朗读的句子' }
  }
  const characters = [...trimmed].length
  if (characters > maxCharacters) {
    return {
      ok: false,
      reason: 'too-long',
      message: `句子超过 ${String(maxCharacters)} 个字符（${String(characters)} 个），未发送请求`,
    }
  }
  const end = sentenceEndAt(trimmed)
  if (end !== -1 && hasWordsAfter(trimmed, end)) {
    return { ok: false, reason: 'multi-sentence', message: '一次只合成一句：句末标点之后还有内容' }
  }
  return { ok: true, text: trimmed }
}

/** Marks that only appear in a phonetic transcription, never in French prose. */
const IPA_ONLY = /[ˈˌɡɛɔʃʒʁɲŋøɑɒθðæʏɪʊəɐʕʔʰʲʷˑ̃͡ɥɯɞɶʀχ]/u

/** French letters or digits: what must appear somewhere in a real utterance. */
const REAL_LETTER = /[\p{L}\p{N}]/u

/**
 * One form, spoken as real French.
 *
 * The contract's rule is explicit: the utterance is actual French, never IPA
 * and never slash-separated alternatives. Both are refused here rather than
 * being sent to a provider that would read the notation out.
 */
export function checkUtterance(utterance: string, maxCharacters: number): SpeechTextVerdict {
  const trimmed = utterance.trim()
  if (trimmed === '') {
    return { ok: false, reason: 'blank', message: '没有可朗读的形式' }
  }
  const characters = [...trimmed].length
  if (characters > maxCharacters) {
    return {
      ok: false,
      reason: 'too-long',
      message: `形式超过 ${String(maxCharacters)} 个字符（${String(characters)} 个），未发送请求`,
    }
  }
  if (trimmed.includes('/') || trimmed.includes('|') || trimmed.includes('\\')) {
    return { ok: false, reason: 'not-french', message: '不能朗读斜杠并列或音标写法，请给出真实法语形式' }
  }
  if (IPA_ONLY.test(trimmed)) {
    return { ok: false, reason: 'not-french', message: '不能朗读国际音标，请给出真实法语形式' }
  }
  if (!REAL_LETTER.test(trimmed)) {
    return { ok: false, reason: 'not-french', message: '这一串字符不是可朗读的法语形式' }
  }
  const end = sentenceEndAt(trimmed)
  if (end !== -1 && hasWordsAfter(trimmed, end)) {
    return { ok: false, reason: 'multi-sentence', message: '一次只合成一个形式：句末标点之后还有内容' }
  }
  return { ok: true, text: trimmed }
}

/** The check the target's kind calls for. */
export function checkSpeechText(target: SpeechSynthesisTarget, maxCharacters: number): SpeechTextVerdict {
  return target.kind === 'sentence'
    ? checkSentenceText(target.text, maxCharacters)
    : checkUtterance(target.text, maxCharacters)
}

/* ------------------------------------------------------------------- wav --- */

const WAV_HEADER_BYTES = 44

/** A 44-byte RIFF/WAVE header in front of 16-bit little-endian PCM. */
export function pcmToWav(pcm: Uint8Array, options: { sampleRate: number; channels?: number }): Uint8Array {
  const channels = options.channels ?? 1
  const sampleRate = options.sampleRate
  const bitsPerSample = 16
  const blockAlign = (channels * bitsPerSample) / 8
  const byteRate = sampleRate * blockAlign
  const wav = new Uint8Array(WAV_HEADER_BYTES + pcm.length)
  const view = new DataView(wav.buffer)
  const ascii = (offset: number, text: string): void => {
    for (let at = 0; at < text.length; at += 1) wav[offset + at] = text.charCodeAt(at)
  }
  ascii(0, 'RIFF')
  view.setUint32(4, 36 + pcm.length, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)
  ascii(36, 'data')
  view.setUint32(40, pcm.length, true)
  wav.set(pcm, WAV_HEADER_BYTES)
  return wav
}

/**
 * The sample rate a provider stated, or the rate the live route uses.
 *
 * The rate is read from the mime type the provider sent (`audio/L16;codec=pcm;rate=24000`,
 * `audio/pcm;rate=24000`) instead of assumed, because a WAV header written at
 * the wrong rate plays at the wrong speed.
 */
export function sampleRateFromMime(mimeType: string, fallback = 24_000): number {
  const match = /rate=(\d+)/u.exec(mimeType)
  if (match === null) return fallback
  const rate = Number.parseInt(match[1]!, 10)
  return Number.isFinite(rate) && rate > 0 ? rate : fallback
}

/** Whether the bytes already are a RIFF/WAVE file. */
export function isWav(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false
  return bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45
}

/** The duration of a WAV file, read from its own header. */
export function wavDurationMs(bytes: Uint8Array): number {
  if (!isWav(bytes) || bytes.length < WAV_HEADER_BYTES) return 0
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const channels = view.getUint16(22, true) || 1
  const sampleRate = view.getUint32(24, true) || 24_000
  const bitsPerSample = view.getUint16(34, true) || 16
  const dataBytes = Math.max(0, bytes.length - WAV_HEADER_BYTES)
  const perSecond = sampleRate * channels * (bitsPerSample / 8)
  if (perSecond <= 0) return 0
  return Math.round((dataBytes / perSecond) * 1000)
}

/** The duration of raw PCM, from the rate the provider stated. */
export function pcmDurationMs(bytes: number, sampleRate: number, channels = 1): number {
  const perSecond = sampleRate * channels * 2
  if (perSecond <= 0) return 0
  return Math.round((bytes / perSecond) * 1000)
}

/** One provider answer, as playable bytes: wrapped only when it is raw PCM. */
export function toPlayableAudio(
  data: Uint8Array,
  mimeType: string,
): { mimeType: string; bytes: Uint8Array; durationMs: number } {
  if (isWav(data) || /audio\/(x-)?wav/iu.test(mimeType)) {
    return { mimeType: 'audio/wav', bytes: data, durationMs: wavDurationMs(data) }
  }
  const sampleRate = sampleRateFromMime(mimeType)
  const wav = pcmToWav(data, { sampleRate })
  return { mimeType: 'audio/wav', bytes: wav, durationMs: pcmDurationMs(data.length, sampleRate) }
}

/* ---------------------------------------------------------------- base64 --- */

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Encode bytes without relying on a binary string, so large audio is safe. */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = ''
  for (let at = 0; at < bytes.length; at += 3) {
    const first = bytes[at]!
    const second = at + 1 < bytes.length ? bytes[at + 1]! : 0
    const third = at + 2 < bytes.length ? bytes[at + 2]! : 0
    out += BASE64_ALPHABET[first >> 2]!
    out += BASE64_ALPHABET[((first & 0x03) << 4) | (second >> 4)]!
    out += at + 1 < bytes.length ? BASE64_ALPHABET[((second & 0x0f) << 2) | (third >> 6)]! : '='
    out += at + 2 < bytes.length ? BASE64_ALPHABET[third & 0x3f]! : '='
  }
  return out
}

const BASE64_INDEX = (() => {
  const table = new Int16Array(128).fill(-1)
  for (let at = 0; at < BASE64_ALPHABET.length; at += 1) table[BASE64_ALPHABET.charCodeAt(at)] = at
  return table
})()

/** Decode provider base64. An unusable payload is a provider error, not audio. */
export function base64ToBytes(value: string): Uint8Array {
  const cleaned = value.replace(/[\s]/gu, '')
  const padding = cleaned.endsWith('==') ? 2 : cleaned.endsWith('=') ? 1 : 0
  const usable = cleaned.length - padding
  const bytes = new Uint8Array(Math.floor((usable * 6) / 8))
  let accumulator = 0
  let bits = 0
  let written = 0
  for (let at = 0; at < usable; at += 1) {
    const code = cleaned.charCodeAt(at)
    const index = code < 128 ? BASE64_INDEX[code]! : -1
    if (index < 0) throw new AudioSynthesisError('provider-error', '提供方返回的音频不是有效的 base64')
    accumulator = (accumulator << 6) | index
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes[written] = (accumulator >> bits) & 0xff
      written += 1
    }
  }
  return written === bytes.length ? bytes : bytes.slice(0, written)
}

/* ------------------------------------------------------------- transports --- */

/** The frame source of one live session, kept structurally minimal for tests. */
export interface AudioSocket {
  send(data: string): void
  close(): void
  /**
   * The frame encoding a real socket uses for inbound data. Set to `arraybuffer`
   * when supported so the decode path is deterministic instead of Blob-shaped.
   */
  binaryType?: string
  addEventListener(type: 'open' | 'message' | 'error' | 'close', listener: (event: { data?: unknown }) => void): void
  removeEventListener?(type: 'open' | 'message' | 'error' | 'close', listener: (event: { data?: unknown }) => void): void
}

export type WebSocketFactory = (url: string) => AudioSocket

function defaultWebSocketFactory(url: string): AudioSocket {
  const Ctor = (globalThis as { WebSocket?: new (url: string) => unknown }).WebSocket
  if (Ctor === undefined) {
    throw new AudioSynthesisError('unconfigured', '当前 Host 没有 WebSocket 传输')
  }
  const socket = new Ctor(url) as AudioSocket
  try {
    socket.binaryType = 'arraybuffer'
  } catch {
    // A test double may expose `binaryType` as read-only; the decoder handles
    // Blob frames anyway, so this is an optimisation and never a requirement.
  }
  return socket
}

/**
 * One inbound frame as text.
 *
 * A real Gemini Live socket does **not** deliver JSON as a string: frames arrive
 * as `Blob` (or `ArrayBuffer`), so a decoder that only accepts strings silently
 * drops every frame of a working session — the connection opens, the setup is
 * accepted, and the request then sits until it times out. Found against the live
 * endpoint; the scripted socket in the tests had always sent strings.
 */
export async function decodeSocketFrame(data: unknown): Promise<string> {
  if (typeof data === 'string') return data
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(data))
  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView
    return new TextDecoder().decode(new Uint8Array(view.buffer, view.byteOffset, view.byteLength))
  }
  const blob = data as { text?: () => Promise<string> } | null | undefined
  if (blob !== null && blob !== undefined && typeof blob.text === 'function') return await blob.text()
  return ''
}

/** The WebSocket URL for one live request; the key travels in the query, as the route requires. */
export function liveEndpointUrl(modelId: string, apiKey: string): string {
  return `${LIVE_ENDPOINT}?key=${encodeURIComponent(apiKey)}`
}

/** The REST URL for one non-streaming request; the key travels in a header, not the URL. */
export function ttsEndpointUrl(modelId: string): string {
  return `${TTS_ENDPOINT_ROOT}/${encodeURIComponent(modelId)}:generateContent`
}

/**
 * Link the caller's signal with a wall-clock budget.
 *
 * The two are kept apart because they mean different things: the reader
 * cancelling is `cancelled`, and a provider that never answered is `timeout`.
 */
function withTimeout(signal: AbortSignal, timeoutMs: number): {
  signal: AbortSignal
  dispose: () => void
  reason: () => 'cancelled' | 'timeout' | null
} {
  const controller = new AbortController()
  let failure: 'cancelled' | 'timeout' | null = null
  const onAbort = (): void => {
    failure ??= 'cancelled'
    controller.abort()
  }
  const timer = setTimeout(() => {
    failure ??= 'timeout'
    controller.abort()
  }, timeoutMs)
  if (signal.aborted) onAbort()
  else signal.addEventListener('abort', onAbort, { once: true })
  return {
    signal: controller.signal,
    reason: () => failure,
    dispose: () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
    },
  }
}

function assertNotAborted(link: { reason: () => 'cancelled' | 'timeout' | null }): void {
  const reason = link.reason()
  if (reason === 'timeout') throw new AudioSynthesisError('timeout', '音频合成超时，已停止等待')
  if (reason === 'cancelled') throw new AudioSynthesisError('cancelled', '音频合成已取消')
}

/* --------------------------------------------------------------- adapters --- */

/** The frames one live session sends, in the order the route requires. */
export function liveSetupFrame(backend: SpeechBackend, voice: string): unknown {
  return {
    setup: {
      model: backend.modelId.startsWith('models/') ? backend.modelId : `models/${backend.modelId}`,
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      },
      systemInstruction: { parts: [{ text: LIVE_SYSTEM_INSTRUCTION }] },
    },
  }
}

export function liveContentFrame(text: string): unknown {
  return { clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true } }
}

/** The body a non-streaming request posts: the sentence and no instruction around it. */
export function ttsRequestBody(text: string, voice: string): unknown {
  return {
    contents: [{ role: 'user', parts: [{ text }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    },
  }
}

/** Read one audio part out of a `generateContent` response, or say why there is none. */
export function readTtsInlineAudio(payload: unknown): { data: string; mimeType: string } {
  const candidates = (payload as { candidates?: unknown }).candidates
  if (Array.isArray(candidates)) {
    for (const candidate of candidates) {
      const parts = (candidate as { content?: { parts?: unknown } }).content?.parts
      if (!Array.isArray(parts)) continue
      for (const part of parts) {
        const inline = (part as { inlineData?: { data?: unknown; mimeType?: unknown } }).inlineData
        if (typeof inline?.data === 'string' && inline.data !== '') {
          return { data: inline.data, mimeType: typeof inline.mimeType === 'string' ? inline.mimeType : 'audio/pcm;rate=24000' }
        }
      }
    }
  }
  const blocked = (payload as { promptFeedback?: { blockReason?: unknown } }).promptFeedback?.blockReason
  const finish = (candidates as { finishReason?: unknown }[] | undefined)?.[0]?.finishReason
  const detail = typeof blocked === 'string' ? `blocked: ${blocked}` : typeof finish === 'string' ? `finishReason: ${finish}` : 'no audio part'
  throw new AudioSynthesisError('provider-error', `提供方没有返回音频（${detail}）`)
}

/** One non-streaming request: one POST, one inline audio part. */
async function synthesizeWithTts(
  text: string,
  config: SentenceAudioConfig,
  backend: SpeechBackend,
  apiKey: string,
  link: { signal: AbortSignal; reason: () => 'cancelled' | 'timeout' | null },
  deps: AudioTransports,
): Promise<SpeechSynthesisResult> {
  const doFetch = deps.fetch ?? globalThis.fetch
  let response: Response
  try {
    response = await doFetch(ttsEndpointUrl(backend.modelId), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(ttsRequestBody(text, config.voice)),
      signal: link.signal,
    })
  } catch (error) {
    assertNotAborted(link)
    if (error instanceof AudioSynthesisError) throw error
    throw new AudioSynthesisError('provider-error', `音频请求失败：${String(error)}`.slice(0, 200))
  }
  if (!response.ok) {
    const body = await safeText(response)
    throw new AudioSynthesisError(classifyHttpStatus(response.status), describeHttp(response.status, body), response.status)
  }
  let payload: unknown
  try {
    payload = await response.json()
  } catch (error) {
    assertNotAborted(link)
    throw new AudioSynthesisError('provider-error', `音频响应不是 JSON：${String(error)}`.slice(0, 200))
  }
  const inline = readTtsInlineAudio(payload)
  const audio = toPlayableAudio(base64ToBytes(inline.data), inline.mimeType)
  return { ...audio, modelId: backend.modelId, streaming: false }
}

/**
 * One streaming session: setup, one user turn, then the audio frames until the
 * provider says the turn is complete. Frames that carry no audio — session
 * resumption updates and the like — are ignored rather than treated as answers.
 */
async function synthesizeWithLive(
  text: string,
  config: SentenceAudioConfig,
  backend: SpeechBackend,
  apiKey: string,
  link: { signal: AbortSignal; reason: () => 'cancelled' | 'timeout' | null },
  deps: AudioTransports,
): Promise<SpeechSynthesisResult> {
  const factory = deps.webSocket ?? defaultWebSocketFactory
  let socket: AudioSocket
  try {
    socket = factory(liveEndpointUrl(backend.modelId, apiKey))
  } catch (error) {
    assertNotAborted(link)
    if (error instanceof AudioSynthesisError) throw error
    throw new AudioSynthesisError('provider-error', `无法打开音频连接：${String(error)}`.slice(0, 200))
  }

  const chunks: Uint8Array[] = []
  let mimeType = 'audio/pcm;rate=24000'
  let sentContent = false
  let closed = false

  const opened = new Promise<void>((resolve, reject) => {
    const close = (): void => {
      if (closed) return
      closed = true
      try {
        socket.close()
      } catch {
        // A socket that is already gone is not a failure of this request.
      }
    }
    const onAbort = (): void => {
      close()
      reject(new AudioSynthesisError(link.reason() === 'timeout' ? 'timeout' : 'cancelled',
        link.reason() === 'timeout' ? '音频合成超时，已停止等待' : '音频合成已取消'))
    }
    if (link.signal.aborted) {
      onAbort()
      return
    }
    link.signal.addEventListener('abort', onAbort, { once: true })
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify(liveSetupFrame(backend, config.voice)))
    })
    // Frames are decoded in arrival order: a slow Blob read must not let a later
    // `turnComplete` overtake the audio that preceded it.
    let queue: Promise<void> = Promise.resolve()
    const onFrame = (data: unknown): void => {
      queue = queue.then(async () => {
        const raw = await decodeSocketFrame(data)
        if (raw === '') return
        let frame: Record<string, unknown>
        try {
          frame = JSON.parse(raw) as Record<string, unknown>
        } catch {
          return // A frame we cannot read is not audio; the turn end is what settles it.
        }
        if (frame.setupComplete !== undefined && !sentContent) {
          sentContent = true
          socket.send(JSON.stringify(liveContentFrame(text)))
          return
        }
        const serverContent = frame.serverContent as
          | { modelTurn?: { parts?: unknown }, turnComplete?: unknown }
          | undefined
        const parts = serverContent?.modelTurn?.parts
        if (Array.isArray(parts)) {
          for (const part of parts) {
            const inline = (part as { inlineData?: { data?: unknown; mimeType?: unknown } }).inlineData
            if (typeof inline?.data !== 'string' || inline.data === '') continue
            if (typeof inline.mimeType === 'string' && inline.mimeType !== '') mimeType = inline.mimeType
            chunks.push(base64ToBytes(inline.data))
          }
        }
        if (serverContent?.turnComplete === true) {
          close()
          resolve()
        }
      }).catch(() => {
        // A malformed frame is not a reason to fail the session: the turn end or
        // the timeout still settles it.
      })
    }
    socket.addEventListener('message', (event) => { onFrame(event.data) })
    socket.addEventListener('error', () => {
      close()
      reject(new AudioSynthesisError(
        link.reason() === 'timeout' ? 'timeout' : link.reason() === 'cancelled' ? 'cancelled' : 'provider-error',
        '音频连接报错',
      ))
    })
    socket.addEventListener('close', () => {
      if (link.signal.aborted) {
        onAbort()
        return
      }
      reject(new AudioSynthesisError('provider-error', '音频连接在完成前关闭'))
    })
  })

  await opened
  if (chunks.length === 0) {
    throw new AudioSynthesisError('provider-error', '音频连接完成但没有音频数据')
  }
  const merged = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0))
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.length
  }
  const audio = toPlayableAudio(merged, mimeType)
  return { ...audio, modelId: backend.modelId, streaming: true }
}

function classifyHttpStatus(status: number): AudioFailureReason {
  if (status === 401 || status === 403) return 'unauthorized'
  if (status === 429) return 'rate-limited'
  return 'provider-error'
}

function describeHttp(status: number, body: string): string {
  const detail = body.replace(/\s+/gu, ' ').slice(0, 200)
  return `音频提供方返回 HTTP ${String(status)}${detail === '' ? '' : `：${detail}`}`
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text()
  } catch {
    return ''
  }
}

/**
 * Synthesize one sentence or one form, and return playable audio.
 *
 * Resolves to WAV bytes and their measured duration, or throws
 * {@link AudioSynthesisError} with its classification. Input is checked first:
 * a blank, multi-sentence or over-long source is refused before any transport,
 * so nothing is ever sent for text that is not one immutable source.
 */
export async function synthesizeSpeech(
  target: SpeechSynthesisTarget,
  configuration: { config: SentenceAudioConfig; backend: SpeechBackend; apiKey: string },
  signal: AbortSignal,
  deps: AudioTransports = {},
): Promise<SpeechSynthesisResult> {
  const { config, backend, apiKey } = configuration
  const verdict = checkSpeechText(target, config.maxCharacters)
  if (!verdict.ok) throw new AudioSynthesisError(verdict.reason, verdict.message)

  const link = withTimeout(signal, config.timeoutMs)
  try {
    assertNotAborted(link)
    const result = backend.kind === 'live'
      ? await synthesizeWithLive(verdict.text, config, backend, apiKey, link, deps)
      : await synthesizeWithTts(verdict.text, config, backend, apiKey, link, deps)
    return result
  } finally {
    link.dispose()
  }
}
