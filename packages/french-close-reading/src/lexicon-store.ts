/**
 * The vocabulary library: exact-Mot lookup over a rebuildable index, entry
 * creation that never overwrites, per-reading occurrences, policy rendering and
 * truthful source records.
 *
 * Every function here takes the storage table it must read and write, so the
 * module owns the rules while the controller keeps owning the write chain. A stored
 * entry is authoritative: a hit is returned as is, and nothing on the lookup path
 * calls a model or the network.
 */
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'

import {
  EXCERPT_CHARACTERS,
  LEXICON_INDEX_KEY,
  lexiconKey,
  type PassageRecord,
  type StoredLexiconEntry,
  type StoredLexiconIndex,
} from './domain.ts'
import {
  renderCard,
  validateCard,
  type PolicyInput,
  type SectionId,
} from './output-policy.ts'
import { judgeSource, toSourceRecord, type SourceFetch } from './source-gate.ts'
import type { LexiconLookup, LexiconView } from './types.ts'

export type RecordTable = KvTable<string, PassageRecord>

const SECTION_IDS = [
  'overview', 'sense', 'etymology', 'semanticEvolution',
  'conjugation', 'collocations', 'culture', 'fixedExpressions',
] as const

export function isSectionId(value: string): value is SectionId {
  return (SECTION_IDS as readonly string[]).includes(value)
}

/** Exact-form lookup key: Unicode-normalised and lowercased, never stemmed. */
export function normaliseMot(mot: string): string {
  return mot.normalize('NFC').trim().toLowerCase()
}

/**
 * Stable, path-safe record key for one grammar topic.
 *
 * The controller writes grammar entries and the discussion store updates them, so
 * the derivation lives here rather than in either of them: two producers of the
 * same key must not be able to drift apart.
 */
