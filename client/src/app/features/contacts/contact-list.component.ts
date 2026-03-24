import {
    Component,
    ChangeDetectionStrategy,
    inject,
    signal,
    computed,
    OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ContactService } from '../../core/services/contact.service';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { IconComponent } from '../../shared/components/icon.component';
import type { Contact, ContactPlatform, PlatformLink } from '../../core/models/contact.model';

const PLATFORM_LABELS: Record<ContactPlatform, string> = {
    discord: 'Discord',
    algochat: 'AlgoChat',
    github: 'GitHub',
};

@Component({
    selector: 'app-contact-list',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule, RelativeTimePipe, EmptyStateComponent, SkeletonComponent, IconComponent],
    template: `
        <div class="page">
            <div class="page__header">
                <h2 class="page-title">Contacts</h2>
                <button class="btn btn--primary" (click)="openCreate()">+ New Contact</button>
            </div>

            <div class="page__toolbar">
                <input
                    class="search-input"
                    type="text"
                    placeholder="Search contacts..."
                    [ngModel]="searchQuery()"
                    (ngModelChange)="searchQuery.set($event)"
                    aria-label="Search contacts" />
            </div>

            @if (contactService.loading()) {
                <app-skeleton variant="table" [count]="5" />
            } @else if (contactService.contacts().length === 0 && !searchQuery()) {
                <app-empty-state
                    icon="  [^_^]\n  /| |\\\n   | |"
                    title="No contacts yet."
                    description="Contacts map identities across Discord, AlgoChat, and GitHub so the agent never confuses who's who."
                    actionLabel="+ Add a contact"
                    (actionClick)="openCreate()"
                    actionAriaLabel="Add your first contact" />
            } @else {
                <div class="contact-layout">
                    <!-- List panel -->
                    <div class="contact-list" role="list">
                        @for (contact of filteredContacts(); track contact.id) {
                            <button
                                class="contact-card"
                                role="listitem"
                                [class.contact-card--active]="selectedContact()?.id === contact.id"
                                (click)="selectContact(contact)">
                                <div class="contact-card__avatar">
                                    {{ contact.displayName.charAt(0).toUpperCase() }}
                                </div>
                                <div class="contact-card__info">
                                    <h3 class="contact-card__name">{{ contact.displayName }}</h3>
                                    <div class="contact-card__platforms">
                                        @for (link of contact.links ?? []; track link.id) {
                                            <span class="platform-chip platform-chip--{{ link.platform }}"
                                                  [class.platform-chip--verified]="link.verified">
                                                {{ platformLabel(link.platform) }}
                                            </span>
                                        }
                                        @if (!contact.links?.length) {
                                            <span class="contact-card__no-links">No linked accounts</span>
                                        }
                                    </div>
                                </div>
                                <span class="contact-card__time">{{ contact.updatedAt | relativeTime }}</span>
                            </button>
                        } @empty {
                            <p class="no-results">No contacts match "{{ searchQuery() }}"</p>
                        }
                    </div>

                    <!-- Detail panel -->
                    @if (selectedContact()) {
                        <div class="contact-detail">
                            @if (editing()) {
                                <div class="detail-section">
                                    <h3 class="detail-title">Edit Contact</h3>
                                    <label class="field-label">Name</label>
                                    <input
                                        class="field-input"
                                        type="text"
                                        [ngModel]="editName()"
                                        (ngModelChange)="editName.set($event)" />
                                    <label class="field-label">Notes</label>
                                    <textarea
                                        class="field-input field-textarea"
                                        rows="4"
                                        [ngModel]="editNotes()"
                                        (ngModelChange)="editNotes.set($event)"></textarea>
                                    <div class="detail-actions">
                                        <button class="btn btn--primary" (click)="saveEdit()">Save</button>
                                        <button class="btn btn--ghost" (click)="editing.set(false)">Cancel</button>
                                    </div>
                                </div>
                            } @else {
                                <div class="detail-header">
                                    <div class="detail-avatar">
                                        {{ selectedContact()!.displayName.charAt(0).toUpperCase() }}
                                    </div>
                                    <div>
                                        <h3 class="detail-name">{{ selectedContact()!.displayName }}</h3>
                                        <span class="detail-meta">Added {{ selectedContact()!.createdAt | relativeTime }}</span>
                                    </div>
                                    <div class="detail-header-actions">
                                        <button class="btn btn--ghost btn--sm" (click)="startEdit()">Edit</button>
                                        <button class="btn btn--danger btn--sm" (click)="confirmDelete()">Delete</button>
                                    </div>
                                </div>

                                @if (selectedContact()!.notes) {
                                    <div class="detail-section">
                                        <h4 class="section-label">Notes</h4>
                                        <p class="detail-notes">{{ selectedContact()!.notes }}</p>
                                    </div>
                                }
                            }

                            <div class="detail-section">
                                <h4 class="section-label">Platform Links</h4>
                                <div class="links-list">
                                    @for (link of selectedContact()!.links ?? []; track link.id) {
                                        <div class="link-row">
                                            <span class="platform-chip platform-chip--{{ link.platform }}"
                                                  [class.platform-chip--verified]="link.verified">
                                                {{ platformLabel(link.platform) }}
                                            </span>
                                            <code class="link-id">{{ link.platformId }}</code>
                                            @if (!link.verified) {
                                                <button class="btn btn--ghost btn--xs" (click)="verifyLink(link)">Verify</button>
                                            } @else {
                                                <span class="verified-badge">Verified</span>
                                            }
                                            <button class="btn btn--danger btn--xs" (click)="removeLink(link)">Remove</button>
                                        </div>
                                    } @empty {
                                        <p class="empty-hint">No platform accounts linked yet.</p>
                                    }
                                </div>

                                <!-- Add link form -->
                                @if (addingLink()) {
                                    <div class="add-link-form">
                                        <select class="field-input field-select"
                                                [ngModel]="newLinkPlatform()"
                                                (ngModelChange)="newLinkPlatform.set($event)">
                                            <option value="discord">Discord</option>
                                            <option value="algochat">AlgoChat</option>
                                            <option value="github">GitHub</option>
                                        </select>
                                        <input
                                            class="field-input"
                                            type="text"
                                            placeholder="Platform ID (e.g. Discord user ID, GitHub handle)"
                                            [ngModel]="newLinkId()"
                                            (ngModelChange)="newLinkId.set($event)" />
                                        <div class="detail-actions">
                                            <button class="btn btn--primary btn--sm" (click)="saveLink()">Add</button>
                                            <button class="btn btn--ghost btn--sm" (click)="addingLink.set(false)">Cancel</button>
                                        </div>
                                    </div>
                                } @else {
                                    <button class="btn btn--ghost btn--sm" (click)="openAddLink()">+ Add Link</button>
                                }
                            </div>
                        </div>
                    } @else {
                        <div class="contact-detail contact-detail--empty">
                            <p>Select a contact to view details</p>
                        </div>
                    }
                </div>
            }

            <!-- Create dialog -->
            @if (creating()) {
                <div class="modal-overlay" (click)="creating.set(false)">
                    <div class="modal" (click)="$event.stopPropagation()">
                        <h3 class="modal__title">New Contact</h3>
                        <label class="field-label">Name</label>
                        <input
                            class="field-input"
                            type="text"
                            placeholder="Display name"
                            [ngModel]="createName()"
                            (ngModelChange)="createName.set($event)" />
                        <label class="field-label">Notes</label>
                        <textarea
                            class="field-input field-textarea"
                            rows="3"
                            placeholder="Role, context, anything helpful..."
                            [ngModel]="createNotes()"
                            (ngModelChange)="createNotes.set($event)"></textarea>
                        <div class="modal__actions">
                            <button class="btn btn--primary" (click)="saveCreate()" [disabled]="!createName()?.trim()">Create</button>
                            <button class="btn btn--ghost" (click)="creating.set(false)">Cancel</button>
                        </div>
                    </div>
                </div>
            }
        </div>
    `,
    styles: `
        .page { padding: 1.5rem; height: 100%; display: flex; flex-direction: column; }
        .page__header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
        .page__header h2 { margin: 0; color: var(--text-primary); }
        .page__toolbar { margin-bottom: 1rem; }

        .search-input {
            width: 100%; max-width: 400px; padding: 0.5rem 0.75rem;
            background: var(--bg-surface); border: 1px solid var(--border);
            border-radius: var(--radius); color: var(--text-primary);
            font-size: 0.85rem; font-family: inherit;
            transition: border-color 0.2s;
        }
        .search-input:focus { outline: none; border-color: var(--accent-cyan); }
        .search-input::placeholder { color: var(--text-tertiary); }

        .btn {
            padding: 0.5rem 1rem; border-radius: var(--radius); font-size: 0.8rem;
            font-weight: 600; cursor: pointer; border: 1px solid; font-family: inherit;
            text-transform: uppercase; letter-spacing: 0.05em;
            transition: background 0.15s, box-shadow 0.15s; background: transparent;
        }
        .btn--primary { color: var(--accent-cyan); border-color: var(--accent-cyan); }
        .btn--primary:hover { background: var(--accent-cyan-dim); box-shadow: var(--glow-cyan); }
        .btn--primary:disabled { opacity: 0.4; cursor: not-allowed; }
        .btn--ghost { color: var(--text-secondary); border-color: var(--border); }
        .btn--ghost:hover { border-color: var(--text-tertiary); }
        .btn--danger { color: var(--accent-red, #ff5555); border-color: var(--accent-red, #ff5555); }
        .btn--danger:hover { background: rgba(255, 85, 85, 0.1); }
        .btn--sm { padding: 0.3rem 0.6rem; font-size: 0.7rem; }
        .btn--xs { padding: 0.2rem 0.4rem; font-size: 0.65rem; }

        .contact-layout {
            display: grid; grid-template-columns: 1fr 1.2fr; gap: 1.5rem;
            flex: 1; min-height: 0;
        }

        /* ── List panel ── */
        .contact-list {
            display: flex; flex-direction: column; gap: 0.5rem;
            overflow-y: auto; max-height: calc(100vh - 220px);
        }

        .contact-card {
            display: flex; align-items: center; gap: 0.75rem;
            padding: 0.75rem 1rem; background: var(--bg-surface);
            border: 1px solid var(--border); border-radius: var(--radius-lg);
            cursor: pointer; text-align: left; width: 100%;
            font-family: inherit; color: inherit;
            transition: border-color 0.2s, box-shadow 0.2s;
        }
        .contact-card:hover { border-color: var(--accent-green); box-shadow: 0 0 12px rgba(0, 255, 136, 0.08); }
        .contact-card--active { border-color: var(--accent-cyan); box-shadow: 0 0 16px rgba(0, 200, 255, 0.12); }

        .contact-card__avatar {
            width: 36px; height: 36px; border-radius: 50%;
            background: var(--accent-cyan-dim, rgba(0, 200, 255, 0.15));
            color: var(--accent-cyan); display: flex; align-items: center;
            justify-content: center; font-weight: 700; font-size: 0.9rem;
            flex-shrink: 0;
        }

        .contact-card__info { flex: 1; min-width: 0; }
        .contact-card__name { margin: 0 0 0.2rem; font-size: 0.9rem; color: var(--text-primary); }
        .contact-card__platforms { display: flex; gap: 0.3rem; flex-wrap: wrap; }
        .contact-card__no-links { font-size: 0.7rem; color: var(--text-tertiary); }
        .contact-card__time { font-size: 0.7rem; color: var(--text-tertiary); white-space: nowrap; }

        .platform-chip {
            display: inline-block; padding: 0.1rem 0.4rem; border-radius: 4px;
            font-size: 0.65rem; font-weight: 600; text-transform: uppercase;
            letter-spacing: 0.03em; border: 1px solid;
        }
        .platform-chip--discord { color: #7289da; border-color: #7289da; background: rgba(114, 137, 218, 0.1); }
        .platform-chip--algochat { color: var(--accent-green, #00ff88); border-color: var(--accent-green, #00ff88); background: rgba(0, 255, 136, 0.1); }
        .platform-chip--github { color: #f0f0f0; border-color: #666; background: rgba(255, 255, 255, 0.05); }
        .platform-chip--verified { box-shadow: 0 0 6px rgba(0, 255, 136, 0.2); }

        .no-results { color: var(--text-tertiary); font-size: 0.85rem; padding: 1rem; }

        /* ── Detail panel ── */
        .contact-detail {
            background: var(--bg-surface); border: 1px solid var(--border);
            border-radius: var(--radius-lg); padding: 1.5rem;
            overflow-y: auto; max-height: calc(100vh - 220px);
        }
        .contact-detail--empty {
            display: flex; align-items: center; justify-content: center;
            color: var(--text-tertiary);
        }

        .detail-header {
            display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem;
        }
        .detail-avatar {
            width: 48px; height: 48px; border-radius: 50%;
            background: var(--accent-cyan-dim, rgba(0, 200, 255, 0.15));
            color: var(--accent-cyan); display: flex; align-items: center;
            justify-content: center; font-weight: 700; font-size: 1.2rem;
            flex-shrink: 0;
        }
        .detail-name { margin: 0; font-size: 1.1rem; color: var(--text-primary); }
        .detail-meta { font-size: 0.75rem; color: var(--text-tertiary); }
        .detail-header-actions { margin-left: auto; display: flex; gap: 0.5rem; }

        .detail-section { margin-bottom: 1.5rem; }
        .detail-title { margin: 0 0 1rem; color: var(--text-primary); }
        .section-label {
            margin: 0 0 0.5rem; font-size: 0.75rem; font-weight: 600;
            color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.05em;
        }
        .detail-notes { margin: 0; color: var(--text-secondary); font-size: 0.85rem; white-space: pre-wrap; }

        .detail-actions { display: flex; gap: 0.5rem; margin-top: 0.75rem; }

        /* ── Links section ── */
        .links-list { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 0.75rem; }
        .link-row {
            display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem;
            background: var(--bg-base, rgba(0, 0, 0, 0.2)); border-radius: var(--radius);
        }
        .link-id {
            font-size: 0.8rem; color: var(--text-secondary); flex: 1;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .verified-badge {
            font-size: 0.65rem; color: var(--accent-green, #00ff88);
            font-weight: 600; text-transform: uppercase;
        }
        .empty-hint { color: var(--text-tertiary); font-size: 0.8rem; margin: 0.25rem 0; }

        /* ── Add link form ── */
        .add-link-form {
            display: flex; flex-direction: column; gap: 0.5rem;
            padding: 0.75rem; background: var(--bg-base, rgba(0, 0, 0, 0.2));
            border-radius: var(--radius); margin-top: 0.5rem;
        }

        /* ── Form fields ── */
        .field-label {
            display: block; font-size: 0.75rem; font-weight: 600; color: var(--text-tertiary);
            text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem; margin-top: 0.75rem;
        }
        .field-input {
            width: 100%; padding: 0.5rem 0.75rem; background: var(--bg-base, rgba(0, 0, 0, 0.3));
            border: 1px solid var(--border); border-radius: var(--radius);
            color: var(--text-primary); font-size: 0.85rem; font-family: inherit;
            box-sizing: border-box;
        }
        .field-input:focus { outline: none; border-color: var(--accent-cyan); }
        .field-textarea { resize: vertical; min-height: 60px; }
        .field-select { appearance: auto; cursor: pointer; }

        /* ── Modal ── */
        .modal-overlay {
            position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6);
            display: flex; align-items: center; justify-content: center;
            z-index: 1000;
        }
        .modal {
            background: var(--bg-surface); border: 1px solid var(--border);
            border-radius: var(--radius-lg); padding: 1.5rem;
            width: 90%; max-width: 440px;
        }
        .modal__title { margin: 0 0 0.5rem; color: var(--text-primary); }
        .modal__actions { display: flex; gap: 0.5rem; margin-top: 1rem; }

        /* ── Responsive ── */
        @media (max-width: 768px) {
            .contact-layout { grid-template-columns: 1fr; }
        }
    `,
})
export class ContactListComponent implements OnInit {
    protected readonly contactService = inject(ContactService);

