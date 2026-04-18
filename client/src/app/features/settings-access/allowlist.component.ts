import { Component, ChangeDetectionStrategy, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { AllowlistService } from '../../core/services/allowlist.service';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { TooltipDirective } from '../../shared/directives/tooltip.directive';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { PageShellComponent } from '../../shared/components/page-shell.component';

@Component({
    selector: 'app-allowlist',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MatButtonModule, MatFormFieldModule, MatInputModule, RelativeTimePipe, SkeletonComponent, TooltipDirective, EmptyStateComponent, PageShellComponent],
    template: `
        <app-page-shell
            title="Allowlist"
            icon="allowlist"
            [subtitle]="allowlistService.entries().length > 0 ? '(' + allowlistService.entries().length + ')' : ''">

            <div class="add-form">
                <mat-form-field appearance="outline" class="add-form__field">
                    <mat-label>Algorand address</mat-label>
                    <input
                        matInput
                        type="text"
                        placeholder="Algorand address"
                        [value]="newAddress()"
                        (input)="newAddress.set(toInputValue($event))" />
                </mat-form-field>
                <mat-form-field appearance="outline" class="add-form__field add-form__field--label">
                    <mat-label>Label (optional)</mat-label>
                    <input
                        matInput
                        type="text"
                        placeholder="Label (optional)"
                        [value]="newLabel()"
                        (input)="newLabel.set(toInputValue($event))" />
                </mat-form-field>
                <button
                    mat-flat-button color="primary"
                    [disabled]="!newAddress().trim()"
                    (click)="add()">Add</button>
            </div>

            @if (error()) {
                <p class="error">{{ error() }}</p>
            }

            @if (allowlistService.loading()) {
                <app-skeleton variant="line" [count]="4" />
            } @else if (allowlistService.entries().length === 0) {
                <app-empty-state
                    icon="[*]"
                    title="No Allowlist"
                    description="No addresses in allowlist. All addresses are currently allowed." />
            } @else {
                <div class="list" role="list">
                    @for (entry of allowlistService.entries(); track entry.address) {
                        <div class="list__item" role="listitem">
                            <div class="list__item-main">
                                <div class="list__item-address">{{ entry.address }}</div>
                                @if (editingAddress() === entry.address) {
                                    <div class="edit-row">
                                        <mat-form-field appearance="outline" class="edit-row__field">
                                            <mat-label>Label</mat-label>
                                            <input
                                                matInput
                                                type="text"
                                                [value]="editLabel()"
                                                (input)="editLabel.set(toInputValue($event))"
                                                (keyup.enter)="saveLabel(entry.address)" />
                                        </mat-form-field>
                                        <button mat-flat-button color="primary" (click)="saveLabel(entry.address)">Save</button>
                                        <button mat-stroked-button (click)="editingAddress.set(null)">Cancel</button>
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
                                <button mat-stroked-button color="warn" (click)="remove(entry.address)">Remove</button>
                            </div>
                        </div>
                    }
                </div>
            }
        </app-page-shell>
    `,
    styles: `
        .add-form { display: flex; gap: var(--space-3); margin-bottom: var(--space-5); flex-wrap: wrap; align-items: flex-start; }
        .add-form__field { flex: 1; min-width: 0; }
        .add-form__field--label { max-width: 280px; min-width: 160px; }
        .edit-row__field { flex: 1; }
        .error { color: var(--accent-red); font-size: var(--text-base); margin-bottom: var(--space-4); }
        .list { display: flex; flex-direction: column; gap: var(--space-4); }
        .list__item {
            display: flex; justify-content: space-between; align-items: center;
            padding: clamp(var(--space-3), 2vw, var(--space-5)); background: var(--bg-surface); border: 1px solid var(--border);
            border-radius: var(--radius-xl); transition: border-color 0.15s;
        }
        .list__item:hover { border-color: var(--border-bright); }
        .list__item-main { flex: 1; min-width: 0; }
        .list__item-address { font-family: var(--font-mono); font-size: var(--text-base); color: var(--text-primary); word-break: break-all; }
        .list__item-label { font-size: var(--text-sm); color: var(--text-secondary); cursor: pointer; }
        .list__item-label:hover { color: var(--text-primary); }
        .label-row { margin-top: var(--space-2); }
        .edit-row { display: flex; gap: var(--space-2); margin-top: var(--space-2); align-items: center; }
        .list__item-meta { display: flex; flex-direction: column; align-items: flex-end; gap: var(--space-2); font-size: var(--text-sm); color: var(--text-tertiary); margin-left: var(--space-4); }
        @media (max-width: 600px) {
            .add-form { flex-direction: column; }
            .input--label { max-width: none; }
        }
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
