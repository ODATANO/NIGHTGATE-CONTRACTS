/**
 * Canonical JSON, field keys, value scaling and the salted content root of a
 * document over the vault's pure circuits. The circuits recompute the same
 * trees in-circuit, so every rule here is pinned by the circuit tests.
 */

import { bytesToHex } from './hex.js';
import { blake2b256Hex, fromHex32, emptyLeafKeyHex } from './hashing.js';

// Default 16-slot dimensions; the tree builders take an optional width.
export const MERKLE_DEPTH = 4;
export const MAX_PROOF_FIELDS = 1 << MERKLE_DEPTH; // 16

export const DEFAULT_VALUE_SCALE = 1000;
const UINT64_MAX = 18446744073709551615n;

// ---- Canonical JSON + hashing ---------------------------------------------

/**
 * Recursively sort object keys. Not a hash input: JS objects enumerate
 * integer-like keys numerically, so hashing uses `canonicalize`.
 */
export function sortKeys(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.keys(value as Record<string, unknown>).sort()
                .map(k => [k, sortKeys((value as Record<string, unknown>)[k])])
        );
    }
    return value;
}

/**
 * Canonical JSON: RFC 8785 member order (UTF-16 code units, integer-like keys
 * included), JSON.stringify number/string forms and undefined handling.
 */
export function canonicalize(value: unknown): string {
    if (value === null || typeof value !== 'object') {
        const s = JSON.stringify(value);
        return s === undefined ? 'null' : s;
    }
    if (Array.isArray(value)) return '[' + value.map(v => canonicalize(v === undefined ? null : v)).join(',') + ']';
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).filter(k => obj[k] !== undefined && typeof obj[k] !== 'function').sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') + '}';
}

/** fieldKey = blake2b-256 of the field path. */
export function fieldKeyHex(fieldPath: string): string {
    return blake2b256Hex(fieldPath);
}

// ---- Value scaling --------------------------------------------------------

/**
 * Scale a raw value to the circuit's Uint<64>. Integer digit-strings take an
 * exact BigInt path; everything else Number x scale with a safe-integer guard.
 */
