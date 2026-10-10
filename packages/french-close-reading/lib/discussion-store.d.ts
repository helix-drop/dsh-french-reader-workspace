/**
 * The discussion store: branches with message histories, the immutable context
 * manifests behind each request, the conclusions a reader confirmed, and the
 * versioned record of every deliberate content change.
 *
 * Two rules shape this module:
 *
 * 1. A branch is a conversation, so its messages are appended in order and a user
 *    message is never rewritten by a later answer.
 * 2. `parentId`/`forkedFrom` are provenance: they place a discussion in the tree
 *    it came from. A sibling branch never enters anybody's context, while a fork
 *    inherits the chain of cut-off histories it was forked from (see
 *    {@link branchHistory}).
 */
import type { PassageRecord, StoredGrammarEntry, StoredConclusion, StoredContentVersion, StoredContextManifest, StoredContexts, StoredConclusions, StoredDiscussion, StoredDiscussionBranch, StoredDiscussionMessage } from './domain.ts';
import { type RecordTable } from './lexicon-store.ts';
export declare const discussionKey: (passageId: string) => string;
export declare const contextsKey: (passageId: string) => string;
export declare const conclusionsKey: (passageId: string) => string;
export declare const contentVersionKey: (id: string) => string;
export declare function readDiscussion(table: RecordTable, passageId: string): StoredDiscussion;
export declare function writeDiscussion(table: RecordTable, value: StoredDiscussion): Promise<void>;
export declare function readContexts(table: RecordTable, passageId: string): StoredContexts;
export declare function writeContexts(table: RecordTable, value: StoredContexts): Promise<void>;
export declare function readConclusions(table: RecordTable, passageId: string): StoredConclusions;
export declare function writeConclusions(table: RecordTable, value: StoredConclusions): Promise<void>;
/**
 * The record key of one compiled context.
 *
 * Manifests used to live in a single per-passage array capped at 200, which made
 * "what exactly was sent with this answer" expire under ordinary use — the one
 * record an audit depends on. Each manifest is now its own record: unbounded
 * provenance for the price of one small document per turn.
 */
export declare const contextManifestKey: (contextId: string) => string;
/** The record key of one storage migration marker. */
export declare const migrationKey: (name: string) => string;
/** The migration that moved context manifests out of their capped arrays. */
export declare const CONTEXT_MIGRATION_NAME = "contexts-to-per-record";
/** What one migration did, as stored: the audit trail of a data move. */
export interface MigrationReport {
    ran: boolean;
    migrated: number;
    skipped: number;
    emptied: number;
}
/**
 * Store one compiled manifest as its own record.
 *
 * The key is the manifest id, which is already what every message references, so
 * writing the same manifest twice (a retry, a re-run of the migration) lands on
 * the same record instead of stacking copies.
 */
export declare function addContextManifest(table: RecordTable, passageId: string, manifest: StoredContextManifest): Promise<void>;
/**
 * One manifest by id: the per-record copy first, the legacy array as a fallback.
 *
 * The fallback keeps a manifest written by an older build readable even if the
 * migration has not run yet, so no answer loses its audit trail in between.
 */
export declare function readContextManifest(table: RecordTable, passageId: string, contextId: string): StoredContextManifest | undefined;
/**
 * Move every manifest out of the capped per-passage arrays into its own record.
 *
 * Ordering is what makes this safe to interrupt: every manifest is durable before
 * any legacy array is emptied, and emptying happens only after all of them are.
 * A crash in between leaves the old records untouched, and the next open rewrites
 * the same per-record keys — writing by manifest id is idempotent — so the move
 * either completes or is retried, never half-applied.
 *
 * @param table - The record table.
 * @param versions - Domain versions, recorded in the marker for audit.
 * @returns What the run did; `ran: false` means there was nothing to move.
 */
export declare function migrateContextsToPerRecord(table: RecordTable, versions: {
    fromVersion: number;
    toVersion: number;
}): Promise<MigrationReport>;
export interface AddMessageInput {
    passageId: string;
    branchId: string;
    author: 'user' | 'model';
    text: string;
    generation?: StoredDiscussionMessage['generation'];
    contextId?: string | null;
    /** The grammar verdict for this answer, when an automatic path produced one. */
    extraction?: StoredDiscussionMessage['extraction'];
    operationId: string;
}
/**
 * Append one message to a branch.
 *
 * Idempotent on `operationId`: retrying the same send does not duplicate the
 * turn, and reusing the id with different text is a conflict rather than a quiet
 * edit of what the reader already saw.
 */
