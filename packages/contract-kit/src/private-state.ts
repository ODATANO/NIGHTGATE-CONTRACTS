/**
 * In-memory PrivateStateProvider for contracts without private state (the
 * vault passes `ctx.privateState` through unchanged). Implements the full
 * midnight-js surface so findDeployedContract/callTx is satisfied.
 */

/** The private states of one contract, as `forContract` hands them out. */
export interface InMemoryContractPrivateStates {
    readonly contractAddress: string;
    set(privateStateId: unknown, state: unknown): Promise<void>;
    get(privateStateId: unknown): Promise<unknown | null>;
    remove(privateStateId: unknown): Promise<void>;
    clear(): Promise<void>;
    exportPrivateStates(): Promise<unknown>;
    importPrivateStates(): Promise<unknown>;
}

export class InMemoryPrivateStateProvider {
    private readonly statesByContract = new Map<string, Map<unknown, unknown>>();
    private readonly signingKeys = new Map<unknown, unknown>();

    forContract(contractAddress: string): InMemoryContractPrivateStates {
        const address = String(contractAddress).toLowerCase();
        const states = (): Map<unknown, unknown> => {
            let held = this.statesByContract.get(address);
            if (!held) this.statesByContract.set(address, held = new Map());
            return held;
        };
        return {
            contractAddress: address,
            set: async (privateStateId, state) => { states().set(privateStateId, state); },
            get: async (privateStateId) => (states().has(privateStateId) ? states().get(privateStateId) : null),
            remove: async (privateStateId) => { states().delete(privateStateId); },
            clear: async () => { this.statesByContract.delete(address); },
            exportPrivateStates: async () => ({ privateStates: {}, contractStates: {} }),
            importPrivateStates: async () => ({ imported: [], skipped: [], errors: [] })
        };
    }

    async clearAll(): Promise<void> {
        this.statesByContract.clear();
        this.signingKeys.clear();
    }

    async setSigningKey(address: unknown, signingKey: unknown): Promise<void> { this.signingKeys.set(address, signingKey); }
    async getSigningKey(address: unknown): Promise<unknown | null> { return this.signingKeys.has(address) ? this.signingKeys.get(address) : null; }
    async removeSigningKey(address: unknown): Promise<void> { this.signingKeys.delete(address); }
    async clearSigningKeys(): Promise<void> { this.signingKeys.clear(); }

    async exportSigningKeys(): Promise<unknown> { return { signingKeys: {} }; }
    async importSigningKeys(): Promise<unknown> { return { imported: [], skipped: [], errors: [] }; }
}
