import { z } from 'zod'

/**
 * Phonetic bases, derived from a pronunciation source rather than asserted.
 *
 * The reading model the reader asked for is *conjugaison par bases phonétiques*:
 * what matters is how many distinct stems a tense is pronounced with, and which
 * persons share each one — not the traditional group labels. That claim can only be
 * made from per-form pronunciation data, which is why this module exists.
 *
 * Sources, measured on 2026-10-07 from this machine (see the M4 section of
 * `VERIFICATION.md`):
 *
 * - **Larousse conjugation pages carry no IPA at all** — spelling tables only, so
 *   they cannot support a phonetic-base card;
 * - **fr.wiktionary gives the lemma's pronunciation** (`\və.niʁ\`) but its
 *   conjugation tables have no per-form IPA;
 * - **Lexique 3.83** (`lexique.org`, CC BY-SA) lists every inflected form with its
 *   pronunciation (`ortho`, `phon`) and its inflection tags (`infover`, e.g.
 *   `ind:pre:2p`), which is exactly the input this derivation needs.
 *
 * Two rules shape the derivation:
 *
 * 1. **A base is a stem, not a guess.** A form's stem is its pronunciation with the
 *    tense's own ending removed; persons whose stems are identical share a base.
 *    The ending table below is read off a regular `-er` verb rather than invented,
 *    and a form whose pronunciation does not end the way its tense requires is
 *    reported as underivable instead of being forced into a base.
 * 2. **Ambiguity is reported, never resolved silently.** A pronunciation source has
 *    homographs (Lexique lists `étaient` under both imparfait and présent 3p); two
 *    different pronunciations for one tense-and-person cell are left unassigned and
 *    named in `notes`.
 */

/** The six persons of a French verb paradigm, in display order. */
export const PERSONS = ['1s', '2s', '3s', '1p', '2p', '3p'] as const

export type Person = (typeof PERSONS)[number]

/** The person labels the reader sees. */
export const PERSON_LABELS: Record<Person, string> = {
  '1s': 'je',
  '2s': 'tu',
  '3s': 'il / elle',
  '1p': 'nous',
  '2p': 'vous',
  '3p': 'ils / elles',
}

/**
 * Lexique's phonology alphabet, as IPA.
 *
 * Every entry below was verified against a word whose pronunciation is not in
 * question (`chanter` → `S@te`, `chien` → `Sj5`, `montagne` → `m§taN`, `jeudi` →
 * `Z2di`, `fleur` → `fl9R`, `huit` → `8it`, `brun` → `bR1`, `temps` → `t@`), and
 * the list is the complete set of characters the corpus actually uses. A symbol
 * outside it makes the form unmapped rather than silently dropped.
 */
export const LEXIQUE_TO_IPA: Record<string, string> = {
  a: 'a', e: 'e', i: 'i', o: 'o', u: 'u', y: 'y',
  E: 'ɛ', O: 'ɔ', '°': 'ə', '2': 'ø', '9': 'œ',
  '@': 'ɑ̃', '5': 'ɛ̃', '§': 'ɔ̃', '1': 'œ̃',
  R: 'ʁ', S: 'ʃ', Z: 'ʒ', N: 'ɲ', G: 'ŋ', '8': 'ɥ',
  j: 'j', w: 'w', x: 'x',
  b: 'b', d: 'd', f: 'f', g: 'ɡ', k: 'k', l: 'l', m: 'm',
  n: 'n', p: 'p', s: 's', t: 't', v: 'v', z: 'z',
}

/** The Lexique characters this module has no IPA for, so a caller can say why. */
export function unmappedSymbols(phon: string): string[] {
  return [...new Set([...phon].filter((character) => LEXIQUE_TO_IPA[character] === undefined))]
}

/**
 * One form's pronunciation in IPA, or null when the source used a symbol this
 * module does not know.
 */
export function toIpa(phon: string): string | null {
  let ipa = ''
  for (const character of phon) {
    const mapped = LEXIQUE_TO_IPA[character]
    if (mapped === undefined) return null
    ipa += mapped
  }
  return ipa
}

/** One inflection tag decoded: `ind:pre:2p` is indicative present, 2nd plural. */
export interface InflectionSlot {
  /** `ind`, `sub`, `cnd`, `imp`, `inf`, `par` … as the source writes it. */
  mood: string
  /** `pre`, `imp`, `fut`, `pas` … as the source writes it. */
  tense: string
  person: Person | null
}

