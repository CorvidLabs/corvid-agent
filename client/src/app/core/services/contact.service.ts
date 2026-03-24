import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { EntityStore } from './entity-store';
import type { Contact, ContactListResponse, ContactPlatform, PlatformLink } from '../models/contact.model';

@Injectable({ providedIn: 'root' })
export class ContactService extends EntityStore<Contact> {
    protected readonly apiPath = '/contacts';

    readonly contacts = this.entities;

    /** Override load to handle { contacts, total } response shape. */
    override async load(): Promise<void> {
        this.loading.set(true);
        try {
            const result = await firstValueFrom(
                this.api.get<ContactListResponse>(this.apiPath),
            );
            this.entities.set(result.contacts);
        } finally {
            this.loading.set(false);
        }
    }

    /** Fetch a single contact with its platform links. */
    async getContact(id: string): Promise<Contact> {
        return this.getById(id);
    }

    async createContact(displayName: string, notes?: string): Promise<Contact> {
        return this.create({ displayName, notes });
    }

    async updateContact(id: string, updates: { displayName?: string; notes?: string | null }): Promise<Contact> {
        return this.update(id, updates);
    }

    async deleteContact(id: string): Promise<void> {
        return this.remove(id);
    }

    async addLink(contactId: string, platform: ContactPlatform, platformId: string): Promise<PlatformLink> {
        const link = await firstValueFrom(
            this.api.post<PlatformLink>(`${this.apiPath}/${contactId}/links`, { platform, platformId }),
        );
        // Refresh the contact in the list to get updated links
        const updated = await this.getById(contactId);
        this.entities.update((list) => list.map((c) => (c.id === contactId ? updated : c)));
        return link;
    }

    async removeLink(contactId: string, linkId: string): Promise<void> {
        await firstValueFrom(
            this.api.delete(`${this.apiPath}/${contactId}/links/${linkId}`),
        );
        const updated = await this.getById(contactId);
        this.entities.update((list) => list.map((c) => (c.id === contactId ? updated : c)));
    }

    async verifyLink(contactId: string, linkId: string): Promise<void> {
        await firstValueFrom(
            this.api.put(`${this.apiPath}/${contactId}/links/${linkId}/verify`, {}),
        );
        const updated = await this.getById(contactId);
        this.entities.update((list) => list.map((c) => (c.id === contactId ? updated : c)));
    }
}
