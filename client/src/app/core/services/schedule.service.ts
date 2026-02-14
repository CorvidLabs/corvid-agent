import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { WebSocketService } from './websocket.service';
import type {
    AgentSchedule,
    ScheduleExecution,
    CreateScheduleInput,
    UpdateScheduleInput,
} from '../models/schedule.model';
import type { ServerWsMessage } from '../models/ws-message.model';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ScheduleService {
    private readonly api = inject(ApiService);
    private readonly ws = inject(WebSocketService);

    readonly schedules = signal<AgentSchedule[]>([]);
    readonly executions = signal<ScheduleExecution[]>([]);
    readonly pendingApprovals = signal<ScheduleExecution[]>([]);
    readonly loading = signal(false);

    private unsubscribeWs: (() => void) | null = null;

    startListening(): void {
        if (this.unsubscribeWs) return;

        this.unsubscribeWs = this.ws.onMessage((msg: ServerWsMessage) => {
            if (msg.type === 'schedule_update') {
                const schedule = msg.schedule as AgentSchedule;
                this.schedules.update((list) => {
                    const idx = list.findIndex((s) => s.id === schedule.id);
                    if (idx >= 0) {
                        const copy = [...list];
                        copy[idx] = schedule;
                        return copy;
                    }
                    return [schedule, ...list];
                });
            }

            if (msg.type === 'schedule_execution_update') {
                const execution = msg.execution as ScheduleExecution;
                this.executions.update((list) => {
                    const idx = list.findIndex((e) => e.id === execution.id);
                    if (idx >= 0) {
                        const copy = [...list];
                        copy[idx] = execution;
                        return copy;
                    }
                    return [execution, ...list];
                });

                // Track pending approvals
                if (execution.status === 'awaiting_approval') {
                    this.pendingApprovals.update((list) => {
                        if (list.some((e) => e.id === execution.id)) return list;
                        return [execution, ...list];
                    });
                } else {
                    this.pendingApprovals.update((list) =>
                        list.filter((e) => e.id !== execution.id),
                    );
                }
            }
        });
    }

    stopListening(): void {
        this.unsubscribeWs?.();
        this.unsubscribeWs = null;
    }

    async loadSchedules(agentId?: string): Promise<void> {
        this.loading.set(true);
        try {
            const path = agentId ? `/schedules?agentId=${agentId}` : '/schedules';
            const schedules = await firstValueFrom(this.api.get<AgentSchedule[]>(path));
            this.schedules.set(schedules);
        } finally {
            this.loading.set(false);
        }
    }

    async getSchedule(id: string): Promise<AgentSchedule> {
        return firstValueFrom(this.api.get<AgentSchedule>(`/schedules/${id}`));
    }

    async createSchedule(input: CreateScheduleInput): Promise<AgentSchedule> {
        const schedule = await firstValueFrom(this.api.post<AgentSchedule>('/schedules', input));
        this.schedules.update((list) => [schedule, ...list]);
        return schedule;
    }

    async updateSchedule(id: string, input: UpdateScheduleInput): Promise<AgentSchedule> {
        const schedule = await firstValueFrom(this.api.put<AgentSchedule>(`/schedules/${id}`, input));
        this.schedules.update((list) => list.map((s) => (s.id === id ? schedule : s)));
        return schedule;
    }

    async deleteSchedule(id: string): Promise<void> {
        await firstValueFrom(this.api.delete(`/schedules/${id}`));
        this.schedules.update((list) => list.filter((s) => s.id !== id));
    }

    async getScheduleExecutions(scheduleId: string, limit: number = 20): Promise<ScheduleExecution[]> {
        return firstValueFrom(this.api.get<ScheduleExecution[]>(`/schedules/${scheduleId}/executions?limit=${limit}`));
    }

    async loadExecutions(scheduleId?: string, limit: number = 50): Promise<void> {
        const path = scheduleId
            ? `/schedules/${scheduleId}/executions?limit=${limit}`
            : `/schedule-executions?limit=${limit}`;
        const executions = await firstValueFrom(this.api.get<ScheduleExecution[]>(path));
        this.executions.set(executions);
    }

    async resolveApproval(executionId: string, approved: boolean): Promise<ScheduleExecution> {
        const execution = await firstValueFrom(
            this.api.post<ScheduleExecution>(`/schedule-executions/${executionId}/resolve`, { approved }),
        );
        this.pendingApprovals.update((list) => list.filter((e) => e.id !== executionId));
        return execution;
    }

    async getGithubStatus(): Promise<{ configured: boolean }> {
        return firstValueFrom(this.api.get<{ configured: boolean }>('/github/status'));
    }
}
