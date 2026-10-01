/**
 * Canonical JSON, blake2b-256 vectors, value scaling and the salted content
 * root: stability, refoldable inclusion paths, empty leaves, order
 * sensitivity, the cross-root witness export. Pure circuits are faked with a
 * deterministic stand-in; the real leafHash/nodeHash parity is pinned by the
 * circuit tests.
 */
import { describe, it, expect } from 'vitest';
import { sha256 } from '@noble/hashes/sha256';
import { blake2b } from '@noble/hashes/blake2b';
import { bytesToHex } from '@noble/hashes/utils';
import {
    sortKeys,
    canonicalize,
    blake2b256Hex,
    fieldKeyHex,
    scaleFieldValue,
    buildDocumentContentRoot,
    computeSchemaId,
    type PureCircuits
} from '@odatano/contract-kit';

/** Deterministic fake pure circuits: tagged sha256 concatenations. */
const fakeEmptyLeafKey = new Uint8Array(32);
fakeEmptyLeafKey.set(new TextEncoder().encode('nightgate/empty-leaf/v2'));
const fakePure: PureCircuits = {
    leafHash: (k, v, s) => sha256(Buffer.concat([Buffer.from('leaf'), Buffer.from(k), Buffer.from(v.toString()), Buffer.from(s)])),
    nodeHash: (l, r) => sha256(Buffer.concat([Buffer.from('node'), Buffer.from(l), Buffer.from(r)])),
    bytesLeafHash: (k, d, s) => sha256(Buffer.concat([Buffer.from('bytesleaf'), Buffer.from(k), Buffer.from(d), Buffer.from(s)])),
    absentLeafHash: (k, s) => sha256(Buffer.concat([Buffer.from('absentleaf'), Buffer.from(k), Buffer.from(s)])),
    setLeafHash: (d) => sha256(Buffer.concat([Buffer.from('setleaf'), Buffer.from(d)])),
    descriptorLeafHash: (k, kind, scale) => sha256(Buffer.concat([Buffer.from('descleaf'), Buffer.from(k), Buffer.from(`${kind}|${scale}`)])),
    slotSalt: (seed, i) => sha256(Buffer.concat([Buffer.from('slotsalt'), Buffer.from(seed), Buffer.from(i.toString())])),
    emptyLeafKey: () => fakeEmptyLeafKey
};
const SEED = new Uint8Array(32).fill(0x5a);

function refold(leafHex: string, siblings: string[], dirs: boolean[]): string {
    let node = Buffer.from(leafHex, 'hex') as Uint8Array;
    for (let d = 0; d < siblings.length; d++) {
        const sib = Buffer.from(siblings[d], 'hex');
        node = dirs[d] ? fakePure.nodeHash(node, sib) : fakePure.nodeHash(sib, node);
    }
    return Buffer.from(node).toString('hex');
}

describe('canonicalization + hashing', () => {
    it('hashes equal regardless of key order, including nested objects', () => {
        const a = { b: 1, a: { y: 2, x: [{ q: 1, p: 2 }] } };
        const b = { a: { x: [{ p: 2, q: 1 }], y: 2 }, b: 1 };
        expect(canonicalize(a)).toBe(canonicalize(b));
        expect(blake2b256Hex(canonicalize(a))).toBe(blake2b256Hex(canonicalize(b)));
    });

    it('canonicalize follows RFC 8785 member order for integer-like keys', () => {
        // A JS object enumerates 9 before 10 whatever the insertion order;
        // the canonical form sorts by code units, so "10" precedes "9".
        expect(canonicalize({ 9: 1, 10: 2, b: 3, a: { 2: 1, 10: 0 } })).toBe('{"10":2,"9":1,"a":{"10":0,"2":1},"b":3}');
        expect(canonicalize({ b: [undefined, 1], u: undefined })).toBe('{"b":[null,1]}');
        expect(canonicalize('x')).toBe('"x"');
        expect(canonicalize(null)).toBe('null');
    });

    it('sortKeys leaves arrays in order (order is data, not noise)', () => {
        expect(sortKeys({ a: [3, 1, 2] })).toEqual({ a: [3, 1, 2] });
    });

    it('blake2b256Hex matches an independent blake2b-256 computation', () => {
        const input = 'nightgate-vector';
        expect(blake2b256Hex(input)).toBe(bytesToHex(blake2b(Buffer.from(input, 'utf8'), { dkLen: 32 })));
    });

    it('fieldKeyHex is the blake2b-256 of the field path', () => {
        expect(fieldKeyHex('expiryDays')).toBe(blake2b256Hex('expiryDays'));
    });
});

