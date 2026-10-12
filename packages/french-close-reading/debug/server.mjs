/**
 * Full-window debug entry for the French close-reading panel.
 *
 * It serves the package's client.js and forwards only `frenchReader` calls to
 * the desktop host that is already listening on 127.0.0.1:19387. It does not
 * start a second DSH, and it does not use the web profile.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DEBUG_ROOT = fileURLToPath(new URL('.', import.meta.url))
const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url))
export const UPSTREAM_ORIGIN = 'http://127.0.0.1:19387'
export const UPSTREAM_AUTHORITY = '127.0.0.1:19387'
export const BODY_LIMIT = 64 * 1024 * 1024
const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/

const STATIC_FILES = new Map([
  ['/', { file: 'index.html', type: 'text/html; charset=utf-8' }],
  ['/index.html', { file: 'index.html', type: 'text/html; charset=utf-8' }],
  ['/boot.js', { file: 'boot.js', type: 'text/javascript; charset=utf-8' }],
  ['/vendor/react.production.min.js', { file: 'vendor/react.production.min.js', type: 'text/javascript; charset=utf-8' }],
  ['/vendor/react-dom.production.min.js', { file: 'vendor/react-dom.production.min.js', type: 'text/javascript; charset=utf-8' }],
])

export function encodeBase64Url(value) {
  return Buffer.from(value).toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

export function decodeBase64Url(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]*$/u.test(value) || value.length % 4 === 1) return undefined
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const decoded = Buffer.from(value.replaceAll('-', '+').replaceAll('_', '/') + padding, 'base64')
  return encodeBase64Url(decoded) === value ? decoded : undefined
}

/** The desktop host's browser-session cookie name for one authority. */
export function cookieName(authority) {
  return `dsh-auth-${encodeBase64Url(createHash('sha256').update(authority).digest())}`
}

export function encodeSessionCookie(payload, secretBytes) {
  const body = encodeBase64Url(Buffer.from(JSON.stringify(payload), 'utf8'))
  const signature = createHmac('sha256', secretBytes).update(body).digest()
  return `v1.${body}.${encodeBase64Url(signature)}`
}

export function decodeSessionCookie(value, secretBytes) {
  const parts = String(value).split('.')
  if (parts.length !== 3 || parts[0] !== 'v1') return undefined
  const actual = decodeBase64Url(parts[2])
  if (actual === undefined) return undefined
  const expected = createHmac('sha256', secretBytes).update(parts[1]).digest()
  if (actual.byteLength !== expected.byteLength || !timingSafeEqual(actual, expected)) return undefined
  const body = decodeBase64Url(parts[1])
  if (body === undefined) return undefined
  try { return JSON.parse(body.toString('utf8')) } catch { return undefined }
}

/**
 * Read only the browser-session grant secret. Other records in the credentials
 * file stay unread, and the secret itself is never included in an error.
 */
