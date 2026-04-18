import {
    Component,
    ChangeDetectionStrategy,
    inject,
    signal,
    computed,
    OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
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
    imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, RelativeTimePipe, EmptyStateComponent, SkeletonComponent, IconComponent],
    template: `
        <div class="page">
            <div class="page__header">
                <h2 class="page-title">Contacts</h2>
                <button mat-flat-button color="primary" (click)="openCreate()">+ New Contact</button>
            </div>

            <div class="page__toolbar">
                <mat-form-field appearance="outline" class="search-field">
                    <mat-label>Search contacts</mat-label>
                    <input
                        matInput
                        type="text"
                        placeholder="Search contacts..."
                        [ngModel]="searchQuery()"
                        (ngModelChange)="searchQuery.set($event)" />
                </mat-form-field>
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
                                    <mat-form-field appearance="outline" class="full-width">
                                        <mat-label>Name</mat-label>
                                        <input
                                            matInput
                                            type="text"
                                            [ngModel]="editName()"
                                            (ngModelChange)="editName.set($event)" />
                                    </mat-form-field>
                                    <mat-form-field appearance="outline" class="full-width">
                                        <mat-label>Notes</mat-label>
                                        <textarea
                                            matInput
                                            rows="4"
                                            [ngModel]="editNotes()"
                                            (ngModelChange)="editNotes.set($event)"></textarea>
                                    </mat-form-field>
                                    <div class="detail-actions">
                                        <button mat-flat-button color="primary" (click)="saveEdit()">Save</button>
                                        <button mat-stroked-button (click)="editing.set(false)">Cancel</button>
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
                                        <button mat-stroked-button (click)="startEdit()">Edit</button>
                                        <button mat-stroked-button color="warn" (click)="confirmDelete()">Delete</button>
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
                                                <button mat-stroked-button (click)="verifyLink(link)">Verify</button>
                                            } @else {
                                                <span class="verified-badge">Verified</span>
                                            }
                                            <button mat-stroked-button color="warn" (click)="removeLink(link)">Remove</button>
                                        </div>
                                    } @empty {
                                        <p class="empty-hint">No platform accounts linked yet.</p>
                                    }
                                </div>

                                <!-- Add link form -->
                                @if (addingLink()) {
                                    <div class="add-link-form">
                                        <mat-form-field appearance="outline" class="full-width">
                                            <mat-label>Platform</mat-label>
                                            <mat-select
                                                [ngModel]="newLinkPlatform()"
                                                (ngModelChange)="newLinkPlatform.set($event)">
                                                <mat-option value="discord">Discord</mat-option>
                                                <mat-option value="algochat">AlgoChat</mat-option>
                                                <mat-option value="github">GitHub</mat-option>
                                            </mat-select>
                                        </mat-form-field>
                                        <mat-form-field appearance="outline" class="full-width">
                                            <mat-label>Platform ID</mat-label>
                                            <input
                                                matInput
                                                type="text"
                                                placeholder="Platform ID (e.g. Discord user ID, GitHub handle)"
                                                [ngModel]="newLinkId()"
                                                (ngModelChange)="newLinkId.set($event)" />
                                        </mat-form-field>
                                        <div class="detail-actions">
                                            <button mat-flat-button color="primary" (click)="saveLink()">Add</button>
                                            <button mat-stroked-button (click)="addingLink.set(false)">Cancel</button>
                                        </div>
                                    </div>
                                } @else {
                                    <button mat-stroked-button (click)="openAddLink()">+ Add Link</button>
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
                        <mat-form-field appearance="outline" class="full-width">
                            <mat-label>Name</mat-label>
                            <input
                                matInput
                                type="text"
                                placeholder="Display name"
                                [ngModel]="createName()"
                                (ngModelChange)="createName.set($event)" />
                        </mat-form-field>
                        <mat-form-field appearance="outline" class="full-width">
                            <mat-label>Notes</mat-label>
                            <textarea
                                matInput
                                rows="3"
                                placeholder="Role, context, anything helpful..."
                                [ngModel]="createNotes()"
                                (ngModelChange)="createNotes.set($event)"></textarea>
                        </mat-form-field>
                        <div class="modal__actions">
                            <button mat-flat-button color="primary" (click)="saveCreate()" [disabled]="!createName()?.trim()">Create</button>
                            <button mat-stroked-button (click)="creating.set(false)">Cancel</button>
                        </div>
                    </div>
                </div>
            }
        </div>
    `,
    styles: `
        .page { padding: clamp(var(--space-3), 2vw, var(--space-6)); height: 100%; display: flex; flex-direction: column; }
        .page__header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-5); flex-wrap: wrap; gap: var(--space-3); }
        .page__header h2 { margin: 0; color: var(--text-primary); font-size: var(--text-xl); }
        .page__toolbar { margin-bottom: var(--space-5); }

        .search-field { width: 100%; max-width: 520px; }
        .full-width { width: 100%; }

        .contact-layout {
            display: grid; grid-template-columns: 1fr 1.2fr; gap: clamp(var(--space-4), 2vw, var(--space-6));
            flex: 1; min-height: 0;
        }

        /* ── List panel ── */
        .contact-list {
            display: flex; flex-direction: column; gap: var(--space-3);
            overflow-y: auto; max-height: calc(100vh - 220px);
        }

        .contact-card {
            display: flex; align-items: center; gap: var(--space-3);
            padding: clamp(var(--space-3), 1.5vw, var(--space-4)); background: var(--bg-surface);
            border: 1px solid var(--border); border-radius: var(--radius-xl);
            cursor: pointer; text-align: left; width: 100%;
            font-family: inherit; color: inherit;
            transition: border-color 0.2s, box-shadow 0.2s;
        }
        .contact-card:hover { border-color: var(--accent-green); box-shadow: 0 0 12px var(--accent-green-wash); }
        .contact-card--active { border-color: var(--accent-cyan); box-shadow: 0 0 16px rgba(0, 200, 255, 0.12); }

        .contact-card__avatar {
            width: 42px; height: 42px; border-radius: 50%;
            background: var(--accent-cyan-dim);
            color: var(--accent-cyan); display: flex; align-items: center;
            justify-content: center; font-weight: 700; font-size: var(--text-base);
            flex-shrink: 0;
        }

        .contact-card__info { flex: 1; min-width: 0; }
        .contact-card__name { margin: 0 0 var(--space-1); font-size: var(--text-base); color: var(--text-primary); }
        .contact-card__platforms { display: flex; gap: var(--space-1); flex-wrap: wrap; }
        .contact-card__no-links { font-size: var(--text-sm); color: var(--text-tertiary); }
        .contact-card__time { font-size: var(--text-sm); color: var(--text-tertiary); white-space: nowrap; }

        .platform-chip {
            display: inline-block; padding: 0.2rem 0.5rem; border-radius: var(--radius);
            font-size: var(--text-xxs); font-weight: 600; text-transform: uppercase;
            letter-spacing: 0.03em; border: 1px solid;
        }
        .platform-chip--discord { color: #7289da; border-color: #7289da; background: rgba(114, 137, 218, 0.1); }
        .platform-chip--algochat { color: var(--accent-green); border-color: var(--accent-green); background: var(--accent-green-tint); }
        .platform-chip--github { color: #f0f0f0; border-color: var(--text-muted); background: rgba(255, 255, 255, 0.05); }
        .platform-chip--verified { box-shadow: 0 0 6px var(--accent-green-mid); }

        .no-results { color: var(--text-tertiary); font-size: var(--text-base); padding: var(--space-5); }

        /* ── Detail panel ── */
        .contact-detail {
            background: var(--bg-surface); border: 1px solid var(--border);
            border-radius: var(--radius-xl); padding: clamp(var(--space-4), 2vw, var(--space-6));
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
            background: var(--accent-cyan-dim);
            color: var(--accent-cyan); display: flex; align-items: center;
            justify-content: center; font-weight: 700; font-size: 1.2rem;
            flex-shrink: 0;
        }
        .detail-name { margin: 0; font-size: var(--text-xl); color: var(--text-primary); }
        .detail-meta { font-size: var(--text-sm); color: var(--text-tertiary); }
        .detail-header-actions { margin-left: auto; display: flex; gap: var(--space-2); }

        .detail-section { margin-bottom: var(--space-5); }
        .detail-title { margin: 0 0 var(--space-4); color: var(--text-primary); }
        .section-label {
            margin: 0 0 var(--space-2); font-size: var(--text-sm); font-weight: 600;
            color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.05em;
        }
        .detail-notes { margin: 0; color: var(--text-secondary); font-size: var(--text-base); white-space: pre-wrap; line-height: var(--leading-relaxed); }

        .detail-actions { display: flex; gap: var(--space-2); margin-top: var(--space-3); }

        /* ── Links section ── */
        .links-list { display: flex; flex-direction: column; gap: var(--space-2); margin-bottom: var(--space-3); }
        .link-row {
            display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-3);
            background: var(--bg-base); border-radius: var(--radius-lg);
        }
        .link-id {
            font-size: var(--text-sm); color: var(--text-secondary); flex: 1;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .verified-badge {
            font-size: var(--text-xxs); color: var(--accent-green);
            font-weight: 600; text-transform: uppercase;
        }
        .empty-hint { color: var(--text-tertiary); font-size: var(--text-sm); margin: var(--space-1) 0; }

        /* ── Add link form ── */
        .add-link-form {
            display: flex; flex-direction: column; gap: 0.5rem;
            padding: 0.75rem; background: var(--bg-base);
            border-radius: var(--radius); margin-top: 0.5rem;
        }

        /* ── Form fields ── */

        /* ── Modal ── */
        .modal-overlay {
            position: fixed; inset: 0; background: var(--overlay-heavy);
            display: flex; align-items: center; justify-content: center;
            z-index: 1000;
        }
        .modal {
            background: var(--bg-surface); border: 1px solid var(--border);
            border-radius: var(--radius-xl); padding: clamp(var(--space-4), 3vw, var(--space-6));
            width: 90%; max-width: 480px;
        }
        .modal__title { margin: 0 0 var(--space-2); color: var(--text-primary); font-size: var(--text-lg); }
        .modal__actions { display: flex; gap: var(--space-2); margin-top: var(--space-4); }

        /* ── Responsive ── */
        @media (max-width: 767px) {
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
        if (!confirm(`Remove ${link.platform} link? This cannot be undone.`)) return;
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
