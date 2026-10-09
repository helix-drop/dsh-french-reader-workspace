import test from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'

import { DshLlmBackend, splitRoute } from '../lib/generation.js'

/**
 * The DSH model backend, against a stub that enforces the runtime's own contract.
 *
 * The real runtime compares the options handed to `prepared.stream()` with the
 * config `prepareCall` resolved, and throws `INVALID_PREPARED_CALL` on any
 * difference — including a field the caller omitted while the adapter had
 * resolved it. A live run failed exactly that way, so the stub below reproduces
 * the guard rather than a convenient approximation of it.
 */
const UUID = '00000000-0000-4000-8000-000000000001'

/** One runtime-faithful stub: `prepareCall` resolves defaults, `stream` checks them. */
function strictLlm({ resolved = {}, chunks = [], throwOnStream = null } = {}) {
  const calls = []
  const service = {
    listProviders: () => [{ id: 'prov', name: 'Provider' }],
    listModels: async () => [{ provider: 'prov', id: 'model', name: 'Model' }],
    resolveModelInfo: async () => ({ provider: 'prov', id: 'model', name: 'Model' }),
    async prepareCall(config, signal) {
      calls.push({ kind: 'prepare', config, signal })
      // What the runtime resolves: the caller's config plus adapter defaults.
      const resolvedConfig = {
        provider: config.provider,
        model: config.model,
        temperature: 1,
        maxTokens: 4096,
        ...resolved,
        ...config,
      }
      const equal = (a, b) => a.provider === b.provider && a.model === b.model
        && a.reasoningEffort === b.reasoningEffort && a.temperature === b.temperature
        && a.maxTokens === b.maxTokens
      let dispatched = false
      return Object.freeze({
        config: resolvedConfig,
        retryPolicy: { mode: 'normal', maxRetries: 0 },
        adapterDefaults: {},
        stream: (options) => {
          calls.push({ kind: 'stream', options })
          if (dispatched) throw new Error('a prepared LLM call can only be dispatched once')
          if (!equal(options, resolvedConfig)) {
            throw new Error('prepared LLM call config changed before adapter dispatch')
          }
          dispatched = true
          if (throwOnStream !== null) throw new Error(throwOnStream)
          return (async function* generate() {
            for (const chunk of chunks) yield chunk
          })()
        },
      })
    },
  }
  return { service, calls }
}

function contextWith(llm) {
  const ctx = new Context()
  ctx.provide('llm', llm)
  return ctx
}

const textChunks = [
  { type: 'block-start', index: 0, blockType: 'text' },
  { type: 'text-delta', index: 0, text: '这是回答。' },
  { type: 'block-end', index: 0, block: { type: 'text', text: '这是回答。' } },
  { type: 'usage', usage: { inputTokens: 12, outputTokens: 3 } },
  { type: 'finish', reason: { kind: 'stop' } },
]

test('the dispatch carries the prepared config, so the runtime does not refuse it', async () => {
  const { service } = strictLlm({ chunks: textChunks })
  const backend = new DshLlmBackend(contextWith(service))

  const outcome = await backend.generate(
    { backend: 'dsh', model: 'prov/model' },
    { system: 's', prompt: 'p', signal: new AbortController().signal },
  )

  assert.equal(outcome.finish, 'stop')
  assert.equal(outcome.text, '这是回答。')
  assert.deepEqual(outcome.usage, { inputTokens: 12, outputTokens: 3 })
})

test('an adapter default the caller did not ask for still matches, because it travels through', async () => {
  // The live failure: the adapter resolved `temperature`/`maxTokens`, the caller
  // sent only provider/model/messages, and the runtime refused the mismatch.
  const { service, calls } = strictLlm({
    resolved: { temperature: 0.2, maxTokens: 8192 },
    chunks: textChunks,
  })
  const backend = new DshLlmBackend(contextWith(service))
  const outcome = await backend.generate(
    { backend: 'dsh', model: 'prov/model' },
    { system: 's', prompt: 'p', signal: new AbortController().signal },
  )

  assert.equal(outcome.finish, 'stop', outcome.failure ?? '')
  const stream = calls.find((call) => call.kind === 'stream')
  assert.equal(stream.options.temperature, 0.2, 'the resolved value is what is dispatched')
  assert.equal(stream.options.maxTokens, 8192)
  assert.equal(stream.options.messages.length, 1, 'the turn is added on top of the config')
  assert.equal(stream.options.system, 's')
})

test('the turn is one user message carrying the compiled prompt verbatim', async () => {
  const { service, calls } = strictLlm({ chunks: textChunks })
  const backend = new DshLlmBackend(contextWith(service))
  await backend.generate(
    { backend: 'dsh', model: 'prov/model' },
    { system: 'sys', prompt: '第一行\n第二行', signal: new AbortController().signal },
  )
  const stream = calls.find((call) => call.kind === 'stream')
  assert.deepEqual(stream.options.messages, [
    { role: 'user', content: [{ type: 'text', text: '第一行\n第二行' }] },
  ])
})

