import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import type {
    McpServerConfig,
    CreateMcpServerConfigInput,
    UpdateMcpServerConfigInput,
} from '../models/mcp-server.model';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class McpServerService {
    private readonly api = inject(ApiService);

    readonly servers = signal<McpServerConfig[]>([]);
    readonly loading = signal(false);

    async loadServers(agentId?: string): Promise<void> {
        this.loading.set(true);
        try {
            const path = agentId ? `/mcp-servers?agentId=${agentId}` : '/mcp-servers';
            const servers = await firstValueFrom(this.api.get<McpServerConfig[]>(path));
            this.servers.set(servers);
        } finally {
            this.loading.set(false);
        }
    }

    async createServer(data: CreateMcpServerConfigInput): Promise<McpServerConfig> {
        const server = await firstValueFrom(
            this.api.post<McpServerConfig>('/mcp-servers', data),
        );
        this.servers.update((current) => [...current, server]);
        return server;
    }

    async updateServer(id: string, data: UpdateMcpServerConfigInput): Promise<McpServerConfig> {
        const server = await firstValueFrom(
            this.api.put<McpServerConfig>(`/mcp-servers/${id}`, data),
        );
        this.servers.update((current) => current.map((s) => (s.id === id ? server : s)));
        return server;
    }

    async deleteServer(id: string): Promise<void> {
        await firstValueFrom(this.api.delete(`/mcp-servers/${id}`));
        this.servers.update((current) => current.filter((s) => s.id !== id));
    }

    async testConnection(id: string): Promise<{ success: boolean; message: string }> {
        return firstValueFrom(
            this.api.post<{ success: boolean; message: string }>(`/mcp-servers/${id}/test`),
        );
    }
}
