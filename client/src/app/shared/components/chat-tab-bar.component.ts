import {
    Component,
    ChangeDetectionStrategy,
    inject,
    signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ChatTabsService } from '../../core/services/chat-tabs.service';

const COLLAPSED_KEY = 'corvid-chat-tabs-collapsed';

@Component({
    selector: 'app-chat-tab-bar',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink],
    template: `
        @if (tabsService.tabs().length > 0) {
            <div class="tab-bar" [class.tab-bar--collapsed]="collapsed()">
                <button
                    class="tab-bar__collapse"
                    (click)="toggleCollapse()"
                    [title]="collapsed() ? 'Show tabs (' + tabsService.tabs().length + ' open)' : 'Hide tabs'"
                    type="button">
                    <span class="tab-bar__collapse-chevron" [class.tab-bar__collapse-chevron--down]="collapsed()">&#x25BE;</span>
                    @if (collapsed()) {
                        <span class="tab-bar__collapse-count">{{ tabsService.tabs().length }}</span>
                    }
                </button>
                @if (!collapsed()) {
                    <div class="tab-bar__tabs">
                        @for (tab of tabsService.tabs(); track tab.sessionId; let i = $index) {
                            <a
                                class="tab"
                                [class.tab--active]="tabsService.activeSessionId() === tab.sessionId"
                                [class.tab--running]="tab.status === 'running' || tab.status === 'thinking' || tab.status === 'tool_use'"
                                [class.tab--error]="tab.status === 'error'"
                                [routerLink]="['/sessions', tab.sessionId]"
                                [title]="(tab.agentName ? tab.agentName + ' — ' : '') + tab.label">
                                <span class="tab__index">{{ i < 9 ? i + 1 : '' }}</span>
                                <span class="tab__status">
                                    @switch (tab.status) {
                                        @case ('running') { <span class="tab__pulse"></span> }
                                        @case ('thinking') { <span class="tab__pulse"></span> }
                                        @case ('tool_use') { <span class="tab__pulse"></span> }
                                        @case ('error') { ! }
                                        @default { }
                                    }
                                </span>
                                @if (tab.agentName) {
                                    <span class="tab__agent">{{ tab.agentName }}</span>
                                }
                                <span class="tab__label">{{ tab.label }}</span>
                                <button
                                    class="tab__close"
                                    (click)="closeTab(tab.sessionId, $event)"
                                    title="Close tab (Cmd+W)"
                                    type="button">&times;</button>
                            </a>
                        }
                    </div>
                    <button
                        class="tab-bar__new"
                        (click)="newChat()"
                        title="New conversation (Cmd+T)"
                        type="button">+</button>
                }
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
        .tab-bar--collapsed {
            height: 24px;
        }
        .tab-bar__collapse {
            flex-shrink: 0;
            display: flex;
            align-items: center;
            gap: 0.25rem;
            background: none;
            border: none;
            color: var(--text-tertiary, #666);
            font-family: inherit;
            font-size: 0.6rem;
            cursor: pointer;
            padding: 0.15rem 0.35rem;
            border-radius: 3px;
            transition: color 0.15s, background 0.15s;
        }
        .tab-bar__collapse:hover {
            color: var(--accent-cyan, #0ef);
            background: var(--bg-hover, #252538);
        }
        .tab-bar__collapse-chevron {
            font-size: 0.55rem;
            transition: transform 150ms ease;
            transform: rotate(-90deg);
        }
        .tab-bar__collapse-chevron--down {
            transform: rotate(0deg);
        }
        .tab-bar__collapse-count {
            font-size: 0.55rem;
            font-weight: 700;
            color: var(--accent-cyan, #0ef);
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
        .tab__index {
            flex-shrink: 0;
            font-size: 0.55rem;
            color: var(--text-quaternary, #555);
            min-width: 8px;
            text-align: center;
        }
        .tab--active .tab__index { color: var(--text-tertiary, #888); }
        .tab__status {
            flex-shrink: 0;
            width: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.6rem;
            font-weight: 700;
        }
        .tab__agent {
            flex-shrink: 0;
            font-size: 0.6rem;
            color: var(--accent-cyan, #0ef);
            opacity: 0.7;
            max-width: 60px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
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
            white-space: nowrap;
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
            background: var(--accent-red-dim, var(--accent-red-dim));
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
    protected readonly collapsed = signal(localStorage.getItem(COLLAPSED_KEY) === 'true');

    protected toggleCollapse(): void {
        const next = !this.collapsed();
        this.collapsed.set(next);
        localStorage.setItem(COLLAPSED_KEY, String(next));
    }

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
