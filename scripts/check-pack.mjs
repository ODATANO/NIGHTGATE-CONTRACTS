#!/usr/bin/env node
// Every lineage package ships its module, declaration, verifier keys, zkir,
// manifest, source and contract.json, and no prover key. Checked against
// `npm pack --dry-run`, the files list already applied.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { LINEAGES, packageDir } from './lineages.mjs';

const MAX_MB = 5;
let failed = false;
for (const { name } of LINEAGES) {
    const dir = packageDir(name);
    const out = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
        cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], shell: process.platform === 'win32'
    });
    const report = JSON.parse(out)[0];
    const packed = new Set(report.files.map(f => f.path.replace(/\\/g, '/')));
    const manifest = JSON.parse(readFileSync(path.join(dir, 'managed', name, 'keys', 'manifest.json'), 'utf8'));
    const required = [
        'contract.json',
        `src/${name}.compact`,
        `managed/${name}/compiler/contract-info.json`,
        `managed/${name}/contract/index.js`,
        `managed/${name}/contract/index.d.ts`,
        `managed/${name}/keys/manifest.json`,
        ...Object.keys(manifest.prover).flatMap(c => [`managed/${name}/keys/${c}.verifier`, `managed/${name}/zkir/${c}.zkir`, `managed/${name}/zkir/${c}.bzkir`])
    ];
    for (const r of required) {
        if (!packed.has(r)) { console.error(`check-pack: ${name}: '${r}' is not in the tarball`); failed = true; }
    }
    const provers = [...packed].filter(f => f.endsWith('.prover'));
    if (provers.length) { console.error(`check-pack: ${name}: ${provers.length} prover key(s) in the tarball (${provers[0]}, …)`); failed = true; }
    const mb = report.size / (1024 * 1024);
    if (mb > MAX_MB) { console.error(`check-pack: ${name}: tarball is ${mb.toFixed(1)} MB, over ${MAX_MB} MB`); failed = true; }
    console.log(`check-pack: ${name}: ${report.entryCount} files, ${(report.unpackedSize / 1024).toFixed(0)} KB unpacked`);
}
if (failed) process.exit(1);
