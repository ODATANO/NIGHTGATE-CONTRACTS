/**
 * In-memory PrivateStateProvider for contracts without private state (the
 * vault passes `ctx.privateState` through unchanged). Implements the full
 * midnight-js surface so findDeployedContract/callTx is satisfied.
 */

export class InMemoryPrivateStateProvider {
    private readonly states = new Map<unknown, unknown>();
    private readonly signingKeys = new Map<unknown, unknown>();
    private contractAddress: unknown = undefined;

    setContractAddress(address: unknown): void { this.contractAddress = address; }

    async set(privateStateId: unknown, state: unknown): Promise<void> { this.states.set(privateStateId, state); }
    async get(privateStateId: unknown): Promise<unknown | null> { return this.states.has(privateStateId) ? this.states.get(privateStateId) : null; }
    async remove(privateStateId: unknown): Promise<void> { this.states.delete(privateStateId); }
    async clear(): Promise<void> { this.states.clear(); }

    async setSigningKey(address: unknown, signingKey: unknown): Promise<void> { this.signingKeys.set(address, signingKey); }
    async getSigningKey(address: unknown): Promise<unknown | null> { return this.signingKeys.has(address) ? this.signingKeys.get(address) : null; }
    async removeSigningKey(address: unknown): Promise<void> { this.signingKeys.delete(address); }
    async clearSigningKeys(): Promise<void> { this.signingKeys.clear(); }

    async exportPrivateStates(): Promise<unknown> { return { privateStates: {}, contractStates: {} }; }
    async importPrivateStates(): Promise<unknown> { return { imported: [], skipped: [], errors: [] }; }
    async exportSigningKeys(): Promise<unknown> { return { signingKeys: {} }; }
    async importSigningKeys(): Promise<unknown> { return { imported: [], skipped: [], errors: [] }; }
}
