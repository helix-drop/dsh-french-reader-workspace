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
import type { KvTable } from '@deepseek-ai/dsh-storage-domain';
import { z } from 'zod';
import { type PassageRecord, type StoredLexiconEntry, type StoredLexiconIndex } from './domain.ts';
import { type PolicyInput, type SectionId } from './output-policy.ts';
import { type SourceFetch } from './source-gate.ts';
import type { LexiconLookup, LexiconView } from './types.ts';
export type RecordTable = KvTable<string, PassageRecord>;
export declare function isSectionId(value: string): value is SectionId;
/** Exact-form lookup key: Unicode-normalised and lowercased, never stemmed. */
export declare function normaliseMot(mot: string): string;
/**
 * Stable, path-safe record key for one grammar topic.
 *
 * The controller writes grammar entries and the discussion store updates them, so
 * the derivation lives here rather than in either of them: two producers of the
 * same key must not be able to drift apart.
 */
export declare function grammarHash(topicKey: string): Promise<string>;
/** Stable, path-safe record key for one Mot + part of speech. */
export declare function lexiconHash(motKey: string, partOfSpeech: string): Promise<string>;
export declare function addToIndex(index: StoredLexiconIndex, entry: StoredLexiconEntry): StoredLexiconIndex;
export declare function toLexiconView(entry: StoredLexiconEntry): LexiconView;
/** The policy module's view of a stored entry. */
export declare function toPolicyInput(entry: StoredLexiconEntry): PolicyInput;
export declare function readLexiconEntries(table: RecordTable): StoredLexiconEntry[];
export declare function readLexiconIndex(table: RecordTable): StoredLexiconIndex;
export declare function writeLexiconIndex(table: RecordTable, index: StoredLexiconIndex): Promise<void>;
/**
 * Exact-Mot lookup. No model call and no network request happens here: a hit
 * returns the stored entry, a miss returns only *candidates*. A lemma match is a
 * candidate, never a hit, so `ouvrir` and `ouvrait` are never silently treated as
 * one input.
 */
export declare function lookupMot(table: RecordTable, mot: string, partOfSpeech: string | null): LexiconLookup;
/**
 * Create one entry for an exact Mot. An existing entry is never overwritten: the
 * caller gets `exists` with the entry id and decides whether to append an
 * occurrence or edit deliberately.
 */
export declare function createLexiconEntry(table: RecordTable, input: {
    mot: string;
    partOfSpeech: string;
    lemma: string | null;
    forms: readonly string[];
    definition: string;
    label: string;
    provenance: 'ai' | 'user' | 'mixed';
    operationId: string;
}): Promise<{
    created: boolean;
    exists?: boolean;
    entryId?: string;
    reason?: string;
}>;
/**
 * Append a context note for one reading. It lives in the occurrence list, so a
 * single reading never rewrites the entry's general senses or sections.
 */
export declare function appendLexiconOccurrence(table: RecordTable, input: {
    entryId: string;
    passageId: string;
    anchorId: string;
    excerpt: string;
    note: string;
    operationId: string;
}): Promise<{
    appended: boolean;
    alreadyAppended?: boolean;
    reason?: string;
    occurrenceId?: string;
}>;
/** Rebuild the derived index from the entries themselves. Explicit and verifiable. */
export declare function rebuildLexiconIndex(table: RecordTable): Promise<{
    entries: number;
    forms: number;
    repaired: number;
}>;
export declare function listLexicon(table: RecordTable): LexiconView[];
/**
 * Render one entry through its policy and report what the policy refuses.
 * Rendering and validation use the same sections, so a card cannot look complete
 * while the gate disagrees.
 */
export declare function renderLexiconEntry(table: RecordTable, input: {
    entryId: string;
    wantsEtymology?: boolean;
}): {
    found: boolean;
    rendered?: string;
    sections?: {
        number: string;
        title: string;
        required: boolean;
    }[];
    errors?: string[];
    hints?: string[];
};
/**
 * Record what a source fetch may be claimed for.
 *
 * The response is judged, never assumed: an HTTP 200 with only site chrome is
 * stored as a failed fetch with its reason, so the card shows the attempt instead
 * of asserting a source it does not have.
 */
export declare function recordLexiconSource(table: RecordTable, input: SourceFetch & {
    entryId: string;
}): Promise<{
    recorded: boolean;
    reason?: string;
    ok?: boolean;
    outcome?: string;
    note?: string;
}>;
/**
 * Write one section explicitly. A stored entry is authoritative, so a missing
 * section is filled by a deliberate act — never by fetching on the reader's
 * behalf. Each write appends a version, so a replaced wording stays readable.
 */
export declare function setLexiconSection(table: RecordTable, input: {
    entryId: string;
    section: string;
    text: string;
}): Promise<{
    updated: boolean;
    reason?: string;
    errors?: string[];
}>;
/** The schema one lexicon record must satisfy; exported for import validation. */
export declare const lexiconRecordSchema: z.ZodObject<{
    kind: z.ZodLiteral<"lexicon">;
}, z.core.$strip>;
