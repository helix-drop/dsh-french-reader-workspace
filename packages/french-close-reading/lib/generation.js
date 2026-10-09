/**
 * The DSH model routes, via `ctx.llm`.
 *
 * The adapter is resolved through `prepareCall`, so the route that answers the
 * request is the one the capability check saw — a configuration change between
 * the two cannot mix two adapters into one call.
 */
export class DshLlmBackend {
    ctx;
    id = 'dsh';
    label = 'DSH 模型';
    constructor(ctx) {
        this.ctx = ctx;
    }
    get capabilities() {
        return {
            streaming: true,
            cancel: true,
            reportsResolvedModel: true,
            reportsUsage: true,
            maxInputCharacters: null,
            singleFlight: false,
        };
    }
    available() {
        const llm = this.ctx.get('llm');
        if (llm === undefined)
            return { available: false, reason: 'llm-unavailable' };
        if (llm.listProviders().length === 0)
            return { available: false, reason: 'no-provider-registered' };
        return { available: true };
    }
    async listModels(signal) {
        const llm = this.ctx.get('llm');
        if (llm === undefined)
            return [];
        const models = [];
        for (const provider of llm.listProviders()) {
            signal.throwIfAborted();
            for (const model of await llm.listModels(provider.id)) {
                // The backend id keeps the provider: two providers may serve one model id.
                models.push({
                    id: `${provider.id}/${model.id}`,
                    name: `${model.name} · ${provider.name}`,
                    reasoningEfforts: [],
                    contextWindow: null,
                });
            }
        }
        // Reasoning efforts are model-specific and only known after resolution, so
        // they are read lazily per chosen model (see resolveReasoningEfforts).
        return models;
    }
    /** The reasoning efforts one exact route accepts, for the model picker. */
    async resolveReasoningEfforts(model, signal) {
        const llm = this.ctx.get('llm');
        const route = splitRoute(model);
        if (llm === undefined || route === null)
            return [];
        try {
            const info = await llm.resolveModelInfo(route.provider, route.model, signal);
            const efforts = info.reasoning?.efforts ?? [];
            return efforts.map((effort) => String(effort.id));
        }
        catch {
            // A model whose metadata cannot be read is offered without effort choices
            // rather than with invented ones.
            return [];
        }
    }
    async generate(target, request) {
        const llm = this.ctx.get('llm');
        if (llm === undefined) {
            return { text: '', resolvedModel: null, usage: null, finish: 'error', failure: 'llm-unavailable' };
        }
        const route = splitRoute(target.model);
        if (route === null) {
            return { text: '', resolvedModel: null, usage: null, finish: 'error', failure: 'model-route-invalid' };
        }
        if (request.signal.aborted) {
            return { text: '', resolvedModel: null, usage: null, finish: 'cancelled', failure: null };
        }
        let prepared;
        request.onPhase?.('preparing');
        try {
            prepared = await llm.prepareCall({
                provider: route.provider,
                model: route.model,
                ...(target.reasoningEffort === undefined
                    ? {}
                    : { reasoningEffort: target.reasoningEffort }),
            }, request.signal);
        }
        catch (error) {
            return {
                text: '', resolvedModel: null, usage: null,
                // An abort (reader cancel or caller timeout) is not a model failure.
                finish: request.signal.aborted ? 'cancelled' : 'error',
                failure: failureText(error),
            };
        }
        let text = '';
        let usage = null;
        let finish = 'stop';
        let failure = null;
        let sawFinish = false;
        let modelCallStartedAt = null;
        let modelCallMs = null;
        let firstTextDeltaMs = null;
        try {
            // The dispatch carries the *prepared* config verbatim, plus this turn's
            // messages. The runtime compares the two and refuses a mismatch, and an
            // omitted `temperature` is not the same value as one the adapter resolved
            // from its own defaults — so the config travels through untouched rather
            // than being reconstructed field by field from what seemed relevant.
            const dispatched = {
                ...prepared.config,
                messages: [{ role: 'user', content: [{ type: 'text', text: request.prompt }] }],
                system: request.system,
                signal: request.signal,
            };
            // `streaming` means the provider stream is being read, not that visible text
            // has arrived. Timings start here; the first non-empty text delta is recorded
            // separately below.
            modelCallStartedAt = Date.now();
            request.onPhase?.('streaming');
            for await (const chunk of prepared.stream(dispatched)) {
                if (chunk.type === 'text-delta') {
                    text += chunk.text;
                    if (chunk.text !== '' && firstTextDeltaMs === null) {
                        firstTextDeltaMs = Math.max(0, Date.now() - modelCallStartedAt);
                        request.onFirstTextDelta?.(firstTextDeltaMs);
                    }
                    // Handed to the caller as it arrives, so a turn in progress has something
                    // durable behind it rather than appearing only once it is finished.
                    request.onDelta?.(chunk.text);
                }
                else if (chunk.type === 'usage') {
                    usage = { inputTokens: chunk.usage.inputTokens, outputTokens: chunk.usage.outputTokens };
                }
                else if (chunk.type === 'finish') {
                    sawFinish = true;
                    if (chunk.reason.kind === 'aborted') {
                        finish = 'cancelled';
                        failure = chunk.reason.failure.message;
                    }
                    else if (chunk.reason.kind === 'error') {
                        finish = 'error';
                        failure = chunk.reason.failure.message;
                    }
                    else if (chunk.reason.kind === 'max-tokens') {
                        finish = 'max-tokens';
                    }
                }
            }
            modelCallMs = modelCallStartedAt === null ? null : Math.max(0, Date.now() - modelCallStartedAt);
        }
        catch (error) {
            modelCallMs = modelCallStartedAt === null ? null : Math.max(0, Date.now() - modelCallStartedAt);
            return {
                text, resolvedModel: target.model, usage,
                finish: request.signal.aborted ? 'cancelled' : 'error',
                failure: failureText(error),
                modelCallMs,
                firstTextDeltaMs,
            };
        }
        // A provider stream that ends without a terminal frame is a failure, not a
        // completed empty turn — silence must never be read as success.
        if (!sawFinish) {
            return {
                text, resolvedModel: target.model, usage, finish: 'error',
                failure: 'stream-ended-without-finish', modelCallMs, firstTextDeltaMs,
            };
        }
        // A provider may ignore the cancel and still end its stream with `stop`:
        // the turn was revoked, and a late "success" must never be handed back as a
        // usable result — downstream stores whatever this returns.
        if (request.signal.aborted) {
            return {
                text, resolvedModel: target.model, usage, finish: 'cancelled', failure,
                modelCallMs, firstTextDeltaMs,
            };
        }
        // A route that answered is named by the request's own route; the backend does
        // not pretend to know a different one after the fact.
        return { text, resolvedModel: target.model, usage, finish, failure, modelCallMs, firstTextDeltaMs };
    }
}
/** Split a `provider/model` id, or null when the id is not a route. */
export function splitRoute(model) {
    const at = model.indexOf('/');
    if (at <= 0 || at === model.length - 1)
        return null;
    return { provider: model.slice(0, at), model: model.slice(at + 1) };
}
function failureText(error) {
    if (error !== null && typeof error === 'object' && 'message' in error)
        return String(error.message);
    return String(error);
}
