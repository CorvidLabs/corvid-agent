import {
    Component,
    ChangeDetectionStrategy,
    inject,
    signal,
    computed,
    OnInit,
    ViewChild,
    ElementRef,
    AfterViewInit,
} from '@angular/core';
import { Router } from '@angular/router';
import { AgentService } from '../../core/services/agent.service';
import { ProjectService } from '../../core/services/project.service';
import { SessionService } from '../../core/services/session.service';
import { NotificationService } from '../../core/services/notification.service';
import type { Agent } from '../../core/models/agent.model';
import type { Session } from '../../core/models/session.model';
import { ChatTabsService } from '../../core/services/chat-tabs.service';
import { OnboardingComponent } from './onboarding.component';

@Component({
    selector: 'app-chat-home',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [OnboardingComponent],
    template: `
        @if (showOnboarding()) {
            <app-onboarding (done)="onboardingSkipped.set(true)" />
        } @else {
        <div class="chat-home">
            <div class="chat-home__bg-glow" aria-hidden="true"></div>
            <div class="chat-home__scroll">
                <div class="chat-home__center">
                    <div class="chat-home__logo-mark" aria-hidden="true">C</div>
                    <h1 class="chat-home__title">CorvidAgent</h1>
                    <p class="chat-home__subtitle">What would you like to work on?</p>
                    <p class="chat-home__shortcut-hint">
                        <kbd>Ctrl</kbd>+<kbd>K</kbd> command palette
                    </p>

                    <div class="chat-home__input-card">
                        <textarea
                            class="chat-home__textarea"
                            #promptInput
                            [value]="prompt()"
                            (input)="onPromptInput($event)"
                            (keydown)="onKeydown($event)"
                            placeholder="Ask anything..."
                            rows="2"
                            [disabled]="launching()"
                            aria-label="Chat prompt"
                        ></textarea>
                        <div class="chat-home__actions">
                            <div class="chat-home__pickers">
                                <div class="chat-home__agent-picker">
                                    <label for="agentSelect" class="chat-home__picker-label">Agent</label>
                                    <select
                                        id="agentSelect"
                                        class="chat-home__select"
                                        [value]="selectedAgentId()"
                                        (change)="onAgentChange($event)"
                                    >
                                        <option value="">Default</option>
                                        @for (agent of agents(); track agent.id) {
                                            <option [value]="agent.id">{{ agent.name }}</option>
                                        }
                                    </select>
                                </div>
                                <div class="chat-home__agent-picker">
                                    <label for="projectSelect" class="chat-home__picker-label">Project</label>
                                    <select
                                        id="projectSelect"
                                        class="chat-home__select"
                                        [value]="selectedProjectId()"
                                        (change)="onProjectChange($event)"
                                    >
                                        <option value="">Sandbox</option>
                                        @for (project of projects(); track project.id) {
                                            <option [value]="project.id">{{ project.name }}</option>
                                        }
                                    </select>
                                </div>
                            </div>
                            <button
                                class="chat-home__send"
                                [disabled]="!prompt().trim() || launching()"
                                (click)="onSend()"
                            >
                                @if (launching()) {
                                    <span class="chat-home__send-spinner"></span>
                                    Starting...
                                } @else {
                                    Send
                                    <span class="chat-home__send-arrow">&rarr;</span>
                                }
                            </button>
                        </div>
                    </div>

                    <div class="chat-home__templates">
                        @for (tpl of templates; track tpl.label) {
                            <button class="chat-home__template" (click)="useHint(tpl.prompt)">
                                <span class="chat-home__template-icon">{{ tpl.icon }}</span>
                                <span class="chat-home__template-text">
                                    <span class="chat-home__template-label">{{ tpl.label }}</span>
                                    <span class="chat-home__template-desc">{{ tpl.desc }}</span>
                                </span>
                            </button>
                        }
                    </div>

                    @if (recentSessions().length > 0) {
                        <div class="chat-home__recent">
                            <div class="chat-home__recent-header">
                                <h2 class="chat-home__recent-title">Recent conversations</h2>
                                <button class="chat-home__recent-all" (click)="viewAllSessions()">
                                    View all &rarr;
                                </button>
                            </div>
                            <div class="chat-home__recent-list">
                                @for (session of recentSessions(); track session.id) {
                                    <button
                                        class="chat-home__recent-item"
                                        (click)="openSession(session)"
                                    >
                                        <span class="chat-home__recent-status"
                                            [class.chat-home__recent-status--running]="session.status === 'running'"
                                            [class.chat-home__recent-status--error]="session.status === 'error'"
                                            [class.chat-home__recent-status--stopped]="session.status === 'stopped'"
                                        ></span>
                                        <span class="chat-home__recent-name">{{ session.name || session.initialPrompt || 'Untitled' }}</span>
                                        <span class="chat-home__recent-meta">{{ formatTime(session.updatedAt) }}</span>
                                    </button>
                                }
                            </div>
                        </div>
                    }
                </div>
            </div>
        </div>
        }
    `,
    styles: `
        :host {
            display: flex;
            flex: 1;
            min-height: 0;
        }
        .chat-home {
            display: flex;
            flex: 1;
            background: var(--bg-deep);
            position: relative;
            overflow: hidden;
        }
        .chat-home__bg-glow {
            position: absolute;
            top: -30%;
            left: 50%;
            transform: translateX(-50%);
            width: 600px;
            height: 600px;
            border-radius: 50%;
            background: radial-gradient(
                circle,
                var(--accent-cyan-wash) 0%,
                var(--accent-magenta-subtle) 35%,
                transparent 65%
            );
            pointer-events: none;
            filter: blur(40px);
            animation: subtlePulse 8s ease-in-out infinite;
        }
        .chat-home__scroll {
            flex: 1;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 4rem var(--space-8) var(--space-12);
        }
        .chat-home__center {
            width: 100%;
            max-width: 820px;
            display: flex;
            flex-direction: column;
            align-items: center;
            position: relative;
            z-index: 1;
        }
        .chat-home__logo-mark {
            width: 64px;
            height: 64px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: var(--radius-xl);
            background: linear-gradient(135deg, var(--accent-cyan-dim), var(--accent-magenta-wash));
            border: 1px solid var(--accent-cyan-mid);
            font-size: 1.75rem;
            font-weight: 800;
            color: var(--accent-cyan);
            text-shadow: 0 0 16px var(--accent-cyan-glow);
            margin-bottom: 1rem;
            box-shadow: 0 4px 24px var(--accent-cyan-tint);
        }
        .chat-home__title {
            font-size: 2.4rem;
            font-weight: 700;
            margin: 0 0 0.5rem;
            letter-spacing: 0.03em;
            background: linear-gradient(135deg, var(--accent-cyan), var(--accent-magenta));
            background-size: 200% 200%;
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            animation: gradientShift 6s ease infinite;
        }
        .chat-home__subtitle {
            color: var(--text-secondary);
            font-size: 1.05rem;
            margin: 0 0 0.75rem;
        }
        .chat-home__shortcut-hint {
            display: flex;
            align-items: center;
            gap: 0.25rem;
            font-size: 0.75rem;
            color: var(--text-tertiary);
            margin: 0 0 1.5rem;
            opacity: 0.7;
        }
        .chat-home__shortcut-hint kbd {
            padding: 1px 5px;
            border: 1px solid var(--border);
            border-radius: var(--radius-sm);
            background: var(--bg-raised);
            font-family: inherit;
            font-size: 0.7rem;
        }
        .chat-home__input-card {
            width: 100%;
            background: rgba(15, 16, 24, 0.7);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid var(--glass-border);
            border-radius: var(--radius-xl);
            overflow: hidden;
            transition: border-color 0.25s, box-shadow 0.25s;
            box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
        }
        .chat-home__input-card:focus-within {
            border-color: var(--accent-cyan-glow);
            box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3), 0 0 0 1px var(--accent-cyan-dim), 0 0 30px var(--accent-cyan-subtle);
        }
        .chat-home__textarea {
            width: 100%;
            padding: var(--space-5) var(--space-5) var(--space-2);
            border: none;
            background: transparent;
            color: var(--text-primary);
            font-family: inherit;
            font-size: 1rem;
            line-height: 1.6;
            resize: none;
            outline: none;
            max-height: 200px;
            overflow-y: auto;
        }
        .chat-home__textarea::placeholder {
            color: var(--text-tertiary);
        }
        .chat-home__textarea:disabled {
            opacity: 0.5;
        }
        .chat-home__actions {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: var(--space-2) var(--space-5) 0.85rem;
            gap: 0.75rem;
        }
        .chat-home__pickers {
            display: flex;
            align-items: center;
            gap: 1rem;
        }
        .chat-home__agent-picker {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        .chat-home__picker-label {
            font-size: 0.8rem;
            font-weight: 600;
            color: var(--text-tertiary);
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        .chat-home__select {
            padding: 0.35rem 0.6rem;
            border: 1px solid var(--border);
            border-radius: var(--radius);
            background: var(--bg-input);
            color: var(--text-primary);
            font-family: inherit;
            font-size: 0.9rem;
            cursor: pointer;
            transition: border-color 0.15s;
        }
        .chat-home__select:focus {
            outline: none;
            border-color: var(--accent-cyan);
        }
        .chat-home__send {
            display: flex;
            align-items: center;
            gap: 0.35rem;
            padding: var(--space-2) 1.4rem;
            border: none;
            border-radius: var(--radius-lg);
            background: linear-gradient(135deg, var(--accent-cyan-dim), var(--accent-cyan-wash));
            color: var(--accent-cyan);
            font-family: inherit;
            font-size: 0.85rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            cursor: pointer;
            transition: background 0.2s, box-shadow 0.2s, transform 0.1s;
        }
        .chat-home__send:hover:not(:disabled) {
            background: linear-gradient(135deg, var(--accent-cyan-border), var(--accent-cyan-dim));
            box-shadow: 0 0 20px var(--accent-cyan-dim);
        }
        .chat-home__send:active:not(:disabled) {
            transform: scale(0.97);
        }
        .chat-home__send:disabled {
            opacity: 0.3;
            cursor: not-allowed;
        }
        .chat-home__send-arrow {
            font-size: 1rem;
            line-height: 1;
            transition: transform 0.15s;
        }
        .chat-home__send:hover:not(:disabled) .chat-home__send-arrow {
            transform: translateX(2px);
        }
        .chat-home__send-spinner {
            width: 12px;
            height: 12px;
            border: 2px solid var(--accent-cyan-mid);
            border-top-color: var(--accent-cyan);
            border-radius: 50%;
            animation: spin 0.6s linear infinite;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        /* Quick-start templates */
        .chat-home__templates {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0.6rem;
            margin-top: 1.5rem;
            width: 100%;
        }
        @media (min-width: 580px) {
            .chat-home__templates {
                grid-template-columns: repeat(3, 1fr);
            }
        }
        .chat-home__template {
            display: flex;
            align-items: flex-start;
            gap: 0.6rem;
            padding: 0.85rem var(--space-4);
            border: 1px solid rgba(255, 255, 255, 0.06);
            border-radius: var(--radius-lg);
            background: rgba(15, 16, 24, 0.5);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            color: var(--text-secondary);
            font-family: inherit;
            font-size: 0.85rem;
            cursor: pointer;
            transition: border-color 0.2s, background 0.2s, transform 0.15s;
            text-align: left;
        }
        .chat-home__template:hover {
            border-color: var(--accent-cyan-glow);
            background: var(--accent-cyan-subtle);
            transform: translateY(-1px);
        }
        .chat-home__template-icon {
            font-size: 1.25rem;
            line-height: 1;
            flex-shrink: 0;
            margin-top: 0.1rem;
        }
        .chat-home__template-text {
            display: flex;
            flex-direction: column;
            gap: 0.15rem;
        }
        .chat-home__template-label {
            font-weight: 600;
            color: var(--text-primary);
            font-size: 0.9rem;
        }
        .chat-home__template-desc {
            color: var(--text-tertiary);
            font-size: 0.8rem;
            line-height: 1.3;
        }

        /* Recent conversations */
        .chat-home__recent {
            width: 100%;
            margin-top: 2.5rem;
        }
        .chat-home__recent-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 0.75rem;
        }
        .chat-home__recent-title {
            font-size: 0.85rem;
            font-weight: 600;
            color: var(--text-tertiary);
            text-transform: uppercase;
            letter-spacing: 0.06em;
            margin: 0;
        }
        .chat-home__recent-all {
            font-size: 0.82rem;
            color: var(--text-tertiary);
            background: none;
            border: none;
            cursor: pointer;
            font-family: inherit;
            padding: 0.2rem 0.4rem;
            border-radius: var(--radius);
            transition: color 0.15s;
        }
        .chat-home__recent-all:hover {
            color: var(--accent-cyan);
        }
        .chat-home__recent-list {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }
        .chat-home__recent-item {
            display: flex;
            align-items: center;
            gap: 0.6rem;
            padding: 0.6rem var(--space-3);
            border: none;
            border-radius: var(--radius);
            background: transparent;
            color: var(--text-primary);
            font-family: inherit;
            font-size: 0.9rem;
            cursor: pointer;
            transition: background 0.15s;
            text-align: left;
            width: 100%;
        }
        .chat-home__recent-item:hover {
            background: rgba(255, 255, 255, 0.04);
        }
        .chat-home__recent-status {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            flex-shrink: 0;
            background: var(--text-tertiary);
        }
        .chat-home__recent-status--running {
            background: var(--accent-cyan);
            box-shadow: 0 0 6px var(--accent-cyan-glow);
            animation: pulse 2s ease-in-out infinite;
        }
        .chat-home__recent-status--error {
            background: var(--accent-red);
        }
        .chat-home__recent-status--stopped {
            background: var(--text-tertiary);
        }
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
        }
        .chat-home__recent-name {
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .chat-home__recent-meta {
            font-size: 0.8rem;
            color: var(--text-tertiary);
            flex-shrink: 0;
        }

        @media (max-width: 480px) {
            .chat-home__scroll { padding: var(--space-8) var(--space-4); }
            .chat-home__title { font-size: 1.5rem; }
            .chat-home__logo-mark { width: 44px; height: 44px; font-size: 1.2rem; }
            .chat-home__actions { flex-direction: column; align-items: stretch; }
            .chat-home__pickers { flex-wrap: wrap; }
            .chat-home__agent-picker { justify-content: space-between; }
            .chat-home__bg-glow { width: 300px; height: 300px; }
            .chat-home__templates { grid-template-columns: 1fr; }
            .chat-home__shortcut-hint { display: none; }
        }
    `,
})
export class ChatHomeComponent implements OnInit, AfterViewInit {
    private readonly router = inject(Router);
    private readonly agentService = inject(AgentService);
    private readonly projectService = inject(ProjectService);
    private readonly sessionService = inject(SessionService);
    private readonly notify = inject(NotificationService);
    private readonly chatTabs = inject(ChatTabsService);

