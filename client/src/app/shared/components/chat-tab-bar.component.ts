import {
    Component,
    ChangeDetectionStrategy,
    inject,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ChatTabsService } from '../../core/services/chat-tabs.service';

@Component({
    selector: 'app-chat-tab-bar',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink],
    template: `
        @if (tabsService.tabs().length > 0) {
            <div class="tab-bar">
                <div class="tab-bar__tabs">
                    @for (tab of tabsService.tabs(); track tab.sessionId) {
                        <a
                            class="tab"
                            [class.tab--active]="tabsService.activeSessionId() === tab.sessionId"
                            [class.tab--running]="tab.status === 'running' || tab.status === 'thinking' || tab.status === 'tool_use'"
                            [class.tab--error]="tab.status === 'error'"
                            [routerLink]="['/sessions', tab.sessionId]">
                            <span class="tab__status">
                                @switch (tab.status) {
                                    @case ('running') { <span class="tab__pulse"></span> }
                                    @case ('thinking') { <span class="tab__pulse"></span> }
                                    @case ('tool_use') { <span class="tab__pulse"></span> }
                                    @case ('error') { ! }
                                    @default { }
                                }
                            </span>
                            <span class="tab__label">{{ tab.label }}</span>
                            <button
                                class="tab__close"
                                (click)="closeTab(tab.sessionId, $event)"
                                title="Close tab"
                                type="button">&times;</button>
                        </a>
                    }
                </div>
                <button
                    class="tab-bar__new"
                    (click)="newChat()"
                    title="New conversation"
                    type="button">+</button>
            </div>
        }
    `,
    styles: `
        .tab-bar {
            display: flex;
            align-items: center;
            background: var(--bg-surface, #1a1a2e);
            border-bottom: 1px solid var(--border, #2a2a3e);
            height: 36px;
            padding: 0 0.25rem;
            gap: 0.25rem;
            overflow: hidden;
        }
        .tab-bar__tabs {
            display: flex;
            flex: 1;
            gap: 2px;
            overflow-x: auto;
            scrollbar-width: none;
        }
        .tab-bar__tabs::-webkit-scrollbar { display: none; }
        .tab {
            display: flex;
            align-items: center;
            gap: 0.3rem;
            padding: 0.25rem 0.5rem;
            background: transparent;
            border: none;
            border-radius: 4px 4px 0 0;
            color: var(--text-tertiary, #666);
            font-family: inherit;
            font-size: 0.68rem;
            text-decoration: none;
            cursor: pointer;
            transition: background 0.1s, color 0.1s;
            max-width: 180px;
            min-width: 0;
            white-space: nowrap;
            flex-shrink: 0;
        }
        .tab:hover {
            background: var(--bg-hover, #252538);
            color: var(--text-secondary, #bbb);
        }
        .tab--active {
            background: var(--bg-deep, #111);
            color: var(--text-primary, #eee);
            border-bottom: 2px solid var(--accent-cyan, #0ef);
        }
        .tab--running .tab__status { color: var(--accent-cyan, #0ef); }
        .tab--error .tab__status { color: var(--accent-red, #f33); }
        .tab__status {
            flex-shrink: 0;
            width: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.6rem;
            font-weight: 700;
        }
        .tab__pulse {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: var(--accent-cyan, #0ef);
            animation: pulse 1.5s ease-in-out infinite;
        }
        @keyframes pulse {
            0%, 100% { opacity: 0.4; }
            50% { opacity: 1; }
        }
        .tab__label {
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .tab__close {
            flex-shrink: 0;
            width: 16px;
            height: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: transparent;
            border: none;
            border-radius: 2px;
            color: var(--text-tertiary, #666);
            font-size: 0.8rem;
            cursor: pointer;
            opacity: 0;
            transition: opacity 0.1s, background 0.1s;
        }
        .tab:hover .tab__close { opacity: 1; }
        .tab__close:hover {
            background: var(--accent-red-dim, rgba(255, 51, 85, 0.15));
            color: var(--accent-red, #f33);
        }
        .tab-bar__new {
            flex-shrink: 0;
            width: 28px;
            height: 28px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: transparent;
            border: 1px solid var(--border, #333);
            border-radius: 4px;
            color: var(--text-tertiary, #666);
            font-size: 1rem;
            cursor: pointer;
            transition: color 0.15s, border-color 0.15s;
        }
        .tab-bar__new:hover {
            color: var(--accent-cyan, #0ef);
            border-color: var(--accent-cyan, #0ef);
        }
    `,
})
export class ChatTabBarComponent {
    protected readonly tabsService = inject(ChatTabsService);
    private readonly router = inject(Router);

    protected closeTab(sessionId: string, event: Event): void {
        event.preventDefault();
        event.stopPropagation();
        const nextId = this.tabsService.closeTab(sessionId);
        if (nextId) {
            this.router.navigate(['/sessions', nextId]);
        } else {
            this.router.navigate(['/chat']);
        }
    }

    protected newChat(): void {
        this.router.navigate(['/chat']);
    }
}
