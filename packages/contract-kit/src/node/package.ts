/**
 * A lineage package's `contract.json` and the paths a server registers from it.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { computeArtifactGenerationDigest } from './digest.js';

export type ContractRole = 'attestation' | 'token' | 'holder-registry' | 'example';

/** How prover keys are laid out under `zkAssetUrl`: `/zk-config` (`keys/<circuit>.prover`) or flat (`<circuit>.prover`, release assets). */
export type ZkAssetLayout = 'zk-config' | 'flat';

export interface ContractManifest {
    name: string;
    role: ContractRole;
    privateStateId: string;
    /** Package-relative path of the compiled module. */
    artifactPath: string;
    /** Package-relative directory holding `keys/` and `zkir/`. */
    zkConfigPath: string;
    slotWidth?: number;
    circuits: string[];
    compactCompiler: string;
    compactRuntime: string;
    languageVersion?: string;
    /** Generation digest of the shipped artifact; a server refuses a package whose files hash differently. */
    digest: string;
    /** Base URL the prover keys are fetched from. */
    zkAssetUrl: string;
    zkAssetLayout: ZkAssetLayout;
}

export const CONTRACT_MANIFEST_FILE = 'contract.json';

export interface ResolvedContractPackage {
    name: string;
    version: string;
    root: string;
    manifest: ContractManifest;
    artifactPath: string;
    zkConfigPath: string;
}

function readJson(file: string): any {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Resolve an installed lineage package by name (from `from`, default: this process's resolution root). */
export function resolveContractPackage(packageName: string, from?: string): ResolvedContractPackage {
    const req = createRequire(from ? path.join(from, 'package.json') : import.meta.url);
    let pkgJson: string;
    try {
        pkgJson = req.resolve(`${packageName}/package.json`);
    } catch (e) {
        throw new Error(`contract package '${packageName}' is not installed (${String((e as Error)?.message ?? e)})`);
    }
    return readContractPackage(path.dirname(pkgJson));
}

/** A lineage package by its directory. */
export function readContractPackage(root: string): ResolvedContractPackage {
    const pkg = readJson(path.join(root, 'package.json'));
    const manifestFile = path.join(root, CONTRACT_MANIFEST_FILE);
    if (!fs.existsSync(manifestFile)) throw new Error(`${pkg.name ?? root} carries no ${CONTRACT_MANIFEST_FILE}; not a contract package`);
    const manifest = readJson(manifestFile) as ContractManifest;
    for (const key of ['name', 'role', 'privateStateId', 'artifactPath', 'zkConfigPath', 'digest'] as const) {
        if (!manifest[key]) throw new Error(`${pkg.name}: ${CONTRACT_MANIFEST_FILE} lacks '${key}'`);
    }
    return {
        name: String(pkg.name),
        version: String(pkg.version ?? '0.0.0'),
        root,
        manifest,
        artifactPath: path.join(root, manifest.artifactPath),
        zkConfigPath: path.join(root, manifest.zkConfigPath)
    };
}

/** The digest of the files on disk vs. the one the manifest claims. */
export function contractPackageDigestProblem(resolved: ResolvedContractPackage): string | null {
    const actual = computeArtifactGenerationDigest({
        artifactPath: resolved.artifactPath,
        privateStateId: resolved.manifest.privateStateId,
        zkConfigPath: resolved.zkConfigPath,
        slotWidth: resolved.manifest.slotWidth
    });
    if (actual === resolved.manifest.digest) return null;
    return `${resolved.name}@${resolved.version}: files hash to ${actual.slice(0, 16)}…, ${CONTRACT_MANIFEST_FILE} claims ${resolved.manifest.digest.slice(0, 16)}…`;
}

/** URL of one prover key under a package's asset base. */
export function proverKeyUrl(base: string, layout: ZkAssetLayout, circuit: string): string {
    const root = base.replace(/\/+$/, '');
    return layout === 'flat' ? `${root}/${circuit}.prover` : `${root}/keys/${circuit}.prover`;
}
