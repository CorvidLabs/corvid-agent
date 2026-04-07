import { Component, ChangeDetectionStrategy, Input, inject, signal, OnInit } from '@angular/core';
import { TitleCasePipe } from '@angular/common';
import { SessionService } from '../../core/services/session.service';
import { ApiService } from '../../core/services/api.service';
import { firstValueFrom } from 'rxjs';
import { SECTION_STYLES } from './settings-shared.styles';
import type { SettingsData } from './system-info-settings.component';

@Component({
    selector: 'app-system-health-settings',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [TitleCasePipe],
    template: `
        <div class="settings__section">
            <h3 class="section-toggle" (click)="toggleSection()">
                <span class="section-chevron" [class.section-chevron--open]="!collapsed()">&#9654;</span>
                System Health
            </h3>
            @if (!collapsed()) {
                <div class="health-grid section-collapse">
                    <div class="health-item">
                        <span class="health-dot" [attr.data-status]="algochatStatus() ? 'ok' : 'off'" [class.health-dot-pulse]="algochatStatus()?.enabled"></span>
                        <span class="health-name">AlgoChat</span>
                        <span class="health-status">{{ algochatStatus()?.enabled ? 'Connected' : 'Disconnected' }}</span>
                    </div>
                    <div class="health-item">
                        <span class="health-dot" [attr.data-status]="operationalMode === 'normal' ? 'ok' : operationalMode === 'paused' ? 'off' : 'warn'" [class.health-dot-pulse]="operationalMode === 'normal'"></span>
                        <span class="health-name">Operations</span>
                        <span class="health-status">{{ operationalMode | titlecase }}</span>
                    </div>
                    <div class="health-item">
                        <span class="health-dot" [attr.data-status]="(settings?.system?.sessionCount ?? 0) > 0 ? 'ok' : 'off'"></span>
                        <span class="health-name">Sessions</span>
                        <span class="health-status">{{ settings?.system?.sessionCount }} total</span>
                    </div>
                    <div class="health-item">
                        <span class="health-dot" [attr.data-status]="pskContactsCount() > 0 ? 'ok' : 'off'"></span>
                        <span class="health-name">Mobile Contacts</span>
                        <span class="health-status">{{ pskContactsCount() }} configured</span>
                    </div>
                </div>
            }
        </div>
    `,
    styles: `
        ${SECTION_STYLES}
        .health-grid { display: flex; flex-direction: column; gap: 0.5rem; }
        .health-item { display: flex; align-items: center; gap: 0.6rem; padding: 0.4rem 0.5rem; background: var(--bg-raised); border-radius: var(--radius); }
        .health-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .health-dot[data-status="ok"] { background: var(--accent-green); box-shadow: 0 0 6px var(--accent-green); }
        .health-dot[data-status="warn"] { background: var(--accent-amber); box-shadow: 0 0 6px var(--accent-amber); }
        .health-dot[data-status="off"] { background: var(--text-tertiary); }
        .health-name { font-size: 0.75rem; font-weight: 600; color: var(--text-primary); min-width: 120px; }
        .health-status { font-size: 0.7rem; color: var(--text-secondary); }
    `,
})
export class SystemHealthSettingsComponent implements OnInit {
    @Input() settings: SettingsData | null = null;
    @Input() operationalMode: string = 'normal';

    private readonly sessionService = inject(SessionService);
    private readonly api = inject(ApiService);

    readonly algochatStatus = this.sessionService.algochatStatus;
    readonly collapsed = signal(false);
    readonly pskContactsCount = signal(0);

    ngOnInit(): void {
        this.loadPskContactsCount();
    }

    toggleSection(): void {
        this.collapsed.update(v => !v);
    }

    private async loadPskContactsCount(): Promise<void> {
        try {
            const result = await firstValueFrom(
                this.api.get<{ contacts: { id: string }[] }>('/algochat/psk-contacts')
            );
            this.pskContactsCount.set(result.contacts.length);
        } catch {
            // Non-critical
        }
    }
}
