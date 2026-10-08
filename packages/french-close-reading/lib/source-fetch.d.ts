/**
 * Controlled lexicon source fetching.
 *
 * The reader asks for a source deliberately; the model never does, and nothing
 * fetches on its own. The result is judged by `source-gate` and stored with what
 * it actually supports, so a card can say "this attempt failed" instead of
 * implying a fact it never retrieved.
 *
 * The URL space is a closed set. This module is not a general URL proxy: only the
 * declared sources and their own paths are reachable, and an unknown source is
 * refused before any request exists.
 *
 * Measured on 2026-10-06 through this machine's network: every plain `fetch` of
 * `https://www.cnrtl.fr/{definition,etymologie,lexicographie}/ouvrir` answered a
 * 914-byte page whose entire text is "Portail lexical" — no entry body. The gate
 * therefore records `body-missing` and the card falls back to training data with
 * that stated. The fetching machinery below is real and tested against a stub
 * provider; **CNRTL's own content is not reachable from here today**, and nothing
 * in the plugin claims otherwise.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { SourceFetch } from './source-gate.ts';
export interface FetchOutcome {
    fetched: boolean;
    /** Set when nothing was requested: the reason is then a refusal code. */
    reason?: string;
    fetch?: SourceFetch;
    /** What the gate decided, so the caller can store the truthful note. */
    verdict?: {
        ok: boolean;
        outcome: string;
        claim: string;
    };
}
/** A bounded body: enough to quote, never the whole site. */
export declare const MAX_BODY_CHARACTERS = 20000;
/**
 * Fetch one source page for one word.
 *
 * @param ctx - Host context, for `ctx.web`.
 * @param input - The source, the word, and the section it is meant to support.
 * @param signal - Caller cancellation.
 * @returns What was retrieved and what it may be claimed for.
 */
export declare function fetchLexiconSource(ctx: Context, input: {
    source: string;
    mot: string;
    section: string;
}, signal: AbortSignal): Promise<FetchOutcome>;
/** The sources this plugin may request, so a caller cannot invent one. */
export declare function listLexiconSources(): {
    source: string;
    sections: string[];
}[];
/**
 * Reduce a fetched page to text.
 *
 * Script, style and markup are removed because a card must never quote site
 * plumbing as if it were the entry. Entities are only minimally decoded: the gate
 * judges the result, and an over-eager decoder would be another way to fabricate
 * content.
 */
export declare function extractText(content: string): string;
/**
 * Whether the page carries the requested headword.
 *
 * Compared without case or surrounding punctuation, because a page may print the
 * word in a heading. This is a spelling check, not proof: the gate treats
 * `entryFound: false` as a refusal precisely so a near-miss is not mistaken for a
 * source.
 */
export declare function containsHeadword(body: string, mot: string): boolean;
