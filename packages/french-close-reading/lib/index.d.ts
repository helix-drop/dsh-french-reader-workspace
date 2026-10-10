import type { Context } from '@deepseek-ai/cordis';
export declare const name = "french-close-reading";
export declare const inject: string[];
/**
 * The plugin's configuration row, as `cordis.yml` supplies it.
 *
 * Only the `audio` section is read here, and it is handed on **unvalidated**:
 * `audio.ts` owns that schema, together with the rule that the key comes from
 * `config.audio.apiKey` or from `GEMINI_API_KEY` and from nowhere else. A
 * section that does not satisfy the schema is reported to the panel as
 * `unconfigured`, with its reason, instead of failing the plugin load.
 */
export interface Config {
    audio?: unknown;
}
export declare function apply(ctx: Context, config?: Config): Promise<void>;
export { FrenchReaderController } from './controller.ts';
export * from './types.ts';
export { buildFrenchReaderTool } from './tools.ts';
