/**
 * Discord /message command handler.
 *
 * Pure conversation — no tools, no code execution, no web searches.
 * This is the first public-facing command for untrusted users.
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
    await respondToInteraction(interaction, `**${agent.name}** is thinking...`);

    // Start typing indicator
    sendTypingIndicator(ctx.config.botToken, channelId).catch(() => {});

    // Create session with NO worktree (no coding tools = no git isolation needed)
    // Session name prefix "Discord message:" signals conversation-only mode
    const session = createSession(ctx.db, {
        projectId: project.id,
        agentId: agent.id,
        name: `Discord message:${channelId}`,
        initialPrompt: message,
        source: 'discord' as SessionSource,
        // No workDir — conversation only, no coding
    });

    const textWithContext = withAuthorContext(message, userId, username, channelId);

    // Start the process in conversation-only mode (zero tools)
    ctx.processManager.startProcess(session, textWithContext, { conversationOnly: true });

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
        },
        projectNameForFooter, agentDisplayColor,
    );

    log.info('Message command session started', {
        sessionId: session.id,
        agentName: agent.name,
        userId,
        channelId,
        conversationOnly: true,
    });
}
