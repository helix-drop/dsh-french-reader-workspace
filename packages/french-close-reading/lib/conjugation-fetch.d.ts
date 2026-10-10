/**
 * Assembling one verb's paradigm from the source, in two to five requests.
 *
 * Measured from this machine (first on 2026-10-07, re-measured 2026-10-10 after the
 * truncation defect described below):
 *
 * - `Generation=links` on the **lemma** page is a bad discovery route: one request
 *   returned **230 pages** and only **one** of them was a form of the verb;
 * - the form list lives on the conjugation page, `Conjugaison:français/<verbe>`, and
 *   it is read as its **link set**, not as rendered HTML: the JSON is 1.3–1.5 KB
 *   against 52–106 KB for the table, and this Host caps a fetched body at
 *   `maxBodyChars` (100 000 by default). The rendered route failed outright on a verb
 *   with a doubled paradigm — `retrouver` is 105 797 characters of HTML for 15 537
 *   characters of text — so it is no longer requested at all;
 * - the API accepts up to fifty titles per query, so every form page's wikitext comes
 *   back in one more request — **unless** that response is itself over the cap (fifty
 *   of `aller`'s forms are 133 953 characters), in which case the batch is halved and
 *   asked again rather than abandoned;
 * - a form page the source has not written yet is a named gap, not a failure.
 *
 * So a paradigm costs two to five requests, and the request budget here is about the
 * *politeness* of the walk (spacing, a hard cap, a 429 that stops rather than
 * retries) — not about crawling. What comes back is derived, not asserted: this
 * module never invents a form to fill a gap, and a walk that was cut short reports
 * `partial` with the forms it did not reach.
 */
import { type ConjugationDataset, type InflectionSlot } from './conjugation-data.ts';
import { type PageFetcher } from './conjugation-source.ts';
/**
 * The URL that lists the pages one verb's conjugation table links to.
 *
 * The table itself is not requested: rendering it costs 52–106 KB of HTML for
 * every verb, and this Host caps a fetched body at `maxBodyChars` (100 000 by
 * default), so the whole page came back `truncated` and was refused — which is
 * exactly how `retrouver` (105 797 chars of markup for 15 537 chars of text)
 * failed. The same link set as JSON is **1.3–1.5 KB**, measured on
 * `venir` / `arriver` / `être` / `aller` / `retrouver`, and it carries the same
 * names: `retrouvé`, `retrouvant`, `retrouvassions` … with their accents.
 *
 * `plcontinue` pages a list longer than the API's per-response cap, so a big
 * paradigm costs two or three of these requests and never a partial silent read.
 */
export declare function conjugationLinksUrl(lemma: string, continueFrom?: string | null): string;
/** The URL that returns many pages' wikitext at once. */
export declare function formTitlesUrl(titles: readonly string[]): string;
/** How many titles one query may carry (the API's own limit for readers). */
export declare const MAX_TITLES_PER_REQUEST = 50;
/**
 * The candidate form names among the pages a conjugation table links to.
 *
 * Read from the table's own links rather than from the template call: the page's
 * wikitext is one `{{fr-conj-3-enir|…}}` invocation whose forms are generated, so
 * only the table's links list them — and the links are available as JSON without
 * rendering the table (`conjugationLinksUrl`).
 *
 * Deliberately name-only: a link carries the page title, not the surface form, and
 * redirect titles (`retrouvasses` → `retrouver`) are kept because the form's own
 * page is what states its written form and its slots.
 */
export declare function formNamesFromLinks(titles: readonly string[], lemma: string): string[];
/** What one walk produced, and how far it got. */
export interface FetchOutcome {
    status: 'ok' | 'partial' | 'rate-limited' | 'failed' | 'no-forms';
    dataset: ConjugationDataset | null;
    /** Candidate forms the walk did not turn into rows, so a card can name the gaps. */
    missingForms: string[];
    requests: number;
    failure: string | null;
    notes: string[];
}
export interface FetchInput {
    lemma: string;
    fetchPage: PageFetcher;
    signal: AbortSignal;
    /** Courtesy delay between requests; injected so tests run instantly. */
    sleep?: (milliseconds: number) => Promise<void>;
    spacingMs?: number;
    /** Hard ceiling on requests for one walk. */
    maxRequests?: number;
    /** The instant to record as the fetch time; injected for deterministic tests. */
    now?: () => string;
}
/**
 * Fetch and derive one verb's paradigm.
 *
 * Every ending is a recorded outcome: `ok` (the walk completed), `partial` (a
 * request budget or a transport failure cut it short), `rate-limited` (the source
 * said so — nothing is retried), `no-forms` (the table listed no form we could read),
 * `failed` (the first request did not answer). None of them is an empty paradigm.
 */
export declare function fetchConjugationDataset(input: FetchInput): Promise<FetchOutcome>;
/** The slots a dataset would need to answer for one tense, for a caller's budget. */
export declare function wantedSlots(slots: readonly InflectionSlot[]): string[];
