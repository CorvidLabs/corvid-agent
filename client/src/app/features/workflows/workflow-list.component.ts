import { Component, inject, signal, computed, ChangeDetectionStrategy, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SlicePipe } from '@angular/common';
import { WorkflowService } from '../../core/services/workflow.service';
import { AgentService } from '../../core/services/agent.service';
import { NotificationService } from '../../core/services/notification.service';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import type { Workflow, WorkflowNode, WorkflowEdge, WorkflowNodeType, WorkflowRun } from '../../core/models/workflow.model';

@Component({
    selector: 'app-workflow-list',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule, SlicePipe, RelativeTimePipe],
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

                            <!-- Flow Visualization -->
                            <h4>Flow</h4>
                            <div class="flow-viz">
                                @for (step of topoSortedNodes(); track step.id; let last = $last) {
                                    <span class="node-chip" [class]="'node-' + step.type">{{ step.label }}</span>
                                    @if (!last) {
                                        <span class="flow-arrow">&#x2193;</span>
                                    }
                                }
                                @if (topoSortedNodes().length === 0) {
                                    <span class="empty">No nodes</span>
                                }
                            </div>

                            <!-- Nodes Editor -->
                            <h4>Nodes</h4>
                            <div class="editor-section">
                                @for (node of editNodes(); track node.id) {
                                    <div class="node-row">
                                        <span class="node-chip" [class]="'node-' + node.type">{{ node.type }}</span>
                                        <span class="node-label">{{ node.label }}</span>
                                        <span class="config-summary">{{ configSummary(node) }}</span>
                                        @if (node.type !== 'start' && node.type !== 'end') {
                                            <button class="btn btn-sm" (click)="startEditNode(node.id)">Edit</button>
                                            <button class="btn btn-sm btn-danger" (click)="removeNode(node.id)">Remove</button>
                                        }
                                    </div>
                                    @if (editingNodeId() === node.id) {
                                        <div class="inline-edit-form">
                                            <div class="form-group">
                                                <label>Label</label>
                                                <input [ngModel]="node.label" (ngModelChange)="updateNodeLabel(node.id, $event)" />
                                            </div>
                                            @if (node.type === 'agent_session') {
                                                <div class="form-group">
                                                    <label>Prompt</label>
                                                    <textarea [ngModel]="node.config.prompt ?? ''" (ngModelChange)="updateNodeConfig(node.id, 'prompt', $event)" rows="3" [placeholder]="'Agent prompt (supports {{prev.output}})'"></textarea>
                                                </div>
                                                <div class="form-group">
                                                    <label>Max Turns</label>
                                                    <input type="number" [ngModel]="node.config.maxTurns ?? ''" (ngModelChange)="updateNodeConfig(node.id, 'maxTurns', +$event)" min="1" />
                                                </div>
                                            }
                                            @if (node.type === 'work_task') {
                                                <div class="form-group">
                                                    <label>Description</label>
                                                    <textarea [ngModel]="node.config.description ?? ''" (ngModelChange)="updateNodeConfig(node.id, 'description', $event)" rows="3" placeholder="Task description"></textarea>
                                                </div>
                                            }
                                            @if (node.type === 'condition') {
                                                <div class="form-group">
                                                    <label>Expression</label>
                                                    <input [ngModel]="node.config.expression ?? ''" (ngModelChange)="updateNodeConfig(node.id, 'expression', $event)" placeholder="prev.output.includes('success')" />
                                                </div>
                                            }
                                            @if (node.type === 'delay') {
                                                <div class="form-group">
                                                    <label>Delay (ms)</label>
                                                    <input type="number" [ngModel]="node.config.delayMs ?? ''" (ngModelChange)="updateNodeConfig(node.id, 'delayMs', +$event)" min="0" />
                                                </div>
                                            }
                                            @if (node.type === 'webhook_wait') {
                                                <div class="form-group">
                                                    <label>Webhook Event</label>
                                                    <input [ngModel]="node.config.webhookEvent ?? ''" (ngModelChange)="updateNodeConfig(node.id, 'webhookEvent', $event)" placeholder="event_type" />
                                                </div>
                                                <div class="form-group">
                                                    <label>Timeout (ms)</label>
                                                    <input type="number" [ngModel]="node.config.timeoutMs ?? ''" (ngModelChange)="updateNodeConfig(node.id, 'timeoutMs', +$event)" min="0" />
                                                </div>
                                            }
                                            @if (node.type === 'transform') {
                                                <div class="form-group">
                                                    <label>Template</label>
                                                    <textarea [ngModel]="node.config.template ?? ''" (ngModelChange)="updateNodeConfig(node.id, 'template', $event)" rows="3" [placeholder]="'Template with {{var}} placeholders'"></textarea>
                                                </div>
                                            }
                                            <button class="btn btn-sm" (click)="editingNodeId.set(null)">Done</button>
                                        </div>
                                    }
                                }

                                @if (showAddNode()) {
                                    <div class="inline-edit-form add-form">
                                        <div class="form-group">
                                            <label>Type</label>
                                            <select [ngModel]="newNodeType()" (ngModelChange)="newNodeType.set($event)">
                                                @for (nt of addableNodeTypes; track nt) {
                                                    <option [value]="nt">{{ nt }}</option>
                                                }
                                            </select>
                                        </div>
                                        <div class="form-group">
                                            <label>Label</label>
                                            <input [(ngModel)]="newNodeLabel" placeholder="Node label" />
                                        </div>
                                        @if (newNodeType() === 'agent_session') {
                                            <div class="form-group">
                                                <label>Prompt</label>
                                                <textarea [(ngModel)]="newNodePrompt" rows="2" placeholder="Agent prompt"></textarea>
                                            </div>
                                            <div class="form-group">
                                                <label>Max Turns</label>
                                                <input type="number" [(ngModel)]="newNodeMaxTurns" min="1" />
                                            </div>
                                        }
                                        @if (newNodeType() === 'work_task') {
                                            <div class="form-group">
                                                <label>Description</label>
                                                <textarea [(ngModel)]="newNodeDescription" rows="2" placeholder="Task description"></textarea>
                                            </div>
                                        }
                                        @if (newNodeType() === 'condition') {
                                            <div class="form-group">
                                                <label>Expression</label>
                                                <input [(ngModel)]="newNodeExpression" placeholder="JS-like expression" />
                                            </div>
                                        }
                                        @if (newNodeType() === 'delay') {
                                            <div class="form-group">
                                                <label>Delay (ms)</label>
                                                <input type="number" [(ngModel)]="newNodeDelayMs" min="0" />
                                            </div>
                                        }
                                        @if (newNodeType() === 'webhook_wait') {
                                            <div class="form-group">
                                                <label>Webhook Event</label>
                                                <input [(ngModel)]="newNodeWebhookEvent" placeholder="event_type" />
                                            </div>
                                            <div class="form-group">
                                                <label>Timeout (ms)</label>
                                                <input type="number" [(ngModel)]="newNodeTimeoutMs" min="0" />
                                            </div>
                                        }
                                        @if (newNodeType() === 'transform') {
                                            <div class="form-group">
                                                <label>Template</label>
                                                <textarea [(ngModel)]="newNodeTemplate" rows="2" [placeholder]="'Template with {{var}}'"></textarea>
                                            </div>
                                        }
                                        <div class="form-row">
                                            <button class="btn btn-sm btn-primary" (click)="addNode()">Add</button>
                                            <button class="btn btn-sm" (click)="showAddNode.set(false)">Cancel</button>
                                        </div>
                                    </div>
                                } @else {
                                    <button class="btn btn-sm add-btn" (click)="showAddNode.set(true)">+ Add Node</button>
                                }
                            </div>

                            <!-- Edges Editor -->
                            <h4>Edges</h4>
                            <div class="editor-section">
                                @for (edge of editEdges(); track edge.id) {
                                    <div class="edge-row">
                                        <span class="node-chip" [class]="'node-' + getNodeType(edge.sourceNodeId)">{{ getNodeLabel(edge.sourceNodeId) }}</span>
                                        <span class="edge-arrow">&rarr;</span>
                                        <span class="node-chip" [class]="'node-' + getNodeType(edge.targetNodeId)">{{ getNodeLabel(edge.targetNodeId) }}</span>
                                        @if (edge.condition) {
                                            <span class="edge-condition">when: {{ edge.condition }}</span>
                                        }
                                        <button class="btn btn-sm btn-danger" (click)="removeEdge(edge.id)">Remove</button>
                                    </div>
                                }
                                <div class="edge-add-row">
                                    <select [ngModel]="newEdgeSource()" (ngModelChange)="newEdgeSource.set($event)">
                                        <option value="">Source...</option>
                                        @for (node of sourceNodes(); track node.id) {
                                            <option [value]="node.id">{{ node.label }}</option>
                                        }
                                    </select>
                                    <span class="edge-arrow">&rarr;</span>
                                    <select [ngModel]="newEdgeTarget()" (ngModelChange)="newEdgeTarget.set($event)">
                                        <option value="">Target...</option>
                                        @for (node of targetNodes(); track node.id) {
                                            <option [value]="node.id">{{ node.label }}</option>
                                        }
                                    </select>
                                    <input [(ngModel)]="newEdgeCondition" placeholder="Condition (optional)" class="edge-condition-input" />
                                    <button class="btn btn-sm btn-primary" (click)="addEdge()" [disabled]="!newEdgeSource() || !newEdgeTarget()">Connect</button>
                                </div>
                            </div>

                            <!-- Save / Discard Bar -->
                            @if (editDirty()) {
                                <div class="save-bar">
                                    <span class="save-bar-label">Unsaved changes</span>
                                    <button class="btn btn-sm" (click)="discardChanges(workflow)">Discard</button>
                                    <button class="btn btn-sm btn-primary" (click)="saveGraph(workflow.id)" [disabled]="saving()">
                                        {{ saving() ? 'Saving...' : 'Save' }}
                                    </button>
                                </div>
                            }

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
        .form-group input, .form-group select, .form-group textarea { width: 100%; padding: 0.5rem; background: var(--input-bg, #2a2a2a); border: 1px solid var(--border, #444); border-radius: 4px; color: var(--text, #eee); font-family: inherit; font-size: 0.85rem; }
        .form-group textarea { resize: vertical; }
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

        /* Flow visualization */
        .flow-viz { display: flex; flex-direction: column; align-items: center; gap: 0.15rem; padding: 0.75rem; background: var(--bg-raised, #252525); border-radius: 6px; margin-bottom: 0.5rem; }
        .flow-arrow { color: var(--text-muted, #888); font-size: 0.9rem; line-height: 1; }

        /* Node chips */
        .node-chip { padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.75rem; background: var(--input-bg, #2a2a2a); white-space: nowrap; }
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

        /* Editor sections */
        .editor-section { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 0.5rem; }

        /* Node rows */
        .node-row { display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.5rem; background: var(--bg-raised, #252525); border-radius: 4px; font-size: 0.8rem; }
        .node-label { font-weight: 500; }
        .config-summary { color: var(--text-muted, #888); font-size: 0.7rem; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        /* Edge rows */
        .edge-row { display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.5rem; background: var(--bg-raised, #252525); border-radius: 4px; font-size: 0.8rem; }
        .edge-arrow { color: var(--text-muted, #888); font-size: 0.85rem; }
        .edge-condition { color: var(--accent-cyan, #00e5ff); font-size: 0.7rem; flex: 1; }
        .edge-add-row { display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.5rem; background: var(--bg-raised, #252525); border-radius: 4px; }
        .edge-add-row select { padding: 0.3rem; background: var(--input-bg, #2a2a2a); border: 1px solid var(--border, #444); border-radius: 4px; color: var(--text, #eee); font-size: 0.75rem; min-width: 100px; }
        .edge-condition-input { padding: 0.3rem; background: var(--input-bg, #2a2a2a); border: 1px solid var(--border, #444); border-radius: 4px; color: var(--text, #eee); font-size: 0.75rem; flex: 1; min-width: 80px; }

        /* Inline edit form */
        .inline-edit-form { padding: 0.75rem; background: var(--bg-raised, #252525); border: 1px solid var(--border, #444); border-radius: 6px; margin-bottom: 0.25rem; }
        .inline-edit-form .form-group { margin-bottom: 0.5rem; }
        .inline-edit-form .form-group label { font-size: 0.7rem; color: var(--text-muted, #888); text-transform: uppercase; letter-spacing: 0.03em; }
        .inline-edit-form .form-group input,
        .inline-edit-form .form-group select,
        .inline-edit-form .form-group textarea { width: 100%; padding: 0.4rem; background: var(--input-bg, #2a2a2a); border: 1px solid var(--border, #444); border-radius: 4px; color: var(--text, #eee); font-size: 0.8rem; font-family: inherit; }
        .form-row { display: flex; gap: 0.35rem; }
        .add-btn { margin-top: 0.25rem; }

        /* Save bar */
        .save-bar { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; background: var(--accent-cyan-dim, rgba(0,229,255,0.08)); border: 1px solid var(--accent-cyan, #00e5ff); border-radius: 6px; margin: 0.75rem 0; }
        .save-bar-label { font-size: 0.75rem; color: var(--accent-cyan, #00e5ff); flex: 1; font-weight: 600; }

        .run-row { display: flex; align-items: center; gap: 0.5rem; padding: 0.35rem 0; font-size: 0.8rem; }
        .error-text { color: var(--error, #f87171); font-size: 0.75rem; }
        .paused-hint { font-size: 0.7rem; color: var(--warning, #fb923c); font-style: italic; }
        .empty { color: var(--text-muted, #888); font-size: 0.85rem; }
        .empty-state { text-align: center; padding: 3rem; color: var(--text-muted, #888); }
        .btn { padding: 0.4rem 0.8rem; border-radius: 4px; border: 1px solid var(--border, #444); background: transparent; color: var(--text, #eee); cursor: pointer; font-size: 0.85rem; font-family: inherit; }
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

    // Graph editor state
    readonly editNodes = signal<WorkflowNode[]>([]);
    readonly editEdges = signal<WorkflowEdge[]>([]);
    readonly editDirty = signal(false);
    readonly saving = signal(false);
    readonly editingNodeId = signal<string | null>(null);
    readonly showAddNode = signal(false);
    readonly newNodeType = signal<WorkflowNodeType>('agent_session');
    readonly newEdgeSource = signal('');
    readonly newEdgeTarget = signal('');

    // Add-node form fields
    newNodeLabel = '';
    newNodePrompt = '';
    newNodeMaxTurns = 10;
    newNodeDescription = '';
    newNodeExpression = '';
    newNodeDelayMs = 1000;
    newNodeWebhookEvent = '';
    newNodeTimeoutMs = 30000;
    newNodeTemplate = '';
    newEdgeCondition = '';

    // Form fields
    formAgentId = '';
    formName = '';
    formDescription = '';
    formMaxConcurrency = 1;

    readonly addableNodeTypes: WorkflowNodeType[] = [
        'agent_session', 'work_task', 'condition', 'delay',
        'webhook_wait', 'transform', 'parallel', 'join',
    ];

    readonly activeCount = computed(() =>
        this.workflowService.workflows().filter((w) => w.status === 'active').length,
    );

    readonly filteredWorkflows = computed(() => {
        const filter = this.activeFilter();
        const all = this.workflowService.workflows();
        if (filter === 'all') return all;
        return all.filter((w) => w.status === filter);
    });

    readonly topoSortedNodes = computed(() => {
        const nodes = this.editNodes();
        const edges = this.editEdges();
        if (nodes.length === 0) return [];

        const adj = new Map<string, string[]>();
        const inDeg = new Map<string, number>();
        for (const n of nodes) {
            adj.set(n.id, []);
            inDeg.set(n.id, 0);
        }
        for (const e of edges) {
            adj.get(e.sourceNodeId)?.push(e.targetNodeId);
            inDeg.set(e.targetNodeId, (inDeg.get(e.targetNodeId) ?? 0) + 1);
        }
        const queue = nodes.filter((n) => (inDeg.get(n.id) ?? 0) === 0).map((n) => n.id);
        const sorted: WorkflowNode[] = [];
        const nodeMap = new Map(nodes.map((n) => [n.id, n]));
        while (queue.length > 0) {
            const id = queue.shift()!;
            sorted.push(nodeMap.get(id)!);
            for (const next of adj.get(id) ?? []) {
                const deg = (inDeg.get(next) ?? 1) - 1;
                inDeg.set(next, deg);
                if (deg === 0) queue.push(next);
            }
        }
        // Append any remaining nodes (cycles) at the end
        for (const n of nodes) {
            if (!sorted.includes(n)) sorted.push(n);
        }
        return sorted;
    });

    readonly sourceNodes = computed(() =>
        this.editNodes().filter((n) => n.type !== 'end'),
    );

    readonly targetNodes = computed(() =>
        this.editNodes().filter((n) => n.type !== 'start'),
    );

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
            if (this.editDirty() && !confirm('Discard unsaved changes?')) return;
            this.expandedWorkflowId.set(null);
            this.expandedRuns.set([]);
            this.resetEditState();
            return;
        }
        if (this.editDirty() && !confirm('Discard unsaved changes to current workflow?')) return;

        this.expandedWorkflowId.set(workflowId);
        const workflow = this.workflowService.workflows().find((w) => w.id === workflowId);
        if (workflow) {
            this.editNodes.set(structuredClone(workflow.nodes));
            this.editEdges.set(structuredClone(workflow.edges));
        }
        this.editDirty.set(false);
        this.editingNodeId.set(null);
        this.showAddNode.set(false);

        try {
            await this.workflowService.loadRuns(workflowId, 10);
            this.expandedRuns.set(
                this.workflowService.runs().filter((r) => r.workflowId === workflowId).slice(0, 10),
            );
        } catch {
            this.expandedRuns.set([]);
        }
    }

    // Node helpers
    configSummary(node: WorkflowNode): string {
        const c = node.config;
        switch (node.type) {
            case 'agent_session': return c.prompt ? `prompt: "${c.prompt.slice(0, 40)}..."` : '';
            case 'work_task': return c.description ? `desc: "${c.description.slice(0, 40)}..."` : '';
            case 'condition': return c.expression ?? '';
            case 'delay': return c.delayMs != null ? `${c.delayMs}ms` : '';
            case 'webhook_wait': return [c.webhookEvent, c.timeoutMs != null ? `${c.timeoutMs}ms` : ''].filter(Boolean).join(', ');
            case 'transform': return c.template ? `"${c.template.slice(0, 40)}..."` : '';
            default: return '';
        }
    }

    getNodeLabel(nodeId: string): string {
        return this.editNodes().find((n) => n.id === nodeId)?.label ?? nodeId;
    }

    getNodeType(nodeId: string): string {
        return this.editNodes().find((n) => n.id === nodeId)?.type ?? 'start';
    }

    startEditNode(nodeId: string): void {
        this.editingNodeId.set(this.editingNodeId() === nodeId ? null : nodeId);
    }

    updateNodeLabel(nodeId: string, label: string): void {
        this.editNodes.update((nodes) =>
            nodes.map((n) => n.id === nodeId ? { ...n, label } : n),
        );
        this.editDirty.set(true);
    }

    updateNodeConfig(nodeId: string, key: string, value: unknown): void {
        this.editNodes.update((nodes) =>
            nodes.map((n) => n.id === nodeId ? { ...n, config: { ...n.config, [key]: value } } : n),
        );
        this.editDirty.set(true);
    }

    removeNode(nodeId: string): void {
        const node = this.editNodes().find((n) => n.id === nodeId);
        if (!node || node.type === 'start' || node.type === 'end') return;
        this.editNodes.update((nodes) => nodes.filter((n) => n.id !== nodeId));
        this.editEdges.update((edges) => edges.filter((e) => e.sourceNodeId !== nodeId && e.targetNodeId !== nodeId));
        if (this.editingNodeId() === nodeId) this.editingNodeId.set(null);
        this.editDirty.set(true);
    }

    addNode(): void {
        const type = this.newNodeType();
        const label = this.newNodeLabel.trim() || type;
        const id = `${type}-${crypto.randomUUID().slice(0, 8)}`;
        const config: Record<string, unknown> = {};

        switch (type) {
            case 'agent_session':
                if (this.newNodePrompt) config['prompt'] = this.newNodePrompt;
                if (this.newNodeMaxTurns) config['maxTurns'] = this.newNodeMaxTurns;
                break;
            case 'work_task':
                if (this.newNodeDescription) config['description'] = this.newNodeDescription;
                break;
            case 'condition':
                if (this.newNodeExpression) config['expression'] = this.newNodeExpression;
                break;
            case 'delay':
                if (this.newNodeDelayMs) config['delayMs'] = this.newNodeDelayMs;
                break;
            case 'webhook_wait':
                if (this.newNodeWebhookEvent) config['webhookEvent'] = this.newNodeWebhookEvent;
                if (this.newNodeTimeoutMs) config['timeoutMs'] = this.newNodeTimeoutMs;
                break;
            case 'transform':
                if (this.newNodeTemplate) config['template'] = this.newNodeTemplate;
                break;
        }

        this.editNodes.update((nodes) => [...nodes, { id, type, label, config }]);
        this.editDirty.set(true);
        this.showAddNode.set(false);
        this.resetNewNodeForm();
    }

    // Edge helpers
    removeEdge(edgeId: string): void {
        this.editEdges.update((edges) => edges.filter((e) => e.id !== edgeId));
        this.editDirty.set(true);
    }

    addEdge(): void {
        const source = this.newEdgeSource();
        const target = this.newEdgeTarget();
        if (!source || !target) return;
        if (source === target) {
            this.notifications.error('Cannot create self-referencing edge');
            return;
        }
        const duplicate = this.editEdges().some((e) => e.sourceNodeId === source && e.targetNodeId === target);
        if (duplicate) {
            this.notifications.error('Edge already exists');
            return;
        }

        const id = `edge-${crypto.randomUUID().slice(0, 8)}`;
        const edge: WorkflowEdge = { id, sourceNodeId: source, targetNodeId: target };
        if (this.newEdgeCondition.trim()) {
            edge.condition = this.newEdgeCondition.trim();
        }
        this.editEdges.update((edges) => [...edges, edge]);
        this.newEdgeSource.set('');
        this.newEdgeTarget.set('');
        this.newEdgeCondition = '';
        this.editDirty.set(true);
    }

    // Save / Discard
    discardChanges(workflow: Workflow): void {
        this.editNodes.set(structuredClone(workflow.nodes));
        this.editEdges.set(structuredClone(workflow.edges));
        this.editDirty.set(false);
        this.editingNodeId.set(null);
    }

    async saveGraph(workflowId: string): Promise<void> {
        const nodes = this.editNodes();
        const edges = this.editEdges();

        const hasStart = nodes.some((n) => n.type === 'start');
        const hasEnd = nodes.some((n) => n.type === 'end');
        if (!hasStart || !hasEnd) {
            this.notifications.error('Workflow must have at least one start and one end node');
            return;
        }

        this.saving.set(true);
        try {
            await this.workflowService.updateWorkflow(workflowId, { nodes, edges });
            this.editDirty.set(false);
            this.notifications.success('Workflow graph saved');
        } catch {
            this.notifications.error('Failed to save workflow graph');
        } finally {
            this.saving.set(false);
        }
    }

    async create(): Promise<void> {
        if (!this.formAgentId || !this.formName) {
            this.notifications.error('Please fill in agent and name');
            return;
        }

        this.creating.set(true);
        try {
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

    private resetEditState(): void {
        this.editNodes.set([]);
        this.editEdges.set([]);
        this.editDirty.set(false);
        this.editingNodeId.set(null);
        this.showAddNode.set(false);
        this.newEdgeSource.set('');
        this.newEdgeTarget.set('');
        this.newEdgeCondition = '';
    }

    private resetNewNodeForm(): void {
        this.newNodeLabel = '';
        this.newNodePrompt = '';
        this.newNodeMaxTurns = 10;
        this.newNodeDescription = '';
        this.newNodeExpression = '';
        this.newNodeDelayMs = 1000;
        this.newNodeWebhookEvent = '';
        this.newNodeTimeoutMs = 30000;
        this.newNodeTemplate = '';
    }
}
