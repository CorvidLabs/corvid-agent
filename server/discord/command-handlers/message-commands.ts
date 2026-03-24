/**
 * Discord /message command handler.
 *
 * Tiered tool access based on permission level:
 *   - BASIC/STANDARD: Memory + read-only tools (Read, Glob, Grep, corvid_recall_memory, corvid_read_on_chain_memories)
 *   - ADMIN: Full unrestricted tool access (same as /session)
 *
 * Supports optional buddy agent for post-response review.
 */

import type { InteractionContext } from '../commands';
import type { DiscordInteractionData } from '../types';
import { PermissionLevel } from '../types';
import type { SessionSource } from '../../../shared/types';
import { listAgents } from '../../db/agents';
import { createSession } from '../../db/sessions';
import { listProjects } from '../../db/projects';
import { createLogger } from '../../lib/logger';
import { withAuthorContext } from '../message-handler';
import { respondToInteraction, sendTypingIndicator } from '../embeds';
import { saveMentionSession } from '../../db/discord-mention-sessions';

const log = createLogger('DiscordMessageCommand');

/** Read-only built-in tools for non-admin /message sessions. */
const MESSAGE_BUILTIN_TOOLS = ['Read', 'Glob', 'Grep'];

/** MCP tools available to non-admin /message sessions (memory recall only). */
const MESSAGE_MCP_TOOLS = ['corvid_recall_memory', 'corvid_read_on_chain_memories'];

export async function handleMessageCommand(
    ctx: InteractionContext,
    interaction: DiscordInteractionData,
    permLevel: number,
    getOption: (name: string) => string | undefined,
    userId: string,
): Promise<void> {
    // /message is available at BASIC level — the first command for external users
    if (permLevel < PermissionLevel.BASIC) {
        await respondToInteraction(interaction, 'You do not have permission to use this command.');
        return;
    }

    const agentName = getOption('agent');
    const message = getOption('message');
    if (!agentName || !message) {
        await respondToInteraction(interaction, 'Please provide both an agent and a message.');
        return;
    }

    const buddyName = getOption('buddy');
    const buddyRounds = getOption('rounds');

    const agents = listAgents(ctx.db);
    if (agents.length === 0) {
        await respondToInteraction(interaction, 'No agents configured.');
        return;
    }

    // Strip model suffix like " (claude-opus-4-6)" if user typed the full display name
    const cleanAgentName = agentName.split(' (')[0].trim();
    const agent = agents.find(a =>
        a.name.toLowerCase() === cleanAgentName.toLowerCase() ||
        a.name.toLowerCase().replace(/\s+/g, '') === cleanAgentName.toLowerCase().replace(/\s+/g, '')
    );
    if (!agent) {
        const names = agents.map(a => a.name).join(', ');
        await respondToInteraction(interaction, `Agent not found: "${agentName}". Available: ${names}`);
        return;
    }

    // Resolve buddy agent if specified
    let buddyAgent: typeof agent | undefined;
    if (buddyName) {
        const cleanBuddyName = buddyName.split(' (')[0].trim();
        buddyAgent = agents.find(a =>
            a.name.toLowerCase() === cleanBuddyName.toLowerCase() ||
            a.name.toLowerCase().replace(/\s+/g, '') === cleanBuddyName.toLowerCase().replace(/\s+/g, '')
        );
        if (!buddyAgent) {
            const names = agents.map(a => a.name).join(', ');
            await respondToInteraction(interaction, `Buddy agent not found: "${buddyName}". Available: ${names}`);
            return;
        }
        if (buddyAgent.id === agent.id) {
            await respondToInteraction(interaction, 'An agent cannot be its own buddy. Choose a different buddy agent.');
            return;
        }
    }

    const allProjects = listProjects(ctx.db);
    const project = agent.defaultProjectId
        ? allProjects.find(p => p.id === agent.defaultProjectId) ?? allProjects[0]
        : allProjects[0];
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
    const isAdmin = permLevel >= PermissionLevel.ADMIN;
    const buddyLabel = buddyAgent ? ` with buddy **${buddyAgent.name}**` : '';
    const toolLabel = isAdmin ? ' (full access)' : '';
    await respondToInteraction(interaction, `**${agent.name}**${toolLabel} is thinking...${buddyLabel}`);

    // Start typing indicator
    sendTypingIndicator(ctx.config.botToken, channelId).catch(() => {});

    // Create session — admins get full access, others get memory + read-only.
    // Session name prefix determines tool tier on resume:
    //   "Discord full-message:" → full tools (admin)
    //   "Discord message:"      → restricted tools (memory + read-only)
    const sessionNamePrefix = isAdmin ? 'Discord full-message' : 'Discord message';
    const session = createSession(ctx.db, {
        projectId: project.id,
        agentId: agent.id,
        name: `${sessionNamePrefix}:${channelId}`,
        initialPrompt: message,
        source: 'discord' as SessionSource,
        // No workDir — even admin /message sessions don't need git isolation
    });

    const textWithContext = withAuthorContext(message, userId, username, channelId);

    // Tiered tool access:
    //   Admin: full tools (no conversationOnly, no toolAllowList)
    //   Non-admin: read-only built-in tools + memory MCP tools
    if (isAdmin) {
        ctx.processManager.startProcess(session, textWithContext);
    } else {
        ctx.processManager.startProcess(session, textWithContext, {
            toolAllowList: MESSAGE_BUILTIN_TOOLS,
            mcpToolAllowList: MESSAGE_MCP_TOOLS,
        });
    }

    // Subscribe for inline response — replies appear as channel messages
    // that users can reply to for follow-up conversation
    const agentModel = agent.model || 'unknown';
    const agentDisplayColor = agent.displayColor;
    const projectNameForFooter = project.name;
    // Non-admin sessions are restricted (memory + read-only), not fully conversationOnly
    const isConversationOnly = !isAdmin;

    ctx.subscribeForInlineResponse(
        session.id, channelId, interaction.id, agent.name, agentModel,
        (botMessageId) => {
            // Track the mention session so follow-up replies work
            const info = {
                sessionId: session.id,
                agentName: agent.name,
                agentModel,
                projectName: projectNameForFooter,
                displayColor: agentDisplayColor,
                channelId,
                conversationOnly: isConversationOnly,
            };
            // Persist to in-memory map
            ctx.mentionSessions.set(botMessageId, info);
            // Persist to DB for recovery after restart
            try {
                saveMentionSession(ctx.db, botMessageId, info);
            } catch (err) {
                log.warn('Failed to persist message session', {
                    botMessageId,
                    error: err instanceof Error ? err.message : String(err),
                });
            }

            // Trigger buddy review after response is posted (if buddy was specified)
            if (buddyAgent && ctx.buddyService) {
                const maxRounds = buddyRounds ? Math.max(1, Math.min(10, parseInt(buddyRounds, 10))) : undefined;
                ctx.buddyService.startSession({
                    leadAgentId: agent.id,
                    buddyAgentId: buddyAgent.id,
                    prompt: message,
                    source: 'discord',
                    maxRounds,
                }).catch(err => {
                    log.warn('Failed to start buddy review for /message', {
                        sessionId: session.id,
                        buddyAgentId: buddyAgent!.id,
                        error: err instanceof Error ? err.message : String(err),
                    });
                });
            }
        },
        projectNameForFooter, agentDisplayColor,
    );

    log.info('Message command session started', {
        sessionId: session.id,
        agentName: agent.name,
        userId,
        channelId,
        isAdmin,
        toolAccess: isAdmin ? 'full' : 'memory+read',
        hasBuddy: !!buddyAgent,
    });
}
