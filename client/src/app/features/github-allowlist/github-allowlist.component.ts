import { Component, ChangeDetectionStrategy, inject, OnInit, signal } from '@angular/core';
import { GitHubAllowlistService } from '../../core/services/github-allowlist.service';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';

@Component({
    selector: 'app-github-allowlist',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RelativeTimePipe],
    template: `
        <div class="page">
            <div class="page__header">
                <h2>
                    GitHub Allowlist
                    @if (service.entries().length > 0) {
                        <span class="count">({{ service.entries().length }})</span>
                    }
                </h2>
            </div>

            <div class="add-form">
                <input
                    class="input"
                    type="text"
                    placeholder="GitHub username"
                    [value]="newUsername()"
                    (input)="newUsername.set(toInputValue($event))" />
                <input
                    class="input input--label"
                    type="text"
                    placeholder="Label (optional)"
                    [value]="newLabel()"
                    (input)="newLabel.set(toInputValue($event))" />
                <button
                    class="btn btn--primary"
                    [disabled]="!newUsername().trim()"
                    (click)="add()">Add</button>
            </div>

            @if (error()) {
                <p class="error">{{ error() }}</p>
            }

            @if (service.loading()) {
                <p>Loading...</p>
            } @else if (service.entries().length === 0) {
                <p class="empty">No GitHub users in allowlist. All GitHub users are currently allowed.</p>
            } @else {
                <div class="list" role="list">
                    @for (entry of service.entries(); track entry.username) {
                        <div class="list__item" role="listitem">
                            <div class="list__item-main">
                                <div class="list__item-username">{{ entry.username }}</div>
                                @if (editingUsername() === entry.username) {
                                    <div class="edit-row">
                                        <input
                                            class="input input--inline"
                                            type="text"
                                            [value]="editLabel()"
                                            (input)="editLabel.set(toInputValue($event))"
                                            (keyup.enter)="saveLabel(entry.username)" />
                                        <button class="btn btn--small" (click)="saveLabel(entry.username)">Save</button>
                                        <button class="btn btn--small btn--ghost" (click)="editingUsername.set(null)">Cancel</button>
                                    </div>
                                } @else {
                                    <div class="label-row">
                                        <span class="list__item-label" (click)="startEdit(entry)">
                                            {{ entry.label || 'No label' }}
                                        </span>
                                    </div>
                                }
                            </div>
                            <div class="list__item-meta">
                                <span>{{ entry.createdAt | relativeTime }}</span>
                                <button class="btn btn--danger btn--small" (click)="remove(entry.username)">Remove</button>
                            </div>
                        </div>
                    }
                </div>
            }
        </div>
    `,
    styles: `
        .page { padding: 1.5rem; }
        .page__header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; }
        .page__header h2 { margin: 0; color: var(--text-primary); }
        .count { color: var(--text-tertiary); font-weight: 400; font-size: 0.85rem; }
        .add-form { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; }
        .input {
            flex: 1; padding: 0.5rem 0.75rem; background: var(--bg-surface); border: 1px solid var(--border);
            border-radius: var(--radius); color: var(--text-primary); font-family: inherit; font-size: 0.85rem;
        }
        .input::placeholder { color: var(--text-tertiary); }
        .input--label { max-width: 200px; }
        .input--inline { flex: 1; padding: 0.3rem 0.5rem; font-size: 0.8rem; }
        .btn {
            padding: 0.5rem 1rem; border-radius: var(--radius); font-size: 0.8rem; font-weight: 600;
            cursor: pointer; border: 1px solid; font-family: inherit; text-transform: uppercase; letter-spacing: 0.05em;
            transition: background 0.15s, box-shadow 0.15s; background: transparent;
        }
        .btn:disabled { opacity: 0.4; cursor: default; }
        .btn--primary { color: var(--accent-cyan); border-color: var(--accent-cyan); }
        .btn--primary:hover:not(:disabled) { background: var(--accent-cyan-dim); box-shadow: var(--glow-cyan); }
        .btn--danger { color: var(--accent-red, #f44); border-color: var(--accent-red, #f44); }
        .btn--danger:hover { background: rgba(255, 68, 68, 0.1); }
        .btn--small { padding: 0.25rem 0.5rem; font-size: 0.7rem; }
        .btn--ghost { border-color: var(--border); color: var(--text-secondary); }
        .error { color: var(--accent-red, #f44); font-size: 0.85rem; margin-bottom: 1rem; }
        .empty { color: var(--text-tertiary); }
        .list { display: flex; flex-direction: column; gap: 0.5rem; }
        .list__item {
            display: flex; justify-content: space-between; align-items: center;
            padding: 1rem; background: var(--bg-surface); border: 1px solid var(--border);
            border-radius: var(--radius-lg);
        }
        .list__item-main { flex: 1; min-width: 0; }
        .list__item-username { font-family: monospace; font-size: 0.85rem; color: var(--text-primary); }
        .list__item-label { font-size: 0.8rem; color: var(--text-secondary); cursor: pointer; }
        .list__item-label:hover { color: var(--text-primary); }
        .label-row { margin-top: 0.25rem; }
        .edit-row { display: flex; gap: 0.5rem; margin-top: 0.25rem; align-items: center; }
        .list__item-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 0.5rem; font-size: 0.75rem; color: var(--text-tertiary); margin-left: 1rem; }
    `,
})
export class GitHubAllowlistComponent implements OnInit {
    protected readonly service = inject(GitHubAllowlistService);

    readonly newUsername = signal('');
    readonly newLabel = signal('');
    readonly editingUsername = signal<string | null>(null);
    readonly editLabel = signal('');
    readonly error = signal<string | null>(null);

    ngOnInit(): void {
        this.service.loadEntries();
    }

    toInputValue(event: Event): string {
        return (event.target as HTMLInputElement).value;
    }

    async add(): Promise<void> {
        const username = this.newUsername().trim();
        if (!username) return;
        this.error.set(null);
        try {
            await this.service.addEntry(username, this.newLabel().trim() || undefined);
            this.newUsername.set('');
            this.newLabel.set('');
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to add username';
            this.error.set(msg);
        }
    }

    startEdit(entry: { username: string; label: string }): void {
        this.editingUsername.set(entry.username);
        this.editLabel.set(entry.label);
    }

    async saveLabel(username: string): Promise<void> {
        this.error.set(null);
        try {
            await this.service.updateEntry(username, this.editLabel());
            this.editingUsername.set(null);
        } catch {
            this.error.set('Failed to update label');
            await this.service.loadEntries();
        }
    }

    async remove(username: string): Promise<void> {
        if (!confirm(`Remove ${username} from the GitHub allowlist?`)) return;
        this.error.set(null);
        try {
            await this.service.removeEntry(username);
        } catch {
            this.error.set('Failed to remove username');
            await this.service.loadEntries();
        }
    }
}
