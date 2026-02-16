import { Component, inject, signal, computed, ChangeDetectionStrategy, OnInit, OnDestroy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SlicePipe } from '@angular/common';
import { WorkflowService } from '../../core/services/workflow.service';
import { AgentService } from '../../core/services/agent.service';
import { NotificationService } from '../../core/services/notification.service';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import type { WorkflowNode, WorkflowEdge, WorkflowRun } from '../../core/models/workflow.model';

@Component({
    selector: 'app-workflow-list',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, FormsModule, SlicePipe, RelativeTimePipe],
    template: `
        <div class="page">
            <div class="page-header">
                <h1>Workflows</h1>
                <button class="btn btn-primary" (click)="showCreateForm.set(!showCreateForm())">
                    {{ showCreateForm() ? 'Cancel' : '+ New Workflow' }}
                </button>
            </div>

            @if (showCreateForm()) {
                <div class="card create-form">
                    <h3>Create Workflow</h3>
                    <div class="form-group">
                        <label>Agent</label>
                        <select [(ngModel)]="formAgentId">
                            <option value="">Select agent...</option>
                            @for (agent of agentService.agents(); track agent.id) {
                                <option [value]="agent.id">{{ agent.name }}</option>
                            }
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Name</label>
                        <input [(ngModel)]="formName" placeholder="My Workflow" />
                    </div>
                    <div class="form-group">
                        <label>Description</label>
                        <textarea [(ngModel)]="formDescription" rows="2" placeholder="What does this workflow do?"></textarea>
                    </div>
                    <div class="form-group">
                        <label>Max Concurrency</label>
                        <input type="number" [(ngModel)]="formMaxConcurrency" min="1" max="10" />
                    </div>
                    <p class="hint">Nodes and edges can be configured after creation via the API or MCP tool.</p>
                    <button class="btn btn-primary" (click)="create()" [disabled]="creating()">
                        {{ creating() ? 'Creating...' : 'Create Workflow' }}
                    </button>
                </div>
            }

            @if (workflowService.loading()) {
                <div class="loading">Loading workflows...</div>
            }

            <div class="filter-bar">
                <button [class.active]="activeFilter() === 'all'" (click)="activeFilter.set('all')">All ({{ workflowService.workflows().length }})</button>
                <button [class.active]="activeFilter() === 'active'" (click)="activeFilter.set('active')">Active ({{ activeCount() }})</button>
                <button [class.active]="activeFilter() === 'paused'" (click)="activeFilter.set('paused')">Paused</button>
                <button [class.active]="activeFilter() === 'draft'" (click)="activeFilter.set('draft')">Draft</button>
            </div>

            @for (workflow of filteredWorkflows(); track workflow.id) {
                <div class="card workflow-card" (click)="toggleExpand(workflow.id)">
                    <div class="workflow-header">
                        <div class="workflow-info">
                            <span class="status-badge" [class]="'status-' + workflow.status">{{ workflow.status }}</span>
                            <strong>{{ workflow.name }}</strong>
                            <span class="meta">{{ workflow.nodes.length }} nodes, {{ workflow.edges.length }} edges</span>
                        </div>
                        <div class="workflow-actions" (click)="$event.stopPropagation()">
                            @if (workflow.status === 'active') {
                                <button class="btn btn-sm" (click)="pause(workflow.id)">Pause</button>
                                <button class="btn btn-sm btn-primary" (click)="trigger(workflow.id)">Trigger</button>
                            } @else if (workflow.status === 'paused' || workflow.status === 'draft') {
                                <button class="btn btn-sm btn-primary" (click)="activate(workflow.id)">Activate</button>
                            }
                            <button class="btn btn-sm btn-danger" (click)="remove(workflow.id)">Delete</button>
                        </div>
                    </div>
                    @if (workflow.description) {
                        <p class="description">{{ workflow.description }}</p>
                    }
                    <div class="workflow-meta">
                        <span>Created {{ workflow.createdAt | relativeTime }}</span>
                        <span>Max concurrency: {{ workflow.maxConcurrency }}</span>
                    </div>

                    @if (expandedWorkflowId() === workflow.id) {
                        <div class="expanded-section" (click)="$event.stopPropagation()">
                            <h4>Graph</h4>
                            <div class="node-list">
                                @for (node of workflow.nodes; track node.id) {
                                    <span class="node-chip" [class]="'node-' + node.type">{{ node.type }}: {{ node.label }}</span>
                                }
                            </div>

                            <h4>Recent Runs</h4>
                            @if (expandedRuns().length === 0) {
                                <p class="empty">No runs yet</p>
                            }
                            @for (run of expandedRuns(); track run.id) {
                                <div class="run-row">
                                    <span class="status-badge" [class]="'status-' + run.status">{{ run.status }}</span>
                                    <span>{{ run.id | slice:0:8 }}</span>
                                    <span>{{ run.startedAt | relativeTime }}</span>
                                    @if (run.error) {
                                        <span class="error-text">{{ run.error | slice:0:100 }}</span>
                                    }
                                    @if (run.status === 'running' || run.status === 'paused') {
                                        <button class="btn btn-sm btn-danger" (click)="cancelRun(run.id); $event.stopPropagation()">Cancel</button>
                                    }
                                    @if (run.status === 'paused') {
                                        <span class="paused-hint">Waiting for delay or external event</span>
                                    }
                                </div>
                            }
                        </div>
                    }
                </div>
            } @empty {
                @if (!workflowService.loading()) {
                    <div class="empty-state">
                        <p>No workflows yet. Create one to get started with graph-based orchestration.</p>
                    </div>
                }
            }
        </div>
    `,
    styles: `
        .page { padding: 1.5rem; max-width: 1200px; margin: 0 auto; }
        .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
        h1 { margin: 0; font-size: 1.5rem; }
        .card { background: var(--card-bg, #1e1e1e); border: 1px solid var(--border, #333); border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
        .create-form { margin-bottom: 1.5rem; }
        .form-group { margin-bottom: 0.75rem; }
        .form-group label { display: block; margin-bottom: 0.25rem; font-size: 0.85rem; color: var(--text-muted, #888); }
        .form-group input, .form-group select, .form-group textarea { width: 100%; padding: 0.5rem; background: var(--input-bg, #2a2a2a); border: 1px solid var(--border, #444); border-radius: 4px; color: var(--text, #eee); }
        .hint { font-size: 0.8rem; color: var(--text-muted, #888); margin: 0.5rem 0; }
        .loading { text-align: center; padding: 2rem; color: var(--text-muted, #888); }
        .filter-bar { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
        .filter-bar button { padding: 0.35rem 0.75rem; border: 1px solid var(--border, #444); border-radius: 4px; background: transparent; color: var(--text, #eee); cursor: pointer; }
        .filter-bar button.active { background: var(--primary, #4a9eff); border-color: var(--primary, #4a9eff); }
        .workflow-card { cursor: pointer; transition: border-color 0.15s; }
        .workflow-card:hover { border-color: var(--primary, #4a9eff); }
        .workflow-header { display: flex; justify-content: space-between; align-items: center; }
        .workflow-info { display: flex; align-items: center; gap: 0.5rem; }
        .workflow-actions { display: flex; gap: 0.35rem; }
        .description { font-size: 0.85rem; color: var(--text-muted, #aaa); margin: 0.5rem 0 0; }
        .workflow-meta { display: flex; gap: 1rem; font-size: 0.75rem; color: var(--text-muted, #888); margin-top: 0.5rem; }
        .meta { font-size: 0.8rem; color: var(--text-muted, #888); }
        .status-badge { padding: 0.15rem 0.5rem; border-radius: 10px; font-size: 0.7rem; text-transform: uppercase; font-weight: 600; }
        .status-draft { background: #2a2a3a; color: #94a3b8; }
        .status-active { background: #1a3a1a; color: #4ade80; }
        .status-running { background: #1a2a3a; color: #60a5fa; }
        .status-paused { background: #3a3a1a; color: #facc15; }
        .status-completed { background: #1a3a1a; color: #4ade80; }
        .status-failed { background: #3a1a1a; color: #f87171; }
        .status-cancelled { background: #2a2a2a; color: #888; }
        .expanded-section { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border, #333); }
        .expanded-section h4 { margin: 0.75rem 0 0.5rem; font-size: 0.9rem; }
        .node-list { display: flex; flex-wrap: wrap; gap: 0.35rem; }
        .node-chip { padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.75rem; background: var(--input-bg, #2a2a2a); }
        .node-start { background: #1a3a1a; color: #4ade80; }
        .node-end { background: #3a1a1a; color: #f87171; }
        .node-agent_session { background: #3a2a1a; color: #fb923c; }
        .node-work_task { background: #1a2a3a; color: #60a5fa; }
        .node-condition { background: #3a3a1a; color: #facc15; }
        .node-delay { background: #2a2a2a; color: #94a3b8; }
        .node-webhook_wait { background: #2a2a3a; color: #a78bfa; }
        .node-transform { background: #1a3a3a; color: #2dd4bf; }
        .node-parallel { background: #2a1a3a; color: #c084fc; }
        .node-join { background: #2a1a3a; color: #c084fc; }
        .run-row { display: flex; align-items: center; gap: 0.5rem; padding: 0.35rem 0; font-size: 0.8rem; }
        .error-text { color: var(--error, #f87171); font-size: 0.75rem; }
        .paused-hint { font-size: 0.7rem; color: var(--warning, #fb923c); font-style: italic; }
        .empty { color: var(--text-muted, #888); font-size: 0.85rem; }
        .empty-state { text-align: center; padding: 3rem; color: var(--text-muted, #888); }
        .btn { padding: 0.4rem 0.8rem; border-radius: 4px; border: 1px solid var(--border, #444); background: transparent; color: var(--text, #eee); cursor: pointer; font-size: 0.85rem; }
        .btn:hover { background: var(--hover-bg, #333); }
        .btn-primary { background: var(--primary, #4a9eff); border-color: var(--primary, #4a9eff); color: white; }
        .btn-primary:hover { opacity: 0.9; }
        .btn-danger { color: var(--error, #f87171); border-color: var(--error, #f87171); }
        .btn-sm { padding: 0.2rem 0.5rem; font-size: 0.75rem; }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    `,
})
export class WorkflowListComponent implements OnInit, OnDestroy {
    protected readonly workflowService = inject(WorkflowService);
    protected readonly agentService = inject(AgentService);
    private readonly notifications = inject(NotificationService);

