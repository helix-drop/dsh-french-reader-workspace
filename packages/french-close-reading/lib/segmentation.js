/**
 * Deterministic French segmentation.
 *
 * Anchor ids are positional (`p2`, `p2.s3`) and are only meaningful together
 * with the passage's `sourceRevision` and this module's `SEGMENTATION_REVISION`:
 * the source is immutable, so positional ids stay stable until either revision
 * changes. Every returned offset indexes the original source string, so a
 * reader can highlight an anchor without re-running the segmenter.
 */
/** Bumped whenever the rules below change the anchors of existing sources. */
export const SEGMENTATION_REVISION = 1;
const TERMINAL = new Set(['.', '!', '?', '…']);
const CLOSERS = new Set(['»', '"', ')', ']', '”', '’', "'"]);
const HORIZONTAL = /[ \t\u00a0]/u;
/**
 * Abbreviations whose final period does not end a sentence. Deliberately a
 * closed, conservative list: a missing entry splits one sentence into two,
 * which a reader can see and correct, while an over-eager entry would silently
 * merge two sentences and hide a boundary.
 */
const ABBREVIATIONS = new Set([
    'm', 'mm', 'mme', 'mmes', 'mlle', 'mlles', 'mr', 'mrs',
    'dr', 'st', 'ste', 'cf', 'p', 'pp', 'ex', 'etc', 'ibid', 'idem',
    'vol', 'chap', 'tome', 'no', 'nos', 'art', 'av', 'apr', 'bd', 'env',
    'fig', 'tab', 'réf', 'ref', 'trad', 'éd', 'ed', 'coll', 'dir',
    'c.-à-d', 'c-à-d', 'p.ex', 'p. ex', 'notamment',
]);
/**
 * Split a source text into paragraphs and sentences.
 * @param sourceText - Immutable passage source.
 * @returns Paragraph anchors with absolute offsets into `sourceText`.
 */
export function segmentSource(sourceText) {
    const paragraphs = [];
    for (const range of paragraphRanges(sourceText)) {
        const id = `p${String(paragraphs.length + 1)}`;
        const text = sourceText.slice(range.start, range.end);
        const sentences = splitSentences(text).map((span, index) => ({
            id: `${id}.s${String(index + 1)}`,
            paragraphId: id,
            text: text.slice(span.start, span.end),
            start: range.start + span.start,
            end: range.start + span.end,
        }));
        paragraphs.push({ id, text, start: range.start, end: range.end, sentences });
    }
    return paragraphs;
}
/** The whole passage, used for an overall translation rather than a sentence. */
export const PASSAGE_ANCHOR_ID = 'passage';
/**
 * True when an anchor id names this passage, one of its paragraphs, or one of
 * its sentences. Every write path validates against this before storing, so a
 * stored `anchorId` can always be resolved back to text.
 * @param paragraphs - Segmentation output.
 * @param anchorId - `passage`, `pN`, or `pN.sM`.
 * @returns Whether the anchor exists in this segmentation.
 */
export function isKnownAnchor(paragraphs, anchorId) {
    return anchorId === PASSAGE_ANCHOR_ID || findAnchor(paragraphs, anchorId) !== undefined;
}
/**
 * Resolve one anchor id against a segmentation.
 * @param paragraphs - Segmentation output.
 * @param anchorId - `pN` (paragraph) or `pN.sM` (sentence).
 * @returns The matching paragraph or sentence, or undefined.
 */
export function findAnchor(paragraphs, anchorId) {
    const match = /^p(\d+)(?:\.s(\d+))?$/u.exec(anchorId);
    if (match === null)
        return undefined;
    const paragraph = paragraphs[Number(match[1]) - 1];
    if (paragraph === undefined || paragraph.id !== `p${String(match[1])}`)
        return undefined;
    if (match[2] === undefined)
        return paragraph;
    return paragraph.sentences[Number(match[2]) - 1];
}
/** Blank-line separated blocks, trimmed; offsets still index the source. */
function paragraphRanges(source) {
    const ranges = [];
    const separator = /\n[ \t\u00a0]*\n+/gu;
    let cursor = 0;
    const push = (from, to) => {
        let start = from;
        let end = to;
        while (start < end && isSpace(source[start]))
            start += 1;
        while (end > start && isSpace(source[end - 1]))
            end -= 1;
        if (end > start)
            ranges.push({ start, end });
    };
    let match = separator.exec(source);
    while (match !== null) {
        push(cursor, match.index);
        cursor = match.index + match[0].length;
        match = separator.exec(source);
    }
    push(cursor, source.length);
    return ranges;
}
/**
 * Sentence spans within one paragraph. A boundary is a terminal run (plus any
 * closing quote or bracket and trailing space), or a line break that introduces
 * a dialogue dash. Abbreviations, initials, and decimals hold a period back.
 */
function splitSentences(text) {
    const spans = [];
    let start = 0;
    let index = 0;
    const flush = (end) => {
        let from = start;
        let to = end;
        while (from < to && isSpace(text[from]))
            from += 1;
        while (to > from && isSpace(text[to - 1]))
            to -= 1;
        if (to > from)
            spans.push({ start: from, end: to });
        start = end;
    };
    while (index < text.length) {
        const character = text[index];
        if (character === '\n') {
            let cursor = index + 1;
            while (cursor < text.length && HORIZONTAL.test(text[cursor]))
                cursor += 1;
            if (text[cursor] === '—' || text[cursor] === '–') {
                flush(cursor);
                index = cursor;
                continue;
            }
            index += 1;
            continue;
        }
        if (!TERMINAL.has(character)) {
            index += 1;
            continue;
        }
        let terminalEnd = index;
        while (terminalEnd < text.length && TERMINAL.has(text[terminalEnd]))
            terminalEnd += 1;
        // French typography puts a space before a closing guillemet, so the closer
        // scan steps over horizontal space first: `… t’en. » Puis`.
        let closerStart = terminalEnd;
        while (closerStart < text.length && HORIZONTAL.test(text[closerStart]))
            closerStart += 1;
        let closerEnd = closerStart;
        while (closerEnd < text.length && CLOSERS.has(text[closerEnd]))
            closerEnd += 1;
        const spanEnd = closerEnd > closerStart ? closerEnd : terminalEnd;
        const held = character === '.' && holdsSentence(text, index, terminalEnd);
        const atEdge = spanEnd >= text.length;
        if (held || (!atEdge && !isSpace(text[spanEnd]))) {
            index = spanEnd;
            continue;
        }
        flush(atEdge ? text.length : spanEnd);
        index = spanEnd;
    }
    flush(text.length);
    return spans;
}
/** True when this period belongs to an abbreviation, an initial, or a decimal. */
function holdsSentence(text, period, afterRun) {
    const before = text[period - 1];
    const after = text[afterRun];
    if (before !== undefined && after !== undefined && isDigit(before) && isDigit(after))
        return true;
    let cursor = period;
    while (cursor > 0 && isWordCharacter(text[cursor - 1]))
        cursor -= 1;
    const token = text.slice(cursor, period).replace(/\.+$/u, '').toLowerCase();
    if (token === '')
        return false;
    if (token.length === 1)
        return true;
    return ABBREVIATIONS.has(token);
}
const isSpace = (character) => character !== undefined && /\s/u.test(character);
const isDigit = (character) => character !== undefined && character >= '0' && character <= '9';
const isWordCharacter = (character) => character !== undefined && /[\p{L}\p{N}]/u.test(character);