export function scaleFieldValue(raw: number | string, scale: number, label: string): bigint {
    // Number(true), Number([]) and Number('   ') would mint proof values.
    if (typeof raw !== 'number' && typeof raw !== 'string') {
        throw new Error(`${label}: value must be a number or numeric string`);
    }
    if (typeof raw === 'string') {
        raw = raw.trim();
        if (raw === '') throw new Error(`${label}: value must not be blank`);
        // Number() also parses hex and exponent forms.
        if (!/^\d+(\.\d+)?$/.test(raw)) throw new Error(`${label}: numeric strings must be decimal digits with an optional fraction`);
    }
    if (typeof raw === 'string' && /^\d+$/.test(raw)) {
        const scaled = BigInt(raw) * BigInt(scale);
        if (scaled > UINT64_MAX) throw new Error(`${label}: scaled value exceeds Uint<64>`);
        return scaled;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error(`${label}: value must be numeric`);
    if (n < 0) throw new Error(`${label}: value must be non-negative (predicates compare Uint<64>)`);
    const scaled = Math.round(n * scale);
    if (!Number.isSafeInteger(scaled)) {
        throw new Error(`${label}: scaled value exceeds Number.MAX_SAFE_INTEGER; pass an integer digit-string with scale 1`);
    }
    return BigInt(scaled);
}

// ---- Content-root Merkle tree ---------------------------------------------

export interface PureCircuits {
    /** Salted uint leaf: hash of FieldLeaf{field_key, value, salt}. */
    leafHash(fieldKey: Uint8Array, value: bigint, salt: Uint8Array): Uint8Array;
    nodeHash(left: Uint8Array, right: Uint8Array): Uint8Array;
    /** Salted bytes leaf: hash of BytesLeaf{field_key, value_digest, salt}. */
    bytesLeafHash(fieldKey: Uint8Array, valueDigest: Uint8Array, salt: Uint8Array): Uint8Array;
    /** Salted absent-slot leaf: hash of AbsentLeaf{field_key, salt}. */
    absentLeafHash(fieldKey: Uint8Array, salt: Uint8Array): Uint8Array;
    /** Membership-set leaf (unsalted; the allow-list is public). */
    setLeafHash(valueDigest: Uint8Array): Uint8Array;
    /** Schema-descriptor leaf: hash of SlotDescriptor{field_key, kind, scale}. */
    descriptorLeafHash(fieldKey: Uint8Array, kind: bigint, scale: bigint): Uint8Array;
    slotSalt(seed: Uint8Array, index: bigint): Uint8Array;
    /** Canonical padding-slot key ("nightgate/empty-leaf/v2" zero-padded). */
    emptyLeafKey(): Uint8Array;
}

/** Every pure circuit the content-root builder calls, or null when one is missing. */
export function missingPureCircuits(pure: unknown): string[] {
    const p = pure as Record<string, unknown> | null | undefined;
    return ['leafHash', 'nodeHash', 'bytesLeafHash', 'absentLeafHash', 'setLeafHash', 'descriptorLeafHash', 'slotSalt', 'emptyLeafKey']
        .filter(name => typeof p?.[name] !== 'function');
}

export interface ProofFieldSpec {
    /** Field path; also the public label the fieldKey hashes. */
    field: string;
    /** 'uint' (default): scaled Uint<64>. 'bytes': blake2b-256 of the exact, untrimmed string. */
    kind?: 'uint' | 'bytes';
    /** Default 1000 (milli-units); 'uint' only. */
    scale?: number;
}

/** A literal top-level key wins (dotted keys stay addressable); otherwise dots descend. */
export function resolveFieldValue(document: Record<string, unknown>, fieldPath: string): unknown {
    if (Object.prototype.hasOwnProperty.call(document, fieldPath)) return document[fieldPath];
    let cur: unknown = document;
    for (const seg of fieldPath.split('.')) {
        // Own properties only: no resolution through the prototype chain.
        if (cur === null || typeof cur !== 'object' || !Object.prototype.hasOwnProperty.call(cur, seg)) return undefined;
        cur = (cur as Record<string, unknown>)[seg];
    }
    return cur;
}

export interface PreparedField {
    field: string;
    fieldKey: string;     // 64 hex
    kind: 'uint' | 'bytes';
    /** kind 'uint': scaled Uint<64>, decimal (witness material). */
    value?: string;
    /** kind 'bytes': 64 hex. */
    valueDigest?: string;
    /** 64 hex, witness material. */
    salt: string;
    siblings: string[];   // log2(width) x 64 hex
    dirs: boolean[];      // log2(width) booleans (true = node is LEFT child)
}

/** One slot of the shared schema, wire form. kind: 0 = uint, 1 = bytes, 2 = padding. */
export interface SchemaDescriptorWire {
    fieldKey: string;     // 64 hex
    kind: 0 | 1 | 2;
    scale: string;        // decimal Uint<64>; '0' for bytes/padding slots
}

/** One document's opening of one slot (witness material). */
export interface SlotOpeningWire {
    present: boolean;
    /** kind 0: scaled Uint<64>, decimal. */
    value?: string;
    /** kind 1: 64 hex. */
    valueDigest?: string;
}

/** A document's full cross-root opening (witness material). */
export interface DocumentOpeningWire {
    saltSeed: string;             // 64 hex
    slots: SlotOpeningWire[];     // one per slot, slot order
}

/**
 * Slot descriptors follow the spec regardless of the document's values; slots
 * past the list are padding: empty-leaf key, kind 2, scale 0.
 */
export function computeSchemaDescriptors(specs: ProofFieldSpec[], width: number = MAX_PROOF_FIELDS): SchemaDescriptorWire[] {
    const out: SchemaDescriptorWire[] = [];
    for (let i = 0; i < width; i++) {
        const spec = i < specs.length ? specs[i] : undefined;
        if (!spec) {
            out.push({ fieldKey: emptyLeafKeyHex(), kind: 2, scale: '0' });
        } else if (spec.kind === 'bytes') {
            out.push({ fieldKey: fieldKeyHex(spec.field), kind: 1, scale: '0' });
        } else {
            out.push({ fieldKey: fieldKeyHex(spec.field), kind: 0, scale: String(spec.scale ?? DEFAULT_VALUE_SCALE) });
        }
    }
    return out;
}

/**
 * Schema id = Merkle root over the descriptor leaves. Kind and scale are bound
 * so numerically colliding leaves (x=1 at scale 1000 vs 1000 at scale 1) differ.
 */
export function computeSchemaId(specs: ProofFieldSpec[], pure: PureCircuits, width: number = MAX_PROOF_FIELDS): string {
    const descriptors = computeSchemaDescriptors(specs, width);
    let level = descriptors.map(d =>
        pure.descriptorLeafHash(fromHex32(d.fieldKey), BigInt(d.kind), BigInt(d.scale)));
    while (level.length > 1) {
        const next: Uint8Array[] = [];
        for (let i = 0; i < level.length; i += 2) next.push(pure.nodeHash(level[i], level[i + 1]));
        level = next;
    }
    return bytesToHex(level[0]);
}

export interface BuiltContentRoot {
    contentRoot: string;
    schemaId: string;
    schema: SchemaDescriptorWire[];
    fields: PreparedField[];
    emptyFields: string[];
    /** Salted leaf hashes in slot order (informational). */
    leaves: string[];
    opening: DocumentOpeningWire;
}

/**
 * Salted content root; leaf index = position in `specs`, so the order must stay
 * stable. Blank values take the salted absent leaf. Only the same seed reproduces the root.
 */
export function buildDocumentContentRoot(
    document: Record<string, unknown>,
    specs: ProofFieldSpec[],
    pure: PureCircuits,
    saltSeed: Uint8Array,
    width: number = MAX_PROOF_FIELDS
): BuiltContentRoot {
    if (!(saltSeed instanceof Uint8Array) || saltSeed.length !== 32) {
        throw new Error('saltSeed must be 32 bytes');
    }
    const depth = Math.log2(width);
    const schema = computeSchemaDescriptors(specs, width);
    type LeafValue = { kind: 'uint'; scaled: bigint } | { kind: 'bytes'; digest: string } | null;
    const leaves: Uint8Array[] = [];
    const salts: Uint8Array[] = [];
    const leafValues: LeafValue[] = [];
    for (let i = 0; i < width; i++) {
        const spec = specs[i];
        const salt = pure.slotSalt(saltSeed, BigInt(i));
        salts.push(salt);
        const raw = spec ? (resolveFieldValue(document, spec.field) as number | string | null | undefined) : undefined;
        if (raw !== null && raw !== undefined && typeof raw === 'object') {
            throw new Error(`proofFields[${i}] (${spec!.field}): path resolves to an object/array, not a scalar`);
        }
        const isBlank = raw === null || raw === undefined
            || (typeof raw === 'string' && raw.trim() === '');
        if (spec && !isBlank) {
            if (spec.kind === 'bytes') {
                // Untrimmed: verifiers recompute from the raw document.
                if (typeof raw !== 'string') {
                    throw new Error(`proofFields[${i}] (${spec.field}): kind 'bytes' requires a string value`);
                }
                const digest = blake2b256Hex(raw);
                leafValues.push({ kind: 'bytes', digest });
                leaves.push(pure.bytesLeafHash(fromHex32(fieldKeyHex(spec.field)), fromHex32(digest), salt));
            } else {
                const scaled = scaleFieldValue(raw, spec.scale ?? DEFAULT_VALUE_SCALE, `proofFields[${i}] (${spec.field})`);
                leafValues.push({ kind: 'uint', scaled });
                leaves.push(pure.leafHash(fromHex32(fieldKeyHex(spec.field)), scaled, salt));
            }
        } else {
            leafValues.push(null);
            // Salted so a shared leaf layer does not reveal the presence pattern.
            leaves.push(pure.absentLeafHash(fromHex32(schema[i].fieldKey), salt));
        }
    }

    const levels: Uint8Array[][] = [leaves];
    for (let d = 0; d < depth; d++) {
        const prev = levels[d];
        const next: Uint8Array[] = [];
        for (let i = 0; i < prev.length; i += 2) next.push(pure.nodeHash(prev[i], prev[i + 1]));
        levels.push(next);
    }
    const contentRoot = bytesToHex(levels[depth][0]);

    const fields: PreparedField[] = [];
    const emptyFields: string[] = [];
    specs.forEach((spec, idx) => {
        const leafValue = leafValues[idx];
        if (leafValue === null) { emptyFields.push(spec.field); return; }
        const siblings: string[] = [];
        const dirs: boolean[] = [];
        let node = idx;
        for (let d = 0; d < depth; d++) {
            const isLeft = node % 2 === 0;
            siblings.push(bytesToHex(levels[d][isLeft ? node + 1 : node - 1]));
            dirs.push(isLeft);
            node = Math.floor(node / 2);
        }
        const base = {
            field: spec.field, fieldKey: fieldKeyHex(spec.field),
            salt: bytesToHex(salts[idx]), siblings, dirs
        };
        fields.push(leafValue.kind === 'bytes'
            ? { ...base, kind: 'bytes', valueDigest: leafValue.digest }
            : { ...base, kind: 'uint', value: leafValue.scaled.toString() });
    });

    const opening: DocumentOpeningWire = {
        saltSeed: bytesToHex(saltSeed),
        slots: leafValues.map(lv => lv === null
            ? { present: false }
            : lv.kind === 'bytes'
                ? { present: true, valueDigest: lv.digest }
                : { present: true, value: lv.scaled.toString() })
    };

    return {
        contentRoot, schemaId: computeSchemaId(specs, pure, width), schema,
        fields, emptyFields, leaves: leaves.map(bytesToHex), opening
    };
}
