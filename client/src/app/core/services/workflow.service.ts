import { Injectable, inject, signal } from '@angular/core';
import { EntityStore } from './entity-store';
import { WebSocketService } from './websocket.service';
import type {
    Workflow,
    WorkflowRun,
    WorkflowNodeRun,
    CreateWorkflowInput,
    UpdateWorkflowInput,
} from '../models/workflow.model';
import type { ServerWsMessage } from '@shared/ws-protocol';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class WorkflowService extends EntityStore<Workflow> {
    protected readonly apiPath = '/workflows';

    private readonly ws = inject(WebSocketService);

    // Backward-compatible alias
    readonly workflows = this.entities;

    // Domain-specific signals for run tracking
    readonly runs = signal<WorkflowRun[]>([]);
    readonly nodeRuns = signal<WorkflowNodeRun[]>([]);

    private unsubscribeWs: (() => void) | null = null;

    startListening(): void {
        if (this.unsubscribeWs) return;

        this.unsubscribeWs = this.ws.onMessage((msg: ServerWsMessage) => {
            if (msg.type === 'workflow_run_update') {
                const run = msg.run as WorkflowRun;
                this.runs.update((list) => {
                    const idx = list.findIndex((r) => r.id === run.id);
                    if (idx >= 0) {
                        const copy = [...list];
                        copy[idx] = run;
                        return copy;
                    }
                    return [run, ...list];
                });
            }

            if (msg.type === 'workflow_node_update') {
                const nodeRun = msg.nodeExecution as WorkflowNodeRun;
                this.nodeRuns.update((list) => {
                    const idx = list.findIndex((e) => e.id === nodeRun.id);
                    if (idx >= 0) {
                        const copy = [...list];
                        copy[idx] = nodeRun;
                        return copy;
                    }
                    return [nodeRun, ...list];
                });
            }
        });
    }

    stopListening(): void {
        this.unsubscribeWs?.();
        this.unsubscribeWs = null;
    }

    async loadWorkflows(agentId?: string): Promise<void> {
        this.loading.set(true);
        try {
            const path = agentId ? `/workflows?agentId=${agentId}` : '/workflows';
            const workflows = await firstValueFrom(this.api.get<Workflow[]>(path));
            this.entities.set(workflows);
        } finally {
            this.loading.set(false);
        }
    }

    async getWorkflow(id: string): Promise<Workflow> {
        return this.getById(id);
    }

    async createWorkflow(input: CreateWorkflowInput): Promise<Workflow> {
        return this.create(input);
    }

    async updateWorkflow(id: string, input: UpdateWorkflowInput): Promise<Workflow> {
        return this.update(id, input);
    }

    async deleteWorkflow(id: string): Promise<void> {
        return this.remove(id);
    }

    // ─── Run Operations ──────────────────────────────────────────────────

    async triggerWorkflow(id: string, input: Record<string, unknown> = {}): Promise<WorkflowRun> {
        const run = await firstValueFrom(this.api.post<WorkflowRun>(`/workflows/${id}/trigger`, { input }));
        this.runs.update((list) => [run, ...list]);
        return run;
    }

    async loadRuns(workflowId?: string, limit: number = 50): Promise<void> {
        const path = workflowId
            ? `/workflows/${workflowId}/runs?limit=${limit}`
            : `/workflow-runs?limit=${limit}`;
        const runs = await firstValueFrom(this.api.get<WorkflowRun[]>(path));
        this.runs.set(runs);
    }

    async getRun(id: string): Promise<WorkflowRun> {
        return firstValueFrom(this.api.get<WorkflowRun>(`/workflow-runs/${id}`));
    }

    async cancelRun(id: string): Promise<WorkflowRun> {
        const run = await firstValueFrom(this.api.post<WorkflowRun>(`/workflow-runs/${id}/cancel`));
        this.runs.update((list) => list.map((r) => (r.id === id ? run : r)));
        return run;
    }

    async loadNodeRuns(runId: string): Promise<void> {
        const nodeRuns = await firstValueFrom(
            this.api.get<WorkflowNodeRun[]>(`/workflow-runs/${runId}/nodes`),
        );
        this.nodeRuns.set(nodeRuns);
    }
}