/** Decode one `infover` tag; null when it is not a tag this module reads. */
export function decodeInflection(tag: string): InflectionSlot | null {
  const parts = tag.trim().split(':')
  if (parts.length < 2) return null
  const [mood, tense, person] = parts
  if (mood === undefined || tense === undefined || mood === '' || tense === '') return null
  const slot = person === undefined ? null : (PERSONS as readonly string[]).includes(person) ? (person as Person) : null
  if (person !== undefined && person !== '' && slot === null) return null
  return { mood, tense, person: slot }
}

/** The key a form is filed under: `ind:pre:1s`. */
export const slotKey = (slot: { mood: string; tense: string; person: Person }): string =>
  `${slot.mood}:${slot.tense}:${slot.person}`

/**
 * The pronounced ending of each person, per tense.
 *
 * Read off a regular `-er` verb's own data (`parler`), where every form shares one
 * stem, so whatever differs between them *is* the ending: présent 1p `parl§` → `§`,
 * 2p `parle` → `e`; imparfait 1s `paRlE` → `E`, 1p `paRlj§` → `j§`; futur 2s
 * `paRl°Ra` → `a`; passé simple 1p `paRlam` → `am`, 3p `paRlER` → `ER`.
 *
 * A person absent from a tense's table has no pronounced ending there (the form's
 * whole pronunciation is its stem), which is the case for présent 1s/2s/3s/3p and
 * subjonctif présent outside 1p/2p.
 */
export const PRONOUNCED_ENDINGS: Record<string, Partial<Record<Person, string>>> = {
  'ind:pre': { '1p': 'ɔ̃', '2p': 'e' },
  'ind:imp': { '1s': 'ɛ', '2s': 'ɛ', '3s': 'ɛ', '1p': 'jɔ̃', '2p': 'je', '3p': 'ɛ' },
  'ind:fut': { '1s': 'e', '2s': 'a', '3s': 'a', '1p': 'ɔ̃', '2p': 'e', '3p': 'ɔ̃' },
  'ind:pas': { '1s': 'e', '2s': 'a', '3s': 'a', '1p': 'am', '3p': 'ɛʁ' },
  'cnd:pre': { '1s': 'ɛ', '2s': 'ɛ', '3s': 'ɛ', '1p': 'jɔ̃', '2p': 'je', '3p': 'ɛ' },
  'sub:pre': { '1p': 'jɔ̃', '2p': 'je' },
  'sub:imp': { '2s': 'as', '3s': 'a', '3p': 'as' },
  'imp:pre': { '1p': 'ɔ̃', '2p': 'e' },
}

/** The tenses a phonetic-base card is built for, in the order it reads them. */
export const SUPPORTED_TENSES = [
  { mood: 'ind', tense: 'pre', label: '现在时' },
  { mood: 'ind', tense: 'imp', label: '未完成过去时' },
  { mood: 'ind', tense: 'fut', label: '简单将来时' },
  { mood: 'ind', tense: 'pas', label: '简单过去时' },
  { mood: 'cnd', tense: 'pre', label: '条件式现在时' },
  { mood: 'sub', tense: 'pre', label: '虚拟式现在时' },
  { mood: 'imp', tense: 'pre', label: '命令式现在时' },
] as const

/**
 * One row of a source: a form, its **IPA** pronunciation, and where it belongs.
 *
 * Sources differ in how they write pronunciation — Lexique uses its own alphabet,
 * Wiktionary writes IPA directly — so decoding belongs to the source adapter (see
 * `conjugation-source.ts` and {@link lexiqueRowToSourceRow}) and the derivation
 * below reads one representation only. That is what makes the two sources
 * comparable rather than two implementations of the same idea.
 */
export interface SourceFormRow {
  written: string
  /** The pronunciation in IPA, syllable dots included when the source has them. */
  ipa: string
  /** Every inflection slot the source attaches to this row. */
  slots: readonly InflectionSlot[]
}

/** One person's form inside a tense. */
export interface ConjugationForm {
  person: Person
  written: string
  /** The whole form's pronunciation. */
  ipa: string
  /** Which base it belongs to, or null when it could not be derived. */
  baseIndex: number | null
}

/** One pronounced stem, and the persons that share it. */
export interface PhoneticBase {
  ipa: string
  persons: Person[]
  /** The shared spelling, when every person of the base spells the stem the same way. */
  writtenStem: string | null
}

