import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
}

export type ImpureCircuits<PS> = {
  registerHolder(context: __compactRuntime.CircuitContext<PS>,
                 coin_0: { nonce: Uint8Array, color: Uint8Array, value: bigint },
                 claim_key_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  unregisterHolder(context: __compactRuntime.CircuitContext<PS>,
                   token_type_0: Uint8Array,
                   claim_key_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  registerHolder(context: __compactRuntime.CircuitContext<PS>,
                 coin_0: { nonce: Uint8Array, color: Uint8Array, value: bigint },
                 claim_key_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  unregisterHolder(context: __compactRuntime.CircuitContext<PS>,
                   token_type_0: Uint8Array,
                   claim_key_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
  holderEntry(token_type_0: Uint8Array, claim_key_0: Uint8Array): Uint8Array;
}

export type Circuits<PS> = {
  holderEntry(context: __compactRuntime.CircuitContext<PS>,
              token_type_0: Uint8Array,
              claim_key_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  registerHolder(context: __compactRuntime.CircuitContext<PS>,
                 coin_0: { nonce: Uint8Array, color: Uint8Array, value: bigint },
                 claim_key_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  unregisterHolder(context: __compactRuntime.CircuitContext<PS>,
                   token_type_0: Uint8Array,
                   claim_key_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  holders: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
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
