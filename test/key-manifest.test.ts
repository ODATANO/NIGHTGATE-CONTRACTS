/**
 * The key manifest and its place in the artifact generation digest: the
 * digest pins the manifest where one exists and the key bytes otherwise, and
 * still recognises the pre-manifest form.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {
    computeArtifactGenerationDigest, artifactGenerationMatch, proverKeyManifestProblems,
    missingProverKeys, hasAllProverKeys, readProverKeyManifest, buildKeyManifest, checkKeyManifest
} from '@odatano/contract-kit/node';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

function artifact(opts: { provers?: Record<string, string>; manifest?: boolean; circuits?: string[] } = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-pk-'));
    dirs.push(root);
    const zk = path.join(root, 'managed');
    fs.mkdirSync(path.join(zk, 'keys'), { recursive: true });
    fs.mkdirSync(path.join(zk, 'zkir'), { recursive: true });
    for (const c of opts.circuits ?? ['attest', 'grant']) {
        fs.writeFileSync(path.join(zk, 'keys', `${c}.verifier`), `vk-${c}`);
        fs.writeFileSync(path.join(zk, 'zkir', `${c}.bzkir`), `ir-${c}`);
    }
    for (const [c, body] of Object.entries(opts.provers ?? {})) fs.writeFileSync(path.join(zk, 'keys', `${c}.prover`), body);
    const artifactPath = path.join(root, 'artifact.mjs');
    fs.writeFileSync(artifactPath, 'export class Contract {}\n');
    if (opts.manifest) {
        // the manifest describes the FULL set, whether or not every key is on disk
        const full: Record<string, string> = { attest: 'pk-attest', grant: 'pk-grant', ...(opts.provers ?? {}) };
        const prover: Record<string, { sha256: string; bytes: number }> = {};
        for (const c of opts.circuits ?? ['attest', 'grant']) {
            const body = Buffer.from(full[c]);
            prover[c] = { sha256: crypto.createHash('sha256').update(body).digest('hex'), bytes: body.length };
        }
        fs.writeFileSync(path.join(zk, 'keys', 'manifest.json'), JSON.stringify({ version: 1, prover }, null, 2));
    }
    return { artifactPath, zkConfigPath: zk, privateStateId: 'ps' };
}

describe('key manifest', () => {
    it('reports the circuits without a prover key; hasAllProverKeys needs every one', () => {
        const reg = artifact({ provers: { attest: 'pk-attest' } });
        expect(missingProverKeys(reg.zkConfigPath)).toEqual(['grant']);
        expect(hasAllProverKeys(reg.zkConfigPath)).toBe(false);
        fs.writeFileSync(path.join(reg.zkConfigPath, 'keys', 'grant.prover'), 'pk-grant');
        expect(hasAllProverKeys(reg.zkConfigPath)).toBe(true);
        expect(hasAllProverKeys(path.join(reg.zkConfigPath, 'nowhere'))).toBe(false);
    });

    it('reads a well-formed manifest and rejects a malformed one', () => {
        const reg = artifact({ manifest: true });
        expect(Object.keys(readProverKeyManifest(reg.zkConfigPath)!.prover).sort()).toEqual(['attest', 'grant']);
        fs.writeFileSync(path.join(reg.zkConfigPath, 'keys', 'manifest.json'), JSON.stringify({ version: 1, prover: { attest: { sha256: 'zz', bytes: 1 } } }));
        expect(readProverKeyManifest(reg.zkConfigPath)).toBeNull();
    });

    it('buildKeyManifest lists prover, verifier and zkir digests', () => {
        const reg = artifact({ provers: { attest: 'x' } });
        const m = buildKeyManifest(reg.zkConfigPath);
        expect(m.prover).toEqual({ attest: { sha256: crypto.createHash('sha256').update('x').digest('hex'), bytes: 1 } });
        expect(Object.keys(m.verifier!).sort()).toEqual(['attest', 'grant']);
        expect(Object.keys(m.zkir!).sort()).toEqual(['attest', 'grant']);
    });

    it('checkKeyManifest finds stale, missing and unlisted entries', () => {
        const reg = artifact({ provers: { attest: 'pk-attest', grant: 'pk-grant' } });
        expect(checkKeyManifest(reg.zkConfigPath)).toEqual([expect.stringMatching(/missing/)]);
        fs.writeFileSync(path.join(reg.zkConfigPath, 'keys', 'manifest.json'), JSON.stringify(buildKeyManifest(reg.zkConfigPath)));
        expect(checkKeyManifest(reg.zkConfigPath)).toEqual([]);
        fs.rmSync(path.join(reg.zkConfigPath, 'keys', 'grant.prover'));
        expect(checkKeyManifest(reg.zkConfigPath)).toEqual([]);
        expect(checkKeyManifest(reg.zkConfigPath, { requireKeys: true })).toEqual(["prover key 'grant' is not on disk"]);
        fs.writeFileSync(path.join(reg.zkConfigPath, 'keys', 'attest.prover'), 'drifted');
        expect(checkKeyManifest(reg.zkConfigPath)).toEqual([expect.stringMatching(/'attest' does not match/)]);
        fs.writeFileSync(path.join(reg.zkConfigPath, 'keys', 'extra.verifier'), 'vk');
        expect(checkKeyManifest(reg.zkConfigPath)).toEqual(expect.arrayContaining([expect.stringMatching(/'extra' has a verifier key but no manifest entry/)]));
    });
});

describe('artifact digest and prover keys', () => {
    it('with a manifest the digest ignores which prover keys are on disk and pins the manifest', () => {
        const reg = artifact({ provers: { attest: 'pk-attest' }, manifest: true });
        const before = computeArtifactGenerationDigest(reg);
        fs.writeFileSync(path.join(reg.zkConfigPath, 'keys', 'grant.prover'), 'pk-grant');
        expect(computeArtifactGenerationDigest(reg)).toBe(before);
        fs.rmSync(path.join(reg.zkConfigPath, 'keys', 'attest.prover'));
        expect(computeArtifactGenerationDigest(reg)).toBe(before);
        const manifestPath = path.join(reg.zkConfigPath, 'keys', 'manifest.json');
        fs.writeFileSync(manifestPath, fs.readFileSync(manifestPath, 'utf8').replace('"bytes": 9', '"bytes": 10'));
        expect(computeArtifactGenerationDigest(reg)).not.toBe(before);
    });

    it('without a manifest the prover bytes stay in the digest', () => {
        const reg = artifact({ provers: { attest: 'pk-attest', grant: 'pk-grant' } });
        const before = computeArtifactGenerationDigest(reg);
        fs.writeFileSync(path.join(reg.zkConfigPath, 'keys', 'grant.prover'), 'pk-grant-2');
        expect(computeArtifactGenerationDigest(reg)).not.toBe(before);
    });

    it('a digest recorded before the manifest existed still matches as legacy', () => {
        const reg = artifact({ provers: { attest: 'pk-attest', grant: 'pk-grant' } });
        const recorded = computeArtifactGenerationDigest(reg);
        fs.writeFileSync(path.join(reg.zkConfigPath, 'keys', 'manifest.json'), JSON.stringify(buildKeyManifest(reg.zkConfigPath)));
        expect(computeArtifactGenerationDigest(reg)).not.toBe(recorded);
        expect(artifactGenerationMatch(reg, recorded)).toBe('legacy');
        expect(artifactGenerationMatch(reg, computeArtifactGenerationDigest(reg))).toBe('current');
        expect(artifactGenerationMatch(reg, 'ff'.repeat(32))).toBeNull();
    });

    it('proverKeyManifestProblems finds a key that drifted from the manifest, is silent without one', () => {
        const reg = artifact({ provers: { attest: 'pk-attest', grant: 'pk-grant' }, manifest: true });
        const keys = path.join(reg.zkConfigPath, 'keys');
        expect(proverKeyManifestProblems(keys)).toEqual([]);
        fs.writeFileSync(path.join(keys, 'grant.prover'), 'pk-grant-x');
        expect(proverKeyManifestProblems(keys)).toEqual([expect.stringMatching(/^grant: 10 bytes/)]);
        fs.writeFileSync(path.join(keys, 'extra.prover'), 'x');
        expect(proverKeyManifestProblems(keys)).toContain('extra: not listed in the manifest');
        expect(proverKeyManifestProblems(artifact({ provers: { attest: 'a' } }).zkConfigPath + '/keys')).toEqual([]);
    });
});
