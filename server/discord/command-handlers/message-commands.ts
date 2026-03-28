/**
 * Discord /message command handler.
 *
 * Lightweight command mode with policy-based tool access.
 * - BASIC/STANDARD users get restricted tools (read-only + memory recall)
 * - ADMIN users get full tool access
 *
 * Supports optional buddy agent for post-response review with visible
 * round-by-round embeds in the channel.
 */

import type { Project, SessionSource } from '../../../shared/types';
import type { BuddyRoundEvent } from '../../../shared/types/buddy';
import { listAgents } from '../../db/agents';
import { saveMentionSession } from '../../db/discord-mention-sessions';
import { listProjects } from '../../db/projects';
import { createSession } from '../../db/sessions';
import { createLogger } from '../../lib/logger';
import type { InteractionContext } from '../commands';
import { buildFooterText, respondEphemeral, respondToInteraction, sendEmbed, sendTypingIndicator } from '../embeds';
import { withAuthorContext } from '../message-handler';
import type { DiscordBridgeConfig, DiscordInteractionData } from '../types';
import { PermissionLevel } from '../types';

const log = createLogger('DiscordMessageCommand');

/** Read-only built-in tools for all /message sessions. */
export const MESSAGE_BUILTIN_TOOLS = ['Read', 'Glob', 'Grep'];

/** MCP tools available to all /message sessions (memory recall only). */
export const MESSAGE_MCP_TOOLS = ['corvid_recall_memory', 'corvid_read_on_chain_memories'];

/** Restricted /message session prefix (tool-sandboxed). */
export const RESTRICTED_MESSAGE_SESSION_PREFIX = 'Discord message:';

/** Full-access /message session prefix for trusted STANDARD channels. */
export const STAFF_MESSAGE_SESSION_PREFIX = 'Discord staff message:';

/** Full-access /message session prefix (admin callers). */
export const ADMIN_MESSAGE_SESSION_PREFIX = 'Discord admin message:';

export interface MessageToolPolicy {
  sessionName: string;
  toolAllowList?: string[];
  mcpToolAllowList?: string[];
  accessLabel: 'restricted' | 'full';
}

/**
 * Resolve tool access policy for /message sessions.
 * Keep this centralized so user/channel policy can be expanded later.
 */
export function resolveMessageToolPolicy(
  config: DiscordBridgeConfig,
  permLevel: number,
  channelId: string,
): MessageToolPolicy {
  if (permLevel >= PermissionLevel.ADMIN) {
    return {
      sessionName: `${ADMIN_MESSAGE_SESSION_PREFIX}${channelId}`,
      accessLabel: 'full',
    };
  }

  const channelFloor = config.channelPermissions?.[channelId];
  const hasStandardFloor = channelFloor !== undefined && channelFloor >= PermissionLevel.STANDARD;
  const fullToolChannel = config.messageFullToolChannelIds?.includes(channelId) ?? false;
  if (permLevel >= PermissionLevel.STANDARD && fullToolChannel && hasStandardFloor) {
    return {
      sessionName: `${STAFF_MESSAGE_SESSION_PREFIX}${channelId}`,
      accessLabel: 'full',
    };
  }

  return {
    sessionName: `${RESTRICTED_MESSAGE_SESSION_PREFIX}${channelId}`,
    toolAllowList: MESSAGE_BUILTIN_TOOLS,
    mcpToolAllowList: MESSAGE_MCP_TOOLS,
    accessLabel: 'restricted',
  };
}

/** Buddy role colors for Discord embeds. */
const BUDDY_LEAD_COLOR = 0x3498db; // Blue — lead agent
const BUDDY_REVIEW_COLOR = 0x9b59b6; // Purple — buddy reviewer
const BUDDY_APPROVED_COLOR = 0x2ecc71; // Green — buddy approved

/** Compute a human-readable status label for a buddy round event. */
export function getBuddyStatusLabel(role: string, round: number, approved: boolean): string {
  if (role === 'lead' && round === 1) return 'Initial Response';
  if (role === 'lead') return `Revised Response (Round ${round})`;
  if (approved) return 'Approved';
  return 'Review & Feedback';
}

/** Compute the role icon emoji for a buddy round event. */
export function getBuddyRoleIcon(role: string, approved: boolean): string {
  return role === 'lead' ? '💬' : approved ? '✅' : '🔍';
}

