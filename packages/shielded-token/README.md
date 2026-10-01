# @odatano/contract-shielded-token

A shielded test token: `mint()` mints a fixed amount of this contract's own
shielded token to the caller's zswap public key, which exercises the zswap
circuits (NIGHT is unshielded-only and never touches them).

```js
import { Contract, ledger } from '@odatano/contract-shielded-token';
import manifest from '@odatano/contract-shielded-token/contract.json' with { type: 'json' };
```

Prover keys are not in the package: `keys/manifest.json` pins their bytes,
`contract.json#zkAssetUrl` names the release assets.

Peer dependency: `@midnight-ntwrk/compact-runtime` at the exact version in
`contract.json#compactRuntime`.

Repository: https://github.com/ODATANO/NIGHTGATE-CONTRACTS. License: Apache-2.0.