export async function grammarHash(topicKey: string): Promise<string> {
  const bytes = new TextEncoder().encode(`grammar\u0000${topicKey}`)
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))
  return [...digest.slice(0, 16)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Stable, path-safe record key for one Mot + part of speech. */
export async function lexiconHash(motKey: string, partOfSpeech: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${motKey}\u0000${partOfSpeech}`)
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))
  return [...digest.slice(0, 16)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function addToIndex(index: StoredLexiconIndex, entry: StoredLexiconEntry): StoredLexiconIndex {
  const byForm: StoredLexiconIndex['byForm'] = { ...index.byForm }
  const link = (form: string, kind: 'exact' | 'form'): void => {
    const key = normaliseMot(form)
    if (key === '') return
    const links = byForm[key] ?? []
    if (links.some((candidate) => candidate.entryId === entry.id && candidate.kind === kind)) return
    byForm[key] = [...links, { entryId: entry.id, kind }]
  }
  link(entry.mot, 'exact')
  link(entry.motKey, 'exact')
  for (const form of entry.forms) link(form, 'form')
  return { byForm }
}

export function toLexiconView(entry: StoredLexiconEntry): LexiconView {
  return {
    entryId: entry.id,
    mot: entry.mot,
    lemma: entry.lemma,
    partOfSpeech: entry.partOfSpeech,
    forms: [...entry.forms],
    senses: entry.senses.map((sense) => ({ id: sense.id, label: sense.label, definition: sense.definition })),
    sections: { ...entry.sections },
    sources: entry.sources.map((source) => ({ ...source })),
    occurrences: entry.occurrences.map((occurrence) => ({ ...occurrence })),
    provenance: entry.provenance,
    status: entry.status,
    revision: entry.revision,
    updatedAt: entry.updatedAt,
  }
}

/** The policy module's view of a stored entry. */
export function toPolicyInput(entry: StoredLexiconEntry): PolicyInput {
  return {
    mot: entry.mot,
    lemma: entry.lemma,
    partOfSpeech: entry.partOfSpeech,
    senses: entry.senses.map((sense) => ({ label: sense.label, definition: sense.definition })),
    sections: {
      ...entry.sections,
      sense: entry.senses.map((sense) => sense.definition).join(' '),
    },
  }
}

export function readLexiconEntries(table: RecordTable): StoredLexiconEntry[] {
  const entries: StoredLexiconEntry[] = []
  for (const [, record] of table.entries()) {
    if (record.kind === 'lexicon') entries.push(record.payload)
  }
  return entries
}

export function readLexiconIndex(table: RecordTable): StoredLexiconIndex {
  const record = table.get(LEXICON_INDEX_KEY)
  return record?.kind === 'lexiconIndex' ? record.payload : { byForm: {} }
}

export async function writeLexiconIndex(table: RecordTable, index: StoredLexiconIndex): Promise<void> {
  await table.put(LEXICON_INDEX_KEY, { kind: 'lexiconIndex', recordVersion: 1, payload: index })
}

/**
 * Exact-Mot lookup. No model call and no network request happens here: a hit
 * returns the stored entry, a miss returns only *candidates*. A lemma match is a
 * candidate, never a hit, so `ouvrir` and `ouvrait` are never silently treated as
 * one input.
 */
export function lookupMot(table: RecordTable, mot: string, partOfSpeech: string | null): LexiconLookup {
  const motKey = normaliseMot(mot)
  const index = readLexiconIndex(table)
  const entries = readLexiconEntries(table)
  const byId = new Map(entries.map((entry) => [entry.id, entry]))

  const exact: StoredLexiconEntry[] = []
  const related: StoredLexiconEntry[] = []
  for (const link of index.byForm[motKey] ?? []) {
    const entry = byId.get(link.entryId)
    if (entry === undefined) continue
    if (partOfSpeech !== null && entry.partOfSpeech !== partOfSpeech) continue
    if (link.kind === 'exact') exact.push(entry)
    else related.push(entry)
  }
  return {
    mot,
    motKey,
    found: exact.length > 0,
    entries: exact.map(toLexiconView),
    candidates: related.map(toLexiconView),
  }
}

/**
 * Create one entry for an exact Mot. An existing entry is never overwritten: the
 * caller gets `exists` with the entry id and decides whether to append an
 * occurrence or edit deliberately.
 */
export async function createLexiconEntry(table: RecordTable, input: {
  mot: string
  partOfSpeech: string
  lemma: string | null
  forms: readonly string[]
  definition: string
  label: string
  provenance: 'ai' | 'user' | 'mixed'
  operationId: string
}): Promise<{ created: boolean; exists?: boolean; entryId?: string; reason?: string }> {
  if (input.mot.trim() === '') return { created: false, reason: 'mot-blank' }
  const motKey = normaliseMot(input.mot)
  const key = lexiconKey(await lexiconHash(motKey, input.partOfSpeech))
  const existing = table.get(key)
  // A homograph check: the record key is Mot + part of speech, so a different
  // spelling that hashes the same key would be a real collision, not a duplicate.
  if (existing?.kind === 'lexicon' && existing.payload.motKey === motKey
    && existing.payload.partOfSpeech === input.partOfSpeech) {
    return { created: false, exists: true, entryId: existing.payload.id }
  }
  if (existing !== undefined) return { created: false, reason: 'key-collision' }

  const now = new Date().toISOString()
  const entry: StoredLexiconEntry = {
    id: globalThis.crypto.randomUUID(),
    mot: input.mot,
    motKey,
    lemma: input.lemma,
    partOfSpeech: input.partOfSpeech,
    forms: [...new Set(input.forms.map((form) => form.trim()).filter((form) => form !== ''))],
    senses: input.definition.trim() === ''
      ? []
      : [{ id: globalThis.crypto.randomUUID(), label: input.label, definition: input.definition }],
    sections: {
      overview: null, etymology: null, semanticEvolution: null,
      collocations: null, culture: null, fixedExpressions: null, conjugation: null,
    },
    sources: [],
    occurrences: [],
    provenance: input.provenance,
    status: 'draft',
    revision: 1,
    operationId: input.operationId,
    createdAt: now,
    updatedAt: now,
  }
  // Entry first, then the index: a crash leaves an unreferenced entry that the
  // rebuild action can pick up, never an index pointing at nothing.
  await table.put(key, { kind: 'lexicon', recordVersion: 1, payload: entry })
  await writeLexiconIndex(table, addToIndex(readLexiconIndex(table), entry))
  return { created: true, entryId: entry.id }
}

/**
 * Append a context note for one reading. It lives in the occurrence list, so a
 * single reading never rewrites the entry's general senses or sections.
 */
export async function appendLexiconOccurrence(table: RecordTable, input: {
  entryId: string
  passageId: string
  anchorId: string
  excerpt: string
  note: string
  operationId: string
}): Promise<{ appended: boolean; alreadyAppended?: boolean; reason?: string; occurrenceId?: string }> {
  const found = readLexiconEntries(table).find((entry) => entry.id === input.entryId)
  if (found === undefined) return { appended: false, reason: 'entry-unknown' }
  const repeated = found.occurrences.find((occurrence) => occurrence.operationId === input.operationId)
  if (repeated !== undefined) return { appended: false, alreadyAppended: true, occurrenceId: repeated.id }

  const occurrence = {
    id: globalThis.crypto.randomUUID(),
    passageId: input.passageId,
    anchorId: input.anchorId,
    excerpt: input.excerpt.slice(0, EXCERPT_CHARACTERS),
    note: input.note,
    operationId: input.operationId,
    createdAt: new Date().toISOString(),
  }
  const updated: StoredLexiconEntry = {
    ...found,
    occurrences: [...found.occurrences, occurrence],
    revision: found.revision + 1,
    updatedAt: occurrence.createdAt,
  }
  await table.put(lexiconKey(await lexiconHash(found.motKey, found.partOfSpeech)), {
    kind: 'lexicon',
    recordVersion: 1,
    payload: updated,
  })
  return { appended: true, occurrenceId: occurrence.id }
}

/** Rebuild the derived index from the entries themselves. Explicit and verifiable. */
export async function rebuildLexiconIndex(table: RecordTable): Promise<{ entries: number; forms: number; repaired: number }> {
  const entries = readLexiconEntries(table)
  const previous = readLexiconIndex(table)
  let index: StoredLexiconIndex = { byForm: {} }
  for (const entry of entries) index = addToIndex(index, entry)
  const repaired = entries.filter((entry) => {
    const links = previous.byForm[entry.motKey] ?? []
    return !links.some((link) => link.entryId === entry.id && link.kind === 'exact')
  }).length
  await writeLexiconIndex(table, index)
  return { entries: entries.length, forms: Object.keys(index.byForm).length, repaired }
}

export function listLexicon(table: RecordTable): LexiconView[] {
  return readLexiconEntries(table)
    .sort((left, right) => left.motKey.localeCompare(right.motKey))
    .map(toLexiconView)
}

/**
 * Render one entry through its policy and report what the policy refuses.
 * Rendering and validation use the same sections, so a card cannot look complete
 * while the gate disagrees.
 */
export function renderLexiconEntry(
  table: RecordTable,
  input: { entryId: string; wantsEtymology?: boolean },
): { found: boolean; rendered?: string; sections?: { number: string; title: string; required: boolean }[]; errors?: string[]; hints?: string[] } {
  const entry = readLexiconEntries(table).find((candidate) => candidate.id === input.entryId)
  if (entry === undefined) return { found: false }
  const options = { wantsEtymology: input.wantsEtymology === true }
  const policy = validateCard(toPolicyInput(entry), options)
  return {
    found: true,
    rendered: renderCard(toPolicyInput(entry), options),
    sections: policy.sections.map((section) => ({
      number: section.number,
      title: section.title,
      required: section.required,
    })),
    errors: policy.errors,
    hints: policy.hints,
  }
}

/**
 * Record what a source fetch may be claimed for.
 *
 * The response is judged, never assumed: an HTTP 200 with only site chrome is
 * stored as a failed fetch with its reason, so the card shows the attempt instead
 * of asserting a source it does not have.
 */
export async function recordLexiconSource(table: RecordTable, input: SourceFetch & { entryId: string }):
Promise<{ recorded: boolean; reason?: string; ok?: boolean; outcome?: string; note?: string }> {
  const entry = readLexiconEntries(table).find((candidate) => candidate.id === input.entryId)
  if (entry === undefined) return { recorded: false, reason: 'entry-unknown' }
  if (!isSectionId(input.section)) return { recorded: false, reason: 'section-unknown' }

  const verdict = judgeSource(input)
  const record = toSourceRecord(input)
  const updated: StoredLexiconEntry = {
    ...entry,
    sources: [...entry.sources, record],
    revision: entry.revision + 1,
    updatedAt: new Date().toISOString(),
  }
  await table.put(lexiconKey(await lexiconHash(entry.motKey, entry.partOfSpeech)), {
    kind: 'lexicon',
    recordVersion: 1,
    payload: updated,
  })
  return { recorded: true, ok: verdict.ok, outcome: verdict.outcome, note: record.note }
}

/**
 * Write one section explicitly. A stored entry is authoritative, so a missing
 * section is filled by a deliberate act — never by fetching on the reader's
 * behalf. Each write appends a version, so a replaced wording stays readable.
 */
export async function setLexiconSection(table: RecordTable, input: { entryId: string; section: string; text: string }):
Promise<{ updated: boolean; reason?: string; errors?: string[] }> {
  const entry = readLexiconEntries(table).find((candidate) => candidate.id === input.entryId)
  if (entry === undefined) return { updated: false, reason: 'entry-unknown' }
  if (!isSectionId(input.section)) return { updated: false, reason: 'section-unknown' }
  const updated: StoredLexiconEntry = {
    ...entry,
    sections: { ...entry.sections, [input.section]: input.text },
    revision: entry.revision + 1,
    // Only a real content change moves the content date. Re-rendering a card, or
    // opening it again, is a read and never reaches this path.
    updatedAt: new Date().toISOString(),
  }
  await table.put(lexiconKey(await lexiconHash(entry.motKey, entry.partOfSpeech)), {
    kind: 'lexicon',
    recordVersion: 1,
    payload: updated,
  })
  return { updated: true, errors: validateCard(toPolicyInput(updated)).errors }
}

/** The schema one lexicon record must satisfy; exported for import validation. */
export const lexiconRecordSchema = z.object({ kind: z.literal('lexicon') })
