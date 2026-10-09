import { MAX_TRANSLATION_CHARACTERS } from "./limits.js";
/**
 * `partialText` is diagnostic evidence bounded by its schema field, never a
 * second copy of the answer: the business result is parsed from the full reply,
 * while the record keeps the head of it. Truncating here — at the store
 * boundary — means no caller can fail a write by handing over a long reply.
 */
function truncatePartial(text) {
    return text.length <= MAX_TRANSLATION_CHARACTERS ? text : text.slice(0, MAX_TRANSLATION_CHARACTERS);
}
/** The key of one job: kind plus operation id, both path-safe. */
export const generationJobKey = (kind, operationId) => `job_${kind}_${operationId}`;
/** One job by its own operation, or undefined when this operation never ran. */
export function readGenerationJob(table, kind, operationId) {
    const record = table.get(generationJobKey(kind, operationId));
    return record?.kind === 'generationJob' ? record.payload : undefined;
}
/** Every job, newest first; optionally only one passage's. */
export function listGenerationJobs(table, passageId) {
    const jobs = [];
    for (const [, record] of table.entries()) {
        if (record.kind !== 'generationJob')
            continue;
        if (passageId !== undefined && record.payload.passageId !== passageId)
            continue;
        jobs.push(record.payload);
    }
    return jobs.sort((left, right) => right.startedAt.localeCompare(left.startedAt));
}
export async function writeGenerationJob(table, job) {
    await table.put(generationJobKey(job.kind, job.operationId), {
        kind: 'generationJob', recordVersion: 1, payload: job,
    });
}
/**
 * Start (or restart) one job.
 *
 * A second call for the same operation is a retry, so the attempt counter moves and
 * the previous partial text is cleared: the new attempt's text must not be
 * concatenated onto a dead one. The id is preserved, because the job is the same
 * job.
 */
export async function beginGenerationJob(table, input) {
    const existing = readGenerationJob(table, input.kind, input.operationId);
    const now = new Date().toISOString();
    const job = {
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
        modelCallMs: null,
        firstTextDeltaMs: null,
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
    };
    await writeGenerationJob(table, job);
    return job;
}
/** Record text that arrived while the answer was still being produced. */
export async function recordGenerationProgress(table, job, partialText) {
    const next = {
        ...job,
        partialText: truncatePartial(partialText),
        updatedAt: new Date().toISOString(),
    };
    await writeGenerationJob(table, next);
    return next;
}
/**
 * Record how far the call got (dispatched → preparing → streaming).
 *
 * The evidence for "did the request reach the provider, and is it waiting on
 * the model or on metadata" is this field: a job that stops moving while its
 * phase is 'preparing' never opened the provider stream.
 */
export async function recordGenerationPhase(table, job, phase) {
    const next = {
        ...job,
        phase,
        updatedAt: new Date().toISOString(),
    };
    await writeGenerationJob(table, next);
    return next;
}
/** Store the first visible text boundary once; non-streaming backends leave it null. */
export async function recordFirstTextDelta(table, job, elapsedMs) {
    if (job.firstTextDeltaMs !== null && job.firstTextDeltaMs !== undefined)
        return job;
    const next = {
        ...job,
        firstTextDeltaMs: Math.max(0, Math.trunc(elapsedMs)),
        updatedAt: new Date().toISOString(),
    };
    await writeGenerationJob(table, next);
    return next;
}
/** Settle one job with its outcome. */
export async function finishGenerationJob(table, job, patch) {
    const now = new Date().toISOString();
    const next = {
        ...job,
        status: patch.status,
        finish: patch.finish ?? job.finish,
        failure: patch.failure === undefined ? job.failure : patch.failure,
        resolvedModel: patch.resolvedModel === undefined ? job.resolvedModel : patch.resolvedModel,
        usage: patch.usage === undefined ? job.usage : patch.usage,
        messageId: patch.messageId === undefined ? job.messageId : patch.messageId,
        contextId: patch.contextId === undefined ? job.contextId : patch.contextId,
        modelCallMs: patch.modelCallMs === undefined ? job.modelCallMs : patch.modelCallMs,
        firstTextDeltaMs: patch.firstTextDeltaMs === undefined ? job.firstTextDeltaMs : patch.firstTextDeltaMs,
        partialText: patch.partialText === undefined ? job.partialText : truncatePartial(patch.partialText),
        updatedAt: now,
        finishedAt: now,
    };
    await writeGenerationJob(table, next);
    return next;
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
export async function reconcileGenerationJobs(table) {
    const interrupted = [];
    for (const job of listGenerationJobs(table)) {
        if (job.status !== 'running')
            continue;
        const now = new Date().toISOString();
        const next = {
            ...job,
            status: 'interrupted',
            failure: job.failure ?? 'Host 重启，本次生成未能完成',
            updatedAt: now,
            finishedAt: now,
        };
        await writeGenerationJob(table, next);
        interrupted.push(next);
    }
    return interrupted;
}
