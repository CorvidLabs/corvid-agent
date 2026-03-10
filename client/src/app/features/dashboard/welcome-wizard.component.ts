import { Component, ChangeDetectionStrategy, inject, signal, OnInit, output } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AgentService } from '../../core/services/agent.service';
import { ProjectService } from '../../core/services/project.service';
import { SessionService } from '../../core/services/session.service';
import { ApiService } from '../../core/services/api.service';
import type { ProviderInfo } from '../../core/models/agent.model';
import { firstValueFrom } from 'rxjs';

interface HealthStatus {
    database: boolean;
    github: boolean;
    algorand: boolean;
    llm: boolean;
    apiKey: boolean;
}

@Component({
    selector: 'app-welcome-wizard',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ReactiveFormsModule],
    template: `
        <div class="wizard" role="region" aria-label="Welcome wizard">
            <div class="wizard__header">
                <pre class="wizard__logo" aria-hidden="true">
 ██████╗ ██████╗ ██████╗ ██╗   ██╗██╗██████╗
██╔════╝██╔═══██╗██╔══██╗██║   ██║██║██╔══██╗
██║     ██║   ██║██████╔╝██║   ██║██║██║  ██║
██║     ██║   ██║██╔══██╗╚██╗ ██╔╝██║██║  ██║
╚██████╗╚██████╔╝██║  ██║ ╚████╔╝ ██║██████╔╝
 ╚═════╝ ╚═════╝ ╚═╝  ╚═╝  ╚═══╝  ╚═╝╚═════╝</pre>
                <h1 class="wizard__title">Welcome to Corvid Agent</h1>
                <p class="wizard__subtitle">AI agents that do real software engineering work</p>
            </div>

            <!-- Step indicator for screen readers -->
            <div class="wizard__progress" role="status" aria-live="polite">
                <span class="sr-only">Step {{ step() === 'status' ? '1 of 3: System Status' : step() === 'create' ? '2 of 3: Create Agent' : '3 of 3: Complete' }}</span>
                <ol class="wizard__steps" aria-label="Wizard progress">
                    <li [class.wizard__step-dot--active]="step() === 'status'" [attr.aria-current]="step() === 'status' ? 'step' : null">
                        <span class="sr-only">System Status</span>
                    </li>
                    <li [class.wizard__step-dot--active]="step() === 'create'" [attr.aria-current]="step() === 'create' ? 'step' : null">
                        <span class="sr-only">Create Agent</span>
                    </li>
                    <li [class.wizard__step-dot--active]="step() === 'done'" [attr.aria-current]="step() === 'done' ? 'step' : null">
                        <span class="sr-only">Complete</span>
                    </li>
                </ol>
            </div>

            @switch (step()) {
                @case ('status') {
                    <div class="wizard__step">
                        <h2 class="step__title">System Status</h2>
                        <p class="step__desc">Checking your environment...</p>

                        <div class="status-grid" role="list" aria-label="System health checks">
                            <div class="status-check" [attr.data-ok]="health()?.apiKey" role="listitem"
                                 [attr.aria-label]="'API Key: ' + (health()?.apiKey ? 'Configured' : 'Missing')">
                                <span class="status-check__icon" aria-hidden="true">{{ health()?.apiKey ? '>' : '!' }}</span>
                                <span class="status-check__label">API Key</span>
                                <span class="status-check__value">{{ health()?.apiKey ? 'Configured' : 'Missing' }}</span>
                            </div>
                            <div class="status-check" [attr.data-ok]="health()?.llm" role="listitem"
                                 [attr.aria-label]="'LLM Provider: ' + (health()?.llm ? 'Available' : 'Unavailable')">
                                <span class="status-check__icon" aria-hidden="true">{{ health()?.llm ? '>' : '!' }}</span>
                                <span class="status-check__label">LLM Provider</span>
                                <span class="status-check__value">{{ health()?.llm ? 'Available' : 'Unavailable' }}</span>
                            </div>
                            <div class="status-check" [attr.data-ok]="health()?.github" role="listitem"
                                 [attr.aria-label]="'GitHub: ' + (health()?.github ? 'Connected' : 'Optional')">
                                <span class="status-check__icon" aria-hidden="true">{{ health()?.github ? '>' : '~' }}</span>
                                <span class="status-check__label">GitHub</span>
                                <span class="status-check__value">{{ health()?.github ? 'Connected' : 'Optional' }}</span>
                            </div>
                            <div class="status-check" [attr.data-ok]="health()?.algorand" role="listitem"
                                 [attr.aria-label]="'AlgoChat: ' + (health()?.algorand ? 'Connected' : 'Optional')">
                                <span class="status-check__icon" aria-hidden="true">{{ health()?.algorand ? '>' : '~' }}</span>
                                <span class="status-check__label">AlgoChat</span>
                                <span class="status-check__value">{{ health()?.algorand ? 'Connected' : 'Optional' }}</span>
                            </div>
                        </div>

                        @if (health()?.apiKey || health()?.llm) {
                            <button class="wizard__btn wizard__btn--primary" (click)="step.set('create')">
                                Create Your First Agent
                            </button>
                        } @else {
                            <div class="wizard__warning" role="alert">
                                <p>Set <code>ANTHROPIC_API_KEY</code> in your <code>.env</code> file or install Claude Code CLI to get started.</p>
                            </div>
                            <button class="wizard__btn" (click)="step.set('create')">
                                Continue Anyway
                            </button>
                        }
                    </div>
                }

                @case ('create') {
                    <div class="wizard__step">
                        <h2 class="step__title">Create Your First Agent</h2>
                        <p class="step__desc">Give your agent a name and choose a model.</p>

                        <form [formGroup]="form" (ngSubmit)="onCreateAgent()" class="wizard__form" aria-label="Create agent form">
                            <div class="field">
                                <label for="wiz-name" class="field__label">Agent Name</label>
                                <input id="wiz-name" formControlName="name" class="field__input"
                                       placeholder="e.g. Corvid, Scout, Builder" autocomplete="off"
                                       [attr.aria-invalid]="form.controls.name.invalid && form.controls.name.touched"
                                       aria-required="true" />
                                @if (form.controls.name.invalid && form.controls.name.touched) {
                                    <span class="field__error" role="alert" id="wiz-name-error">Agent name is required</span>
                                }
                            </div>

                            <div class="field">
                                <label for="wiz-provider" class="field__label">Provider</label>
                                <select id="wiz-provider" formControlName="provider" class="field__input"
                                        (change)="onProviderChange()">
                                    @for (p of providers(); track p.type) {
                                        <option [value]="p.type">{{ p.name }}</option>
                                    }
                                </select>
                            </div>

                            <div class="field">
                                <label for="wiz-model" class="field__label">Model</label>
                                <select id="wiz-model" formControlName="model" class="field__input">
                                    @for (m of availableModels(); track m) {
                                        <option [value]="m">{{ m }}</option>
                                    }
                                </select>
                            </div>

                            <div class="field">
                                <label for="wiz-project" class="field__label">Project</label>
                                <select id="wiz-project" formControlName="defaultProjectId" class="field__input">
                                    <option [value]="null">None</option>
                                    @for (p of projectService.projects(); track p.id) {
                                        <option [value]="p.id">{{ p.name }}</option>
                                    }
                                </select>
                            </div>

                            <div class="wizard__actions">
                                <button type="button" class="wizard__btn" (click)="step.set('status')">Back</button>
                                <button type="submit" class="wizard__btn wizard__btn--primary"
                                        [disabled]="form.invalid || creating()"
                                        [attr.aria-busy]="creating()">
                                    {{ creating() ? 'Creating...' : 'Create Agent' }}
                                </button>
                            </div>
                        </form>
                    </div>
                }

                @case ('done') {
                    <div class="wizard__step wizard__step--done">
                        <div class="done__icon" aria-hidden="true">&check;</div>
                        <h2 class="step__title">Agent Created</h2>
                        <p class="step__desc" role="status">{{ createdAgentName() }} is ready to go.</p>

                        <div class="done__actions">
                            <button class="wizard__btn wizard__btn--primary" (click)="startSession()">
                                Start a Conversation
                            </button>
                            <button class="wizard__btn" (click)="goToDashboard()">
                                Go to Dashboard
                            </button>
                        </div>
                    </div>
                }
            }

            <p class="wizard__footer">
                <a href="https://github.com/CorvidLabs/corvid-agent" target="_blank" rel="noopener noreferrer">Docs<span class="sr-only"> (opens in a new tab)</span></a>
                &middot; Built on Algorand
            </p>
        </div>
    `,
    styles: `
        .wizard {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100%;
            padding: 2rem 1.5rem;
            text-align: center;
        }

        .wizard__header { margin-bottom: 2rem; }
        .wizard__logo {
            font-size: 0.35rem;
            line-height: 1.1;
            color: var(--accent-cyan);
            margin: 0 0 1rem;
            text-shadow: 0 0 8px rgba(0, 229, 255, 0.3);
            overflow-x: auto;
        }
        .wizard__title {
            margin: 0;
            font-size: 1.4rem;
            color: var(--text-primary);
        }
        .wizard__subtitle {
            margin: 0.35rem 0 0;
            font-size: 0.85rem;
            color: var(--text-tertiary);
        }

        .wizard__step {
            width: 100%;
            max-width: 480px;
            background: var(--bg-surface);
            border: 1px solid var(--border);
            border-radius: var(--radius-lg);
            padding: 1.5rem;
        }
        .wizard__step--done { text-align: center; }

        .step__title {
            margin: 0 0 0.25rem;
            font-size: 1rem;
            color: var(--text-primary);
        }
        .step__desc {
            margin: 0 0 1.25rem;
            font-size: 0.8rem;
            color: var(--text-tertiary);
        }

        /* Status Checks */
        .status-grid {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
            margin-bottom: 1.25rem;
        }
        .status-check {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 0.5rem 0.75rem;
            background: var(--bg-raised);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            text-align: left;
        }
        .status-check__icon {
            width: 22px;
            height: 22px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.7rem;
            font-weight: 700;
            border-radius: 50%;
            flex-shrink: 0;
            border: 1px solid;
        }
        .status-check[data-ok="true"] .status-check__icon {
            color: var(--accent-green);
            border-color: var(--accent-green);
        }
        .status-check[data-ok="false"] .status-check__icon {
            color: var(--accent-amber, #ffc107);
            border-color: var(--accent-amber, #ffc107);
        }
        .status-check__label {
            flex: 1;
            font-size: 0.8rem;
            font-weight: 600;
            color: var(--text-primary);
        }
        .status-check__value {
            font-size: 0.75rem;
            font-weight: 600;
        }
        .status-check[data-ok="true"] .status-check__value { color: var(--accent-green); }
        .status-check[data-ok="false"] .status-check__value { color: var(--text-tertiary); }

        /* Warning */
        .wizard__warning {
            background: rgba(255, 193, 7, 0.08);
            border: 1px solid rgba(255, 193, 7, 0.3);
            border-radius: var(--radius);
            padding: 0.75rem;
            margin-bottom: 1rem;
        }
        .wizard__warning p {
            margin: 0;
            font-size: 0.8rem;
            color: var(--accent-amber, #ffc107);
            text-align: left;
        }
        .wizard__warning code {
            background: var(--bg-raised);
            padding: 0.1rem 0.35rem;
            border-radius: 3px;
            font-size: 0.75rem;
        }

        /* Form */
        .wizard__form {
            display: flex;
            flex-direction: column;
            gap: 1rem;
            text-align: left;
        }
        .field { display: flex; flex-direction: column; gap: 0.25rem; }
        .field__label {
            font-size: 0.7rem;
            font-weight: 600;
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.06em;
        }
        .field__input {
            padding: 0.5rem 0.75rem;
            border: 1px solid var(--border-bright);
            border-radius: var(--radius);
            font-size: 0.85rem;
            font-family: inherit;
            background: var(--bg-input);
            color: var(--text-primary);
        }
        .field__input:focus-visible {
            outline: 2px solid var(--accent-cyan);
            outline-offset: 2px;
            border-color: var(--accent-cyan);
            box-shadow: var(--glow-cyan);
        }
        .field__error {
            font-size: 0.7rem;
            color: var(--accent-red, #ff3355);
            margin-top: 0.15rem;
        }

        /* Buttons */
        .wizard__actions {
            display: flex;
            gap: 0.75rem;
            justify-content: flex-end;
            margin-top: 0.25rem;
        }
        .wizard__btn {
            padding: 0.55rem 1.2rem;
            border-radius: var(--radius);
            font-size: 0.8rem;
            font-weight: 600;
            font-family: inherit;
            cursor: pointer;
            border: 1px solid var(--border-bright);
            background: transparent;
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.05em;
            transition: background 0.15s, border-color 0.15s;
        }
        .wizard__btn:hover { background: var(--bg-hover); }
        .wizard__btn--primary {
            border-color: var(--accent-cyan);
            color: var(--accent-cyan);
            background: rgba(0, 229, 255, 0.06);
        }
        .wizard__btn--primary:hover:not(:disabled) {
            background: rgba(0, 229, 255, 0.14);
            box-shadow: var(--glow-cyan);
        }
        .wizard__btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .wizard__btn:focus-visible {
            outline: 2px solid var(--accent-cyan);
            outline-offset: 2px;
        }

        /* Done */
        .done__icon {
            width: 48px;
            height: 48px;
            margin: 0 auto 1rem;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.4rem;
            font-weight: 700;
            border-radius: 50%;
            color: var(--accent-green);
            border: 2px solid var(--accent-green);
            background: rgba(0, 255, 136, 0.08);
        }
        .done__actions {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
            margin-top: 1.25rem;
        }

        /* Step progress dots */
        .wizard__progress { margin-bottom: 1.25rem; }
        .wizard__steps {
            display: flex; justify-content: center; gap: 0.5rem;
            list-style: none; margin: 0; padding: 0;
        }
        .wizard__steps li {
            width: 8px; height: 8px; border-radius: 50%;
            background: var(--border-bright);
            transition: background 0.15s;
        }
        .wizard__steps li.wizard__step-dot--active {
            background: var(--accent-cyan);
        }
        .sr-only {
            position: absolute; width: 1px; height: 1px; padding: 0;
            margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0);
            white-space: nowrap; border: 0;
        }

        /* Footer */
        .wizard__footer {
            margin-top: 2rem;
            font-size: 0.7rem;
            color: var(--text-tertiary);
        }
        .wizard__footer a {
            color: var(--accent-cyan);
            text-decoration: none;
        }
        .wizard__footer a:hover { text-decoration: underline; }

        @media (max-width: 768px) {
            .wizard { padding: 1rem; }
            .wizard__logo { font-size: 0.25rem; }
            .wizard__step { padding: 1rem; }
        }
    `,
})
export class WelcomeWizardComponent implements OnInit {
    private readonly fb = inject(FormBuilder);
    private readonly router = inject(Router);
    private readonly agentService = inject(AgentService);
    protected readonly projectService = inject(ProjectService);
    private readonly sessionService = inject(SessionService);
    private readonly apiService = inject(ApiService);