export declare function appendMessage(table: RecordTable, input: AddMessageInput): Promise<{
    appended: boolean;
    alreadyAppended?: boolean;
    duplicateText?: boolean;
    reason?: string;
    branchId?: string;
    messageId?: string;
    branch?: StoredDiscussionBranch;
}>;
/** Create a branch, optionally forked from one message of another branch. */
export declare function createBranch(table: RecordTable, input: {
    passageId: string;
    anchorId: string;
    kind: StoredDiscussionBranch['kind'];
    title: string;
    parentId?: string | null;
    forkedFrom?: {
        branchId: string;
        messageId: string;
    } | null;
    operationId: string;
}): Promise<{
    created: boolean;
    alreadyCreated?: boolean;
    reason?: string;
    branch?: StoredDiscussionBranch;
}>;
/**
 * Change a branch's own state, or rename it. This never touches messages: a
 * branch marked "understood" or "disputed" keeps everything that was said.
 */
export declare function setBranchStatus(table: RecordTable, input: {
    passageId: string;
    branchId: string;
    status?: StoredDiscussionBranch['status'];
    title?: string;
}): Promise<{
    updated: boolean;
    reason?: string;
    branch?: StoredDiscussionBranch;
}>;
/**
 * The history one branch's request may carry.
 *
 * A fork is a real boundary: the history stops at the forked message, so the
 * messages the source branch produced afterwards never enter this branch's
 * context. But a fork inherits what its source had itself inherited — a branch
 * forked from a branch forked from a branch carries the whole chain, each link cut
 * at its own fork point. Reading only the direct source's own messages would drop
 * everything the reader had established further up the chain, which is a silent
 * loss of context rather than a boundary.
 *
 * A branch without a fork carries its own messages only.
 */
export declare function branchHistory(discussion: StoredDiscussion, branch: StoredDiscussionBranch): StoredDiscussionMessage[];
/** Confirmed conclusions are decisions and are never rewritten by a later answer. */
export declare function addConclusion(table: RecordTable, input: {
    passageId: string;
    branchId: string;
    anchorId: string;
    messageId: string | null;
    text: string;
    status: StoredConclusion['status'];
    analysisRevision: number | null;
    operationId: string;
}): Promise<{
    added: boolean;
    alreadyAdded?: boolean;
    reason?: string;
    conclusion?: StoredConclusion;
}>;
/**
 * Append one content version.
 *
 * Every deliberate change to a rule, a section or a conclusion lands here, so
 * "what did this say before?" is answered by the record rather than by memory.
 */
export declare function appendContentVersion(table: RecordTable, input: {
    target: StoredContentVersion['target'];
    targetId: string;
    field: string;
    text: string;
    author: StoredContentVersion['author'];
    reason?: string | null;
    replacesId?: string | null;
    operationId: string;
}): Promise<{
    appended: boolean;
    alreadyAppended?: boolean;
    version?: StoredContentVersion;
}>;
/** Every version of one target field, newest last. */
export declare function contentVersions(table: RecordTable, targetId: string, field?: string): StoredContentVersion[];
/**
 * Set one grammar entry's mastery, as a deliberate act by the reader.
 *
 * This is the counterpart of the automatic path's whitelist: the automatic path
 * may never move mastery, and this function is the only thing that may. It records
 * who moved it and from what, so "how well do I know this" is answerable and not a
 * silent side effect of a model answer.
 *
 * `expectedRevision` makes the write a compare-and-set: a reader who looked at
 * revision 4 and saves over revision 5 is told the entry changed rather than
 * silently overwriting it.
 */
export declare function setGrammarMastery(table: RecordTable, input: {
    entryId: string;
    mastery: 'learning' | 'reviewing' | 'known';
    /** The revision the caller saw; null skips the check deliberately. */
    expectedRevision: number | null;
    operationId: string;
}): Promise<{
    updated: boolean;
    alreadyUpdated?: boolean;
    reason?: string;
    revision?: number;
    previous?: string;
}>;
/**
 * Merge same-named grammar entries into one, on the reader's explicit decision.
 *
 * The kept entry supplies the rule text and the mastery state (the strongest
 * claim among the merged entries wins, because a merge must not silently say the
 * reader knows less). Examples and pitfalls move in, de-duplicated by their text,
 * and the question count is summed so the merged entry keeps the real usage
 * history. The other records are deleted: one topic, one entry.
 */
export declare function mergeGrammarEntries(table: RecordTable, input: {
    keepEntryId: string;
    mergeEntryIds: readonly string[];
    operationId: string;
}): Promise<{
    merged: boolean;
    alreadyMerged?: boolean;
    reason?: string;
    entryId?: string;
    revision?: number;
    examples?: number;
    pitfalls?: number;
    mastery?: 'learning' | 'reviewing' | 'known';
}>;
/** Every stored conclusion of one passage, newest last. */
export declare function listConclusions(table: RecordTable, passageId: string): StoredConclusion[];
/** The record kinds this module owns, for the import gate. */
export declare const DISCUSSION_RECORD_KINDS: readonly ["discussion", "contexts", "contextManifest", "conclusions", "contentVersion", "storageMigration"];
export type DiscussionRecord = Extract<PassageRecord, {
    kind: 'discussion' | 'contexts' | 'contextManifest' | 'conclusions' | 'contentVersion' | 'storageMigration';
}>;
/** Grammar entries from the table. */
export declare function readGrammarEntries(table: RecordTable): StoredGrammarEntry[];
