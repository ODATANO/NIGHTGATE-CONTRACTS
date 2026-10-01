import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Token = { issuer: Uint8Array; name: Uint8Array; supply: bigint };

export type Witnesses<PS> = {
  issuerSecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
}

export type ImpureCircuits<PS> = {
  mint(context: __compactRuntime.CircuitContext<PS>,
       name_0: Uint8Array,
       amount_0: bigint,
       recipient_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, []>;
  burn(context: __compactRuntime.CircuitContext<PS>,
       domain_0: Uint8Array,
       coin_0: { nonce: Uint8Array, color: Uint8Array, value: bigint }): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  mint(context: __compactRuntime.CircuitContext<PS>,
       name_0: Uint8Array,
       amount_0: bigint,
       recipient_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, []>;
  burn(context: __compactRuntime.CircuitContext<PS>,
       domain_0: Uint8Array,
       coin_0: { nonce: Uint8Array, color: Uint8Array, value: bigint }): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
  issuerKey(secret_0: Uint8Array): Uint8Array;
  domainOf(issuer_0: Uint8Array, name_0: Uint8Array): Uint8Array;
}

export type Circuits<PS> = {
  issuerKey(context: __compactRuntime.CircuitContext<PS>, secret_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  domainOf(context: __compactRuntime.CircuitContext<PS>,
           issuer_0: Uint8Array,
           name_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  mint(context: __compactRuntime.CircuitContext<PS>,
       name_0: Uint8Array,
       amount_0: bigint,
       recipient_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, []>;
  burn(context: __compactRuntime.CircuitContext<PS>,
       domain_0: Uint8Array,
       coin_0: { nonce: Uint8Array, color: Uint8Array, value: bigint }): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  tokens: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Token;
    [Symbol.iterator](): Iterator<[Uint8Array, Token]>
  };
  readonly round: bigint;
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
