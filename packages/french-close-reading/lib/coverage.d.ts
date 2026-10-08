/**
 * Structural coverage check for a sentence analysis.
 *
 * The plan forbids two things that are easy to do by accident: presenting an
 * analysis that silently drops a clause, and calling a one-line summary an
 * analysis. Both are mechanically checkable once the analysis states which
 * character ranges it accounts for, so this module checks the claim rather than
 * trusting its prose.
 *
 * Clause boundaries are derived from punctuation and a closed list of French
 * subordinators and coordinators. That is deliberately shallow: it finds *where*
 * a clause starts, never what it means, so it can say "nothing here was analysed"
 * without pretending to parse.
 */
export interface Constituent {
    label: string;
    start: number;
    end: number;
}
export interface ClauseUnit {
    start: number;
    end: number;
    text: string;
    /** The word-bearing core: punctuation at the edges is not a clause. */
    core: {
        start: number;
        end: number;
    };
}
export interface CoverageReport {
    errors: string[];
    hints: string[];
    clauses: ClauseUnit[];
}
/**
 * The clause-sized units of a sentence, split on punctuation and clause markers.
 * @param sentence - The exact sentence text.
 * @returns Ranges of text that each deserve their own analysis.
 */
export declare function clauseRanges(sentence: string): ClauseUnit[];
/**
 * Check that an analysis accounts for every clause and leaves no text behind.
 * @param sentence - The exact sentence the analysis is about.
 * @param constituents - The labelled ranges the analysis claims to cover.
 * @returns Errors that must be fixed and hints about the analysis's shape.
 */
export declare function checkCoverage(sentence: string, constituents: readonly Constituent[]): CoverageReport;
