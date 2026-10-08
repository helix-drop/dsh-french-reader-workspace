/** The marker that opens the block. Chosen to be unlikely in prose. */
export declare const GRAMMAR_BLOCK_START = "<<<GRAMMAR";
/** The marker that closes the block. */
export declare const GRAMMAR_BLOCK_END = ">>>";
/** How many points one turn may contribute. More is a sign the model misunderstood. */
export declare const MAX_EXTRACTED_POINTS = 8;
/** One grammar point the model proposed, already validated. */
export interface ExtractedGrammarPoint {
    title: string;
    body: string;
    /** The anchor the point is about, when the model named a valid one. */
    anchorId: string | null;
    level: string | null;
    module: string | null;
    pitfall: string;
}
export type ExtractionOutcome = {
    status: 'extracted';
    text: string;
    points: ExtractedGrammarPoint[];
    detail: string | null;
} | {
    status: 'none';
    text: string;
    points: [];
    detail: string;
} | {
    status: 'invalid';
    text: string;
    points: [];
    detail: string;
};
/** What the model is told to produce, appended to the system instruction. */
export declare function renderExtractionInstruction(): string;
/**
 * Split one reply into the reader's answer and the grammar points it carries.
 *
 * Every complete block is removed from the answer text — a reply that quotes the
 * format before using it must not show the reader the wire format — while the
 * **last** block is the one parsed, because that is the one the model means as its
 * output.
 */
export declare function extractGrammarPoints(reply: string): ExtractionOutcome;
