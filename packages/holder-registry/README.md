# @odatano/contract-holder-registry

The holder registry Compact contract: a holder of a shielded token type passes
one coin of the type through `registerHolder(coin, claim_key)` and gets it back
in the same transaction, so only someone who can spend such a coin registers.
The chain carries `holderEntry(type, claim_key)`, a hash, never the key;
`unregisterHolder` removes it. The claim key is `holderClaimKey(secret)` of
`@odatano/contract-kit`.

```js
import { Contract, ledger, pureCircuits } from '@odatano/contract-holder-registry';
import manifest from '@odatano/contract-holder-registry/contract.json' with { type: 'json' };
```

Prover keys are not in the package: `keys/manifest.json` pins their bytes,
`contract.json#zkAssetUrl` names the release assets.

Peer dependency: `@midnight-ntwrk/compact-runtime` at the exact version in
`contract.json#compactRuntime`.

Repository: https://github.com/ODATANO/NIGHTGATE-CONTRACTS. License: Apache-2.0.
