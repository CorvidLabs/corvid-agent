import { test, expect, describe, beforeEach } from 'bun:test';
import { LRUCache } from '../memory/cache';

describe('LRUCache', () => {
    let cache: LRUCache<string>;

    beforeEach(() => {
        cache = new LRUCache<string>({ maxSize: 3, ttlMs: 1000 });
    });

    test('get returns undefined for missing key', () => {
        expect(cache.get('missing')).toBeUndefined();
    });

    test('set and get a value', () => {
        cache.set('key1', 'value1');
        expect(cache.get('key1')).toBe('value1');
    });

    test('evicts oldest entry when at capacity', () => {
        cache.set('a', '1');
        cache.set('b', '2');
        cache.set('c', '3');
        cache.set('d', '4'); // should evict 'a'

        expect(cache.get('a')).toBeUndefined();
        expect(cache.get('b')).toBe('2');
        expect(cache.get('d')).toBe('4');
    });

    test('accessing a key promotes it (LRU)', () => {
        cache.set('a', '1');
        cache.set('b', '2');
        cache.set('c', '3');

        // Access 'a' to promote it
        cache.get('a');

        // Now 'b' is the oldest
        cache.set('d', '4'); // evicts 'b'

        expect(cache.get('a')).toBe('1');
        expect(cache.get('b')).toBeUndefined();
    });

    test('expired entries return undefined', async () => {
        const shortCache = new LRUCache<string>({ maxSize: 10, ttlMs: 50 });
        shortCache.set('ephemeral', 'value');

        expect(shortCache.get('ephemeral')).toBe('value');

        // Wait well beyond TTL — Windows CI timers can be coarse (~15ms granularity)
        await new Promise((resolve) => setTimeout(resolve, 150));

        expect(shortCache.get('ephemeral')).toBeUndefined();
    });

    test('delete removes a key', () => {
        cache.set('key1', 'value1');
        expect(cache.delete('key1')).toBe(true);
        expect(cache.get('key1')).toBeUndefined();
    });

    test('delete returns false for missing key', () => {
        expect(cache.delete('nonexistent')).toBe(false);
    });

    test('invalidatePrefix removes matching keys', () => {
        cache = new LRUCache<string>({ maxSize: 10 });
        cache.set('agent1:key1', 'a');
        cache.set('agent1:key2', 'b');
        cache.set('agent2:key1', 'c');

        const removed = cache.invalidatePrefix('agent1:');
        expect(removed).toBe(2);
        expect(cache.get('agent1:key1')).toBeUndefined();
        expect(cache.get('agent2:key1')).toBe('c');
    });

    test('clear removes all entries', () => {
        cache.set('a', '1');
        cache.set('b', '2');
        cache.clear();

        expect(cache.size).toBe(0);
        expect(cache.get('a')).toBeUndefined();
    });

    test('size reports entry count', () => {
        expect(cache.size).toBe(0);
        cache.set('a', '1');
        expect(cache.size).toBe(1);
        cache.set('b', '2');
        expect(cache.size).toBe(2);
    });

    test('prune removes expired entries', async () => {
        const shortCache = new LRUCache<string>({ maxSize: 10, ttlMs: 50 });
        shortCache.set('old', 'val');
        shortCache.set('old2', 'val2');

        // Wait well beyond TTL — Windows CI timers can be coarse (~15ms granularity)
        await new Promise((resolve) => setTimeout(resolve, 150));

        // Add a new non-expired entry
        shortCache.set('new', 'val3');

        const pruned = shortCache.prune();
        expect(pruned).toBe(2);
        expect(shortCache.size).toBe(1);
        expect(shortCache.get('new')).toBe('val3');
    });

    test('overwriting a key resets TTL', () => {
        cache.set('key', 'old');
        cache.set('key', 'new');
        expect(cache.get('key')).toBe('new');
    });
});
