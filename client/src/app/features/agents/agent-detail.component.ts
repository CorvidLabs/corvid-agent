import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AgentService } from '../../core/services/agent.service';
import { ProjectService } from '../../core/services/project.service';
import { SessionService } from '../../core/services/session.service';
import { WebSocketService } from '../../core/services/websocket.service';
import { WorkTaskService } from '../../core/services/work-task.service';
import { PersonaService } from '../../core/services/persona.service';
import { SkillBundleService } from '../../core/services/skill-bundle.service';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import type { Agent } from '../../core/models/agent.model';
import type { AgentMessage } from '../../core/models/agent-message.model';
import type { Session } from '../../core/models/session.model';
import type { WorkTask } from '../../core/models/work-task.model';
import type { ServerWsMessage } from '../../core/models/ws-message.model';
import type { AgentPersona } from '../../core/models/persona.model';
import type { AgentSkillAssignment } from '../../core/models/skill-bundle.model';

type Tab = 'overview' | 'sessions' | 'messages' | 'work-tasks' | 'persona' | 'skills';

@Component({
    selector: 'app-agent-detail',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, RelativeTimePipe, DecimalPipe, FormsModule, StatusBadgeComponent],
    template: `
        @if (agent(); as a) {
            <div class="page">
                <div class="page__header">
                    <div>
                        <h2>{{ a.name }}</h2>
                        <p class="page__desc">{{ a.description }}</p>
                    </div>
                    <div class="page__actions">
                        <a class="btn btn--secondary" [routerLink]="['/agents', a.id, 'edit']">Edit</a>
                        <button class="btn btn--danger" (click)="onDelete()">Delete</button>
                    </div>
                </div>

                <!-- Tabs -->
                <div class="tabs">
                    @for (tab of tabs; track tab.key) {
                        <button
                            class="tab"
                            [class.tab--active]="activeTab() === tab.key"
                            (click)="activeTab.set(tab.key)">
                            {{ tab.label }}
                            @if (tab.count !== undefined && tab.count > 0) {
                                <span class="tab__count">{{ tab.count }}</span>
                            }
                        </button>
                    }
                </div>

                <!-- Overview Tab -->
                @if (activeTab() === 'overview') {
                    <!-- Stats Cards -->
                    <div class="stats-row">
                        <div class="stat-card">
                            <span class="stat-card__label">Total Sessions</span>
                            <span class="stat-card__value">{{ agentSessions().length }}</span>
                        </div>
                        <div class="stat-card">
                            <span class="stat-card__label">Running</span>
                            <span class="stat-card__value stat-card__value--active">{{ agentRunningSessions().length }}</span>
                        </div>
                        <div class="stat-card">
                            <span class="stat-card__label">Total Cost</span>
                            <span class="stat-card__value stat-card__value--cost">\${{ totalCost() | number:'1.2-4' }}</span>
                        </div>
                        <div class="stat-card">
                            <span class="stat-card__label">Work Tasks</span>
                            <span class="stat-card__value">{{ workTasks().length }}</span>
                        </div>
                        @if (a.walletAddress) {
                            <div class="stat-card">
                                <span class="stat-card__label">ALGO Balance</span>
                                <span class="stat-card__value stat-card__value--algo">{{ walletBalance() / 1000000 | number:'1.2-6' }}</span>
                            </div>
                        }
                    </div>

                    <div class="detail__info">
                        <dl>
                            <dt>Model</dt>
                            <dd>{{ a.model || 'default' }}</dd>
                            <dt>Permission Mode</dt>
                            <dd>{{ a.permissionMode }}</dd>
                            @if (a.maxBudgetUsd !== null) {
                                <dt>Max Budget</dt>
                                <dd>{{ a.maxBudgetUsd | number:'1.2-2' }} USD</dd>
                            }
                            <dt>AlgoChat</dt>
                            <dd>{{ a.algochatEnabled ? 'Enabled' : 'Disabled' }}{{ a.algochatAuto ? ' (Auto)' : '' }}</dd>
                            <dt>Default Project</dt>
                            <dd>{{ defaultProjectName() || 'None (global default)' }}</dd>
                            @if (a.walletAddress) {
                                <dt>Wallet</dt>
                                <dd><code>{{ a.walletAddress }}</code></dd>
                            }
                            <dt>Created</dt>
                            <dd>{{ a.createdAt | relativeTime }}</dd>
                        </dl>
                    </div>

                    @if (a.systemPrompt) {
                        <div class="detail__section">
                            <h3>System Prompt</h3>
                            <pre class="detail__code">{{ a.systemPrompt }}</pre>
                        </div>
                    }

                    <!-- Cost Breakdown -->
                    @if (agentSessions().length > 0) {
                        <div class="detail__section">
                            <h3>Cost Analytics</h3>
                            <div class="cost-bars">
                                @for (day of costByDay(); track day.date) {
                                    <div class="cost-bar-row" [title]="day.date + ': $' + day.cost.toFixed(4)">
                                        <span class="cost-bar-row__label">{{ day.dateShort }}</span>
                                        <div class="cost-bar-row__bar-wrap">
                                            <div class="cost-bar-row__bar" [style.width.%]="day.pct"></div>
                                        </div>
                                        <span class="cost-bar-row__value">\${{ day.cost | number:'1.2-4' }}</span>
                                    </div>
                                }
                            </div>
                        </div>
                    }
                }

                <!-- Sessions Tab -->
                @if (activeTab() === 'sessions') {
                    @if (agentSessions().length === 0) {
                        <p class="detail__empty">No sessions yet.</p>
                    } @else {
                        <div class="session-table">
                            <div class="session-table__header">
                                <span>Name</span>
                                <span>Status</span>
                                <span>Cost</span>
                                <span>Turns</span>
                                <span>Time</span>
                            </div>
                            @for (session of agentSessions(); track session.id) {
                                <a class="session-table__row" [routerLink]="['/sessions', session.id]">
                                    <span class="session-table__name">{{ session.name || session.initialPrompt?.slice(0, 40) || session.id.slice(0, 8) }}</span>
                                    <span><app-status-badge [status]="session.status" /></span>
                                    <span class="session-table__cost">\${{ session.totalCostUsd | number:'1.2-4' }}</span>
                                    <span>{{ session.totalTurns }}</span>
                                    <span class="session-table__time">{{ session.updatedAt | relativeTime }}</span>
                                </a>
                            }
                        </div>
                    }
                }

                <!-- Messages Tab -->
                @if (activeTab() === 'messages') {
                    @if (messages().length === 0) {
                        <p class="detail__empty">No messages yet.</p>
                    } @else {
                        <div class="messages-list">
                            @for (msg of messages(); track msg.id) {
                                <div class="message-row">
                                    <div class="message-row__header">
                                        <span class="message-row__direction">
                                            {{ msg.fromAgentId === a.id ? 'Sent to' : 'From' }}
                                            {{ msg.fromAgentId === a.id ? getAgentName(msg.toAgentId) : getAgentName(msg.fromAgentId) }}
                                        </span>
                                        <span class="message-row__status" [attr.data-status]="msg.status">{{ msg.status }}</span>
                                        @if (msg.paymentMicro > 0) {
                                            <span class="message-row__payment">{{ msg.paymentMicro / 1000000 | number:'1.3-6' }} ALGO</span>
                                        }
                                    </div>
                                    <p class="message-row__content">{{ msg.content.length > 120 ? msg.content.slice(0, 120) + '...' : msg.content }}</p>
                                    @if (msg.response) {
                                        <p class="message-row__response">{{ msg.response.length > 120 ? msg.response.slice(0, 120) + '...' : msg.response }}</p>
                                    }
                                    @if (msg.sessionId) {
                                        <a class="message-row__session" [routerLink]="['/sessions', msg.sessionId]">View Session</a>
                                    }
                                </div>
                            }
                        </div>
                    }

                    <div class="invoke-form">
                        <h4>Invoke Another Agent</h4>
                        <select class="invoke-select" [(ngModel)]="invokeTargetId" aria-label="Select target agent">
                            <option value="" disabled>Select target agent...</option>
                            @for (other of otherAgents(); track other.id) {
                                <option [value]="other.id">{{ other.name }}</option>
                            }
                        </select>
                        <textarea
                            class="invoke-textarea"
                            [(ngModel)]="invokeContent"
                            placeholder="Message content..."
                            rows="3"
                        ></textarea>
                        <button
                            class="btn btn--primary"
                            [disabled]="!invokeTargetId || !invokeContent || invoking()"
                            (click)="onInvoke()"
                        >{{ invoking() ? 'Sending...' : 'Send Message' }}</button>
                    </div>
                }

                <!-- Work Tasks Tab -->
                @if (activeTab() === 'work-tasks') {
                    <div class="work-form">
                        <textarea
                            class="invoke-textarea"
                            [(ngModel)]="workDescription"
                            placeholder="Describe the task (e.g. 'Fix the login button alignment')..."
                            rows="3"
                        ></textarea>
                        <button
                            class="btn btn--primary"
                            [disabled]="!workDescription || creatingWork()"
                            (click)="onCreateWork()"
                        >{{ creatingWork() ? 'Starting...' : 'Start Work Task' }}</button>
                    </div>

                    @if (workTasks().length === 0) {
                        <p class="detail__empty">No work tasks yet.</p>
                    } @else {
                        <div class="work-tasks-list">
                            @for (task of workTasks(); track task.id) {
                                <div class="work-task-row">
                                    <div class="work-task-row__header">
                                        <span class="work-task-row__status" [attr.data-status]="task.status">{{ task.status }}</span>
                                        <span class="work-task-row__source">{{ task.source }}</span>
                                        <span class="work-task-row__time">{{ task.createdAt | relativeTime }}</span>
                                    </div>
                                    <p class="work-task-row__desc">{{ task.description }}</p>
                                    @if (task.branchName) {
                                        <p class="work-task-row__branch"><code>{{ task.branchName }}</code></p>
                                    }
                                    @if (task.prUrl) {
                                        <a class="work-task-row__pr" [href]="task.prUrl" target="_blank" rel="noopener">{{ task.prUrl }}</a>
                                    }
                                    @if (task.error) {
                                        <p class="work-task-row__error">{{ task.error }}</p>
                                    }
                                    @if (task.sessionId) {
                                        <a class="work-task-row__session" [routerLink]="['/sessions', task.sessionId]">View Session</a>
                                    }
                                    @if (task.status === 'running' || task.status === 'branching') {
                                        <button class="btn btn--danger btn--sm" (click)="onCancelWork(task.id)">Cancel</button>
                                    }
                                </div>
                            }
                        </div>
                    }
                }

                <!-- Persona Tab -->
                @if (activeTab() === 'persona') {
                    @if (persona(); as p) {
                        <div class="persona-info">
                            <dl>
                                <dt>Archetype</dt>
                                <dd>{{ p.archetype }}</dd>
                                <dt>Traits</dt>
                                <dd>{{ p.traits.join(', ') || 'None' }}</dd>
                            </dl>
                            @if (p.voiceGuidelines) {
                                <p class="persona-info__text"><strong>Voice:</strong> {{ p.voiceGuidelines }}</p>
                            }
                            @if (p.background) {
                                <p class="persona-info__text"><strong>Background:</strong> {{ p.background }}</p>
                            }
                        </div>
                        <button class="btn btn--secondary btn--sm" routerLink="/personas">Edit Persona</button>
                    } @else {
                        <p class="detail__empty">No persona configured. <a routerLink="/personas">Configure one</a></p>
                    }
                }

                <!-- Skills Tab -->
                @if (activeTab() === 'skills') {
                    @if (agentBundles().length === 0) {
                        <p class="detail__empty">No skill bundles assigned. <a routerLink="/skill-bundles">Manage bundles</a></p>
                    } @else {
                        <div class="skills-list">
                            @for (ab of agentBundles(); track ab.bundleId) {
                                <span class="skill-tag">{{ getBundleName(ab.bundleId) }}</span>
                            }
                        </div>
                    }
                }
            </div>
        } @else {
            <div class="page"><p>Loading...</p></div>
        }
    `,
    styles: `
        .page { padding: 1.5rem; }
        .page__header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem; }
        .page__header h2 { margin: 0; color: var(--text-primary); }
        .page__desc { margin: 0.25rem 0 0; color: var(--text-secondary); }
        .page__actions { display: flex; gap: 0.5rem; }

        /* Tabs */
        .tabs { display: flex; gap: 0; border-bottom: 1px solid var(--border); margin-bottom: 1.5rem; overflow-x: auto; }
        .tab {
            padding: 0.5rem 1rem; background: transparent; border: none; border-bottom: 2px solid transparent;
            color: var(--text-secondary); font-size: 0.8rem; font-weight: 600; font-family: inherit;
            cursor: pointer; text-transform: uppercase; letter-spacing: 0.05em; transition: all 0.15s;
            white-space: nowrap; display: flex; align-items: center; gap: 0.35rem;
        }
        .tab:hover { color: var(--text-primary); }
        .tab--active { color: var(--accent-cyan); border-bottom-color: var(--accent-cyan); }
        .tab__count {
            font-size: 0.6rem; padding: 1px 5px; border-radius: var(--radius-sm);
            background: var(--bg-raised); color: var(--text-tertiary); border: 1px solid var(--border);
        }
        .tab--active .tab__count { color: var(--accent-cyan); border-color: var(--accent-cyan); }

        /* Stats Row */
        .stats-row {
            display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
            gap: 0.75rem; margin-bottom: 1.5rem;
        }
        .stat-card {
            background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-lg);
            padding: 0.75rem; display: flex; flex-direction: column; gap: 0.2rem;
        }
        .stat-card__label { font-size: 0.6rem; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.08em; }
        .stat-card__value { font-size: 1.3rem; font-weight: 700; color: var(--accent-cyan); }
        .stat-card__value--active { color: var(--accent-amber, #ffc107); }
        .stat-card__value--cost { color: var(--accent-green); }
        .stat-card__value--algo { color: var(--accent-magenta); }

        /* Session Table */
        .session-table { border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
        .session-table__header {
            display: grid; grid-template-columns: 2fr 1fr 1fr 0.5fr 1fr;
            padding: 0.5rem 1rem; background: var(--bg-raised); font-size: 0.7rem; font-weight: 600;
            text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary);
        }
        .session-table__row {
            display: grid; grid-template-columns: 2fr 1fr 1fr 0.5fr 1fr;
            padding: 0.5rem 1rem; border-top: 1px solid var(--border);
            font-size: 0.8rem; color: var(--text-primary); text-decoration: none;
            transition: background 0.1s; align-items: center;
        }
        .session-table__row:hover { background: var(--bg-hover); }
        .session-table__name { font-weight: 600; color: var(--accent-cyan); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .session-table__cost { color: var(--accent-green); }
        .session-table__time { font-size: 0.7rem; color: var(--text-tertiary); }

        /* Cost Bars */
        .cost-bars { display: flex; flex-direction: column; gap: 3px; }
        .cost-bar-row { display: flex; align-items: center; gap: 0.5rem; }
        .cost-bar-row__label { width: 48px; flex-shrink: 0; font-size: 0.6rem; color: var(--text-tertiary); text-align: right; }
        .cost-bar-row__bar-wrap { flex: 1; height: 14px; background: var(--bg-raised); border-radius: 2px; overflow: hidden; }
        .cost-bar-row__bar { height: 100%; background: linear-gradient(90deg, var(--accent-cyan-dim), var(--accent-cyan)); border-radius: 2px; min-width: 1px; transition: width 0.3s; }
        .cost-bar-row__value { width: 64px; flex-shrink: 0; font-size: 0.6rem; color: var(--accent-green); text-align: right; }

        /* Shared styles from original */
        .btn {
            padding: 0.5rem 1rem; border-radius: var(--radius); font-size: 0.8rem; font-weight: 600;
            cursor: pointer; border: 1px solid; text-decoration: none; font-family: inherit;
            text-transform: uppercase; letter-spacing: 0.05em; transition: background 0.15s;
        }
        .btn--secondary { background: transparent; color: var(--text-secondary); border-color: var(--border-bright); }
        .btn--secondary:hover { background: var(--bg-hover); color: var(--text-primary); }
        .btn--danger { background: transparent; color: var(--accent-red); border-color: var(--accent-red); }
        .btn--danger:hover { background: var(--accent-red-dim); }
        .btn--primary { border-color: var(--accent-cyan); background: var(--accent-cyan-dim); color: var(--accent-cyan); }
        .btn--primary:hover:not(:disabled) { background: rgba(0, 229, 255, 0.15); }
        .btn--primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn--sm { padding: 0.25rem 0.5rem; font-size: 0.7rem; margin-top: 0.5rem; }

        .detail__info dl { display: grid; grid-template-columns: auto 1fr; gap: 0.25rem 1rem; }
        .detail__info dt { font-weight: 600; color: var(--text-secondary); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.03em; }
        .detail__info dd { margin: 0; color: var(--text-primary); }
        .detail__section { margin-top: 1.5rem; }
        .detail__section h3 { margin: 0 0 0.75rem; color: var(--text-primary); }
        .detail__code {
            background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius);
            padding: 1rem; font-size: 0.8rem; white-space: pre-wrap; overflow-x: auto; color: var(--accent-green);
        }
        .detail__empty { color: var(--text-secondary); font-size: 0.85rem; }
        .detail__empty a { color: var(--accent-cyan); text-decoration: none; }
        .detail__empty a:hover { text-decoration: underline; }

        .messages-list { display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1.5rem; }
        .message-row { background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 0.75rem; }
        .message-row__header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem; }
        .message-row__direction { color: var(--text-secondary); font-weight: 600; font-size: 0.75rem; text-transform: uppercase; }
        .message-row__status { font-size: 0.7rem; padding: 1px 6px; border-radius: var(--radius-sm); font-weight: 600; text-transform: uppercase; background: var(--bg-raised); color: var(--text-secondary); border: 1px solid var(--border); }
        .message-row__status[data-status="completed"] { color: var(--accent-green); border-color: var(--accent-green); }
        .message-row__status[data-status="processing"] { color: var(--accent-cyan); border-color: var(--accent-cyan); }
        .message-row__status[data-status="failed"] { color: var(--accent-red); border-color: var(--accent-red); }
        .message-row__payment { font-size: 0.75rem; color: var(--accent-green); font-weight: 600; }
        .message-row__content { margin: 0.25rem 0; color: var(--text-primary); font-size: 0.85rem; }
        .message-row__response { margin: 0.25rem 0; color: var(--accent-cyan); font-style: italic; font-size: 0.85rem; }
        .message-row__session { font-size: 0.75rem; color: var(--accent-cyan); text-decoration: none; }

        .invoke-form { margin-top: 1.5rem; display: flex; flex-direction: column; gap: 0.5rem; max-width: 500px; }
        .invoke-form h4 { margin: 0; color: var(--text-primary); }
        .invoke-select, .invoke-textarea { padding: 0.5rem; border: 1px solid var(--border-bright); border-radius: var(--radius); font-size: 0.85rem; font-family: inherit; background: var(--bg-input); color: var(--text-primary); }
        .invoke-select:focus, .invoke-textarea:focus { border-color: var(--accent-cyan); box-shadow: var(--glow-cyan); outline: none; }
        .invoke-textarea { resize: vertical; min-height: 5em; line-height: 1.5; }

        .work-form { display: flex; flex-direction: column; gap: 0.5rem; max-width: 500px; margin-bottom: 1rem; }
        .work-tasks-list { display: flex; flex-direction: column; gap: 0.75rem; }
        .work-task-row { background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 0.75rem; }
        .work-task-row__header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem; }
        .work-task-row__status { font-size: 0.7rem; padding: 1px 6px; border-radius: var(--radius-sm); font-weight: 600; text-transform: uppercase; background: var(--bg-raised); color: var(--text-secondary); border: 1px solid var(--border); }
        .work-task-row__status[data-status="completed"] { color: var(--accent-green); border-color: var(--accent-green); }
        .work-task-row__status[data-status="running"] { color: var(--accent-cyan); border-color: var(--accent-cyan); }
        .work-task-row__status[data-status="failed"] { color: var(--accent-red); border-color: var(--accent-red); }
        .work-task-row__source { font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; }
        .work-task-row__time { font-size: 0.7rem; color: var(--text-secondary); margin-left: auto; }
        .work-task-row__desc { margin: 0.25rem 0; color: var(--text-primary); font-size: 0.85rem; }
        .work-task-row__branch code { color: var(--accent-cyan); font-size: 0.75rem; }
        .work-task-row__pr { display: block; font-size: 0.75rem; color: var(--accent-green); text-decoration: none; word-break: break-all; }
        .work-task-row__error { margin: 0.25rem 0; font-size: 0.8rem; color: var(--accent-red); }
        .work-task-row__session { font-size: 0.75rem; color: var(--accent-cyan); text-decoration: none; }

        .persona-info dl { display: grid; grid-template-columns: auto 1fr; gap: 0.25rem 1rem; margin-bottom: 0.5rem; }
        .persona-info dt { font-weight: 600; color: var(--text-secondary); font-size: 0.8rem; text-transform: uppercase; }
        .persona-info dd { margin: 0; color: var(--text-primary); }
        .persona-info__text { font-size: 0.85rem; color: var(--text-secondary); margin: 0.25rem 0; }
        .skills-list { display: flex; flex-wrap: wrap; gap: 0.5rem; }
        .skill-tag { font-size: 0.75rem; padding: 3px 10px; border-radius: var(--radius-sm); background: var(--accent-cyan-dim); color: var(--accent-cyan); border: 1px solid var(--accent-cyan); }

        code { background: var(--bg-raised); color: var(--accent-magenta); padding: 2px 6px; border-radius: var(--radius-sm); font-size: 0.8rem; border: 1px solid var(--border); }

        @media (max-width: 768px) {
            .stats-row { grid-template-columns: repeat(2, 1fr); }
            .session-table__header, .session-table__row { grid-template-columns: 2fr 1fr 1fr; }
            .session-table__header span:nth-child(n+4), .session-table__row span:nth-child(n+4) { display: none; }
            .tabs { gap: 0; }
            .tab { padding: 0.4rem 0.6rem; font-size: 0.7rem; }
        }
    `,
})
export class AgentDetailComponent implements OnInit, OnDestroy {
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly agentService = inject(AgentService);
    private readonly projectService = inject(ProjectService);
    private readonly sessionService = inject(SessionService);
    private readonly wsService = inject(WebSocketService);
    private readonly workTaskService = inject(WorkTaskService);
    private readonly personaService = inject(PersonaService);
    private readonly skillBundleService = inject(SkillBundleService);