    // Search
    readonly searchQuery = signal('');
    readonly filteredContacts = computed(() => {
        const q = this.searchQuery().toLowerCase().trim();
        const all = this.contactService.contacts();
        if (!q) return all;
        return all.filter((c) =>
            c.displayName.toLowerCase().includes(q) ||
            c.notes?.toLowerCase().includes(q) ||
            c.links?.some((l) => l.platformId.toLowerCase().includes(q)),
        );
    });

    // Selection
    readonly selectedContact = signal<Contact | null>(null);

    // Edit state
    readonly editing = signal(false);
    readonly editName = signal('');
    readonly editNotes = signal('');

    // Create state
    readonly creating = signal(false);
    readonly createName = signal('');
    readonly createNotes = signal('');

    // Add link state
    readonly addingLink = signal(false);
    readonly newLinkPlatform = signal<ContactPlatform>('discord');
    readonly newLinkId = signal('');

    ngOnInit(): void {
        this.contactService.load();
    }

    platformLabel(platform: ContactPlatform): string {
        return PLATFORM_LABELS[platform];
    }

    selectContact(contact: Contact): void {
        this.selectedContact.set(contact);
        this.editing.set(false);
        this.addingLink.set(false);
    }

    // ── Create ───────────────────────────────────────────────────────
    openCreate(): void {
        this.createName.set('');
        this.createNotes.set('');
        this.creating.set(true);
    }

