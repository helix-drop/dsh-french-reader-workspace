import { FrenchReaderController } from "./controller.js";
import { FRENCH_READER_DOMAIN } from "./domain.js";
import { buildFrenchReaderTool } from "./tools.js";
export const name = 'french-close-reading';
export const inject = ['storageDomain', 'tools', 'typertGateway'];
export async function apply(ctx, config = {}) {
    const domain = await ctx.storageDomain.open(FRENCH_READER_DOMAIN);
    ctx.effect(() => () => domain.close(), 'french-close-reading: storage domain');
    const controller = new FrenchReaderController(ctx, domain, null, { config: config.audio });
    // Stored records are brought forward before anything can read them. This runs
    // once: the migration empties the legacy arrays it moved, so a second open finds
    // nothing to do. A failure is reported and never fatal — reads fall back to the
    // legacy records, so a medium that cannot be written leaves a working plugin
    // rather than a missing one.
    try {
        const report = await controller.migrateStoredRecords();
        if (report.ran) {
            ctx.logger.info(`french-close-reading: moved ${String(report.migrated)} context manifests to per-record storage`);
        }
    }
    catch (error) {
        ctx.logger.warn(`french-close-reading: storage migration did not run: ${String(error)}`);
    }
    // A generation job still `running` at this point cannot be running: the process
    // that would have finished it is gone. Settling them keeps "what happened to my
    // question" honest across a restart instead of claiming an answer is still coming.
    try {
        const settled = await controller.settleInterruptedJobs();
        if (settled.interrupted > 0) {
            ctx.logger.info(`french-close-reading: marked ${String(settled.interrupted)} interrupted generation(s)`);
        }
    }
    catch (error) {
        ctx.logger.warn(`french-close-reading: generation reconciliation did not run: ${String(error)}`);
    }
    ctx.tools.register(buildFrenchReaderTool(controller));
}
export { FrenchReaderController } from "./controller.js";
export * from "./types.js";
export { buildFrenchReaderTool } from "./tools.js";
