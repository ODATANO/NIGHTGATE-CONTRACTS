/**
 * Holder registry, the caller's side: the claim key a holder registers on the
 * `holder-registry` contract and later proves to a service with its preimage.
 */

import { blake2b } from '@noble/hashes/blake2b';
import { bytesToHex, hexToBytes32 } from './hex.js';

/** The registry's circuits, for key fetches by circuit list. */
export const HOLDER_REGISTRY_CIRCUITS = Object.freeze(['registerHolder', 'unregisterHolder'] as const);

const CLAIM_KEY_LABEL = 'nightgate/holder-claim/v1';

/** blake2b-256 over the label and the 32-byte secret (64 hex); what `registerHolder` takes as `claim_key`. */
export function holderClaimKey(claimSecretHex: string): string {
    const secret = hexToBytes32(claimSecretHex);
    const label = Uint8Array.from(CLAIM_KEY_LABEL, (c) => c.charCodeAt(0)); // ASCII label
    const input = new Uint8Array(label.length + secret.length);
    input.set(label, 0);
    input.set(secret, label.length);
    return bytesToHex(blake2b(input, { dkLen: 32 }));
}

/** The registry entry for a type and claim key, by the artifact's own pure circuit. */
export function holderEntry(
    pureCircuits: { holderEntry(tokenType: Uint8Array, claimKey: Uint8Array): Uint8Array },
    tokenTypeHex: string,
    claimKeyHex: string
): string {
    return bytesToHex(pureCircuits.holderEntry(hexToBytes32(tokenTypeHex), hexToBytes32(claimKeyHex)));
}
