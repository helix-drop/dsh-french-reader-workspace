import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  clientRequestEnvelope,
  cookieName,
  createDebugServer,
  decodeBase64Url,
  decodeSessionCookie,
  encodeBase64Url,
  frenchReaderEndpoint,
  mintBrowserCookie,
  readBrowserSessionSecret,
} from '../debug/server.mjs'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve(server.address().port)
    })
  })
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })
}

test('the browser-session reader takes only that grant secret', () => {
  const secret = encodeBase64Url(randomBytes(32))
  const yaml = [
    'version: 1',
    'records:',
    '  client-connection/browser-session:',
    '    kind: grant',
    '    payload:',
    '      version: 1',
    `      secret: ${secret}`,
    '  other/account:',
    '    kind: grant',
    '    payload:',
    '      secret: not-the-browser-session',
    '',
  ].join('\n')
  assert.equal(readBrowserSessionSecret(yaml), secret)
  assert.throws(() => readBrowserSessionSecret('records:\n  other: {}\n'), /was not found/)
})

test('a minted cookie names the desktop authority and round-trips', () => {
  const secret = encodeBase64Url(randomBytes(32))
  const now = 1_700_000_000_000
  const minted = mintBrowserCookie({
    authority: '127.0.0.1:19387',
    secretBase64Url: secret,
    now,
    maxAgeDays: 30,
  })
  assert.equal(minted.name, cookieName('127.0.0.1:19387'))
  assert.notEqual(minted.name, cookieName('127.0.0.1:19487'))
  const decoded = decodeSessionCookie(minted.value, decodeBase64Url(secret))
  assert.deepEqual(decoded, {
    version: 1,
    authority: '127.0.0.1:19387',
    issuedAt: now,
    expiresAt: now + 30 * 24 * 60 * 60 * 1000,
  })
  assert.equal(decodeSessionCookie(minted.value, randomBytes(32)), undefined)
})

test('the proxy accepts only frenchReader calls', () => {
  assert.equal(frenchReaderEndpoint('POST', '/api/frenchReader/listPassages'), 'frenchReader/listPassages')
  assert.equal(frenchReaderEndpoint('GET', '/api/frenchReader/listPassages'), null)
  assert.equal(frenchReaderEndpoint('POST', '/api/session/list'), null)
  assert.equal(frenchReaderEndpoint('POST', '/api/frenchReader/../session/list'), null)
  assert.equal(frenchReaderEndpoint('POST', '/api/frenchReader/listPassages/extra'), null)
  assert.equal(clientRequestEnvelope('frenchReader/listPassages', {
    type: 'client-request',
    rpcId: 'one',
    method: 'frenchReader/listPassages',
    payload: { args: { request: { offset: 0, limit: 1 } }, extra: true },
  }), null)
})

test('the debug page serves the same client and forwards one call', async () => {
  const seen = []
  const upstream = createServer((request, response) => {
    seen.push({
      method: request.method,
      url: request.url,
      origin: request.headers.origin ?? null,
      cookie: request.headers.cookie ?? null,
    })
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
      seen[0].body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({
        type: 'server-response',
        rpcId: seen[0].body.rpcId,
        result: { ok: true, value: { items: [], offset: 0, total: 3, hasMore: false } },
      }))
    })
  })
  let debug
  try {
    const upstreamPort = await listen(upstream)
    debug = createDebugServer({
      upstream: `http://127.0.0.1:${upstreamPort}`,
      cookieHeader: 'dsh-auth-test=v1.fixture',
    })
    const debugPort = await listen(debug)
    try {
      const page = await fetch(`http://127.0.0.1:${debugPort}/`)
      const html = await page.text()
      assert.equal(page.status, 200)
      assert.match(html, /\/boot\.js/)
      assert.match(html, /\/client\.js/)
      assert.doesNotMatch(html, /19387/)

      const client = await fetch(`http://127.0.0.1:${debugPort}/client.js`)
      const clientText = await client.text()
      assert.equal(client.headers.get('cache-control'), 'no-store')
      assert.match(clientText, /__FCR_DEBUG_DESKTOP__ === true/)
      assert.equal(clientText, readFileSync(path.join(packageRoot, 'client.js'), 'utf8'))

      const missing = await fetch(`http://127.0.0.1:${debugPort}/api/session/list`, { method: 'POST' })
      assert.equal(missing.status, 404)

      const forwarded = await fetch(`http://127.0.0.1:${debugPort}/api/frenchReader/listPassages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:19487' },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: 'call-1',
          method: 'frenchReader/listPassages',
          payload: { args: { request: { offset: 0, limit: 1 } } },
        }),
      })
      const result = await forwarded.json()
      assert.equal(forwarded.status, 200)
      assert.equal(result.result.value.total, 3)
      assert.equal(seen[0].cookie, 'dsh-auth-test=v1.fixture')
      assert.equal(seen[0].origin, null)
      assert.equal(seen[0].url, '/api/frenchReader/listPassages')
      assert.equal(seen[0].body.method, 'frenchReader/listPassages')
      assert.deepEqual(seen[0].body.payload.args.request, { offset: 0, limit: 1 })
    } finally {
      await close(debug)
    }
  } finally {
    await close(upstream)
  }
})

test('debug entry forwards an exported backup larger than one MB intact', async () => {
  let received = 0
  const upstream = createServer((request, response) => {
    request.on('data', (chunk) => { received += chunk.length })
    request.on('end', () => { response.writeHead(200); response.end('{"ok":true}') })
  })
  const port = await listen(upstream)
  const debug = createDebugServer({ upstream: `http://127.0.0.1:${port}`, cookieHeader: 'dsh-auth-test=fixture' })
  const debugPort = await listen(debug)
  try {
    const body = JSON.stringify({ type: 'client-request', rpcId: 'large-import', method: 'frenchReader/importLibrary', payload: { args: { request: { records: ['x'.repeat(1_600_000)] } } } })
    const response = await fetch(`http://127.0.0.1:${debugPort}/api/frenchReader/importLibrary`, { method: 'POST', headers: { 'content-type': 'application/json' }, body })
    assert.equal(response.status, 200)
    assert.equal(received, Buffer.byteLength(body))
  } finally { await close(debug); await close(upstream) }
})
