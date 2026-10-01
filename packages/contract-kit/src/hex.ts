/**
 * The one hex codec of the lineages: optional 0x prefix, even length, hex
 * digits only; output lowercase without prefix. Dependency-free so browser
 * bundles, the txbuilder and the server parse hex with the same strictness.
 */

const HEX_RE = /^[0-9a-fA-F]*$/;

/** Throws on odd length or a non-hex character; an empty string yields an empty array. */
export function hexToBytes(hex: string, label = 'value'): Uint8Array {
    if (typeof hex !== 'string') throw new Error(`${label} must be a hex string`);
    const clean = hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;
    if (clean.length % 2 !== 0 || !HEX_RE.test(clean)) {
        throw new Error(`${label} must be even-length hex`);
    }
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
    return out;
}

/** Exactly 32 bytes of hex (64 hex chars, optional 0x). */
export function hexToBytes32(hex: string, label = 'value'): Uint8Array {
    const out = hexToBytes(hex, label);
    if (out.length !== 32) throw new Error(`${label} must be 32-byte hex (64 chars)`);
    return out;
}

/** Lowercase hex without prefix. */
export function bytesToHex(bytes: Uint8Array | ArrayLike<number>): string {
    let out = '';
    for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
    return out;
}

/** Canonical form of a hex string: validated, prefix dropped, lowercase. */
export function normalizeHex(hex: string, label = 'value'): string {
    return bytesToHex(hexToBytes(hex, label));
}
