import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { firstValueFrom } from 'rxjs';
import { SECTION_STYLES } from './settings-shared.styles';

@Component({
    selector: 'app-database-settings',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [],
    template: `
        <div class="settings__section">
            <h3 class="section-toggle" (click)="toggleSection()">
                <span class="section-chevron" [class.section-chevron--open]="!collapsed()">&#9654;</span>
                Database
            </h3>
            @if (!collapsed()) {
                <button
                    class="backup-btn"
                    [disabled]="backingUp()"
                    (click)="runBackup()"
                >{{ backingUp() ? 'Backing up...' : 'Create Backup' }}</button>
                @if (backupResult()) {
                    <p class="backup-result">{{ backupResult() }}</p>
                }
            }
        </div>
    `,
    styles: `
        ${SECTION_STYLES}
        .backup-result { font-size: 0.7rem; color: var(--accent-green); margin-top: 0.5rem; }
    `,
})
export class DatabaseSettingsComponent {
    private readonly api = inject(ApiService);
    private readonly notifications = inject(NotificationService);

    readonly collapsed = signal(false);
    readonly backingUp = signal(false);
    readonly backupResult = signal<string | null>(null);

    toggleSection(): void {
        this.collapsed.update(v => !v);
    }

    async runBackup(): Promise<void> {
        this.backingUp.set(true);
        this.backupResult.set(null);
        try {
            const result = await firstValueFrom(this.api.post<{ path: string }>('/backup'));
            this.backupResult.set(`Backup created: ${result.path}`);
            this.notifications.success('Database backup created');
        } catch {
            this.notifications.error('Backup failed');
        } finally {
            this.backingUp.set(false);
        }
    }
}
