import { analysisCoverage, validateSentenceAnalysis } from "./analysis.js";
export const sentenceAnalysesKey = (passageId) => `sentences_${passageId}`;
export const analysisVersionsKey = (passageId) => `analysisVersions_${passageId}`;
export function readSentenceAnalyses(table, passageId) {
    const record = table.get(sentenceAnalysesKey(passageId));
    return record?.kind === 'sentenceAnalyses' ? record.payload : { passageId, sentences: [] };
}
export async function writeSentenceAnalyses(table, value) {
    await table.put(sentenceAnalysesKey(value.passageId), {
        kind: 'sentenceAnalyses', recordVersion: 1, payload: value,
    });
}
export function readAnalysisVersions(table, passageId) {
    const record = table.get(analysisVersionsKey(passageId));
    return record?.kind === 'analysisVersions' ? record.payload : { passageId, versions: [], currentId: null };
}
export async function writeAnalysisVersions(table, value) {
    await table.put(analysisVersionsKey(value.passageId), {
        kind: 'analysisVersions', recordVersion: 1, payload: value,
    });
}
/**
 * Store one sentence analysis.
 *
 * The analysis must pass the gate first: an analysis with errors is refused here
 * rather than stored and shown as if it were usable. Re-analysing a sentence
 * replaces that sentence's row and leaves every other sentence untouched, so a
 * batch can be completed one sentence at a time. The revision belongs to the
 * store, not to the draft: the first analysis of a sentence is revision 1 and
 * each replacement increments it, so two analyses of one sentence can be told
 * apart by more than their timestamps.
 */
export async function putSentenceAnalysis(table, analysis, sentenceText) {
    const report = validateSentenceAnalysis(analysis, sentenceText);
    if (report.errors.length > 0) {
        return { stored: false, errors: report.errors, hints: report.hints };
    }
    const store = readSentenceAnalyses(table, analysis.passageId);
    const existing = store.sentences.find((entry) => entry.anchorId === analysis.anchorId);
    const versioned = existing === undefined ? analysis : { ...analysis, revision: existing.revision + 1 };
    const sentences = existing === undefined
        ? [...store.sentences, versioned]
        : store.sentences.map((entry) => (entry.anchorId === analysis.anchorId ? versioned : entry));
    await writeSentenceAnalyses(table, { passageId: analysis.passageId, sentences });
    return { stored: true, hints: report.hints, replaced: existing !== undefined };
}
/**
 * Publish a version: which source revision it was written against, the overall
 * translation, the cohesion notes, and exactly which sentences it covers.
 *
 * Publishing is a pointer move, never a rewrite: earlier versions stay readable,
 * and the coverage list is computed from what is actually stored so a version
 * cannot claim a sentence it does not contain.
 */
export async function publishAnalysisVersion(table, input) {
    const analyses = readSentenceAnalyses(table, input.passageId).sentences;
    const coverage = analysisCoverage(input.sentences.map((sentence) => ({ id: sentence.anchorId, text: sentence.text })), analyses);
    if (coverage.covered.length === 0) {
        return { published: false, reason: 'no-valid-analysis' };
    }
    const store = readAnalysisVersions(table, input.passageId);
    const now = new Date().toISOString();
    const version = {
        id: globalThis.crypto.randomUUID(),
        passageId: input.passageId,
        revision: store.versions.length + 1,
        sourceRevision: input.sourceRevision,
        overallTranslation: input.overallTranslation,
        cohesion: input.cohesion,
        coveredAnchors: coverage.covered,
        backend: input.backend ?? null,
        model: input.model ?? null,
        createdAt: now,
    };
    await writeAnalysisVersions(table, {
        passageId: input.passageId,
        versions: [...store.versions, version],
        currentId: version.id,
    });
    return { published: true, version };
}
/** What the passage's analysis covers right now, measured rather than claimed. */
export function coverageOf(table, passageId, sentences) {
    return analysisCoverage(sentences, readSentenceAnalyses(table, passageId).sentences);
}
/**
 * The JSON contract one sentence analysis must satisfy.
 *
 * It is stated to the model as data, and the same shape is what the validator
 * checks, so "the model returned JSON" is never mistaken for "the analysis is
 * usable". Ranges are left for the model to fill from the sentence it was given;
 * a reply whose ranges do not fit is refused by the gate with the offending range
 * named.
 */