    readonly agentCreated = output<void>();

    protected readonly step = signal<'status' | 'create' | 'done'>('status');
    protected readonly health = signal<HealthStatus | null>(null);
    protected readonly providers = signal<ProviderInfo[]>([]);
    protected readonly availableModels = signal<string[]>([]);
    protected readonly creating = signal(false);
    protected readonly createdAgentName = signal('');
    private createdAgentId = '';

    protected readonly form = this.fb.nonNullable.group({
        name: ['', Validators.required],
        provider: [''],
        model: [''],
        defaultProjectId: [null as string | null],
    });

    async ngOnInit(): Promise<void> {
        await Promise.all([
            this.loadHealth(),
            this.loadProviders(),
            this.projectService.loadProjects(),
        ]);
    }

    private async loadHealth(): Promise<void> {
        try {
            const data = await firstValueFrom(
                this.apiService.get<{
                    dependencies: Record<string, { status: string }>;
                }>('/health'),
            );
            const deps = data.dependencies;
            this.health.set({
                database: deps['database']?.status === 'healthy',
                github: deps['github']?.status === 'healthy',
                algorand: deps['algorand']?.status === 'healthy',
                llm: deps['llm']?.status === 'healthy',
                apiKey: deps['apiKey']?.status === 'healthy',
            });
        } catch {
            this.health.set({ database: false, github: false, algorand: false, llm: false, apiKey: false });
        }
    }

