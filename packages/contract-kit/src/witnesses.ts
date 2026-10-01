/**
 * The one implementation of the vault witness builder and the attester-secret
 * derivation: server, browser bundle and txbuilder decode proof bundles with
 * this code. No Node built-ins; hashing via @noble/hashes, sealing via WebCrypto.
 *
 * The vault has no contract private state; attester identity = HMAC over
 * secret material. A signature over a fixed public message is never the
 * secret: it is shareable evidence, and any dApp able to request it could
 * reproduce the attester identity.
 */

import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { hexToBytes, hexToBytes32, bytesToHex } from './hex.js';

const ATTESTATION_VAULT_LABEL = 'nightgate/attestation-vault/v1';

/** One slot of the shared schema (kind: 0 = uint, 1 = bytes, 2 = padding). */
export interface SchemaDescriptor {
    fieldKey: string;
    kind: number;
    scale: string;
}

/** One document's opening of one slot (witness material). */
export interface SlotOpening {
    present: boolean;
    value?: string;
    valueDigest?: string;
}

/** A document's full cross-root opening (witness material; store the seed). */
export interface DocumentOpening {
    saltSeed: string;
    slots: SlotOpening[];
}

/**
 * Cross-root proof material: the shared descriptor list plus both documents'
 * full openings. The circuit recomputes schema root and both content roots
 * from these, so nothing here is trusted, only proven against the anchors.
 */
export interface DocPair {
    schema?: SchemaDescriptor[];
    openingA?: DocumentOpening;
    openingB?: DocumentOpening;
}

/**
 * Per-call proof bundle for the field-bound proof circuits (content path of
 * log2(slotWidth) steps; depth-6 set path for membership). `fieldValue` feeds
 * proveFieldPredicate, `fieldDigest` + `setProof` feed proveFieldMembership;
 * proveFieldEquality needs only siblings/dirs; the cross-root circuit needs
 * only `docPair` (and `siblings`/`dirs` may then be omitted).
 */
export interface MerkleProof {
    /** Decimal string of the scaled Uint<64> field value (proveFieldPredicate). */
    fieldValue?: string;
    /** 64-char hex per-slot salt (every single-field proof circuit). */
    fieldSalt?: string;
    /** 64-char hex digest of the field's value bytes (proveFieldMembership). */
    fieldDigest?: string;
    /** log2(slotWidth) sibling digests along the content-root path. Optional when `docPair` is present. */
    siblings?: string[];
    /** log2(slotWidth) booleans, true = current node is the LEFT child. Optional when `docPair` is present. */
    dirs?: boolean[];
    /** Membership-set path (proveFieldMembership): 6 siblings + 6 booleans. */
    setProof?: { siblings: string[]; dirs: boolean[] };
    /** Cross-root material (proveDocumentComparison, both modes). */
    docPair?: DocPair;
}

/**
 * Batch mode: one witness object serving N proof calls in one transaction
 * scope. The proof is read at witness invocation time, so the batch loop swaps
 * `current` immediately before each call.
 */
export interface MerkleProofHolder {
    /** The proof for the call about to run. A witness invoked with this unset throws by name. */
    current?: MerkleProof;
}

export interface BuildWitnessesInput {
    /**
     * 32-byte attester secret. Optional: the proof circuits never invoke
     * local_secret_key, so a holder proving against an anchored root omits it;
     * only the owner-gated circuits resolve it, and the witness throws by name
     * when they do without one.
     */
    attestationSecret?: Uint8Array;
    /** Single-call field-bound proof. Mutually exclusive with `merkleProofHolder`. */
    merkleProof?: MerkleProof;
    /** Batch field-bound proofs. Mutually exclusive with `merkleProof` (the builder throws). */
    merkleProofHolder?: MerkleProofHolder;
    /** Content-tree slot count of the target artifact: 16 (default) or 32. */
    slotWidth?: number;
}

export interface DecodedSchemaSlot { field_key: Uint8Array; kind: bigint; scale: bigint }
export interface DecodedOpeningSlot { present: boolean; uint_value: bigint; value_digest: Uint8Array }

