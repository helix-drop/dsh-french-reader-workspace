/**
 * Assembling one verb's paradigm from the source, in two requests.
 *
 * Measured on 2026-10-07 from this machine (M4 section of `VERIFICATION.md`):
 *
 * - `Generation=links` on the lemma page is a bad discovery route: one request
 *   returned **230 pages** and only **one** of them was a form of the verb;
 * - the form list lives on the conjugation page, `Conjugaison:français/venir`:
 *   52 KB of rendered table containing **44 form links** (`venais`, `viendrai`,
 *   `vins`, `vinsse`, `vîntes` …) — one request;
 * - the API accepts up to fifty titles per query, so every form page's wikitext
 *   comes back in **one** more request, each page declaring its own pronunciation and
 *   inflection slots.
 *
 * So a paradigm costs two requests, and the request budget here is about the
 * *politeness* of the walk (spacing, a hard cap, a 429 that stops rather than
 * retries) — not about crawling. What comes back is derived, not asserted: this
 * module never invents a form to fill a gap, and a walk that was cut short reports
 * `partial` with the forms it did not reach.
 */
import { type ConjugationDataset, type InflectionSlot } from './conjugation-data.ts';
import { type PageFetcher } from './conjugation-source.ts';
/** The conjugation-namespace page that holds one verb's table. */
export declare function conjugationPageUrl(lemma: string): string;
/** The URL that returns many pages' wikitext at once. */
export declare function formTitlesUrl(titles: readonly string[]): string;
/** How many titles one query may carry (the API's own limit for readers). */
export declare const MAX_TITLES_PER_REQUEST = 50;
/**
 * The candidate form names on a rendered conjugation page.
 *
 * Read from the table's own links rather than from the template call: the page's
 * wikitext is one `{{fr-conj-3-enir|…}}` invocation whose forms are generated, so
 * only the rendered table lists them.
 */
export declare function extractFormNames(html: string, lemma: string): string[];
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
