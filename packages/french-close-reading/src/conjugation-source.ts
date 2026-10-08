/**
 * The conjugation pronunciation source: French Wiktionary, read politely.
 *
 * Measured on 2026-10-07 from this machine (see the M4 section of
 * `VERIFICATION.md`):
 *
 * - `larousse.fr/conjugaison/…` carries **no IPA at all** — a spelling table cannot
 *   support a phonetic-base card;
 * - a Wiktionary **lemma** page gives the lemma's pronunciation only, and its
 *   conjugation table is spelled, not pronounced;
 * - a Wiktionary **form** page (`fr.wiktionary.org/wiki/venons`) gives exactly what
 *   the derivation needs, in 1.4 KB of wikitext: `{{pron|və.nɔ̃|fr}}` and
 *   `{{fr-verbe-flexion|grp=3|venir|ind.p.1p=oui|imp.p.1p=oui}}`, i.e. the
 *   pronunciation **and** the inflection slots the form belongs to;
 * - the API is **rate limited**: a burst of ten requests answered
 *   `429 You are making too many requests to the API`. So requests here are spaced,
 *   a 429 is a first-class outcome rather than an exception, and nothing retries in
 *   a loop.
 *
 * The URL space is closed, in the same spirit as `source-fetch.ts`: one endpoint,
 * two request shapes, no free-form URL. Nothing here calls a model.
 */
import { decodeInflection, type InflectionSlot, type Person, type SourceFormRow } from './conjugation-data.ts'

/** The one endpoint this module may request. */
export const WIKTIONARY_API = 'https://fr.wiktionary.org/w/api.php'

/** How long to wait between two requests to the same API. */
export const REQUEST_SPACING_MS = 1_200

/** A page's wikitext, or why it could not be read. */
export type SourceResponse =
  | { status: 'ok'; httpStatus: number; wikitext: string }
  | { status: 'rate-limited'; httpStatus: number; message: string }
  | { status: 'http-error'; httpStatus: number; message: string }
  | { status: 'truncated'; httpStatus: number; message: string }
  | { status: 'unreadable'; httpStatus: number; message: string }

/** The shape of `ctx.web.fetch` this module needs, so tests need no network. */
export type PageFetcher = (url: string, signal: AbortSignal) => Promise<{
  statusCode: number
  body: { kind: string; content: string }
  truncated: boolean
}>

/** The URL for one form's wikitext. */
export function formPageUrl(form: string): string {
  return `${WIKTIONARY_API}?format=json&formatversion=2&action=parse&prop=wikitext&page=${encodeURIComponent(form)}`
}

/** The URL for a lemma's section list, used to find its conjugation table. */
export function sectionsUrl(lemma: string): string {
  return `${WIKTIONARY_API}?format=json&formatversion=2&action=parse&prop=sections&page=${encodeURIComponent(lemma)}`
}

/**
 * Request one page's wikitext.
 *
 * Every failure mode is returned rather than thrown, because each one means
 * something different to the reader: a rate limit is "try later", a missing page is
 * "this form has no entry", and a truncated body is "the answer arrived incomplete"
 * — none of them may look like an empty paradigm.
 */
export async function requestWikitext(
  fetchPage: PageFetcher,
  page: string,
  signal: AbortSignal,
): Promise<SourceResponse> {
  let response
  try {
    response = await fetchPage(formPageUrl(page), signal)
  } catch (error) {
    return { status: 'unreadable', httpStatus: 0, message: `transport failed: ${String(error)}`.slice(0, 200) }
  }
  if (response.statusCode === 429) {
    return { status: 'rate-limited', httpStatus: 429, message: '来源限流，请稍后再试（Requests are rate limited）' }
  }
  if (response.statusCode !== 200) {
    return { status: 'http-error', httpStatus: response.statusCode, message: `HTTP ${String(response.statusCode)}` }
  }
  if (response.truncated) {
    return { status: 'truncated', httpStatus: 200, message: '来源响应被截断，未采用' }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(response.body.content)
  } catch (error) {
    return { status: 'unreadable', httpStatus: 200, message: `response was not JSON: ${String(error)}`.slice(0, 200) }
  }
  const record = parsed as { parse?: { wikitext?: unknown }, error?: { info?: unknown } }
  const wikitext = record.parse?.wikitext
  if (typeof wikitext !== 'string' || wikitext === '') {
    const info = typeof record.error?.info === 'string' ? record.error.info : 'page has no wikitext'
    return { status: 'http-error', httpStatus: 200, message: info.slice(0, 200) }
  }
  return { status: 'ok', httpStatus: 200, wikitext }
}

/**
 * Wiktionary's inflection codes, as the internal slots.
 *
 * Read off real pages: `ind.p.1p` (indicatif présent), `imp.p.1p` (impératif
 * présent), `sub.p.3p` (subjonctif présent). `ind.i` is the imperfect, `ind.f` the
 * future, `ind.ps` the passé simple, `cnd.p` the conditional, `sub.i` the imperfect
 * subjunctive, `par.p`/`par.pr` the participles and `inf` the infinitive.
 */
