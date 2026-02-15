import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { WebSocketService } from './websocket.service';
import type {
    Workflow,
    WorkflowRun,
    WorkflowNodeExecution,
    CreateWorkflowInput,
    UpdateWorkflowInput,
} from '../models/workflow.model';
import type { ServerWsMessage } from '../models/ws-message.model';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class WorkflowService {
    private readonly api = inject(ApiService);
    private readonly ws = inject(WebSocketService);

    readonly workflows = signal<Workflow[]>([]);
    readonly runs = signal<WorkflowRun[]>([]);
    readonly nodeExecutions = signal<WorkflowNodeExecution[]>([]);
    readonly loading = signal(false);

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
                const exec = msg.nodeExecution as WorkflowNodeExecution;
                this.nodeExecutions.update((list) => {
                    const idx = list.findIndex((e) => e.id === exec.id);
                    if (idx >= 0) {
                        const copy = [...list];
                        copy[idx] = exec;
                        return copy;
                    }
                    return [exec, ...list];
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
            this.workflows.set(workflows);
        } finally {
            this.loading.set(false);
        }
    }

    async getWorkflow(id: string): Promise<Workflow> {
        return firstValueFrom(this.api.get<Workflow>(`/workflows/${id}`));
    }

    async createWorkflow(input: CreateWorkflowInput): Promise<Workflow> {
        const workflow = await firstValueFrom(this.api.post<Workflow>('/workflows', input));
        this.workflows.update((list) => [workflow, ...list]);
        return workflow;
    }

    async updateWorkflow(id: string, input: UpdateWorkflowInput): Promise<Workflow> {
        const workflow = await firstValueFrom(this.api.put<Workflow>(`/workflows/${id}`, input));
        this.workflows.update((list) => list.map((w) => (w.id === id ? workflow : w)));
        return workflow;
    }

    async deleteWorkflow(id: string): Promise<void> {
        await firstValueFrom(this.api.delete(`/workflows/${id}`));
        this.workflows.update((list) => list.filter((w) => w.id !== id));
    }

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

    async resolveApproval(runId: string, nodeId: string, approved: boolean): Promise<WorkflowRun> {
        return firstValueFrom(
            this.api.post<WorkflowRun>(`/workflow-runs/${runId}/resolve`, { nodeId, approved }),
        );
    }

    async loadNodeExecutions(runId: string): Promise<void> {
        const executions = await firstValueFrom(
            this.api.get<WorkflowNodeExecution[]>(`/workflow-runs/${runId}/nodes`),
        );
        this.nodeExecutions.set(executions);
    }
}
