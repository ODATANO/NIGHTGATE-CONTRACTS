/**
 * Typed call inputs for the AttestationVault: circuit id, arguments and the
 * witness object, ready for midnight-js `callTx` or `createUnprovenCallTx`.
 * Only the owner-gated circuits take the attester secret; the proof circuits
 * never invoke local_secret_key, so a holder proves without it.
 */

import { buildAttestationVaultWitnesses, type AttestationVaultWitnesses, type MerkleProof, type DocPair } from './witnesses.js';
import { hexToBytes32, bytesToHex } from './hex.js';

const nowSeconds = () => Math.floor(Date.now() / 1000);
/** Default claim lifetime (one year); the vault caps `valid_until` at five years ahead. */
export const DEFAULT_CLAIM_LIFETIME_S = 365 * 24 * 60 * 60;
const ZERO32 = () => new Uint8Array(32);

export interface PreparedCall {
    circuitId: string;
    /** boolean[] carries the cross-root integrity circuit's Vector<width, Boolean> mask arg. */
    args: Array<Uint8Array | bigint | boolean[]>;
    witnesses: AttestationVaultWitnesses;
    /** The proof helpers pass their inputs through so a batch caller can rebind the bundle. */
    merkleProof?: MerkleProof;
    /** Slot width the call was prepared for (16 default, 32 for the 32-slot vault). */
    slotWidth?: number;
}

function claimValidUntil(validUntil: number | bigint | undefined): bigint {
    const v = BigInt(validUntil ?? nowSeconds() + DEFAULT_CLAIM_LIFETIME_S);
    if (v <= BigInt(nowSeconds())) throw new Error('validUntil must lie in the future (UNIX seconds)');
    return v;
}

function requireSecret(attestationSecret: Uint8Array | undefined): asserts attestationSecret is Uint8Array {
    if (!(attestationSecret instanceof Uint8Array)) throw new Error('attestationSecret (Uint8Array) is required');
}

/** `revokeDisclosure(payload_hash, grantee)`. */
export function prepareRevokeDisclosure({ payloadHash, grantee, attestationSecret }: { payloadHash: string; grantee: string; attestationSecret: Uint8Array }): PreparedCall {
    requireSecret(attestationSecret);
    return {
        circuitId: 'revokeDisclosure',
        args: [hexToBytes32(payloadHash, 'payloadHash'), hexToBytes32(grantee, 'grantee')],
        witnesses: buildAttestationVaultWitnesses({ attestationSecret })
    };
}

/** `grantDisclosure(payload_hash, grantee, level)`; level 0 = public, 1 = legitimate interest, 2 = authority. */
export function prepareGrantDisclosure({ payloadHash, grantee, level, attestationSecret }: { payloadHash: string; grantee: string; level: number | bigint; attestationSecret: Uint8Array }): PreparedCall {
    requireSecret(attestationSecret);
    const lvl = BigInt(level);
    if (lvl < 0n || lvl > 2n) throw new Error('level must be 0, 1 or 2');
    return {
        circuitId: 'grantDisclosure',
        args: [hexToBytes32(payloadHash, 'payloadHash'), hexToBytes32(grantee, 'grantee'), lvl],
        witnesses: buildAttestationVaultWitnesses({ attestationSecret })
    };
}

/** `attest(payload_hash, metadata_hash)`: the record is keyed by the caller's attester id and the hash (`recordKeyOf`). */
export function prepareAttest({ payloadHash, metadataHash, attestationSecret }: { payloadHash: string; metadataHash: string; attestationSecret: Uint8Array }): PreparedCall {
    requireSecret(attestationSecret);
    return {
        circuitId: 'attest',
        args: [hexToBytes32(payloadHash, 'payloadHash'), hexToBytes32(metadataHash, 'metadataHash')],
        witnesses: buildAttestationVaultWitnesses({ attestationSecret })
    };
}

