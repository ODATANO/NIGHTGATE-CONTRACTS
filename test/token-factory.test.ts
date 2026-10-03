/**
 * The compiled token-factory artifact on compact-runtime against an in-memory
 * ledger: issuer-named types, supply bookkeeping, burn, and the kit's helpers
 * byte-identical to the circuits.
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { describe, test, expect, beforeAll } from 'vitest';
import {
    tokenName, nameOf, issuerKeyOf, domainOf, tokenTypeOf, prepareMint, prepareBurn, tokenFactoryWitnesses,
    bytesToHex, TOKEN_FACTORY_CIRCUITS, deriveTokenFactoryIssuerSecret, deriveAttestationSecret
} from '@odatano/contract-kit';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const artifactPath = path.join(repoRoot, 'packages/token-factory/managed/token-factory/contract/index.js');

const SECRET = '11'.repeat(32);
const OTHER_SECRET = '22'.repeat(32);
const RECIPIENT = '33'.repeat(32);

let mod: any;
let rt: any;

function failing(fn: () => unknown): string {
    try { fn(); return ''; } catch (err: any) { return String(err?.message ?? err) || 'threw'; }
}

/** The factory on an in-memory ledger; every assert is enforced, nothing is proven. */
function localFactory() {
    let bag: { issuerSecret?: Uint8Array } = {};
    const contract = new mod.Contract(tokenFactoryWitnesses(() => bag));
    const coinPk = { bytes: new Uint8Array(32).fill(1) };
    const address = rt.sampleContractAddress();
    let state = contract.initialState(rt.createConstructorContext(undefined, coinPk)).currentContractState;
    const call = (circuit: string, args: unknown[], inputs: { issuerSecret?: Uint8Array } = {}) => {
        bag = inputs;
        const ctx = rt.createCircuitContext(address, coinPk, state, undefined);
        const r = contract.circuits[circuit](ctx, ...args);
        state = r.context.currentQueryContext.state;
        return r;
    };
    return {
        address,
        ledger: () => mod.ledger(state),
        mint: (issuerSecretHex: string, name: string, amount: bigint, recipient: string = RECIPIENT) => {
            const prepared = prepareMint({ name, amount, recipientCoinPublicKey: recipient, issuerSecret: issuerSecretHex });
            return call('mint', prepared.args, { issuerSecret: Buffer.from(issuerSecretHex, 'hex') });
        },
        burn: (domainHex: string, coin: { nonce: string; color: string; value: bigint }) => call('burn', prepareBurn({ domain: domainHex, coin }).args)
    };
}

beforeAll(async () => {
    mod = await import(pathToFileURL(artifactPath).href);
    rt = await import('@midnight-ntwrk/compact-runtime');
});

describe('token names', () => {
    test('pad to 32 bytes and back; longer names are refused', () => {
        const n = tokenName('CREDIT');
        expect(n).toHaveLength(32);
        expect(nameOf(n)).toBe('CREDIT');
        expect(nameOf(tokenName(''))).toBe('');
        expect(() => tokenName('x'.repeat(33))).toThrow(/longer than 32 bytes/);
    });
});

describe('issuer secret of a seed', () => {
    test('is 32 bytes, deterministic, per seed, and not the vault secret of the same seed', () => {
        const seed = new Uint8Array(32).fill(7);
        const a = deriveTokenFactoryIssuerSecret(seed);
        expect(a).toHaveLength(32);
        expect(bytesToHex(deriveTokenFactoryIssuerSecret(seed))).toBe(bytesToHex(a));
        expect(bytesToHex(deriveTokenFactoryIssuerSecret(new Uint8Array(32).fill(8)))).not.toBe(bytesToHex(a));
        expect(bytesToHex(deriveAttestationSecret(seed))).not.toBe(bytesToHex(a));
    });
});

