# NIGHTGATE contracts

The Compact contract lineages of [NIGHTGATE](https://github.com/ODATANO/NIGHTGATE),
one npm package each, and their companion code.

| Package | Role | Contents |
|---|---|---|
| `@odatano/contract-kit` | companion code | hex, hashing, content roots, set roots, claim keys, vault witnesses and call helpers, artifact digest, key manifest, package resolution |
| `@odatano/contract-attestation-vault` | attestation, 16 slots | attestations, anchored content roots, field-bound and cross-root proofs, tiered disclosure |
| `@odatano/contract-attestation-vault-32` | attestation, 32 slots | the width-32 twin |
| `@odatano/contract-holder-registry` | holder registry | a token holder registers a claim key by a coin round trip |
| `@odatano/contract-shielded-token` | token | shielded test token exercising the zswap circuits |
| `@odatano/contract-token-factory` | token | shielded tokens on demand, named by their issuer, with a supply ledger and burn |
| `@odatano/contract-counter` | example | one circuit, the deploy and call fixture |

## Layout of a lineage package

```
packages/<name>/
  package.json              type: module; "." = the compiled contract class; peer: @midnight-ntwrk/compact-runtime (exact)
  contract.json             name, role, privateStateId, artifactPath, zkConfigPath, slotWidth?, circuits,
                            compiler + runtime versions, generation digest, zkAssetUrl + zkAssetLayout
  src/<name>.compact        the source
  managed/<name>/compiler/  contract-info.json
  managed/<name>/contract/  index.js, index.d.ts, index.js.map
  managed/<name>/zkir/      *.zkir, *.bzkir
  managed/<name>/keys/      *.verifier, manifest.json
```

Prover keys are build output. They are not committed and not in the npm
tarball: `keys/manifest.json` pins their sha256 and size, CI rebuilds them
from the source with the pinned compiler, and a release tag uploads them as
release assets under `contract.json#zkAssetUrl` (`<url>/<circuit>.prover`).
A server fetches a missing key on first need and verifies it against the
manifest.

## Versioning

Per package. Major = a new verifier-key set (consumers redeploy and re-anchor);
a compiler or runtime bump changes the keys, so it is a major by construction.
Minor = additive surface with identical keys and identical module bytes (a pure
circuit in a new file, documentation outside the source). Patch = packaging.
Any change to `contract/index.js` bytes, a comment in the `.compact` source
included (the module embeds source positions), is a new generation digest.

## Working on it

```bash
npm install                # npm >= 11 (workspaces with peer dependencies)
npm run build              # the kit (tsc)
npm run check              # manifests, contract.json, parity, packaging, tests
npm run test:circuits      # the real vault circuits on compact-runtime
```

Recompiling a lineage (Linux, macOS or WSL; the compiler has no Windows build):

```bash
curl -fsSL https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
scripts/compile.sh attestation-vault   # pins the compiler version of the committed artifact
npm run manifest attestation-vault
npm run contract-json attestation-vault
```

Commit `src/`, `managed/` (without the prover keys) and `contract.json`
together; CI fails when a fresh compile differs from the commit
(`scripts/check-rebuild.mjs`).

## Releasing

Bump the package version, run `npm run contract-json` (the asset URL follows
the version), commit, then tag `<name>-v<version>`. The release workflow
rebuilds the prover keys, verifies them against the manifest and uploads them
as release assets of that tag. Push at most three tags per `git push`: GitHub
raises no push event for more, and the workflow never starts. Publishing to npm is a local step with the
account's second factor:

```bash
npm run check
npm publish -w packages/contract-kit --access public        # the kit first
npm publish -w packages/<name> --access public              # then the lineage, after its tag
```

`prepublishOnly` of every package runs the repository check first. `npm publish` of a lineage package runs no build: the tarball is the committed
module, zkir, verifier keys, manifest, source and contract.json (`npm run
check:pack` shows it). The kit builds on `prepack`.

## License

Apache-2.0