    @ViewChild('promptInput') private promptInput?: ElementRef<HTMLTextAreaElement>;

    protected readonly onboardingSkipped = signal(false);
    protected readonly showOnboarding = computed(
        () => this.agentService.agents().length === 0 && !this.onboardingSkipped(),
    );

    readonly agents = signal<Agent[]>([]);
    readonly projects = this.projectService.projects;
    readonly prompt = signal('');
    readonly selectedAgentId = signal('');
    readonly selectedProjectId = signal('');
    readonly launching = signal(false);
    readonly recentSessions = signal<Session[]>([]);

    readonly templates = [
        {
            icon: '\u{1F50D}',
            label: 'Review a PR',
            desc: 'Analyze code changes and suggest improvements',
            prompt: 'Review my latest PR and suggest improvements',
        },
        {
            icon: '\u{1F527}',
            label: 'Fix tests',
            desc: 'Debug and fix failing test suites',
            prompt: 'Fix the failing tests',
        },
        {
            icon: '\u{1F4DA}',
            label: 'Explain code',
            desc: 'Walk through how a module works',
            prompt: 'Explain this codebase',
        },
        {
            icon: '\u{2728}',
            label: 'Build a feature',
            desc: 'Implement something new end-to-end',
            prompt: 'Build a new feature',
        },
        {
            icon: '\u{1F6E1}',
            label: 'Security audit',
            desc: 'Scan for vulnerabilities and bad patterns',
            prompt: 'Run a security audit on this codebase and flag any issues',
        },
        {
            icon: '\u{1F4CA}',
            label: 'Refactor',
            desc: 'Clean up code and improve structure',
            prompt: 'Identify areas that need refactoring and improve them',
        },
    ];

