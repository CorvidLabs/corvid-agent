import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { NotificationService } from '../../core/services/notification.service';
import { SECTION_STYLES } from './settings-shared.styles';

@Component({
    selector: 'app-notifications-settings',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MatSlideToggleModule],
    template: `
        <div class="settings__section">
            <h3 class="section-toggle" (click)="toggleSection()">
                <span class="section-chevron" [class.section-chevron--open]="!collapsed()">&#9654;</span>
                Notifications
            </h3>
            @if (!collapsed()) {
                <div class="notification-prefs section-collapse">
                    <div class="notif-row">
                        <div class="notif-info">
                            <span class="notif-name">Session Completed</span>
                            <span class="notif-desc">Notify when a session finishes successfully</span>
                        </div>
                        <mat-slide-toggle [checked]="notifSessionComplete()" (change)="notifSessionComplete.set($event.checked); saveNotifPrefs()" />
                    </div>
                    <div class="notif-row">
                        <div class="notif-info">
                            <span class="notif-name">Session Errors</span>
                            <span class="notif-desc">Notify when a session encounters an error</span>
                        </div>
                        <mat-slide-toggle [checked]="notifSessionError()" (change)="notifSessionError.set($event.checked); saveNotifPrefs()" />
                    </div>
                    <div class="notif-row">
                        <div class="notif-info">
                            <span class="notif-name">Approval Requests</span>
                            <span class="notif-desc">Notify when an agent needs tool approval</span>
                        </div>
                        <mat-slide-toggle [checked]="notifApproval()" (change)="notifApproval.set($event.checked); saveNotifPrefs()" />
                    </div>
                    <div class="notif-row">
                        <div class="notif-info">
                            <span class="notif-name">Work Task Updates</span>
                            <span class="notif-desc">Notify on PR creation, merge, or failure</span>
                        </div>
                        <mat-slide-toggle [checked]="notifWorkTask()" (change)="notifWorkTask.set($event.checked); saveNotifPrefs()" />
                    </div>
                    <div class="notif-row">
                        <div class="notif-info">
                            <span class="notif-name">Agent Messages</span>
                            <span class="notif-desc">Notify when an agent sends you a message</span>
                        </div>
                        <mat-slide-toggle [checked]="notifAgentMessage()" (change)="notifAgentMessage.set($event.checked); saveNotifPrefs()" />
                    </div>
                </div>
            }
        </div>
    `,
    styles: `
        ${SECTION_STYLES}
        .notification-prefs { display: flex; flex-direction: column; gap: 0.4rem; }
        .notif-row {
            display: flex; align-items: center; justify-content: space-between;
            padding: 0.7rem 0.85rem; background: var(--bg-raised);
            border-radius: var(--radius); gap: 1rem; min-height: 56px;
        }
        .notif-info { display: flex; flex-direction: column; gap: 0.15rem; }
        .notif-name { font-size: 0.85rem; font-weight: 600; color: var(--text-primary); }
        .notif-desc { font-size: 0.78rem; color: var(--text-tertiary); }
        @media (max-width: 600px) { .notif-row { flex-direction: column; align-items: stretch; gap: 0.4rem; } mat-slide-toggle { align-self: flex-end; } }
    `,
})
export class NotificationsSettingsComponent implements OnInit {
    private readonly notifications = inject(NotificationService);

    readonly collapsed = signal(false);
    readonly notifSessionComplete = signal(true);
    readonly notifSessionError = signal(true);
    readonly notifApproval = signal(true);
    readonly notifWorkTask = signal(true);
    readonly notifAgentMessage = signal(false);

    ngOnInit(): void {
        this.loadNotifPrefs();
    }

    toggleSection(): void {
        this.collapsed.update(v => !v);
    }

    saveNotifPrefs(): void {
        const prefs = {
            sessionComplete: this.notifSessionComplete(),
            sessionError: this.notifSessionError(),
            approval: this.notifApproval(),
            workTask: this.notifWorkTask(),
            agentMessage: this.notifAgentMessage(),
        };
        localStorage.setItem('corvid_notif_prefs', JSON.stringify(prefs));
        this.notifications.success('Notification preferences saved');
    }

    private loadNotifPrefs(): void {
        try {
            const raw = localStorage.getItem('corvid_notif_prefs');
            if (raw) {
                const prefs = JSON.parse(raw);
                if (typeof prefs.sessionComplete === 'boolean') this.notifSessionComplete.set(prefs.sessionComplete);
                if (typeof prefs.sessionError === 'boolean') this.notifSessionError.set(prefs.sessionError);
                if (typeof prefs.approval === 'boolean') this.notifApproval.set(prefs.approval);
                if (typeof prefs.workTask === 'boolean') this.notifWorkTask.set(prefs.workTask);
                if (typeof prefs.agentMessage === 'boolean') this.notifAgentMessage.set(prefs.agentMessage);
            }
        } catch { /* ignore corrupt localStorage */ }
    }
}