const SLOT_CODES: Record<string, { mood: string; tense: string }> = {
  'ind.p': { mood: 'ind', tense: 'pre' },
  'ind.i': { mood: 'ind', tense: 'imp' },
  'ind.f': { mood: 'ind', tense: 'fut' },
  'ind.ps': { mood: 'ind', tense: 'pas' },
  'cnd.p': { mood: 'cnd', tense: 'pre' },
  'sub.p': { mood: 'sub', tense: 'pre' },
  'sub.i': { mood: 'sub', tense: 'imp' },
  'imp.p': { mood: 'imp', tense: 'pre' },
  'par.p': { mood: 'par', tense: 'pas' },
  'par.pr': { mood: 'par', tense: 'pre' },
  'inf': { mood: 'inf', tense: '' },
}

/** One `ind.p.1p` code as an internal slot, or null when it is not one we read. */
export function decodeWiktionarySlot(code: string): InflectionSlot | null {
  const trimmed = code.trim()
  const match = /^([a-z]+(?:\.[a-z]+)?)(?:\.([0-9][sp]))?$/u.exec(trimmed)
  if (match === null) return null
  const base = SLOT_CODES[match[1] ?? '']
  if (base === undefined) return null
  const person = match[2] === undefined ? null : (match[2] as Person)
  // A tense that has persons must have one here; a participle or infinitive must not.
  const wantsPerson = base.mood !== 'par' && base.mood !== 'inf'
  if (wantsPerson && person === null) return null
  if (!wantsPerson) return { mood: base.mood, tense: base.tense, person: null }
  return decodeInflection(`${base.mood}:${base.tense}:${person}`)
}

/** One form page, parsed: the spelling, its pronunciations, its lemma and slots. */
export interface ParsedFormPage {
  written: string | null
  /** Every pronunciation the page gives, in order; the first is the canonical one. */
  ipa: string[]
  lemma: string | null
  slots: InflectionSlot[]
}

/**
 * Read one form page's wikitext.
 *
 * Bounded on purpose: a form page is a header and a definition line, so the parse is
 * three patterns rather than a wikitext engine. Anything it cannot read is `null`,
 * which the caller reports instead of guessing.
 */
export function parseFormPage(wikitext: string): ParsedFormPage | null {
  const flex = /\{\{fr-verbe-flexion\s*\|([^}]*)\}\}/u.exec(wikitext)
  if (flex === null) return null
  const fields = (flex[1] ?? '').split('|').map((field) => field.trim()).filter((field) => field !== '')
  let lemma: string | null = null
  const slots: InflectionSlot[] = []
  for (const field of fields) {
    const assignment = /^([a-z.]+[0-9sp]*)\s*=\s*oui$/u.exec(field)
    if (assignment !== null) {
      const slot = decodeWiktionarySlot(assignment[1] ?? '')
      if (slot !== null) slots.push(slot)
      continue
    }
    if (/^(?:grp|num|désuet|rare|fr)=/u.test(field)) continue
    if (lemma === null && /^[\p{L}\p{M}'’-]+$/u.test(field)) lemma = field
  }
  if (slots.length === 0) return null

  const written = /'''([^']+)'''/u.exec(wikitext)?.[1] ?? null
  const ipa: string[] = []
  for (const match of wikitext.matchAll(/\{\{pron\s*\|([^}]*)\}\}/gu)) {
    const values = (match[1] ?? '').split('|').map((value) => value.trim()).filter((value) => value !== '')
    // The trailing field of a `pron` template is the language code
    // (`{{pron|və.niʁ|vniʁ|fr}}`), so it is dropped by position rather than by shape:
    // a one-letter pronunciation such as `{{pron|a|fr}}` must survive.
    if (values.length > 1 && /^[a-z]{2,3}$/u.test(values[values.length - 1] ?? '')) values.pop()
    for (const value of values) {
      if (!ipa.includes(value)) ipa.push(value)
    }
  }
  return { written, ipa, lemma, slots }
}

/**
 * One form page as a derivation row.
 *
 * The **first** pronunciation is the form's own; the rest are variants the page also
 * lists (Wiktionary gives `{{pron|və.niʁ|vniʁ|fr}}` for `venir`). Variants are
 * reported by {@link variantPronunciations} rather than silently dropped, and a page
 * with no pronunciation yields no row — a form with unknown pronunciation must not
 * enter a base as if it were known.
 */
export function formPageToRow(wikitext: string): SourceFormRow | null {
  const parsed = parseFormPage(wikitext)
  if (parsed === null || parsed.written === null || parsed.ipa.length === 0) return null
  return { written: parsed.written, ipa: parsed.ipa[0]!, slots: parsed.slots }
}

/** The pronunciations a page listed beyond the first, for an honest note. */
export function variantPronunciations(wikitext: string): string[] {
  const parsed = parseFormPage(wikitext)
  return parsed === null ? [] : parsed.ipa.slice(1)
}
