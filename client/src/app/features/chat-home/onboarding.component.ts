import {
    Component,
    ChangeDetectionStrategy,
    inject,
    signal,
    output,
    OnInit,
} from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { AgentService } from '../../core/services/agent.service';
import { ProjectService } from '../../core/services/project.service';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import type { ProviderInfo } from '../../core/models/agent.model';
import { firstValueFrom } from 'rxjs';

interface AgentTemplate {
    id: string;
    name: string;
    suggestedName: string;
    description: string;
    icon: string;
}

const TEMPLATES: AgentTemplate[] = [
    {
        id: 'full-stack',
        name: 'Full Stack Developer',
        suggestedName: 'Builder',
        description: 'Reads and edits code, manages PRs, creates work tasks. The all-rounder.',
        icon: '<>',
    },
    {
        id: 'code-reviewer',
        name: 'Code Reviewer',
        suggestedName: 'Reviewer',
        description: 'Reviews pull requests, catches bugs, and provides actionable feedback.',
        icon: 'PR',
    },
    {
        id: 'researcher',
        name: 'Researcher',
        suggestedName: 'Scout',
        description: 'Deep research, information gathering, and knowledge management.',
        icon: '??',
    },
    {
        id: 'assistant',
        name: 'General Assistant',
        suggestedName: 'Assistant',
        description: 'Research, writing, analysis, and automation. Your AI helper.',
        icon: 'AI',
    },
    {
        id: 'custom',
        name: 'Custom Agent',
        suggestedName: '',
        description: 'Start from scratch. Choose your own name, model, and tools.',
        icon: '++',
    },
];

