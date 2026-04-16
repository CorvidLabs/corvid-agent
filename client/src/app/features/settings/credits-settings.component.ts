import { Component, ChangeDetectionStrategy, Input, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { firstValueFrom } from 'rxjs';
import { SECTION_STYLES } from './settings-shared.styles';

@Component({
    selector: 'app-credits-settings',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule],
    template: `
        <div class="settings__section">
            <h3 class="section-toggle" (click)="toggleSection()">
                <span class="section-chevron" [class.section-chevron--open]="!collapsed()">&#9654;</span>
                Credit Configuration
                @if (isDirty()) {
                    <span class="dirty-badge dirty-badge-pulse">Unsaved changes</span>
                }
            </h3>
            @if (!collapsed()) {
                <div class="credit-grid section-collapse">
                    @for (field of creditFields; track field.key) {
                        <div class="credit-field">
                            <label class="credit-label" [for]="'credit_' + field.key">{{ field.label }}</label>
                            <input
                                class="credit-input"
                                [class.credit-input--dirty]="isCreditDirty(field.key)"
                                type="number"
                                [id]="'credit_' + field.key"
                                [ngModel]="getCreditValue(field.key)"
                                (ngModelChange)="setCreditValue(field.key, $event)"
                            />
                            <span class="credit-desc">{{ field.description }}</span>
                        </div>
                    }
                </div>
                <div class="credit-actions">
                    <button
                        class="save-btn"
                        [disabled]="saving() || !isDirty()"
                        (click)="saveCreditConfig()"
                    >{{ saving() ? 'Saving...' : 'Save Credit Config' }}</button>
                    @if (isDirty()) {
                        <button class="cancel-btn cancel-btn--sm" (click)="resetCreditChanges()">Discard Changes</button>
                    }
                </div>
            }
        </div>
    `,
    styles: `
        ${SECTION_STYLES}
        .credit-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 1rem; margin-bottom: 1rem; }
        .credit-field { display: flex; flex-direction: column; gap: 0.3rem; }
        .credit-label { font-size: 0.78rem; color: var(--text-secondary); font-weight: 600; }
        .credit-input {
            padding: 0.55rem 0.65rem; background: var(--bg-input); border: 1px solid var(--border-bright);
            border-radius: var(--radius); color: var(--text-primary); font-size: 0.9rem;
            font-family: inherit; width: 100%; min-height: 44px;
        }
        .credit-input:focus { border-color: var(--accent-cyan); box-shadow: var(--glow-cyan); outline: none; }
        .credit-input--dirty { border-color: var(--accent-amber) !important; }
        .credit-desc { font-size: 0.78rem; color: var(--text-tertiary); }
        .credit-actions { display: flex; gap: 0.5rem; align-items: center; }
        @media (max-width: 600px) { .credit-grid { grid-template-columns: 1fr; } }
    `,
})
export class CreditsSettingsComponent {
    @Input() creditConfig: Record<string, string> = {};

    private readonly api = inject(ApiService);
    private readonly notifications = inject(NotificationService);

    readonly collapsed = signal(false);
    readonly saving = signal(false);
    readonly dirtyKeys = signal<Set<string>>(new Set());
    readonly isDirty = computed(() => this.dirtyKeys().size > 0);

    private creditValues: Record<string, string> = {};

    readonly creditFields = [
        { key: 'credits_per_algo', label: 'Credits per ALGO', description: 'How many credits 1 ALGO buys' },
        { key: 'credits_per_turn', label: 'Credits per Turn', description: 'Credits consumed per agent turn' },
        { key: 'credits_per_agent_message', label: 'Credits per Agent Message', description: 'Credits for agent-to-agent messages' },
        { key: 'low_credit_threshold', label: 'Low Credit Warning', description: 'Threshold for low-balance warnings' },
        { key: 'free_credits_on_first_message', label: 'Free Credits (First Message)', description: 'Credits given on first contact' },
        { key: 'reserve_per_group_message', label: 'Reserve per Group Message', description: 'Credits reserved for group chats' },
    ];

    toggleSection(): void {
        this.collapsed.update(v => !v);
    }

    getCreditValue(key: string): string {
        return this.creditValues[key] ?? this.creditConfig[key] ?? '';
    }

    setCreditValue(key: string, value: string): void {
        this.creditValues[key] = value;
        const original = this.creditConfig[key] ?? '';
        this.dirtyKeys.update((set) => {
            const next = new Set(set);
            if (value === original) next.delete(key);
            else next.add(key);
            return next;
        });
    }

    isCreditDirty(key: string): boolean {
        return this.dirtyKeys().has(key);
    }

    resetCreditChanges(): void {
        this.creditValues = {};
        this.dirtyKeys.set(new Set());
    }

    async saveCreditConfig(): Promise<void> {
        if (!this.isDirty()) return;
        this.saving.set(true);
        try {
            await firstValueFrom(this.api.put<{ ok: boolean }>('/settings/credits', this.creditValues));
            this.notifications.success('Credit configuration saved');
            this.creditValues = {};
            this.dirtyKeys.set(new Set());
        } catch {
            this.notifications.error('Failed to save credit configuration');
        } finally {
            this.saving.set(false);
        }
    }
}
