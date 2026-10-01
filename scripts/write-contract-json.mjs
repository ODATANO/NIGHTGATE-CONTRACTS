#!/usr/bin/env node
// Writes (or checks) contract.json of every lineage package: role, paths,
// circuits, compiler and runtime versions from contract-info.json, the
// generation digest of the committed artifact, and the release-asset base the
// prover keys are fetched from (derived from the package version).
//
//   node scripts/write-contract-json.mjs            # write
//   node scripts/write-contract-json.mjs --check    # fail when a file differs from the fresh output
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { computeArtifactGenerationDigest } from '@odatano/contract-kit/node';
import { LINEAGES, packageDir, managedDir } from './lineages.mjs';

const RELEASES = 'https://github.com/ODATANO/NIGHTGATE-CONTRACTS/releases/download';

export function releaseTag(name, version) {
    return `${name}-v${version}`;
}

export function buildContractJson(l) {
    const pkg = JSON.parse(readFileSync(path.join(packageDir(l.name), 'package.json'), 'utf8'));
    const info = JSON.parse(readFileSync(path.join(managedDir(l.name), 'compiler', 'contract-info.json'), 'utf8'));
    const artifactPath = `managed/${l.name}/contract/index.js`;
    const zkConfigPath = `managed/${l.name}`;
    const digest = computeArtifactGenerationDigest({
        artifactPath: path.join(packageDir(l.name), artifactPath),
        privateStateId: l.privateStateId,
        zkConfigPath: path.join(packageDir(l.name), zkConfigPath),
        slotWidth: l.slotWidth
    });
    return {
        name: l.name,
        role: l.role,
        privateStateId: l.privateStateId,
        artifactPath,
        zkConfigPath,
        ...(l.slotWidth !== undefined ? { slotWidth: l.slotWidth } : {}),
        circuits: (info.circuits ?? []).filter(c => c.proof !== false).map(c => c.name).sort(),
        pureCircuits: (info.circuits ?? []).filter(c => c.pure === true).map(c => c.name).sort(),
        compactCompiler: info['compiler-version'],
        compactRuntime: info['runtime-version'],
        languageVersion: info['language-version'],
        digest,
        zkAssetUrl: `${RELEASES}/${releaseTag(l.name, pkg.version)}`,
        zkAssetLayout: 'flat'
    };
}

const render = (o) => JSON.stringify(o, null, 2) + '\n';

const args = process.argv.slice(2);
const only = args.filter(a => !a.startsWith('--'));
const targets = only.length ? LINEAGES.filter(l => only.includes(l.name)) : LINEAGES;
let failed = false;
for (const l of targets) {
    const file = path.join(packageDir(l.name), 'contract.json');
    const fresh = render(buildContractJson(l));
    if (args.includes('--check')) {
        const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
        if (current !== fresh) {
            console.error(`write-contract-json: ${l.name}: contract.json is stale (run: npm run contract-json)`);
            failed = true;
        }
    } else {
        writeFileSync(file, fresh);
        console.log(`write-contract-json: ${l.name}: digest ${JSON.parse(fresh).digest.slice(0, 16)}…`);
    }
}
if (failed) process.exit(1);
if (args.includes('--check')) console.log(`write-contract-json: ${targets.length} files up to date`);