export const ANALYSIS_JSON_CONTRACT = {
    translation: 'string — 该句的中文译文',
    backbone: 'string — 去掉修饰后的句子主干',
    clauses: [{ role: 'string — 主句／关系从句／补语从句…', start: 'number', end: 'number', text: 'string', parentIndex: 'number|null — 父从句在下标中的位置' }],
    constituents: [{ role: 'string — 主语／谓语／直接宾语／表语／宾补／状语…', start: 'number', end: 'number', text: 'string', clauseIndex: 'number|null', partOfSpeech: 'string|null — 词性，不是句法功能' }],
    morphology: [{ form: 'string', lemma: 'string|null', partOfSpeech: 'string|null', tense: 'string|null', mood: 'string|null', person: 'string|null', gender: 'string|null', number: 'string|null', agreesWith: 'string|null', note: 'string' }],
    explanations: [{ kind: 'syntax|context|rhetoric|unverified', text: 'string', start: 'number|null', end: 'number|null' }],
};
/** The instruction that asks for one sentence analysis. */
export function analysisPrompt(input) {
    return [
        '请对下面这一句法语做逐句精读解析，只输出一个 JSON 对象，不要输出解释文字或代码块标记。',
        '',
        'JSON 形状（字段名必须一致）：',
        JSON.stringify(ANALYSIS_JSON_CONTRACT, null, 2),
        '',
        '规则：',
        '- start/end 是相对「这一句」的字符下标，半开区间，必须落在句子范围内。',
        '- 句子里每一段含词的文字都必须被某个成分覆盖，不要留空隙；不要用一个成分覆盖整句来敷衍。',
        `- kind 为 syntax 的只写句法事实，不要写作者意图；语境与修辞分别用 context 与 rhetoric；不确定用 unverified。`,
        '- 词性（partOfSpeech）与句法功能（role）分开写，不要混在一个字段里。',
        '',
        `【当前段落】\n${input.paragraph}`,
        '',
        `【需要解析的这一句 · 锚点 ${input.anchorId}】\n${input.sentence}`,
    ].join('\n');
}
/**
 * Read a model reply into a stored analysis, or say precisely why it cannot be.
 *
 * The reply is expected to be one JSON object, possibly wrapped in a code fence.
 * Index references (`parentIndex`, `clauseIndex`) are how a model can point at
 * another item without inventing an id; they are resolved here into real ids, and
 * an index that names nothing is a refusal rather than a dropped parent.
 * Character offsets obey the same rule: they must be non-negative integers
 * exactly as the contract states them — a reply that breaks the contract is
 * refused, never repaired into something that merely looks valid.
 */
