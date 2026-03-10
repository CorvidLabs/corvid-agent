import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpToolContext } from './types';
import { textResult, errorResult } from './types';
import { listProjects, getProject } from '../../db/projects';
import { getAgent } from '../../db/agents';

/**
 * List all available projects with their IDs, names, and working directories.
 * Agents can use this to discover projects before creating work tasks.
 */
export async function handleListProjects(ctx: McpToolContext): Promise<CallToolResult> {
    const projects = listProjects(ctx.db);

    if (projects.length === 0) {
        return textResult('No projects configured.');
    }

    const lines = projects.map((p) =>
        `- ${p.name} (id: ${p.id})\n  dir: ${p.workingDir || '(none)'}\n  description: ${p.description || '(none)'}`,
    );

    return textResult(`Available projects (${projects.length}):\n\n${lines.join('\n\n')}`);
}

/**
 * Show the current agent's default project — the project that will be used
 * when no explicit project_id is provided to corvid_create_work_task.
 */
export async function handleCurrentProject(ctx: McpToolContext): Promise<CallToolResult> {
    const agent = getAgent(ctx.db, ctx.agentId);
    if (!agent) {
        return errorResult('Could not find current agent record.');
    }

    if (!agent.defaultProjectId) {
        return errorResult(
            'No default project configured for this agent. ' +
            'Use corvid_list_projects to discover available projects, ' +
            'then specify project_id or project_name when creating work tasks.',
        );
    }

    const project = getProject(ctx.db, agent.defaultProjectId);
    if (!project) {
        return errorResult(`Default project (${agent.defaultProjectId}) not found in database.`);
    }

    return textResult(
        `Current default project:\n` +
        `  Name: ${project.name}\n` +
        `  ID: ${project.id}\n` +
        `  Directory: ${project.workingDir || '(none)'}\n` +
        `  Description: ${project.description || '(none)'}\n\n` +
        `This is the project that will be used when no project_id is specified in corvid_create_work_task.`,
    );
}
