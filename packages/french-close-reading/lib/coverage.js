/**
 * Structural coverage check for a sentence analysis.
 *
 * The plan forbids two things that are easy to do by accident: presenting an
 * analysis that silently drops a clause, and calling a one-line summary an
 * analysis. Both are mechanically checkable once the analysis states which
 * character ranges it accounts for, so this module checks the claim rather than
 * trusting its prose.
 *
 * Clause boundaries are derived from punctuation and a closed list of French
 * subordinators and coordinators. That is deliberately shallow: it finds *where*
 * a clause starts, never what it means, so it can say "nothing here was analysed"
 * without pretending to parse.
 */
/** Words that open a new clause inside a sentence. */
const CLAUSE_MARKERS = [
    'mais', 'ou', 'et', 'car', 'donc', 'or', 'ni', 'puis',
    'que', 'qui', 'quoi', 'dont', 'où',
    'quand', 'lorsque', 'si', 'comme', 'parce', 'puisque', 'tandis', 'alors',
    'cependant', 'pourtant', 'néanmoins',
];
/**
 * The clause-sized units of a sentence, split on punctuation and clause markers.
 * @param sentence - The exact sentence text.
 * @returns Ranges of text that each deserve their own analysis.
 */
export function clauseRanges(sentence) {
    const boundaries = new Set();
    boundaries.add(0);
    boundaries.add(sentence.length);
    for (let index = 0; index < sentence.length; index += 1) {
        const character = sentence[index];
        if (',;:—–()[]«»'.includes(character)) {
            boundaries.add(index);
            boundaries.add(index + 1);
        }
    }
    // A marker word starts its own clause, but only on a word boundary.
    for (const marker of CLAUSE_MARKERS) {
        const pattern = new RegExp(`(?:^|[^\\p{L}])${marker}(?![\\p{L}])`, 'giu');
        for (const match of sentence.matchAll(pattern)) {
            const offset = match[0].toLowerCase().startsWith(marker) ? 0 : match[0].search(/\p{L}/u);
            boundaries.add(match.index + offset);
        }
    }
    const ordered = [...boundaries].filter((value) => value >= 0 && value <= sentence.length).sort((left, right) => left - right);
    const units = [];
    for (let index = 0; index < ordered.length - 1; index += 1) {
        const start = ordered[index];
        const end = ordered[index + 1];
        const raw = sentence.slice(start, end);
        // Only units that actually carry words count as clauses, and the range is
        // the trimmed one: an analysis states trimmed ranges, and comparing an
        // untrimmed boundary against a trimmed constituent would report a gap that
        // is only whitespace.
        if (!/[\p{L}]{2}/u.test(raw))
            continue;
        const leading = raw.length - raw.trimStart().length;
        const trailing = raw.length - raw.trimEnd().length;
        const trimmedStart = start + leading;
        const trimmedEnd = end - trailing;
        const trimmed = sentence.slice(trimmedStart, trimmedEnd);
        // Containment is judged on words: covering "…raisons" covers the clause
        // "…raisons.", but dropping any word still fails.
        const firstLetter = trimmed.search(/\p{L}/u);
        const lastLetter = trimmed.length - 1 - [...trimmed].reverse().join('').search(/\p{L}/u);
        units.push({
            start: trimmedStart,
            end: trimmedEnd,
            text: trimmed,
            core: { start: trimmedStart + firstLetter, end: trimmedStart + lastLetter + 1 },
        });
    }
    return units;
}
/**
 * Check that an analysis accounts for every clause and leaves no text behind.
 * @param sentence - The exact sentence the analysis is about.
 * @param constituents - The labelled ranges the analysis claims to cover.
 * @returns Errors that must be fixed and hints about the analysis's shape.
 */
export function checkCoverage(sentence, constituents) {
    const errors = [];
    const hints = [];
    const clauses = clauseRanges(sentence);
    if (sentence.trim() === '')
        errors.push('句子为空：没有可分析的对象');
    if (constituents.length === 0) {
        errors.push('未给出任何成分：整句解析至少要给出一条');
        return { errors, hints, clauses };
    }
    for (const constituent of constituents) {
        if (!Number.isInteger(constituent.start) || !Number.isInteger(constituent.end)) {
            errors.push(`成分「${constituent.label}」的区间不是整数`);
            continue;
        }
        if (constituent.start < 0 || constituent.end > sentence.length || constituent.end <= constituent.start) {
            errors.push(`成分「${constituent.label}」的区间 ${String(constituent.start)}–${String(constituent.end)} 超出句子范围`);
        }
        if (constituent.label.trim() === '')
            errors.push('存在没有名称的成分');
    }
    const ordered = [...constituents]
        .filter((item) => item.start >= 0 && item.end <= sentence.length && item.end > item.start)
        .sort((left, right) => left.start - right.start);
    for (let index = 1; index < ordered.length; index += 1) {
        const previous = ordered[index - 1];
        const current = ordered[index];
        if (current.start < previous.end) {
            errors.push(`成分「${previous.label}」与「${current.label}」区间重叠：同一段文字被算了两次`);
        }
    }
    // Any run of text with words in it that no constituent covers is a real gap.
    let cursor = 0;
    for (const constituent of ordered) {
        const gap = sentence.slice(cursor, constituent.start);
        if (/[\p{L}]{2}/u.test(gap)) {
            errors.push(`有文字未被任何成分覆盖：「${gap.trim()}」`);
        }
        cursor = Math.max(cursor, constituent.end);
    }
    const tail = sentence.slice(cursor);
    if (/[\p{L}]{2}/u.test(tail)) {
        errors.push(`句尾有文字未被任何成分覆盖：「${tail.trim()}」`);
    }
    for (const clause of clauses) {
        const covered = ordered.some((item) => item.start <= clause.core.start && item.end >= clause.core.end);
        if (!covered) {
            errors.push(`漏掉从句：「${clause.text}」（位置 ${String(clause.start)}–${String(clause.end)}）`);
        }
    }
    // One constituent spanning the whole sentence is a summary, not an analysis —
    // but only when the sentence really does contain more than one clause.
    if (clauses.length > 1 && ordered.length === 1) {
        hints.push('整句只有一条成分，等于没有拆分：请按从句/词组分别解析');
    }
    if (clauses.length > ordered.length) {
        hints.push(`句子有 ${String(clauses.length)} 个从句单位，成分只有 ${String(ordered.length)} 条`);
    }
    return { errors, hints, clauses };
}
