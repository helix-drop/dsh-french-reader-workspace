/**
 * Offline transports for the audio tests.
 *
 * Both providers are scripted, so an audio test never opens a socket, never
 * sends a request and never needs a key: `test-key` below is a placeholder that
 * exists only in an in-memory config.
 */
export const KEY = 'test-key'

export const b64 = (bytes) => Buffer.from(bytes).toString('base64')

export const pcmBytes = (size = 2400, fill = 7) => new Uint8Array(size).fill(fill)

/** A `generateContent` answer carrying raw PCM, as the REST route returns it. */
export function ttsPayload({ bytes = 2400, fill = 7, mimeType = 'audio/L16;codec=pcm;rate=24000' } = {}) {
  return {
    candidates: [{
      content: {
        parts: [{ inlineData: { mimeType, data: b64(pcmBytes(bytes, fill)) } }],
      },
    }],
  }
}

export function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return payload },
    async text() { return JSON.stringify(payload) },
  }
}

/** A fetch that answers one payload and records every call it received. */
export function fetchStub(handler) {
  const calls = []
  const impl = async (url, init = {}) => {
    calls.push({ url, init })
    return handler(url, init, calls.length)
  }
  return { calls, impl }
}

/** A fetch that answers nothing until it is aborted, like a stalled provider. */
export function hangingFetch() {
  const calls = []
  const impl = (url, init = {}) => {
    calls.push({ url, init })
    return new Promise((resolve, reject) => {
      const abort = () => reject(new Error('aborted'))
      if (init.signal?.aborted) abort()
      else init.signal?.addEventListener('abort', abort, { once: true })
    })
  }
  return { calls, impl }
}

/**
 * A scripted `bidiGenerateContent` server.
 *
 * It speaks the real frame order — `setup`, `setupComplete`, `clientContent`,
 * audio frames, `turnComplete` — so the adapter is exercised rather than mocked,
 * and it records every socket it handed out.
 */
export function liveServer({
  chunks = 2,
  chunkBytes = 1200,
  mimeType = 'audio/pcm;rate=24000',
  complete = true,
  noise = false,
  /**
   * How inbound frames reach the adapter. A real Gemini Live socket sends
   * `Blob`s, not strings; the default stays `string` so the older tests keep
   * describing their own case, and the encoding test walks all three.
   */
  frameEncoding = 'string',
} = {}) {
  const encodeFrame = (value) => {
    const raw = JSON.stringify(value)
    if (frameEncoding === 'arraybuffer') return new TextEncoder().encode(raw).buffer
    if (frameEncoding === 'blob') return { text: async () => raw }
    return raw
  }
  const sockets = []
  const factory = (url) => {
    const socket = {
      url,
      sent: [],
      closed: false,
      listeners: new Map(),
      addEventListener(type, listener) {
        const list = socket.listeners.get(type) ?? []
        list.push(listener)
        socket.listeners.set(type, list)
      },
      removeEventListener(type, listener) {
        socket.listeners.set(type, (socket.listeners.get(type) ?? []).filter((entry) => entry !== listener))
      },
      emit(type, event = {}) {
        for (const listener of [...(socket.listeners.get(type) ?? [])]) listener(event)
      },
      send(raw) {
        const frame = JSON.parse(raw)
        socket.sent.push(frame)
        if (frame.setup !== undefined) {
          queueMicrotask(() => socket.emit('message', { data: encodeFrame({ setupComplete: {} }) }))
          return
        }
        if (frame.clientContent === undefined) return
        if (noise) {
          // A frame that carries no audio must be ignored, not treated as an answer.
          queueMicrotask(() => socket.emit('message', {
            data: encodeFrame({ sessionResumptionUpdate: { resumable: true } }),
          }))
        }
        for (let at = 0; at < chunks; at += 1) {
          queueMicrotask(() => socket.emit('message', {
            data: encodeFrame({
              serverContent: {
                modelTurn: { parts: [{ inlineData: { mimeType, data: b64(pcmBytes(chunkBytes)) } }] },
              },
            }),
          }))
        }
        if (complete) {
          queueMicrotask(() => socket.emit('message', {
            data: encodeFrame({ serverContent: { turnComplete: true } }),
          }))
        }
      },
      close() {
        if (socket.closed) return
        socket.closed = true
        queueMicrotask(() => socket.emit('close', {}))
      },
    }
    sockets.push(socket)
    queueMicrotask(() => { if (!socket.closed) socket.emit('open', {}) })
    return socket
  }
  return { sockets, factory }
}

/**
 * The socket a test gets when it did not ask for one.
 *
 * It throws instead of connecting: a test that accidentally reaches the live
 * adapter must fail here rather than open a real network connection.
 */
export function noSocket() {
  throw new Error('a test must inject its own WebSocket; the global one is never used')
}

/** Wait for a condition, so nothing is asserted before the work has started. */
export async function until(predicate, ticks = 200) {
  for (let at = 0; at < ticks; at += 1) {
    if (predicate()) return true
    await new Promise((resolve) => setTimeout(resolve, 1))
  }
  return predicate()
}