@Component({
    selector: 'app-onboarding',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ReactiveFormsModule],
    template: `
        <div class="onboard">
            @if (step() === 'pick') {
                <div class="onboard__hero">
                    <h1 class="onboard__title">Create your first agent</h1>
                    <p class="onboard__sub">Pick a template to get started in 60 seconds. You can customize everything later.</p>
                </div>
                <div class="onboard__templates">
                    @for (tpl of templates; track tpl.id) {
                        <button
                            class="tpl-card"
                            (click)="pickTemplate(tpl)"
                            type="button">
                            <span class="tpl-card__icon">{{ tpl.icon }}</span>
                            <span class="tpl-card__name">{{ tpl.name }}</span>
                            <span class="tpl-card__desc">{{ tpl.description }}</span>
                        </button>
                    }
                </div>
                <button class="onboard__skip" (click)="skipOnboarding()" type="button">
                    Skip — I'll set things up manually
                </button>
            }

            @if (step() === 'customize') {
                <div class="onboard__hero">
                    <h1 class="onboard__title">Almost there</h1>
                    <p class="onboard__sub">Give your agent a name and pick a model.</p>
                </div>
                <form class="onboard__form" [formGroup]="form" (ngSubmit)="createAgent()">
                    <div class="field">
                        <label class="field__label" for="agent-name">Agent name</label>
                        <input
                            class="field__input"
                            id="agent-name"
                            formControlName="name"
                            placeholder="e.g. Builder, Scout, Helper"
                            autocomplete="off" />
                    </div>
                    <div class="field">
                        <label class="field__label" for="agent-model">Model</label>
                        <select
                            class="field__input"
                            id="agent-model"
                            formControlName="model">
                            @for (p of providers(); track p.name) {
                                @for (m of p.models; track m) {
                                    <option [value]="m">{{ p.name }}: {{ m }}</option>
                                }
                            }
                        </select>
                    </div>
                    <div class="onboard__form-actions">
                        <button class="btn btn--ghost" type="button" (click)="step.set('pick')">Back</button>
                        <button
                            class="btn btn--primary"
                            type="submit"
                            [disabled]="form.invalid || creating()">
                            {{ creating() ? 'Creating...' : 'Create Agent' }}
                        </button>
                    </div>
                </form>
            }

            @if (step() === 'done') {
                <div class="onboard__done">
                    <div class="onboard__done-icon">&#10003;</div>
                    <h1 class="onboard__title">{{ createdAgentName() }} is ready</h1>
                    <p class="onboard__sub">Start a conversation or explore the platform.</p>
                    <div class="onboard__done-actions">
                        <button class="btn btn--primary btn--large" (click)="done.emit()" type="button">
                            Start chatting
                        </button>
                    </div>
                </div>
            }
        </div>
    `,
    styles: `
        .onboard {
            max-width: 640px;
            margin: 0 auto;
            padding: var(--space-12) var(--space-6);
            text-align: center;
        }
        .onboard__hero { margin-bottom: 2rem; }
        .onboard__title {
            font-size: 1.4rem;
            font-weight: 700;
            color: var(--text-primary);
            margin: 0 0 0.5rem;
        }
        .onboard__sub {
            font-size: 0.82rem;
            color: var(--text-tertiary);
            margin: 0;
        }

        /* Templates */
        .onboard__templates {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
            gap: 0.75rem;
            margin-bottom: 1.5rem;
        }
        .tpl-card {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 0.5rem;
            padding: var(--space-5) var(--space-4);
            background: rgba(15, 16, 24, 0.6);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            border: 1px solid rgba(255, 255, 255, 0.05);
            border-radius: var(--radius-lg);
            color: var(--text-secondary);
            font-family: inherit;
            cursor: pointer;
            transition: border-color 0.25s, background 0.25s, box-shadow 0.25s, transform 0.2s;
            text-align: center;
            position: relative;
        }
        .tpl-card:hover {
            border-color: var(--accent-cyan-glow);
            background: var(--accent-cyan-subtle);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), 0 0 20px var(--accent-cyan-wash);
            transform: translateY(-2px);
        }
        .tpl-card__icon {
            width: 44px;
            height: 44px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, var(--accent-cyan-dim), var(--accent-magenta-subtle));
            border: 1px solid var(--accent-cyan-dim);
            border-radius: 12px;
            font-size: 0.7rem;
            font-weight: 800;
            color: var(--accent-cyan);
            letter-spacing: 0.05em;
            box-shadow: 0 2px 12px var(--accent-cyan-wash);
        }
        .tpl-card__name {
            font-size: 0.82rem;
            font-weight: 700;
            color: var(--text-primary);
        }
        .tpl-card__desc {
            font-size: var(--text-xxs);
            color: var(--text-tertiary);
            line-height: 1.4;
        }

        /* Skip */
        .onboard__skip {
            background: none;
            border: none;
            color: var(--text-tertiary);
            font-family: inherit;
            font-size: 0.7rem;
            cursor: pointer;
            text-decoration: underline;
            transition: color 0.15s;
        }
        .onboard__skip:hover { color: var(--text-secondary); }

        /* Form */
        .onboard__form {
            text-align: left;
            max-width: 400px;
            margin: 0 auto;
        }
        .field { margin-bottom: 1rem; }
        .field__label {
            display: block;
            margin-bottom: 0.35rem;
            font-size: 0.68rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: var(--text-tertiary);
        }
        .field__input {
            width: 100%;
            padding: 0.6rem var(--space-3);
            background: var(--bg-input);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            color: var(--text-primary);
            font-family: inherit;
            font-size: 0.82rem;
            box-sizing: border-box;
        }
        .field__input:focus {
            outline: none;
            border-color: var(--accent-cyan);
            box-shadow: 0 0 0 1px var(--accent-cyan-mid);
        }
        .onboard__form-actions {
            display: flex;
            gap: 0.75rem;
            justify-content: flex-end;
            margin-top: 1.5rem;
        }
        .btn {
            padding: var(--space-2) var(--space-5);
            border-radius: var(--radius);
            font-size: 0.78rem;
            font-weight: 600;
            cursor: pointer;
            border: 1px solid;
            font-family: inherit;
            transition: background 0.15s, box-shadow 0.15s;
        }
        .btn--primary {
            background: linear-gradient(135deg, var(--accent-cyan-dim), var(--accent-cyan-subtle));
            color: var(--accent-cyan);
            border-color: var(--accent-cyan-glow);
        }
        .btn--primary:hover:not(:disabled) {
            background: linear-gradient(135deg, var(--accent-cyan-mid), var(--accent-cyan-tint));
            box-shadow: 0 0 20px var(--accent-cyan-dim);
        }
        .btn--primary:disabled { opacity: 0.4; cursor: not-allowed; }
        .btn--ghost {
            background: transparent;
            color: var(--text-secondary);
            border-color: var(--border-bright);
        }
        .btn--ghost:hover { background: var(--bg-hover); }
        .btn--large {
            padding: var(--space-3) var(--space-8);
            font-size: 0.9rem;
        }

        /* Done */
        .onboard__done { padding: var(--space-8) 0; }
        .onboard__done-icon {
            width: 64px;
            height: 64px;
            margin: 0 auto 1.5rem;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--accent-cyan-dim);
            border: 2px solid var(--accent-cyan);
            border-radius: 50%;
            font-size: 1.5rem;
            color: var(--accent-cyan);
            box-shadow: 0 0 24px var(--accent-cyan-mid);
        }
        .onboard__done-actions {
            margin-top: 1.5rem;
        }

        @media (max-width: 480px) {
            .onboard { padding: var(--space-6) var(--space-4); }
            .onboard__templates { grid-template-columns: 1fr 1fr; }
        }
    `,
})
export class OnboardingComponent implements OnInit {
    private readonly agentService = inject(AgentService);
    private readonly projectService = inject(ProjectService);
    private readonly apiService = inject(ApiService);
    private readonly notify = inject(NotificationService);
    private readonly fb = inject(FormBuilder);