    readonly activeFilter = signal<'all' | 'active' | 'paused' | 'draft'>('all');
    readonly showCreateForm = signal(false);
    readonly creating = signal(false);
    readonly expandedWorkflowId = signal<string | null>(null);
    readonly expandedRuns = signal<WorkflowRun[]>([]);

    // Form fields
    formAgentId = '';
    formName = '';
    formDescription = '';
    formMaxConcurrency = 1;

    readonly activeCount = computed(() =>
        this.workflowService.workflows().filter((w) => w.status === 'active').length,
    );

    readonly filteredWorkflows = computed(() => {
        const filter = this.activeFilter();
        const all = this.workflowService.workflows();
        if (filter === 'all') return all;
        return all.filter((w) => w.status === filter);
    });

    ngOnInit(): void {
        this.workflowService.loadWorkflows();
        this.workflowService.loadRuns();
        this.workflowService.startListening();
        this.agentService.loadAgents();
    }

    ngOnDestroy(): void {
        this.workflowService.stopListening();
    }

    async toggleExpand(workflowId: string): Promise<void> {
        if (this.expandedWorkflowId() === workflowId) {
            this.expandedWorkflowId.set(null);
            this.expandedRuns.set([]);
            return;
        }
        this.expandedWorkflowId.set(workflowId);
        try {
            await this.workflowService.loadRuns(workflowId, 10);
            this.expandedRuns.set(
                this.workflowService.runs().filter((r) => r.workflowId === workflowId).slice(0, 10),
            );
        } catch {
            this.expandedRuns.set([]);
        }
    }

