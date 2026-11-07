/**
 * Every lineage package resolves as an installed package, its contract.json
 * matches the files on disk, and the generation digests are pinned: a
 * recompile that changes one is a new generation and shows up here first.
 */
import { describe, test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveContractPackage, contractPackageDigestProblem, verifierCircuits, checkKeyManifest, readContractPackage } from '@odatano/contract-kit/node';
import { LINEAGES, packageDir, REPO_ROOT } from '../scripts/lineages.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

/** Generation digests of the shipped artifacts. */
const PINNED: Record<string, string> = {
    'counter': '7ad472159299fab6d4ced649408eccce92ca0308066cc4dbf7882d5e3c64929f',
    'shielded-token': '541297ffd10453b656f5cdaa6163ef49ae51d029ecbb1602e51dd5979aa3625e',
    'token-factory': '3caeab2c0b4346d0b83e3aea045bf1dc7fd3bcdc81d94c0a3ea98a50f1bc3f78',
    'holder-registry': '7b6c5c6a4e00def33590125d0a145249ccb218b80a20ad408148d370968ebc06',
    'attestation-vault': '6a47d38c3a852c137f3fd77a68ba75953b0065b2c1ea58cd754db79a82e8dad0',
    'attestation-vault-32': '6969eb7451570740a49482839aab46691ebd58a9df025d415db0174613206409',
    'm402-vault': '29fe922cc6bb62f2404bc7ce0a455ba73c23743de2e26187a4a8e78ce55e6477'
};

describe('lineage packages', () => {
    test('scripts/lineages.mjs names the packages under packages/', () => {
        expect(path.resolve(REPO_ROOT)).toBe(path.resolve(repoRoot));
        const dirs = fs.readdirSync(path.join(repoRoot, 'packages')).filter(d => d !== 'contract-kit').sort();
        expect(dirs).toEqual(LINEAGES.map(l => l.name).sort());
    });

    for (const l of LINEAGES) {
        describe(l.name, () => {
            test('resolves by package name with a consistent contract.json', () => {
                const pkgName = JSON.parse(fs.readFileSync(path.join(packageDir(l.name), 'package.json'), 'utf8')).name;
                expect(pkgName).toBe(`@odatano/contract-${l.name}`);
                const resolved = resolveContractPackage(pkgName, repoRoot);
                expect(resolved.root).toBe(path.resolve(packageDir(l.name)));
                expect(resolved.manifest).toMatchObject({ name: l.name, role: l.role, privateStateId: l.privateStateId, zkAssetLayout: 'flat' });
                expect(resolved.manifest.slotWidth).toBe(l.slotWidth);
                expect(fs.existsSync(resolved.artifactPath)).toBe(true);
                expect(resolved.manifest.circuits).toEqual(verifierCircuits(resolved.zkConfigPath));
                expect(resolved.manifest.zkAssetUrl).toBe(`https://github.com/ODATANO/NIGHTGATE-CONTRACTS/releases/download/${l.name}-v${resolved.version}`);
                expect(resolved.manifest.compactRuntime).toBe('0.21.0');
                expect(contractPackageDigestProblem(resolved)).toBeNull();
                expect(checkKeyManifest(resolved.zkConfigPath)).toEqual([]);
            });

            test('the generation digest is the pinned one', () => {
                const resolved = readContractPackage(packageDir(l.name));
                if (PINNED[l.name]) expect(resolved.manifest.digest).toBe(PINNED[l.name]);
                else expect(resolved.manifest.digest).toMatch(/^[0-9a-f]{64}$/);
            });

            test('the compiled module imports and exposes the contract class', async () => {
                const mod: any = await import(`@odatano/contract-${l.name}`);
                expect(typeof mod.Contract).toBe('function');
                expect(typeof mod.ledger).toBe('function');
            });
        });
    }
});