/**
 * `registerDocument(mode, document_id, owner_id)`. Modes 0-2 registrar-only:
 * 0 assigns or re-assigns the id to an attester id, 1 unregisters it (`ownerId`
 * ignored), 2 transfers the registrar role to `ownerId` (`documentId` ignored).
 * Modes 3-4 recovery-only (`documentId` ignored): 3 re-points the registrar,
 * 4 hands the recovery role to `ownerId`.
 */
export function prepareRegisterDocument({ documentId, ownerId, mode, attestationSecret }: { documentId?: string; ownerId?: string; mode?: number | bigint; attestationSecret: Uint8Array }): PreparedCall {
    requireSecret(attestationSecret);
    const m = BigInt(mode ?? 0);
    if (m < 0n || m > 4n) throw new Error('mode must be 0 (register), 1 (unregister), 2 (transfer registrar), 3 (recovery: set registrar) or 4 (recovery: set recovery)');
    const id = m >= 2n ? ZERO32() : hexToBytes32(documentId as string, 'documentId');
    const owner = m === 1n ? ZERO32() : hexToBytes32(ownerId as string, 'ownerId');
    return {
        circuitId: 'registerDocument',
        args: [m, id, owner],
        witnesses: buildAttestationVaultWitnesses({ attestationSecret })
    };
}

/** Alias of prepareRegisterDocument (mode 0) with the former parameter name. */
export function prepareRegisterPassport({ passportId, ownerId, attestationSecret }: { passportId: string; ownerId: string; attestationSecret: Uint8Array }): PreparedCall {
    return prepareRegisterDocument({ documentId: passportId, ownerId, mode: 0, attestationSecret });
}

/** `bindDocument(document_id, payload_hash)`: one id per payload, one payload per id; a rebind clears the previous pairing. */
export function prepareBindDocument({ documentId, payloadHash, attestationSecret }: { documentId: string; payloadHash: string; attestationSecret: Uint8Array }): PreparedCall {
    requireSecret(attestationSecret);
    return {
        circuitId: 'bindDocument',
        args: [hexToBytes32(documentId, 'documentId'), hexToBytes32(payloadHash, 'payloadHash')],
        witnesses: buildAttestationVaultWitnesses({ attestationSecret })
    };
}

/** Alias of prepareBindDocument with the former parameter name. */
export function prepareBindPassport({ passportId, payloadHash, attestationSecret }: { passportId: string; payloadHash: string; attestationSecret: Uint8Array }): PreparedCall {
    return prepareBindDocument({ documentId: passportId, payloadHash, attestationSecret });
}

/**
 * `retract(mode, key)`. Mode 0 removes the caller's own payload (`key` = payload
 * hash). Mode 1 removes an expired claim (`key` = claim key), mode 2 an expired
 * commitment, mode 3 an expired payload mark; anyone may run those three.
 */
export function prepareRetract({ mode, key, attestationSecret }: { mode: number | bigint; key: string; attestationSecret: Uint8Array }): PreparedCall {
    requireSecret(attestationSecret);
    const m = BigInt(mode ?? 0);
    if (m < 0n || m > 3n) throw new Error('mode must be 0 (payload), 1 (expired claim), 2 (expired commitment) or 3 (expired mark)');
    return {
        circuitId: 'retract',
        args: [m, hexToBytes32(key, 'key')],
        witnesses: buildAttestationVaultWitnesses({ attestationSecret })
    };
}

export function prepareRetractAttestation({ payloadHash, attestationSecret }: { payloadHash: string; attestationSecret: Uint8Array }): PreparedCall {
    return prepareRetract({ mode: 0, key: payloadHash, attestationSecret });
}

export function preparePurgeExpired({ kind, key, attestationSecret }: { kind: 'claim'; key: string; attestationSecret: Uint8Array }): PreparedCall {
    const mode = kind === 'claim' ? 1 : null;
    if (mode === null) throw new Error("kind must be 'claim'");
    return prepareRetract({ mode, key, attestationSecret });
}

