# @odatano/contract-m402-vault

A payment vault: NIGHT goes in, a shielded credit of the same amount comes out,
and services are paid with that credit in private. A merchant checks a payment
by looking up its receipt hash in the public ledger.

- `deposit(amount, nonceSeed)`: unshielded NIGHT into the vault, a shielded
  credit coin of the same amount to the caller's key.
- `pay(serviceId, credit, receiptSecret)`: one credit coin of exactly the
  service's price; the merchant's balance grows, the receipt hash is recorded.
- `redeem(recipient, credit)`: a credit coin back to NIGHT at `recipient`.
- `registerService(salt, price, owner)`, `withdraw(serviceId, amount)`: the
  merchant's side.
- Pure: `creditColor(self)`, `deriveReceipt(secret, serviceId)`,
  `deriveServiceId(owner, salt, price)`.

Coins and secrets are circuit parameters (private inputs), not witnesses: a
caller passes the credit coin and the secrets as call arguments.

```js
import { Contract, ledger, pureCircuits } from '@odatano/contract-m402-vault';

const receipt = pureCircuits.deriveReceipt(receiptSecret, serviceId);
const paid = ledger(contractState.data).receipts.member(receipt);
```

A known deployment on preprod: `8113b23150f65353ab2ceae97946ec7520ff1464e0f4e9458872d5042855fdea`
(deploy transaction `00dc31895e4e302bf4848ccd5b996f0bdf80627de9f74146cd6d68033c76b7eca3`,
credit colour `c91b888af4ad582f522816101795788d8322bc9ffa476b7612021868e2fd2aa5`).
Its verifier keys are the ones this package ships; a recompile with another
compiler or runtime is a new verifier-key set and a new deployment.

Prover keys are not in the package: `keys/manifest.json` pins their bytes,
`contract.json#zkAssetUrl` names the release assets.

Peer dependency: `@midnight-ntwrk/compact-runtime` at the exact version in
`contract.json#compactRuntime`.

Based on m402 by julianariel (https://github.com/julianariel/m402, Apache-2.0),
modified: coins and secrets are circuit parameters instead of witnesses. See
`NOTICE`.

Repository: https://github.com/ODATANO/NIGHTGATE-CONTRACTS. License: Apache-2.0.
