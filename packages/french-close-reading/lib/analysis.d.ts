/**
 * Structured per-sentence analysis.
 *
 * The plan is explicit that colour is a rendering of structure, not the data:
 * part of speech, syntactic function and semantic reading are three different
 * things and must not be collapsed into one coloured span. This module declares
 * that structure and validates it. It does not generate: an analysis arrives from
 * somewhere else and is checked here.
 *
 * The honesty rules the validator enforces:
 *
 * - every part of the sentence is accounted for by some constituent, or the gap is
 *   named with its text;
 * - a single constituent spanning several clauses is a summary, not an analysis;
 * - a judgement is labelled as a syntactic fact, a contextual reading, a
 *   rhetorical interpretation, or something still to be verified — so "Foucault
 *   means this" is never displayed with the same certainty as "the subject is X".
 */
import { z } from 'zod';
/** How sure the analysis is of one explanation. */
export declare const EXPLANATION_KINDS: readonly ["syntax", "context", "rhetoric", "unverified"];
/**
 * One clause of a sentence: the main clause, a relative clause, a complement
 * clause, a participle construction, and so on.
 *
 * Ranges are half-open offsets into the sentence text, so a clause can be
 * highlighted without the data ever holding markup.
 */
export declare const ClauseSchema: z.ZodObject<{
    id: z.ZodString;
    role: z.ZodString;
    start: z.ZodNumber;
    end: z.ZodNumber;
    text: z.ZodString;
    parentId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}, z.core.$strict>;
export type StoredClause = z.infer<typeof ClauseSchema>;
/**
 * One constituent and the syntactic function it carries.
 *
 * `partOfSpeech` and `function` are separate fields on purpose: "adjective" is a
 * part of speech, "attribut" is a function, and one label cannot be both.
 */
export declare const ConstituentSchema: z.ZodObject<{
    id: z.ZodString;
    role: z.ZodString;
    start: z.ZodNumber;
    end: z.ZodNumber;
    text: z.ZodString;
    clauseId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    partOfSpeech: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}, z.core.$strict>;
export type StoredConstituent = z.infer<typeof ConstituentSchema>;
/** One word's morphology: lemma, part of speech, tense, agreement. */
export declare const MorphologySchema: z.ZodObject<{
    id: z.ZodString;
    form: z.ZodString;
    lemma: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    partOfSpeech: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    tense: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    mood: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    person: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    gender: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    number: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    agreesWith: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    note: z.ZodDefault<z.ZodString>;
}, z.core.$strict>;
export type StoredMorphology = z.infer<typeof MorphologySchema>;
/** One explanation, labelled with how certain it is. */
export declare const ExplanationSchema: z.ZodObject<{
    id: z.ZodString;
    kind: z.ZodEnum<{
        syntax: "syntax";
        context: "context";
        rhetoric: "rhetoric";
        unverified: "unverified";
    }>;
    text: z.ZodString;
    start: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
    end: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
}, z.core.$strict>;
export type StoredExplanation = z.infer<typeof ExplanationSchema>;
/**
 * One sentence's full analysis: the six parts the plan requires.
 *
 * `sourceRevision` and `segmentationRevision` pin what this was written against,
 * so a later source correction can say "this was about the old text" instead of
 * silently re-attaching.
 */
export declare const SentenceAnalysisSchema: z.ZodObject<{
    id: z.ZodString;
    passageId: z.ZodString;
    anchorId: z.ZodString;
    text: z.ZodString;
    sourceRevision: z.ZodNumber;
    segmentationRevision: z.ZodNumber;
    translation: z.ZodString;
    backbone: z.ZodDefault<z.ZodString>;
    clauses: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        role: z.ZodString;
        start: z.ZodNumber;
        end: z.ZodNumber;
        text: z.ZodString;
        parentId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    }, z.core.$strict>>;
    constituents: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        role: z.ZodString;
        start: z.ZodNumber;
        end: z.ZodNumber;
        text: z.ZodString;
        clauseId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        partOfSpeech: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    }, z.core.$strict>>;
    morphology: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        form: z.ZodString;
        lemma: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        partOfSpeech: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        tense: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        mood: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        person: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        gender: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        number: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        agreesWith: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        note: z.ZodDefault<z.ZodString>;
    }, z.core.$strict>>;
    explanations: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        kind: z.ZodEnum<{
            syntax: "syntax";
            context: "context";
            rhetoric: "rhetoric";
            unverified: "unverified";
        }>;
        text: z.ZodString;
        start: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
        end: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
    }, z.core.$strict>>;
    provenance: z.ZodEnum<{
        user: "user";
        ai: "ai";
        mixed: "mixed";
    }>;
    status: z.ZodEnum<{
        draft: "draft";
        reviewed: "reviewed";
    }>;
    revision: z.ZodNumber;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, z.core.$strict>;