export interface ConjugationTense {
  mood: string
  tense: string
  label: string
  bases: PhoneticBase[]
  forms: ConjugationForm[]
  /** Honest gaps: cells the source contradicts, forms it never lists, unmapped symbols. */
  notes: string[]
}

export interface ConjugationDataset {
  lemma: string
  source: { kind: string; version: string; fetchedAt: string }
  tenses: ConjugationTense[]
}

/**
 * A written ending per person, read the same way as {@link PRONOUNCED_ENDINGS}.
 *
 * Deliberately incomplete: présent 1s is spelled `-e`, `-s` or `-x` depending on the
 * verb, and 3s is `-t` or `-e`, so declaring one would invent a stem spelling for
 * half the verbs. A person missing here has an **unknown** written ending, which
 * means the base's spelling is not claimed at all — the pronunciation is the base,
 * and each form's own spelling is listed beside it.
 */
const WRITTEN_ENDINGS: Record<string, Partial<Record<Person, string>>> = {
  'ind:pre': { '2s': 's', '1p': 'ons', '2p': 'ez', '3p': 'ent' },
  'ind:imp': { '1s': 'ais', '2s': 'ais', '3s': 'ait', '1p': 'ions', '2p': 'iez', '3p': 'aient' },
  'ind:fut': { '1s': 'ai', '2s': 'as', '3s': 'a', '1p': 'ons', '2p': 'ez', '3p': 'ont' },
  'cnd:pre': { '1s': 'ais', '2s': 'ais', '3s': 'ait', '1p': 'ions', '2p': 'iez', '3p': 'aient' },
  'sub:pre': { '1p': 'ions', '2p': 'iez', '3p': 'ent' },
  'imp:pre': { '1p': 'ons', '2p': 'ez' },
}

/** Strip one ending from the end of a string, or null when it is not there. */
function stripEnding(value: string, ending: string): string | null {
  if (ending === '') return value
  return value.endsWith(ending) ? value.slice(0, value.length - ending.length) : null
}

/**
 * Derive the phonetic bases of one lemma from its source rows.
 *
 * @param lemma - The lemma the rows belong to.
 * @param rows - Its forms, as the source lists them.
 * @param source - Provenance, stored with the result.
 * @returns One entry per supported tense, with its bases, forms, and gaps.
 */
