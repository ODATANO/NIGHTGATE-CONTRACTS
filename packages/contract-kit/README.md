# @odatano/contract-kit

Companion code of the NIGHTGATE contract lineages: everything a server, a
browser dApp or a transaction builder needs to hash, prove and verify against
the circuits without owning a copy of the rules.

```bash
npm install @odatano/contract-kit @midnight-ntwrk/compact-runtime@0.16.0
```

## `@odatano/contract-kit` (browser-safe)

- `hexToBytes`, `hexToBytes32`, `bytesToHex`, `normalizeHex`: the one hex codec.
- `blake2b256Hex`, `fromHex32`, `emptyLeafKeyHex`: the on-chain hashing scheme and the padding-slot key.
- `canonicalize`, `fieldKeyHex`, `scaleFieldValue`, `buildDocumentContentRoot`, `computeSchemaId`: a document's salted content root and schema id over the vault's pure circuits.
- `buildMembershipSet`, `membershipPathFor`, `canonicalSetDigests`: the canonical depth-6 membership-set tree.
- `computeRecordKey`, `computeFieldPredicateClaimKey`, `computeFieldEqualityClaimKey`, `computeFieldMembershipClaimKey`, `computeDocumentIntegrityClaimKey`, `computeDocumentDiffClaimKey`, `readPredicateResult`, `anchorOf`: claim keys byte-identical to the circuit, and the ledger read.
- `buildAttestationVaultWitnesses`, `deriveAttestationSecret`, `generateAttestationSecret`, `sealAttestationSecret`, `openAttestationSecret`: the vault witnesses and the attester secret.
- `prepareAttest`, `prepareAnchorContentRoot`, `prepareProveFieldPredicate`, … , `recordKeyOf`: typed call inputs for every vault circuit.
- `holderClaimKey`, `holderEntry`, `HOLDER_REGISTRY_CIRCUITS`: the holder registry's claim key rule.
- `tokenName`, `issuerKeyOf`, `domainOf`, `tokenTypeOf`, `tokenFactoryWitnesses`, `prepareMint`, `prepareBurn`, `TOKEN_FACTORY_CIRCUITS`: the token factory's names, types and call inputs.
- `InMemoryPrivateStateProvider`: for contracts without private state.

## `@odatano/contract-kit/node`

- `computeArtifactGenerationDigest`, `artifactGenerationMatch`, `effectiveModuleFormat`: the generation digest over module, verifier keys, zkir and key manifest.
- `readProverKeyManifest`, `buildKeyManifest`, `checkKeyManifest`, `verifierCircuits`, `missingProverKeys`, `keyMatchesManifest`: `keys/manifest.json`.
- `resolveContractPackage`, `readContractPackage`, `contractPackageDigestProblem`, `proverKeyUrl`: an installed lineage package and its `contract.json`.

## License

Apache-2.0
