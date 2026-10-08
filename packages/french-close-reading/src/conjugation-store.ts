/**
 * The conjugation dataset store.
 *
 * A dataset is kept because it was **fetched**, never because it was plausible: each
 * record carries where it came from, when, and how far the fetch got. That makes the
 * three answers a card can give distinguishable, which is the whole point of the
 * feature:
 *
 * - *here are the bases*, with the source named;
 * - *this paradigm is incomplete* — some forms were not retrieved, and the record
 *   says which;
 * - *no data* — nothing has been fetched for this lemma, so the card says so instead
 *   of conjugating from memory.
 *
 * A 429 from the source is its own state, because "try again later" is not the same
 * as "this verb has no forms".
 */
import type { ConjugationDataset } from './conjugation-data.ts'
import type { StoredConjugationRecord } from './domain.ts'
import type { RecordTable } from './lexicon-store.ts'

/** A record key is path-safe: the lemma is normalised and hex-encoded. */
export const conjugationKey = (lemma: string): string =>
  `conj_${[...lemma.trim().toLowerCase().normalize('NFC')]
    .map((character) => character.codePointAt(0)!.toString(16))
    .join('')}`

/** What a card can say about one lemma. */
export type ConjugationAnswer =
  | { kind: 'dataset'; record: StoredConjugationRecord }
  | { kind: 'pending'; record: StoredConjugationRecord; reason: string }
  | { kind: 'no-data'; lemma: string; reason: string }

/** One lemma's record, or undefined when nothing was ever fetched for it. */
export function readConjugationRecord(table: RecordTable, lemma: string): StoredConjugationRecord | undefined {
  const record = table.get(conjugationKey(lemma))
  return record?.kind === 'conjugationDataset' ? record.payload : undefined
}

/** Every stored dataset, newest first. */
export function listConjugationRecords(table: RecordTable): StoredConjugationRecord[] {
  const records: StoredConjugationRecord[] = []
  for (const [, record] of table.entries()) {
    if (record.kind === 'conjugationDataset') records.push(record.payload)
  }
  return records.sort((left, right) => right.fetchedAt.localeCompare(left.fetchedAt))
}

/**
 * What the card should say about one lemma.
 *
 * `no-data` is a first-class answer, not an error: it is what an honest card says
 * before anything was fetched, and it never falls back to a generated paradigm.
 */
export function answerForLemma(table: RecordTable, lemma: string): ConjugationAnswer {
  const record = readConjugationRecord(table, lemma)
  if (record === undefined) {
    return { kind: 'no-data', lemma, reason: '尚未获取该动词的读音数据' }
  }
  if (record.dataset === null) {
    return { kind: 'pending', record, reason: record.failure ?? `数据未取得（${record.fetchStatus}）` }
  }
  return { kind: 'dataset', record }
}

/** Store one fetched dataset with its provenance and fetch state. */
export async function writeConjugationDataset(
  table: RecordTable,
  input: {
    lemma: string
    dataset: ConjugationDataset | null
    source: string
    sourceVersion: string
    fetchStatus: StoredConjugationRecord['fetchStatus']
    failure?: string | null
    /** The forms the fetch did not retrieve, so an incomplete paradigm says which. */
    missingForms?: readonly string[]
  },
): Promise<StoredConjugationRecord> {
  const existing = readConjugationRecord(table, input.lemma)
  const now = new Date().toISOString()
  const record: StoredConjugationRecord = {
    id: existing?.id ?? globalThis.crypto.randomUUID(),
    lemma: input.lemma,
    source: input.source,
    sourceVersion: input.sourceVersion,
    fetchStatus: input.fetchStatus,
    failure: input.failure ?? null,
    missingForms: [...(input.missingForms ?? [])],
    dataset: input.dataset,
    fetchedAt: now,
    updatedAt: now,
  }
  await table.put(conjugationKey(input.lemma), {
    kind: 'conjugationDataset', recordVersion: 1, payload: record,
  })
  return record
}

/**
 * Merge a newly fetched tense into an existing dataset.
 *
 * A paradigm is assembled a tense at a time under a request budget, so a second run
 * must not throw the first run's tenses away. Tenses present in both are replaced by
 * the newer fetch — the same source, read again — while tenses only one side has are
 * kept.
 */
export function mergeDataset(
  existing: ConjugationDataset | null,
  fetched: ConjugationDataset,
): ConjugationDataset {
  if (existing === null) return fetched
  const merged = [...existing.tenses]
  for (const tense of fetched.tenses) {
    const at = merged.findIndex((entry) => entry.mood === tense.mood && entry.tense === tense.tense)
    if (at === -1) merged.push(tense)
    else merged[at] = tense
  }
  return { ...fetched, tenses: merged }
}

/** The persons a dataset is still missing for one tense, so a card can say what is absent. */
export function missingPersons(dataset: ConjugationDataset, slot: { mood: string; tense: string }): string[] {
  const tense = dataset.tenses.find((entry) => entry.mood === slot.mood && entry.tense === slot.tense)
  if (tense === undefined) return ['1s', '2s', '3s', '1p', '2p', '3p']
  const present = new Set(tense.forms.map((form) => form.person))
  return (['1s', '2s', '3s', '1p', '2p', '3p'] as const).filter((person) => !present.has(person))
}