export async function handleMessageCommand(
  ctx: InteractionContext,
  interaction: DiscordInteractionData,
  permLevel: number,
  getOption: (name: string) => string | undefined,
  userId: string,
): Promise<void> {
  // /message is available at BASIC level — the first command for external users
  if (permLevel < PermissionLevel.BASIC) {
    await respondEphemeral(interaction, 'You do not have permission to use this command.');
    return;
  }

  const agentName = getOption('agent');
  // Option was renamed from `message` → `text` to avoid clashing with command name `/message` in some clients.
  const message = getOption('text') ?? getOption('message');
  if (!agentName || !message) {
    await respondToInteraction(interaction, 'Please provide both an agent and a message.');
    return;
  }

  const projectNameOpt = getOption('project');
  const buddyName = getOption('buddy');
  const buddyRounds = getOption('rounds');

  const agents = listAgents(ctx.db);
  if (agents.length === 0) {
    await respondToInteraction(interaction, 'No agents configured.');
    return;
  }

  // Strip model suffix like " (claude-opus-4-6)" if user typed the full display name
  const cleanAgentName = agentName.split(' (')[0].trim();
  const agent = agents.find(
    (a) =>
      a.name.toLowerCase() === cleanAgentName.toLowerCase() ||
      a.name.toLowerCase().replace(/\s+/g, '') === cleanAgentName.toLowerCase().replace(/\s+/g, ''),
  );
  if (!agent) {
    const names = agents.map((a) => a.name).join(', ');
    await respondToInteraction(interaction, `Agent not found: "${agentName}". Available: ${names}`);
    return;
  }

  // Resolve buddy agent if specified
  let buddyAgent: typeof agent | undefined;
  if (buddyName) {
    const cleanBuddyName = buddyName.split(' (')[0].trim();
    buddyAgent = agents.find(
      (a) =>
        a.name.toLowerCase() === cleanBuddyName.toLowerCase() ||
        a.name.toLowerCase().replace(/\s+/g, '') === cleanBuddyName.toLowerCase().replace(/\s+/g, ''),
    );
    if (!buddyAgent) {
      const names = agents.map((a) => a.name).join(', ');
      await respondToInteraction(interaction, `Buddy agent not found: "${buddyName}". Available: ${names}`);
      return;
    }
    if (buddyAgent.id === agent.id) {
      await respondToInteraction(interaction, 'An agent cannot be its own buddy. Choose a different buddy agent.');
      return;
    }
  }

  const allProjects = listProjects(ctx.db);
  let project: Project | undefined;
  if (projectNameOpt) {
    project = allProjects.find((p) => p.name.toLowerCase() === projectNameOpt.toLowerCase());
    if (!project) {
      const names = allProjects.map((p) => p.name).join(', ');
      await respondToInteraction(interaction, `Project not found: "${projectNameOpt}". Available: ${names}`);
      return;
    }
  } else {
    project = agent.defaultProjectId
      ? (allProjects.find((p) => p.id === agent.defaultProjectId) ?? allProjects[0])
      : allProjects[0];
  }
  if (!project) {
    await respondToInteraction(interaction, 'No projects configured.');
    return;
  }

  const channelId = interaction.channel_id;
  if (!channelId) {
    await respondToInteraction(interaction, 'Could not determine channel.');
    return;
  }

  // Acknowledge the command immediately
  const username = interaction.member?.user?.username ?? interaction.user?.username ?? userId;
  const buddyLabel = buddyAgent ? ` with buddy **${buddyAgent.name}**` : '';
  await respondToInteraction(interaction, `**${agent.name}** is thinking...${buddyLabel}`);

  // Start typing indicator
  sendTypingIndicator(ctx.config.botToken, channelId).catch(() => {});

  // When buddy mode is active, skip the inline response entirely and let
  // the buddy service handle the full conversation as visible embeds.
  // This prevents the double-response problem (lead responding inline AND
  // again inside the buddy round loop).
  if (buddyAgent && ctx.buddyService) {
    const maxRounds = buddyRounds ? Math.max(1, Math.min(10, parseInt(buddyRounds, 10))) : undefined;
    const buddyCallback = createBuddyDiscordCallback(ctx, channelId, {
      leadAgentName: agent.name,
      leadAgentModel: agent.model || 'unknown',
      buddyAgentName: buddyAgent.name,
      buddyAgentModel: buddyAgent.model || 'unknown',
      projectName: project.name,
      leadDisplayColor: agent.displayColor,
      buddyDisplayColor: buddyAgent.displayColor,
    });
    ctx.buddyService
      .startSession({
        leadAgentId: agent.id,
        buddyAgentId: buddyAgent.id,
        prompt: withAuthorContext(message, userId, username, channelId),
        source: 'discord',
        maxRounds,
        onRoundComplete: buddyCallback,
      })
      .catch((err) => {
        log.warn('Failed to start buddy session for /message', {
          agentName: agent.name,
          buddyAgentId: buddyAgent!.id,
          error: err instanceof Error ? err.message : String(err),
        });
      });

    log.info('Message command started (buddy mode)', {
      agentName: agent.name,
      buddyName: buddyAgent.name,
      userId,
      channelId,
      hasBuddy: true,
    });
    return;
  }

  // Non-buddy mode: standard inline response flow
  const toolPolicy = resolveMessageToolPolicy(ctx.config, permLevel, channelId);
  const session = createSession(ctx.db, {
    projectId: project.id,
    agentId: agent.id,
    name: toolPolicy.sessionName,
    initialPrompt: message,
    source: 'discord' as SessionSource,
  });

  const textWithContext = withAuthorContext(message, userId, username, channelId);

  ctx.processManager.startProcess(session, textWithContext, {
    toolAllowList: toolPolicy.toolAllowList,
    mcpToolAllowList: toolPolicy.mcpToolAllowList,
  });

  const agentModel = agent.model || 'unknown';
  const agentDisplayColor = agent.displayColor;
  const agentDisplayIcon = agent.displayIcon;
  const agentAvatarUrl = agent.avatarUrl;
  const projectNameForFooter = project.name;

  ctx.subscribeForInlineResponse(
    session.id,
    channelId,
    interaction.id,
    agent.name,
    agentModel,
    (botMessageId) => {
      const info = {
        sessionId: session.id,
        agentName: agent.name,
        agentModel,
        projectName: projectNameForFooter,
        displayColor: agentDisplayColor,
        displayIcon: agentDisplayIcon,
        avatarUrl: agentAvatarUrl,
        channelId,
        conversationOnly: true,
        minResponderPermLevel: toolPolicy.accessLabel === 'full' ? PermissionLevel.STANDARD : PermissionLevel.BASIC,
      };
      ctx.mentionSessions.set(botMessageId, info);
      try {
        saveMentionSession(ctx.db, botMessageId, info);
      } catch (err) {
        log.warn('Failed to persist message session', {
          botMessageId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    projectNameForFooter,
    agentDisplayColor,
    agentDisplayIcon,
    agentAvatarUrl,
  );

  log.info('Message command session started', {
    sessionId: session.id,
    agentName: agent.name,
    userId,
    channelId,
    toolAccess: toolPolicy.accessLabel,
    hasBuddy: false,
  });
}

interface BuddyAgentInfo {
  leadAgentName: string;
  leadAgentModel: string;
  buddyAgentName: string;
  buddyAgentModel: string;
  projectName: string;
  leadDisplayColor?: string | null;
  buddyDisplayColor?: string | null;
}

/**
 * Create a callback that posts buddy round outputs as Discord embeds.
 * Lead rounds get blue, buddy reviews get purple, approvals get green.
 * Tracks bot message IDs in mentionSessions so replies route correctly.
 */
function createBuddyDiscordCallback(
  ctx: InteractionContext,
  channelId: string,
  agentInfo: BuddyAgentInfo,
): (event: BuddyRoundEvent) => Promise<void> {
  return async (event: BuddyRoundEvent) => {
    const color = event.approved ? BUDDY_APPROVED_COLOR : event.role === 'lead' ? BUDDY_LEAD_COLOR : BUDDY_REVIEW_COLOR;

    const statusLabel = getBuddyStatusLabel(event.role, event.round, event.approved);
    const roleIcon = getBuddyRoleIcon(event.role, event.approved);
    const roundInfo = `${event.round}/${event.maxRounds}`;

    const content = event.content.length > 3900 ? `${event.content.slice(0, 3900)}\n\n*...truncated*` : event.content;

    const botMessageId = await sendEmbed(ctx.delivery, ctx.config.botToken, channelId, {
      description: content,
      color,
      footer: {
        text: buildFooterText({
          agentName: `${roleIcon} ${event.agentName}`,
          status: `${statusLabel} · Round ${roundInfo}`,
        }),
      },
    });

    if (botMessageId) {
      const isLead = event.role === 'lead';
      const sessionInfo = {
        sessionId: event.buddySessionId,
        agentName: isLead ? agentInfo.leadAgentName : agentInfo.buddyAgentName,
        agentModel: isLead ? agentInfo.leadAgentModel : agentInfo.buddyAgentModel,
        projectName: agentInfo.projectName,
        displayColor: isLead ? agentInfo.leadDisplayColor : agentInfo.buddyDisplayColor,
        channelId,
        conversationOnly: true,
        minResponderPermLevel: PermissionLevel.STANDARD,
      };
      ctx.mentionSessions.set(botMessageId, sessionInfo);
      try {
        saveMentionSession(ctx.db, botMessageId, sessionInfo);
      } catch (err) {
        log.warn('Failed to persist buddy mention session', {
          botMessageId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  };
}
