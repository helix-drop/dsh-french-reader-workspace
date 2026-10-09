import test from 'node:test'
import assert from 'node:assert/strict'
import { FrenchReaderController } from '../lib/controller.js'
import { TYPERT as hostTypert } from '../lib/typert.host.js'
import clientRemote from '../lib/typert.remote-client.js'

const signal = () => new AbortController().signal

function fixture() {
  const records = new Map()
  let writes = 0
  const table = {
    get: (key) => records.get(key),
    entries: () => [...records.entries()],
    get size() { return records.size },
    async put(key, value) {
      writes += 1
      records.set(key, value)
    },
  }
  const controller = Object.create(FrenchReaderController.prototype)
  Object.defineProperties(controller, {
    domain: { value: { table: () => table } },
    writeTail: { value: Promise.resolve(), writable: true },
  })
  return { controller, table, writes: () => writes }
}

const firstRequest = {
  id: '00000000-0000-4000-8000-000000000001',
  operationId: '00000000-0000-4000-8000-000000000101',
  title: '  Le premier passage  ',
  sourceText: 'Il faut cultiver notre jardin.',
}

test('strict Host and Client Remote contracts expose the same endpoints', () => {
  const host = hostTypert.invocations.map((item) => item.id).sort()
  const client = clientRemote.descriptors.map((item) => item.id).sort()
  assert.deepEqual(client, host)
  assert.equal(host.length, 45)
  for (const invocation of hostTypert.invocations) {
    assert.equal(invocation.namespace, 'frenchReader')
    assert.equal(invocation.result.mode, 'strict')
    assert.ok(invocation.parameters.every((parameter) => parameter.codec.mode === 'strict'))
  }
  assert.deepEqual(clientRemote.descriptors.map((item) => item.method).sort(), [
    'addBranch', 'adoptTranslation', 'analyseParagraph', 'analyseSentence', 'archivePassage', 'ask', 'cancelAnalysis', 'createBranch', 'createLexiconEntry', 'createPassage',
    'createSelection', 'exportLibrary', 'exportPassages', 'fetchConjugation', 'fetchLexiconSource', 'getPassage',
    'getSegmentation', 'importLibrary', 'listAnalysis', 'listArchivedPassages', 'listBackendModels', 'listBackends', 'listDiscussion',
    'listGrammar', 'listLexicon', 'listLexiconSources', 'listPassages', 'lookupMot', 'previewAnalysisContext', 'previewAsk',
    'previewImport', 'publishAnalysis', 'putSentenceAnalysis', 'readAnalysisCoverage',
    'readConjugation', 'readContext', 'readSentenceAnalysis', 'recordConclusion', 'renderLexicon',
    'resolveGrammarCandidate', 'restorePassage', 'saveTranslation', 'setBranchState', 'setGrammarMastery', 'streamAsk',
  ])
})

test('save is source-preserving, durable-call idempotent, and returns a safe projection', async () => {
  const { controller, table, writes } = fixture()
  const created = await controller.createPassage(firstRequest, signal())
  assert.equal(created.kind, 'created')
  assert.equal(created.passage.title, 'Le premier passage')
  assert.equal(created.passage.sourceText, firstRequest.sourceText)
  assert.equal(created.passage.sourceRevision, 1)
  assert.equal(created.passage.segmentationRevision, 1)
  assert.equal(created.passage.status, 'source-only')
  assert.equal('operationId' in created.passage, false)

  const retry = await controller.createPassage(firstRequest, signal())
  assert.equal(retry.kind, 'already-saved')
  assert.equal(writes(), 1)
  assert.equal(table.size, 1)

  const fetched = await controller.getPassage({ id: firstRequest.id }, signal())
  assert.deepEqual(fetched.passage, created.passage)
})

test('concurrent retries serialize through one idempotency key', async () => {
  const { controller, table, writes } = fixture()
  const results = await Promise.all([
    controller.createPassage(firstRequest, signal()),
    controller.createPassage(firstRequest, signal()),
    controller.createPassage(firstRequest, signal()),
  ])
  assert.equal(results.filter((item) => item.kind === 'created').length, 1)
  assert.equal(results.filter((item) => item.kind === 'already-saved').length, 2)
  assert.equal(writes(), 1)
  assert.equal(table.size, 1)
})

test('operation-id conflicts do not overwrite another immutable source', async () => {
  const { controller, table, writes } = fixture()
  await controller.createPassage(firstRequest, signal())
  const conflict = await controller.createPassage({
    ...firstRequest,
    id: '00000000-0000-4000-8000-000000000002',
    title: 'Different passage',
  }, signal())
  assert.equal(conflict.kind, 'conflict')
  assert.equal(conflict.reason, 'operation-used')
  assert.equal(table.size, 1)
  assert.equal(writes(), 1)
})

test('list paging and export preserve complete source text', async () => {
  const { controller } = fixture()
  await controller.createPassage(firstRequest, signal())
  const second = {
    id: '00000000-0000-4000-8000-000000000002',
    operationId: '00000000-0000-4000-8000-000000000102',
    title: 'Deuxième passage',
    sourceText: 'La liberté commence où l’ignorance finit.',
  }
  await controller.createPassage(second, signal())

  const page = await controller.listPassages({ offset: 1, limit: 1 }, signal())
  assert.equal(page.offset, 1)
  assert.equal(page.total, 2)
  assert.equal(page.items.length, 1)
  assert.equal(page.hasMore, false)

  const backup = await controller.exportPassages(signal())
  assert.equal(backup.schemaVersion, 1)
  assert.equal(backup.passages.length, 2)
  assert.ok(backup.passages.some((passage) => passage.sourceText === second.sourceText))
})

test('invalid source is rejected before storage mutation', async () => {
  const { controller, table, writes } = fixture()
  await assert.rejects(
    controller.createPassage({ ...firstRequest, sourceText: '   ' }, signal()),
    (error) => error.code === 'gateway/bad-request',
  )
  assert.equal(table.size, 0)
  assert.equal(writes(), 0)
})
