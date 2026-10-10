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
import type {
  PassageRecord,
  StoredGrammarEntry,
  StoredConclusion,
  StoredContentVersion,
  StoredContextManifest,
  StoredContexts,
  StoredConclusions,
  StoredDiscussion,
  StoredDiscussionBranch,
  StoredDiscussionMessage,
} from './domain.ts'
import { grammarHash, type RecordTable } from './lexicon-store.ts'
import { grammarKey } from './limits.ts'

export const discussionKey = (passageId: string): string => `discussion_${passageId}`
export const contextsKey = (passageId: string): string => `contexts_${passageId}`
export const conclusionsKey = (passageId: string): string => `conclusions_${passageId}`
export const contentVersionKey = (id: string): string => `version_${id}`

export function readDiscussion(table: RecordTable, passageId: string): StoredDiscussion {
  const record = table.get(discussionKey(passageId))
  return record?.kind === 'discussion' ? record.payload : { passageId, branches: [] }
}

export async function writeDiscussion(table: RecordTable, value: StoredDiscussion): Promise<void> {
  await table.put(discussionKey(value.passageId), {
    kind: 'discussion', recordVersion: 1, payload: value,
  })
}

export function readContexts(table: RecordTable, passageId: string): StoredContexts {
  const record = table.get(contextsKey(passageId))
  return record?.kind === 'contexts' ? record.payload : { passageId, manifests: [] }
}

export async function writeContexts(table: RecordTable, value: StoredContexts): Promise<void> {
  await table.put(contextsKey(value.passageId), {
    kind: 'contexts', recordVersion: 1, payload: value,
  })
}

export function readConclusions(table: RecordTable, passageId: string): StoredConclusions {
  const record = table.get(conclusionsKey(passageId))
  return record?.kind === 'conclusions' ? record.payload : { passageId, conclusions: [] }
}

export async function writeConclusions(table: RecordTable, value: StoredConclusions): Promise<void> {
  await table.put(conclusionsKey(value.passageId), {
    kind: 'conclusions', recordVersion: 1, payload: value,
  })
}

/**
 * The record key of one compiled context.
 *
 * Manifests used to live in a single per-passage array capped at 200, which made
 * "what exactly was sent with this answer" expire under ordinary use — the one
 * record an audit depends on. Each manifest is now its own record: unbounded
 * provenance for the price of one small document per turn.
 */
export const contextManifestKey = (contextId: string): string => `context_${contextId}`

/** The record key of one storage migration marker. */
export const migrationKey = (name: string): string => `migration_${name}`

/** The migration that moved context manifests out of their capped arrays. */
export const CONTEXT_MIGRATION_NAME = 'contexts-to-per-record'

/** What one migration did, as stored: the audit trail of a data move. */
export interface MigrationReport {
  ran: boolean
  migrated: number
  skipped: number
  emptied: number
}

/**
 * Store one compiled manifest as its own record.
 *
 * The key is the manifest id, which is already what every message references, so
 * writing the same manifest twice (a retry, a re-run of the migration) lands on
 * the same record instead of stacking copies.
 */
export async function addContextManifest(
  table: RecordTable,
  passageId: string,
  manifest: StoredContextManifest,
): Promise<void> {
  await table.put(contextManifestKey(manifest.id), {
    kind: 'contextManifest', recordVersion: 1, payload: manifest,
  })
}

/**
 * One manifest by id: the per-record copy first, the legacy array as a fallback.
 *
 * The fallback keeps a manifest written by an older build readable even if the
 * migration has not run yet, so no answer loses its audit trail in between.
 */
