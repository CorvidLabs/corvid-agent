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
            background: var(--bg-surface);
            border-bottom: 1px solid var(--border);
            height: clamp(40px, 3.5vw, 52px);
            padding: 0 clamp(0.5rem, 1vw, 1rem);
            gap: clamp(0.35rem, 0.5vw, 0.5rem);
            min-width: 0;
        }
        .tab-bar--collapsed {
            height: 28px;
        }
        .tab-bar__collapse {
            flex-shrink: 0;
            display: flex;
            align-items: center;
            gap: 0.35rem;
            background: none;
            border: none;
            color: var(--text-tertiary);
            font-family: inherit;
            font-size: var(--text-xxs);
            cursor: pointer;
            padding: 0.25rem 0.5rem;
            border-radius: var(--radius-sm);
            transition: color 0.15s, background 0.15s;
        }
        .tab-bar__collapse:hover {
            color: var(--accent-cyan);
            background: var(--bg-hover);
        }
        .tab-bar__collapse-chevron {
            font-size: var(--text-micro);
            transition: transform 150ms ease;
            transform: rotate(-90deg);
        }
        .tab-bar__collapse-chevron--down {
            transform: rotate(0deg);
        }
        .tab-bar__collapse-count {
            font-size: var(--text-micro);
            font-weight: 700;
            color: var(--accent-cyan);
        }
        .tab-bar__tabs {
            display: flex;
            flex: 1;
            min-width: 0;
            gap: 2px;
            overflow-x: auto;
            scrollbar-width: thin;
            scrollbar-color: var(--border) transparent;
        }
        .tab-bar__tabs::-webkit-scrollbar { height: 3px; }
        .tab-bar__tabs::-webkit-scrollbar-track { background: transparent; }
        .tab-bar__tabs::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
        .tab {
            display: flex;
            align-items: center;
            gap: 0.4rem;
            padding: clamp(0.35rem, 0.4vw, 0.5rem) clamp(0.75rem, 1vw, 1.25rem);
            background: transparent;
            border: none;
            border-radius: var(--radius) var(--radius) 0 0;
            color: var(--text-tertiary);
            font-family: inherit;
            font-size: var(--text-sm);
            text-decoration: none;
            cursor: pointer;
            transition: background 0.1s, color 0.1s;
            max-width: clamp(240px, 25vw, 400px);
            min-width: 0;
            white-space: nowrap;
            flex-shrink: 0;
            min-height: clamp(36px, 3vw, 46px);
        }
        .tab:hover {
            background: var(--bg-hover);
            color: var(--text-secondary);
        }
        .tab--active {
            background: var(--bg-deep);
            color: var(--text-primary);
            border-bottom: 2px solid var(--accent-cyan);
        }
        .tab--running .tab__status { color: var(--accent-cyan); }
        .tab--error .tab__status { color: var(--accent-red); }
        .tab__index {
            flex-shrink: 0;
            font-size: var(--text-micro);
            color: var(--text-quaternary);
            min-width: 10px;
            text-align: center;
        }
        .tab--active .tab__index { color: var(--text-tertiary); }
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
            font-size: var(--text-xs);
            color: var(--accent-cyan);
            opacity: 0.7;
            white-space: nowrap;
        }
        .tab__pulse {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: var(--accent-cyan);
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
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: transparent;
            border: none;
            border-radius: var(--radius-sm);
            color: var(--text-tertiary);
            font-size: var(--text-sm);
            cursor: pointer;
            opacity: 0;
            transition: opacity 0.1s, background 0.1s;
        }
        .tab:hover .tab__close { opacity: 1; }
        .tab__close:hover {
            background: var(--accent-red-dim);
            color: var(--accent-red);
        }
        .tab-bar__new {
            flex-shrink: 0;
            width: clamp(34px, 2.5vw, 42px);
            height: clamp(34px, 2.5vw, 42px);
            display: flex;
            align-items: center;
            justify-content: center;
            background: transparent;
            border: 1px solid var(--border);
            border-radius: var(--radius);
            color: var(--text-tertiary);
            font-size: var(--text-lg);
            cursor: pointer;
            transition: color 0.15s, border-color 0.15s;
        }
        .tab-bar__new:hover {
            color: var(--accent-cyan);
            border-color: var(--accent-cyan);
        }

        /* Hidden on mobile — bottom nav handles navigation */
        @media (max-width: 767px) {
            :host { display: none; }
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
        const wasActive = this.tabsService.activeSessionId() === sessionId;
        const nextId = this.tabsService.closeTab(sessionId);
        if (nextId) {
            this.router.navigate(['/sessions', nextId]);
        } else if (wasActive) {
            this.router.navigate(['/chat']);
        }
        // Non-active tab closed — stay on current page
    }

    protected newChat(): void {
        this.router.navigate(['/chat']);
    }
}
