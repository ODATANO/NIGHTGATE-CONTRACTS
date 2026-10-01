# @odatano/contract-attestation-vault-32

The AttestationVault Compact contract with 32 content slots: the same circuits
and semantics as `@odatano/contract-attestation-vault`, content trees of depth
5, 32-bit integrity masks. Cross-root proofs work within one width only.

```js
import { Contract, ledger, pureCircuits } from '@odatano/contract-attestation-vault-32';
import manifest from '@odatano/contract-attestation-vault-32/contract.json' with { type: 'json' };
```

`contract.json` names the role, `slotWidth` 32, `privateStateId`, the artifact
and zk-config paths, the circuits, the compiler and runtime versions, the
generation digest and the release assets the prover keys are fetched from.
Prover keys are not in the package: `keys/manifest.json` pins their bytes.

Peer dependency: `@midnight-ntwrk/compact-runtime` at the exact version in
`contract.json#compactRuntime`.

Repository: https://github.com/ODATANO/NIGHTGATE-CONTRACTS. License: Apache-2.0.