describe('issuer, domain and type', () => {
    test('the kit recomputes what the pure circuits hash', async () => {
        const issuer = issuerKeyOf(mod.pureCircuits, SECRET);
        expect(issuer).toBe(bytesToHex(mod.pureCircuits.issuerKey(Buffer.from(SECRET, 'hex'))));
        const domain = domainOf(mod.pureCircuits, issuer, 'CREDIT');
        expect(domain).toBe(bytesToHex(mod.pureCircuits.domainOf(Buffer.from(issuer, 'hex'), tokenName('CREDIT'))));
        const address = rt.sampleContractAddress();
        const t = await tokenTypeOf(mod.pureCircuits, { issuerSecret: SECRET, name: 'CREDIT', contractAddress: address });
        expect(t).toEqual({ issuer, domain, type: expect.stringMatching(/^[0-9a-f]{64}$/) });
        expect(await tokenTypeOf(mod.pureCircuits, { issuerKey: issuer, name: tokenName('CREDIT'), contractAddress: address })).toEqual(t);
        // Another issuer or another name is another type.
        expect((await tokenTypeOf(mod.pureCircuits, { issuerSecret: OTHER_SECRET, name: 'CREDIT', contractAddress: address })).type).not.toBe(t.type);
        expect((await tokenTypeOf(mod.pureCircuits, { issuerSecret: SECRET, name: 'DATA', contractAddress: address })).type).not.toBe(t.type);
    });

    test('the circuit list matches the artifact', () => {
        expect([...TOKEN_FACTORY_CIRCUITS].sort()).toEqual(Object.keys(mod.Contract.prototype.circuits ?? {}).length
            ? Object.keys(new mod.Contract(tokenFactoryWitnesses(() => ({}))).circuits).sort()
            : ['burn', 'mint']);
    });
});

describe('mint and burn on the ledger', () => {
    test('the first mint creates the token, later mints add to its supply; another issuer gets another token', () => {
        const f = localFactory();
        const issuer = issuerKeyOf(mod.pureCircuits, SECRET);
        const domain = domainOf(mod.pureCircuits, issuer, 'CREDIT');
        f.mint(SECRET, 'CREDIT', 100n);
        let led = f.ledger();
        expect(led.tokens.member(Buffer.from(domain, 'hex'))).toBe(true);
        let token = led.tokens.lookup(Buffer.from(domain, 'hex'));
        expect(bytesToHex(token.issuer)).toBe(issuer);
        expect(nameOf(token.name)).toBe('CREDIT');
        expect(token.supply).toBe(100n);
        f.mint(SECRET, 'CREDIT', 50n);
        token = f.ledger().tokens.lookup(Buffer.from(domain, 'hex'));
        expect(token.supply).toBe(150n);
        f.mint(OTHER_SECRET, 'CREDIT', 7n);
        led = f.ledger();
        const otherDomain = domainOf(mod.pureCircuits, issuerKeyOf(mod.pureCircuits, OTHER_SECRET), 'CREDIT');
        expect(otherDomain).not.toBe(domain);
        expect(led.tokens.lookup(Buffer.from(otherDomain, 'hex')).supply).toBe(7n);
        expect(led.tokens.lookup(Buffer.from(domain, 'hex')).supply).toBe(150n);
    });

    test('a zero mint and a mint without the issuer secret are refused', () => {
        const f = localFactory();
        expect(() => prepareMint({ name: 'X', amount: 0, recipientCoinPublicKey: RECIPIENT, issuerSecret: SECRET })).toThrow(/positive/);
        const contract = new mod.Contract(tokenFactoryWitnesses(() => ({})));
        const ctx = rt.createCircuitContext(f.address, { bytes: new Uint8Array(32).fill(1) },
            contract.initialState(rt.createConstructorContext(undefined, { bytes: new Uint8Array(32).fill(1) })).currentContractState, undefined);
        expect(failing(() => contract.circuits.mint(ctx, tokenName('X'), 1n, { bytes: Buffer.from(RECIPIENT, 'hex') }))).toMatch(/issuer secret/);
    });

    test('burn lowers the supply and refuses foreign or oversized coins', async () => {
        const f = localFactory();
        const issuer = issuerKeyOf(mod.pureCircuits, SECRET);
        const domain = domainOf(mod.pureCircuits, issuer, 'CREDIT');
        f.mint(SECRET, 'CREDIT', 100n);
        const { type } = await tokenTypeOf(mod.pureCircuits, { issuerKey: issuer, name: 'CREDIT', contractAddress: f.address });
        const coin = (value: bigint, color: string = type) => ({ nonce: '44'.repeat(32), color, value });
        f.burn(domain, coin(40n));
        expect(f.ledger().tokens.lookup(Buffer.from(domain, 'hex')).supply).toBe(60n);
        expect(failing(() => f.burn(domain, coin(61n)))).toMatch(/burns more than circulates/);
        expect(failing(() => f.burn(domain, coin(1n, '55'.repeat(32))))).toMatch(/not of this token/);
        expect(failing(() => f.burn('66'.repeat(32), coin(1n)))).toMatch(/not a token of this factory/);
        expect(() => prepareBurn({ domain, coin: coin(0n) })).toThrow(/positive/);
    });
});
