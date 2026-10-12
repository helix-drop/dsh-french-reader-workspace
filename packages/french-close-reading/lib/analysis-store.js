import { SentenceAnalysisSchema, analysisCoverage, validateSentenceAnalysis } from "./analysis.js";
import { normalizeAnalysisReply, extractAnalysisObject, sourceTokens } from "./analysis-reception.js";
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
    const shape = SentenceAnalysisSchema.safeParse(analysis);
    if (!shape.success)
        return { stored: false, errors: shape.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`), hints: [] };
    analysis = shape.data;
    const report = validateSentenceAnalysis(analysis, sentenceText);
    if (report.errors.length > 0) {
        return { stored: false, errors: report.errors, hints: report.hints };
    }
    const store = readSentenceAnalyses(table, analysis.passageId);
    const existing = store.sentences.find((entry) => entry.anchorId === analysis.anchorId);
    // Preserve the previously usable analysis before a partial generation replaces it.
    // The snapshot uses the existing record schema and travels with library backups.
    if (existing !== undefined && analysis.reception?.state === 'partial' && existing.reception?.state !== 'partial') {
        await table.put(`sentences_${analysis.passageId}_history_${analysis.anchorId}_${existing.revision}`, {
            kind: 'sentenceAnalyses', recordVersion: 1, payload: { passageId: analysis.passageId, sentences: [existing] },
        });
    }
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
 * usable". Source token anchors are provided by the program; the model identifies
 * syntax and quotes. Unresolved nodes remain pending rather than receiving guessed ranges.
 */
export const ANALYSIS_JSON_CONTRACT = {
    translation: 'string — 简体中文译文',
    backbone: 'string — 法语主干，保留否定、必要补语与原词',
    clauses: [{ id: 'string — 唯一标识，例如 c1', role: 'string — 中文从句类型', startToken: 'number — 首词段编号', endToken: 'number — 末词段编号，包含此词段', text: 'string — 连续的准确原文', parentId: 'string|null — 父从句标识' }],
    constituents: [{ role: 'string — 中文句法功能', startToken: 'number', endToken: 'number', text: 'string — 连续的准确原文', clauseId: 'string|null — 所属从句标识', partOfSpeech: 'string|null — 中文词性', gloss: 'string — 一两句中文句意，内部成分可为空' }],
    morphology: [],
    explanations: [{ kind: 'context|rhetoric|unverified', text: 'string — 简短说明', start: null, end: null }],
};
export const ANALYSIS_CONTEXT_CHARACTER_LIMIT = 3500;
/** Same-passage, paragraph-atomic context; the target sentence's paragraph is mandatory. */
export function selectAnalysisContext(paragraphs, anchorId, requestedParagraphIds) {
    const currentIndex = paragraphs.findIndex((paragraph) => paragraph.sentences.some((sentence) => sentence.id === anchorId));
    if (currentIndex < 0)
        return null;
    const indexed = [];
    if (currentIndex > 0)
        indexed.push({ paragraph: paragraphs[currentIndex - 1], relation: 'previous' });
    indexed.push({ paragraph: paragraphs[currentIndex], relation: 'current' });
    if (currentIndex + 1 < paragraphs.length)
        indexed.push({ paragraph: paragraphs[currentIndex + 1], relation: 'next' });
    const current = indexed.find(({ relation }) => relation === 'current').paragraph;
    const currentParagraphId = current.id;
    if (current.text.length > ANALYSIS_CONTEXT_CHARACTER_LIMIT) {
        return {
            ok: false, reason: 'current-paragraph-too-long', currentParagraphId,
            characters: current.text.length,
            candidates: indexed.map(({ paragraph, relation }) => ({
                paragraphId: paragraph.id, relation, text: paragraph.text, start: paragraph.start, end: paragraph.end,
                included: relation === 'current', reason: relation === 'current' ? 'included' : 'not-selected',
            })),
            includedParagraphIds: [currentParagraphId],
            omittedParagraphIds: indexed.filter(({ relation }) => relation !== 'current').map(({ paragraph }) => paragraph.id),
        };
    }
    let included = new Set();
    let reason = null;
    if (requestedParagraphIds === undefined) {
        included.add(currentParagraphId);
        let characters = current.text.length;
        for (const candidate of indexed.filter(({ relation }) => relation !== 'current')) {
            if (characters + candidate.paragraph.text.length <= ANALYSIS_CONTEXT_CHARACTER_LIMIT) {
                included.add(candidate.paragraph.id);
                characters += candidate.paragraph.text.length;
            }
        }
    }
    else {
        const requested = new Set(requestedParagraphIds);
        const known = new Set(indexed.map(({ paragraph }) => paragraph.id));
        if (requested.size !== requestedParagraphIds.length || [...requested].some((id) => !known.has(id)) || !requested.has(currentParagraphId)) {
            reason = 'selection-invalid';
        }
        else {
            included = requested;
            const size = indexed.filter(({ paragraph }) => included.has(paragraph.id))
                .reduce((total, { paragraph }) => total + paragraph.text.length, 0);
            if (size > ANALYSIS_CONTEXT_CHARACTER_LIMIT)
                reason = 'selected-context-too-long';
        }
    }
    const characters = indexed.filter(({ paragraph }) => included.has(paragraph.id))
        .reduce((total, { paragraph }) => total + paragraph.text.length, 0);
    const candidates = indexed.map(({ paragraph, relation }) => {
        const selected = included.has(paragraph.id);
        return {
            paragraphId: paragraph.id, relation, text: paragraph.text, start: paragraph.start, end: paragraph.end,
            included: selected,
            reason: selected ? 'included' : requestedParagraphIds === undefined ? 'over-budget' : 'not-selected',
        };
    });
    return {
        ok: reason === null,
        reason,
        currentParagraphId,
        characters,
        candidates,
        includedParagraphIds: candidates.filter((candidate) => candidate.included).map((candidate) => candidate.paragraphId),
        omittedParagraphIds: candidates.filter((candidate) => !candidate.included).map((candidate) => candidate.paragraphId),
    };
}
/** The instruction that asks for one sentence analysis. */
export function analysisPrompt(input) {
    const materials = input.contextMaterials ?? [
        ...(input.previousParagraph === undefined || input.previousParagraph.trim() === ''
            ? [] : [{ paragraphId: '', relation: 'previous', text: input.previousParagraph }]),
        { paragraphId: '', relation: 'current', text: input.paragraph },
        ...(input.nextParagraph === undefined || input.nextParagraph.trim() === ''
            ? [] : [{ paragraphId: '', relation: 'next', text: input.nextParagraph }]),
    ];
    const labels = { previous: '前一段', current: '当前段落', next: '后一段' };
    const current = materials.find((material) => material.relation === 'current');
    const adjacent = materials.filter((material) => material.relation !== 'current');
    return [
        '请对下面这一句法语做逐句精读解析，只输出一个 JSON 对象，不要输出解释文字或代码块标记。',
        '',
        'JSON 形状（字段名必须一致）：',
        JSON.stringify(ANALYSIS_JSON_CONTRACT, null, 2),
        '',
        '规则：',
        '- 不计算字符位置。startToken/endToken 引用程序提供的词段编号，均从 1 开始，末编号包含在范围内。text 必须等于这两个编号之间的连续原文，保留标点和空格。不能拼接不连续的词；这种结构分成多条成分并在 gloss 说明。',
        '- clauses 的 id 必须唯一；parentId 和 clauseId 引用这些标识，不使用数组下标。父级不可指向自身或形成循环。成分范围应位于所属从句内。编号用于定位，不要求逐词分析。',
        '- 所有讲解与结构标签必须使用简体中文：包括译文、从句/成分角色、成分句意 gloss、词性与形态标签、note 和 explanations.text；仅 backbone、法语原文片段、form/lemma/agreesWith 保留法语。',
        '- 已提供的前后段落只用于理解代词指向与段落衔接；解析范围仍仅限目标句，不可把上下文当作本句事实；未提供的段落内容不可猜测。',
        '- constituents 同时包含阅读片段和内部句法成分，内部范围可以嵌套在阅读片段中；同一层不要交叉重叠。准确引用原文，不要为了覆盖每个字符添加虚构成分。',
        '- 先按从句或主要词组提供两到四个阅读片段及中文 gloss，再在同一 constituents 数组补充片段内部的主语、变位动词（复合时态包含助动词和分词）、直接/间接宾语、表语、状语、不定式补语和名词修饰的准确范围。内部句法成分的 gloss 可以留空，不要逐词机械切分。例如 Léa est allée à la bibliothèque 中，Léa 标主语，est allée 标变位动词，à la bibliothèque 标地点状语。',
        '- 多从句的句子不要用一个成分覆盖整句。',
        '- 结构说明以成分为主。每个成分的 gloss 只写一两句：先给这个片段在本句中的意思，再用半句点明它做什么。不要写句法论文，不要写「属于某种形式」这类教科书说明。',
        '- 成分的 role 只写功能名，例如主句、让步从句、主语、变位动词、状语、直接宾语。不要在 role 里用括号追加句法说明。',
        '- morphology 留空数组。界面不展示逐词形态，不要为每个词填写。',
        '- explanations 不是主体，可以为空数组。只在俗语、固定说法、修辞，或尚不能确定的指代上稍作延伸，每条一两句，不要重复 gloss。kind 用 rhetoric、context 或 unverified；不要为了分类再写一段 syntax。',
        '- 词性（partOfSpeech）与句法功能（role）分开写，不要混在一个字段里。',
        '- 主语范围不含变位动词；现在分词和不定式不标为变位动词。表语、程度副词及宾语补足语分别标注，不并入动词范围。复合动词遇到插入副词时拆分助动词和分词，并说明组合关系。',
        '- 先判断每个 que 是关系代词、内容补语还是结果连接词；并列内容从句使用同一 parentId，不把第二项嵌入第一项。分词结构的内容从句归于分词结构，该结构归于它实际修饰的主句。',
        '- 对内部成分只写必要的指代、时态或固定结构说明，避免重复阅读片段的译文；不确定的判断留作待查证。',
        '',
        ...adjacent.map((material) => [`【${labels[material.relation]}（仅供指代与衔接参考，不需解析）${material.paragraphId ? ` · ${material.paragraphId}` : ''}】\n${material.text}`, '']).flat(),
        `【当前段落${current?.paragraphId ? ` · ${current.paragraphId}` : ''}】\n${current?.text ?? input.paragraph}`,
        ...(input.omittedParagraphIds?.length ? ['', `【未纳入的同篇相邻段落锚点】${input.omittedParagraphIds.join('、')}（其内容未提供；不要推测）`] : []),
        '',
        `【需要解析的这一句 · 锚点 ${input.anchorId}】\n${input.sentence}`,
        '',
        `【原文词段编号，仅用于定位】\n${sourceTokens(input.sentence).map(token => `${token.id}:${token.text}`).join(' ')}`,
    ].join('\n');
}
/**
 * Read a model reply into a stored analysis, or say precisely why it cannot be.
 *
 * The reply is expected to be one JSON object, possibly wrapped in a code fence.
 * Wire token anchors and stable labels are normalized before storage UUIDs are
 * generated. Legacy offsets and numeric references remain supported. Strict
 * imports refuse invalid nodes; allowPartial retains only validated nodes and
 * records every unresolved quotation/reference instead of guessing a parent.
 */
export function parseAnalysisReply(reply, input) {
    const extracted = extractJsonObject(reply);
    if (extracted === null)
        return { ok: false, reason: 'model-reply-not-json', detail: reply.slice(0, 300) };
    const normalized = normalizeAnalysisReply(extracted, input.text);
    const json = normalized.json;
    if (!input.allowPartial && normalized.reception.issues.length)
        return { ok: false, reason: 'analysis-invalid', detail: normalized.reception.issues.map(issue => `${issue.kind} ${issue.index + 1}: ${issue.reason}`).join('；') };
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
    // Contract violations are collected and then refused together, so the report
    // names everything the reply got wrong rather than one field at a time.
    const problems = [];
    /** Source quotations, rather than the model's character counting, determine ranges. */
    const rangeOf = (item, what) => {
        const quoted = typeof item.text === 'string' ? item.text : '';
        const valid = typeof item.start === 'number' && Number.isSafeInteger(item.start) && item.start >= 0
            && typeof item.end === 'number' && Number.isSafeInteger(item.end) && item.end > item.start && item.end <= input.text.length;
        if (valid && (quoted === '' || input.text.slice(item.start, item.end) === quoted)) {
            return { start: item.start, end: item.end, text: input.text.slice(item.start, item.end) };
        }
        if (quoted !== '') {
            const first = input.text.indexOf(quoted);
            if (first >= 0 && input.text.indexOf(quoted, first + 1) === -1)
                return { start: first, end: first + quoted.length, text: quoted };
            // Typography may differ, but no words may be added, dropped or substituted.
            const escaped = quoted.trim().replace(/[.*+?^${}()|[\]\\]/gu, '\\$&').replace(/\s+/gu, '\\s+').replace(/['’]/gu, "['’]");
            if (escaped !== '') {
                const matches = [...input.text.matchAll(new RegExp(escaped, 'gu'))];
                if (matches.length === 1) {
                    const start = matches[0].index;
                    return { start, end: start + matches[0][0].length, text: matches[0][0] };
                }
            }
        }
        problems.push(`${what} 的原文片段无法唯一定位；请提供本句中的准确引用`);
        return { start: 0, end: 0, text: quoted };
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
        return null;
    };
    const built = clauses.map(({ id, entry }, index) => {
        const item = asRecord(entry);
        const { start, end, text } = rangeOf(item, `第 ${String(index + 1)} 个从句`);
        const parentIndex = clauseIndexOf(item.parentIndex, `第 ${String(index + 1)} 个从句`);
        return {
            id,
            role: stringOf(item.role, '从句'),
            start,
            end,
            text,
            parentId: parentIndex === null ? null : (clauseIds.get(parentIndex) ?? null),
        };
    });
    const constituents = (Array.isArray(json.constituents) ? json.constituents : []).map((entry, index) => {
        const item = asRecord(entry);
        const gloss = typeof item.gloss === 'string' ? item.gloss.trim() : '';
        const { start, end, text } = rangeOf(item, `第 ${String(index + 1)} 个成分`);
        const clauseIndex = clauseIndexOf(item.clauseIndex, `第 ${String(index + 1)} 个成分`);
        return {
            id: globalThis.crypto.randomUUID(),
            role: stringOf(item.role, '成分'),
            start,
            end,
            text,
            clauseId: clauseIndex === null ? null : (clauseIds.get(clauseIndex) ?? null),
            partOfSpeech: typeof item.partOfSpeech === 'string' && item.partOfSpeech !== '' ? item.partOfSpeech : null,
            gloss,
        };
    });
    const morphology = (Array.isArray(json.morphology) ? json.morphology : []).map((entry, index) => {
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
    // Refuse unlocatable source quotations and invalid hierarchy references.
    if (problems.length > 0) {
        return { ok: false, reason: 'analysis-invalid', detail: problems.join('；') };
    }
    if (input.allowPartial) {
        let cursor = 0;
        const ranges = [...constituents].sort((a, b) => a.start - b.start || a.end - b.end);
        for (const range of [...ranges, { start: input.text.length, end: input.text.length }]) {
            if (range.start > cursor) {
                const gap = input.text.slice(cursor, range.start);
                if (/[\p{L}\p{N}]/u.test(gap))
                    normalized.reception.issues.push({
                        kind: 'constituent', index: normalized.reception.receivedConstituents,
                        role: '未解析片段', text: gap, reason: '尚未提供该片段的成分分析',
                    });
            }
            cursor = Math.max(cursor, range.end);
        }
        if (normalized.reception.issues.length)
            normalized.reception.state = 'partial';
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
            ...(input.allowPartial ? { reception: normalized.reception } : {}),
            revision: 1,
            createdAt: now,
            updatedAt: now,
        },
    };
}
/** The first JSON object in a reply, tolerating a code fence around it. */
export function extractJsonObject(reply) {
    return extractAnalysisObject(reply);
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
