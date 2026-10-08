/**
 * Assembling one verb's paradigm from the source, in two requests.
 *
 * Measured on 2026-10-07 from this machine (M4 section of `VERIFICATION.md`):
 *
 * - `Generation=links` on the lemma page is a bad discovery route: one request
 *   returned **230 pages** and only **one** of them was a form of the verb;
 * - the form list lives on the conjugation page, `Conjugaison:français/venir`:
 *   52 KB of rendered table containing **44 form links** (`venais`, `viendrai`,
 *   `vins`, `vinsse`, `vîntes` …) — one request;
 * - the API accepts up to fifty titles per query, so every form page's wikitext
 *   comes back in **one** more request, each page declaring its own pronunciation and
 *   inflection slots.
 *
 * So a paradigm costs two requests, and the request budget here is about the
 * *politeness* of the walk (spacing, a hard cap, a 429 that stops rather than
 * retries) — not about crawling. What comes back is derived, not asserted: this
 * module never invents a form to fill a gap, and a walk that was cut short reports
 * `partial` with the forms it did not reach.
 */
import {
  deriveConjugationDataset,
  type ConjugationDataset,
  type InflectionSlot,
  type SourceFormRow,
} from './conjugation-data.ts'
import {
  parseFormPage,
  type PageFetcher,
  type SourceResponse,
} from './conjugation-source.ts'

/** The conjugation-namespace page that holds one verb's table. */
export function conjugationPageUrl(lemma: string): string {
  return `https://fr.wiktionary.org/w/api.php?format=json&formatversion=2&action=parse&prop=text&page=${encodeURIComponent(`Conjugaison:français/${lemma}`)}`
}

/** The URL that returns many pages' wikitext at once. */
export function formTitlesUrl(titles: readonly string[]): string {
  const list = titles.map((title) => encodeURIComponent(title)).join('%7C')
  return `https://fr.wiktionary.org/w/api.php?format=json&formatversion=2&action=query&prop=revisions&rvprop=content&rvslots=main&titles=${list}`
}

/** How many titles one query may carry (the API's own limit for readers). */
export const MAX_TITLES_PER_REQUEST = 50

/** Form names that are table furniture rather than conjugations. */
const NOT_A_FORM = new Set([
  'gérondif', 'infinitif', 'mode', 'participe', 'passé', 'présent', 'être', 'avoir',
  'indicatif', 'subjonctif', 'conditionnel', 'impératif', 'simple', 'composé',
  'conjugaison', 'français', 'voix', 'active', 'passive', 'temps', 'personne',
])

/**
 * The candidate form names on a rendered conjugation page.
 *
 * Read from the table's own links rather than from the template call: the page's
 * wikitext is one `{{fr-conj-3-enir|…}}` invocation whose forms are generated, so
 * only the rendered table lists them.
 */
