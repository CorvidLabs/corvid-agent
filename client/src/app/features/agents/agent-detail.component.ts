import { Component, ChangeDetectionStrategy, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AgentService } from '../../core/services/agent.service';
import { ProjectService } from '../../core/services/project.service';
import { WebSocketService } from '../../core/services/websocket.service';
import { WorkTaskService } from '../../core/services/work-task.service';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import type { Agent } from '../../core/models/agent.model';
import type { AgentMessage } from '../../core/models/agent-message.model';
import type { WorkTask } from '../../core/models/work-task.model';
import type { ServerWsMessage } from '../../core/models/ws-message.model';

@Component({
    selector: 'app-agent-detail',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, RelativeTimePipe, DecimalPipe, FormsModule],
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
                            <dt>Balance</dt>
                            <dd>{{ walletBalance() / 1000000 | number:'1.2-6' }} ALGO</dd>
                            <dt>Total Funded</dt>
                            <dd>{{ a.walletFundedAlgo | number:'1.2-2' }} ALGO</dd>
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

                @if (a.allowedTools) {
                    <div class="detail__section">
                        <h3>Allowed Tools</h3>
                        <p>{{ a.allowedTools }}</p>
                    </div>
                }

                <div class="detail__section">
                    <h3>Messages</h3>
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

                    <div class="invoke-form" style="margin-bottom: 2rem">
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
                            aria-label="Message content"
                        ></textarea>
                        <button
                            class="btn btn--primary"
                            [disabled]="!invokeTargetId || !invokeContent || invoking()"
                            (click)="onInvoke()"
                        >{{ invoking() ? 'Sending...' : 'Send Message' }}</button>
                    </div>
                </div>

                <div class="detail__section">
                    <h3>Work Tasks</h3>
                    <div class="work-form">
                        <textarea
                            class="invoke-textarea"
                            [(ngModel)]="workDescription"
                            placeholder="Describe the task (e.g. 'Fix the login button alignment')..."
                            rows="3"
                            aria-label="Work task description"
                        ></textarea>
                        <button
                            class="btn btn--primary"
                            [disabled]="!workDescription || creatingWork()"
                            (click)="onCreateWork()"
                        >{{ creatingWork() ? 'Starting...' : 'Start Work' }}</button>
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
                </div>
            </div>
        } @else {
            <div class="page"><p>Loading...</p></div>
        }
    `,
    styles: `
        .page { padding: 1.5rem; }
        .page__header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; }
        .page__header h2 { margin: 0; color: var(--text-primary); }
        .page__desc { margin: 0.25rem 0 0; color: var(--text-secondary); }
        .page__actions { display: flex; gap: 0.5rem; }
        .btn {
            padding: 0.5rem 1rem; border-radius: var(--radius); font-size: 0.8rem; font-weight: 600;
            cursor: pointer; border: 1px solid; text-decoration: none; font-family: inherit;
            text-transform: uppercase; letter-spacing: 0.05em; transition: background 0.15s, box-shadow 0.15s;
        }
        .btn--secondary { background: transparent; color: var(--text-secondary); border-color: var(--border-bright); }
        .btn--secondary:hover { background: var(--bg-hover); color: var(--text-primary); }
        .btn--danger { background: transparent; color: var(--accent-red); border-color: var(--accent-red); }
        .btn--danger:hover { background: var(--accent-red-dim); }
        .detail__info dl { display: grid; grid-template-columns: auto 1fr; gap: 0.25rem 1rem; }
        .detail__info dt { font-weight: 600; color: var(--text-secondary); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.03em; }
        .detail__info dd { margin: 0; color: var(--text-primary); }
        .detail__section { margin-top: 2rem; }
        .detail__section h3 { margin: 0 0 0.75rem; color: var(--text-primary); }
        .detail__code {
            background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius);
            padding: 1rem; font-size: 0.8rem; white-space: pre-wrap; overflow-x: auto; color: var(--accent-green);
        }
        .detail__empty { color: var(--text-secondary); font-size: 0.85rem; }
        .messages-list { display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1.5rem; }
        .message-row {
            background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius);
            padding: 0.75rem; font-size: 0.85rem;
        }
        .message-row__header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem; }
        .message-row__direction { color: var(--text-secondary); font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.03em; }
        .message-row__status {
            font-size: 0.7rem; padding: 1px 6px; border-radius: var(--radius-sm); font-weight: 600;
            text-transform: uppercase; letter-spacing: 0.05em;
            background: var(--bg-raised); color: var(--text-secondary); border: 1px solid var(--border);
        }
        .message-row__status[data-status="completed"] { color: var(--accent-green); border-color: var(--accent-green); }
        .message-row__status[data-status="processing"] { color: var(--accent-cyan); border-color: var(--accent-cyan); }
        .message-row__status[data-status="failed"] { color: var(--accent-red); border-color: var(--accent-red); }
        .message-row__payment { font-size: 0.75rem; color: var(--accent-green); font-weight: 600; }
        .message-row__content { margin: 0.25rem 0; color: var(--text-primary); }
        .message-row__response { margin: 0.25rem 0; color: var(--accent-cyan); font-style: italic; }
        .message-row__session { font-size: 0.75rem; color: var(--accent-cyan); text-decoration: none; }
        .message-row__session:hover { text-decoration: underline; }
        .invoke-form { margin-top: 1rem; display: flex; flex-direction: column; gap: 0.5rem; max-width: 500px; }
        .invoke-form h4 { margin: 0; color: var(--text-primary); }
        .invoke-select, .invoke-textarea {
            padding: 0.5rem; border: 1px solid var(--border-bright); border-radius: var(--radius);
            font-size: 0.85rem; font-family: inherit; background: var(--bg-input); color: var(--text-primary);
        }
        .invoke-select:focus, .invoke-textarea:focus { border-color: var(--accent-cyan); box-shadow: var(--glow-cyan); outline: none; }
        .invoke-textarea { resize: vertical; min-height: 5em; line-height: 1.5; }
        .btn--primary {
            padding: 0.5rem 1rem; border-radius: var(--radius); font-size: 0.8rem; font-weight: 600;
            cursor: pointer; border: 1px solid var(--accent-cyan); background: var(--accent-cyan-dim);
            color: var(--accent-cyan); font-family: inherit; text-transform: uppercase; letter-spacing: 0.05em;
            transition: background 0.15s;
        }
        .btn--primary:hover:not(:disabled) { background: rgba(0, 229, 255, 0.15); }
        .btn--primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn--sm { padding: 0.25rem 0.5rem; font-size: 0.7rem; margin-top: 0.5rem; }
        .work-form { display: flex; flex-direction: column; gap: 0.5rem; max-width: 500px; margin-bottom: 1rem; }
        .work-tasks-list { display: flex; flex-direction: column; gap: 0.75rem; }
        .work-task-row {
            background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius);
            padding: 0.75rem; font-size: 0.85rem;
        }
        .work-task-row__header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem; }
        .work-task-row__status {
            font-size: 0.7rem; padding: 1px 6px; border-radius: var(--radius-sm); font-weight: 600;
            text-transform: uppercase; letter-spacing: 0.05em;
            background: var(--bg-raised); color: var(--text-secondary); border: 1px solid var(--border);
        }
        .work-task-row__status[data-status="completed"] { color: var(--accent-green); border-color: var(--accent-green); }
        .work-task-row__status[data-status="running"] { color: var(--accent-cyan); border-color: var(--accent-cyan); }
        .work-task-row__status[data-status="branching"] { color: var(--accent-yellow, #ffc107); border-color: var(--accent-yellow, #ffc107); }
        .work-task-row__status[data-status="failed"] { color: var(--accent-red); border-color: var(--accent-red); }
        .work-task-row__source { font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; }
        .work-task-row__time { font-size: 0.7rem; color: var(--text-secondary); margin-left: auto; }
        .work-task-row__desc { margin: 0.25rem 0; color: var(--text-primary); }
        .work-task-row__branch { margin: 0.25rem 0; font-size: 0.75rem; }
        .work-task-row__branch code { color: var(--accent-cyan); font-size: 0.75rem; }
        .work-task-row__pr { display: block; font-size: 0.75rem; color: var(--accent-green); text-decoration: none; margin: 0.25rem 0; word-break: break-all; }
        .work-task-row__pr:hover { text-decoration: underline; }
        .work-task-row__error { margin: 0.25rem 0; font-size: 0.8rem; color: var(--accent-red); }
        .work-task-row__session { font-size: 0.75rem; color: var(--accent-cyan); text-decoration: none; }
        .work-task-row__session:hover { text-decoration: underline; }
    `,
})
export class AgentDetailComponent implements OnInit, OnDestroy {
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly agentService = inject(AgentService);
    private readonly projectService = inject(ProjectService);
    private readonly wsService = inject(WebSocketService);
    private readonly workTaskService = inject(WorkTaskService);

    protected readonly agent = signal<Agent | null>(null);
    protected readonly defaultProjectName = signal<string | null>(null);
    protected readonly walletBalance = signal(0);
    protected readonly messages = signal<AgentMessage[]>([]);
    protected readonly otherAgents = signal<Agent[]>([]);
    protected readonly invoking = signal(false);
    protected readonly workTasks = signal<WorkTask[]>([]);
    protected readonly creatingWork = signal(false);
    protected invokeTargetId = '';
    protected invokeContent = '';
    protected workDescription = '';

    private agentNameCache: Record<string, string> = {};
    private unsubscribeWs: (() => void) | null = null;

    async ngOnInit(): Promise<void> {
        const id = this.route.snapshot.paramMap.get('id');
        if (!id) return;

        const agent = await this.agentService.getAgent(id);
        this.agent.set(agent);

        // Load default project name
        if (agent.defaultProjectId) {
            this.projectService.getProject(agent.defaultProjectId)
                .then((p) => this.defaultProjectName.set(p.name))
                .catch(() => this.defaultProjectName.set(null));
        }

        // Load wallet balance if agent has a wallet
        if (agent.walletAddress) {
            const balanceInfo = await this.agentService.getBalance(id);
            this.walletBalance.set(balanceInfo.balance);
        }

        // Load messages — on failure, leave messages empty rather than silently failing
        this.agentService.getMessages(id).then((msgs) => this.messages.set(msgs)).catch(() => {
            this.messages.set([]);
        });

        // Load other agents for invoke form
        await this.agentService.loadAgents();
        this.otherAgents.set(this.agentService.agents().filter((a) => a.id !== id));

        // Build agent name cache
        for (const a of this.agentService.agents()) {
            this.agentNameCache[a.id] = a.name;
        }

        // Load work tasks — on failure, leave tasks empty rather than silently failing
        this.workTaskService.loadTasks(id).then(() => {
            this.workTasks.set(this.workTaskService.tasks());
        }).catch(() => {
            this.workTasks.set([]);
        });
        this.workTaskService.startListening();

        // Subscribe to live balance, message, and work task updates
        this.unsubscribeWs = this.wsService.onMessage((msg: ServerWsMessage) => {
            if (msg.type === 'agent_balance' && msg.agentId === id) {
                this.walletBalance.set(msg.balance);
            }
            if (msg.type === 'work_task_update' && msg.task.agentId === id) {
                this.workTasks.update((tasks) => {
                    const idx = tasks.findIndex((t) => t.id === msg.task.id);
                    if (idx >= 0) {
                        const copy = [...tasks];
                        copy[idx] = msg.task;
                        return copy;
                    }
                    return [msg.task, ...tasks];
                });
            }
            if (msg.type === 'agent_message_update') {
                const updated = msg.message;
                if (updated.fromAgentId === id || updated.toAgentId === id) {
                    this.messages.update((msgs) => {
                        const idx = msgs.findIndex((m) => m.id === updated.id);
                        if (idx >= 0) {
                            const copy = [...msgs];
                            copy[idx] = updated;
                            return copy;
                        }
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

    async onCreateWork(): Promise<void> {
        const a = this.agent();
        if (!a || !this.workDescription) return;

        this.creatingWork.set(true);
        try {
            const task = await this.workTaskService.createTask({
                agentId: a.id,
                description: this.workDescription,
                projectId: a.defaultProjectId ?? undefined,
            });
            this.workTasks.update((tasks) => [task, ...tasks]);
            this.workDescription = '';
        } catch {
            // Error handling via WS
        } finally {
            this.creatingWork.set(false);
        }
    }

    async onCancelWork(taskId: string): Promise<void> {
        try {
            const task = await this.workTaskService.cancelTask(taskId);
            this.workTasks.update((tasks) => tasks.map((t) => (t.id === taskId ? task : t)));
        } catch {
            // Error handling via WS
        }
    }

    async onInvoke(): Promise<void> {
        const a = this.agent();
        if (!a || !this.invokeTargetId || !this.invokeContent) return;

        this.invoking.set(true);
        try {
            await this.agentService.invokeAgent(a.id, this.invokeTargetId, this.invokeContent);
            this.invokeContent = '';
            // Refresh messages
            const msgs = await this.agentService.getMessages(a.id);
            this.messages.set(msgs);
        } catch {
            // Error handling done via WS error messages
        } finally {
            this.invoking.set(false);
        }
    }
}
