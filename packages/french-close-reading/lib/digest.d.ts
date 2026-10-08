/**
 * A dependency-free SHA-256 over UTF-8 text.
 *
 * The context fingerprint must cover the *content* of every material, not only
 * its identity and length: a same-length edit has to change the fingerprint, or a
 * preview the reader looked at could be re-used for different bytes. A digest is
 * the honest way to do that, and this module keeps it inside the package:
 *
 * - the package's modules stay runtime-neutral (no Node builtins), and
 * - the preview path is synchronous, so `crypto.subtle` (async-only) cannot be
 *   used there.
 *
 * `test/digest.test.mjs` checks the published vectors and compares every other
 * case against Node's own `node:crypto`, so this is a verified implementation
 * rather than a plausible one.
 */
/**
 * UTF-8 encode a JavaScript string.
 *
 * An unpaired surrogate — at either end, in either half — is encoded as U+FFFD,
 * which is what the WHATWG encoder (`TextEncoder`, `Buffer.from(text, 'utf8')`)
 * and Node's own hash `update` do. Encoding a lone surrogate literally would make
 * the digest depend on an encoding nobody else uses; substituting only the interior
 * case would be inconsistent with itself, so every unpaired half is replaced.
 */
export declare function utf8Bytes(text: string): Uint8Array;
/**
 * The SHA-256 digest of one string, as 64 lowercase hex characters.
 * @param text - The text to hash; it is UTF-8 encoded first.
 * @returns The digest.
 */
export declare function sha256Hex(text: string): string;
