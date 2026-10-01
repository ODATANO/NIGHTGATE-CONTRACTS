# @odatano/contract-token-factory

Shielded tokens on demand: one deploy serves any number of tokens, each named
by its issuer.

- `domain = persistentHash(["tokenfactory:domain", issuerKey, name])`, token type
  = `tokenType(domain, contractAddress)`. Another issuer or another name is
  another type.
- `issuerKey = persistentHash(["tokenfactory:issuer", secret])`; the secret stays
  with the issuer as the `issuerSecret` witness, so nobody else mints more of a
  token.
- `mint(name, amount, recipient)` mints to any Zswap coin public key and keeps
  issuer, name and circulating supply in the public ledger map `tokens`.
- `burn(domain, coin)` takes coins out of circulation and lowers the supply.
- No transfer logic: coins move with Zswap itself, so swaps settle without a
  contract call.

```js
import { Contract, ledger, pureCircuits } from '@odatano/contract-token-factory';
import { tokenTypeOf, prepareMint, prepareBurn, tokenName } from '@odatano/contract-kit';

const { domain, type } = await tokenTypeOf(pureCircuits, { issuerSecret, name: 'CREDIT', contractAddress });
```

A known deployment on preprod: `d96fcca18b3ca748af0c0934d88a47113bb52e586afe334f3d9f5e66e5aea02c`
(deploy transaction `007fd4723a6f3cd0a442f58869e8f05b8247dee3d28870496b0e14832b8cf01252`).
Its verifier keys are the ones this package ships; a recompile with another
compiler or runtime is a new verifier-key set and a new deployment.

Prover keys are not in the package: `keys/manifest.json` pins their bytes,
`contract.json#zkAssetUrl` names the release assets.

Peer dependency: `@midnight-ntwrk/compact-runtime` at the exact version in
`contract.json#compactRuntime`.

Repository: https://github.com/ODATANO/NIGHTGATE-CONTRACTS. License: Apache-2.0.