test('a mid-stream provider failure is an error outcome, never a silent empty answer', async () => {
  const { service } = strictLlm({
    chunks: [
      { type: 'text-delta', index: 0, text: '半句' },
      { type: 'finish', reason: { kind: 'error', failure: { message: 'provider exploded', code: 'X' } } },
    ],
  })
  const backend = new DshLlmBackend(contextWith(service))
  const outcome = await backend.generate(
    { backend: 'dsh', model: 'prov/model' },
    { system: 's', prompt: 'p', signal: new AbortController().signal },
  )
  assert.equal(outcome.finish, 'error')
  assert.match(outcome.failure, /provider exploded/u)
  assert.equal(outcome.text, '半句', 'what did arrive is reported, not discarded')
})

test('a thrown dispatch failure is reported with its reason', async () => {
  const { service } = strictLlm({ throwOnStream: 'transport closed' })
  const backend = new DshLlmBackend(contextWith(service))
  const outcome = await backend.generate(
    { backend: 'dsh', model: 'prov/model' },
    { system: 's', prompt: 'p', signal: new AbortController().signal },
  )
  assert.equal(outcome.finish, 'error')
  assert.match(outcome.failure, /transport closed/u)
})

test('an aborted signal is reported as cancelled before any call', async () => {
  const { service, calls } = strictLlm({ chunks: textChunks })
  const backend = new DshLlmBackend(contextWith(service))
  const controller = new AbortController()
  controller.abort()
  const outcome = await backend.generate(
    { backend: 'dsh', model: 'prov/model' },
    { system: 's', prompt: 'p', signal: controller.signal },
  )
  assert.equal(outcome.finish, 'cancelled')
  assert.equal(calls.length, 0, 'nothing is prepared for an aborted turn')
})

test('a provider that ignores the cancel and still finishes stop is a cancelled turn', async () => {
  // The abort lands mid-stream; the provider's stream runs to a normal finish
  // frame anyway. The ending the caller revoked must not come back as success,
  // because downstream stores whatever finish this outcome claims.
  const { service } = strictLlm({ chunks: textChunks })
  const backend = new DshLlmBackend(contextWith(service))
  const controller = new AbortController()
  const outcome = await backend.generate(
    { backend: 'dsh', model: 'prov/model' },
    { system: 's', prompt: 'p', signal: controller.signal, onDelta: () => controller.abort() },
  )
  assert.equal(outcome.finish, 'cancelled')
  assert.equal(outcome.text, '这是回答。', 'what arrived is still reported, but the ending is the cancel')
})

test('a malformed model route is refused instead of being guessed at', async () => {
  const { service } = strictLlm({ chunks: textChunks })
  const backend = new DshLlmBackend(contextWith(service))
  for (const model of ['model-without-a-route', '/leading', 'trailing/']) {
    const outcome = await backend.generate(
      { backend: 'dsh', model },
      { system: 's', prompt: 'p', signal: new AbortController().signal },
    )
    assert.equal(outcome.finish, 'error')
    assert.equal(outcome.failure, 'model-route-invalid')
  }
  assert.equal(splitRoute('prov/model').model, 'model')
  assert.equal(splitRoute('a/b/c').provider, 'a')
  assert.equal(splitRoute('a/b/c').model, 'b/c', 'a model id may contain a slash')
})

test('a missing llm service makes the backend unavailable, with no call attempted', async () => {
  const ctx = new Context()
  const backend = new DshLlmBackend(ctx)
  assert.equal(backend.available().available, false)
  assert.equal(backend.available().reason, 'llm-unavailable')
  assert.deepEqual(await backend.listModels(new AbortController().signal), [])
  const outcome = await backend.generate(
    { backend: 'dsh', model: 'prov/model' },
    { system: 's', prompt: 'p', signal: new AbortController().signal },
  )
  assert.equal(outcome.finish, 'error')
  assert.equal(outcome.failure, 'llm-unavailable')
})

test('no provider registered is reported as such rather than as an empty model list', async () => {
  const ctx = new Context()
  ctx.provide('llm', { ...strictLlm().service, listProviders: () => [] })
  const backend = new DshLlmBackend(ctx)
  assert.equal(backend.available().available, false)
  assert.equal(backend.available().reason, 'no-provider-registered')
})

test('models are listed per provider, and the route keeps the provider', async () => {
  const ctx = new Context()
  ctx.provide('llm', {
    ...strictLlm().service,
    listProviders: () => [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
    listModels: async (provider) => [{ provider, id: 'same-id', name: `Model ${provider}` }],
  })
  const models = await new DshLlmBackend(ctx).listModels(new AbortController().signal)
  assert.deepEqual(models.map((model) => model.id), ['a/same-id', 'b/same-id'],
    'two providers serving one model id stay distinguishable')
  assert.match(models[0].name, /A/u)
  assert.equal(UUID.length, 36)
})
