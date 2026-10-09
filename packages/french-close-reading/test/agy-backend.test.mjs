import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Context } from '@deepseek-ai/cordis'
import ts from 'typescript'

// Load the TypeScript source under test without rebuilding or changing generated lib files.
const source = readFileSync(new URL('../src/agy-backend.ts', import.meta.url), 'utf8')
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const { AgyBackend } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`)

test('CLI timing records backend duration but no invented first-text boundary', async () => {
  const ctx = new Context()
  ctx.provide('subprocess', {})
  const backend = new AgyBackend(ctx, {
    run: async () => ({
      text: JSON.stringify({ status: 'SUCCESS', response: 'Une réponse.' }),
      exitCode: 0, lossy: false, timedOut: false,
    }),
  })
  const outcome = await backend.generate(
    { backend: 'agy', model: 'test-model' },
    { system: '', prompt: 'Test prompt', signal: new AbortController().signal },
  )

  assert.equal(outcome.finish, 'stop')
  assert.equal(typeof outcome.modelCallMs, 'number')
  assert.equal(Number.isInteger(outcome.modelCallMs), true)
  assert.equal(outcome.firstTextDeltaMs, null)
})

test('a runner rejection after abort is reported as cancellation', async () => {
  const ctx = new Context()
  ctx.provide('subprocess', {})
  const controller = new AbortController()
  const backend = new AgyBackend(ctx, {
    run: (_argv, signal) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('runner aborted')), { once: true })
    }),
  })

  const pending = backend.generate(
    { backend: 'agy', model: 'test-model' },
    { system: '', prompt: 'Test prompt', signal: controller.signal },
  )
  controller.abort()

  const outcome = await pending
  assert.equal(outcome.finish, 'cancelled')
  assert.equal(outcome.failure, null)
  assert.equal(typeof outcome.modelCallMs, 'number')
  assert.equal(outcome.firstTextDeltaMs, null)
})