/** Generated `Witnesses<PS>` shape for the AttestationVault contract. */
export interface AttestationVaultWitnesses<PS = unknown> {
    local_secret_key(ctx: { privateState: PS }): [PS, Uint8Array];
    field_value(ctx: { privateState: PS }): [PS, bigint];
    merkle_siblings(ctx: { privateState: PS }): [PS, Uint8Array[]];
    merkle_dirs(ctx: { privateState: PS }): [PS, boolean[]];
    field_digest(ctx: { privateState: PS }): [PS, Uint8Array];
    set_siblings(ctx: { privateState: PS }): [PS, Uint8Array[]];
    set_dirs(ctx: { privateState: PS }): [PS, boolean[]];
    field_salt(ctx: { privateState: PS }): [PS, Uint8Array];
    doc_schema(ctx: { privateState: PS }): [PS, DecodedSchemaSlot[]];
    doc_salt_a(ctx: { privateState: PS }): [PS, Uint8Array];
    doc_salt_b(ctx: { privateState: PS }): [PS, Uint8Array];
    doc_slots_a(ctx: { privateState: PS }): [PS, DecodedOpeningSlot[]];
    doc_slots_b(ctx: { privateState: PS }): [PS, DecodedOpeningSlot[]];
}

/** AES-256-GCM sealed attester-secret blob (hex members; JSON-serializable). */
export interface SealedAttestationSecret {
    v: 1;
    salt: string;
    iv: string;
    cipher: string;
}

/**
 * HMAC-SHA256(material, label) -> 32 bytes. The server feeds the wallet seed;
 * browser flows use a random secret, so cross-path identities coincide only
 * when the material is deliberately shared.
 */
export function deriveAttestationSecret(material: Uint8Array): Uint8Array {
    return hmac(sha256, material, new TextEncoder().encode(ATTESTATION_VAULT_LABEL));
}

const SEAL_INFO_LABEL = 'nightgate/attestation-secret-seal/v1';

/** Fresh random 32-byte attester secret (CSPRNG): `attester_id = persistentHash(secret)`. Generate once per wallet, seal, store. */
export function generateAttestationSecret(): Uint8Array {
    const secret = new Uint8Array(32);
    globalThis.crypto.getRandomValues(secret);
    return secret;
}

async function sealKeyFor(unlockMaterial: Uint8Array, salt: Uint8Array, usage: 'encrypt' | 'decrypt'): Promise<CryptoKey> {
    if (!(unlockMaterial instanceof Uint8Array) || unlockMaterial.length === 0) {
        throw new Error('unlockMaterial must be a non-empty Uint8Array');
    }
    const subtle = globalThis.crypto.subtle;
    const ikm = await subtle.importKey('raw', unlockMaterial as BufferSource, 'HKDF', false, ['deriveKey']);
    return subtle.deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: new TextEncoder().encode(SEAL_INFO_LABEL) as BufferSource },
        ikm,
        { name: 'AES-GCM', length: 256 },
        false,
        [usage]
    );
}

/**
 * Seal the attester secret under arbitrary unlock material (AES-256-GCM, HKDF
 * key). A wallet signature may serve as unlock material: it only decrypts a
 * ciphertext this dApp holds in its own origin storage.
 */
export async function sealAttestationSecret(secret: Uint8Array, unlockMaterial: Uint8Array): Promise<SealedAttestationSecret> {
    if (!(secret instanceof Uint8Array) || secret.length !== 32) {
        throw new Error('secret must be a 32-byte Uint8Array');
    }
    const salt = new Uint8Array(32);
    const iv = new Uint8Array(12);
    globalThis.crypto.getRandomValues(salt);
    globalThis.crypto.getRandomValues(iv);
    const key = await sealKeyFor(unlockMaterial, salt, 'encrypt');
    const cipher = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, secret as BufferSource));
    return { v: 1, salt: bytesToHex(salt), iv: bytesToHex(iv), cipher: bytesToHex(cipher) };
}

/** Reopen a sealed attester secret; throws on wrong unlock material or a tampered blob. */
export async function openAttestationSecret(sealed: SealedAttestationSecret, unlockMaterial: Uint8Array): Promise<Uint8Array> {
    if (!sealed || sealed.v !== 1 || !sealed.salt || !sealed.iv || !sealed.cipher) {
        throw new Error('sealed must be a { v: 1, salt, iv, cipher } blob from sealAttestationSecret');
    }
    const key = await sealKeyFor(unlockMaterial, hexToBytes(sealed.salt), 'decrypt');
    const secret = new Uint8Array(await globalThis.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: hexToBytes(sealed.iv) as BufferSource }, key, hexToBytes(sealed.cipher) as BufferSource));
    if (secret.length !== 32) throw new Error('sealed blob did not contain a 32-byte secret');
    return secret;
}

const SET_DEPTH = 6;
const SLOT_COUNT = 16;

const ZERO32 = new Uint8Array(32);

function decodeSchema(schema: SchemaDescriptor[] | undefined, label: string, slotCount: number): DecodedSchemaSlot[] | undefined {
    if (schema === undefined) return undefined;
    if (!Array.isArray(schema) || schema.length !== slotCount) {
        throw new Error(`${label} must have exactly ${slotCount} entries`);
    }
    return schema.map((d, i) => {
        const kind = BigInt(d.kind);
        if (kind < 0n || kind > 2n) throw new Error(`${label}[${i}].kind must be 0, 1 or 2`);
        return { field_key: hexToBytes32(d.fieldKey), kind, scale: BigInt(d.scale ?? '0') };
    });
}

