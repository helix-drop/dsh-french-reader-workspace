/**
 * Grammar extraction from one answer.
 *
 * The reader's rule is that a grammar point enters the library because a question
 * was actually asked — not because someone filled in a form. So the automatic path
 * has to get its points from the same turn that produced the answer: the model is
 * asked to end its reply with one machine-readable block, and this module splits
 * that block off, validates it, and hands the caller both the readable answer and
 * the points.
 *
 * Three properties this module is responsible for:
 *
 * 1. **The reader never sees the machine block.** The text returned here is the
 *    reply with the block removed, and that is what the message stores.
 * 2. **A malformed block is never silently accepted.** Status `invalid` carries the
 *    reason, and the caller records it, so "no grammar points" and "the model wrote
 *    something unusable" are different facts in the store.
 * 3. **A reply with no block is not a failure of the answer.** Status `none` keeps
 *    the whole reply as the answer text.
 */
import { ANCHOR_ID_PATTERN } from "./limits.js";
/** The marker that opens the block. Chosen to be unlikely in prose. */
export const GRAMMAR_BLOCK_START = '<<<GRAMMAR';
/** The marker that closes the block. */
export const GRAMMAR_BLOCK_END = '>>>';
/** How many points one turn may contribute. More is a sign the model misunderstood. */
export const MAX_EXTRACTED_POINTS = 8;
/** The longest title accepted for one extracted point. */
const MAX_TITLE_CHARACTERS = 160;
/** The longest body accepted for one extracted point. */
const MAX_BODY_CHARACTERS = 20_000;
/** The longest level or module hint accepted. */
const MAX_HINT_CHARACTERS = 40;
/** What the model is told to produce, appended to the system instruction. */
export function renderExtractionInstruction() {
    return [
        '回答结束后，如果这一问涉及可复用的语法点，另起一段输出一个机器可读块：',
        `${GRAMMAR_BLOCK_START}`,
        '{"points":[{"title":"语法点名称","body":"解释","anchorId":"p1.s1","level":"B1","module":"否定","pitfall":"易错处"}]}',
        `${GRAMMAR_BLOCK_END}`,
        `规则：最多 ${String(MAX_EXTRACTED_POINTS)} 条；title 与 body 必填；anchorId 只能是你确实看到的锚点，不确定就省略；`,
        '没有可复用语法点时不要输出该块。块之外不要提及它。',
    ].join('\n');
}
/**
 * Split one reply into the reader's answer and the grammar points it carries.
 *
 * Every complete block is removed from the answer text — a reply that quotes the
 * format before using it must not show the reader the wire format — while the
 * **last** block is the one parsed, because that is the one the model means as its
 * output.
 */
export function extractGrammarPoints(reply) {
    const matches = [...reply.matchAll(BLOCK_PATTERN)];
    if (matches.length === 0) {
        const stray = reply.lastIndexOf(GRAMMAR_BLOCK_START);
        if (stray === -1) {
            return { status: 'none', text: reply.trim(), points: [], detail: 'reply carried no grammar block' };
        }
        // An unterminated block is not "no points": the model tried and the output was
        // cut off, which is worth telling apart from a plain answer.
        return {
            status: 'invalid',
            text: reply.slice(0, stray).trim(),
            points: [],
            detail: 'grammar block was opened but never closed',
        };
    }
    // Every complete block is machine output, so none of it is reader text.
    let kept = '';
    let cursor = 0;
    for (const match of matches) {
        kept += reply.slice(cursor, match.index);
        cursor = match.index + match[0].length;
    }
    const text = `${kept}${reply.slice(cursor)}`.trim();
    const payload = (matches[matches.length - 1][1] ?? '').trim();
    let parsed;
    try {
        parsed = JSON.parse(payload);
    }
    catch (error) {
        return { status: 'invalid', text, points: [], detail: `grammar block was not JSON: ${String(error)}` };
    }
    const rawPoints = Array.isArray(parsed)
        ? parsed
        : (parsed !== null && typeof parsed === 'object' && Array.isArray(parsed.points)
            ? parsed.points
            : null);
    if (rawPoints === null) {
        return {
            status: 'invalid',
            text,
            points: [],
            detail: 'grammar block was JSON but carried no points array',
        };
    }
    const points = [];
    const problems = [];
    for (const [index, raw] of rawPoints.entries()) {
        if (index >= MAX_EXTRACTED_POINTS) {
            problems.push(`ignored ${String(rawPoints.length - MAX_EXTRACTED_POINTS)} point(s) beyond the limit`);
            break;
        }
        const point = readPoint(raw);
        if (typeof point === 'string')
            problems.push(`point ${String(index + 1)}: ${point}`);
        else
            points.push(point);
    }
    if (points.length === 0) {
        return {
            status: 'invalid',
            text,
            points: [],
            detail: problems.length === 0 ? 'grammar block carried no usable point' : problems.join('; '),
        };
    }
    return { status: 'extracted', text, points, detail: problems.length === 0 ? null : problems.join('; ') };
}
/** One complete block, captured between the markers. */
const BLOCK_PATTERN = new RegExp(`${escapeRegExp(GRAMMAR_BLOCK_START)}([\\s\\S]*?)${escapeRegExp(GRAMMAR_BLOCK_END)}`, 'gu');
/** A literal string as a regular expression. */
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
/** One raw point, or the reason it cannot be used. */
function readPoint(raw) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw))
        return 'not an object';
    const item = raw;
    const title = text(item.title, MAX_TITLE_CHARACTERS);
    if (title === null)
        return 'title is missing or too long';
    const body = text(item.body ?? item.text, MAX_BODY_CHARACTERS);
    if (body === null)
        return `"${title}" has no body`;
    const anchor = typeof item.anchorId === 'string' && ANCHOR_ID_PATTERN.test(item.anchorId) ? item.anchorId : null;
    return {
        title,
        body,
        anchorId: anchor,
        level: text(item.level, MAX_HINT_CHARACTERS),
        module: text(item.module, MAX_HINT_CHARACTERS),
        pitfall: text(item.pitfall, MAX_BODY_CHARACTERS) ?? '',
    };
}
/** A trimmed, length-bounded string, or null when it is absent or unusable. */
function text(value, max) {
    if (typeof value !== 'string')
        return null;
    const trimmed = value.trim();
    if (trimmed === '' || trimmed.length > max)
        return null;
    return trimmed;
}