export function readContextManifest(
  table: RecordTable,
  passageId: string,
  contextId: string,
): StoredContextManifest | undefined {
  const direct = table.get(contextManifestKey(contextId))
  if (direct?.kind === 'contextManifest') return direct.payload
  return readContexts(table, passageId).manifests.find((entry) => entry.id === contextId)
}

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
export async function migrateContextsToPerRecord(
  table: RecordTable,
  versions: { fromVersion: number; toVersion: number },
): Promise<MigrationReport> {
  const legacy: { key: string; passageId: string; manifests: StoredContextManifest[] }[] = []
  for (const [key, record] of table.entries()) {
    if (record.kind !== 'contexts') continue
    if (record.payload.manifests.length === 0) continue
    legacy.push({ key, passageId: record.payload.passageId, manifests: record.payload.manifests })
  }
  if (legacy.length === 0) return { ran: false, migrated: 0, skipped: 0, emptied: 0 }

  let migrated = 0
  let skipped = 0
  for (const entry of legacy) {
    for (const manifest of entry.manifests) {
      if (table.get(contextManifestKey(manifest.id)) !== undefined) {
        skipped += 1
        continue
      }
      await table.put(contextManifestKey(manifest.id), {
        kind: 'contextManifest', recordVersion: 1, payload: manifest,
      })
      migrated += 1
    }
  }

  let emptied = 0
  for (const entry of legacy) {
    // Emptying rather than deleting: the record stays valid under this schema, so
    // an older build reading the same medium still opens instead of failing.
    await table.put(entry.key, {
      kind: 'contexts', recordVersion: 1, payload: { passageId: entry.passageId, manifests: [] },
    })
    emptied += 1
  }

  await table.put(migrationKey(CONTEXT_MIGRATION_NAME), {
    kind: 'storageMigration',
    recordVersion: 1,
    payload: {
      name: CONTEXT_MIGRATION_NAME,
      fromVersion: versions.fromVersion,
      toVersion: versions.toVersion,
      migratedManifests: migrated,
      skippedManifests: skipped,
      emptiedLegacyRecords: emptied,
      migratedAt: new Date().toISOString(),
    },
  })

  return { ran: true, migrated, skipped, emptied }
}

export interface AddMessageInput {
  passageId: string
  branchId: string
  author: 'user' | 'model'
  text: string
  generation?: StoredDiscussionMessage['generation']
  contextId?: string | null
  /** The grammar verdict for this answer, when an automatic path produced one. */
  extraction?: StoredDiscussionMessage['extraction']
  operationId: string
}

/**
 * Append one message to a branch.
 *
 * Idempotent on `operationId`: retrying the same send does not duplicate the
 * turn, and reusing the id with different text is a conflict rather than a quiet
 * edit of what the reader already saw.
 */
export async function appendMessage(
  table: RecordTable,
  input: AddMessageInput,
): Promise<{ appended: boolean; alreadyAppended?: boolean; duplicateText?: boolean; reason?: string; branchId?: string; messageId?: string; branch?: StoredDiscussionBranch }> {
  const store = readDiscussion(table, input.passageId)
  const branch = store.branches.find((entry) => entry.id === input.branchId)
  if (branch === undefined) return { appended: false, reason: 'branch-unknown' }
  const repeated = branch.messages.find((message) => message.operationId === input.operationId)
  if (repeated !== undefined) {
    return repeated.text === input.text && repeated.author === input.author
      ? { appended: false, alreadyAppended: true, branchId: branch.id, messageId: repeated.id, branch }
      : { appended: false, reason: 'operation-used' }
  }

  const message: StoredDiscussionMessage = {
    id: globalThis.crypto.randomUUID(),
    author: input.author,
    text: input.text,
    generation: input.generation ?? null,
    contextId: input.contextId ?? null,
    extraction: input.extraction ?? null,
    createdAt: new Date().toISOString(),
    operationId: input.operationId,
  }
  const updated: StoredDiscussionBranch = {
    ...branch,
    messages: [...branch.messages, message],
    updatedAt: message.createdAt,
  }
  await writeDiscussion(table, {
    passageId: input.passageId,
    branches: store.branches.map((entry) => entry.id === branch.id ? updated : entry),
  })
  return { appended: true, branchId: updated.id, messageId: message.id, branch: updated }
}

