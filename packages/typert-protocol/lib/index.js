export class TypertRemoteService {
    constructor(_ctx, _serviceKey, _options) { }
}
export class RemoteError extends Error {
    code;
    details;
    constructor(code, message, details, options) {
        super(message, options);
        this.name = 'RemoteError';
        this.code = code;
        this.details = details;
    }
}
export function Remote(option, context) {
    if (typeof option === 'function' && context !== undefined)
        return;
    return () => undefined;
}
