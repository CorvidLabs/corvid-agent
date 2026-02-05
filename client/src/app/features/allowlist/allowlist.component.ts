import { Component, ChangeDetectionStrategy, inject, OnInit, signal } from '@angular/core';
import { AllowlistService } from '../../core/services/allowlist.service';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';

@Component({
    selector: 'app-allowlist',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RelativeTimePipe],
    template: `
        <div class="page">
            <div class="page__header">
                <h2>
                    Allowlist
                    @if (allowlistService.entries().length > 0) {
                        <span class="count">({{ allowlistService.entries().length }})</span>
                    }
                </h2>
            </div>

            <div class="add-form">
                <input
                    class="input"
                    type="text"
                    placeholder="Algorand address"
                    [value]="newAddress()"
                    (input)="newAddress.set(toInputValue($event))" />
                <input
                    class="input input--label"
                    type="text"
                    placeholder="Label (optional)"
                    [value]="newLabel()"
                    (input)="newLabel.set(toInputValue($event))" />
                <button
                    class="btn btn--primary"
                    [disabled]="!newAddress().trim()"
                    (click)="add()">Add</button>
            </div>

            @if (error()) {
                <p class="error">{{ error() }}</p>
            }

            @if (allowlistService.loading()) {
                <p>Loading...</p>
            } @else if (allowlistService.entries().length === 0) {
                <p class="empty">No addresses in allowlist. All addresses are currently allowed.</p>
            } @else {
                <div class="list" role="list">
                    @for (entry of allowlistService.entries(); track entry.address) {
                        <div class="list__item" role="listitem">
                            <div class="list__item-main">
                                <div class="list__item-address">{{ entry.address }}</div>
                                @if (editingAddress() === entry.address) {
                                    <div class="edit-row">
                                        <input
                                            class="input input--inline"
                                            type="text"
                                            [value]="editLabel()"
                                            (input)="editLabel.set(toInputValue($event))"
                                            (keyup.enter)="saveLabel(entry.address)" />
                                        <button class="btn btn--small" (click)="saveLabel(entry.address)">Save</button>
                                        <button class="btn btn--small btn--ghost" (click)="editingAddress.set(null)">Cancel</button>
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
                                <button class="btn btn--danger btn--small" (click)="remove(entry.address)">Remove</button>
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
        .list__item-address { font-family: monospace; font-size: 0.8rem; color: var(--text-primary); word-break: break-all; }
        .list__item-label { font-size: 0.8rem; color: var(--text-secondary); cursor: pointer; }
        .list__item-label:hover { color: var(--text-primary); }
        .label-row { margin-top: 0.25rem; }
        .edit-row { display: flex; gap: 0.5rem; margin-top: 0.25rem; align-items: center; }
        .list__item-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 0.5rem; font-size: 0.75rem; color: var(--text-tertiary); margin-left: 1rem; }
    `,
})
export class AllowlistComponent implements OnInit {
    protected readonly allowlistService = inject(AllowlistService);

    readonly newAddress = signal('');
    readonly newLabel = signal('');
    readonly editingAddress = signal<string | null>(null);
    readonly editLabel = signal('');
    readonly error = signal<string | null>(null);

    ngOnInit(): void {
        this.allowlistService.loadEntries();
    }

    toInputValue(event: Event): string {
        return (event.target as HTMLInputElement).value;
    }

    async add(): Promise<void> {
        const address = this.newAddress().trim();
        if (!address) return;
        this.error.set(null);
        try {
            await this.allowlistService.addEntry(address, this.newLabel().trim() || undefined);
            this.newAddress.set('');
            this.newLabel.set('');
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to add address';
            this.error.set(msg);
        }
    }

    startEdit(entry: { address: string; label: string }): void {
        this.editingAddress.set(entry.address);
        this.editLabel.set(entry.label);
    }

    async saveLabel(address: string): Promise<void> {
        this.error.set(null);
        try {
            await this.allowlistService.updateEntry(address, this.editLabel());
            this.editingAddress.set(null);
        } catch {
            this.error.set('Failed to update label');
            await this.allowlistService.loadEntries();
        }
    }

    async remove(address: string): Promise<void> {
        if (!confirm(`Remove ${address} from the allowlist?`)) return;
        this.error.set(null);
        try {
            await this.allowlistService.removeEntry(address);
        } catch {
            this.error.set('Failed to remove address');
            await this.allowlistService.loadEntries();
        }
    }
}
