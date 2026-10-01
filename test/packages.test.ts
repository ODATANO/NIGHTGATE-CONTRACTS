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
    'counter': 'bd30a06bb1851a6c41f0869c25e0c02a7e8b4ca0b5b12db3d9edf4e17ff3a12a',
    'shielded-token': 'eb93bfef4b6e8a868c18a337b6b195ab9bd81c100ac4f6455f852ac7712afbd9',
    'token-factory': '036d3f43aaa331aad279935a64d34a69e82b759aa1a2ae25e97fc6250f42f5f7',
    'holder-registry': '0384d67ef245ddca17c7b99de1cdbdf3c1dbd8e97a4ac6a19809314bd68ed50c',
    'attestation-vault': '6537607ae62e5deb05de9b055dfe204227fdcb45d17df54d010c3a4a407b3015',
    'attestation-vault-32': '49b05093f9955f2935aeb67e6352f827861c03a90c5128b59a1824b37b98e81c'
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
                expect(resolved.manifest.compactRuntime).toBe('0.16.0');
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
