/** Model transport normalization. It never invents words or resolves a tie by proximity. */
export declare const ANALYSIS_PROTOCOL_VERSION = 2;
export interface SourceToken {
    id: number;
    start: number;
    end: number;
    text: string;
}
export declare function sourceTokens(text: string): SourceToken[];
export interface ReceptionIssue {
    kind: 'clause' | 'constituent' | 'explanation';
    index: number;
    role: string;
    text: string;
    reason: string;
}
export interface Reception {
    protocolVersion: number;
    state: 'complete' | 'partial';
    issues: ReceptionIssue[];
    recoveredRanges: number;
    tokenRanges: number;
    receivedClauses: number;
    receivedConstituents: number;
}
type Row = Record<string, unknown>;
export declare function normalizeAnalysisReply(json: Row, text: string): {
    json: Row;
    reception: Reception;
};
/** Balanced object scanner: braces inside strings and appended grammar blocks are separate. */
export declare function extractAnalysisObject(reply: string): Row | null;
export {};
