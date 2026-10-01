#!/usr/bin/env node
// Reproducible-build gate: a fresh compile of a lineage must equal the
// committed artifact byte for byte (compiler/, zkir/, keys/*.verifier,
// contract/index.js, index.d.ts; the source map with `sourceRoot` ignored) and
// its prover keys must match the committed keys/manifest.json.
//
//   node scripts/check-rebuild.mjs <name> <fresh-managed-dir>
//
// CI compiles into a scratch directory (scripts/compile.sh with
// COMPACT_OUT) and calls this per lineage.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readProverKeyManifest, keyMatchesManifest } from '@odatano/contract-kit/node';
import { managedDir, lineage } from './lineages.mjs';

const [name, freshDir] = process.argv.slice(2);
if (!name || !freshDir) {
    console.error('usage: check-rebuild.mjs <name> <fresh-managed-dir>');
    process.exit(2);
}
lineage(name);
const committed = managedDir(name);

function listFiles(dir, sub) {
    const d = path.join(dir, sub);
    if (!existsSync(d)) return [];
    return readdirSync(d).filter(f => statSync(path.join(d, f)).isFile()).sort();
}

function sha(file, normalize) {
    let body = readFileSync(file);
    if (normalize) body = Buffer.from(normalize(body.toString('utf8')), 'utf8');
    return createHash('sha256').update(body).digest('hex');
}

const stripSourceRoot = (text) => text.replace(/"sourceRoot":\s*"[^"]*"/, '"sourceRoot":""');

const problems = [];
for (const sub of ['compiler', 'zkir', 'contract', 'keys']) {
    const a = listFiles(committed, sub).filter(f => !f.endsWith('.prover') && f !== 'manifest.json');
    const b = listFiles(freshDir, sub).filter(f => !f.endsWith('.prover') && f !== 'manifest.json');
    if (a.join('\n') !== b.join('\n')) {
        problems.push(`${sub}/: file lists differ (committed: ${a.join(', ')}; fresh: ${b.join(', ')})`);
        continue;
    }
    for (const f of a) {
        const normalize = f.endsWith('.map') ? stripSourceRoot : undefined;
        if (sha(path.join(committed, sub, f), normalize) !== sha(path.join(freshDir, sub, f), normalize)) {
            problems.push(`${sub}/${f} differs from the committed file`);
        }
    }
}

const manifest = readProverKeyManifest(committed);
if (!manifest) {
    problems.push('keys/manifest.json missing or malformed in the committed artifact');
} else {
    for (const [circuit, expected] of Object.entries(manifest.prover)) {
        const file = path.join(freshDir, 'keys', `${circuit}.prover`);
        if (!existsSync(file)) { problems.push(`prover key ${circuit} not produced by the fresh build`); continue; }
        if (!keyMatchesManifest(readFileSync(file), expected)) problems.push(`prover key ${circuit} differs from keys/manifest.json`);
    }
}

if (problems.length) {
    console.error(`check-rebuild: ${name}: the fresh build does not reproduce the committed artifact:`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
}
console.log(`check-rebuild: ${name}: reproduced (${Object.keys(manifest.prover).length} prover keys match the manifest)`);