export function extractFormNames(html: string, lemma: string): string[] {
  const names = new Set<string>()
  for (const match of html.matchAll(/href="\/wiki\/([^"#?]+)"/gu)) {
    const raw = match[1] ?? ''
    let decoded = raw
    try {
      decoded = decodeURIComponent(raw)
    } catch {
      continue
    }
    // Only single-word page names: a namespace, a phrase or an annex is not a form.
    if (!/^[a-zà-öø-ÿ'’-]+$/u.test(decoded)) continue
    if (decoded.length < 2 || decoded.length > 40) continue
    if (NOT_A_FORM.has(decoded)) continue
    if (decoded === lemma) continue
    names.add(decoded)
  }
  return [...names].sort()
}

/** What one walk produced, and how far it got. */
export interface FetchOutcome {
  status: 'ok' | 'partial' | 'rate-limited' | 'failed' | 'no-forms'
  dataset: ConjugationDataset | null
  /** Candidate forms the walk did not turn into rows, so a card can name the gaps. */
  missingForms: string[]
  requests: number
  failure: string | null
  notes: string[]
}

export interface FetchInput {
  lemma: string
  fetchPage: PageFetcher
  signal: AbortSignal
  /** Courtesy delay between requests; injected so tests run instantly. */
  sleep?: (milliseconds: number) => Promise<void>
  spacingMs?: number
  /** Hard ceiling on requests for one walk. */
  maxRequests?: number
  /** The instant to record as the fetch time; injected for deterministic tests. */
  now?: () => string
}

const DEFAULT_SPACING_MS = 1_200
const DEFAULT_MAX_REQUESTS = 6

/**
 * Fetch and derive one verb's paradigm.
 *
 * Every ending is a recorded outcome: `ok` (the walk completed), `partial` (a
 * request budget or a transport failure cut it short), `rate-limited` (the source
 * said so — nothing is retried), `no-forms` (the table listed no form we could read),
 * `failed` (the first request did not answer). None of them is an empty paradigm.
 */
export async function fetchConjugationDataset(input: FetchInput): Promise<FetchOutcome> {
  const sleep = input.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => { setTimeout(resolve, milliseconds) }))
  const spacing = input.spacingMs ?? DEFAULT_SPACING_MS
  const maxRequests = input.maxRequests ?? DEFAULT_MAX_REQUESTS
  const now = input.now ?? (() => new Date().toISOString())
  const notes: string[] = []
  let requests = 0

  const first = await request(input.fetchPage, conjugationPageUrl(input.lemma), input.signal)
  requests += 1
  if (first.status !== 'ok') {
    return {
      status: first.status === 'rate-limited' ? 'rate-limited' : 'failed',
      dataset: null,
      missingForms: [],
      requests,
      failure: first.message,
      notes: [`未取得变位表：${first.message}`],
    }
  }

  let payload: unknown
  try {
    payload = JSON.parse(first.wikitext)
  } catch (error) {
    return {
      status: 'failed', dataset: null, missingForms: [], requests,
      failure: `变位表不是 JSON：${String(error)}`.slice(0, 200), notes: notes,
    }
  }
  const html = (payload as { parse?: { text?: unknown } }).parse?.text
  if (typeof html !== 'string' || html === '') {
    return {
      status: 'no-forms', dataset: null, missingForms: [], requests,
      failure: '变位表页面没有内容',
      notes: [`Conjugaison:français/${input.lemma} 没有可读的表格`],
    }
  }

  const candidates = extractFormNames(html, input.lemma)
  if (candidates.length === 0) {
    return {
      status: 'no-forms', dataset: null, missingForms: [], requests,
      failure: '变位表中没有可识别的形式',
      notes: ['表格中未找到形式链接：该动词可能尚未收录变位表'],
    }
  }

  const rows: SourceFormRow[] = []
  // Two different gaps, kept apart: a form the source simply has no page for is a
  // hole in the paradigm, while a page that exists but cannot be read is a failure —
  // and only the second one should make a walk look unreliable.
  const missingPages: string[] = []
  const unreadable: string[] = []
  let limited = false
  let exhausted = false

  for (let at = 0; at < candidates.length; at += MAX_TITLES_PER_REQUEST) {
    if (requests >= maxRequests) {
      exhausted = true
      notes.push(`已达请求上限 ${String(maxRequests)}，其余形式未取：${candidates.slice(at).join('、')}`)
      break
    }
    const batch = candidates.slice(at, at + MAX_TITLES_PER_REQUEST)
    const response = await request(input.fetchPage, formTitlesUrl(batch), input.signal)
    requests += 1
    if (response.status === 'rate-limited') {
      limited = true
      notes.push(`来源限流，剩余 ${String(candidates.length - at)} 个形式未取`)
      break
    }
    if (response.status !== 'ok') {
      unreadable.push(...batch)
      notes.push(`一批形式未能读取（${response.message}），共 ${String(batch.length)} 个`)
      continue
    }
    let pages: unknown
    try {
      pages = (JSON.parse(response.wikitext) as { query?: { pages?: unknown } }).query?.pages
    } catch (error) {
      unreadable.push(...batch)
      notes.push(`一批形式的响应不是 JSON：${String(error)}`.slice(0, 200))
      continue
    }
    if (!Array.isArray(pages)) {
      unreadable.push(...batch)
      notes.push('一批形式的响应没有 pages 字段')
      continue
    }
    const seen = new Set<string>()
    for (const page of pages) {
      const record = page as { title?: unknown, missing?: unknown, revisions?: { slots?: { main?: { content?: unknown } } }[] }
      const title = typeof record.title === 'string' ? record.title : ''
      const content = record.revisions?.[0]?.slots?.main?.content
      if (typeof content !== 'string') {
        if (title !== '') (record.missing === true ? missingPages : unreadable).push(title)
        continue
      }
      const row = rowFromPage(content, input.lemma, record.missing === true)
      if (row === null) {
        // A candidate that carries no form of this verb is table furniture or a
        // homograph: it is simply not part of this paradigm, and not a gap either.
        continue
      }
      seen.add(title)
      rows.push(row)
    }
    if (at + MAX_TITLES_PER_REQUEST < candidates.length) await sleep(spacing)
  }

  const turned = new Set(rows.map((row) => row.written))
  // Everything the table listed that did not become a form is a gap the card names.
  const missingForms = candidates.filter((name) => !turned.has(name))
  if (rows.length === 0) {
    const status: FetchOutcome['status'] = limited ? 'rate-limited' : exhausted ? 'partial' : 'no-forms'
    return {
      status,
      dataset: null,
      missingForms: candidates,
      requests,
      failure: limited
        ? '来源限流'
        : exhausted ? `已达请求上限 ${String(maxRequests)}，未取得任何形式` : '没有任何形式页可读',
      notes,
    }
  }
  if (missingPages.length > 0) {
    notes.push(
      `来源中尚无这些形式的页面（${String(missingPages.length)} 个）：${missingPages.slice(0, 12).join('、')}${missingPages.length > 12 ? ' 等' : ''}`,
    )
  }
  if (unreadable.length > 0) {
    notes.push(`这些形式页面无法读取：${unreadable.slice(0, 12).join('、')}${unreadable.length > 12 ? ' 等' : ''}`)
  }

  const dataset = deriveConjugationDataset(input.lemma, rows, {
    kind: 'fr-wiktionary',
    version: 'api',
    fetchedAt: now(),
  })
  // A form page whose slots we could not read is a gap in the paradigm, not a
  // failure of the walk: it is named so the card can say what is missing.
  const personless = rows.filter((row) => row.slots.every((slot) => slot.person === null)).map((row) => row.written)
  if (personless.length > 0) notes.push(`这些页面没有可读的语法人称：${personless.join('、')}`)

  // Incomplete is incomplete: a paradigm missing cells says `partial` and names them,
  // whether the gap came from the budget, from an unreadable page or from a form the
  // source has not created yet.
  const status: FetchOutcome['status'] = limited
    ? 'rate-limited'
    : (exhausted || unreadable.length > 0 || missingForms.length > 0 ? 'partial' : 'ok')
  return {
    status,
    dataset,
    missingForms,
    requests,
    failure: limited ? '来源限流' : null,
    notes,
  }
}

/** One fetched page as a derivation row, or null when it is not a form of this verb. */
function rowFromPage(content: string, lemma: string, missing: boolean): SourceFormRow | null {
  if (missing) return null
  const parsed = parseFormPage(content)
  if (parsed === null || parsed.written === null || parsed.ipa.length === 0) return null
  // The page states its own lemma; a page that belongs to another verb is not a form
  // of this one, however the table linked to it.
  if (parsed.lemma !== null && parsed.lemma.toLowerCase() !== lemma.toLowerCase()) return null
  return { written: parsed.written, ipa: parsed.ipa[0]!, slots: parsed.slots }
}

/** Request one URL and report the outcome in the source module's own vocabulary. */
async function request(fetchPage: PageFetcher, url: string, signal: AbortSignal): Promise<SourceResponse> {
  let response
  try {
    response = await fetchPage(url, signal)
  } catch (error) {
    return { status: 'unreadable', httpStatus: 0, message: `transport failed: ${String(error)}`.slice(0, 200) }
  }
  if (response.statusCode === 429) {
    return { status: 'rate-limited', httpStatus: 429, message: '来源限流，请稍后再试' }
  }
  if (response.statusCode !== 200) {
    return { status: 'http-error', httpStatus: response.statusCode, message: `HTTP ${String(response.statusCode)}` }
  }
  if (response.truncated) {
    return { status: 'truncated', httpStatus: 200, message: '来源响应被截断，未采用' }
  }
  return { status: 'ok', httpStatus: 200, wikitext: response.body.content }
}

/** The slots a dataset would need to answer for one tense, for a caller's budget. */
export function wantedSlots(slots: readonly InflectionSlot[]): string[] {
  return slots.map((slot) => `${slot.mood}:${slot.tense}:${slot.person ?? '-'}`)
}