    readonly done = output<void>();

    readonly templates = TEMPLATES;
    readonly step = signal<'pick' | 'customize' | 'done'>('pick');
    readonly creating = signal(false);
    readonly providers = signal<ProviderInfo[]>([]);
    readonly createdAgentName = signal('');

    private selectedTemplate: AgentTemplate | null = null;

    readonly form = this.fb.nonNullable.group({
        name: ['', Validators.required],
        model: ['claude-sonnet-4-20250514', Validators.required],
    });

    async ngOnInit(): Promise<void> {
        try {
            const providers = await firstValueFrom(
                this.apiService.get<ProviderInfo[]>('/providers'),
            );
            this.providers.set(providers);
        } catch { /* providers will be empty, user can still type model ID */ }
    }

    pickTemplate(tpl: AgentTemplate): void {
        this.selectedTemplate = tpl;
        if (tpl.suggestedName) {
            this.form.patchValue({ name: tpl.suggestedName });
        } else {
            this.form.patchValue({ name: '' });
        }
        this.step.set('customize');
    }

    skipOnboarding(): void {
        // Emit done to let parent show the normal chat-home empty state
        this.done.emit();
    }

    async createAgent(): Promise<void> {
        if (this.form.invalid || this.creating()) return;
        this.creating.set(true);

        try {
            const { name, model } = this.form.getRawValue();
            const tpl = this.selectedTemplate;

            // Ensure a project exists
            await this.projectService.loadProjects();
            let projectId = this.projectService.projects()[0]?.id;
            if (!projectId) {
                const project = await this.projectService.createProject({
                    name: 'Default',
                    description: 'Default project',
                    workingDir: '.',
                });
                projectId = project.id;
            }

            await this.agentService.createAgent({
                name,
                model,
                provider: this.guessProvider(model),
                defaultProjectId: projectId,
                description: tpl?.description || '',
                permissionMode: 'default',
            });

            this.createdAgentName.set(name);
            this.step.set('done');
            await this.agentService.loadAgents();
        } catch (e) {
            this.notify.error('Failed to create agent', String(e));
        } finally {
            this.creating.set(false);
        }
    }

    private guessProvider(model: string): string {
        if (model.startsWith('claude')) return 'anthropic';
        if (model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3')) return 'openai';
        if (model.includes(':')) return 'ollama';
        return 'anthropic';
    }
}
