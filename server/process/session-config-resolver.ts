/**
 * SessionConfigResolver — Resolves persona prompts, skill bundle prompts, and
 * tool permissions for agent sessions.
 *
 * Extracted from ProcessManager where this logic was duplicated in
 * startSdkProcessWrapped, startDirectProcessWrapped, and resumeProcess.
 *
 * @module
 */
import type { Database } from 'bun:sqlite';
import type { Agent } from '../../shared/types';
import { getAgentPersonas, composePersonaPrompt } from '../db/personas';
import { resolveAgentPromptAdditions, resolveProjectPromptAdditions, resolveAgentTools, resolveProjectTools } from '../db/skill-bundles';
import { getAgent } from '../db/agents';

export interface SessionPrompts {
    personaPrompt: string | undefined;
    skillPrompt: string | undefined;
}

export interface ResolvedSessionConfig {
    personaPrompt: string | undefined;
    skillPrompt: string | undefined;
    resolvedToolPermissions: string[] | null;
}

/**
 * Resolve persona and skill bundle prompts for an agent session.
 * Combines agent-level and project-level skill prompt additions.
 */
export function resolveSessionPrompts(db: Database, agent: Agent | null, projectId: string | null): SessionPrompts {
    let personaPrompt: string | undefined;
    let skillPrompt: string | undefined;

    if (agent) {
        const personas = getAgentPersonas(db, agent.id);
        const pp = composePersonaPrompt(personas);
        if (pp) personaPrompt = pp;

        const sp = resolveAgentPromptAdditions(db, agent.id);
        if (sp) skillPrompt = sp;
    }

    if (projectId) {
        const projectSkillPrompt = resolveProjectPromptAdditions(db, projectId);
        if (projectSkillPrompt) {
            skillPrompt = skillPrompt ? `${skillPrompt}\n\n${projectSkillPrompt}` : projectSkillPrompt;
        }
    }

    return { personaPrompt, skillPrompt };
}

/**
 * Compute effective tool permissions by merging agent base + agent bundles + project bundles.
 *
 * Project-level bundles only expand tools when the agent has no explicit
 * mcp_tool_permissions — agents with explicit permissions have been deliberately
 * scoped and project bundles contribute prompt additions only.
 */
export function resolveToolPermissions(db: Database, agentId: string, projectId: string | null): string[] | null {
    const agent = getAgent(db, agentId);
    const basePermissions = agent?.mcpToolPermissions ?? null;

    let merged = resolveAgentTools(db, agentId, basePermissions);

    if (projectId && basePermissions === null) {
        merged = resolveProjectTools(db, projectId, merged);
    }

    return merged;
}

/**
 * Resolve all session configuration at once (prompts + tool permissions).
 */
export function resolveSessionConfig(db: Database, agent: Agent | null, agentId: string | null, projectId: string | null): ResolvedSessionConfig {
    const { personaPrompt, skillPrompt } = resolveSessionPrompts(db, agent, projectId);
    const resolvedToolPermissions = agentId
        ? resolveToolPermissions(db, agentId, projectId)
        : null;

    return { personaPrompt, skillPrompt, resolvedToolPermissions };
}