    protected readonly agent = signal<Agent | null>(null);
    protected readonly persona = signal<AgentPersona | null>(null);
    protected readonly agentBundles = signal<AgentSkillAssignment[]>([]);
    protected readonly defaultProjectName = signal<string | null>(null);
    protected readonly walletBalance = signal(0);
    protected readonly messages = signal<AgentMessage[]>([]);
    protected readonly otherAgents = signal<Agent[]>([]);
    protected readonly invoking = signal(false);
    protected readonly workTasks = signal<WorkTask[]>([]);
    protected readonly creatingWork = signal(false);
    protected readonly activeTab = signal<Tab>('overview');

    protected invokeTargetId = '';
    protected invokeContent = '';
    protected workDescription = '';

    private agentNameCache: Record<string, string> = {};
    private unsubscribeWs: (() => void) | null = null;

    protected readonly agentSessions = computed(() => {
        const a = this.agent();
        if (!a) return [];
        return this.sessionService.sessions()
            .filter((s) => s.agentId === a.id)
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    });

    protected readonly agentRunningSessions = computed(() =>
        this.agentSessions().filter((s) => s.status === 'running'),
    );

    protected readonly totalCost = computed(() =>
        this.agentSessions().reduce((sum, s) => sum + s.totalCostUsd, 0),
    );

