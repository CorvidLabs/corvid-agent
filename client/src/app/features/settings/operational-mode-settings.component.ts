import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter, inject, signal, OnInit } from '@angular/core';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { firstValueFrom } from 'rxjs';
import { SECTION_STYLES } from './settings-shared.styles';
import { MatButtonModule } from '@angular/material/button';

@Component({
    selector: 'app-operational-mode-settings',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MatButtonModule],
    template: `
        <div class="settings__section">
            <h3 class="section-toggle" (click)="toggleSection()">
                <span class="section-chevron" [class.section-chevron--open]="!collapsed()">&#9654;</span>
                Operational Mode
                <span class="section-badge section-badge--mode" [attr.data-mode]="operationalMode()">{{ operationalMode() }}</span>
            </h3>
            @if (!collapsed()) {
                <div class="mode-selector section-collapse">
                    @for (mode of modes; track mode) {
                        <button mat-stroked-button
                            [class.mode-btn--active]="operationalMode() === mode"
                            (click)="setMode(mode)"
                        >{{ mode }}</button>
                    }
                </div>
                <p class="mode-desc">
                    @switch (operationalMode()) {
                        @case ('normal') { Agents execute tools immediately without approval. }
                        @case ('queued') { Tool calls are queued for manual approval before execution. }
                        @case ('paused') { All sessions are paused. No tool execution. }
                    }
                </p>
            }
        </div>
    `,
    styles: `
        ${SECTION_STYLES}
        .section-badge--mode[data-mode="normal"] { color: var(--accent-green); border-color: var(--accent-green); background: var(--accent-green-dim); }
        .section-badge--mode[data-mode="queued"] { color: var(--accent-amber); border-color: var(--accent-amber); background: var(--accent-amber-dim); }
        .section-badge--mode[data-mode="paused"] { color: var(--accent-red); border-color: var(--accent-red); background: var(--accent-red-dim); }
        .mode-selector { display: flex; gap: 0.5rem; margin-bottom: 0.5rem; }
        .mode-btn--active { border-color: var(--accent-cyan) !important; color: var(--accent-cyan) !important; background: var(--accent-cyan-dim) !important; }
        .mode-desc { font-size: 0.7rem; color: var(--text-tertiary); margin: 0; }
        @media (max-width: 600px) { .mode-selector { flex-wrap: wrap; } }
    `,
})
export class OperationalModeSettingsComponent implements OnInit {
    @Input() initialMode: string = 'normal';
    @Output() modeChanged = new EventEmitter<string>();

    private readonly api = inject(ApiService);
    private readonly notifications = inject(NotificationService);

    readonly collapsed = signal(false);
    readonly operationalMode = signal('normal');

    readonly modes = ['normal', 'queued', 'paused'];

    ngOnInit(): void {
        this.operationalMode.set(this.initialMode);
    }

    toggleSection(): void {
        this.collapsed.update(v => !v);
    }

    async setMode(mode: string): Promise<void> {
        try {
            await firstValueFrom(this.api.post<{ ok: boolean }>('/operational-mode', { mode }));
            this.operationalMode.set(mode);
            this.modeChanged.emit(mode);
            this.notifications.success(`Operational mode set to ${mode}`);
        } catch {
            this.notifications.error('Failed to update operational mode');
        }
    }
}
