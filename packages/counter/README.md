# @odatano/contract-counter

The one-circuit example lineage: a public counter with `increment()`. The
deploy and call fixture of the NIGHTGATE lanes.

```js
import { Contract, ledger } from '@odatano/contract-counter';
import manifest from '@odatano/contract-counter/contract.json' with { type: 'json' };
```

Prover keys are not in the package: `keys/manifest.json` pins their bytes,
`contract.json#zkAssetUrl` names the release assets.

Peer dependency: `@midnight-ntwrk/compact-runtime` at the exact version in
`contract.json#compactRuntime`.

Repository: https://github.com/ODATANO/NIGHTGATE-CONTRACTS. License: Apache-2.0.
