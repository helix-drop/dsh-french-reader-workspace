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
import type { StoredGenerationJob } from './domain.ts';
import type { RecordTable } from './lexicon-store.ts';
/** The key of one job: kind plus operation id, both path-safe. */
export declare const generationJobKey: (kind: StoredGenerationJob["kind"], operationId: string) => string;
/** One job by its own operation, or undefined when this operation never ran. */
export declare function readGenerationJob(table: RecordTable, kind: StoredGenerationJob['kind'], operationId: string): StoredGenerationJob | undefined;
/** Every job, newest first; optionally only one passage's. */
export declare function listGenerationJobs(table: RecordTable, passageId?: string): StoredGenerationJob[];
export declare function writeGenerationJob(table: RecordTable, job: StoredGenerationJob): Promise<void>;
/**
 * Start (or restart) one job.
 *
 * A second call for the same operation is a retry, so the attempt counter moves and
 * the previous partial text is cleared: the new attempt's text must not be
 * concatenated onto a dead one. The id is preserved, because the job is the same
 * job.
 */
export declare function beginGenerationJob(table: RecordTable, input: {
    kind: StoredGenerationJob['kind'];
    operationId: string;
    passageId: string;
    branchId: string | null;
    anchorId: string | null;
    backend: string;
    model: string;
}): Promise<StoredGenerationJob>;
/** Record text that arrived while the answer was still being produced. */
export declare function recordGenerationProgress(table: RecordTable, job: StoredGenerationJob, partialText: string): Promise<StoredGenerationJob>;
/**
 * Record how far the call got (dispatched → preparing → streaming).
 *
 * The evidence for "did the request reach the provider, and is it waiting on
 * the model or on metadata" is this field: a job that stops moving while its
 * phase is 'preparing' never opened the provider stream.
 */
export declare function recordGenerationPhase(table: RecordTable, job: StoredGenerationJob, phase: string): Promise<StoredGenerationJob>;
/** Settle one job with its outcome. */
export declare function finishGenerationJob(table: RecordTable, job: StoredGenerationJob, patch: {
    status: StoredGenerationJob['status'];
    finish?: StoredGenerationJob['finish'];
    failure?: string | null;
    resolvedModel?: string | null;
    usage?: StoredGenerationJob['usage'];
    messageId?: string | null;
    contextId?: string | null;
    partialText?: string;
}): Promise<StoredGenerationJob>;
/**
 * Reconcile jobs left running by a previous Host lifetime.
 *
 * Called once at open: a `running` job cannot still be running, because the process
 * that would have finished it is gone. Marking them `interrupted` keeps the record
 * honest — the alternative is a job that claims to be in flight forever.
 *
 * @returns The jobs that were interrupted.
 */
export declare function reconcileGenerationJobs(table: RecordTable): Promise<StoredGenerationJob[]>;