describe('scaleFieldValue', () => {
    it('scales decimals by the given scale with rounding', () => {
        expect(scaleFieldValue(1234.5678, 1000, 'f')).toBe(1234568n);
        expect(scaleFieldValue('2.5', 100, 'f')).toBe(250n);
    });

    it('takes the exact BigInt path for digit-strings (beyond 2^53)', () => {
        expect(scaleFieldValue('18446744073709551615', 1, 'f')).toBe(18446744073709551615n);
    });

    it('trims strings and rejects blank ones instead of minting 0', () => {
        expect(scaleFieldValue(' 42 ', 1, 'f')).toBe(42n); // trimmed digit-string stays exact
        expect(() => scaleFieldValue('   ', 1000, 'f')).toThrow(/blank/);
        expect(() => scaleFieldValue('', 1000, 'f')).toThrow(/blank/);
    });

    it('rejects booleans instead of coercing them to 0/1', () => {
        expect(() => scaleFieldValue(true as any, 1000, 'f')).toThrow(/number or numeric string/);
        expect(() => scaleFieldValue(false as any, 1000, 'f')).toThrow(/number or numeric string/);
        expect(() => buildDocumentContentRoot({ active: true }, [{ field: 'active' }], fakePure, SEED))
            .toThrow(/number or numeric string/);
    });

    it('rejects negatives, non-numerics, Uint<64> overflow and unsafe scaling', () => {
        expect(() => scaleFieldValue(-1, 1000, 'f')).toThrow(/non-negative/);
        expect(() => scaleFieldValue('abc', 1000, 'f')).toThrow(/numeric/);
        expect(() => scaleFieldValue('18446744073709551615', 2, 'f')).toThrow(/Uint<64>/);
        expect(() => scaleFieldValue(Number.MAX_SAFE_INTEGER, 1000, 'f')).toThrow(/MAX_SAFE_INTEGER/);
    });
});

