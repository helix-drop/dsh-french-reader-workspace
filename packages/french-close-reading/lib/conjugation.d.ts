/**
 * Conjugation checking.
 *
 * This module does not conjugate. It checks a *claim*: the paradigm someone
 * displays, the decomposition they teach, and the tense they assert for the
 * input form. That keeps the honest failures visible — an incomplete rule set is
 * reported as unverified instead of being papered over with invented forms.
 *
 * Rules taken from the plan: the final form must be correct; a taught
 * decomposition must actually compose the form; only the present tense and the
 * input's own tense may appear; a bare past participle is not a compound tense;
 * an ambiguous form needs an example before a tense is asserted; an unverified
 * A–E classification is marked 存疑.
 */
import { type ConjugationDataset } from './conjugation-data.ts';
export interface ConjugationRow {
    person: string;
    form: string;
}
/** One base the author claims, with the persons they say share it. */
export interface ClaimedBase {
    ipa: string;
    persons: string[];
}
/** The three-tier ladder the reader sees, one block per tense. */
export interface LadderBlock {
    tense: string;
    rows: ConjugationRow[];
    /** Taught decomposition for this block, when the author gives one. */
    stem?: string | null;
    endings?: Record<string, string> | null;
    /**
     * The phonetic bases the author claims for this tense, when they claim any.
     * Checked against the dataset rather than taken on trust.
     */
    bases?: ClaimedBase[] | null;
}
export interface ConjugationClaim {
    infinitive: string;
    /** The form the reader looked up. */
    inputForm: string;
    /** The tense the author asserts for the input, if they assert one. */
    inputTense: string | null;
    /** Other tenses the form could belong to, as the author lists them. */
    candidates?: string[];
    /** An example sentence that disambiguates the form. */
    evidence?: string | null;
    blocks: LadderBlock[];
    /** A–E style classification, if the author claims one. */
    classification?: string | null;
    classificationVerified?: boolean;
    /** Exception note for a verb whose forms do not follow the regular pattern. */
    irregularNote?: string | null;
}
export interface ConjugationReport {
    errors: string[];
    hints: string[];
}
/**
 * Check one conjugation claim.
 *
 * @param claim - The paradigm, decomposition, tense assertion and classification.
 * @param options - `dataset`: pronunciation data to check the claim **against**.
 *   When one is supplied, a displayed form, a taught stem or a claimed base that
 *   disagrees with it is an error, and the caller's own `classificationVerified`
 *   flag stops being sufficient — see rule 9.
 * @returns Errors that must be fixed and hints the author should judge.
 */
export declare function checkConjugation(claim: ConjugationClaim, options?: {
    dataset?: ConjugationDataset | null;
}): ConjugationReport;
/**
 * Render the three-tier ladder, marking the input form with ◀ and any
 * unverified classification with 存疑.
 * @param claim - The checked claim.
 * @returns The ladder text.
 */
export declare function renderConjugation(claim: ConjugationClaim): string;
