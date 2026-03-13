export type DirStrategy = 'persistent' | 'clone_on_demand' | 'ephemeral' | 'worktree';

export interface Project {
    id: string;
    name: string;
    description: string;
    workingDir: string;
    claudeMd: string;
    envVars: Record<string, string>;
    gitUrl: string | null;
    dirStrategy: DirStrategy;
    baseClonePath: string | null;
    maxConcurrency?: number;
    createdAt: string;
    updatedAt: string;
}

export interface CreateProjectInput {
    name: string;
    description?: string;
    workingDir: string;
    claudeMd?: string;
    envVars?: Record<string, string>;
    gitUrl?: string;
    dirStrategy?: DirStrategy;
    baseClonePath?: string;
}

export interface UpdateProjectInput {
    name?: string;
    description?: string;
    workingDir?: string;
    claudeMd?: string;
    envVars?: Record<string, string>;
    gitUrl?: string | null;
    dirStrategy?: DirStrategy;
    baseClonePath?: string | null;
}
