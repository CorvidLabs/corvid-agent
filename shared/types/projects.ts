export interface Project {
    id: string;
    name: string;
    description: string;
    workingDir: string;
    claudeMd: string;
    envVars: Record<string, string>;
    maxConcurrency: number;
    createdAt: string;
    updatedAt: string;
}

export interface CreateProjectInput {
    name: string;
    description?: string;
    workingDir: string;
    claudeMd?: string;
    envVars?: Record<string, string>;
    maxConcurrency?: number;
}

export interface UpdateProjectInput {
    name?: string;
    description?: string;
    workingDir?: string;
    claudeMd?: string;
    envVars?: Record<string, string>;
    maxConcurrency?: number;
}
