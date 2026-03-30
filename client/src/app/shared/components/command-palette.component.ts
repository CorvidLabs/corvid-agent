import {
    Component,
    ChangeDetectionStrategy,
    inject,
    signal,
    computed,
    ElementRef,
    ViewChild,
    AfterViewInit,
    OnDestroy,
} from '@angular/core';
import { Router } from '@angular/router';
import { AgentService } from '../../core/services/agent.service';
import { SessionService } from '../../core/services/session.service';
import { ProjectService } from '../../core/services/project.service';
import { GuidedTourService } from '../../core/services/guided-tour.service';

interface CommandItem {
    id: string;
    label: string;
    category: string;
    icon: string;
    action: () => void;
    keywords?: string;
}

@Component({
    selector: 'app-command-palette',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        @if (open()) {
            <div class="palette-backdrop" (click)="close()" (keydown.escape)="close()">
                <div class="palette" (click)="$event.stopPropagation()">
                    <div class="palette__search">
                        <span class="palette__search-icon">/</span>
                        <input
                            #searchInput
                            class="palette__input"
                            type="text"
                            placeholder="Type a command..."
                            [value]="query()"
                            (input)="onInput($event)"
                            (keydown.escape)="close()"
                            (keydown.arrowdown)="moveSelection(1, $event)"
                            (keydown.arrowup)="moveSelection(-1, $event)"
                            (keydown.enter)="executeSelected()"
                            autocomplete="off"
                            spellcheck="false" />
                        <kbd class="palette__esc">esc</kbd>
                    </div>
                    <div class="palette__results">
                        @if (filteredCommands().length === 0) {
                            <div class="palette__empty">No results for "{{ query() }}"</div>
                        } @else {
                            @for (group of groupedResults(); track group.category) {
                                <div class="palette__group">
                                    <div class="palette__group-label">{{ group.category }}</div>
                                    @for (cmd of group.items; track cmd.id; let i = $index) {
                                        <button
                                            class="palette__item"
                                            [class.palette__item--active]="cmd.id === activeId()"
                                            (click)="execute(cmd)"
                                            (mouseenter)="selectedIndex.set(getGlobalIndex(cmd.id))"
                                            type="button">
                                            <span class="palette__item-icon">{{ cmd.icon }}</span>
                                            <span class="palette__item-label">{{ cmd.label }}</span>
                                            <span class="palette__item-cat">{{ cmd.category }}</span>
                                        </button>
                                    }
                                </div>
                            }
                        }
                    </div>
                    <div class="palette__footer">
                        <span><kbd>&uarr;</kbd><kbd>&darr;</kbd> navigate</span>
                        <span><kbd>Enter</kbd> select</span>
                        <span><kbd>Esc</kbd> close</span>
                    </div>
                </div>
            </div>
        }
    `,
    styles: `
        .palette-backdrop {
            position: fixed;
            inset: 0;
            z-index: 9999;
            background: var(--overlay-heavy);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            display: flex;
            justify-content: center;
            padding-top: 15vh;
            animation: backdropIn 0.15s ease;
        }
        @keyframes backdropIn {
            from { opacity: 0; backdrop-filter: blur(0); }
            to { opacity: 1; backdrop-filter: blur(8px); }
        }
        .palette {
            width: 560px;
            max-height: 420px;
            background: var(--bg-surface, #1a1a2e);
            border: 1px solid var(--border-bright, #333);
            border-radius: 12px;
            box-shadow: 0 16px 48px var(--shadow-deep), 0 0 80px rgba(0, 229, 255, 0.06);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            align-self: flex-start;
            animation: paletteIn 0.2s cubic-bezier(0.22, 1, 0.36, 1);
        }
        @keyframes paletteIn {
            from { opacity: 0; transform: scale(0.95) translateY(-8px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .palette__search {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.75rem 1rem;
            border-bottom: 1px solid var(--border, #2a2a3e);
        }
        .palette__search-icon {
            color: var(--accent-cyan, #0ef);
            font-weight: 700;
            font-size: 0.9rem;
            flex-shrink: 0;
        }
        .palette__input {
            flex: 1;
            background: transparent;
            border: none;
            color: var(--text-primary, #eee);
            font-family: inherit;
            font-size: 0.9rem;
            outline: none;
        }
        .palette__input::placeholder {
            color: var(--text-tertiary, #666);
        }
        .palette__esc {
            padding: 0.1rem 0.35rem;
            background: var(--bg-raised, #222);
            border: 1px solid var(--border, #333);
            border-radius: 4px;
            color: var(--text-tertiary, #666);
            font-size: 0.55rem;
            font-family: inherit;
        }
        .palette__results {
            flex: 1;
            overflow-y: auto;
            padding: 0.25rem 0;
        }
        .palette__empty {
            padding: 1.5rem;
            text-align: center;
            color: var(--text-tertiary, #666);
            font-size: 0.8rem;
        }
        .palette__group {
            padding: 0.25rem 0;
        }
        .palette__group-label {
            padding: 0.25rem 1rem;
            font-size: 0.58rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            color: var(--text-tertiary, #666);
        }
        .palette__item {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            width: 100%;
            padding: 0.5rem 1rem;
            background: transparent;
            border: none;
            color: var(--text-secondary, #bbb);
            font-family: inherit;
            font-size: 0.8rem;
            cursor: pointer;
            text-align: left;
            transition: background 0.05s;
        }
        .palette__item:hover,
        .palette__item--active {
            background: var(--accent-cyan-dim, var(--accent-cyan-subtle));
            color: var(--text-primary, #eee);
        }
        .palette__item--active {
            box-shadow: inset 3px 0 0 var(--accent-cyan);
        }
        .palette__item-icon {
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--bg-raised, #222);
            border-radius: 4px;
            font-size: 0.65rem;
            flex-shrink: 0;
        }
        .palette__item-label {
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .palette__item-cat {
            font-size: 0.6rem;
            color: var(--text-tertiary, #666);
            flex-shrink: 0;
        }
        .palette__footer {
            display: flex;
            gap: 1rem;
            padding: 0.5rem 1rem;
            border-top: 1px solid var(--border, #2a2a3e);
            font-size: 0.58rem;
            color: var(--text-tertiary, #666);
        }
        .palette__footer kbd {
            padding: 0.05rem 0.25rem;
            background: var(--bg-raised, #222);
            border: 1px solid var(--border, #333);
            border-radius: 3px;
            font-family: inherit;
            font-size: 0.55rem;
            margin-right: 0.15rem;
        }
        @media (max-width: 640px) {
            .palette { width: calc(100vw - 2rem); }
        }
    `,
})
export class CommandPaletteComponent implements AfterViewInit, OnDestroy {
    private readonly router = inject(Router);
    private readonly agentService = inject(AgentService);
    private readonly sessionService = inject(SessionService);
    private readonly projectService = inject(ProjectService);
    private readonly tourService = inject(GuidedTourService);

    @ViewChild('searchInput') searchInputRef?: ElementRef<HTMLInputElement>;

    readonly open = signal(false);
    readonly query = signal('');
    readonly selectedIndex = signal(0);

    private readonly boundKeyHandler = this.handleGlobalKey.bind(this);

    constructor() {
        document.addEventListener('keydown', this.boundKeyHandler);
    }

    ngAfterViewInit(): void {
        // Focus handled in toggle
    }

    ngOnDestroy(): void {
        document.removeEventListener('keydown', this.boundKeyHandler);
    }

    private handleGlobalKey(e: KeyboardEvent): void {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            this.toggle();
        }
    }

    toggle(): void {
        const next = !this.open();
        this.open.set(next);
        if (next) {
            this.query.set('');
            this.selectedIndex.set(0);
            setTimeout(() => this.searchInputRef?.nativeElement?.focus(), 10);
        }
    }

    close(): void {
        this.open.set(false);
    }

    onInput(event: Event): void {
        this.query.set((event.target as HTMLInputElement).value);
        this.selectedIndex.set(0);
    }

    private readonly allCommands = computed<CommandItem[]>(() => {
        const commands: CommandItem[] = [
            // Navigation
            { id: 'nav-chat', label: 'Go to Chat', category: 'Navigation', icon: '💬', action: () => this.nav('/chat'), keywords: 'home' },
            { id: 'nav-agents', label: 'Go to Agents', category: 'Navigation', icon: '🤖', action: () => this.nav('/agents'), keywords: 'bots' },
            { id: 'nav-flock', label: 'Go to Flock Directory', category: 'Navigation', icon: '🌐', action: () => this.nav('/agents/flock-directory'), keywords: 'directory discover network registry' },
            { id: 'nav-sessions', label: 'Go to Sessions', category: 'Navigation', icon: '📋', action: () => this.nav('/sessions'), keywords: 'conversations history' },
            { id: 'nav-work-tasks', label: 'Go to Work Tasks', category: 'Navigation', icon: '📝', action: () => this.nav('/sessions/work-tasks') },
            { id: 'nav-projects', label: 'Go to Projects', category: 'Navigation', icon: '📁', action: () => this.nav('/agents/projects') },
            { id: 'nav-councils', label: 'Go to Councils', category: 'Navigation', icon: '👥', action: () => this.nav('/sessions/councils') },
            { id: 'nav-models', label: 'Go to Models', category: 'Navigation', icon: '🧠', action: () => this.nav('/agents/models') },
            { id: 'nav-analytics', label: 'Go to Analytics', category: 'Navigation', icon: '📊', action: () => this.nav('/sessions/analytics') },
            { id: 'nav-logs', label: 'Go to Logs', category: 'Navigation', icon: '📜', action: () => this.nav('/observe/logs') },
            { id: 'nav-settings', label: 'Go to Settings', category: 'Navigation', icon: '⚙️', action: () => this.nav('/settings') },
            { id: 'nav-wallets', label: 'Go to Wallets', category: 'Navigation', icon: '💰', action: () => this.nav('/settings/wallets') },
            { id: 'nav-security', label: 'Go to Security', category: 'Navigation', icon: '🔒', action: () => this.nav('/settings/security') },
            { id: 'nav-spending', label: 'Go to Spending', category: 'Navigation', icon: '💳', action: () => this.nav('/settings/spending') },
            { id: 'nav-feed', label: 'Go to Live Feed', category: 'Navigation', icon: '📡', action: () => this.nav('/observe'), keywords: 'observe activity' },
            { id: 'nav-mcp', label: 'Go to MCP Servers', category: 'Navigation', icon: '🔌', action: () => this.nav('/settings/mcp-servers') },
            { id: 'nav-skills', label: 'Go to Skill Bundles', category: 'Navigation', icon: '🎯', action: () => this.nav('/agents/skill-bundles') },
            { id: 'nav-marketplace', label: 'Go to Marketplace', category: 'Navigation', icon: '🏪', action: () => this.nav('/settings/marketplace') },
            { id: 'nav-reputation', label: 'Go to Reputation', category: 'Navigation', icon: '⭐', action: () => this.nav('/observe/reputation') },
            { id: 'nav-webhooks', label: 'Go to Webhooks', category: 'Navigation', icon: '🪝', action: () => this.nav('/settings/webhooks') },
            { id: 'nav-schedules', label: 'Go to Schedules', category: 'Navigation', icon: '🕐', action: () => this.nav('/settings/schedules'), keywords: 'automate cron' },
            { id: 'nav-workflows', label: 'Go to Workflows', category: 'Navigation', icon: '🔄', action: () => this.nav('/settings/workflows') },
            { id: 'nav-brain', label: 'Go to Brain Viewer', category: 'Navigation', icon: '🧩', action: () => this.nav('/observe/brain-viewer') },

            // Actions
            { id: 'act-new-session', label: 'New Conversation', category: 'Actions', icon: '✨', action: () => this.nav('/sessions/new'), keywords: 'create chat start' },
            { id: 'act-new-agent', label: 'Create New Agent', category: 'Actions', icon: '➕', action: () => this.nav('/agents/new'), keywords: 'add bot' },
            { id: 'act-new-project', label: 'Create New Project', category: 'Actions', icon: '📁', action: () => this.nav('/agents/projects/new'), keywords: 'add' },
            { id: 'act-new-council', label: 'Create New Council', category: 'Actions', icon: '👥', action: () => this.nav('/sessions/councils/new'), keywords: 'add multi-agent' },
            { id: 'act-replay-tour', label: 'Replay Guided Tour', category: 'Actions', icon: '?', action: () => this.replayTour(), keywords: 'onboarding help walkthrough' },
        ];

        // Dynamic: agents
        for (const agent of this.agentService.agents()) {
            commands.push({
                id: `agent-${agent.id}`,
                label: agent.name,
                category: 'Agents',
                icon: agent.displayIcon || agent.name.charAt(0).toUpperCase(),
                action: () => this.nav(`/agents/${agent.id}`),
                keywords: agent.model,
            });
        }

        // Dynamic: recent sessions
        const sessions = this.sessionService.sessions()
            .slice()
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
            .slice(0, 10);
        for (const session of sessions) {
            commands.push({
                id: `session-${session.id}`,
                label: session.name || session.initialPrompt || `Session ${session.id.slice(0, 8)}`,
                category: 'Recent Sessions',
                icon: session.status === 'running' ? '▶' : session.status === 'error' ? '!' : '◼',
                action: () => this.nav(`/sessions/${session.id}`),
                keywords: session.initialPrompt || '',
            });
        }

        // Dynamic: projects
        for (const project of this.projectService.projects()) {
            commands.push({
                id: `project-${project.id}`,
                label: project.name,
                category: 'Projects',
                icon: '📁',
                action: () => this.nav(`/projects/${project.id}`),
                keywords: project.description || '',
            });
        }

        return commands;
    });

    readonly filteredCommands = computed(() => {
        const q = this.query().toLowerCase().trim();
        if (!q) return this.allCommands();
        const terms = q.split(/\s+/);
        return this.allCommands().filter((cmd) => {
            const haystack = `${cmd.label} ${cmd.category} ${cmd.keywords || ''}`.toLowerCase();
            return terms.every((t) => haystack.includes(t));
        });
    });

    readonly groupedResults = computed(() => {
        const groups = new Map<string, CommandItem[]>();
        for (const cmd of this.filteredCommands()) {
            const list = groups.get(cmd.category) || [];
            list.push(cmd);
            groups.set(cmd.category, list);
        }
        return Array.from(groups.entries()).map(([category, items]) => ({ category, items }));
    });

    readonly activeId = computed(() => {
        const items = this.filteredCommands();
        const idx = this.selectedIndex();
        return items[idx]?.id ?? '';
    });

    getGlobalIndex(id: string): number {
        return this.filteredCommands().findIndex((c) => c.id === id);
    }

    moveSelection(delta: number, event: Event): void {
        event.preventDefault();
        const len = this.filteredCommands().length;
        if (len === 0) return;
        this.selectedIndex.update((i) => (i + delta + len) % len);
    }

    executeSelected(): void {
        const items = this.filteredCommands();
        const idx = this.selectedIndex();
        if (items[idx]) this.execute(items[idx]);
    }

    execute(cmd: CommandItem): void {
        this.close();
        cmd.action();
    }

    private nav(path: string): void {
        this.router.navigate([path]);
    }

    private replayTour(): void {
        this.tourService.reset();
        this.router.navigate(['/chat']).then(() => {
            setTimeout(() => this.tourService.startTour(), 400);
        });
    }
}