export function deriveConjugationDataset(
  lemma: string,
  rows: readonly SourceFormRow[],
  source: { kind: string; version: string; fetchedAt: string },
): ConjugationDataset {
  // Cells first: one (tense, person) may be claimed by several rows, and a cell with
  // two different pronunciations is a source ambiguity rather than a choice to make.
  const cells = new Map<string, { written: string; ipa: string }[]>()
  for (const row of rows) {
    for (const slot of row.slots) {
      if (slot.person === null) continue
      const key = slotKey({ mood: slot.mood, tense: slot.tense, person: slot.person })
      const list = cells.get(key) ?? []
      if (!list.some((entry) => entry.ipa === row.ipa && entry.written === row.written)) {
        list.push({ written: row.written, ipa: row.ipa })
      }
      cells.set(key, list)
    }
  }

  const tenses: ConjugationTense[] = []
  for (const spec of SUPPORTED_TENSES) {
    const key = `${spec.mood}:${spec.tense}`
    const endings = PRONOUNCED_ENDINGS[key] ?? {}
    const writtenEndings = WRITTEN_ENDINGS[key] ?? {}
    const notes: string[] = []
    const forms: ConjugationForm[] = []
    const stems = new Map<string, { ipa: string; writtenStem: string | null; persons: Person[] }>()

    for (const person of PERSONS) {
      const cellKey = `${spec.mood}:${spec.tense}:${person}`
      const cell = cells.get(cellKey)
      if (cell === undefined || cell.length === 0) continue
      if (cell.length > 1) {
        notes.push(
          `${PERSON_LABELS[person]}：来源给出多个读音（${cell.map((entry) => `/${entry.ipa}/`).join('、')}），未指定基底`,
        )
        continue
      }
      const entry = cell[0]!
      const ipa = entry.ipa
      const ending = endings[person] ?? ''
      const stem = stripEnding(entry.ipa, ending)
      if (stem === null) {
        notes.push(`${PERSON_LABELS[person]}：/${ipa}/ 未以该时态的词尾结尾，未推导基底`)
        forms.push({ person, written: entry.written, ipa, baseIndex: null })
        continue
      }
      const declaredWrittenEnding = writtenEndings[person]
      const writtenStem = declaredWrittenEnding === undefined
        ? null
        : stripEnding(entry.written, declaredWrittenEnding)
      // A base is a *phonological* stem, and syllable dots are notation rather than
      // sound: Wiktionary writes `paʁ.lɔ̃` beside `paʁl` and `fi.ni.sɔ̃` beside
      // `fi.nis`, so grouping on the dotted string split one stem into two bases.
      // The comparison ignores the dots and the displayed base is dot-free.
      const key = stem.replace(/\./gu, '')
      const existing = stems.get(key)
      if (existing === undefined) {
        stems.set(key, {
          ipa: key,
          writtenStem,
          persons: [person],
        })
      } else {
        existing.persons.push(person)
        // A shared pronunciation with two different spellings has no single stem
        // spelling, and saying otherwise would be a claim the source does not make.
        if (existing.writtenStem !== writtenStem) existing.writtenStem = null
      }
      forms.push({ person, written: entry.written, ipa, baseIndex: -1 })
    }

    // Bases in reading order: first person first, so the card lists them the way the
    // paradigm is recited rather than by discovery order.
    const ordered = [...stems.values()].sort(
      (left, right) => PERSONS.indexOf(left.persons[0]!) - PERSONS.indexOf(right.persons[0]!),
    )
    for (const form of forms) {
      if (form.baseIndex !== -1) continue
      const cell = cells.get(`${spec.mood}:${spec.tense}:${form.person}`)?.[0]
      if (cell === undefined) continue
      const stem = stripEnding(cell.ipa, endings[form.person] ?? '')
      const key = stem === null ? null : stem.replace(/\./gu, '')
      form.baseIndex = key === null ? null : ordered.findIndex((base) => base.ipa === key)
      if (form.baseIndex === -1) form.baseIndex = null
    }

    if (forms.length === 0) continue
    tenses.push({
      mood: spec.mood,
      tense: spec.tense,
      label: spec.label,
      bases: ordered.map((base) => ({
        ipa: base.ipa,
        persons: base.persons,
        writtenStem: base.writtenStem,
      })),
      forms,
      notes,
    })
  }

  return { lemma, source, tenses }
}

/**
 * The stored dataset shape.
 *
 * Declared here beside the types it mirrors so a stored record is validated on load
 * like every other record: an unvalidated dataset would fail later, inside a card,
 * instead of at the domain open where it can be reported.
 */
export const ConjugationDatasetSchema = z.object({
  lemma: z.string().min(1).max(80),
  source: z.object({
    kind: z.string().min(1).max(40),
    version: z.string().min(1).max(40),
    fetchedAt: z.string().datetime(),
  }).strict(),
  tenses: z.array(z.object({
    mood: z.string().min(1).max(8),
    tense: z.string().min(1).max(8),
    label: z.string().min(1).max(40),
    bases: z.array(z.object({
      ipa: z.string().min(1).max(60),
      persons: z.array(z.enum(PERSONS)),
      writtenStem: z.string().max(60).nullable(),
    }).strict()),
    forms: z.array(z.object({
      person: z.enum(PERSONS),
      written: z.string().min(1).max(80),
      ipa: z.string().min(1).max(60),
      baseIndex: z.number().int().min(0).nullable(),
    }).strict()),
    notes: z.array(z.string().max(400)),
  }).strict()),
}).strict()

/**
 * A tense label as the reader writes it, resolved to a dataset slot.
 *
 * The card's labels are Chinese (`现在时`), an author may write the French name
 * (`présent`), and the dataset speaks in codes (`ind:pre`) — this is the one place
 * that maps between them, so a claim and a dataset can be compared at all.
 */