function decodeOpening(opening: DocumentOpening | undefined, label: string, slotCount: number): { seed: Uint8Array; slots: DecodedOpeningSlot[] } | undefined {
    if (opening === undefined) return undefined;
    if (!Array.isArray(opening.slots) || opening.slots.length !== slotCount) {
        throw new Error(`${label}.slots must have exactly ${slotCount} entries`);
    }
    return {
        seed: hexToBytes32(opening.saltSeed),
        slots: opening.slots.map((s) => ({
            present: Boolean(s.present),
            uint_value: s.value !== undefined ? BigInt(s.value) : 0n,
            value_digest: s.valueDigest !== undefined ? hexToBytes32(s.valueDigest) : ZERO32
        }))
    };
}

interface DecodedProof {
    fieldValue?: bigint;
    fieldSalt?: Uint8Array;
    fieldDigest?: Uint8Array;
    siblings?: Uint8Array[];
    dirs?: boolean[];
    setSiblings?: Uint8Array[];
    setDirs?: boolean[];
    docSchema?: DecodedSchemaSlot[];
    docSaltA?: Uint8Array;
    docSaltB?: Uint8Array;
    docSlotsA?: DecodedOpeningSlot[];
    docSlotsB?: DecodedOpeningSlot[];
}

function decodeMerkleProof(proof: MerkleProof, slotCount: number): DecodedProof {
    const depth = Math.log2(slotCount);
    const fieldValue = proof.fieldValue !== undefined ? BigInt(proof.fieldValue) : undefined;
    const fieldSalt = proof.fieldSalt !== undefined ? hexToBytes32(proof.fieldSalt) : undefined;
    const fieldDigest = proof.fieldDigest !== undefined ? hexToBytes32(proof.fieldDigest) : undefined;
    // The inclusion path is required for the single-field circuits; a bundle
    // carrying only cross-root material may omit it.
    let siblings: Uint8Array[] | undefined;
    let dirs: boolean[] | undefined;
    if (proof.siblings !== undefined || proof.dirs !== undefined || !proof.docPair) {
        siblings = (proof.siblings || []).map((s) => hexToBytes32(s));
        dirs = (proof.dirs || []).map(Boolean);
        if (siblings.length !== depth || dirs.length !== depth) {
            throw new Error(`merkleProof.siblings and .dirs must each have ${depth} entries`);
        }
    }
    let setSiblings: Uint8Array[] | undefined;
    let setDirs: boolean[] | undefined;
    if (proof.setProof) {
        setSiblings = (proof.setProof.siblings || []).map((s) => hexToBytes32(s));
        setDirs = (proof.setProof.dirs || []).map(Boolean);
        if (setSiblings.length !== SET_DEPTH || setDirs.length !== SET_DEPTH) {
            throw new Error(`merkleProof.setProof.siblings and .dirs must each have ${SET_DEPTH} entries`);
        }
    }
    const docSchema = decodeSchema(proof.docPair?.schema, 'merkleProof.docPair.schema', slotCount);
    const openingA = decodeOpening(proof.docPair?.openingA, 'merkleProof.docPair.openingA', slotCount);
    const openingB = decodeOpening(proof.docPair?.openingB, 'merkleProof.docPair.openingB', slotCount);
    if (proof.docPair && (docSchema === undefined || openingA === undefined || openingB === undefined)) {
        throw new Error('merkleProof.docPair requires schema, openingA and openingB');
    }
    return {
        fieldValue, fieldSalt, fieldDigest, siblings, dirs, setSiblings, setDirs,
        docSchema, docSaltA: openingA?.seed, docSaltB: openingB?.seed,
        docSlotsA: openingA?.slots, docSlotsB: openingB?.slots
    };
}

/**
 * The AttestationVault witness object bound to a secret and an optional proof
 * bundle. Argument-less builds a fully lazy witness set: every witness throws
 * by name when invoked without its material, so a proof-less call is unaffected.
 */