export function parseAnalysisReply(reply, input) {
    const json = extractJsonObject(reply);
    if (json === null)
        return { ok: false, reason: 'model-reply-not-json', detail: reply.slice(0, 300) };
    const translation = typeof json.translation === 'string' ? json.translation.trim() : '';
    if (translation === '')
        return { ok: false, reason: 'analysis-incomplete', detail: '译文为空' };
    const clauseIds = new Map();
    const rawClauses = Array.isArray(json.clauses) ? json.clauses : [];
    const clauses = rawClauses.map((entry, index) => {
        const id = globalThis.crypto.randomUUID();
        clauseIds.set(index, id);
        return { id, entry };
    });
    if (clauses.length === 0)
        return { ok: false, reason: 'analysis-incomplete', detail: '没有从句结构' };
    // Contract violations are collected and then refused together, so the report
    // names everything the reply got wrong rather than one field at a time.
    const problems = [];
    /** One character offset, exactly as the contract states it. */
    const offsetOf = (value, what) => {
        if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
            return value;
        problems.push(`${what} 的字符下标不是非负整数（${JSON.stringify(value) ?? '缺失'}）`);
        return 0;
    };
    /** One clause index reference: null, or a position that actually exists. */
    const clauseIndexOf = (value, what) => {
        if (value === null || value === undefined)
            return null;
        if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value < clauses.length) {
            return value;
        }
        problems.push(`${what} 引用了不存在的从句下标（${JSON.stringify(value) ?? '缺失'}）`);
        return null;
    };
    /** One optional offset (explanations may legitimately have no range). */
    const optionalOffsetOf = (value, what) => {
        if (value === null || value === undefined)
            return null;
        if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
            return value;
        problems.push(`${what} 的字符下标不是非负整数（${JSON.stringify(value) ?? '缺失'}）`);
        return null;
    };
    const built = clauses.map(({ id, entry }, index) => {
        const item = asRecord(entry);
        const start = offsetOf(item.start, `第 ${String(index + 1)} 个从句`);
        const end = offsetOf(item.end, `第 ${String(index + 1)} 个从句`);
        const parentIndex = clauseIndexOf(item.parentIndex, `第 ${String(index + 1)} 个从句`);
        return {
            id,
            role: stringOf(item.role, '从句'),
            start,
            end,
            text: stringOf(item.text, input.text.slice(start, end)),
            parentId: parentIndex === null ? null : (clauseIds.get(parentIndex) ?? null),
        };
    });
    const constituents = (Array.isArray(json.constituents) ? json.constituents : []).map((entry, index) => {
        const item = asRecord(entry);
        const start = offsetOf(item.start, `第 ${String(index + 1)} 个成分`);
        const end = offsetOf(item.end, `第 ${String(index + 1)} 个成分`);
        const clauseIndex = clauseIndexOf(item.clauseIndex, `第 ${String(index + 1)} 个成分`);
        return {
            id: globalThis.crypto.randomUUID(),
            role: stringOf(item.role, '成分'),
            start,
            end,
            text: stringOf(item.text, input.text.slice(start, end)),
            clauseId: clauseIndex === null ? null : (clauseIds.get(clauseIndex) ?? null),
            partOfSpeech: typeof item.partOfSpeech === 'string' && item.partOfSpeech !== '' ? item.partOfSpeech : null,
        };
    });
    const morphology = (Array.isArray(json.morphology) ? json.morphology : []).map((entry) => {
        const item = asRecord(entry);
        return {
            id: globalThis.crypto.randomUUID(),
            form: stringOf(item.form, '?'),
            lemma: nullableString(item.lemma),
            partOfSpeech: nullableString(item.partOfSpeech),
            tense: nullableString(item.tense),
            mood: nullableString(item.mood),
            person: nullableString(item.person),
            gender: nullableString(item.gender),
            number: nullableString(item.number),
            agreesWith: nullableString(item.agreesWith),
            note: typeof item.note === 'string' ? item.note : '',
        };
    });
    const explanations = (Array.isArray(json.explanations) ? json.explanations : []).map((entry, index) => {
        const item = asRecord(entry);
        const kind = item.kind;
        return {
            id: globalThis.crypto.randomUUID(),
            // An unknown kind becomes `unverified`: it must never gain the standing of
            // a stated syntactic fact by default.
            kind: (kind === 'syntax' || kind === 'context' || kind === 'rhetoric' ? kind : 'unverified'),
            text: stringOf(item.text, '（空解释）'),
            start: optionalOffsetOf(item.start, `第 ${String(index + 1)} 条解释`),
            end: optionalOffsetOf(item.end, `第 ${String(index + 1)} 条解释`),
        };
    });
    // A reply that broke the offset or index contract is refused as a whole:
    // storing a repaired version would claim the model said something it did not.
    if (problems.length > 0) {
        return { ok: false, reason: 'analysis-invalid', detail: problems.join('；') };
    }
    const now = new Date().toISOString();
    return {
        ok: true,
        analysis: {
            id: globalThis.crypto.randomUUID(),
            passageId: input.passageId,
            anchorId: input.anchorId,
            text: input.text,
            sourceRevision: input.sourceRevision,
            segmentationRevision: input.segmentationRevision,
            translation,
            backbone: typeof json.backbone === 'string' ? json.backbone : '',
            clauses: built,
            constituents,
            morphology,
            explanations,
            provenance: input.provenance ?? 'ai',
            status: 'draft',
            revision: 1,
            createdAt: now,
            updatedAt: now,
        },
    };
}
/** The first JSON object in a reply, tolerating a code fence around it. */
export function extractJsonObject(reply) {
    const text = reply.trim();
    const fenced = /```(?:json)?\s*([\s\S]*?)```/u.exec(text);
    const candidate = fenced?.[1]?.trim() ?? text;
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start)
        return null;
    try {
        const value = JSON.parse(candidate.slice(start, end + 1));
        return asRecord(value);
    }
    catch {
        return null;
    }
}
function asRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value
        : {};
}
function stringOf(value, fallback) {
    return typeof value === 'string' && value.trim() !== '' ? value : fallback;
}
function nullableString(value) {
    return typeof value === 'string' && value !== '' ? value : null;
}
