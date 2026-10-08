/** Build-only type bridge for the analyzer in this external-plugin workspace. */
export interface RemoteMethodOptions {
    readonly mode: 'stream';
}
export type RemoteMethodDecorator = <This extends object, Args extends unknown[], Result>(method: (this: This, ...args: Args) => Result, context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Result>) => void;
export declare class TypertRemoteService {
    constructor(_ctx: object, _serviceKey: string, _options?: {
        readonly namespace?: string;
    });
}
export declare class RemoteError<Code extends string = string> extends Error {
    readonly code: Code;
    readonly details: object;
    constructor(code: Code, message: string, details: object, options?: ErrorOptions);
}
export declare function Remote<This extends object, Args extends unknown[], Result>(_method: (this: This, ...args: Args) => Result, _context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Result>): void;
export declare function Remote(option: string | RemoteMethodOptions): RemoteMethodDecorator;