describe('buildDocumentContentRoot', () => {
    const doc = { price: 42.5, days: '30', note: 'not provable' };
    const specs = [{ field: 'price' }, { field: 'days', scale: 1 }];

    it('produces a stable root and refoldable inclusion paths', () => {
        const a = buildDocumentContentRoot(doc, specs, fakePure, SEED);
        const b = buildDocumentContentRoot(doc, specs, fakePure, SEED);
        expect(a.contentRoot).toBe(b.contentRoot);
        expect(a.fields).toHaveLength(2);
        expect(a.fields[0]).toMatchObject({ field: 'price', value: '42500', fieldKey: fieldKeyHex('price') });
        expect(a.fields[1]).toMatchObject({ field: 'days', value: '30' });
        for (const f of a.fields) {
            const leaf = Buffer.from(
                fakePure.leafHash(Buffer.from(f.fieldKey, 'hex'), BigInt(f.value!), Buffer.from(f.salt, 'hex'))
            ).toString('hex');
            expect(refold(leaf, f.siblings, f.dirs)).toBe(a.contentRoot);
            expect(f.siblings).toHaveLength(4);
            expect(f.dirs).toHaveLength(4);
        }
    });

    it('mixes uint and bytes leaves in one refoldable tree', () => {
        const mixed = { chemistry: 'NMC811', capacity: 4200 };
        const result = buildDocumentContentRoot(mixed, [
            { field: 'chemistry', kind: 'bytes' }, { field: 'capacity' }
        ], fakePure, SEED);
        expect(result.fields).toHaveLength(2);
        const [chem, cap] = result.fields;
        expect(chem).toMatchObject({ field: 'chemistry', kind: 'bytes', valueDigest: blake2b256Hex('NMC811') });
        expect(chem.value).toBeUndefined();
        expect(cap).toMatchObject({ field: 'capacity', kind: 'uint', value: '4200000' });
        expect(cap.valueDigest).toBeUndefined();
        const chemLeaf = Buffer.from(fakePure.bytesLeafHash(
            Buffer.from(chem.fieldKey, 'hex'), Buffer.from(chem.valueDigest!, 'hex'), Buffer.from(chem.salt, 'hex')
        )).toString('hex');
        expect(refold(chemLeaf, chem.siblings, chem.dirs)).toBe(result.contentRoot);
        const capLeaf = Buffer.from(fakePure.leafHash(
            Buffer.from(cap.fieldKey, 'hex'), BigInt(cap.value!), Buffer.from(cap.salt, 'hex')
        )).toString('hex');
        expect(refold(capLeaf, cap.siblings, cap.dirs)).toBe(result.contentRoot);
    });

    it('digests the EXACT string for bytes fields (no trimming)', () => {
        const padded = buildDocumentContentRoot({ s: ' x ' }, [{ field: 's', kind: 'bytes' }], fakePure, SEED);
        expect(padded.fields[0].valueDigest).toBe(blake2b256Hex(' x '));
        expect(padded.fields[0].valueDigest).not.toBe(blake2b256Hex('x'));
    });

    it('rejects non-string values for bytes fields; blanks stay empty leaves', () => {
        expect(() => buildDocumentContentRoot({ n: 42 }, [{ field: 'n', kind: 'bytes' }], fakePure, SEED))
            .toThrow(/requires a string/);
        const blank = buildDocumentContentRoot({ s: '   ' }, [{ field: 's', kind: 'bytes' }], fakePure, SEED);
        expect(blank.fields).toEqual([]);
        expect(blank.emptyFields).toEqual(['s']);
    });

    it('keeps numeric-only roots identical whether kind is omitted or explicit', () => {
        const implicit = buildDocumentContentRoot(doc, specs, fakePure, SEED);
        const explicit = buildDocumentContentRoot(doc, [
            { field: 'price', kind: 'uint' }, { field: 'days', kind: 'uint', scale: 1 }
        ], fakePure, SEED);
        expect(explicit.contentRoot).toBe(implicit.contentRoot);
    });

    it('is order-sensitive: the field list order is part of the tree identity', () => {
        const swapped = buildDocumentContentRoot(doc, [specs[1], specs[0]], fakePure, SEED);
        const original = buildDocumentContentRoot(doc, specs, fakePure, SEED);
        expect(swapped.contentRoot).not.toBe(original.contentRoot);
    });

    it('puts absent values on the empty leaf and reports them', () => {
        const result = buildDocumentContentRoot({ price: 1 }, [{ field: 'price' }, { field: 'missing' }], fakePure, SEED);
        expect(result.fields.map(f => f.field)).toEqual(['price']);
        expect(result.emptyFields).toEqual(['missing']);
    });

    it('treats whitespace-only strings as absent, not as value 0', () => {
        const result = buildDocumentContentRoot({ price: '   ' }, [{ field: 'price' }], fakePure, SEED);
        expect(result.fields).toEqual([]);
        expect(result.emptyFields).toEqual(['price']);
        const zero = buildDocumentContentRoot({ price: 0 }, [{ field: 'price' }], fakePure, SEED);
        expect(result.contentRoot).not.toBe(zero.contentRoot); // blank must not alias a real 0
    });

    it('resolves dot-paths into nested objects and arrays', () => {
        const nested = { invoice: { total: 99.5, lines: [{ amount: 12 }] } };
        const result = buildDocumentContentRoot(nested, [
            { field: 'invoice.total' }, { field: 'invoice.lines.0.amount' }
        ], fakePure, SEED);
        expect(result.fields.map(f => f.field)).toEqual(['invoice.total', 'invoice.lines.0.amount']);
        expect(result.fields[0].value).toBe('99500');
        expect(result.fields[1].value).toBe('12000');
        expect(result.emptyFields).toEqual([]);
    });

    it('prefers a literal top-level key over path descent', () => {
        const doc = { 'a.b': 7, a: { b: 1 } };
        const result = buildDocumentContentRoot(doc, [{ field: 'a.b' }], fakePure, SEED);
        expect(result.fields[0].value).toBe('7000');
    });

    it('throws when a path resolves to an object instead of a scalar', () => {
        expect(() => buildDocumentContentRoot({ invoice: { total: 1 } }, [{ field: 'invoice' }], fakePure, SEED))
            .toThrow(/object\/array/);
    });
});

