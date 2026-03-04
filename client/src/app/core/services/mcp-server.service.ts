import { Injectable } from '@angular/core';
import { EntityStore } from './entity-store';
import type {
    McpServerConfig,
    CreateMcpServerConfigInput,
    UpdateMcpServerConfigInput,
} from '../models/mcp-server.model';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class McpServerService extends EntityStore<McpServerConfig> {
    protected readonly apiPath = '/mcp-servers';

    /** Alias for backward compatibility. */
    readonly servers = this.entities;

    async loadServers(agentId?: string): Promise<void> {
        this.loading.set(true);
        try {
            const path = agentId ? `/mcp-servers?agentId=${agentId}` : '/mcp-servers';
            const servers = await firstValueFrom(this.api.get<McpServerConfig[]>(path));
            this.entities.set(servers);
        } finally {
            this.loading.set(false);
        }
    }

    async createServer(data: CreateMcpServerConfigInput): Promise<McpServerConfig> {
        return this.create(data);
    }

    async updateServer(id: string, data: UpdateMcpServerConfigInput): Promise<McpServerConfig> {
        return this.update(id, data);
    }

    async deleteServer(id: string): Promise<void> {
        return this.remove(id);
    }

    async testConnection(id: string): Promise<{ success: boolean; message: string }> {
        return firstValueFrom(
            this.api.post<{ success: boolean; message: string }>(`/mcp-servers/${id}/test`),
        );
    }
}
