/**
 * How many takes one source keeps.
 *
 * Audio is stored inside the record, so the list cannot grow without bound. The
 * cap is generous (a reader would have to regenerate the same sentence two dozen
 * times) and trimming is reported back rather than hidden: the oldest takes
 * beyond it are dropped, and the selected take is never one of them.
 */
export const MAX_AUDIO_TAKES = 24;
/**
 * The source fingerprint: what identifies the audio's source and nothing else.
 *
 * Titles, chapter names and the current selection are deliberately absent from
 * it — renaming a paragraph must not invalidate audio — while both revisions are
 * present, because a corrected sentence does.
 */
export function sentenceAudioSourceKey(source) {
    return `${source.passageId}|${source.sentenceId}|${String(source.sourceRevision)}|${String(source.sentenceRevision)}`;
}
export function inflectionAudioSourceKey(source) {
    return `${source.formId}|${String(source.inflectionRevision)}`;
}
/** A record key is path-safe, so the fingerprint itself is hashed. */
async function audioRecordKey(prefix, fingerprint) {
    const bytes = new TextEncoder().encode(`audio\u0000${fingerprint}`);
    const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
    const hex = [...digest.slice(0, 16)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${prefix}_${hex}`;
}
export const sentenceAudioRecordKey = (fingerprint) => audioRecordKey('saudio', fingerprint);
export const inflectionAudioRecordKey = (fingerprint) => audioRecordKey('iaudio', fingerprint);
/** Newest first, with the id as the tie-break so two takes in one millisecond still order. */
function newestFirst(takes) {
    return [...takes].sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.takeId.localeCompare(left.takeId));
}
/**
 * Append one take, or recognise that it is already there.
 *
 * A retry is recognised by `takeId` *and* by `requestId`: the same request may
 * arrive again with a freshly generated id, and that must still be the same one
 * piece of work rather than a second version.
 */
function appendToTakes(takes, take, selectedTakeId) {
    const byId = takes.find((entry) => entry.takeId === take.takeId);
    if (byId !== undefined)
        return { takes: newestFirst(takes), appended: false, trimmed: 0 };
    const byRequest = takes.find((entry) => entry.requestId === take.requestId);
    if (byRequest !== undefined)
        return { takes: newestFirst(takes), appended: false, trimmed: 0 };
    const ordered = newestFirst([...takes, take]);
    const kept = [];
    let trimmed = 0;
    for (const entry of ordered) {
        // The selected take is never trimmed: dropping the take the reader is
        // listening to would be data loss disguised as housekeeping.
        if (kept.length < MAX_AUDIO_TAKES || entry.takeId === selectedTakeId)
            kept.push(entry);
        else
            trimmed += 1;
    }
    return { takes: kept, appended: true, trimmed };
}
/** The one stored take a selection names, or why it cannot be named. */
function takeForSelection(takes, takeId, 
/** True when this take really belongs to the source the caller named. */
belongsToSource, 
/** The revision to report when it does not. */
revisionOf) {
    const take = takes.find((entry) => entry.takeId === takeId);
    if (take === undefined)
        return { kind: 'unknown-take' };
    if (!belongsToSource(take))
        return { kind: 'revision-mismatch', storedRevision: revisionOf(take) };
    return { kind: 'ok', take };
}
/* --------------------------------------------------------------- sentence --- */
export async function appendSentenceAudioTake(table, take) {
    const sourceKey = sentenceAudioSourceKey(take.source);
    const recordKey = await sentenceAudioRecordKey(sourceKey);
    const existing = readSentenceAudioStore(table, recordKey);
    const merged = appendToTakes(existing?.takes ?? [], take, existing?.selectedTakeId ?? null);
    const stored = merged.appended
        ? take
        : (existing?.takes ?? []).find((entry) => entry.takeId === take.takeId)
            ?? (existing?.takes ?? []).find((entry) => entry.requestId === take.requestId)
            ?? take;
    await table.put(recordKey, {
        kind: 'sentenceAudioTake',
        recordVersion: 1,
        payload: {
            fingerprint: sourceKey,
            takes: merged.takes,
            selectedTakeId: existing?.selectedTakeId ?? null,
            updatedAt: new Date().toISOString(),
        },
    });
    return { take: stored, appended: merged.appended, trimmed: merged.trimmed, sourceKey, recordKey };
}
export async function listSentenceAudioTakes(table, source) {
    const sourceKey = sentenceAudioSourceKey(source);
    const record = readSentenceAudioStore(table, await sentenceAudioRecordKey(sourceKey));
    return {
        sourceKey,
        takes: newestFirst(record?.takes ?? []),
        selectedTakeId: record?.selectedTakeId ?? null,
    };
}
export async function selectSentenceAudioTake(table, source, takeId) {
    const sourceKey = sentenceAudioSourceKey(source);
    const recordKey = await sentenceAudioRecordKey(sourceKey);
    const record = readSentenceAudioStore(table, recordKey);
    if (record === undefined)
        return { kind: 'unknown-source' };
    const found = takeForSelection(record.takes, takeId, (take) => take.source.sentenceRevision === source.sentenceRevision
        && take.source.sourceRevision === source.sourceRevision, (take) => take.source.sentenceRevision);
    if (found.kind === 'unknown-take')
        return found;
    if (found.kind === 'revision-mismatch')
        return { kind: 'revision-mismatch', storedRevision: found.storedRevision };
    if (record.selectedTakeId === takeId)
        return { kind: 'already-selected', takeId };
    await table.put(recordKey, {
        kind: 'sentenceAudioTake',
        recordVersion: 1,
        payload: { ...record, selectedTakeId: takeId, updatedAt: new Date().toISOString() },
    });
    return { kind: 'selected', takeId };
}
export async function readSentenceAudioAsset(table, source, takeId) {
    const record = readSentenceAudioStore(table, await sentenceAudioRecordKey(sentenceAudioSourceKey(source)));
    const take = record?.takes.find((entry) => entry.takeId === takeId);
    return take === undefined ? null : toAsset(take);
}
/** The newest take of this fingerprint made by exactly this backend and voice. */
export function newestSentenceAudioTake(list, wanted, agrees) {
    return newestMatching(list.takes, wanted, agrees);
}
/* ------------------------------------------------------------- inflection --- */
export async function appendInflectionAudioTake(table, take) {
    const sourceKey = inflectionAudioSourceKey(take.source);
    const recordKey = await inflectionAudioRecordKey(sourceKey);
    const existing = readInflectionAudioStore(table, recordKey);
    const merged = appendToTakes(existing?.takes ?? [], take, existing?.selectedTakeId ?? null);
    const stored = merged.appended
        ? take
        : (existing?.takes ?? []).find((entry) => entry.takeId === take.takeId)
            ?? (existing?.takes ?? []).find((entry) => entry.requestId === take.requestId)
            ?? take;
    await table.put(recordKey, {
        kind: 'inflectionAudioTake',
        recordVersion: 1,
        payload: {
            fingerprint: sourceKey,
            takes: merged.takes,
            selectedTakeId: existing?.selectedTakeId ?? null,
            updatedAt: new Date().toISOString(),
        },
    });
    return { take: stored, appended: merged.appended, trimmed: merged.trimmed, sourceKey, recordKey };
}
export async function listInflectionAudioTakes(table, source) {
    const sourceKey = inflectionAudioSourceKey(source);
    const record = readInflectionAudioStore(table, await inflectionAudioRecordKey(sourceKey));
    return {
        sourceKey,
        takes: newestFirst(record?.takes ?? []),
        selectedTakeId: record?.selectedTakeId ?? null,
    };
}
export async function selectInflectionAudioTake(table, source, takeId) {
    const sourceKey = inflectionAudioSourceKey(source);
    const recordKey = await inflectionAudioRecordKey(sourceKey);
    const record = readInflectionAudioStore(table, recordKey);
    if (record === undefined)
        return { kind: 'unknown-source' };
    const found = takeForSelection(record.takes, takeId, (take) => take.source.inflectionRevision === source.inflectionRevision, (take) => take.source.inflectionRevision);
    if (found.kind === 'unknown-take')
        return found;
    if (found.kind === 'revision-mismatch')
        return { kind: 'revision-mismatch', storedRevision: found.storedRevision };
    if (record.selectedTakeId === takeId)
        return { kind: 'already-selected', takeId };
    await table.put(recordKey, {
        kind: 'inflectionAudioTake',
        recordVersion: 1,
        payload: { ...record, selectedTakeId: takeId, updatedAt: new Date().toISOString() },
    });
    return { kind: 'selected', takeId };
}
export async function readInflectionAudioAsset(table, source, takeId) {
    const record = readInflectionAudioStore(table, await inflectionAudioRecordKey(inflectionAudioSourceKey(source)));
    const take = record?.takes.find((entry) => entry.takeId === takeId);
    return take === undefined ? null : toAsset(take);
}
export function newestInflectionAudioTake(list, wanted, agrees) {
    return newestMatching(list.takes, wanted, agrees);
}
/**
 * A cached take is only a cache hit for the same backend, model and voice.
 *
 * The audio itself is what must match: answering a request for another voice
 * with the previous take would be playing the wrong thing, not a cache hit. The
 * caller may narrow it further — a stored take whose *reading* differs from the
 * one asked for is not that reading's audio either.
 */
function newestMatching(takes, wanted, agrees) {
    return takes.find((take) => (agrees === undefined || agrees(take))
        && take.backend.kind === wanted.backend.kind
        && take.backend.providerId === wanted.backend.providerId
        && take.backend.modelId === wanted.backend.modelId
        && take.voice.voiceId === wanted.voice.voiceId
        && take.voice.rate === wanted.voice.rate) ?? null;
}
function toAsset(take) {
    return {
        takeId: take.takeId,
        mimeType: take.mimeType,
        base64: take.audioBase64,
        bytes: take.bytes,
        durationMs: take.durationMs,
        createdAt: take.createdAt,
    };
}
/** One stored take, or undefined when the record is absent or of another kind. */
function readSentenceAudioStore(table, recordKey) {
    const record = table.get(recordKey);
    return record?.kind === 'sentenceAudioTake' ? record.payload : undefined;
}
function readInflectionAudioStore(table, recordKey) {
    const record = table.get(recordKey);
    return record?.kind === 'inflectionAudioTake' ? record.payload : undefined;
}
