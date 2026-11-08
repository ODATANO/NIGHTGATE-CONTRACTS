import { describe, it, expect } from 'vitest';
import { InMemoryPrivateStateProvider } from '@odatano/contract-kit';

describe('InMemoryPrivateStateProvider', () => {
    it('keeps the private states of each contract apart', async () => {
        const provider = new InMemoryPrivateStateProvider();
        await provider.forContract('AB').set('id', 1);
        await provider.forContract('cd').set('id', 2);
        expect(await provider.forContract('ab').get('id')).toBe(1);
        expect(await provider.forContract('cd').get('id')).toBe(2);
        expect(await provider.forContract('ef').get('id')).toBeNull();
        expect(provider.forContract('AB').contractAddress).toBe('ab');
    });

    it('removes one state, one contract, or everything', async () => {
        const provider = new InMemoryPrivateStateProvider();
        await provider.forContract('ab').set('a', 1);
        await provider.forContract('ab').set('b', 2);
        await provider.forContract('cd').set('c', 3);
        await provider.setSigningKey('ab', 'key');

        await provider.forContract('ab').remove('a');
        expect(await provider.forContract('ab').get('a')).toBeNull();
        expect(await provider.forContract('ab').get('b')).toBe(2);

        await provider.forContract('ab').clear();
        expect(await provider.forContract('ab').get('b')).toBeNull();
        expect(await provider.forContract('cd').get('c')).toBe(3);
        expect(await provider.getSigningKey('ab')).toBe('key');

        await provider.clearAll();
        expect(await provider.forContract('cd').get('c')).toBeNull();
        expect(await provider.getSigningKey('ab')).toBeNull();
    });
});
