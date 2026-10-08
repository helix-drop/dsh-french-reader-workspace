import type { Context } from '@deepseek-ai/cordis';
export declare const name = "french-close-reading";
export declare const inject: string[];
export declare function apply(ctx: Context): Promise<void>;
export { FrenchReaderController } from './controller.ts';
export * from './types.ts';
export { buildFrenchReaderTool } from './tools.ts';
