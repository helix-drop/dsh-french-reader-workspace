/**
 * Source truthfulness gate.
 *
 * An HTTP 200 is not success. Measured on the real CNRTL etymology page for
 * `ouvrir`: the request returns 200 while the extracted text contains only the
 * site chrome (`Portail lexical`), with no etymology body at all. A card that
 * recorded "CNRTL 实时数据" from that response would be lying, so success is
 * judged on four separate things and the failure is stored with its reason.
 */
export type SourceOutcome = 'ok' | 'http-error' | 'not-found' | 'body-missing' | 'truncated' | 'parse-failed';
export interface SourceFetch {
    /** Which source produced this: `cnrtl`, `wikipedia`, `manual`, … */
    kind: string;
    /** The card section this response is allowed to support. */
    section: string;
    url: string | null;
    httpStatus: number | null;
    /** Text actually extracted from the response, empty when nothing usable came out. */
    body: string;
    /** Whether the requested headword was found on the page. */
    entryFound?: boolean;
    truncated?: boolean;
    parseFailed?: boolean;
    fetchedAt?: string | null;
}
export interface SourceVerdict {
    ok: boolean;
    outcome: SourceOutcome;
    /** Short machine-readable explanation, stored with the record. */
    reason: string;
    /** What the card is allowed to claim about this response. */
    claim: string;
}
/**
 * Decide whether a fetch may be recorded as a supporting source.
 * @param fetch - The response, its extracted body, and the extraction flags.
 * @returns The verdict, including what the card may claim.
 */
export declare function judgeSource(fetch: SourceFetch): SourceVerdict;
/**
 * Whether an extracted body carries content beyond site chrome.
 * @param body - Extracted text.
 * @returns True when there is nothing usable to quote.
 */
export declare function isStubBody(body: string): boolean;
/**
 * Turn a fetch into the source record stored on an entry.
 *
 * The record keeps only what the response actually supports: the verdict's
 * `ok` flag, its reason, and the section it was fetched for. A failed fetch is
 * still recorded, so the card shows the attempt instead of hiding it.
 * @param fetch - The response.
 * @returns The stored source record.
 */
export declare function toSourceRecord(fetch: SourceFetch): {
    kind: string;
    section: string;
    url: string | null;
    fetchedAt: string | null;
    ok: boolean;
    note: string;
};