export type StoredSentenceAnalysis = z.infer<typeof SentenceAnalysisSchema>;
/** One whole-passage analysis version: the overall translation plus per-sentence rows. */
export declare const AnalysisVersionSchema: z.ZodObject<{
    id: z.ZodString;
    passageId: z.ZodString;
    revision: z.ZodNumber;
    sourceRevision: z.ZodNumber;
    overallTranslation: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    cohesion: z.ZodDefault<z.ZodString>;
    coveredAnchors: z.ZodArray<z.ZodString>;
    backend: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    model: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    createdAt: z.ZodString;
}, z.core.$strict>;
export type StoredAnalysisVersion = z.infer<typeof AnalysisVersionSchema>;
export declare const SentenceAnalysesSchema: z.ZodObject<{
    passageId: z.ZodString;
    sentences: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        passageId: z.ZodString;
        anchorId: z.ZodString;
        text: z.ZodString;
        sourceRevision: z.ZodNumber;
        segmentationRevision: z.ZodNumber;
        translation: z.ZodString;
        backbone: z.ZodDefault<z.ZodString>;
        clauses: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            role: z.ZodString;
            start: z.ZodNumber;
            end: z.ZodNumber;
            text: z.ZodString;
            parentId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        }, z.core.$strict>>;
        constituents: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            role: z.ZodString;
            start: z.ZodNumber;
            end: z.ZodNumber;
            text: z.ZodString;
            clauseId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            partOfSpeech: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        }, z.core.$strict>>;
        morphology: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            form: z.ZodString;
            lemma: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            partOfSpeech: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            tense: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            mood: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            person: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            gender: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            number: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            agreesWith: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            note: z.ZodDefault<z.ZodString>;
        }, z.core.$strict>>;
        explanations: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            kind: z.ZodEnum<{
                syntax: "syntax";
                context: "context";
                rhetoric: "rhetoric";
                unverified: "unverified";
            }>;
            text: z.ZodString;
            start: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
            end: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
        }, z.core.$strict>>;
        provenance: z.ZodEnum<{
            user: "user";
            ai: "ai";
            mixed: "mixed";
        }>;
        status: z.ZodEnum<{
            draft: "draft";
            reviewed: "reviewed";
        }>;
        revision: z.ZodNumber;
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type StoredSentenceAnalyses = z.infer<typeof SentenceAnalysesSchema>;
export declare const AnalysisVersionsSchema: z.ZodObject<{
    passageId: z.ZodString;
    versions: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        passageId: z.ZodString;
        revision: z.ZodNumber;
        sourceRevision: z.ZodNumber;
        overallTranslation: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        cohesion: z.ZodDefault<z.ZodString>;
        coveredAnchors: z.ZodArray<z.ZodString>;
        backend: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        model: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        createdAt: z.ZodString;
    }, z.core.$strict>>;
    currentId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}, z.core.$strict>;
export type StoredAnalysisVersions = z.infer<typeof AnalysisVersionsSchema>;
export interface AnalysisReport {
    errors: string[];
    hints: string[];
}
/**
 * Validate one sentence analysis.
 *
 * @param analysis - The analysis to check.
 * @param sentenceText - The sentence text as it stands in the current source, so
 *   a range that no longer fits is caught rather than rendered.
 * @returns Errors that must be fixed, and hints a reader should judge.
 */
export declare function validateSentenceAnalysis(analysis: StoredSentenceAnalysis, sentenceText: string): AnalysisReport;
/**
 * What one passage's analysis covers, so "every sentence has an analysis" is a
 * measurement rather than a claim.
 */
export declare function analysisCoverage(sentenceAnchors: readonly {
    id: string;
    text: string;
}[], analyses: readonly StoredSentenceAnalysis[]): {
    covered: string[];
    missing: string[];
    failed: string[];
    stale: string[];
    perSentence: {
        anchorId: string;
        errors: string[];
        hints: string[];
    }[];
};
