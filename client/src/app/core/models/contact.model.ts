export type ContactPlatform = 'discord' | 'algochat' | 'github';

export interface PlatformLink {
    id: string;
    tenantId: string;
    contactId: string;
    platform: ContactPlatform;
    platformId: string;
    verified: boolean;
    createdAt: string;
}

export interface Contact {
    id: string;
    tenantId: string;
    displayName: string;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
    links?: PlatformLink[];
}

export interface ContactListResponse {
    contacts: Contact[];
    total: number;
}
