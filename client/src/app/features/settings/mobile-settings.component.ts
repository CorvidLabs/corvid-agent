import { Component, ChangeDetectionStrategy, inject, signal, ElementRef, OnInit } from '@angular/core';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { firstValueFrom } from 'rxjs';
import QRCode from 'qrcode';
import { SECTION_STYLES } from './settings-shared.styles';

interface PSKContact {
    id: string;
    nickname: string;
    network: string;
    mobileAddress: string | null;
    active: boolean;
    createdAt: string;
    uri?: string;
}

@Component({
    selector: 'app-mobile-settings',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [],
    template: `
        <div class="settings__section">
            <h3 class="section-toggle" (click)="toggleSection()">
                <span class="section-chevron" [class.section-chevron--open]="!collapsed()">&#9654;</span>
                Connect Mobile
                @if (pskContacts().length > 0) {
                    <span class="section-badge">{{ pskContacts().length }}</span>
                }
            </h3>
            @if (!collapsed()) {
                <p class="connect-desc">
                    Share your agent with friends. Each contact gets their own encrypted PSK channel.
                </p>

                <!-- Contact list -->
                @if (pskContacts().length > 0) {
                    <div class="contact-list">
                        @for (contact of pskContacts(); track contact.id) {
                            <div class="contact-card contact-interactive">
                                <div class="contact-header">
                                    @if (editingContactId() === contact.id) {
                                        <input
                                            class="contact-nickname-input"
                                            [value]="editingNickname()"
                                            (input)="editingNickname.set(asInputValue($event))"
                                            (keydown.enter)="saveNickname(contact.id)"
                                            (keydown.escape)="cancelEditNickname()"
                                        />
                                        <button class="icon-btn" (click)="saveNickname(contact.id)" title="Save">&#10003;</button>
                                        <button class="icon-btn" (click)="cancelEditNickname()" title="Cancel">&#10005;</button>
                                    } @else {
                                        <span class="contact-nickname" (dblclick)="startEditNickname(contact)">{{ contact.nickname }}</span>
                                        <button class="icon-btn" (click)="startEditNickname(contact)" title="Rename">&#9998;</button>
                                    }
                                    <span class="contact-status" [class.contact-status--active]="contact.mobileAddress"
                                          [class.contact-status--waiting]="!contact.mobileAddress">
                                        {{ contact.mobileAddress ? 'Connected' : 'Waiting' }}
                                    </span>
                                </div>
                                @if (contact.mobileAddress) {
                                    <code class="contact-address">{{ contact.mobileAddress }}</code>
                                }
                                <div class="contact-actions">
                                    <button class="save-btn save-btn--sm" (click)="toggleQR(contact)">
                                        {{ expandedContactId() === contact.id ? 'Hide QR' : 'Show QR' }}
                                    </button>
                                    <button class="save-btn save-btn--sm" (click)="copyContactUri(contact)">Copy URI</button>
                                    <button class="cancel-btn cancel-btn--sm" (click)="cancelContact(contact)">Delete</button>
                                </div>
                                @if (expandedContactId() === contact.id && contact.uri) {
                                    <div class="qr-container">
                                        <canvas class="qr-canvas"></canvas>
                                    </div>
                                }
                            </div>
                        }
                    </div>
                } @else {
                    <p class="muted">No contacts yet. Add one to get started.</p>
                }

                <!-- Add contact -->
                <div class="add-contact">
                    @if (addingContact()) {
                        <div class="add-contact-form">
                            <input
                                class="contact-nickname-input"
                                placeholder="Nickname (e.g. Alice)"
                                [value]="newContactNickname()"
                                (input)="newContactNickname.set(asInputValue($event))"
                                (keydown.enter)="createContact()"
                                (keydown.escape)="addingContact.set(false)"
                            />
                            <button class="save-btn save-btn--sm" [disabled]="creatingContact()" (click)="createContact()">
                                {{ creatingContact() ? 'Creating...' : 'Create' }}
                            </button>
                            <button class="icon-btn" (click)="addingContact.set(false)">&#10005;</button>
                        </div>
                    } @else {
                        <button class="save-btn" (click)="addingContact.set(true)">+ Add Contact</button>
                    }
                </div>
            }
        </div>
    `,
    styles: `
        ${SECTION_STYLES}
        .connect-desc { font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 1rem; }
        .contact-list { display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1rem; max-height: 500px; overflow-y: auto; }
        .contact-card { background: var(--bg-raised); border: 1px solid var(--border); border-radius: var(--radius); padding: 0.75rem; }
        .contact-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.35rem; }
        .contact-nickname { font-weight: 700; font-size: 0.85rem; color: var(--text-primary); cursor: pointer; }
        .contact-nickname-input {
            padding: 0.25rem 0.4rem; background: var(--bg-input); border: 1px solid var(--accent-cyan);
            border-radius: var(--radius-sm); color: var(--text-primary); font-size: 0.8rem;
            font-family: inherit; font-weight: 600; outline: none; width: 140px;
        }
        .contact-status { font-size: 0.65rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-left: auto; }
        .contact-status--active { color: var(--accent-green); }
        .contact-status--waiting { color: var(--accent-gold); }
        .contact-address {
            display: block; font-size: 0.6rem; color: var(--accent-magenta);
            background: var(--bg-surface); padding: 2px 4px; border-radius: var(--radius-sm);
            margin-bottom: 0.4rem; word-break: break-all;
        }
        .contact-actions { display: flex; gap: 0.4rem; flex-wrap: wrap; }
        .icon-btn { background: none; border: none; color: var(--text-secondary); cursor: pointer; font-size: 0.85rem; padding: 0.1rem 0.3rem; border-radius: var(--radius-sm); }
        .icon-btn:hover { color: var(--text-primary); background: var(--bg-surface); }
        .qr-container { display: flex; justify-content: center; margin-top: 0.75rem; }
        .qr-canvas { border-radius: var(--radius); border: 2px solid var(--accent-cyan); box-shadow: 0 0 12px var(--accent-cyan-mid); }
        .add-contact { margin-top: 0.5rem; }
        .add-contact-form { display: flex; align-items: center; gap: 0.5rem; }
    `,
})
export class MobileSettingsComponent implements OnInit {
    private readonly api = inject(ApiService);
    private readonly notifications = inject(NotificationService);
    private readonly elRef = inject(ElementRef);