    private async loadProviders(): Promise<void> {
        try {
            const data = await firstValueFrom(
                this.apiService.get<ProviderInfo[]>('/providers'),
            );
            this.providers.set(data);
            if (data.length > 0) {
                this.form.patchValue({ provider: data[0].type, model: data[0].defaultModel });
                this.availableModels.set(data[0].models);
            }
        } catch {
            // Providers may not be available yet
        }
    }

    protected onProviderChange(): void {
        const selected = this.providers().find((p) => p.type === this.form.value.provider);
        if (selected) {
            this.availableModels.set(selected.models);
            this.form.patchValue({ model: selected.defaultModel });
        }
    }

    protected async onCreateAgent(): Promise<void> {
        if (this.form.invalid) return;
        this.creating.set(true);

        try {
            const value = this.form.getRawValue();
            const agent = await this.agentService.createAgent({
                name: value.name,
                provider: value.provider || undefined,
                model: value.model || undefined,
                defaultProjectId: value.defaultProjectId || undefined,
            });
            this.createdAgentId = agent.id;
            this.createdAgentName.set(agent.name);
            this.agentCreated.emit();
            this.step.set('done');
        } finally {
            this.creating.set(false);
        }
    }

    protected startSession(): void {
        this.router.navigate(['/sessions/new'], {
            queryParams: { agentId: this.createdAgentId },
        });
    }

    protected goToDashboard(): void {
        this.agentCreated.emit();
    }
}