/**
 * The ledger key of an attester's record for a payload, as hex, by the
 * artifact's `recordKey` pure circuit. Public and recomputable by anyone.
 */
export function recordKeyOf({ pureCircuits, attesterId, payloadHash }: { pureCircuits: { recordKey(owner: Uint8Array, payloadHash: Uint8Array): Uint8Array }; attesterId: string; payloadHash: string }): string {
    if (typeof pureCircuits?.recordKey !== 'function') throw new Error('pureCircuits (the compiled vault artifact\'s pureCircuits) is required');
    return bytesToHex(pureCircuits.recordKey(hexToBytes32(attesterId, 'attesterId'), hexToBytes32(payloadHash, 'payloadHash')));
}

/** `anchorContentRoot(payload_hash, content_root, schema_id)`: insert-once-or-identical per payload. */
export function prepareAnchorContentRoot({ payloadHash, contentRoot, schemaId, attestationSecret }: { payloadHash: string; contentRoot: string; schemaId: string; attestationSecret: Uint8Array }): PreparedCall {
    requireSecret(attestationSecret);
    return {
        circuitId: 'anchorContentRoot',
        args: [hexToBytes32(payloadHash, 'payloadHash'), hexToBytes32(contentRoot, 'contentRoot'), hexToBytes32(schemaId, 'schemaId')],
        witnesses: buildAttestationVaultWitnesses({ attestationSecret })
    };
}

interface ProofCallBase { recordKey: string; fieldKey: string; validUntil?: number | bigint; merkleProof: MerkleProof; attestationSecret?: Uint8Array; slotWidth?: number }

/** `proveFieldPredicate(record_key, field_key, threshold, op, valid_until)`; op 0 = value <= threshold, 1 = value >= threshold. */
export function prepareProveFieldPredicate({ recordKey, fieldKey, threshold, op, validUntil, merkleProof, attestationSecret, slotWidth }: ProofCallBase & { threshold: number | bigint; op: number | bigint }): PreparedCall {
    if (!merkleProof || !merkleProof.fieldSalt) throw new Error('merkleProof ({ fieldValue, fieldSalt, siblings, dirs }) is required (v4 salted leaves)');
    const opNum = BigInt(Number(op));
    if (opNum !== 0n && opNum !== 1n) throw new Error('op must be 0 (lessOrEqual) or 1 (greaterOrEqual)');
    return {
        circuitId: 'proveFieldPredicate',
        args: [hexToBytes32(recordKey, 'recordKey'), hexToBytes32(fieldKey, 'fieldKey'), BigInt(threshold), opNum, claimValidUntil(validUntil)],
        witnesses: buildAttestationVaultWitnesses({ attestationSecret, merkleProof, slotWidth }),
        merkleProof, slotWidth
    };
}

/** `proveFieldEquality(record_key, field_key, expected_digest, valid_until)`: authenticity, not confidentiality. */
export function prepareProveFieldEquality({ recordKey, fieldKey, expectedDigest, validUntil, merkleProof, attestationSecret, slotWidth }: ProofCallBase & { expectedDigest: string }): PreparedCall {
    if (!merkleProof || !merkleProof.fieldSalt) throw new Error('merkleProof ({ fieldSalt, siblings, dirs }) is required (v4 salted leaves)');
    return {
        circuitId: 'proveFieldEquality',
        args: [hexToBytes32(recordKey, 'recordKey'), hexToBytes32(fieldKey, 'fieldKey'), hexToBytes32(expectedDigest, 'expectedDigest'), claimValidUntil(validUntil)],
        witnesses: buildAttestationVaultWitnesses({ attestationSecret, merkleProof, slotWidth }),
        merkleProof, slotWidth
    };
}