    async ngOnInit(): Promise<void> {
        await Promise.all([
            this.agentService.loadAgents(),
            this.projectService.loadProjects(),
            this.loadRecentSessions(),
        ]);
        this.agents.set(this.agentService.agents());
    }

    ngAfterViewInit(): void {
        setTimeout(() => this.promptInput?.nativeElement.focus());
    }

    onPromptInput(event: Event): void {
        const el = event.target as HTMLTextAreaElement;
        this.prompt.set(el.value);
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 200) + 'px';
    }

    onAgentChange(event: Event): void {
        this.selectedAgentId.set((event.target as HTMLSelectElement).value);
    }

    onProjectChange(event: Event): void {
        this.selectedProjectId.set((event.target as HTMLSelectElement).value);
    }

    onKeydown(event: KeyboardEvent): void {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.onSend();
        }
    }

    useHint(prompt: string): void {
        this.prompt.set(prompt);
        this.promptInput?.nativeElement.focus();
    }

    openSession(session: Session): void {
        this.chatTabs.openTab(
            session.id,
            (session.name || session.initialPrompt || 'Untitled').slice(0, 40),
            session.status,
        );
        this.router.navigate(['/sessions', session.id]);
    }

    viewAllSessions(): void {
        this.router.navigate(['/sessions']);
    }

    formatTime(dateStr: string): string {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMin = Math.floor(diffMs / 60_000);

        if (diffMin < 1) return 'just now';
        if (diffMin < 60) return `${diffMin}m ago`;

        const diffHr = Math.floor(diffMin / 60);
        if (diffHr < 24) return `${diffHr}h ago`;

        const diffDay = Math.floor(diffHr / 24);
        if (diffDay < 7) return `${diffDay}d ago`;

        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }

    async onSend(): Promise<void> {
        const text = this.prompt().trim();
        if (!text || this.launching()) return;

        this.launching.set(true);

        try {
            // Use selected project, or reuse/create the shared Sandbox project
            let projectId = this.selectedProjectId() || undefined;
            if (!projectId) {
                // Look for an existing Sandbox project first
                const existing = this.projects().find(
                    (p) => p.name.toLowerCase() === 'sandbox',
                );
                if (existing) {
                    projectId = existing.id;
                } else {
                    const project = await this.projectService.createProject({
                        name: 'Sandbox',
                        description: 'Temporary sandbox workspace',
                        workingDir: '/tmp/corvid-sandbox',
                    });
                    projectId = project.id;
                }
            }

            const session = await this.sessionService.createSession({
                projectId,
                agentId: this.selectedAgentId() || undefined,
                initialPrompt: text,
                name: text.slice(0, 60),
            });

            this.chatTabs.openTab(session.id, text.slice(0, 40), 'running');
            this.router.navigate(['/sessions', session.id]);
        } catch (e) {
            this.notify.error('Failed to start session', String(e));
        } finally {
            this.launching.set(false);
        }
    }

    private async loadRecentSessions(): Promise<void> {
        try {
            await this.sessionService.loadSessions();
            const sessions = this.sessionService.sessions();
            // Show 5 most recent sessions
            this.recentSessions.set(sessions.slice(0, 5));
        } catch {
            // Non-critical — silently ignore if sessions can't load
        }
    }
}
