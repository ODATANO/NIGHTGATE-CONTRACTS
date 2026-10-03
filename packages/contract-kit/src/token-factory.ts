/**
 * The token factory, caller's side: names, issuer keys, domains and token
 * types by the contract's pure circuits, the issuer witness, and the inputs of
 * a `mint` or `burn` call.
 */

import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { hexToBytes32, bytesToHex } from './hex.js';

/** The factory's circuits, for key fetches by circuit list. */
export const TOKEN_FACTORY_CIRCUITS = Object.freeze(['mint', 'burn'] as const);

const TOKEN_FACTORY_ISSUER_LABEL = 'nightgate/token-factory-issuer/v1';

/**
 * HMAC-SHA256(material, label) -> the 32-byte issuer secret behind the `issuerSecret()`
 * witness. Fed the wallet's zswap role seed, the same seed is the same issuer wherever
 * it mints; its own label keeps it apart from the vault secret of the same seed.
 */
export function deriveTokenFactoryIssuerSecret(material: Uint8Array): Uint8Array {
    return hmac(sha256, material, new TextEncoder().encode(TOKEN_FACTORY_ISSUER_LABEL));
}

export interface TokenFactoryPureCircuits {
    issuerKey(secret: Uint8Array): Uint8Array;
    domainOf(issuer: Uint8Array, name: Uint8Array): Uint8Array;
}

/** A token name as the contract takes it: UTF-8, zero-padded to 32 bytes. */
export function tokenName(name: string): Uint8Array {
    const utf8 = new TextEncoder().encode(name);
    if (utf8.length > 32) throw new Error(`token name "${name}" is longer than 32 bytes`);
    const out = new Uint8Array(32);
    out.set(utf8);
    return out;
}

/** The name behind a padded 32-byte name. */
export function nameOf(bytes: Uint8Array): string {
    let end = bytes.length;
    while (end > 0 && bytes[end - 1] === 0) end--;
    return new TextDecoder().decode(bytes.subarray(0, end));
}

function nameBytes(name: string | Uint8Array): Uint8Array {
    return typeof name === 'string' ? tokenName(name) : name;
}

/** `issuerKey(secret)` of the artifact, as hex. */
export function issuerKeyOf(pure: TokenFactoryPureCircuits, issuerSecretHex: string): string {
    return bytesToHex(pure.issuerKey(hexToBytes32(issuerSecretHex, 'issuerSecret')));
}

/** `domainOf(issuer, name)` of the artifact, as hex; the domain names the token on the factory. */
export function domainOf(pure: TokenFactoryPureCircuits, issuerKeyHex: string, name: string | Uint8Array): string {
    return bytesToHex(pure.domainOf(hexToBytes32(issuerKeyHex, 'issuerKey'), nameBytes(name)));
}

export interface TokenOfInput {
    /** Either the issuer's secret or its key. */
    issuerSecret?: string;
    issuerKey?: string;
    name: string | Uint8Array;
    /** The factory deployment, 64 hex. */
    contractAddress: string;
}

/** The issuer key, domain and raw token type (all hex) of an issuer's token on a factory. */
export async function tokenTypeOf(pure: TokenFactoryPureCircuits, input: TokenOfInput): Promise<{ issuer: string; domain: string; type: string }> {
    const issuer = input.issuerKey ? bytesToHex(hexToBytes32(input.issuerKey, 'issuerKey')) : issuerKeyOf(pure, input.issuerSecret ?? '');
    const domain = domainOf(pure, issuer, input.name);
    const rt: any = await import('@midnight-ntwrk/compact-runtime');
    const raw: unknown = rt.rawTokenType(hexToBytes32(domain), input.contractAddress);
    const type = typeof raw === 'string' ? raw.toLowerCase() : bytesToHex(raw as Uint8Array);
    return { issuer, domain, type };
}

/** What the `mint` circuit's witness reads; swapped per call through the bag. */
export interface TokenFactoryWitnessBag {
    issuerSecret?: Uint8Array;
}

/** Generated `Witnesses<PS>` shape of the factory. */
export interface TokenFactoryWitnesses<PS = unknown> {
    issuerSecret(ctx: { privateState: PS }): [PS, Uint8Array];
}

/** The factory witnesses over a mutable bag, so one contract instance serves every call. */
export function tokenFactoryWitnesses<PS = unknown>(bag: () => TokenFactoryWitnessBag): TokenFactoryWitnesses<PS> {
    return {
        issuerSecret(ctx) {
            const v = bag().issuerSecret;
            if (v === undefined) throw new Error('issuerSecret witness invoked without an issuer secret; mint requires it');
            return [ctx.privateState, v];
        }
    };
}

/** A coin as the `burn` circuit takes it (`ShieldedCoinInfo`). */
export interface ShieldedCoinInput {
    nonce: string;
    color: string;
    value: bigint | number | string;
}

export interface PreparedFactoryCall {
    circuitId: 'mint' | 'burn';
    args: unknown[];
    witnesses: TokenFactoryWitnesses;
}

/** `mint(name, amount, recipient)`: the issuer's token `name`, `amount` units, to a coin public key. */
export function prepareMint({ name, amount, recipientCoinPublicKey, issuerSecret }: {
    name: string | Uint8Array;
    amount: bigint | number | string;
    /** The recipient's Zswap coin public key, 64 hex. */
    recipientCoinPublicKey: string;
    issuerSecret: string;
}): PreparedFactoryCall {
    const a = BigInt(amount);
    if (a <= 0n) throw new Error('amount must be positive');
    const secret = hexToBytes32(issuerSecret, 'issuerSecret');
    return {
        circuitId: 'mint',
        args: [nameBytes(name), a, { bytes: hexToBytes32(recipientCoinPublicKey, 'recipientCoinPublicKey') }],
        witnesses: tokenFactoryWitnesses(() => ({ issuerSecret: secret }))
    };
}

/** `burn(domain, coin)`: a coin of the token `domain` leaves circulation. Anyone holding one may burn it. */
export function prepareBurn({ domain, coin }: { domain: string; coin: ShieldedCoinInput }): PreparedFactoryCall {
    const value = BigInt(coin.value);
    if (value <= 0n) throw new Error('coin.value must be positive');
    return {
        circuitId: 'burn',
        args: [hexToBytes32(domain, 'domain'), { nonce: hexToBytes32(coin.nonce, 'coin.nonce'), color: hexToBytes32(coin.color, 'coin.color'), value }],
        witnesses: tokenFactoryWitnesses(() => ({}))
    };
}
