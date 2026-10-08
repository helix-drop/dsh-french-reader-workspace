import { z } from 'zod';
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
export declare const PERSONS: readonly ["1s", "2s", "3s", "1p", "2p", "3p"];
export type Person = (typeof PERSONS)[number];
/** The person labels the reader sees. */
export declare const PERSON_LABELS: Record<Person, string>;
/**
 * Lexique's phonology alphabet, as IPA.
 *
 * Every entry below was verified against a word whose pronunciation is not in
 * question (`chanter` → `S@te`, `chien` → `Sj5`, `montagne` → `m§taN`, `jeudi` →
 * `Z2di`, `fleur` → `fl9R`, `huit` → `8it`, `brun` → `bR1`, `temps` → `t@`), and
 * the list is the complete set of characters the corpus actually uses. A symbol
 * outside it makes the form unmapped rather than silently dropped.
 */
export declare const LEXIQUE_TO_IPA: Record<string, string>;
/** The Lexique characters this module has no IPA for, so a caller can say why. */
export declare function unmappedSymbols(phon: string): string[];
/**
 * One form's pronunciation in IPA, or null when the source used a symbol this
 * module does not know.
 */
export declare function toIpa(phon: string): string | null;
/** One inflection tag decoded: `ind:pre:2p` is indicative present, 2nd plural. */
export interface InflectionSlot {
    /** `ind`, `sub`, `cnd`, `imp`, `inf`, `par` … as the source writes it. */
    mood: string;
    /** `pre`, `imp`, `fut`, `pas` … as the source writes it. */
    tense: string;
    person: Person | null;
}
/** Decode one `infover` tag; null when it is not a tag this module reads. */
export declare function decodeInflection(tag: string): InflectionSlot | null;
/** The key a form is filed under: `ind:pre:1s`. */
export declare const slotKey: (slot: {
    mood: string;
    tense: string;
    person: Person;
}) => string;
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
export declare const PRONOUNCED_ENDINGS: Record<string, Partial<Record<Person, string>>>;
/** The tenses a phonetic-base card is built for, in the order it reads them. */
export declare const SUPPORTED_TENSES: readonly [{
    readonly mood: "ind";
    readonly tense: "pre";
    readonly label: "现在时";
}, {
    readonly mood: "ind";
    readonly tense: "imp";
    readonly label: "未完成过去时";
}, {
    readonly mood: "ind";
    readonly tense: "fut";
    readonly label: "简单将来时";
}, {
    readonly mood: "ind";
    readonly tense: "pas";
    readonly label: "简单过去时";
}, {
    readonly mood: "cnd";
    readonly tense: "pre";
    readonly label: "条件式现在时";
}, {
    readonly mood: "sub";
    readonly tense: "pre";
    readonly label: "虚拟式现在时";
}, {
    readonly mood: "imp";
    readonly tense: "pre";
    readonly label: "命令式现在时";
}];
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
    written: string;
    /** The pronunciation in IPA, syllable dots included when the source has them. */
    ipa: string;
    /** Every inflection slot the source attaches to this row. */
    slots: readonly InflectionSlot[];
}
/** One person's form inside a tense. */
export interface ConjugationForm {
    person: Person;
    written: string;
    /** The whole form's pronunciation. */
    ipa: string;
    /** Which base it belongs to, or null when it could not be derived. */
    baseIndex: number | null;
}
/** One pronounced stem, and the persons that share it. */
export interface PhoneticBase {
    ipa: string;
    persons: Person[];
    /** The shared spelling, when every person of the base spells the stem the same way. */
    writtenStem: string | null;
}
export interface ConjugationTense {
    mood: string;
    tense: string;
    label: string;
    bases: PhoneticBase[];
    forms: ConjugationForm[];
    /** Honest gaps: cells the source contradicts, forms it never lists, unmapped symbols. */
    notes: string[];
}
export interface ConjugationDataset {
    lemma: string;
    source: {
        kind: string;
        version: string;
        fetchedAt: string;
    };
    tenses: ConjugationTense[];
}
/**
 * Derive the phonetic bases of one lemma from its source rows.
 *
 * @param lemma - The lemma the rows belong to.
 * @param rows - Its forms, as the source lists them.
 * @param source - Provenance, stored with the result.
 * @returns One entry per supported tense, with its bases, forms, and gaps.
 */
export declare function deriveConjugationDataset(lemma: string, rows: readonly SourceFormRow[], source: {
    kind: string;
    version: string;
    fetchedAt: string;
}): ConjugationDataset;
/**
 * The stored dataset shape.
 *
 * Declared here beside the types it mirrors so a stored record is validated on load
 * like every other record: an unvalidated dataset would fail later, inside a card,
 * instead of at the domain open where it can be reported.
 */
export declare const ConjugationDatasetSchema: z.ZodObject<{
    lemma: z.ZodString;
    source: z.ZodObject<{
        kind: z.ZodString;
        version: z.ZodString;
        fetchedAt: z.ZodString;
    }, z.core.$strict>;
    tenses: z.ZodArray<z.ZodObject<{
        mood: z.ZodString;
        tense: z.ZodString;
        label: z.ZodString;
        bases: z.ZodArray<z.ZodObject<{
            ipa: z.ZodString;
            persons: z.ZodArray<z.ZodEnum<{
                "1s": "1s";
                "2s": "2s";
                "3s": "3s";
                "1p": "1p";
                "2p": "2p";
                "3p": "3p";
            }>>;
            writtenStem: z.ZodNullable<z.ZodString>;
        }, z.core.$strict>>;
        forms: z.ZodArray<z.ZodObject<{
            person: z.ZodEnum<{
                "1s": "1s";
                "2s": "2s";
                "3s": "3s";
                "1p": "1p";
                "2p": "2p";
                "3p": "3p";
            }>;
            written: z.ZodString;
            ipa: z.ZodString;
            baseIndex: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strict>>;
        notes: z.ZodArray<z.ZodString>;
    }, z.core.$strict>>;
}, z.core.$strict>;
/** Resolve one tense label to a dataset slot, or null when it is not one we read. */
export declare function resolveTenseLabel(label: string): {
    mood: string;
    tense: string;
} | null;
/**
 * Resolve one person label to a person, or null.
 *
 * Authors write `je`, `nous`, `il / elle`, `1s`; the dataset speaks in `1s`…`3p`.
 */
export declare function resolvePerson(label: string): Person | null;
/** One tense of a dataset by its code, or undefined when the dataset has none. */
export declare function datasetTense(dataset: ConjugationDataset, slot: {
    mood: string;
    tense: string;
}): ConjugationTense | undefined;
/** The base one person belongs to in a tense, or null when it is not derivable. */
export declare function datasetBaseOf(tense: ConjugationTense, person: Person): PhoneticBase | null;
/**
 * One Lexique row as a derivation row: the source adapter for the TSV distribution.
 *
 * Returns null when the row uses a phonology symbol the alphabet does not know, so
 * an unknown symbol makes a form absent rather than silently mispronounced.
 */
export declare function lexiqueRowToSourceRow(row: {
    written: string;
    phon: string;
    slots: readonly InflectionSlot[];
}): SourceFormRow | null;
/**
 * Parse the columns this module reads out of a Lexique TSV line.
 *
 * The distribution is a plain tab-separated file, which is why the provenance can
 * be a real fetch rather than a bundle: `ortho` (2nd field is `phon`), `lemme`,
 * `cgram`, and `infover`. Row order and extra columns are irrelevant here.
 */
export declare function parseLexiqueRow(line: string): {
    written: string;
    phon: string;
    lemma: string;
    category: string;
    slots: InflectionSlot[];
} | null;