/** Create a branch, optionally forked from one message of another branch. */
export async function createBranch(table: RecordTable, input: {
  passageId: string
  anchorId: string
  kind: StoredDiscussionBranch['kind']
  title: string
  parentId?: string | null
  forkedFrom?: { branchId: string; messageId: string } | null
  operationId: string
}): Promise<{ created: boolean; alreadyCreated?: boolean; reason?: string; branch?: StoredDiscussionBranch }> {
  const store = readDiscussion(table, input.passageId)
  const repeated = store.branches.find((branch) => branch.operationId === input.operationId)
  if (repeated !== undefined) {
    return repeated.title === input.title && repeated.anchorId === input.anchorId
      ? { created: false, alreadyCreated: true, branch: repeated }
      : { created: false, reason: 'operation-used' }
  }
  if (input.parentId !== null && input.parentId !== undefined
    && !store.branches.some((branch) => branch.id === input.parentId)) {
    return { created: false, reason: 'parent-unknown' }
  }
  if (input.forkedFrom !== null && input.forkedFrom !== undefined) {
    const source = store.branches.find((branch) => branch.id === input.forkedFrom!.branchId)
    if (source === undefined) return { created: false, reason: 'fork-source-unknown' }
    if (!source.messages.some((message) => message.id === input.forkedFrom!.messageId)) {
      return { created: false, reason: 'fork-message-unknown' }
    }
  }

  const now = new Date().toISOString()
  const branch: StoredDiscussionBranch = {
    id: globalThis.crypto.randomUUID(),
    passageId: input.passageId,
    anchorId: input.anchorId,
    kind: input.kind,
    title: input.title,
    parentId: input.parentId ?? null,
    forkedFrom: input.forkedFrom ?? null,
    status: 'open',
    messages: [],
    createdAt: now,
    updatedAt: now,
    operationId: input.operationId,
  }
  await writeDiscussion(table, { passageId: input.passageId, branches: [...store.branches, branch] })
  return { created: true, branch }
}

/**
 * Change a branch's own state, or rename it. This never touches messages: a
 * branch marked "understood" or "disputed" keeps everything that was said.
 */
export async function setBranchStatus(table: RecordTable, input: {
  passageId: string
  branchId: string
  status?: StoredDiscussionBranch['status']
  title?: string
}): Promise<{ updated: boolean; reason?: string; branch?: StoredDiscussionBranch }> {
  const store = readDiscussion(table, input.passageId)
  const branch = store.branches.find((entry) => entry.id === input.branchId)
  if (branch === undefined) return { updated: false, reason: 'branch-unknown' }
  const updated: StoredDiscussionBranch = {
    ...branch,
    status: input.status ?? branch.status,
    title: input.title ?? branch.title,
    updatedAt: new Date().toISOString(),
  }
  await writeDiscussion(table, {
    passageId: input.passageId,
    branches: store.branches.map((entry) => entry.id === branch.id ? updated : entry),
  })
  return { updated: true, branch: updated }
}

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
export function branchHistory(
  discussion: StoredDiscussion,
  branch: StoredDiscussionBranch,
): StoredDiscussionMessage[] {
  // Cut-off segments, nearest first, then reversed into reading order.
  const segments: StoredDiscussionMessage[][] = [[...branch.messages]]
  const visited = new Set<string>([branch.id])
  let cursor: StoredDiscussionBranch = branch

  while (cursor.forkedFrom !== null) {
    const fork = cursor.forkedFrom
    // The forked message normally lives in the named branch. When that branch was
    // itself forked and the id was carried along, the message belongs to one of its
    // ancestors, so walk up until the branch that actually owns it is found.
    let owner: StoredDiscussionBranch | undefined =
      discussion.branches.find((entry) => entry.id === fork.branchId)
    const searched = new Set<string>()
    let at = owner === undefined ? -1 : owner.messages.findIndex((message) => message.id === fork.messageId)
    while (owner !== undefined && at === -1) {
      if (searched.has(owner.id)) {
        owner = undefined
        break
      }
      searched.add(owner.id)
      const up = owner.forkedFrom
      owner = up === null ? undefined : discussion.branches.find((entry) => entry.id === up.branchId)
      at = owner === undefined ? -1 : owner.messages.findIndex((message) => message.id === fork.messageId)
    }
    if (owner === undefined || at === -1 || visited.has(owner.id)) {
      // The fork cannot be resolved — its source or its message is gone, or the
      // chain loops. Carrying messages anyway would be a guess about what the
      // reader forked from, so the branch keeps only what can be proven.
      break
    }
    visited.add(owner.id)
    segments.unshift(owner.messages.slice(0, at + 1))
    cursor = owner
  }

  return segments.flat()
}

