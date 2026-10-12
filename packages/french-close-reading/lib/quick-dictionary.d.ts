import type { PageFetcher } from './conjugation-source.ts';
import type { QuickDictionaryValue } from './types.ts';
export declare function dictionaryUrl(mot: string): string;
export declare function parseDictionary(content: string): QuickDictionaryValue['glosses'];
/** Translate standard dictionary form labels without another model request. */
export declare function chineseForm(text: string): string | null;
/** Read-only, bounded dictionary cache. No model calls or lexicon writes. */
export declare class QuickDictionary {
    private readonly cache;
    lookup(mot: string, fetchPage: PageFetcher | undefined, signal: AbortSignal, timeoutMs?: number): Promise<QuickDictionaryValue>;
}