    protected readonly costByDay = computed(() => {
        const sessions = this.agentSessions();
        const dayMap = new Map<string, number>();
        for (const s of sessions) {
            const date = s.createdAt.slice(0, 10);
            dayMap.set(date, (dayMap.get(date) ?? 0) + s.totalCostUsd);
        }
        const entries = Array.from(dayMap.entries())
            .map(([date, cost]) => ({ date, cost }))
            .sort((a, b) => a.date.localeCompare(b.date))
            .slice(-14); // Last 14 days
        const max = Math.max(...entries.map((e) => e.cost), 0.001);
        return entries.map((e) => ({
            date: e.date,
            dateShort: e.date.slice(5),
            cost: e.cost,
            pct: (e.cost / max) * 100,
        }));
    });

    protected get tabs(): { key: Tab; label: string; count?: number }[] {
        return [
            { key: 'overview', label: 'Overview' },
            { key: 'sessions', label: 'Sessions', count: this.agentSessions().length },
            { key: 'messages', label: 'Messages', count: this.messages().length },
            { key: 'work-tasks', label: 'Work Tasks', count: this.workTasks().length },
            { key: 'persona', label: 'Persona' },
            { key: 'skills', label: 'Skills', count: this.agentBundles().length },
        ];
    }

    async ngOnInit(): Promise<void> {
        const id = this.route.snapshot.paramMap.get('id');
        if (!id) return;

        const agent = await this.agentService.getAgent(id);
        this.agent.set(agent);

        // Load sessions for this agent
        this.sessionService.loadSessions();

        if (agent.defaultProjectId) {
            this.projectService.getProject(agent.defaultProjectId)
                .then((p) => this.defaultProjectName.set(p.name))
                .catch(() => this.defaultProjectName.set(null));
        }

        if (agent.walletAddress) {
            this.agentService.getBalance(id)
                .then((info) => this.walletBalance.set(info.balance))
                .catch(() => {});
        }

        this.personaService.loadPersona(id).then((p) => this.persona.set(p)).catch(() => this.persona.set(null));
        this.skillBundleService.getAgentBundles(id).then((ab) => this.agentBundles.set(ab)).catch(() => this.agentBundles.set([]));
        this.skillBundleService.loadBundles().catch(() => {});
        this.agentService.getMessages(id).then((msgs) => this.messages.set(msgs)).catch(() => this.messages.set([]));

        await this.agentService.loadAgents();
        this.otherAgents.set(this.agentService.agents().filter((a) => a.id !== id));
        for (const a of this.agentService.agents()) {
            this.agentNameCache[a.id] = a.name;
        }

        this.workTaskService.loadTasks(id).then(() => this.workTasks.set(this.workTaskService.tasks())).catch(() => this.workTasks.set([]));
        this.workTaskService.startListening();

        this.unsubscribeWs = this.wsService.onMessage((msg: ServerWsMessage) => {
            if (msg.type === 'agent_balance' && msg.agentId === id) {
                this.walletBalance.set(msg.balance);
            }
            if (msg.type === 'work_task_update' && msg.task.agentId === id) {
                this.workTasks.update((tasks) => {
                    const idx = tasks.findIndex((t) => t.id === msg.task.id);
                    if (idx >= 0) { const copy = [...tasks]; copy[idx] = msg.task; return copy; }
                    return [msg.task, ...tasks];
                });
            }
            if (msg.type === 'agent_message_update') {
                const updated = msg.message;
                if (updated.fromAgentId === id || updated.toAgentId === id) {
                    this.messages.update((msgs) => {
                        const idx = msgs.findIndex((m) => m.id === updated.id);
                        if (idx >= 0) { const copy = [...msgs]; copy[idx] = updated; return copy; }
                        return [updated, ...msgs];
                    });
                }
            }
        });
    }

