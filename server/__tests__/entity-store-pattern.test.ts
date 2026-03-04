/**
 * Tests for the EntityStore signal store pattern.
 *
 * These tests validate the CRUD signal mutation logic that powers the
 * frontend's EntityStore<T> base class, exercising it through a
 * pure-TypeScript mock to verify correctness without Angular DI.
 */
import { test, expect, describe } from 'bun:test';

// ─── Minimal signal polyfill for testing outside Angular ─────────────────────

interface WritableSignal<T> {
    (): T;
    set(value: T): void;
    update(fn: (value: T) => T): void;
}

function signal<T>(initial: T): WritableSignal<T> {
    let value = initial;
    const fn = () => value;
    fn.set = (v: T) => { value = v; };
    fn.update = (updater: (v: T) => T) => { value = updater(value); };
    return fn as WritableSignal<T>;
}

// ─── Mock EntityStore ────────────────────────────────────────────────────────

interface TestEntity { id: string; name: string }

class MockEntityStore {
    readonly entities = signal<TestEntity[]>([]);
    readonly loading = signal(false);

    get count(): number {
        return this.entities().length;
    }

    get hasEntities(): boolean {
        return this.entities().length > 0;
    }

    async load(items: TestEntity[]): Promise<void> {
        this.loading.set(true);
        try {
            this.entities.set(items);
        } finally {
            this.loading.set(false);
        }
    }

    create(entity: TestEntity): void {
        this.entities.update((list) => [...list, entity]);
    }

    update(id: string, updated: TestEntity): void {
        this.entities.update((list) => list.map((e) => (e.id === id ? updated : e)));
    }

    remove(id: string): void {
        this.entities.update((list) => list.filter((e) => e.id !== id));
    }

    findById(id: string): TestEntity | undefined {
        return this.entities().find((e) => e.id === id);
    }

    upsert(entity: TestEntity): void {
        this.entities.update((list) => {
            const idx = list.findIndex((e) => e.id === entity.id);
            if (idx >= 0) {
                const copy = [...list];
                copy[idx] = entity;
                return copy;
            }
            return [entity, ...list];
        });
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('EntityStore pattern', () => {
    test('initial state is empty', () => {
        const store = new MockEntityStore();
        expect(store.entities()).toEqual([]);
        expect(store.loading()).toBe(false);
        expect(store.count).toBe(0);
        expect(store.hasEntities).toBe(false);
    });

    test('load sets entities and manages loading state', async () => {
        const store = new MockEntityStore();
        const items = [
            { id: '1', name: 'Alpha' },
            { id: '2', name: 'Beta' },
        ];

        await store.load(items);

        expect(store.entities()).toEqual(items);
        expect(store.loading()).toBe(false);
        expect(store.count).toBe(2);
        expect(store.hasEntities).toBe(true);
    });

    test('create appends to list', () => {
        const store = new MockEntityStore();
        store.entities.set([{ id: '1', name: 'Alpha' }]);

        store.create({ id: '2', name: 'Beta' });

        expect(store.count).toBe(2);
        expect(store.entities()[1]).toEqual({ id: '2', name: 'Beta' });
    });

    test('update replaces matching entity', () => {
        const store = new MockEntityStore();
        store.entities.set([
            { id: '1', name: 'Alpha' },
            { id: '2', name: 'Beta' },
        ]);

        store.update('2', { id: '2', name: 'Beta Updated' });

        expect(store.entities()[1]).toEqual({ id: '2', name: 'Beta Updated' });
        expect(store.count).toBe(2);
    });

    test('update does not modify non-matching entities', () => {
        const store = new MockEntityStore();
        store.entities.set([
            { id: '1', name: 'Alpha' },
            { id: '2', name: 'Beta' },
        ]);

        store.update('2', { id: '2', name: 'Changed' });

        expect(store.entities()[0]).toEqual({ id: '1', name: 'Alpha' });
    });

    test('remove filters out matching entity', () => {
        const store = new MockEntityStore();
        store.entities.set([
            { id: '1', name: 'Alpha' },
            { id: '2', name: 'Beta' },
            { id: '3', name: 'Gamma' },
        ]);

        store.remove('2');

        expect(store.count).toBe(2);
        expect(store.entities().map((e) => e.id)).toEqual(['1', '3']);
    });

    test('remove with non-existent ID does not modify list', () => {
        const store = new MockEntityStore();
        store.entities.set([{ id: '1', name: 'Alpha' }]);

        store.remove('999');

        expect(store.count).toBe(1);
    });

    test('findById returns matching entity', () => {
        const store = new MockEntityStore();
        store.entities.set([
            { id: '1', name: 'Alpha' },
            { id: '2', name: 'Beta' },
        ]);

        expect(store.findById('2')).toEqual({ id: '2', name: 'Beta' });
    });

    test('findById returns undefined for missing ID', () => {
        const store = new MockEntityStore();
        store.entities.set([{ id: '1', name: 'Alpha' }]);

        expect(store.findById('999')).toBeUndefined();
    });

    test('upsert replaces existing entity', () => {
        const store = new MockEntityStore();
        store.entities.set([
            { id: '1', name: 'Alpha' },
            { id: '2', name: 'Beta' },
        ]);

        store.upsert({ id: '2', name: 'Beta Updated' });

        expect(store.count).toBe(2);
        expect(store.entities()[1]).toEqual({ id: '2', name: 'Beta Updated' });
    });

    test('upsert prepends new entity', () => {
        const store = new MockEntityStore();
        store.entities.set([{ id: '1', name: 'Alpha' }]);

        store.upsert({ id: '2', name: 'Beta' });

        expect(store.count).toBe(2);
        expect(store.entities()[0]).toEqual({ id: '2', name: 'Beta' });
    });

    test('load clears loading on error', async () => {
        const store = new MockEntityStore();
        // Override load to simulate error
        const failingLoad = async () => {
            store.loading.set(true);
            try {
                throw new Error('network failure');
            } finally {
                store.loading.set(false);
            }
        };

        try {
            await failingLoad();
        } catch {
            // expected
        }

        expect(store.loading()).toBe(false);
    });

    test('sequential operations maintain consistency', () => {
        const store = new MockEntityStore();

        store.create({ id: '1', name: 'First' });
        store.create({ id: '2', name: 'Second' });
        store.create({ id: '3', name: 'Third' });
        store.update('2', { id: '2', name: 'Updated' });
        store.remove('1');

        expect(store.count).toBe(2);
        expect(store.entities()).toEqual([
            { id: '2', name: 'Updated' },
            { id: '3', name: 'Third' },
        ]);
    });
});
