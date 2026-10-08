import { judgeSource } from "./source-gate.js";
const SOURCES = {
    cnrtl: {
        kind: 'cnrtl',
        // The lexical portal's etymology page. The path is built from an
        // encoded headword; nothing else on the host is ever requested.
        path: (mot) => `https://www.cnrtl.fr/etymologie/${encodeURIComponent(mot)}`,
        sections: ['etymology', 'semanticEvolution'],
    },
    'cnrtl-definition': {
        kind: 'cnrtl-definition',
        path: (mot) => `https://www.cnrtl.fr/definition/${encodeURIComponent(mot)}`,
        sections: ['sense', 'collocations', 'fixedExpressions'],
    },
};
/** A bounded body: enough to quote, never the whole site. */
export const MAX_BODY_CHARACTERS = 20_000;
/**
 * Fetch one source page for one word.
 *
 * @param ctx - Host context, for `ctx.web`.
 * @param input - The source, the word, and the section it is meant to support.
 * @param signal - Caller cancellation.
 * @returns What was retrieved and what it may be claimed for.
 */
export async function fetchLexiconSource(ctx, input, signal) {
    const spec = SOURCES[input.source];
    if (spec === undefined)
        return { fetched: false, reason: 'source-unknown' };
    if (input.mot.trim() === '')
        return { fetched: false, reason: 'mot-blank' };
    if (!spec.sections.includes(input.section)) {
        // A response from one page cannot be recorded as support for another field.
        return { fetched: false, reason: 'section-not-supported-by-source' };
    }
    const web = ctx.get('web');
    if (web === undefined)
        return { fetched: false, reason: 'web-unavailable' };
    const url = spec.path(input.mot);
    let httpStatus = null;
    let body = '';
    let truncated = false;
    let parseFailed = false;
    try {
        const response = await web.fetch({ url }, signal);
        httpStatus = response.statusCode;
        const extracted = extractText(response.body.content);
        truncated = response.truncated || extracted.length > MAX_BODY_CHARACTERS;
        body = extracted.slice(0, MAX_BODY_CHARACTERS);
    }
    catch (error) {
        // A transport failure is not an HTTP status; the gate is told so it can say
        // "not retrieved" rather than inventing one.
        return {
            fetched: true,
            reason: 'transport-failed',
            fetch: {
                kind: spec.kind,
                section: input.section,
                url,
                httpStatus: null,
                body: '',
                entryFound: false,
                truncated: false,
                parseFailed: true,
                fetchedAt: new Date().toISOString(),
            },
            verdict: { ok: false, outcome: 'parse-failed', claim: String(error).slice(0, 200) },
        };
    }
    const fetch = {
        kind: spec.kind,
        section: input.section,
        url,
        httpStatus,
        body,
        // The headword must actually be on the page: a 200 with someone else's entry
        // is not a source for this word.
        entryFound: containsHeadword(body, input.mot),
        truncated,
        parseFailed,
        fetchedAt: new Date().toISOString(),
    };
    const verdict = judgeSource(fetch);
    return {
        fetched: true,
        fetch,
        verdict: { ok: verdict.ok, outcome: verdict.outcome, claim: verdict.claim },
    };
}
/** The sources this plugin may request, so a caller cannot invent one. */
export function listLexiconSources() {
    return Object.entries(SOURCES).map(([source, spec]) => ({ source, sections: [...spec.sections] }));
}
/**
 * Reduce a fetched page to text.
 *
 * Script, style and markup are removed because a card must never quote site
 * plumbing as if it were the entry. Entities are only minimally decoded: the gate
 * judges the result, and an over-eager decoder would be another way to fabricate
 * content.
 */
export function extractText(content) {
    return content
        // Unclosed script/style blocks are cut to the end: partial markup would
        // otherwise leak JavaScript into a quoted body.
        .replace(/<script[\s\S]*?(?:<\/script>|$)/giu, ' ')
        .replace(/<style[\s\S]*?(?:<\/style>|$)/giu, ' ')
        .replace(/<[^>]*>/gu, ' ')
        .replace(/&nbsp;/giu, ' ')
        .replace(/&amp;/giu, '&')
        .replace(/&lt;/giu, '<')
        .replace(/&gt;/giu, '>')
        .replace(/&quot;/giu, '"')
        .replace(/&#39;/gu, "'")
        .replace(/\s+/gu, ' ')
        .trim();
}
/**
 * Whether the page carries the requested headword.
 *
 * Compared without case or surrounding punctuation, because a page may print the
 * word in a heading. This is a spelling check, not proof: the gate treats
 * `entryFound: false` as a refusal precisely so a near-miss is not mistaken for a
 * source.
 */
export function containsHeadword(body, mot) {
    const wanted = mot.normalize('NFC').toLowerCase().trim();
    if (wanted === '')
        return false;
    const text = body.normalize('NFC').toLowerCase();
    // Word-boundary match on letters, so `ouvrir` is not "found" inside `ouvroir`.
    const pattern = new RegExp(`(^|[^\\p{L}])${escapeRegExp(wanted)}([^\\p{L}]|$)`, 'u');
    return pattern.test(text);
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
