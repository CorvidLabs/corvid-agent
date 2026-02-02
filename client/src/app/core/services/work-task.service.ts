import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { WebSocketService } from './websocket.service';
import type { WorkTask, CreateWorkTaskInput } from '../models/work-task.model';
import type { ServerWsMessage } from '../models/ws-message.model';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class WorkTaskService {
    private readonly api = inject(ApiService);
    private readonly ws = inject(WebSocketService);

    readonly tasks = signal<WorkTask[]>([]);
    readonly loading = signal(false);

    private unsubscribeWs: (() => void) | null = null;

    startListening(): void {
        if (this.unsubscribeWs) return;

        this.unsubscribeWs = this.ws.onMessage((msg: ServerWsMessage) => {
            if (msg.type === 'work_task_update') {
                const updated = msg.task;
                this.tasks.update((tasks) => {
                    const idx = tasks.findIndex((t) => t.id === updated.id);
                    if (idx >= 0) {
                        const copy = [...tasks];
                        copy[idx] = updated;
                        return copy;
                    }
                    return [updated, ...tasks];
                });
            }
        });
    }

    stopListening(): void {
        this.unsubscribeWs?.();
        this.unsubscribeWs = null;
    }

    async loadTasks(agentId?: string): Promise<void> {
        this.loading.set(true);
        try {
            const path = agentId ? `/work-tasks?agentId=${agentId}` : '/work-tasks';
            const tasks = await firstValueFrom(this.api.get<WorkTask[]>(path));
            this.tasks.set(tasks);
        } finally {
            this.loading.set(false);
        }
    }

    async getTask(id: string): Promise<WorkTask> {
        return firstValueFrom(this.api.get<WorkTask>(`/work-tasks/${id}`));
    }

    async createTask(input: CreateWorkTaskInput): Promise<WorkTask> {
        const task = await firstValueFrom(this.api.post<WorkTask>('/work-tasks', input));
        this.tasks.update((current) => [task, ...current]);
        return task;
    }

    async cancelTask(id: string): Promise<WorkTask> {
        const task = await firstValueFrom(this.api.post<WorkTask>(`/work-tasks/${id}/cancel`));
        this.tasks.update((current) => current.map((t) => (t.id === id ? task : t)));
        return task;
    }

    createViaWebSocket(agentId: string, description: string, projectId?: string): void {
        this.ws.createWorkTask(agentId, description, projectId);
    }
}
