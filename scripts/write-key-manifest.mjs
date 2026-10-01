#!/usr/bin/env node
// Writes (or checks) keys/manifest.json of every lineage: sha256 and size of
// each prover key, verifier key and binary zkir. The manifest is committed and
// part of the generation digest; the prover keys are not committed.
//
//   node scripts/write-key-manifest.mjs                  # write (every prover key must be on disk)
//   node scripts/write-key-manifest.mjs --check          # fail when a manifest is missing or stale
//   node scripts/write-key-manifest.mjs --check --require-keys   # also fail when a prover key is absent
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildKeyManifest, renderKeyManifest, checkKeyManifest, verifierCircuits } from '@odatano/contract-kit/node';
import { LINEAGES, managedDir } from './lineages.mjs';

const args = process.argv.slice(2);
const only = args.filter(a => !a.startsWith('--'));
const targets = only.length ? LINEAGES.filter(l => only.includes(l.name)) : LINEAGES;

if (args.includes('--check')) {
    const problems = [];
    for (const { name } of targets) {
        for (const p of checkKeyManifest(managedDir(name), { requireKeys: args.includes('--require-keys') })) problems.push(`${name}: ${p}`);
    }
    if (problems.length) {
        for (const p of problems) console.error(`write-key-manifest: ${p}`);
        process.exit(1);
    }
    console.log(`write-key-manifest: ${targets.length} manifests up to date`);
} else {
    for (const { name } of targets) {
        const dir = managedDir(name);
        const manifest = buildKeyManifest(dir);
        const provers = Object.keys(manifest.prover).length;
        const verifiers = verifierCircuits(dir).length;
        if (provers !== verifiers) {
            console.error(`write-key-manifest: ${name}: ${provers} prover keys for ${verifiers} verifier keys; compile the missing ones before writing the manifest`);
            process.exit(1);
        }
        writeFileSync(path.join(dir, 'keys', 'manifest.json'), renderKeyManifest(manifest));
        console.log(`write-key-manifest: ${name}: ${provers} prover key(s)`);
    }
}
