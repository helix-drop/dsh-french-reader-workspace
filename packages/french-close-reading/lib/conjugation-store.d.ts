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
import type { ConjugationDataset } from './conjugation-data.ts';
import type { StoredConjugationRecord } from './domain.ts';
import type { RecordTable } from './lexicon-store.ts';
/** A record key is path-safe: the lemma is normalised and hex-encoded. */
export declare const conjugationKey: (lemma: string) => string;
/** What a card can say about one lemma. */
export type ConjugationAnswer = {
    kind: 'dataset';
    record: StoredConjugationRecord;
} | {
    kind: 'pending';
    record: StoredConjugationRecord;
    reason: string;
} | {
    kind: 'no-data';
    lemma: string;
    reason: string;
};
/** One lemma's record, or undefined when nothing was ever fetched for it. */
export declare function readConjugationRecord(table: RecordTable, lemma: string): StoredConjugationRecord | undefined;
/** Every stored dataset, newest first. */
export declare function listConjugationRecords(table: RecordTable): StoredConjugationRecord[];
/**
 * What the card should say about one lemma.
 *
 * `no-data` is a first-class answer, not an error: it is what an honest card says
 * before anything was fetched, and it never falls back to a generated paradigm.
 */
export declare function answerForLemma(table: RecordTable, lemma: string): ConjugationAnswer;
/** Store one fetched dataset with its provenance and fetch state. */
export declare function writeConjugationDataset(table: RecordTable, input: {
    lemma: string;
    dataset: ConjugationDataset | null;
    source: string;
    sourceVersion: string;
    fetchStatus: StoredConjugationRecord['fetchStatus'];
    failure?: string | null;
    /** The forms the fetch did not retrieve, so an incomplete paradigm says which. */
    missingForms?: readonly string[];
}): Promise<StoredConjugationRecord>;
/**
 * Merge a newly fetched tense into an existing dataset.
 *
 * A paradigm is assembled a tense at a time under a request budget, so a second run
 * must not throw the first run's tenses away. Tenses present in both are replaced by
 * the newer fetch — the same source, read again — while tenses only one side has are
 * kept.
 */
export declare function mergeDataset(existing: ConjugationDataset | null, fetched: ConjugationDataset): ConjugationDataset;
/** The persons a dataset is still missing for one tense, so a card can say what is absent. */
export declare function missingPersons(dataset: ConjugationDataset, slot: {
    mood: string;
    tense: string;
}): string[];