    ngOnDestroy(): void {
        this.unsubscribeWs?.();
        this.workTaskService.stopListening();
    }

    async onDelete(): Promise<void> {
        const a = this.agent();
        if (!a) return;
        await this.agentService.deleteAgent(a.id);
        this.router.navigate(['/agents']);
    }

    protected getAgentName(agentId: string): string {
        return this.agentNameCache[agentId] ?? agentId.slice(0, 8);
    }

    protected getBundleName(bundleId: string): string {
        return this.skillBundleService.bundles().find((b) => b.id === bundleId)?.name ?? bundleId.slice(0, 8);
    }

    async onCreateWork(): Promise<void> {
        const a = this.agent();
        if (!a || !this.workDescription) return;
        this.creatingWork.set(true);
        try {
            const task = await this.workTaskService.createTask({ agentId: a.id, description: this.workDescription, projectId: a.defaultProjectId ?? undefined });
            this.workTasks.update((tasks) => [task, ...tasks]);
            this.workDescription = '';
        } catch {} finally { this.creatingWork.set(false); }
    }

    async onCancelWork(taskId: string): Promise<void> {
        try {
            const task = await this.workTaskService.cancelTask(taskId);
            this.workTasks.update((tasks) => tasks.map((t) => (t.id === taskId ? task : t)));
        } catch {}
    }

    async onInvoke(): Promise<void> {
        const a = this.agent();
        if (!a || !this.invokeTargetId || !this.invokeContent) return;
        this.invoking.set(true);
        try {
            await this.agentService.invokeAgent(a.id, this.invokeTargetId, this.invokeContent);
            this.invokeContent = '';
            const msgs = await this.agentService.getMessages(a.id);
            this.messages.set(msgs);
        } catch {} finally { this.invoking.set(false); }
    }
}