    async create(): Promise<void> {
        if (!this.formAgentId || !this.formName) {
            this.notifications.error('Please fill in agent and name');
            return;
        }

        this.creating.set(true);
        try {
            // Create with minimal start -> end graph
            const startNode: WorkflowNode = { id: 'start-1', type: 'start', label: 'Start', config: {} };
            const endNode: WorkflowNode = { id: 'end-1', type: 'end', label: 'End', config: {} };
            const edge: WorkflowEdge = { id: 'edge-1', sourceNodeId: 'start-1', targetNodeId: 'end-1' };

            await this.workflowService.createWorkflow({
                agentId: this.formAgentId,
                name: this.formName,
                description: this.formDescription,
                nodes: [startNode, endNode],
                edges: [edge],
                maxConcurrency: this.formMaxConcurrency,
            });

            this.notifications.success('Workflow created');
            this.showCreateForm.set(false);
            this.resetForm();
        } catch (err) {
            this.notifications.error('Failed to create workflow');
        } finally {
            this.creating.set(false);
        }
    }

    async activate(id: string): Promise<void> {
        try {
            await this.workflowService.updateWorkflow(id, { status: 'active' });
            this.notifications.success('Workflow activated');
        } catch {
            this.notifications.error('Failed to activate workflow');
        }
    }

    async pause(id: string): Promise<void> {
        try {
            await this.workflowService.updateWorkflow(id, { status: 'paused' });
            this.notifications.success('Workflow paused');
        } catch {
            this.notifications.error('Failed to pause workflow');
        }
    }

    async trigger(id: string): Promise<void> {
        try {
            const run = await this.workflowService.triggerWorkflow(id);
            this.notifications.success(`Workflow run started: ${run.id.slice(0, 8)}`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to trigger workflow';
            this.notifications.error(msg);
        }
    }

    async cancelRun(runId: string): Promise<void> {
        try {
            await this.workflowService.cancelRun(runId);
            this.notifications.success('Run cancelled');
        } catch {
            this.notifications.error('Failed to cancel run');
        }
    }

    async remove(id: string): Promise<void> {
        try {
            await this.workflowService.deleteWorkflow(id);
            this.notifications.success('Workflow deleted');
        } catch {
            this.notifications.error('Failed to delete workflow');
        }
    }

    private resetForm(): void {
        this.formAgentId = '';
        this.formName = '';
        this.formDescription = '';
        this.formMaxConcurrency = 1;
    }
}