export function buildAttestationVaultWitnesses<PS = unknown>(
    { attestationSecret, merkleProof, merkleProofHolder, slotWidth }: BuildWitnessesInput = {}
): AttestationVaultWitnesses<PS> {
    if (attestationSecret !== undefined
        && (!(attestationSecret instanceof Uint8Array) || attestationSecret.length !== 32)) {
        throw new Error('attestationSecret must be a 32-byte Uint8Array');
    }
    if (merkleProof && merkleProofHolder) {
        throw new Error('merkleProof and merkleProofHolder are mutually exclusive');
    }
    const slotCount = slotWidth ?? SLOT_COUNT;
    const staticProof = merkleProof ? decodeMerkleProof(merkleProof, slotCount) : undefined;
    const holder = merkleProofHolder;
    const currentProof = (witnessName: string): DecodedProof => {
        if (holder) {
            if (!holder.current) {
                throw new Error(`${witnessName} witness invoked with an empty batch proof holder; set holder.current before the call`);
            }
            return decodeMerkleProof(holder.current, slotCount);
        }
        if (staticProof === undefined) {
            throw new Error(`${witnessName} witness invoked without a merkleProof; the field-bound proof circuits require a proof bundle`);
        }
        return staticProof;
    };

    return {
        local_secret_key(ctx) {
            if (attestationSecret === undefined) {
                throw new Error('local_secret_key witness invoked without an attestationSecret; the owner-gated circuits require it (proof circuits do not)');
            }
            return [ctx.privateState, attestationSecret];
        },
        field_value(ctx) {
            const p = currentProof('field_value');
            if (p.fieldValue === undefined) {
                throw new Error('field_value witness invoked without a fieldValue; proveFieldPredicate requires a numeric proof bundle');
            }
            return [ctx.privateState, p.fieldValue];
        },
        merkle_siblings(ctx) {
            const p = currentProof('merkle_siblings');
            if (p.siblings === undefined) {
                throw new Error('merkle_siblings witness invoked without an inclusion path; the single-field proof circuits require siblings/dirs');
            }
            return [ctx.privateState, p.siblings];
        },
        merkle_dirs(ctx) {
            const p = currentProof('merkle_dirs');
            if (p.dirs === undefined) {
                throw new Error('merkle_dirs witness invoked without an inclusion path; the single-field proof circuits require siblings/dirs');
            }
            return [ctx.privateState, p.dirs];
        },
        field_digest(ctx) {
            const p = currentProof('field_digest');
            if (p.fieldDigest === undefined) {
                throw new Error('field_digest witness invoked without a fieldDigest; proveFieldMembership requires a bytes proof bundle');
            }
            return [ctx.privateState, p.fieldDigest];
        },
        set_siblings(ctx) {
            const p = currentProof('set_siblings');
            if (p.setSiblings === undefined) {
                throw new Error('set_siblings witness invoked without a setProof; proveFieldMembership requires the membership-set path');
            }
            return [ctx.privateState, p.setSiblings];
        },
        set_dirs(ctx) {
            const p = currentProof('set_dirs');
            if (p.setDirs === undefined) {
                throw new Error('set_dirs witness invoked without a setProof; proveFieldMembership requires the membership-set path');
            }
            return [ctx.privateState, p.setDirs];
        },
        field_salt(ctx) {
            const p = currentProof('field_salt');
            if (p.fieldSalt === undefined) {
                throw new Error('field_salt witness invoked without a fieldSalt; the single-field proof circuits require the slot salt (v4)');
            }
            return [ctx.privateState, p.fieldSalt];
        },
        doc_schema(ctx) {
            const p = currentProof('doc_schema');
            if (p.docSchema === undefined) {
                throw new Error('doc_schema witness invoked without docPair.schema; proveDocumentComparison requires the shared descriptor list');
            }
            return [ctx.privateState, p.docSchema];
        },
        doc_salt_a(ctx) {
            const p = currentProof('doc_salt_a');
            if (p.docSaltA === undefined) {
                throw new Error('doc_salt_a witness invoked without docPair.openingA; proveDocumentComparison requires both openings');
            }
            return [ctx.privateState, p.docSaltA];
        },
        doc_salt_b(ctx) {
            const p = currentProof('doc_salt_b');
            if (p.docSaltB === undefined) {
                throw new Error('doc_salt_b witness invoked without docPair.openingB; proveDocumentComparison requires both openings');
            }
            return [ctx.privateState, p.docSaltB];
        },
        doc_slots_a(ctx) {
            const p = currentProof('doc_slots_a');
            if (p.docSlotsA === undefined) {
                throw new Error('doc_slots_a witness invoked without docPair.openingA; proveDocumentComparison requires both openings');
            }
            return [ctx.privateState, p.docSlotsA];
        },
        doc_slots_b(ctx) {
            const p = currentProof('doc_slots_b');
            if (p.docSlotsB === undefined) {
                throw new Error('doc_slots_b witness invoked without docPair.openingB; proveDocumentComparison requires both openings');
            }
            return [ctx.privateState, p.docSlotsB];
        }
    };
}
