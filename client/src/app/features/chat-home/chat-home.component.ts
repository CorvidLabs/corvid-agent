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
            <div class="chat-home__center">
                <h1 class="chat-home__title">CorvidAgent</h1>
                <p class="chat-home__subtitle">What would you like to work on?</p>

                <div class="chat-home__input-card">
                    <textarea
                        class="chat-home__textarea"
                        #promptInput
                        [value]="prompt()"
                        (input)="onPromptInput($event)"
                        (keydown)="onKeydown($event)"
                        placeholder="Ask anything..."
                        rows="3"
                        [disabled]="launching()"
                        aria-label="Chat prompt"
                    ></textarea>
                    <div class="chat-home__actions">
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
                        <button
                            class="chat-home__send"
                            [disabled]="!prompt().trim() || launching()"
                            (click)="onSend()"
                        >
                            {{ launching() ? 'Starting...' : 'Send' }}
                        </button>
                    </div>
                </div>

                <div class="chat-home__hints">
                    @for (hint of hints; track hint) {
                        <button class="chat-home__hint" (click)="useHint(hint)">{{ hint }}</button>
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
            align-items: center;
            justify-content: center;
            padding: 2rem;
            background: var(--bg-deep);
        }
        .chat-home__center {
            width: 100%;
            max-width: 640px;
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        .chat-home__title {
            font-size: 1.75rem;
            font-weight: 700;
            color: var(--text-primary);
            margin: 0 0 0.5rem;
            letter-spacing: 0.02em;
        }
        .chat-home__subtitle {
            color: var(--text-secondary);
            font-size: 0.9rem;
            margin: 0 0 1.5rem;
        }
        .chat-home__input-card {
            width: 100%;
            background: var(--bg-surface);
            border: 1px solid var(--border);
            border-radius: var(--radius-lg, 12px);
            overflow: hidden;
            transition: border-color 0.15s;
        }
        .chat-home__input-card:focus-within {
            border-color: var(--accent-cyan);
            box-shadow: 0 0 0 1px var(--accent-cyan), var(--glow-cyan);
        }
        .chat-home__textarea {
            width: 100%;
            padding: 1rem 1rem 0.5rem;
            border: none;
            background: transparent;
            color: var(--text-primary);
            font-family: inherit;
            font-size: 0.9rem;
            line-height: 1.5;
            resize: none;
            outline: none;
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
            padding: 0.5rem 1rem 0.75rem;
            gap: 0.75rem;
        }
        .chat-home__agent-picker {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        .chat-home__picker-label {
            font-size: 0.7rem;
            font-weight: 600;
            color: var(--text-tertiary);
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        .chat-home__select {
            padding: 0.3rem 0.5rem;
            border: 1px solid var(--border);
            border-radius: var(--radius, 6px);
            background: var(--bg-input, var(--bg-deep));
            color: var(--text-primary);
            font-family: inherit;
            font-size: 0.8rem;
            cursor: pointer;
        }
        .chat-home__select:focus {
            outline: none;
            border-color: var(--accent-cyan);
        }
        .chat-home__send {
            padding: 0.45rem 1.25rem;
            border: 1px solid var(--accent-cyan);
            border-radius: var(--radius, 6px);
            background: transparent;
            color: var(--accent-cyan);
            font-family: inherit;
            font-size: 0.8rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            cursor: pointer;
            transition: background 0.15s, box-shadow 0.15s;
        }
        .chat-home__send:hover:not(:disabled) {
            background: var(--accent-cyan-dim);
            box-shadow: var(--glow-cyan);
        }
        .chat-home__send:disabled {
            opacity: 0.3;
            cursor: not-allowed;
        }
        .chat-home__hints {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
            margin-top: 1.25rem;
            justify-content: center;
        }
        .chat-home__hint {
            padding: 0.4rem 0.75rem;
            border: 1px solid var(--border);
            border-radius: 999px;
            background: transparent;
            color: var(--text-secondary);
            font-family: inherit;
            font-size: 0.75rem;
            cursor: pointer;
            transition: border-color 0.15s, color 0.15s;
        }
        .chat-home__hint:hover {
            border-color: var(--accent-cyan);
            color: var(--accent-cyan);
        }
        @media (max-width: 480px) {
            .chat-home { padding: 1rem; }
            .chat-home__title { font-size: 1.25rem; }
            .chat-home__actions { flex-direction: column; align-items: stretch; }
            .chat-home__agent-picker { justify-content: space-between; }
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
    readonly prompt = signal('');
    readonly selectedAgentId = signal('');
    readonly launching = signal(false);

    readonly hints = [
        'Review my latest PR',
        'Fix the failing tests',
        'Explain this codebase',
        'Refactor for readability',
    ];

    async ngOnInit(): Promise<void> {
        await Promise.all([
            this.agentService.loadAgents(),
            this.projectService.loadProjects(),
        ]);
        this.agents.set(this.agentService.agents());
    }

    ngAfterViewInit(): void {
        setTimeout(() => this.promptInput?.nativeElement.focus());
    }

    onPromptInput(event: Event): void {
        this.prompt.set((event.target as HTMLTextAreaElement).value);
    }

    onAgentChange(event: Event): void {
        this.selectedAgentId.set((event.target as HTMLSelectElement).value);
    }

    onKeydown(event: KeyboardEvent): void {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.onSend();
        }
    }

    useHint(hint: string): void {
        this.prompt.set(hint);
        this.promptInput?.nativeElement.focus();
    }

    async onSend(): Promise<void> {
        const text = this.prompt().trim();
        if (!text || this.launching()) return;

        this.launching.set(true);

        try {
            // Ensure we have a project — use first available or create a default
            let projectId = this.projectService.projects()[0]?.id;
            if (!projectId) {
                const project = await this.projectService.createProject({
                    name: 'Default',
                    description: 'Auto-created project',
                    workingDir: '.',
                });
                projectId = project.id;
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
            this.launching.set(false);
        }
    }
}