    readonly collapsed = signal(false);
    readonly pskContacts = signal<PSKContact[]>([]);
    readonly expandedContactId = signal<string | null>(null);
    readonly addingContact = signal(false);
    readonly newContactNickname = signal('');
    readonly creatingContact = signal(false);
    readonly editingContactId = signal<string | null>(null);
    readonly editingNickname = signal('');

    ngOnInit(): void {
        this.loadPSKContacts();
    }

    toggleSection(): void {
        this.collapsed.update(v => !v);
    }

    asInputValue(event: Event): string {
        return (event.target as HTMLInputElement).value;
    }

    async createContact(): Promise<void> {
        const nickname = this.newContactNickname().trim();
        if (!nickname) {
            this.notifications.error('Please enter a nickname');
            return;
        }
        this.creatingContact.set(true);
        try {
            const result = await firstValueFrom(
                this.api.post<{ id: string; uri: string; nickname: string }>('/algochat/psk-contacts', { nickname })
            );
            await this.loadPSKContacts();
            this.newContactNickname.set('');
            this.addingContact.set(false);
            this.notifications.success(`Contact "${result.nickname}" created`);
            this.toggleQR({ ...result, network: '', mobileAddress: null, active: true, createdAt: '', uri: result.uri });
        } catch {
            this.notifications.error('Failed to create contact');
        } finally {
            this.creatingContact.set(false);
        }
    }

    async toggleQR(contact: PSKContact): Promise<void> {
        if (this.expandedContactId() === contact.id) {
            this.expandedContactId.set(null);
            return;
        }

        if (!contact.uri) {
            try {
                const result = await firstValueFrom(
                    this.api.get<{ uri: string }>(`/algochat/psk-contacts/${contact.id}/qr`)
                );
                contact.uri = result.uri;
                this.pskContacts.update((list) => list.map((c) => c.id === contact.id ? { ...c, uri: result.uri } : c));
            } catch {
                this.notifications.error('Failed to load QR code');
                return;
            }
        }

        this.expandedContactId.set(contact.id);
        this.renderQRWhenReady(contact.uri!);
    }

    async copyContactUri(contact: PSKContact): Promise<void> {
        let uri = contact.uri;
        if (!uri) {
            try {
                const result = await firstValueFrom(
                    this.api.get<{ uri: string }>(`/algochat/psk-contacts/${contact.id}/qr`)
                );
                uri = result.uri;
            } catch {
                this.notifications.error('Failed to get URI');
                return;
            }
        }
        await navigator.clipboard.writeText(uri!);
        this.notifications.success('URI copied to clipboard');
    }

    async cancelContact(contact: PSKContact): Promise<void> {
        if (!confirm(`Delete contact "${contact.nickname}"? They will no longer be able to message your agent.`)) {
            return;
        }
        try {
            await firstValueFrom(this.api.delete(`/algochat/psk-contacts/${contact.id}`));
            this.notifications.success(`Contact "${contact.nickname}" deleted`);
            if (this.expandedContactId() === contact.id) {
                this.expandedContactId.set(null);
            }
            await this.loadPSKContacts();
        } catch {
            this.notifications.error('Failed to delete contact');
        }
    }

    startEditNickname(contact: PSKContact): void {
        this.editingContactId.set(contact.id);
        this.editingNickname.set(contact.nickname);
    }

    cancelEditNickname(): void {
        this.editingContactId.set(null);
        this.editingNickname.set('');
    }

    async saveNickname(contactId: string): Promise<void> {
        const nickname = this.editingNickname().trim();
        if (!nickname) return;
        try {
            await firstValueFrom(
                this.api.patch(`/algochat/psk-contacts/${contactId}`, { nickname })
            );
            this.pskContacts.update((list) => list.map((c) => c.id === contactId ? { ...c, nickname } : c));
            this.editingContactId.set(null);
            this.notifications.success('Contact renamed');
        } catch {
            this.notifications.error('Failed to rename contact');
        }
    }

    private renderQRWhenReady(uri: string, attempt = 0): void {
        if (attempt > 20) return;
        const canvas = this.elRef.nativeElement.querySelector('.qr-canvas') as HTMLCanvasElement | null;
        if (canvas) {
            QRCode.toCanvas(canvas, uri, {
                width: 280,
                margin: 2,
                color: {
                    dark: '#0a0a12',
                    light: '#e0f7fa',
                },
            });
        } else {
            setTimeout(() => this.renderQRWhenReady(uri, attempt + 1), 50);
        }
    }

    private async loadPSKContacts(): Promise<void> {
        try {
            const result = await firstValueFrom(
                this.api.get<{ contacts: PSKContact[] }>('/algochat/psk-contacts')
            );
            this.pskContacts.set(result.contacts);
        } catch {
            // Non-critical
        }
    }
}
