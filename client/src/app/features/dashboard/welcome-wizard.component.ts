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

interface AgentTemplate {
    id: string;
    name: string;
    suggestedName: string;
    description: string;
    icon: string;
    skillBundleIds: string[];
}

const CREATOR_TEMPLATES: AgentTemplate[] = [
    {
        id: 'website-builder',
        name: 'Website Builder',
        suggestedName: 'WebBuilder',
        description: 'Builds websites, landing pages, and portfolios. Just describe what you want.',
        icon: '[]',
        skillBundleIds: ['preset-full-stack'],
    },
    {
        id: 'app-creator',
        name: 'App Creator',
        suggestedName: 'AppMaker',
        description: 'Creates apps and tools from your ideas. Habit trackers, dashboards, calculators — anything.',
        icon: '<>',
        skillBundleIds: ['preset-full-stack'],
    },
    {
        id: 'assistant',
        name: 'Personal Assistant',
        suggestedName: 'Assistant',
        description: 'Research, writing, analysis, and automation. Your AI helper for everyday tasks.',
        icon: '>>',
        skillBundleIds: ['preset-researcher', 'preset-memory-manager'],
    },
];

const DEVELOPER_TEMPLATES: AgentTemplate[] = [
    {
        id: 'full-stack',
        name: 'Full Stack Developer',
        suggestedName: 'Builder',
        description: 'Reads and edits code, manages PRs and issues, creates work tasks. The all-rounder.',
        icon: '{}',
        skillBundleIds: ['preset-full-stack'],
    },
    {
        id: 'code-reviewer',
        name: 'Code Reviewer',
        suggestedName: 'Reviewer',
        description: 'Reviews pull requests, catches bugs, and provides actionable feedback on code quality.',
        icon: '?!',
        skillBundleIds: ['preset-code-reviewer', 'preset-github-ops'],
    },
    {
        id: 'researcher',
        name: 'Researcher',
        suggestedName: 'Scout',
        description: 'Deep web research, information gathering, and knowledge management.',
        icon: '>>',
        skillBundleIds: ['preset-researcher', 'preset-memory-manager'],
    },
    {
        id: 'devops',
        name: 'DevOps Engineer',
        suggestedName: 'Ops',
        description: 'CI/CD automation, infrastructure tasks, deployment pipelines, and repo management.',
        icon: '#!',
        skillBundleIds: ['preset-devops', 'preset-github-ops'],
    },
    {
        id: 'custom',
        name: 'Custom Agent',
        suggestedName: '',
        description: 'Start from scratch. Pick your own name, model, and skills.',
        icon: '**',
        skillBundleIds: [],
    },
];

const AGENT_TEMPLATES: AgentTemplate[] = [...CREATOR_TEMPLATES, ...DEVELOPER_TEMPLATES];

