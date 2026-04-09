import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { launchCouncil } from '../../councils/discussion';
import { listAgents } from '../../db/agents';
import { createCouncil } from '../../db/councils';
import { listProjects } from '../../db/projects';
import { createLogger } from '../../lib/logger';
import type { McpToolContext } from './types';
import { errorResult, textResult } from './types';

const log = createLogger('McpToolHandlers');

export async function handleLaunchCouncil(
  ctx: McpToolContext,
  args: {
    topic: string;
    agentIds?: string[];
    chairmanAgentId?: string;
    discussionRounds?: number;
    governanceTier?: string;
  },
): Promise<CallToolResult> {
  if (!ctx.processManager) {
    return errorResult('Process manager is not available. Council launch requires a running server context.');
  }

  try {
    ctx.emitStatus?.('Preparing council deliberation...');

    // Resolve agent IDs: use provided list or fall back to all agents
    let agentIds = args.agentIds;
    if (!agentIds || agentIds.length === 0) {
      const allAgents = listAgents(ctx.db);
      agentIds = allAgents.map((a) => a.id);
    }

    if (agentIds.length < 2) {
      return errorResult(`A council requires at least 2 agents. Found ${agentIds.length}.`);
    }

    // Resolve chairman: default to first agent in the list
    const chairmanAgentId = args.chairmanAgentId ?? agentIds[0];

    // Resolve discussion rounds
    const discussionRounds = args.discussionRounds ?? 2;

    // Resolve project: use the calling agent's default project, or the first available project
    const callingAgent = ctx.db.query('SELECT default_project_id FROM agents WHERE id = ?').get(ctx.agentId) as {
      default_project_id: string | null;
    } | null;
    let projectId = callingAgent?.default_project_id ?? null;
    if (!projectId) {
      const projects = listProjects(ctx.db);
      if (projects.length > 0) {
        projectId = projects[0].id;
      }
    }
    if (!projectId) {
      return errorResult('No project available. Create a project first or set a default project on the agent.');
    }

    ctx.emitStatus?.('Creating council...');

    // Create the council configuration in the DB
    const council = createCouncil(ctx.db, {
      name: `Council: ${args.topic.slice(0, 80)}`,
      description: `Auto-created council for deliberation on: ${args.topic}`,
      agentIds,
      chairmanAgentId,
      discussionRounds,
      onChainMode: 'off',
    });

    ctx.emitStatus?.('Launching council deliberation...');

    // Launch the council
    const result = launchCouncil(
      ctx.db,
      ctx.processManager,
      council.id,
      projectId,
      args.topic,
      ctx.agentMessenger ?? null,
      {
        voteType: args.governanceTier === 'governance' ? 'governance' : 'standard',
      },
    );

    log.info('MCP launch_council succeeded', {
      agentId: ctx.agentId,
      councilId: council.id,
      launchId: result.launchId,
      agentCount: agentIds.length,
      discussionRounds,
    });

    return textResult(
      `Council launched successfully.\n` +
        `  Council ID: ${council.id}\n` +
        `  Launch ID: ${result.launchId}\n` +
        `  Topic: ${args.topic}\n` +
        `  Agents: ${agentIds.length}\n` +
        `  Discussion Rounds: ${discussionRounds}\n` +
        `  Chairman: ${chairmanAgentId}\n` +
        `  Sessions: ${result.sessionIds.length} started`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('MCP launch_council failed', { error: message });
    return errorResult(`Failed to launch council: ${message}`);
  }
}
