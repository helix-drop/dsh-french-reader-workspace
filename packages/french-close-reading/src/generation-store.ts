/**
 * The generation-job store: one record per turn the Host owes the reader.
 *
 * A model call is the longest thing this plugin does, and it is the only thing that
 * can be interrupted by anything outside the reader's control — a cancel, a Host
 * restart, a provider that dies mid-answer. Without a record of the attempt, all of
 * those look the same afterwards: a question with no answer and no explanation.
 *
 * The rules this module keeps:
 *
 * 1. **One operation is one job.** The key is the caller's operation id, so a
 *    retried send finds its own job instead of starting a second life for the same
 *    question.
 * 2. **A restart is not a success.** A job still running when the Host opens is
 *    reconciled to `interrupted`; nothing infers a completion that was never seen.
 * 3. **Partial text is kept.** Text captured before an interruption stays on the
 *    record, so a cancelled or interrupted turn can be read for what it was.
 */
import type { StoredGenerationJob } from './domain.ts'
import type { RecordTable } from './lexicon-store.ts'

/** The key of one job: kind plus operation id, both path-safe. */
export const generationJobKey = (kind: StoredGenerationJob['kind'], operationId: string): string =>
  `job_${kind}_${operationId}`

/** One job by its own operation, or undefined when this operation never ran. */
export function readGenerationJob(
  table: RecordTable,
  kind: StoredGenerationJob['kind'],
  operationId: string,
): StoredGenerationJob | undefined {
  const record = table.get(generationJobKey(kind, operationId))
  return record?.kind === 'generationJob' ? record.payload : undefined
}

/** Every job, newest first; optionally only one passage's. */
export function listGenerationJobs(table: RecordTable, passageId?: string): StoredGenerationJob[] {
  const jobs: StoredGenerationJob[] = []
  for (const [, record] of table.entries()) {
    if (record.kind !== 'generationJob') continue
    if (passageId !== undefined && record.payload.passageId !== passageId) continue
    jobs.push(record.payload)
  }
  return jobs.sort((left, right) => right.startedAt.localeCompare(left.startedAt))
}

export async function writeGenerationJob(table: RecordTable, job: StoredGenerationJob): Promise<void> {
  await table.put(generationJobKey(job.kind, job.operationId), {
    kind: 'generationJob', recordVersion: 1, payload: job,
  })
}

/**
 * Start (or restart) one job.
 *
 * A second call for the same operation is a retry, so the attempt counter moves and
 * the previous partial text is cleared: the new attempt's text must not be
 * concatenated onto a dead one. The id is preserved, because the job is the same
 * job.
 */
export async function beginGenerationJob(
  table: RecordTable,
  input: {
    kind: StoredGenerationJob['kind']
    operationId: string
    passageId: string
    branchId: string | null
    anchorId: string | null
    backend: string
    model: string
  },
): Promise<StoredGenerationJob> {
  const existing = readGenerationJob(table, input.kind, input.operationId)
  const now = new Date().toISOString()
  const job: StoredGenerationJob = {
    id: existing?.id ?? globalThis.crypto.randomUUID(),
    operationId: input.operationId,
    kind: input.kind,
    passageId: input.passageId,
    branchId: input.branchId,
    anchorId: input.anchorId,
    backend: input.backend,
    model: input.model,
    status: 'running',
    phase: 'dispatched',
    attempt: (existing?.attempt ?? 0) + 1,
    partialText: '',
    finish: null,
    failure: null,
    resolvedModel: null,
    usage: null,
    messageId: null,
    contextId: null,
    startedAt: now,
    updatedAt: now,
    finishedAt: null,
  }
  await writeGenerationJob(table, job)
  return job
}

/** Record text that arrived while the answer was still being produced. */
export async function recordGenerationProgress(
  table: RecordTable,
  job: StoredGenerationJob,
  partialText: string,
): Promise<StoredGenerationJob> {
  const next: StoredGenerationJob = {
    ...job,
    partialText,
    updatedAt: new Date().toISOString(),
  }
  await writeGenerationJob(table, next)
  return next
}

/**
 * Record how far the call got (dispatched → preparing → streaming).
 *
 * The evidence for "did the request reach the provider, and is it waiting on
 * the model or on metadata" is this field: a job that stops moving while its
 * phase is 'preparing' never opened the provider stream.
 */
export async function recordGenerationPhase(
  table: RecordTable,
  job: StoredGenerationJob,
  phase: string,
): Promise<StoredGenerationJob> {
  const next: StoredGenerationJob = {
    ...job,
    phase,
    updatedAt: new Date().toISOString(),
  }
  await writeGenerationJob(table, next)
  return next
}

/** Settle one job with its outcome. */
export async function finishGenerationJob(
  table: RecordTable,
  job: StoredGenerationJob,
  patch: {
    status: StoredGenerationJob['status']
    finish?: StoredGenerationJob['finish']
    failure?: string | null
    resolvedModel?: string | null
    usage?: StoredGenerationJob['usage']
    messageId?: string | null
    contextId?: string | null
    partialText?: string
  },
): Promise<StoredGenerationJob> {
  const now = new Date().toISOString()
  const next: StoredGenerationJob = {
    ...job,
    status: patch.status,
    finish: patch.finish ?? job.finish,
    failure: patch.failure === undefined ? job.failure : patch.failure,
    resolvedModel: patch.resolvedModel === undefined ? job.resolvedModel : patch.resolvedModel,
    usage: patch.usage === undefined ? job.usage : patch.usage,
    messageId: patch.messageId === undefined ? job.messageId : patch.messageId,
    contextId: patch.contextId === undefined ? job.contextId : patch.contextId,
    partialText: patch.partialText ?? job.partialText,
    updatedAt: now,
    finishedAt: now,
  }
  await writeGenerationJob(table, next)
  return next
}

/**
 * Reconcile jobs left running by a previous Host lifetime.
 *
 * Called once at open: a `running` job cannot still be running, because the process
 * that would have finished it is gone. Marking them `interrupted` keeps the record
 * honest — the alternative is a job that claims to be in flight forever.
 *
 * @returns The jobs that were interrupted.
 */
export async function reconcileGenerationJobs(table: RecordTable): Promise<StoredGenerationJob[]> {
  const interrupted: StoredGenerationJob[] = []
  for (const job of listGenerationJobs(table)) {
    if (job.status !== 'running') continue
    const now = new Date().toISOString()
    const next: StoredGenerationJob = {
      ...job,
      status: 'interrupted',
      failure: job.failure ?? 'Host 重启，本次生成未能完成',
      updatedAt: now,
      finishedAt: now,
    }
    await writeGenerationJob(table, next)
    interrupted.push(next)
  }
  return interrupted
}
