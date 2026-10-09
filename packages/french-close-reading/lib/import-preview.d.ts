/**
 * Import confirmation.
 *
 * A French source enters the library only after the reader has seen what will be
 * stored: the paragraph and sentence boundaries the segmenter will use, and
 * anything about the text that looks like damage rather than prose. This module
 * never writes — it only reports, so confirming is a separate deliberate act.
 */
export type ImportFlagCode = 'empty' | 'mojibake' | 'byte-order-mark' | 'mixed-line-endings' | 'unbalanced-guillemets' | 'trailing-whitespace' | 'ligature-missing' | 'paragraph-too-long' | 'no-terminal-punctuation' | 'non-breaking-space' | 'double-space';
export interface ImportFlag {
    code: ImportFlagCode;
    severity: 'error' | 'hint';
    detail: string;
}
export interface ImportSentencePreview {
    id: string;
    text: string;
    /** Absolute half-open character range into the exact source text. */
    start: number;
    end: number;
}
export interface ImportPreview {
    title: string;
    characters: number;
    paragraphs: number;
    sentences: number;
    /** Paragraph and sentence boundaries as the segmenter will store them. */
    blocks: {
        id: string;
        sentences: number;
        excerpt: string;
        sentenceDetails: ImportSentencePreview[];
    }[];
    head: string;
    tail: string;
    flags: ImportFlag[];
}
/**
 * Describe what importing this source would store.
 * @param input - The proposed title and the exact French source.
 * @returns Boundaries, excerpts and every flag the reader should judge.
 */
export declare function previewImport(input: {
    title: string;
    sourceText: string;
}): ImportPreview;