/** Confirmed conclusions are decisions and are never rewritten by a later answer. */
export async function addConclusion(table: RecordTable, input: {
  passageId: string
  branchId: string
  anchorId: string
  messageId: string | null
  text: string
  status: StoredConclusion['status']
  analysisRevision: number | null
  operationId: string
}): Promise<{ added: boolean; alreadyAdded?: boolean; reason?: string; conclusion?: StoredConclusion }> {
  const store = readConclusions(table, input.passageId)
  const repeated = store.conclusions.find((entry) => entry.operationId === input.operationId)
  if (repeated !== undefined) return { added: false, alreadyAdded: true, conclusion: repeated }

  const now = new Date().toISOString()
  const conclusion: StoredConclusion = {
    id: globalThis.crypto.randomUUID(),
    passageId: input.passageId,
    branchId: input.branchId,
    anchorId: input.anchorId,
    messageId: input.messageId,
    text: input.text,
    status: input.status,
    analysisRevision: input.analysisRevision,
    createdAt: now,
    updatedAt: now,
    operationId: input.operationId,
  }

  let conclusions = [...store.conclusions, conclusion]
  if (input.status === 'confirmed') {
    // A newer confirmed conclusion on the same anchor supersedes the older one
    // instead of silently replacing it: both stay readable.
    conclusions = conclusions.map((entry) => entry.id !== conclusion.id
      && entry.anchorId === input.anchorId
      && entry.status === 'confirmed'
      ? { ...entry, status: 'superseded' as const, updatedAt: now }
      : entry)
  }
  await writeConclusions(table, { passageId: input.passageId, conclusions })
  return { added: true, conclusion }
}

/**
 * Append one content version.
 *
 * Every deliberate change to a rule, a section or a conclusion lands here, so
 * "what did this say before?" is answered by the record rather than by memory.
 */
export async function appendContentVersion(table: RecordTable, input: {
  target: StoredContentVersion['target']
  targetId: string
  field: string
  text: string
  author: StoredContentVersion['author']
  reason?: string | null
  replacesId?: string | null
  operationId: string
}): Promise<{ appended: boolean; alreadyAppended?: boolean; version?: StoredContentVersion }> {
  const id = versionIdFor(input)
  const existing = table.get(contentVersionKey(id))
  if (existing?.kind === 'contentVersion') return { appended: false, alreadyAppended: true, version: existing.payload }

  const version: StoredContentVersion = {
    id,
    target: input.target,
    targetId: input.targetId,
    field: input.field,
    text: input.text,
    author: input.author,
    reason: input.reason ?? null,
    replacesId: input.replacesId ?? null,
    createdAt: new Date().toISOString(),
    operationId: input.operationId,
  }
  await table.put(contentVersionKey(id), { kind: 'contentVersion', recordVersion: 1, payload: version })
  return { appended: true, version }
}

/** Every version of one target field, newest last. */
export function contentVersions(table: RecordTable, targetId: string, field?: string): StoredContentVersion[] {
  const versions: StoredContentVersion[] = []
  for (const [key, record] of table.entries()) {
    if (!key.startsWith('version_')) continue
    if (record.kind !== 'contentVersion') continue
    if (record.payload.targetId !== targetId) continue
    if (field !== undefined && record.payload.field !== field) continue
    versions.push(record.payload)
  }
  return versions.sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
}

/**
 * A stable id for one version write: the same deliberate change retried lands on
 * the same record instead of stacking a duplicate.
 */
