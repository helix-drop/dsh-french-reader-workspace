import type { FrenchReaderController } from './controller.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        /**
         * Tool registry owned by `@deepseek-ai/dsh-tools`. Declared locally with the
         * one member this plugin uses: importing that package for a type would add a
         * runtime dependency edge the plugin does not need.
         */
        tools: {
            register(options: Record<string, unknown>): void;
        };
    }
}
/**
 * Build the `french_reader` tool definition.
 * @param controller - Host controller owning the storage domain.
 * @returns Tool options for `ctx.tools.register`.
 */
export declare function buildFrenchReaderTool(controller: FrenchReaderController): Record<string, unknown>;