    async saveCreate(): Promise<void> {
        const name = this.createName().trim();
        if (!name) return;
        const contact = await this.contactService.createContact(name, this.createNotes().trim() || undefined);
        this.creating.set(false);
        // Reload to get links populated
        await this.contactService.load();
        this.selectedContact.set(this.contactService.findById(contact.id) ?? contact);
    }

    // ── Edit ─────────────────────────────────────────────────────────
    startEdit(): void {
        const c = this.selectedContact();
        if (!c) return;
        this.editName.set(c.displayName);
        this.editNotes.set(c.notes ?? '');
        this.editing.set(true);
    }

    async saveEdit(): Promise<void> {
        const c = this.selectedContact();
        if (!c) return;
        const updated = await this.contactService.updateContact(c.id, {
            displayName: this.editName().trim(),
            notes: this.editNotes().trim() || null,
        });
        this.selectedContact.set(updated);
        this.editing.set(false);
    }

    // ── Delete ───────────────────────────────────────────────────────
    async confirmDelete(): Promise<void> {
        const c = this.selectedContact();
        if (!c) return;
        if (!confirm(`Delete contact "${c.displayName}"? This cannot be undone.`)) return;
        await this.contactService.deleteContact(c.id);
        this.selectedContact.set(null);
    }

    // ── Platform links ───────────────────────────────────────────────
    openAddLink(): void {
        this.newLinkPlatform.set('discord');
        this.newLinkId.set('');
        this.addingLink.set(true);
    }

    async saveLink(): Promise<void> {
        const c = this.selectedContact();
        const id = this.newLinkId().trim();
        if (!c || !id) return;
        await this.contactService.addLink(c.id, this.newLinkPlatform(), id);
        this.addingLink.set(false);
        this.selectedContact.set(this.contactService.findById(c.id) ?? c);
    }

    async removeLink(link: PlatformLink): Promise<void> {
        const c = this.selectedContact();
        if (!c) return;
        await this.contactService.removeLink(c.id, link.id);
        this.selectedContact.set(this.contactService.findById(c.id) ?? c);
    }

    async verifyLink(link: PlatformLink): Promise<void> {
        const c = this.selectedContact();
        if (!c) return;
        await this.contactService.verifyLink(c.id, link.id);
        this.selectedContact.set(this.contactService.findById(c.id) ?? c);
    }
}