function versionIdFor(input: { target: string; targetId: string; field: string; operationId: string }): string {
  // `${operationId}` alone is unique per call, but a retry of the same call
  // reuses it, which is exactly the idempotency this needs.
  return input.operationId
}

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
export async function setGrammarMastery(
  table: RecordTable,
  input: {
    entryId: string
    mastery: 'learning' | 'reviewing' | 'known'
    /** The revision the caller saw; null skips the check deliberately. */
    expectedRevision: number | null
    operationId: string
  },
): Promise<{ updated: boolean; alreadyUpdated?: boolean; reason?: string; revision?: number; previous?: string }> {
  const found = readGrammarEntries(table).find((entry) => entry.id === input.entryId)
  if (found === undefined) return { updated: false, reason: 'entry-unknown' }

  // A retried decision lands on the same record instead of counting as a second act.
  const existing = table.get(contentVersionKey(input.operationId))
  if (existing?.kind === 'contentVersion') {
    return {
      updated: false,
      alreadyUpdated: true,
      revision: found.revision,
      previous: existing.payload.reason ?? undefined,
    }
  }
  if (input.expectedRevision !== null && found.revision !== input.expectedRevision) {
    return { updated: false, reason: 'revision-conflict', revision: found.revision }
  }
  if (found.mastery === input.mastery) {
    // Setting the value it already has is not a change: no version, no write.
    return { updated: false, reason: 'unchanged', revision: found.revision, previous: found.mastery }
  }

  const now = new Date().toISOString()
  const updated: StoredGrammarEntry = {
    ...found,
    mastery: input.mastery,
    revision: found.revision + 1,
    updatedAt: now,
  }
  await writeGrammarEntry(table, updated)
  // The move is recorded as a version, with the previous state in the reason, so
  // the history of a reader's own judgement is readable.
  await appendContentVersion(table, {
    target: 'grammar-rule',
    targetId: found.id,
    field: 'mastery',
    text: input.mastery,
    author: 'user',
    reason: `${found.mastery} → ${input.mastery}`,
    operationId: input.operationId,
  })
  return { updated: true, revision: updated.revision, previous: found.mastery }
}

/** Which mastery state is the stronger claim; a merge never weakens one. */
const MASTERY_RANK: Record<'learning' | 'reviewing' | 'known', number> = { learning: 0, reviewing: 1, known: 2 }

/**
 * Merge same-named grammar entries into one, on the reader's explicit decision.
 *
 * The kept entry supplies the rule text and the mastery state (the strongest
 * claim among the merged entries wins, because a merge must not silently say the
 * reader knows less). Examples and pitfalls move in, de-duplicated by their text,
 * and the question count is summed so the merged entry keeps the real usage
 * history. The other records are deleted: one topic, one entry.
 */
