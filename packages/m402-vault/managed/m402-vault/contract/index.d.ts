import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
}

export type ImpureCircuits<PS> = {
  registerService(context: __compactRuntime.CircuitContext<PS>,
                  salt_0: Uint8Array,
                  price_0: bigint,
                  owner_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  deposit(context: __compactRuntime.CircuitContext<PS>,
          amount_0: bigint,
          nonceSeed_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  pay(context: __compactRuntime.CircuitContext<PS>,
      serviceId_0: Uint8Array,
      credit_0: { nonce: Uint8Array, color: Uint8Array, value: bigint },
      receiptSecret_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  redeem(context: __compactRuntime.CircuitContext<PS>,
         recipient_0: Uint8Array,
         credit_0: { nonce: Uint8Array, color: Uint8Array, value: bigint }): Promise<__compactRuntime.CircuitResults<PS, []>>;
  withdraw(context: __compactRuntime.CircuitContext<PS>,
           serviceId_0: Uint8Array,
           amount_0: bigint): Promise<__compactRuntime.CircuitResults<PS, []>>;
}

export type ProvableCircuits<PS> = {
  registerService(context: __compactRuntime.CircuitContext<PS>,
                  salt_0: Uint8Array,
                  price_0: bigint,
                  owner_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  deposit(context: __compactRuntime.CircuitContext<PS>,
          amount_0: bigint,
          nonceSeed_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  pay(context: __compactRuntime.CircuitContext<PS>,
      serviceId_0: Uint8Array,
      credit_0: { nonce: Uint8Array, color: Uint8Array, value: bigint },
      receiptSecret_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  redeem(context: __compactRuntime.CircuitContext<PS>,
         recipient_0: Uint8Array,
         credit_0: { nonce: Uint8Array, color: Uint8Array, value: bigint }): Promise<__compactRuntime.CircuitResults<PS, []>>;
  withdraw(context: __compactRuntime.CircuitContext<PS>,
           serviceId_0: Uint8Array,
           amount_0: bigint): Promise<__compactRuntime.CircuitResults<PS, []>>;
}

export type PureCircuits = {
  creditColor(self_0: { bytes: Uint8Array }): Uint8Array;
  deriveReceipt(secret_0: Uint8Array, serviceId_0: Uint8Array): Uint8Array;
  deriveServiceId(owner_0: Uint8Array, salt_0: Uint8Array, price_0: bigint): Uint8Array;
}

export type Circuits<PS> = {
  creditColor(context: __compactRuntime.CircuitContext<PS>,
              self_0: { bytes: Uint8Array }): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  deriveReceipt(context: __compactRuntime.CircuitContext<PS>,
                secret_0: Uint8Array,
                serviceId_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  deriveServiceId(context: __compactRuntime.CircuitContext<PS>,
                  owner_0: Uint8Array,
                  salt_0: Uint8Array,
                  price_0: bigint): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  registerService(context: __compactRuntime.CircuitContext<PS>,
                  salt_0: Uint8Array,
                  price_0: bigint,
                  owner_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  deposit(context: __compactRuntime.CircuitContext<PS>,
          amount_0: bigint,
          nonceSeed_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  pay(context: __compactRuntime.CircuitContext<PS>,
      serviceId_0: Uint8Array,
      credit_0: { nonce: Uint8Array, color: Uint8Array, value: bigint },
      receiptSecret_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  redeem(context: __compactRuntime.CircuitContext<PS>,
         recipient_0: Uint8Array,
         credit_0: { nonce: Uint8Array, color: Uint8Array, value: bigint }): Promise<__compactRuntime.CircuitResults<PS, []>>;
  withdraw(context: __compactRuntime.CircuitContext<PS>,
           serviceId_0: Uint8Array,
           amount_0: bigint): Promise<__compactRuntime.CircuitResults<PS, []>>;
}

export type Ledger = {
  servicePrice: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): bigint;
    [Symbol.iterator](): Iterator<[Uint8Array, bigint]>
  };
  serviceOwner: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  receipts: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  merchantBalance: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): bigint;
    [Symbol.iterator](): Iterator<[Uint8Array, bigint]>
  };
  readonly mintCounter: bigint;
}

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): Promise<__compactRuntime.ConstructorResult<PS>>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
export declare const expectedVk: Record<string, string>;
export declare const circuitSignatures: __compactRuntime.CircuitSignatures;
export declare const declaredInterfaces: __compactRuntime.DeclaredInterfaces;
