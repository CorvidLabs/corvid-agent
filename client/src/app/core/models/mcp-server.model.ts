export interface McpServerConfig {
    id: string;
    agentId: string | null;
    name: string;
    command: string;
    args: string[];
    envVars: Record<string, string>;
    cwd: string | null;
    enabled: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface CreateMcpServerConfigInput {
    agentId?: string | null;
    name: string;
    command: string;
    args?: string[];
    envVars?: Record<string, string>;
    cwd?: string | null;
    enabled?: boolean;
}

export interface UpdateMcpServerConfigInput {
    name?: string;
    command?: string;
    args?: string[];
    envVars?: Record<string, string>;
    cwd?: string | null;
    enabled?: boolean;
}
