/**
 * Deterministic French segmentation.
 *
 * Anchor ids are positional (`p2`, `p2.s3`) and are only meaningful together
 * with the passage's `sourceRevision` and this module's `SEGMENTATION_REVISION`:
 * the source is immutable, so positional ids stay stable until either revision
 * changes. Every returned offset indexes the original source string, so a
 * reader can highlight an anchor without re-running the segmenter.
 */
/** Bumped whenever the rules below change the anchors of existing sources. */
export declare const SEGMENTATION_REVISION = 1;
export interface SentenceAnchor {
    id: string;
    paragraphId: string;
    text: string;
    start: number;
    end: number;
}
export interface ParagraphAnchor {
    id: string;
    text: string;
    start: number;
    end: number;
    sentences: SentenceAnchor[];
}
/**
 * Split a source text into paragraphs and sentences.
 * @param sourceText - Immutable passage source.
 * @returns Paragraph anchors with absolute offsets into `sourceText`.
 */
export declare function segmentSource(sourceText: string): ParagraphAnchor[];
/** The whole passage, used for an overall translation rather than a sentence. */
export declare const PASSAGE_ANCHOR_ID = "passage";
/**
 * True when an anchor id names this passage, one of its paragraphs, or one of
 * its sentences. Every write path validates against this before storing, so a
 * stored `anchorId` can always be resolved back to text.
 * @param paragraphs - Segmentation output.
 * @param anchorId - `passage`, `pN`, or `pN.sM`.
 * @returns Whether the anchor exists in this segmentation.
 */
export declare function isKnownAnchor(paragraphs: readonly ParagraphAnchor[], anchorId: string): boolean;
/**
 * Resolve one anchor id against a segmentation.
 * @param paragraphs - Segmentation output.
 * @param anchorId - `pN` (paragraph) or `pN.sM` (sentence).
 * @returns The matching paragraph or sentence, or undefined.
 */
export declare function findAnchor(paragraphs: readonly ParagraphAnchor[], anchorId: string): ParagraphAnchor | SentenceAnchor | undefined;