/** `proveFieldMembership(record_key, field_key, set_root, valid_until)`: the hidden digest is one of a public allow-list. */
export function prepareProveFieldMembership({ recordKey, fieldKey, setRoot, validUntil, merkleProof, attestationSecret, slotWidth }: ProofCallBase & { setRoot: string }): PreparedCall {
    if (!merkleProof || !merkleProof.fieldDigest || !merkleProof.fieldSalt || !merkleProof.setProof) {
        throw new Error('merkleProof ({ fieldDigest, fieldSalt, siblings, dirs, setProof }) is required (v4 salted leaves)');
    }
    return {
        circuitId: 'proveFieldMembership',
        args: [hexToBytes32(recordKey, 'recordKey'), hexToBytes32(fieldKey, 'fieldKey'), hexToBytes32(setRoot, 'setRoot'), claimValidUntil(validUntil)],
        witnesses: buildAttestationVaultWitnesses({ attestationSecret, merkleProof, slotWidth }),
        merkleProof, slotWidth
    };
}

interface CrossRootBase { recordKeyA: string; recordKeyB: string; validUntil?: number | bigint; docPair: DocPair; attestationSecret?: Uint8Array; slotWidth?: number }

/**
 * Cross-root integrity: document B differs from A only in the slots of
 * `allowedMask` (bit i = slot i may differ). `proveDocumentComparison(a, b,
 * mode=0, allowed_mask, k, valid_until)`; (A, B) order is part of the claim key.
 */
export function prepareProveFieldsUnchangedExcept({ recordKeyA, recordKeyB, allowedMask, validUntil, docPair, attestationSecret, slotWidth }: CrossRootBase & { allowedMask: number }): PreparedCall {
    if (!docPair || !docPair.schema || !docPair.openingA || !docPair.openingB) throw new Error('docPair ({ schema, openingA, openingB }) is required');
    const width = slotWidth ?? 16;
    const maxMask = width === 32 ? 0xffffffff : (1 << width) - 1;
    const mask = Number(allowedMask);
    if (!Number.isInteger(mask) || mask < 0 || mask > maxMask) throw new Error(`allowedMask must be an integer in 0..${maxMask}`);
    // At least one real (non-padding) slot must stay constrained, as the circuit also requires.
    if (Array.isArray(docPair.schema)
        && docPair.schema.every((s, i) => Number(s?.kind) === 2 || (mask & (1 << i)) !== 0)) {
        throw new Error('allowedMask frees every real (non-padding) schema slot; the claim would be vacuous');
    }
    const maskVector = Array.from({ length: width }, (_, i) => (mask & (1 << i)) !== 0);
    return {
        circuitId: 'proveDocumentComparison',
        args: [hexToBytes32(recordKeyA, 'recordKeyA'), hexToBytes32(recordKeyB, 'recordKeyB'), 0n, maskVector, 1n, claimValidUntil(validUntil)],
        witnesses: buildAttestationVaultWitnesses({ attestationSecret, merkleProof: { docPair }, slotWidth }),
        merkleProof: { docPair }, slotWidth
    };
}

/** Cross-root distinctness: at least `k` aligned slots differ. `proveDocumentComparison(a, b, mode=1, dummy mask, k, valid_until)`. */
export function prepareProveFieldsDiffer({ recordKeyA, recordKeyB, k, validUntil, docPair, attestationSecret, slotWidth }: CrossRootBase & { k: number }): PreparedCall {
    if (!docPair || !docPair.schema || !docPair.openingA || !docPair.openingB) throw new Error('docPair ({ schema, openingA, openingB }) is required');
    const width = slotWidth ?? 16;
    const kNum = Number(k);
    if (!Number.isInteger(kNum) || kNum < 1 || kNum > width) throw new Error(`k must be an integer in 1..${width}`);
    return {
        circuitId: 'proveDocumentComparison',
        args: [hexToBytes32(recordKeyA, 'recordKeyA'), hexToBytes32(recordKeyB, 'recordKeyB'), 1n, Array.from({ length: width }, () => false), BigInt(kNum), claimValidUntil(validUntil)],
        witnesses: buildAttestationVaultWitnesses({ attestationSecret, merkleProof: { docPair }, slotWidth }),
        merkleProof: { docPair }, slotWidth
    };
}
