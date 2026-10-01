// The lineage packages of this repository, in build order.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Directory name under packages/ = contract name = compact source name. */
export const LINEAGES = Object.freeze([
    { name: 'counter', role: 'example', privateStateId: 'counterPrivateState' },
    { name: 'shielded-token', role: 'token', privateStateId: 'shieldedTokenPrivateState' },
    { name: 'token-factory', role: 'token', privateStateId: 'tokenFactoryPrivateState' },
    { name: 'holder-registry', role: 'holder-registry', privateStateId: 'holderRegistryPrivateState' },
    { name: 'attestation-vault', role: 'attestation', privateStateId: 'attestationVaultPrivateState', slotWidth: 16 },
    { name: 'attestation-vault-32', role: 'attestation', privateStateId: 'attestationVaultPrivateState', slotWidth: 32 }
]);

export function packageDir(name) {
    return path.join(REPO_ROOT, 'packages', name);
}

export function managedDir(name) {
    return path.join(packageDir(name), 'managed', name);
}

export function lineage(name) {
    const l = LINEAGES.find(l => l.name === name);
    if (!l) throw new Error(`unknown lineage '${name}' (known: ${LINEAGES.map(l => l.name).join(', ')})`);
    return l;
}
