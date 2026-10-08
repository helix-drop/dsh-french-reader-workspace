/** A record key is path-safe: the lemma is normalised and hex-encoded. */
export const conjugationKey = (lemma) => `conj_${[...lemma.trim().toLowerCase().normalize('NFC')]
    .map((character) => character.codePointAt(0).toString(16))
    .join('')}`;
/** One lemma's record, or undefined when nothing was ever fetched for it. */
export function readConjugationRecord(table, lemma) {
    const record = table.get(conjugationKey(lemma));
    return record?.kind === 'conjugationDataset' ? record.payload : undefined;
}
/** Every stored dataset, newest first. */
export function listConjugationRecords(table) {
    const records = [];
    for (const [, record] of table.entries()) {
        if (record.kind === 'conjugationDataset')
            records.push(record.payload);
    }
    return records.sort((left, right) => right.fetchedAt.localeCompare(left.fetchedAt));
}
/**
 * What the card should say about one lemma.
 *
 * `no-data` is a first-class answer, not an error: it is what an honest card says
 * before anything was fetched, and it never falls back to a generated paradigm.
 */
export function answerForLemma(table, lemma) {
    const record = readConjugationRecord(table, lemma);
    if (record === undefined) {
        return { kind: 'no-data', lemma, reason: '尚未获取该动词的读音数据' };
    }
    if (record.dataset === null) {
        return { kind: 'pending', record, reason: record.failure ?? `数据未取得（${record.fetchStatus}）` };
    }
    return { kind: 'dataset', record };
}
/** Store one fetched dataset with its provenance and fetch state. */
export async function writeConjugationDataset(table, input) {
    const existing = readConjugationRecord(table, input.lemma);
    const now = new Date().toISOString();
    const record = {
        id: existing?.id ?? globalThis.crypto.randomUUID(),
        lemma: input.lemma,
        source: input.source,
        sourceVersion: input.sourceVersion,
        fetchStatus: input.fetchStatus,
        failure: input.failure ?? null,
        missingForms: [...(input.missingForms ?? [])],
        dataset: input.dataset,
        fetchedAt: now,
        updatedAt: now,
    };
    await table.put(conjugationKey(input.lemma), {
        kind: 'conjugationDataset', recordVersion: 1, payload: record,
    });
    return record;
}
/**
 * Merge a newly fetched tense into an existing dataset.
 *
 * A paradigm is assembled a tense at a time under a request budget, so a second run
 * must not throw the first run's tenses away. Tenses present in both are replaced by
 * the newer fetch — the same source, read again — while tenses only one side has are
 * kept.
 */
export function mergeDataset(existing, fetched) {
    if (existing === null)
        return fetched;
    const merged = [...existing.tenses];
    for (const tense of fetched.tenses) {
        const at = merged.findIndex((entry) => entry.mood === tense.mood && entry.tense === tense.tense);
        if (at === -1)
            merged.push(tense);
        else
            merged[at] = tense;
    }
    return { ...fetched, tenses: merged };
}
/** The persons a dataset is still missing for one tense, so a card can say what is absent. */
export function missingPersons(dataset, slot) {
    const tense = dataset.tenses.find((entry) => entry.mood === slot.mood && entry.tense === slot.tense);
    if (tense === undefined)
        return ['1s', '2s', '3s', '1p', '2p', '3p'];
    const present = new Set(tense.forms.map((form) => form.person));
    return ['1s', '2s', '3s', '1p', '2p', '3p'].filter((person) => !present.has(person));
}
