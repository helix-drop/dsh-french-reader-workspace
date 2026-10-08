/**
 * Source truthfulness gate.
 *
 * An HTTP 200 is not success. Measured on the real CNRTL etymology page for
 * `ouvrir`: the request returns 200 while the extracted text contains only the
 * site chrome (`Portail lexical`), with no etymology body at all. A card that
 * recorded "CNRTL 实时数据" from that response would be lying, so success is
 * judged on four separate things and the failure is stored with its reason.
 */

export type SourceOutcome = 'ok' | 'http-error' | 'not-found' | 'body-missing' | 'truncated' | 'parse-failed'

export interface SourceFetch {
  /** Which source produced this: `cnrtl`, `wikipedia`, `manual`, … */
  kind: string
  /** The card section this response is allowed to support. */
  section: string
  url: string | null
  httpStatus: number | null
  /** Text actually extracted from the response, empty when nothing usable came out. */
  body: string
  /** Whether the requested headword was found on the page. */
  entryFound?: boolean
  truncated?: boolean
  parseFailed?: boolean
  fetchedAt?: string | null
}

export interface SourceVerdict {
  ok: boolean
  outcome: SourceOutcome
  /** Short machine-readable explanation, stored with the record. */
  reason: string
  /** What the card is allowed to claim about this response. */
  claim: string
}

/** Chrome-only phrases that mean "the page loaded, the content did not". */
const STUB_PHRASES = ['portail lexical', 'cnrtl', 'accueil', 'sommaire', 'menu']

/**
 * Decide whether a fetch may be recorded as a supporting source.
 * @param fetch - The response, its extracted body, and the extraction flags.
 * @returns The verdict, including what the card may claim.
 */
export function judgeSource(fetch: SourceFetch): SourceVerdict {
  if (fetch.httpStatus !== null && (fetch.httpStatus < 200 || fetch.httpStatus >= 400)) {
    return {
      ok: false,
      outcome: 'http-error',
      reason: `http-${String(fetch.httpStatus)}`,
      claim: '未取得该来源，按训练数据回退',
    }
  }
  if (fetch.parseFailed === true) {
    return { ok: false, outcome: 'parse-failed', reason: 'parse-failed', claim: '该来源解析失败，按训练数据回退' }
  }
  if (fetch.entryFound === false) {
    return { ok: false, outcome: 'not-found', reason: 'entry-not-found', claim: '该来源没有对应词条，按训练数据回退' }
  }
  if (isStubBody(fetch.body)) {
    // The measured CNRTL case: 200, page chrome only, no usable body.
    return { ok: false, outcome: 'body-missing', reason: 'body-missing', claim: '该来源未返回可用正文，按训练数据回退' }
  }
  if (fetch.truncated === true) {
    return { ok: false, outcome: 'truncated', reason: 'truncated', claim: '该来源内容被截断，不作为完整依据' }
  }
  return { ok: true, outcome: 'ok', reason: 'ok', claim: `${fetch.kind} 实时数据（仅支持本字段）` }
}

/**
 * Whether an extracted body carries content beyond site chrome.
 * @param body - Extracted text.
 * @returns True when there is nothing usable to quote.
 */
export function isStubBody(body: string): boolean {
  const text = body.replace(/\s+/gu, ' ').trim().toLowerCase()
  if (text.length <= 40) return true
  const stripped = STUB_PHRASES.reduce((current, phrase) => current.replaceAll(phrase, ''), text)
  return stripped.replace(/[^a-zà-ÿ0-9]/gu, '').length <= 20
}

/**
 * Turn a fetch into the source record stored on an entry.
 *
 * The record keeps only what the response actually supports: the verdict's
 * `ok` flag, its reason, and the section it was fetched for. A failed fetch is
 * still recorded, so the card shows the attempt instead of hiding it.
 * @param fetch - The response.
 * @returns The stored source record.
 */
export function toSourceRecord(fetch: SourceFetch): {
  kind: string
  section: string
  url: string | null
  fetchedAt: string | null
  ok: boolean
  note: string
} {
  const verdict = judgeSource(fetch)
  return {
    kind: fetch.kind,
    section: fetch.section,
    url: fetch.url,
    fetchedAt: fetch.fetchedAt ?? null,
    ok: verdict.ok,
    note: verdict.ok ? verdict.claim : `${verdict.claim}（${verdict.reason}）`,
  }
}