const TENSE_ALIASES: Record<string, { mood: string; tense: string }> = {
  '现在时': { mood: 'ind', tense: 'pre' },
  'présent': { mood: 'ind', tense: 'pre' },
  'present': { mood: 'ind', tense: 'pre' },
  'indicatif présent': { mood: 'ind', tense: 'pre' },
  '未完成过去时': { mood: 'ind', tense: 'imp' },
  'imparfait': { mood: 'ind', tense: 'imp' },
  '简单将来时': { mood: 'ind', tense: 'fut' },
  'futur': { mood: 'ind', tense: 'fut' },
  'futur simple': { mood: 'ind', tense: 'fut' },
  '简单过去时': { mood: 'ind', tense: 'pas' },
  'passé simple': { mood: 'ind', tense: 'pas' },
  '条件式现在时': { mood: 'cnd', tense: 'pre' },
  'conditionnel': { mood: 'cnd', tense: 'pre' },
  'conditionnel présent': { mood: 'cnd', tense: 'pre' },
  '虚拟式现在时': { mood: 'sub', tense: 'pre' },
  'subjonctif': { mood: 'sub', tense: 'pre' },
  'subjonctif présent': { mood: 'sub', tense: 'pre' },
  '命令式现在时': { mood: 'imp', tense: 'pre' },
  'impératif': { mood: 'imp', tense: 'pre' },
  'impératif présent': { mood: 'imp', tense: 'pre' },
}

/** Resolve one tense label to a dataset slot, or null when it is not one we read. */
export function resolveTenseLabel(label: string): { mood: string; tense: string } | null {
  const trimmed = label.trim().toLowerCase().replace(/\s+/gu, ' ')
  const direct = TENSE_ALIASES[trimmed]
  if (direct !== undefined) return direct
  const byLabel = SUPPORTED_TENSES.find((spec) => spec.label.toLowerCase() === trimmed)
  return byLabel === undefined ? null : { mood: byLabel.mood, tense: byLabel.tense }
}

/**
 * Resolve one person label to a person, or null.
 *
 * Authors write `je`, `nous`, `il / elle`, `1s`; the dataset speaks in `1s`…`3p`.
 */
export function resolvePerson(label: string): Person | null {
  const trimmed = label.trim().toLowerCase().replace(/\s+/gu, ' ')
  if ((PERSONS as readonly string[]).includes(trimmed)) return trimmed as Person
  const aliases: Record<string, Person> = {
    'je': '1s', 'j’': '1s', "j'": '1s', '1s': '1s',
    'tu': '2s', '2s': '2s',
    'il': '3s', 'elle': '3s', 'il / elle': '3s', 'il/elle': '3s', 'on': '3s', '3s': '3s',
    'nous': '1p', '1p': '1p',
    'vous': '2p', '2p': '2p',
    'ils': '3p', 'elles': '3p', 'ils / elles': '3p', 'ils/elles': '3p', '3p': '3p',
  }
  return aliases[trimmed] ?? null
}

/** One tense of a dataset by its code, or undefined when the dataset has none. */
export function datasetTense(
  dataset: ConjugationDataset,
  slot: { mood: string; tense: string },
): ConjugationTense | undefined {
  return dataset.tenses.find((entry) => entry.mood === slot.mood && entry.tense === slot.tense)
}

/** The base one person belongs to in a tense, or null when it is not derivable. */
export function datasetBaseOf(tense: ConjugationTense, person: Person): PhoneticBase | null {
  const form = tense.forms.find((entry) => entry.person === person)
  if (form === undefined || form.baseIndex === null) return null
  return tense.bases[form.baseIndex] ?? null
}

/**
 * One Lexique row as a derivation row: the source adapter for the TSV distribution.
 *
 * Returns null when the row uses a phonology symbol the alphabet does not know, so
 * an unknown symbol makes a form absent rather than silently mispronounced.
 */
export function lexiqueRowToSourceRow(row: {
  written: string
  phon: string
  slots: readonly InflectionSlot[]
}): SourceFormRow | null {
  const ipa = toIpa(row.phon)
  return ipa === null ? null : { written: row.written, ipa, slots: row.slots }
}

/**
 * Parse the columns this module reads out of a Lexique TSV line.
 *
 * The distribution is a plain tab-separated file, which is why the provenance can
 * be a real fetch rather than a bundle: `ortho` (2nd field is `phon`), `lemme`,
 * `cgram`, and `infover`. Row order and extra columns are irrelevant here.
 */
export function parseLexiqueRow(line: string): { written: string; phon: string; lemma: string; category: string; slots: InflectionSlot[] } | null {
  const fields = line.split('\t')
  if (fields.length < 11) return null
  const [written, phon, lemma, category, , , , , , , infover] = fields
  if (written === undefined || phon === undefined || lemma === undefined) return null
  if (category !== 'VER') return null
  const slots = (infover ?? '').split(';')
    .map((tag) => decodeInflection(tag))
    .filter((slot): slot is InflectionSlot => slot !== null)
  if (slots.length === 0) return null
  return { written, phon, lemma, category, slots }
}