export function readBrowserSessionSecret(yamlText) {
  const lines = String(yamlText).split(/\r?\n/u)
  let inRecord = false
  let inPayload = false
  let kind = ''
  for (const line of lines) {
    if (!inRecord) {
      if (line === '  client-connection/browser-session:') inRecord = true
      continue
    }
    if (/^  \S/u.test(line)) break
    const kindMatch = /^    kind:\s*(\S+)\s*$/u.exec(line)
    if (kindMatch) {
      kind = kindMatch[1].replace(/^['"]|['"]$/gu, '')
      continue
    }
    if (line === '    payload:') {
      inPayload = true
      continue
    }
    if (!inPayload) continue
    const secretMatch = /^      secret:\s*(\S+)\s*$/u.exec(line)
    if (!secretMatch) continue
    if (kind !== 'grant') throw new Error('browser-session record is not a grant')
    const secret = secretMatch[1].replace(/^['"]|['"]$/gu, '')
    if (!SECRET_PATTERN.test(secret)) throw new Error('browser-session secret has an unexpected shape')
    return secret
  }
  throw new Error('browser-session secret was not found')
}

export function mintBrowserCookie({ authority, secretBase64Url, now = Date.now(), maxAgeDays = 30 }) {
  const secret = decodeBase64Url(secretBase64Url)
  if (secret === undefined || secret.byteLength !== 32) {
    throw new Error('browser-session secret is not 32 bytes')
  }
  const expiresAt = now + maxAgeDays * 24 * 60 * 60 * 1000
  if (!Number.isSafeInteger(now) || !Number.isSafeInteger(expiresAt)) {
    throw new Error('browser-session cookie lifetime is out of range')
  }
  const payload = { version: 1, authority, issuedAt: now, expiresAt }
  return { name: cookieName(authority), value: encodeSessionCookie(payload, secret) }
}

/** `POST /api/frenchReader/<method>` only. Anything else is not proxied. */
export function frenchReaderEndpoint(method, url) {
  if (method !== 'POST') return null
  let pathname
  try { pathname = new URL(url, 'http://127.0.0.1').pathname } catch { return null }
  const match = /^\/api\/frenchReader\/([A-Za-z][A-Za-z0-9_]*)$/u.exec(pathname)
  if (match === null) return null
  return `frenchReader/${match[1]}`
}

export function clientRequestEnvelope(endpoint, raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  if (raw.type !== 'client-request' || typeof raw.rpcId !== 'string' || raw.rpcId.length === 0 || raw.rpcId.length > 200) return null
  if (raw.method !== endpoint) return null
  const payload = raw.payload
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null
  if (Object.keys(payload).length !== 1 || !Object.hasOwn(payload, 'args')) return null
  const args = payload.args
  if (args === null || typeof args !== 'object' || Array.isArray(args)) return null
  return { type: 'client-request', rpcId: raw.rpcId, method: endpoint, payload: { args } }
}

export async function postFrenchReader({ upstream, cookieHeader, envelope, signal }) {
  const response = await fetch(`${upstream}/api/${envelope.method}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: cookieHeader,
    },
    body: JSON.stringify(envelope),
    signal,
  })
  const bytes = Buffer.from(await response.arrayBuffer())
  return {
    status: response.status,
    contentType: response.headers.get('content-type') ?? 'application/json; charset=utf-8',
    bytes,
  }
}

function readBody(request, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(Object.assign(new Error('body too large'), { status: 413 }))
        chunks.length = 0
        return
      }
      if (size <= limit) chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks)))
    request.on('error', reject)
  })
}

function sendText(response, status, body) {
  response.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(body)
}

function safeHostMessage(value) {
  const text = typeof value === 'string' ? value : ''
  if (text.length === 0 || text.length > 180 || /dsh-auth|secret|token|cookie/iu.test(text)) {
    return '桌面宿主拒绝了调试会话'
  }
  return text
}

export function createDebugServer({
  upstream = UPSTREAM_ORIGIN,
  cookieHeader,
  debugRoot = DEBUG_ROOT,
  clientPath = path.join(PACKAGE_ROOT, 'client.js'),
} = {}) {
  if (typeof cookieHeader !== 'string' || cookieHeader.length === 0) {
    throw new Error('debug server requires a desktop-host cookie')
  }
  return createServer(async (request, response) => {
    const method = request.method ?? 'GET'
    const url = request.url ?? '/'
    try {
      if (method === 'GET' && new URL(url, 'http://127.0.0.1').pathname === '/favicon.ico') {
        response.writeHead(204)
        response.end()
        return
      }
      const endpoint = frenchReaderEndpoint(method, url)
      if (endpoint !== null) {
        const type = String(request.headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase()
        if (type !== 'application/json') {
          sendText(response, 415, 'content type must be application/json\n')
          return
        }
        let raw
        try {
          raw = JSON.parse((await readBody(request, BODY_LIMIT)).toString('utf8'))
        } catch (error) {
          sendText(response, error?.status === 413 ? 413 : 400, error?.status === 413 ? '备份超过 64 MB，请拆分后导入\n' : '文件不是有效的 JSON\n')
          return
        }
        const envelope = clientRequestEnvelope(endpoint, raw)
        if (envelope === null) {
          sendText(response, 400, 'invalid client-request\n')
          return
        }
        const abort = new AbortController()
        response.on('close', () => { if (!response.writableEnded) abort.abort() })
        const forwarded = await postFrenchReader({ upstream, cookieHeader, envelope, signal: abort.signal })
        response.writeHead(forwarded.status, {
          'content-type': forwarded.contentType,
          'cache-control': 'no-store',
        })
        response.end(forwarded.bytes)
        return
      }
      if (method !== 'GET' && method !== 'HEAD') {
        sendText(response, 404, 'not found\n')
        return
      }
      const pathname = new URL(url, 'http://127.0.0.1').pathname
      if (pathname === '/client.js') {
        const body = readFileSync(clientPath)
        response.writeHead(method === 'HEAD' ? 200 : 200, {
          'content-type': 'text/javascript; charset=utf-8',
          'content-length': body.byteLength,
          'cache-control': 'no-store',
        })
        response.end(method === 'HEAD' ? undefined : body)
        return
      }
      const asset = STATIC_FILES.get(pathname)
      if (asset === undefined) {
        sendText(response, 404, 'not found\n')
        return
      }
      const body = readFileSync(path.join(debugRoot, asset.file))
      response.writeHead(200, {
        'content-type': asset.type,
        'content-length': body.byteLength,
        'cache-control': pathname.startsWith('/vendor/') ? 'public, max-age=86400' : 'no-store',
      })
      response.end(method === 'HEAD' ? undefined : body)
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 500
      if (!response.headersSent) sendText(response, status, status === 413 ? 'body too large\n' : 'debug server failed\n')
    }
  })
}

function credentialsPath() {
  const home = process.env.DSH_HOME || path.join(homedir(), '.dsh')
  return path.join(home, '.credentials.yaml')
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject)
      resolve(server.address().port)
    })
  })
}

async function main() {
  const port = Number(process.env.FCR_DEBUG_PORT ?? 19487)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('FCR_DEBUG_PORT 必须是 1 到 65535 的整数')
    process.exitCode = 1
    return
  }
  let secret
  try {
    secret = readBrowserSessionSecret(readFileSync(credentialsPath(), 'utf8'))
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'browser-session secret was not found')
    console.error('调试入口使用桌面宿主已有的浏览器会话，不会另开一个 DSH。')
    process.exitCode = 1
    return
  }
  const minted = mintBrowserCookie({ authority: UPSTREAM_AUTHORITY, secretBase64Url: secret })
  const cookieHeader = `${minted.name}=${minted.value}`
  let probe
  try {
    probe = await postFrenchReader({
      upstream: UPSTREAM_ORIGIN,
      cookieHeader,
      envelope: {
        type: 'client-request',
        rpcId: 'debug-probe',
        method: 'frenchReader/listPassages',
        payload: { args: { request: { offset: 0, limit: 1 } } },
      },
    })
  } catch {
    console.error('桌面宿主没有在 127.0.0.1:19387 上响应。请让 DeepSeek Harness 保持开着，调试入口不会另开一个 DSH。')
    process.exitCode = 1
    return
  }
  let parsed = null
  try { parsed = JSON.parse(probe.bytes.toString('utf8')) } catch { parsed = null }
  const result = parsed?.type === 'server-response' ? parsed.result : null
  if (probe.status !== 200 || result?.ok !== true) {
    console.error(`桌面宿主没有接受调试会话（HTTP ${probe.status}）：${safeHostMessage(result?.error?.message)}`)
    process.exitCode = 1
    return
  }
  const total = result.value?.total
  const server = createDebugServer({ cookieHeader })
  try {
    await listen(server, port)
  } catch (error) {
    if (error?.code === 'EADDRINUSE') console.error(`端口 ${port} 已被占用。可以换一个：FCR_DEBUG_PORT=19488 node debug/server.mjs`)
    else console.error('调试入口没有监听成功')
    process.exitCode = 1
    return
  }
  const count = Number.isInteger(total) ? `，段落 ${total} 篇` : ''
  console.log(`法语精读调试入口  http://127.0.0.1:${port}/`)
  console.log(`数据来自桌面宿主 http://127.0.0.1:19387${count}`)
  console.log('底部开关用来模拟 Mac 顶栏遮挡。刷新页面就会载入当前的 client.js。')
  console.log('书架分组保存在这个调试地址自己的本地存储里；段落、解析和讨论仍是桌面宿主上的同一份。')
}

const invokedDirectly = process.argv[1] !== undefined
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) await main()
