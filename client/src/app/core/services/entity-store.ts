/**
 * EntityStore<T> — generic signal store for CRUD entity management.
 *
 * Provides a typed facade over Angular signals for common list-based
 * entity patterns: load, create, update, delete — with loading state.
 *
 * Usage:
 *   class MyService extends EntityStore<MyEntity> {
 *       protected apiPath = '/my-entities';
 *   }
 *
 * Subclasses can override any method for custom behavior (e.g. query params,
 * different endpoint shapes, additional side effects).
 */

import { computed, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { firstValueFrom } from 'rxjs';

export abstract class EntityStore<T extends { id: string }> {
    protected readonly api = inject(ApiService);

    /** The API base path for this entity (e.g. '/agents', '/skill-bundles'). */
    protected abstract readonly apiPath: string;

    /** The full entity list. */
    readonly entities = signal<T[]>([]);

    /** Whether a load operation is in progress. */
    readonly loading = signal(false);

    /** Number of entities currently loaded. */
    readonly count = computed(() => this.entities().length);

    /** Whether any entities are loaded. */
    readonly hasEntities = computed(() => this.entities().length > 0);

    /** Load all entities from the API. Subclasses can override for custom paths. */
    async load(): Promise<void> {
        this.loading.set(true);
        try {
            const items = await firstValueFrom(this.api.get<T[]>(this.apiPath));
            this.entities.set(items);
        } finally {
            this.loading.set(false);
        }
    }

    /** Fetch a single entity by ID without modifying the list signal. */
    async getById(id: string): Promise<T> {
        return firstValueFrom(this.api.get<T>(`${this.apiPath}/${id}`));
    }

    /** Create a new entity and append it to the list. */
    async create(input: unknown): Promise<T> {
        const entity = await firstValueFrom(this.api.post<T>(this.apiPath, input));
        this.entities.update((list) => [...list, entity]);
        return entity;
    }

    /** Update an entity by ID and replace it in the list. */
    async update(id: string, input: unknown): Promise<T> {
        const entity = await firstValueFrom(this.api.put<T>(`${this.apiPath}/${id}`, input));
        this.entities.update((list) => list.map((e) => (e.id === id ? entity : e)));
        return entity;
    }

    /** Delete an entity by ID and remove it from the list. */
    async remove(id: string): Promise<void> {
        await firstValueFrom(this.api.delete(`${this.apiPath}/${id}`));
        this.entities.update((list) => list.filter((e) => e.id !== id));
    }

    /** Find an entity in the current list by ID (no API call). */
    findById(id: string): T | undefined {
        return this.entities().find((e) => e.id === id);
    }

    /**
     * Upsert an entity into the list (used for WebSocket push updates).
     * If an entity with the same ID exists, replace it; otherwise prepend.
     */
    upsert(entity: T): void {
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