export async function mergeGrammarEntries(
  table: RecordTable,
  input: { keepEntryId: string; mergeEntryIds: readonly string[]; operationId: string },
): Promise<{
  merged: boolean
  alreadyMerged?: boolean
  reason?: string
  entryId?: string
  revision?: number
  examples?: number
  pitfalls?: number
  mastery?: 'learning' | 'reviewing' | 'known'
}> {
  const entries = readGrammarEntries(table)
  const keep = entries.find((entry) => entry.id === input.keepEntryId)
  if (keep === undefined) return { merged: false, reason: 'entry-unknown' }
  // A retried merge lands on the same outcome instead of merging twice. This is
  // checked before the candidate list: the first attempt deleted them, and a
  // retry must still read as the same success, not as "nothing to merge".
  const existing = table.get(contentVersionKey(input.operationId))
  if (existing?.kind === 'contentVersion') {
    return { merged: true, alreadyMerged: true, entryId: keep.id, revision: keep.revision }
  }

  const wanted = new Set(input.mergeEntryIds.filter((id) => id !== input.keepEntryId))
  const others = entries.filter((entry) => wanted.has(entry.id))
  if (others.length === 0) return { merged: false, reason: 'nothing-to-merge' }

  const exampleTexts = keep.examples.map((example) => example.text)
  const examples = [...keep.examples]
  const pitfalls = [...keep.pitfalls]
  for (const other of others) {
    for (const example of other.examples) {
      if (exampleTexts.includes(example.text)) continue
      exampleTexts.push(example.text)
      examples.push(example)
    }
    for (const pitfall of other.pitfalls) {
      if (pitfalls.some((entry) => entry.text === pitfall.text)) continue
      pitfalls.push(pitfall)
    }
  }
  const firstFilled = (pick: (entry: StoredGrammarEntry) => string): string => {
    const own = pick(keep).trim()
    if (own !== '') return pick(keep)
    const found = others.find((entry) => pick(entry).trim() !== '')
    return found === undefined ? '' : pick(found)
  }
  const lastAskedAt = [keep, ...others]
    .map((entry) => entry.lastAskedAt)
    .filter((value): value is string => typeof value === 'string')
    .sort()
    .pop() ?? null
  const mastery = [keep, ...others].reduce<'learning' | 'reviewing' | 'known'>(
    (best, entry) => (MASTERY_RANK[entry.mastery] > MASTERY_RANK[best] ? entry.mastery : best),
    keep.mastery,
  )
  const contentStatus = keep.contentStatus === 'user' && others.some((entry) => entry.contentStatus !== 'user')
    ? 'mixed'
    : keep.contentStatus === 'ai-unverified' && others.some((entry) => entry.contentStatus === 'user')
      ? 'mixed'
      : keep.contentStatus
  const now = new Date().toISOString()
  const merged: StoredGrammarEntry = {
    ...keep,
    level: keep.level ?? others.find((entry) => entry.level !== null)?.level ?? null,
    module: keep.module ?? others.find((entry) => entry.module !== null)?.module ?? null,
    keyPoints: firstFilled((entry) => entry.keyPoints),
    notes: firstFilled((entry) => entry.notes),
    examples,
    pitfalls,
    mastery,
    contentStatus,
    askCount: [keep, ...others].reduce((total, entry) => total + entry.askCount, 0),
    lastAskedAt,
    revision: keep.revision + 1,
    operationId: input.operationId,
    updatedAt: now,
  }
  await writeGrammarEntry(table, merged)
  // Delete by the key each record actually lives at, not by the key its topic
  // derives: a duplicate that arrived through an imported backup carries a
  // foreign key, and that is exactly the duplicate this feature exists for.
  const doomed = new Set(others.map((entry) => entry.id))
  const keys: string[] = []
  for (const [key, record] of table.entries()) {
    if (record.kind === 'grammar' && doomed.has(record.payload.id)) keys.push(key)
  }
  for (const key of keys) await table.delete(key)
  await appendContentVersion(table, {
    target: 'grammar-rule',
    targetId: keep.id,
    field: 'merge',
    text: String(others.length),
    author: 'user',
    reason: `merged ${others.map((entry) => entry.id).join(',')}`,
    operationId: input.operationId,
  })
  return {
    merged: true,
    entryId: merged.id,
    revision: merged.revision,
    examples: examples.length - keep.examples.length,
    pitfalls: pitfalls.length - keep.pitfalls.length,
    mastery: merged.mastery,
  }
}

/** Every stored conclusion of one passage, newest last. */
export function listConclusions(table: RecordTable, passageId: string): StoredConclusion[] {
  return readConclusions(table, passageId).conclusions
}

/** The record kinds this module owns, for the import gate. */
export const DISCUSSION_RECORD_KINDS = [
  'discussion', 'contexts', 'contextManifest', 'conclusions', 'contentVersion', 'storageMigration',
] as const

export type DiscussionRecord = Extract<
  PassageRecord,
  {
    kind:
      | 'discussion' | 'contexts' | 'contextManifest' | 'conclusions' | 'contentVersion' | 'storageMigration'
  }
>

/** Grammar entries from the table. */
export function readGrammarEntries(table: RecordTable): StoredGrammarEntry[] {
  const entries: StoredGrammarEntry[] = []
  for (const [, record] of table.entries()) {
    if (record.kind === 'grammar') entries.push(record.payload)
  }
  return entries
}

/**
 * Write one grammar entry under the key its topic derives.
 *
 * This must be the same key the controller writes: deriving it from the entry id
 * here would leave the topic index pointing at an entry that is never updated.
 */
async function writeGrammarEntry(table: RecordTable, entry: StoredGrammarEntry): Promise<void> {
  await table.put(grammarKey(await grammarHash(entry.topicKey)), {
    kind: 'grammar', recordVersion: 1, payload: entry,
  })
}
