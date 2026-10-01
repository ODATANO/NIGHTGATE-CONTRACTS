/**
 * `keys/manifest.json` of a compiled artifact: sha256 and size of every prover
 * key, verifier key and binary zkir. The manifest ships with the artifact and
 * is part of the generation digest; the prover keys are fetched on first need
 * and verified against it.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const PROVER_KEY_MANIFEST_FILE = 'manifest.json';

export interface KeyDigest { sha256: string; bytes: number }

export interface ProverKeyManifest {
    version: 1;
    prover: Record<string, KeyDigest>;
    verifier?: Record<string, KeyDigest>;
    zkir?: Record<string, KeyDigest>;
}

function digestsOf(dir: string, ext: string): Record<string, KeyDigest> {
    const out: Record<string, KeyDigest> = {};
    if (!fs.existsSync(dir)) return out;
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith(ext)).sort()) {
        const body = fs.readFileSync(path.join(dir, f));
        out[f.slice(0, -ext.length)] = { sha256: crypto.createHash('sha256').update(body).digest('hex'), bytes: body.length };
    }
    return out;
}

/** The manifest of the keys on disk; every circuit's prover key must be present. */
export function buildKeyManifest(zkConfigPath: string): ProverKeyManifest {
    const keysDir = path.join(zkConfigPath, 'keys');
    return {
        version: 1,
        prover: digestsOf(keysDir, '.prover'),
        verifier: digestsOf(keysDir, '.verifier'),
        zkir: digestsOf(path.join(zkConfigPath, 'zkir'), '.bzkir')
    };
}

export function renderKeyManifest(manifest: ProverKeyManifest): string {
    return JSON.stringify(manifest, null, 2) + '\n';
}

/** Null when absent or malformed. */
export function readProverKeyManifest(zkConfigPath: string): ProverKeyManifest | null {
    try {
        const raw = JSON.parse(fs.readFileSync(path.join(zkConfigPath, 'keys', PROVER_KEY_MANIFEST_FILE), 'utf8'));
        if (raw?.version !== 1 || !raw.prover || typeof raw.prover !== 'object') return null;
        for (const entry of Object.values(raw.prover) as Array<{ sha256?: unknown; bytes?: unknown }>) {
            if (typeof entry?.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(entry.sha256)) return null;
            if (!Number.isInteger(entry?.bytes) || (entry.bytes as number) < 0) return null;
        }
        return raw as ProverKeyManifest;
    } catch {
        return null;
    }
}

/** Circuits with a verifier key: the authoritative circuit list of an artifact. */
export function verifierCircuits(zkConfigPath: string): string[] {
    try {
        return fs.readdirSync(path.join(zkConfigPath, 'keys'))
            .filter(f => f.endsWith('.verifier'))
            .map(f => f.replace(/\.verifier$/, ''))
            .sort();
    } catch {
        return [];
    }
}

export function missingProverKeys(zkConfigPath: string): string[] {
    return verifierCircuits(zkConfigPath).filter(c => !fs.existsSync(path.join(zkConfigPath, 'keys', `${c}.prover`)));
}

export function hasAllProverKeys(zkConfigPath: string): boolean {
    const circuits = verifierCircuits(zkConfigPath);
    return circuits.length > 0 && missingProverKeys(zkConfigPath).length === 0;
}

/** sha256 + byte count of a key body against its manifest entry. */
export function keyMatchesManifest(body: Uint8Array, expected: KeyDigest): boolean {
    return body.length === expected.bytes && crypto.createHash('sha256').update(body).digest('hex') === expected.sha256;
}

/**
 * Prover keys vs. manifest; empty without a manifest or when all match. Run
 * before proving from a snapshot: the digest pins the manifest, not the keys.
 */
export function proverKeyManifestProblems(keysDir: string): string[] {
    let manifest: { prover?: Record<string, { sha256?: string; bytes?: number }> };
    try {
        manifest = JSON.parse(fs.readFileSync(path.join(keysDir, PROVER_KEY_MANIFEST_FILE), 'utf8'));
    } catch {
        return [];
    }
    const problems: string[] = [];
    for (const f of fs.readdirSync(keysDir).filter(f => f.endsWith('.prover')).sort()) {
        const circuit = f.replace(/\.prover$/, '');
        const entry = manifest.prover?.[circuit];
        if (!entry) { problems.push(`${circuit}: not listed in the manifest`); continue; }
        const body = fs.readFileSync(path.join(keysDir, f));
        const sha256 = crypto.createHash('sha256').update(body).digest('hex');
        if (entry.sha256 !== sha256 || entry.bytes !== body.length) problems.push(`${circuit}: ${body.length} bytes, sha256 ${sha256.slice(0, 16)}… (manifest: ${entry.bytes} bytes, ${String(entry.sha256).slice(0, 16)}…)`);
    }
    return problems;
}

/**
 * Problems with a committed manifest: missing, stale against the prover keys
 * on disk, a verifier circuit without an entry, an entry without a verifier,
 * a verifier or zkir section that differs from the files, and (with
 * requireKeys) a prover key that is not on disk.
 */
export function checkKeyManifest(zkConfigPath: string, { requireKeys = false } = {}): string[] {
    const problems: string[] = [];
    const keysDir = path.join(zkConfigPath, 'keys');
    if (!fs.existsSync(keysDir)) return [`no keys directory at ${keysDir}`];
    const manifestPath = path.join(keysDir, PROVER_KEY_MANIFEST_FILE);
    if (!fs.existsSync(manifestPath)) return [`keys/${PROVER_KEY_MANIFEST_FILE} is missing`];
    const manifest = readProverKeyManifest(zkConfigPath);
    if (!manifest) return [`keys/${PROVER_KEY_MANIFEST_FILE} has an unknown shape`];
    const circuits = verifierCircuits(zkConfigPath);
    for (const c of circuits) {
        const entry = manifest.prover[c];
        if (!entry) { problems.push(`circuit '${c}' has a verifier key but no manifest entry (stale manifest)`); continue; }
        const proverPath = path.join(keysDir, `${c}.prover`);
        if (!fs.existsSync(proverPath)) {
            if (requireKeys) problems.push(`prover key '${c}' is not on disk`);
            continue;
        }
        if (!keyMatchesManifest(fs.readFileSync(proverPath), entry)) problems.push(`manifest entry '${c}' does not match the prover key on disk (stale manifest)`);
    }
    for (const c of Object.keys(manifest.prover)) {
        if (!circuits.includes(c)) problems.push(`manifest lists '${c}' but no verifier key exists for it`);
    }
    // Verifier keys and binary zkir are always on disk: their entries must match exactly.
    const fresh = buildKeyManifest(zkConfigPath);
    for (const section of ['verifier', 'zkir'] as const) {
        if (JSON.stringify(manifest[section] ?? null) !== JSON.stringify(fresh[section])) {
            problems.push(`manifest section '${section}' does not match the files on disk (stale manifest)`);
        }
    }
    return problems;
}
