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
import { deriveConjugationDataset, } from "./conjugation-data.js";
import { parseFormPage, } from "./conjugation-source.js";
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
export function conjugationLinksUrl(lemma, continueFrom = null) {
    const base = 'https://fr.wiktionary.org/w/api.php?format=json&formatversion=2'
        + '&action=query&prop=links&pllimit=max'
        + `&titles=${encodeURIComponent(`Conjugaison:français/${lemma}`)}`;
    return continueFrom === null ? base : `${base}&plcontinue=${encodeURIComponent(continueFrom)}`;
}
/** The URL that returns many pages' wikitext at once. */
export function formTitlesUrl(titles) {
    const list = titles.map((title) => encodeURIComponent(title)).join('%7C');
    return `https://fr.wiktionary.org/w/api.php?format=json&formatversion=2&action=query&prop=revisions&rvprop=content&rvslots=main&titles=${list}`;
}
/** How many titles one query may carry (the API's own limit for readers). */
export const MAX_TITLES_PER_REQUEST = 50;
/** Form names that are table furniture rather than conjugations. */
const NOT_A_FORM = new Set([
    'gérondif', 'infinitif', 'mode', 'participe', 'passé', 'présent', 'être', 'avoir',
    'indicatif', 'subjonctif', 'conditionnel', 'impératif', 'simple', 'composé',
    'conjugaison', 'français', 'voix', 'active', 'passive', 'temps', 'personne',
]);
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
export function formNamesFromLinks(titles, lemma) {
    const names = new Set();
    for (const title of titles) {
        // Only single-word page names: a namespace, a phrase or an annex is not a form.
        if (!/^[a-zà-öø-ÿ'’-]+$/u.test(title))
            continue;
        if (title.length < 2 || title.length > 40)
            continue;
        if (NOT_A_FORM.has(title))
            continue;
        if (title === lemma)
            continue;
        names.add(title);
    }
    return [...names].sort();
}
const DEFAULT_SPACING_MS = 1_200;
const DEFAULT_MAX_REQUESTS = 12;
/**
 * Fetch and derive one verb's paradigm.
 *
 * Every ending is a recorded outcome: `ok` (the walk completed), `partial` (a
 * request budget or a transport failure cut it short), `rate-limited` (the source
 * said so — nothing is retried), `no-forms` (the table listed no form we could read),
 * `failed` (the first request did not answer). None of them is an empty paradigm.
 */
export async function fetchConjugationDataset(input) {
    const sleep = input.sleep ?? ((milliseconds) => new Promise((resolve) => { setTimeout(resolve, milliseconds); }));
    const spacing = input.spacingMs ?? DEFAULT_SPACING_MS;
    const maxRequests = input.maxRequests ?? DEFAULT_MAX_REQUESTS;
    const now = input.now ?? (() => new Date().toISOString());
    const notes = [];
    let requests = 0;
    let partialList = false;
    // Phase one: the table's link set, as JSON. Paged, because the API caps one
    // response's link list; a list we could not finish is a gap, never a silent
    // shorter paradigm.
    const candidates = [];
    const seenTitles = new Set();
    let continueFrom = null;
    for (;;) {
        if (requests >= maxRequests) {
            partialList = true;
            notes.push(`已达请求上限 ${String(maxRequests)}，形式清单未取完`);
            break;
        }
        const response = await request(input.fetchPage, conjugationLinksUrl(input.lemma, continueFrom), input.signal);
        requests += 1;
        if (response.status !== 'ok') {
            if (candidates.length === 0) {
                return {
                    status: response.status === 'rate-limited' ? 'rate-limited' : 'failed',
                    dataset: null,
                    missingForms: [],
                    requests,
                    failure: response.message,
                    notes: [`未取得形式清单：${response.message}`],
                };
            }
            partialList = true;
            notes.push(`形式清单未取完（${response.message}）`);
            break;
        }
        let payload;
        try {
            payload = JSON.parse(response.wikitext);
        }
        catch (error) {
            return {
                status: 'failed', dataset: null, missingForms: [], requests,
                failure: `形式清单不是 JSON：${String(error)}`.slice(0, 200), notes: notes,
            };
        }
        const page = payload.query?.pages;
        const first = Array.isArray(page) ? page[0] : undefined;
        if (first === undefined) {
            return {
                status: 'no-forms', dataset: null, missingForms: [], requests,
                failure: '形式清单页面没有内容',
                notes: [`Conjugaison:français/${input.lemma} 没有可读的链接`],
            };
        }
        if (Array.isArray(first.links)) {
            for (const link of first.links) {
                const title = link.title;
                if (typeof title === 'string' && !seenTitles.has(title)) {
                    seenTitles.add(title);
                    candidates.push(title);
                }
            }
        }
        const next = payload.continue?.plcontinue;
        if (typeof next !== 'string' || next === '')
            break;
        continueFrom = next;
        await sleep(spacing);
    }
    // The names actually worth asking about: single-word, not table furniture, not
    // the lemma itself. Sorted and deduplicated, so the batches below are stable.
    const wanted = formNamesFromLinks(candidates, input.lemma);
    if (wanted.length === 0) {
        return {
            status: 'no-forms', dataset: null, missingForms: [], requests,
            failure: '变位表中没有可识别的形式',
            notes: ['表中未找到形式链接：该动词可能尚未收录变位表'],
        };
    }
    const rows = [];
    // Two different gaps, kept apart: a form the source simply has no page for is a
    // hole in the paradigm, while a page that exists but cannot be read is a failure —
    // and only the second one should make a walk look unreliable.
    const missingPages = [];
    const unreadable = [];
    let limited = false;
    let exhausted = false;
    let halved = false;
    /**
     * The forms still to ask for, in batches of the API's own title limit.
     *
     * A response this Host refuses as truncated is **split and retried**, not
     * abandoned: fifty titles of wikitext can exceed the body cap on its own —
     * measured, fifty of `aller`'s forms are 133 953 characters — and dropping the
     * batch would report a paradigm as unreadable when two smaller batches read it
     * whole. Splitting stops at a single title, where a truncation really is the
     * page's own fault and the form is named as unreadable instead.
     */
    let queue = wanted.slice(0, MAX_TITLES_PER_REQUEST);
    let pending = wanted.slice(MAX_TITLES_PER_REQUEST);
    /** How many titles the next request may carry; halved after a truncation. */
    let batchSize = MAX_TITLES_PER_REQUEST;
    /** Take the next batch, refilling from `pending` — never aliased to `queue`. */
    const nextBatch = (size) => {
        const batch = queue.slice(0, size);
        queue = queue.length > size ? queue.slice(size) : pending.splice(0, MAX_TITLES_PER_REQUEST);
        return batch;
    };
    while (queue.length > 0) {
        if (requests >= maxRequests) {
            exhausted = true;
            notes.push(`已达请求上限 ${String(maxRequests)}，其余形式未取：${[...queue, ...pending].join('、')}`);
            break;
        }
        const batch = nextBatch(batchSize);
        const response = await request(input.fetchPage, formTitlesUrl(batch), input.signal);
        requests += 1;
        if (response.status === 'rate-limited') {
            limited = true;
            notes.push(`来源限流，剩余 ${String(batch.length + pending.length)} 个形式未取`);
            break;
        }
        if (response.status === 'truncated' && batch.length > 1) {
            // Too much wikitext for one body: put the batch back and ask for fewer
            // titles next time. At one title there is nothing left to split, and a
            // truncated single page is that page's own fault — it is named unreadable.
            halved = true;
            batchSize = Math.max(1, Math.floor(batch.length / 2));
            queue = [...batch, ...queue];
            notes.push(`一批 ${String(batch.length)} 个形式的响应被截断，改为每批 ${String(batchSize)} 个重取`);
            await sleep(spacing);
            continue;
        }
        if (response.status !== 'ok') {
            unreadable.push(...batch);
            notes.push(`一批形式未能读取（${response.message}），共 ${String(batch.length)} 个`);
            continue;
        }
        let pages;
        try {
            pages = JSON.parse(response.wikitext).query?.pages;
        }
        catch (error) {
            unreadable.push(...batch);
            notes.push(`一批形式的响应不是 JSON：${String(error)}`.slice(0, 200));
            continue;
        }
        if (!Array.isArray(pages)) {
            unreadable.push(...batch);
            notes.push('一批形式的响应没有 pages 字段');
            continue;
        }
        const seen = new Set();
        for (const page of pages) {
            const record = page;
            const title = typeof record.title === 'string' ? record.title : '';
            const content = record.revisions?.[0]?.slots?.main?.content;
            if (typeof content !== 'string') {
                if (title !== '')
                    (record.missing === true ? missingPages : unreadable).push(title);
                continue;
            }
            const row = rowFromPage(content, input.lemma, record.missing === true);
            if (row === null) {
                // A candidate that carries no form of this verb is table furniture or a
                // homograph: it is simply not part of this paradigm, and not a gap either.
                continue;
            }
            seen.add(title);
            rows.push(row);
        }
        // Courtesy spacing only while there is more to ask for.
        if (queue.length > 0)
            await sleep(spacing);
    }
    const turned = new Set(rows.map((row) => row.written));
    // Everything the table listed that did not become a form is a gap the card names.
    const missingForms = wanted.filter((name) => !turned.has(name));
    if (rows.length === 0) {
        const status = limited ? 'rate-limited'
            : (exhausted || partialList ? 'partial' : 'no-forms');
        return {
            status,
            dataset: null,
            missingForms: wanted,
            requests,
            failure: limited
                ? '来源限流'
                : exhausted ? `已达请求上限 ${String(maxRequests)}，未取得任何形式` : '没有任何形式页可读',
            notes,
        };
    }
    if (missingPages.length > 0) {
        notes.push(`来源中尚无这些形式的页面（${String(missingPages.length)} 个）：${missingPages.slice(0, 12).join('、')}${missingPages.length > 12 ? ' 等' : ''}`);
    }
    if (unreadable.length > 0) {
        notes.push(`这些形式页面无法读取：${unreadable.slice(0, 12).join('、')}${unreadable.length > 12 ? ' 等' : ''}`);
    }
    if (halved)
        notes.push('为绕开单次响应上限，本次抓取使用了更小的批次');
    const dataset = deriveConjugationDataset(input.lemma, rows, {
        kind: 'fr-wiktionary',
        version: 'api',
        fetchedAt: now(),
    });
    // A form page whose slots we could not read is a gap in the paradigm, not a
    // failure of the walk: it is named so the card can say what is missing.
    const personless = rows.filter((row) => row.slots.every((slot) => slot.person === null)).map((row) => row.written);
    if (personless.length > 0)
        notes.push(`这些页面没有可读的语法人称：${personless.join('、')}`);
    // Incomplete is incomplete: a paradigm missing cells says `partial` and names them,
    // whether the gap came from the budget, from an unreadable page or from a form the
    // source has not created yet.
    const status = limited
        ? 'rate-limited'
        : (exhausted || partialList || unreadable.length > 0 || missingForms.length > 0 ? 'partial' : 'ok');
    return {
        status,
        dataset,
        missingForms,
        requests,
        failure: limited ? '来源限流' : null,
        notes,
    };
}
/** One fetched page as a derivation row, or null when it is not a form of this verb. */
function rowFromPage(content, lemma, missing) {
    if (missing)
        return null;
    const parsed = parseFormPage(content);
    if (parsed === null || parsed.written === null || parsed.ipa.length === 0)
        return null;
    // The page states its own lemma; a page that belongs to another verb is not a form
    // of this one, however the table linked to it.
    if (parsed.lemma !== null && parsed.lemma.toLowerCase() !== lemma.toLowerCase())
        return null;
    return { written: parsed.written, ipa: parsed.ipa[0], slots: parsed.slots };
}
/** Request one URL and report the outcome in the source module's own vocabulary. */
async function request(fetchPage, url, signal) {
    let response;
    try {
        response = await fetchPage(url, signal);
    }
    catch (error) {
        return { status: 'unreadable', httpStatus: 0, message: `transport failed: ${String(error)}`.slice(0, 200) };
    }
    if (response.statusCode === 429) {
        return { status: 'rate-limited', httpStatus: 429, message: '来源限流，请稍后再试' };
    }
    if (response.statusCode !== 200) {
        return { status: 'http-error', httpStatus: response.statusCode, message: `HTTP ${String(response.statusCode)}` };
    }
    if (response.truncated) {
        return { status: 'truncated', httpStatus: 200, message: '来源响应被截断，未采用' };
    }
    return { status: 'ok', httpStatus: 200, wikitext: response.body.content };
}
/** The slots a dataset would need to answer for one tense, for a caller's budget. */
export function wantedSlots(slots) {
    return slots.map((slot) => `${slot.mood}:${slot.tense}:${slot.person ?? '-'}`);
}
