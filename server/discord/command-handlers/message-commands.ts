/**
 * Discord /message command handler.
 *
 * Lightweight sandbox mode — ALL users (including admins) get the same
 * restricted tool set: read-only code tools + memory recall. For full
 * tool access, use /session or @mention.
 *
 * Supports optional buddy agent for post-response review with visible
 * round-by-round embeds in the channel.
 */

import type { InteractionContext } from '../commands';
import type { DiscordInteractionData } from '../types';
import { PermissionLevel } from '../types';
import type { SessionSource } from '../../../shared/types';
import type { BuddyRoundEvent } from '../../../shared/types/buddy';
import { listAgents } from '../../db/agents';
import { createSession } from '../../db/sessions';
import { listProjects } from '../../db/projects';
import { createLogger } from '../../lib/logger';
import { withAuthorContext } from '../message-handler';
import { respondToInteraction, sendTypingIndicator, sendEmbed, buildFooterText } from '../embeds';
import { saveMentionSession } from '../../db/discord-mention-sessions';

const log = createLogger('DiscordMessageCommand');

/** Read-only built-in tools for all /message sessions. */
export const MESSAGE_BUILTIN_TOOLS = ['Read', 'Glob', 'Grep'];

/** MCP tools available to all /message sessions (memory recall only). */
export const MESSAGE_MCP_TOOLS = ['corvid_recall_memory', 'corvid_read_on_chain_memories'];

/** Buddy role colors for Discord embeds. */
const BUDDY_LEAD_COLOR = 0x3498db;   // Blue — lead agent
const BUDDY_REVIEW_COLOR = 0x9b59b6; // Purple — buddy reviewer
const BUDDY_APPROVED_COLOR = 0x2ecc71; // Green — buddy approved

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
    const buddyLabel = buddyAgent ? ` with buddy **${buddyAgent.name}**` : '';
    await respondToInteraction(interaction, `**${agent.name}** is thinking...${buddyLabel}`);

    // Start typing indicator
    sendTypingIndicator(ctx.config.botToken, channelId).catch(() => {});

    // All /message sessions use restricted tools — no admin bypass.
    // For full tool access, use /session or @mention.
    const session = createSession(ctx.db, {
        projectId: project.id,
        agentId: agent.id,
        name: `Discord message:${channelId}`,
        initialPrompt: message,
        source: 'discord' as SessionSource,
        // No workDir — restricted tools means no git isolation needed
    });

    const textWithContext = withAuthorContext(message, userId, username, channelId);

    // All /message sessions get the same sandboxed tool set
    ctx.processManager.startProcess(session, textWithContext, {
        toolAllowList: MESSAGE_BUILTIN_TOOLS,
        mcpToolAllowList: MESSAGE_MCP_TOOLS,
    });

    // Subscribe for inline response — replies appear as channel messages
    // that users can reply to for follow-up conversation
    const agentModel = agent.model || 'unknown';
    const agentDisplayColor = agent.displayColor;
    const projectNameForFooter = project.name;

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
                conversationOnly: true,
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
                    // Post each buddy round as a visible embed in the channel
                    onRoundComplete: createBuddyDiscordCallback(ctx, channelId),
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
        toolAccess: 'memory+read',
        hasBuddy: !!buddyAgent,
    });
}

/**
 * Create a callback that posts buddy round outputs as Discord embeds.
 * Lead rounds get blue, buddy reviews get purple, approvals get green.
 */
function createBuddyDiscordCallback(
    ctx: InteractionContext,
    channelId: string,
): (event: BuddyRoundEvent) => Promise<void> {
    return async (event: BuddyRoundEvent) => {
        const color = event.approved
            ? BUDDY_APPROVED_COLOR
            : event.role === 'lead'
                ? BUDDY_LEAD_COLOR
                : BUDDY_REVIEW_COLOR;

        const roleLabel = event.role === 'lead' ? '💬' : event.approved ? '✅' : '🔍';
        const roundLabel = `Round ${event.round}/${event.maxRounds}`;

        // Truncate content for Discord embed limit (4096 chars)
        const content = event.content.length > 3900
            ? event.content.slice(0, 3900) + '\n\n*...truncated*'
            : event.content;

        await sendEmbed(ctx.delivery, ctx.config.botToken, channelId, {
            description: content,
            color,
            footer: {
                text: buildFooterText({
                    agentName: `${roleLabel} ${event.agentName}`,
                    status: `${event.role} · ${roundLabel}`,
                }),
            },
        });
    };
}
