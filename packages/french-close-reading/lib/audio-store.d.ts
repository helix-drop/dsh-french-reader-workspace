/**
 * The audio take store: one record per source fingerprint, append-only inside it.
 *
 * The rules the contract states are implemented here as arithmetic on one list,
 * not as conventions a caller has to remember:
 *
 * - **append**: a regeneration adds a take; no stored take is replaced in place;
 * - **idempotent**: the same `takeId` — or the same `requestId`, which is what a
 *   retry actually repeats — finds its take instead of writing a second one;
 * - **revision-scoped**: the record key is derived from the fingerprint, so the
 *   takes of an older `sourceRevision`/`sentenceRevision` are a *different*
 *   record. "That audio is stale" is answered by absence rather than by a flag
 *   someone could forget to set;
 * - **select**: a selection names one stored take of this exact fingerprint;
 *   nothing else is selectable.
 *
 * The bytes live in the record as base64, with the mime type, the measured
 * duration and the byte count beside them, so a card can say how long a take is
 * without decoding it.
 */
import type { RecordTable } from './lexicon-store.ts';
import type { StoredAudioVoice, StoredInflectionAudioTake, StoredSentenceAudioTake, StoredSpeechBackend } from './domain.ts';
/**
 * How many takes one source keeps.
 *
 * Audio is stored inside the record, so the list cannot grow without bound. The
 * cap is generous (a reader would have to regenerate the same sentence two dozen
 * times) and trimming is reported back rather than hidden: the oldest takes
 * beyond it are dropped, and the selected take is never one of them.
 */
export declare const MAX_AUDIO_TAKES = 24;
export interface SentenceAudioLocator {
    passageId: string;
    sentenceId: string;
    sourceRevision: number;
    sentenceRevision: number;
}
export interface InflectionAudioLocator {
    formId: string;
    inflectionRevision: number;
}
/**
 * The source fingerprint: what identifies the audio's source and nothing else.
 *
 * Titles, chapter names and the current selection are deliberately absent from
 * it — renaming a paragraph must not invalidate audio — while both revisions are
 * present, because a corrected sentence does.
 */
export declare function sentenceAudioSourceKey(source: SentenceAudioLocator): string;
export declare function inflectionAudioSourceKey(source: InflectionAudioLocator): string;
export declare const sentenceAudioRecordKey: (fingerprint: string) => Promise<string>;
export declare const inflectionAudioRecordKey: (fingerprint: string) => Promise<string>;
/** What one append did, so a replay and a trim are both visible to the caller. */
export interface AppendTakeOutcome<Take> {
    take: Take;
    /** False when this takeId or requestId was already stored: nothing was written twice. */
    appended: boolean;
    /** How many older takes the cap dropped; never the selected one. */
    trimmed: number;
    /** The fingerprint this take belongs to. */
    sourceKey: string;
    recordKey: string;
}
/** Every take of one fingerprint, newest first. */
export interface AudioTakeList<Take> {
    sourceKey: string;
    takes: Take[];
    selectedTakeId: string | null;
}
export type SelectTakeOutcome = {
    kind: 'selected';
    takeId: string;
} | {
    kind: 'already-selected';
    takeId: string;
} | {
    kind: 'unknown-source';
} | {
    kind: 'unknown-take';
}
/** The stored take belongs to another revision than the one asked for. */
 | {
    kind: 'revision-mismatch';
    storedRevision: number;
};
/** One stored audio asset, as a caller reads it to hand to a player. */
export interface StoredAudioAsset {
    takeId: string;
    mimeType: string;
    /** The bytes themselves, base64-encoded. */
    base64: string;
    bytes: number;
    durationMs: number;
    createdAt: string;
}
export declare function appendSentenceAudioTake(table: RecordTable, take: StoredSentenceAudioTake): Promise<AppendTakeOutcome<StoredSentenceAudioTake>>;
export declare function listSentenceAudioTakes(table: RecordTable, source: SentenceAudioLocator): Promise<AudioTakeList<StoredSentenceAudioTake>>;
export declare function selectSentenceAudioTake(table: RecordTable, source: SentenceAudioLocator, takeId: string): Promise<SelectTakeOutcome>;
export declare function readSentenceAudioAsset(table: RecordTable, source: SentenceAudioLocator, takeId: string): Promise<StoredAudioAsset | null>;
/** The newest take of this fingerprint made by exactly this backend and voice. */
export declare function newestSentenceAudioTake(list: AudioTakeList<StoredSentenceAudioTake>, wanted: {
    backend: StoredSpeechBackend;
    voice: StoredAudioVoice;
}, agrees?: (take: StoredSentenceAudioTake) => boolean): StoredSentenceAudioTake | null;
export declare function appendInflectionAudioTake(table: RecordTable, take: StoredInflectionAudioTake): Promise<AppendTakeOutcome<StoredInflectionAudioTake>>;
export declare function listInflectionAudioTakes(table: RecordTable, source: InflectionAudioLocator): Promise<AudioTakeList<StoredInflectionAudioTake>>;
export declare function selectInflectionAudioTake(table: RecordTable, source: InflectionAudioLocator, takeId: string): Promise<SelectTakeOutcome>;
export declare function readInflectionAudioAsset(table: RecordTable, source: InflectionAudioLocator, takeId: string): Promise<StoredAudioAsset | null>;
export declare function newestInflectionAudioTake(list: AudioTakeList<StoredInflectionAudioTake>, wanted: {
    backend: StoredSpeechBackend;
    voice: StoredAudioVoice;
}, agrees?: (take: StoredInflectionAudioTake) => boolean): StoredInflectionAudioTake | null;
