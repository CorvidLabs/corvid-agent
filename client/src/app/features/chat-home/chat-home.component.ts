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
            <div class="chat-home__bg-glow" aria-hidden="true"></div>
            <div class="chat-home__center">
                <div class="chat-home__logo-mark" aria-hidden="true">C</div>
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

                <div class="chat-home__hints">
                    @for (hint of hints; track hint) {
                        <button class="chat-home__hint" (click)="useHint(hint)">
                            <span class="chat-home__hint-icon">&rsaquo;</span>
                            {{ hint }}
                        </button>
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
            background: radial-gradient(
                circle,
                rgba(0, 229, 255, 0.06) 0%,
                rgba(255, 0, 170, 0.03) 40%,
                transparent 70%
            );
            pointer-events: none;
            animation: subtlePulse 8s ease-in-out infinite;
        }
        .chat-home__center {
            width: 100%;
            max-width: 640px;
            display: flex;
            flex-direction: column;
            align-items: center;
            position: relative;
            z-index: 1;
        }
        .chat-home__logo-mark {
            width: 56px;
            height: 56px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: var(--radius-xl, 16px);
            background: linear-gradient(135deg, rgba(0, 229, 255, 0.12), rgba(255, 0, 170, 0.08));
            border: 1px solid rgba(0, 229, 255, 0.2);
            font-size: 1.5rem;
            font-weight: 800;
            color: var(--accent-cyan);
            text-shadow: 0 0 16px rgba(0, 229, 255, 0.5);
            margin-bottom: 1rem;
            box-shadow: 0 4px 24px rgba(0, 229, 255, 0.1);
        }
        .chat-home__title {
            font-size: 2rem;
            font-weight: 700;
            margin: 0 0 0.4rem;
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
            font-size: 0.9rem;
            margin: 0 0 2rem;
        }
        .chat-home__input-card {
            width: 100%;
            background: rgba(15, 16, 24, 0.7);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.06));
            border-radius: var(--radius-xl, 16px);
            overflow: hidden;
            transition: border-color 0.25s, box-shadow 0.25s;
            box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
        }
        .chat-home__input-card:focus-within {
            border-color: rgba(0, 229, 255, 0.4);
            box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(0, 229, 255, 0.15), 0 0 30px rgba(0, 229, 255, 0.06);
        }
        .chat-home__textarea {
            width: 100%;
            padding: 1.25rem 1.25rem 0.5rem;
            border: none;
            background: transparent;
            color: var(--text-primary);
            font-family: inherit;
            font-size: 0.9rem;
            line-height: 1.6;
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
            padding: 0.5rem 1.25rem 0.85rem;
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
            padding: 0.35rem 0.6rem;
            border: 1px solid var(--border);
            border-radius: var(--radius, 6px);
            background: var(--bg-input, var(--bg-deep));
            color: var(--text-primary);
            font-family: inherit;
            font-size: 0.8rem;
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
            padding: 0.5rem 1.4rem;
            border: none;
            border-radius: var(--radius-lg, 10px);
            background: linear-gradient(135deg, rgba(0, 229, 255, 0.15), rgba(0, 229, 255, 0.08));
            color: var(--accent-cyan);
            font-family: inherit;
            font-size: 0.8rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            cursor: pointer;
            transition: background 0.2s, box-shadow 0.2s, transform 0.1s;
        }
        .chat-home__send:hover:not(:disabled) {
            background: linear-gradient(135deg, rgba(0, 229, 255, 0.25), rgba(0, 229, 255, 0.12));
            box-shadow: 0 0 20px rgba(0, 229, 255, 0.15);
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
            border: 2px solid rgba(0, 229, 255, 0.2);
            border-top-color: var(--accent-cyan);
            border-radius: 50%;
            animation: spin 0.6s linear infinite;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        .chat-home__hints {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
            margin-top: 1.5rem;
            justify-content: center;
        }
        .chat-home__hint {
            display: flex;
            align-items: center;
            gap: 0.3rem;
            padding: 0.45rem 0.85rem;
            border: 1px solid rgba(255, 255, 255, 0.06);
            border-radius: 999px;
            background: rgba(15, 16, 24, 0.5);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            color: var(--text-secondary);
            font-family: inherit;
            font-size: 0.75rem;
            cursor: pointer;
            transition: border-color 0.2s, color 0.2s, background 0.2s, transform 0.15s;
        }
        .chat-home__hint:hover {
            border-color: rgba(0, 229, 255, 0.3);
            color: var(--accent-cyan);
            background: rgba(0, 229, 255, 0.05);
            transform: translateY(-1px);
        }
        .chat-home__hint-icon {
            font-size: 0.9rem;
            line-height: 1;
            color: var(--text-tertiary);
            transition: color 0.2s;
        }
        .chat-home__hint:hover .chat-home__hint-icon {
            color: var(--accent-cyan);
        }
        @media (max-width: 480px) {
            .chat-home { padding: 1rem; }
            .chat-home__title { font-size: 1.5rem; }
            .chat-home__logo-mark { width: 44px; height: 44px; font-size: 1.2rem; }
            .chat-home__actions { flex-direction: column; align-items: stretch; }
            .chat-home__agent-picker { justify-content: space-between; }
            .chat-home__bg-glow { width: 300px; height: 300px; }
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
