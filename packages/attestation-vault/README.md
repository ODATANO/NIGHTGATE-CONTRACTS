# @odatano/contract-attestation-vault

The AttestationVault Compact contract, 16 content slots: attestations keyed by
attester and payload, anchored content roots with schema ids, field-bound
predicate / equality / membership proofs, cross-root integrity and diff proofs,
tiered disclosure, document binding. The width-32 twin is
`@odatano/contract-attestation-vault-32`; cross-root proofs work within one width.

```js
import { Contract, ledger, pureCircuits } from '@odatano/contract-attestation-vault';
import manifest from '@odatano/contract-attestation-vault/contract.json' with { type: 'json' };
```

`contract.json` names the role, `privateStateId`, the artifact and zk-config
paths, the circuits, the compiler and runtime versions, the generation digest
and the release assets the prover keys are fetched from. Prover keys are not in
the package: `keys/manifest.json` pins their bytes.

Peer dependency: `@midnight-ntwrk/compact-runtime` at the exact version in
`contract.json#compactRuntime`.

Repository: https://github.com/ODATANO/NIGHTGATE-CONTRACTS. License: Apache-2.0.