@Component({
    selector: 'app-welcome-wizard',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ReactiveFormsModule],
    template: `
        <div class="wizard">
            <div class="wizard__header">
                <pre class="wizard__logo">
 ██████╗ ██████╗ ██████╗ ██╗   ██╗██╗██████╗
██╔════╝██╔═══██╗██╔══██╗██║   ██║██║██╔══██╗
██║     ██║   ██║██████╔╝██║   ██║██║██║  ██║
██║     ██║   ██║██╔══██╗╚██╗ ██╔╝██║██║  ██║
╚██████╗╚██████╔╝██║  ██║ ╚████╔╝ ██║██████╔╝
 ╚═════╝ ╚═════╝ ╚═╝  ╚═╝  ╚═══╝  ╚═╝╚═════╝</pre>
                <h1 class="wizard__title">Welcome to CorvidAgent</h1>
                <p class="wizard__subtitle">Your own AI assistant &mdash; tell it what to build, fix, or figure out</p>
            </div>

            @switch (step()) {
                @case ('status') {
                    <div class="wizard__step">
                        <h2 class="step__title">System Status</h2>
                        <p class="step__desc">Checking your environment...</p>

                        <div class="status-grid">
                            <div class="status-check" [attr.data-ok]="health()?.apiKey">
                                <span class="status-check__icon">{{ health()?.apiKey ? '>' : '!' }}</span>
                                <span class="status-check__label">API Key</span>
                                <span class="status-check__value">{{ health()?.apiKey ? 'Configured' : 'Missing' }}</span>
                            </div>
                            <div class="status-check" [attr.data-ok]="health()?.llm">
                                <span class="status-check__icon">{{ health()?.llm ? '>' : '!' }}</span>
                                <span class="status-check__label">LLM Provider</span>
                                <span class="status-check__value">{{ health()?.llm ? 'Available' : 'Unavailable' }}</span>
                            </div>
                            <div class="status-check" [attr.data-ok]="health()?.github">
                                <span class="status-check__icon">{{ health()?.github ? '>' : '~' }}</span>
                                <span class="status-check__label">GitHub</span>
                                <span class="status-check__value">{{ health()?.github ? 'Connected' : 'Optional' }}</span>
                            </div>
                            <div class="status-check" [attr.data-ok]="health()?.algorand">
                                <span class="status-check__icon">{{ health()?.algorand ? '>' : '~' }}</span>
                                <span class="status-check__label">AlgoChat</span>
                                <span class="status-check__value">{{ health()?.algorand ? 'Connected' : 'Optional' }}</span>
                            </div>
                        </div>

                        @if (health()?.apiKey || health()?.llm) {
                            <button class="wizard__btn wizard__btn--primary" (click)="step.set('templates')">
                                Create Your First Agent
                            </button>
                        } @else {
                            <div class="wizard__warning">
                                <p>No AI provider detected. Install <a href="https://claude.com/claude-code" target="_blank">Claude Code CLI</a> or <a href="https://ollama.com" target="_blank">Ollama</a>, or set <code>ANTHROPIC_API_KEY</code> in your <code>.env</code> file.</p>
                            </div>
                            <button class="wizard__btn" (click)="step.set('templates')">
                                Continue Anyway
                            </button>
                        }
                    </div>
                }

                @case ('templates') {
                    <div class="wizard__step wizard__step--wide">
                        <h2 class="step__title">What do you want to do?</h2>
                        <p class="step__desc">Pick a starting point &mdash; you can customize everything later.</p>

                        <p class="template-section-label">I have ideas but don&rsquo;t code</p>
                        <div class="template-grid">
                            @for (t of creatorTemplates; track t.id) {
                                <button class="template-card"
                                        [attr.data-selected]="selectedTemplate()?.id === t.id"
                                        (click)="selectTemplate(t)">
                                    <span class="template-card__icon">{{ t.icon }}</span>
                                    <span class="template-card__name">{{ t.name }}</span>
                                    <span class="template-card__desc">{{ t.description }}</span>
                                </button>
                            }
                        </div>

                        <p class="template-section-label" style="margin-top: 0.75rem;">I&rsquo;m a developer</p>
                        <div class="template-grid">
                            @for (t of developerTemplates; track t.id) {
                                <button class="template-card"
                                        [attr.data-selected]="selectedTemplate()?.id === t.id"
                                        (click)="selectTemplate(t)">
                                    <span class="template-card__icon">{{ t.icon }}</span>
                                    <span class="template-card__name">{{ t.name }}</span>
                                    <span class="template-card__desc">{{ t.description }}</span>
                                </button>
                            }
                        </div>

                        <div class="wizard__actions">
                            <button type="button" class="wizard__btn" (click)="step.set('status')">Back</button>
                            <button class="wizard__btn wizard__btn--primary"
                                    [disabled]="!selectedTemplate()"
                                    (click)="applyTemplate()">
                                Next
                            </button>
                        </div>
                    </div>
                }

                @case ('create') {
                    <div class="wizard__step">
                        <h2 class="step__title">Create Your First Agent</h2>
                        <p class="step__desc">
                            @if (selectedTemplate() && selectedTemplate()!.id !== 'custom') {
                                Customize your {{ selectedTemplate()!.name }} agent.
                            } @else {
                                Give your agent a name and choose a model.
                            }
                        </p>

                        <form [formGroup]="form" (ngSubmit)="onCreateAgent()" class="wizard__form">
                            <div class="field">
                                <label for="wiz-name" class="field__label">Agent Name</label>
                                <input id="wiz-name" formControlName="name" class="field__input"
                                       placeholder="e.g. Corvid, Scout, Builder" autocomplete="off" />
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

                            @if (selectedTemplate() && selectedTemplate()!.skillBundleIds.length > 0) {
                                <div class="field">
                                    <span class="field__label">Skills</span>
                                    <div class="skill-tags">
                                        @for (id of selectedTemplate()!.skillBundleIds; track id) {
                                            <span class="skill-tag">{{ formatBundleId(id) }}</span>
                                        }
                                    </div>
                                </div>
                            }

                            <div class="wizard__actions">
                                <button type="button" class="wizard__btn" (click)="step.set('templates')">Back</button>
                                <button type="submit" class="wizard__btn wizard__btn--primary"
                                        [disabled]="form.invalid || creating()">
                                    {{ creating() ? 'Creating...' : 'Create Agent' }}
                                </button>
                            </div>
                        </form>
                    </div>
                }

                @case ('flock') {
                    <div class="wizard__step">
                        <h2 class="step__title">Join the Flock</h2>
                        <p class="step__desc">Register your agent on the Algorand network to discover and collaborate with other agents.</p>

                        <div class="network-grid">
                            <button class="network-card"
                                    [attr.data-selected]="selectedNetwork() === 'localnet'"
                                    (click)="selectedNetwork.set('localnet')">
                                <span class="network-card__icon">[]</span>
                                <span class="network-card__name">Localnet</span>
                                <span class="network-card__desc">Development mode. Run a local Algorand network for testing.</span>
                            </button>
                            <button class="network-card"
                                    [attr.data-selected]="selectedNetwork() === 'testnet'"
                                    (click)="selectedNetwork.set('testnet')">
                                <span class="network-card__icon">&lt;&gt;</span>
                                <span class="network-card__name">Testnet</span>
                                <span class="network-card__desc">Connect to Algorand TestNet. Interact with real agents in a sandbox.</span>
                            </button>
                        </div>

                        @if (flockError()) {
                            <div class="wizard__warning">
                                <p>Registration failed, but you can continue setup.</p>
                            </div>
                        }

                        <div class="wizard__actions">
                            <button type="button" class="wizard__btn" (click)="step.set('create')">Back</button>
                            <button type="button" class="wizard__btn" (click)="step.set('done')">Skip for now</button>
                            <button class="wizard__btn wizard__btn--primary"
                                    [disabled]="!selectedNetwork() || flockRegistering()"
                                    (click)="registerFlock()">
                                {{ flockRegistering() ? 'Registering...' : 'Register' }}
                            </button>
                        </div>
                    </div>
                }

                @case ('done') {
                    <div class="wizard__step wizard__step--done">
                        <div class="done__icon">&check;</div>
                        <h2 class="step__title">Agent Created</h2>
                        <p class="step__desc">{{ createdAgentName() }} is ready to go.</p>

                        <div class="setup-summary">
                            <h3 class="setup-summary__title">Setup Summary</h3>
                            <div class="setup-summary__list">
                                <div class="setup-summary__item" data-status="ok">
                                    <span class="setup-summary__icon">&check;</span>
                                    <span class="setup-summary__label">Agent</span>
                                    <span class="setup-summary__value setup-summary__value--ok">Created &mdash; {{ createdAgentName() }}</span>
                                </div>
                                <div class="setup-summary__item" [attr.data-status]="health()?.llm ? 'ok' : 'warn'">
                                    <span class="setup-summary__icon">{{ health()?.llm ? '&check;' : '!' }}</span>
                                    <span class="setup-summary__label">LLM Provider</span>
                                    <span class="setup-summary__value" [class.setup-summary__value--ok]="health()?.llm" [class.setup-summary__value--warn]="!health()?.llm">{{ health()?.llm ? 'Connected' : 'Not configured' }}</span>
                                </div>
                                <div class="setup-summary__item" [attr.data-status]="health()?.github ? 'ok' : 'optional'">
                                    <span class="setup-summary__icon">{{ health()?.github ? '&check;' : '~' }}</span>
                                    <span class="setup-summary__label">GitHub</span>
                                    <span class="setup-summary__value" [class.setup-summary__value--ok]="health()?.github" [class.setup-summary__value--optional]="!health()?.github">{{ health()?.github ? 'Connected' : 'Optional' }}</span>
                                </div>
                                <div class="setup-summary__item" [attr.data-status]="health()?.algorand ? 'ok' : 'optional'">
                                    <span class="setup-summary__icon">{{ health()?.algorand ? '&check;' : '~' }}</span>
                                    <span class="setup-summary__label">AlgoChat</span>
                                    <span class="setup-summary__value" [class.setup-summary__value--ok]="health()?.algorand" [class.setup-summary__value--optional]="!health()?.algorand">{{ health()?.algorand ? 'Connected' : 'Optional' }}</span>
                                </div>
                                <div class="setup-summary__item" [attr.data-status]="flockRegistered() ? 'ok' : 'optional'">
                                    <span class="setup-summary__icon">{{ flockRegistered() ? '&check;' : '~' }}</span>
                                    <span class="setup-summary__label">Flock Directory</span>
                                    <span class="setup-summary__value" [class.setup-summary__value--ok]="flockRegistered()" [class.setup-summary__value--optional]="!flockRegistered()">{{ flockRegistered() ? 'Registered' : 'Skipped' }}</span>
                                </div>
                            </div>
                        </div>

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
                <a href="https://github.com/CorvidLabs/corvid-agent" target="_blank" rel="noopener">Docs</a>
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
        .wizard__step--wide { max-width: 560px; }
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

        /* Template Section Labels */
        .template-section-label {
            margin: 0 0 0.5rem;
            font-size: 0.7rem;
            font-weight: 600;
            color: var(--text-tertiary);
            text-transform: uppercase;
            letter-spacing: 0.06em;
            text-align: left;
        }

        /* Template Grid */
        .template-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0.65rem;
            margin-bottom: 1.25rem;
            text-align: left;
        }
        .template-card {
            display: flex;
            flex-direction: column;
            gap: 0.25rem;
            padding: 0.75rem;
            background: var(--bg-raised);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            cursor: pointer;
            font-family: inherit;
            color: var(--text-primary);
            transition: border-color 0.15s, background 0.15s;
        }
        .template-card:hover {
            border-color: var(--border-bright);
            background: var(--bg-hover);
        }
        .template-card[data-selected="true"] {
            border-color: var(--accent-cyan);
            background: rgba(0, 229, 255, 0.06);
            box-shadow: var(--glow-cyan);
        }
        .template-card:last-child:nth-child(odd) {
            grid-column: 1 / -1;
        }
        .template-card__icon {
            font-size: 0.85rem;
            font-weight: 700;
            color: var(--accent-cyan);
            font-family: monospace;
        }
        .template-card__name {
            font-size: 0.8rem;
            font-weight: 600;
        }
        .template-card__desc {
            font-size: 0.7rem;
            color: var(--text-tertiary);
            line-height: 1.35;
        }

        /* Skill Tags */
        .skill-tags {
            display: flex;
            flex-wrap: wrap;
            gap: 0.35rem;
        }
        .skill-tag {
            padding: 0.2rem 0.5rem;
            background: rgba(0, 229, 255, 0.08);
            border: 1px solid rgba(0, 229, 255, 0.2);
            border-radius: var(--radius);
            font-size: 0.7rem;
            color: var(--accent-cyan);
            font-weight: 600;
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
        .field__input:focus {
            outline: none;
            border-color: var(--accent-cyan);
            box-shadow: var(--glow-cyan);
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

        /* Network Grid (Flock Step) */
        .network-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0.65rem;
            margin-bottom: 1.25rem;
            text-align: left;
        }
        .network-card {
            display: flex;
            flex-direction: column;
            gap: 0.25rem;
            padding: 0.75rem;
            background: var(--bg-raised);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            cursor: pointer;
            font-family: inherit;
            color: var(--text-primary);
            transition: border-color 0.15s, background 0.15s;
        }
        .network-card:hover {
            border-color: var(--border-bright);
            background: var(--bg-hover);
        }
        .network-card[data-selected="true"] {
            border-color: var(--accent-cyan);
            background: rgba(0, 229, 255, 0.06);
            box-shadow: var(--glow-cyan);
        }
        .network-card__icon {
            font-size: 0.85rem;
            font-weight: 700;
            color: var(--accent-cyan);
            font-family: monospace;
        }
        .network-card__name {
            font-size: 0.8rem;
            font-weight: 600;
        }
        .network-card__desc {
            font-size: 0.7rem;
            color: var(--text-tertiary);
            line-height: 1.35;
        }

        /* Setup Summary (Done Step) */
        .setup-summary {
            text-align: left;
            margin-bottom: 1.25rem;
        }
        .setup-summary__title {
            margin: 0 0 0.65rem;
            font-size: 0.75rem;
            font-weight: 600;
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.06em;
        }
        .setup-summary__list {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
        }
        .setup-summary__item {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 0.5rem 0.75rem;
            background: var(--bg-raised);
            border: 1px solid var(--border);
            border-radius: var(--radius);
        }
        .setup-summary__icon {
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
        .setup-summary__item[data-status="ok"] .setup-summary__icon {
            color: var(--accent-green);
            border-color: var(--accent-green);
        }
        .setup-summary__item[data-status="warn"] .setup-summary__icon {
            color: var(--accent-amber, #ffc107);
            border-color: var(--accent-amber, #ffc107);
        }
        .setup-summary__item[data-status="optional"] .setup-summary__icon {
            color: var(--text-tertiary);
            border-color: var(--text-tertiary);
        }
        .setup-summary__label {
            flex: 1;
            font-size: 0.8rem;
            font-weight: 600;
            color: var(--text-primary);
        }
        .setup-summary__value {
            font-size: 0.75rem;
            font-weight: 600;
        }
        .setup-summary__value--ok { color: var(--accent-green); }
        .setup-summary__value--warn { color: var(--accent-amber, #ffc107); }
        .setup-summary__value--optional { color: var(--text-tertiary); }

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
            .template-grid { grid-template-columns: 1fr; }
            .network-grid { grid-template-columns: 1fr; }
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

    protected readonly step = signal<'status' | 'templates' | 'create' | 'flock' | 'done'>('status');
    protected readonly health = signal<HealthStatus | null>(null);
    protected readonly providers = signal<ProviderInfo[]>([]);
    protected readonly availableModels = signal<string[]>([]);
    protected readonly creating = signal(false);
    protected readonly createdAgentName = signal('');
    protected readonly selectedTemplate = signal<AgentTemplate | null>(null);
    protected readonly selectedNetwork = signal<'localnet' | 'testnet' | null>(null);
    protected readonly flockRegistering = signal(false);
    protected readonly flockRegistered = signal(false);
    protected readonly flockError = signal(false);
    protected readonly templates = AGENT_TEMPLATES;
    protected readonly creatorTemplates = CREATOR_TEMPLATES;
    protected readonly developerTemplates = DEVELOPER_TEMPLATES;
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

    protected selectTemplate(template: AgentTemplate): void {
        this.selectedTemplate.set(template);
    }

    protected applyTemplate(): void {
        const template = this.selectedTemplate();
        if (!template) return;
        if (template.suggestedName) {
            this.form.patchValue({ name: template.suggestedName });
        } else {
            this.form.patchValue({ name: '' });
        }
        this.step.set('create');
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

            // Assign skill bundles from the selected template
            const template = this.selectedTemplate();
            if (template) {
                await this.assignSkillBundles(agent.id, template.skillBundleIds);
            }

            this.agentCreated.emit();
            this.step.set('flock');
        } finally {
            this.creating.set(false);
        }
    }

    private async assignSkillBundles(agentId: string, bundleIds: string[]): Promise<void> {
        for (let i = 0; i < bundleIds.length; i++) {
            try {
                await firstValueFrom(
                    this.apiService.post(`/agents/${agentId}/skills`, {
                        bundleId: bundleIds[i],
                        sortOrder: i,
                    }),
                );
            } catch {
                // Bundle may not exist — skip silently
            }
        }
    }

    protected formatBundleId(id: string): string {
        return id.replace('preset-', '').split('-').map(
            (w) => w.charAt(0).toUpperCase() + w.slice(1),
        ).join(' ');
    }

    protected async registerFlock(): Promise<void> {
        if (!this.selectedNetwork() || this.flockRegistering()) return;
        this.flockRegistering.set(true);
        this.flockError.set(false);

        try {
            await firstValueFrom(
                this.apiService.post('/flock-directory/agents', {
                    name: this.createdAgentName(),
                    capabilities: ['code', 'review', 'test'],
                }),
            );
            this.flockRegistered.set(true);
            this.step.set('done');
        } catch {
            this.flockError.set(true);
        } finally {
            this.flockRegistering.set(false);
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