describe('buildDocumentContentRoot: cross-root witness export (salted openings)', () => {
    const doc = { chemistry: 'NMC811', capacity: 4200 };
    const specs = [{ field: 'chemistry', kind: 'bytes' as const }, { field: 'capacity' }];

    it('exports the full 16-entry SALTED leaf layer in slot order, folding to the root', () => {
        const built = buildDocumentContentRoot(doc, specs, fakePure, SEED);
        expect(built.leaves).toHaveLength(16);
        // Padding slots are salted absent leaves under the empty-leaf key.
        for (let i = 2; i < 16; i++) {
            expect(built.leaves[i]).toBe(Buffer.from(
                fakePure.absentLeafHash(fakeEmptyLeafKey, fakePure.slotSalt(SEED, BigInt(i)))
            ).toString('hex'));
        }
        // The exported layer folds to the exported root (independent refold).
        let level = built.leaves.map(l => Buffer.from(l, 'hex') as Uint8Array);
        while (level.length > 1) {
            const next: Uint8Array[] = [];
            for (let i = 0; i < level.length; i += 2) next.push(fakePure.nodeHash(level[i], level[i + 1]));
            level = next;
        }
        expect(Buffer.from(level[0]).toString('hex')).toBe(built.contentRoot);
    });

    it('the root is salt-dependent: same values under a different seed -> different root and leaves', () => {
        const a = buildDocumentContentRoot(doc, specs, fakePure, SEED);
        const b = buildDocumentContentRoot(doc, specs, fakePure, new Uint8Array(32).fill(0x77));
        expect(b.contentRoot).not.toBe(a.contentRoot);
        expect(b.leaves[0]).not.toBe(a.leaves[0]);
        // Absent/padding slots differ too: presence is not leaked by leaf equality.
        expect(b.leaves[15]).not.toBe(a.leaves[15]);
    });

    it('a field with an absent value occupies the SALTED absent leaf, matching emptyFields', () => {
        const built = buildDocumentContentRoot({ capacity: 1 }, [{ field: 'capacity' }, { field: 'missing' }], fakePure, SEED);
        expect(built.emptyFields).toEqual(['missing']);
        expect(built.leaves[1]).toBe(Buffer.from(
            fakePure.absentLeafHash(Buffer.from(fieldKeyHex('missing'), 'hex'), fakePure.slotSalt(SEED, 1n))
        ).toString('hex'));
    });

    it('exports the opening (seed + 16 slot openings) mirroring values and presence', () => {
        const built = buildDocumentContentRoot(doc, specs, fakePure, SEED);
        expect(built.opening.saltSeed).toBe(Buffer.from(SEED).toString('hex'));
        expect(built.opening.slots).toHaveLength(16);
        expect(built.opening.slots[0]).toEqual({ present: true, valueDigest: blake2b256Hex('NMC811') });
        expect(built.opening.slots[1]).toEqual({ present: true, value: '4200000' });
        for (let i = 2; i < 16; i++) expect(built.opening.slots[i]).toEqual({ present: false });
    });

    it('schemaId is the descriptor-tree root, independent of values and presence', () => {
        const a = buildDocumentContentRoot(doc, specs, fakePure, SEED);
        // Same specs, different values / absent values / different seed -> SAME schemaId.
        const b = buildDocumentContentRoot({ chemistry: 'LFP' }, specs, fakePure, new Uint8Array(32).fill(1));
        expect(a.schemaId).toBe(b.schemaId);
        expect(a.schemaId).toBe(computeSchemaId(specs, fakePure));
        // Reordered specs -> different schemaId (order is part of the schema).
        expect(computeSchemaId([specs[1], specs[0]], fakePure)).not.toBe(a.schemaId);
        // The rule: fold of descriptorLeafHash(fieldKey, kind, scale), padding
        // slots as (emptyLeafKey, 2, 0). Independent recompute:
        let level = [
            fakePure.descriptorLeafHash(Buffer.from(fieldKeyHex('chemistry'), 'hex'), 1n, 0n),
            fakePure.descriptorLeafHash(Buffer.from(fieldKeyHex('capacity'), 'hex'), 0n, 1000n),
            ...Array.from({ length: 14 }, () => fakePure.descriptorLeafHash(fakeEmptyLeafKey, 2n, 0n))
        ];
        while (level.length > 1) {
            const next: Uint8Array[] = [];
            for (let i = 0; i < level.length; i += 2) next.push(fakePure.nodeHash(level[i], level[i + 1]));
            level = next;
        }
        expect(a.schemaId).toBe(Buffer.from(level[0]).toString('hex'));
        // The descriptor list itself is exported (the shared cross-root witness).
        expect(a.schema[0]).toEqual({ fieldKey: fieldKeyHex('chemistry'), kind: 1, scale: '0' });
        expect(a.schema[1]).toEqual({ fieldKey: fieldKeyHex('capacity'), kind: 0, scale: '1000' });
        expect(a.schema[15]).toEqual({ fieldKey: Buffer.from(fakeEmptyLeafKey).toString('hex'), kind: 2, scale: '0' });
    });

    it('schemaId binds kind and scale: a reinterpretation is a DIFFERENT schema', () => {
        // x=1 at scale 1000 and x=1000 at scale 1 yield the SAME leaf value
        // (1000). Without kind/scale in the schema id, a
        // mask-0 integrity proof between them would claim "unchanged" while
        // the raw values differ 1000x.
        const base = computeSchemaId([{ field: 'x' }], fakePure);
        expect(computeSchemaId([{ field: 'x', scale: 1 }], fakePure)).not.toBe(base);
        expect(computeSchemaId([{ field: 'x', kind: 'bytes' }], fakePure)).not.toBe(base);
        // Explicit default scale is the same schema as the implicit default.
        expect(computeSchemaId([{ field: 'x', scale: 1000 }], fakePure)).toBe(base);
    });
});

describe('empty-leaf key parity (kit constant vs contract constant)', () => {
    it('emptyLeafKeyBytes is "nightgate/empty-leaf/v2" ASCII zero-padded to 32 bytes', async () => {
        const { emptyLeafKeyBytes, emptyLeafKeyHex, EMPTY_LEAF_KEY_LABEL } = await import('@odatano/contract-kit');
        expect(EMPTY_LEAF_KEY_LABEL).toBe('nightgate/empty-leaf/v2');
        const bytes = emptyLeafKeyBytes();
        expect(bytes).toHaveLength(32);
        const expected = Buffer.concat([Buffer.from('nightgate/empty-leaf/v2', 'ascii'), Buffer.alloc(9)]);
        expect(Buffer.from(bytes).equals(expected)).toBe(true);
        expect(emptyLeafKeyHex()).toBe(expected.toString('hex'));
        // Byte parity with the REAL compiled circuit's pad(32, ...) constant is
        // asserted in attestation-vault.test.ts.
    });
});
