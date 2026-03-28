import {
    Component,
    ChangeDetectionStrategy,
    signal,
} from '@angular/core';
import { ScheduleListComponent } from '../schedules/schedule-list.component';
import { WorkflowListComponent } from '../workflows/workflow-list.component';
import { WebhookListComponent } from '../webhooks/webhook-list.component';
import { MentionPollingListComponent } from '../mention-polling/mention-polling-list.component';

type AutomationSection = 'schedules' | 'workflows' | 'webhooks' | 'polling';

@Component({
    selector: 'app-settings-automation',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ScheduleListComponent, WorkflowListComponent, WebhookListComponent, MentionPollingListComponent],
    template: `
        <div class="settings-section">
            <div class="settings-section__nav" role="tablist" aria-label="Automation sections">
                <button
                    class="settings-section__btn"
                    [class.settings-section__btn--active]="section() === 'schedules'"
                    (click)="section.set('schedules')"
                    role="tab">
                    Schedules
                </button>
                <button
                    class="settings-section__btn"
                    [class.settings-section__btn--active]="section() === 'workflows'"
                    (click)="section.set('workflows')"
                    role="tab">
                    Workflows
                </button>
                <button
                    class="settings-section__btn"
                    [class.settings-section__btn--active]="section() === 'webhooks'"
                    (click)="section.set('webhooks')"
                    role="tab">
                    Webhooks
                </button>
                <button
                    class="settings-section__btn"
                    [class.settings-section__btn--active]="section() === 'polling'"
                    (click)="section.set('polling')"
                    role="tab">
                    Polling
                </button>
            </div>
            <div class="settings-section__content">
                @switch (section()) {
                    @case ('schedules') { <app-schedule-list /> }
                    @case ('workflows') { <app-workflow-list /> }
                    @case ('webhooks') { <app-webhook-list /> }
                    @case ('polling') { <app-mention-polling-list /> }
                }
            </div>
        </div>
    `,
    styles: `
        .settings-section {
            display: flex;
            flex-direction: column;
            height: 100%;
        }
        .settings-section__nav {
            display: flex;
            gap: 0;
            padding: 0 1rem;
            border-bottom: 1px solid var(--border-subtle);
            background: rgba(12, 13, 20, 0.2);
            overflow-x: auto;
            scrollbar-width: none;
            flex-shrink: 0;
        }
        .settings-section__nav::-webkit-scrollbar { display: none; }
        .settings-section__btn {
            padding: 0.5rem 0.85rem;
            font-size: 0.72rem;
            font-weight: 600;
            font-family: inherit;
            letter-spacing: 0.03em;
            background: transparent;
            border: none;
            border-bottom: 2px solid transparent;
            color: var(--text-secondary);
            cursor: pointer;
            white-space: nowrap;
            transition: color 0.15s, border-color 0.15s;
        }
        .settings-section__btn:hover {
            color: var(--text-primary);
        }
        .settings-section__btn--active {
            color: var(--accent-cyan);
            border-bottom-color: var(--accent-cyan);
        }
        .settings-section__content {
            flex: 1;
            overflow-y: auto;
        }
    `,
})
export class SettingsAutomationComponent {
    readonly section = signal<AutomationSection>('schedules');
}
