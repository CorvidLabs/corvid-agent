/**
 * Discord session and work command handlers.
 *
 * Handles `/session` (threaded conversations) and `/work` (async tasks).
 */

import type { InteractionContext } from '../commands';
import type { DiscordInteractionData } from '../types';
import { PermissionLevel, ButtonStyle } from '../types';
import type { SessionSource } from '../../../shared/types';
import { listAgents } from '../../db/agents';
import { createSession } from '../../db/sessions';
import { listProjects } from '../../db/projects';
import { createLogger } from '../../lib/logger';
import { resolveAndCreateWorktree } from '../../lib/worktree';
import {
    respondToInteraction,
    sendEmbed,
    sendEmbedWithButtons,
    buildActionRow,
    agentColor,
    hexColorToInt,
    buildFooterText,
} from '../embeds';

const log = createLogger('DiscordCommands');

export async function handleSessionCommand(
    ctx: InteractionContext,
    interaction: DiscordInteractionData,
    permLevel: number,
    getOption: (name: string) => string | undefined,
    userId: string,
): Promise<void> {
    if (permLevel < PermissionLevel.STANDARD) {
        await respondToInteraction(interaction, 'You need a higher role to create sessions. Try @mentioning the bot for a quick reply.');
        return;
    }
    const agentName = getOption('agent');
    const topic = getOption('topic');
    const projectName = getOption('project');
    if (!agentName || !topic) {
        await respondToInteraction(interaction, 'Please provide both an agent and a topic.');
        return;
    }

    const agents = listAgents(ctx.db);
    if (agents.length === 0) {
        await respondToInteraction(interaction, 'No agents configured. Create an agent first.');
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
    let project;
    if (projectName) {
        project = allProjects.find(p => p.name.toLowerCase() === projectName.toLowerCase());
        if (!project) {
            const names = allProjects.map(p => p.name).join(', ');
            await respondToInteraction(interaction, `Project not found: "${projectName}". Available: ${names}`);
            return;
        }
    } else {
        project = agent.defaultProjectId
            ? allProjects.find(p => p.id === agent.defaultProjectId) ?? allProjects[0]
            : allProjects[0];
    }
    if (!project) {
        await respondToInteraction(interaction, 'No projects configured.');
        return;
    }

    // Create a standalone thread in the channel where the command was invoked
    const threadName = `${agent.name} — ${topic}`;
    const targetChannelId = interaction.channel_id || ctx.config.channelId;
    const threadId = await ctx.createStandaloneThread(targetChannelId, threadName);
    if (!threadId) {
        await respondToInteraction(interaction, 'Failed to create conversation thread.');
        return;
    }

    // Create an isolated git worktree so this session doesn't
    // pollute the main working tree (matches inline-mention pattern).
    let workDir: string | undefined;
    if (project.workingDir || project.gitUrl) {
        const result = await resolveAndCreateWorktree(project, agent.name, crypto.randomUUID());
        if (result.success) {
            workDir = result.workDir;
        } else {
            // Worktree isolation is mandatory — running without it risks
            // cross-session contamination of the shared working directory.
            await respondToInteraction(interaction,
                `Failed to create isolated worktree: ${result.error ?? 'unknown error'}. Please try again.`);
            return;
        }
    }

    const session = createSession(ctx.db, {
        projectId: project.id,
        agentId: agent.id,
        name: `Discord thread:${threadId}`,
        initialPrompt: topic,
        source: 'discord' as SessionSource,
        workDir,
    });

    ctx.threadSessions.set(threadId, {
        sessionId: session.id,
        agentName: agent.name,
        agentModel: agent.model || 'unknown',
        ownerUserId: userId,
        topic,
        projectName: project.name,
        displayColor: agent.displayColor,
        creatorPermLevel: permLevel,
    });
    ctx.threadLastActivity.set(threadId, Date.now());

    ctx.processManager.startProcess(session, topic);
    ctx.subscribeForResponseWithEmbed(session.id, threadId, agent.name, agent.model || 'unknown', project.name, agent.displayColor);

    // Post a welcome embed with Stop button in the thread
    sendEmbedWithButtons(ctx.delivery, ctx.config.botToken, threadId, {
        description: `**${agent.name}** is working on: ${topic}`,
        color: hexColorToInt(agent.displayColor) ?? agentColor(agent.name),
        footer: { text: buildFooterText({ agentName: agent.name, agentModel: agent.model || 'unknown', sessionId: session.id, projectName: project.name }) },
    }, [
        buildActionRow(
            { label: 'Stop', customId: 'stop_session', style: ButtonStyle.DANGER, emoji: '⏹' },
        ),
    ]).catch((err) => log.debug('Failed to send welcome embed', { error: err instanceof Error ? err.message : String(err) }));

    await respondToInteraction(interaction,
        `Session started in <#${threadId}> with **${agent.name}**.\nTopic: ${topic}`);
}

export async function handleWorkCommand(
    ctx: InteractionContext,
    interaction: DiscordInteractionData,
    permLevel: number,
    getOption: (name: string) => string | undefined,
    userId: string,
): Promise<void> {
    if (permLevel < PermissionLevel.STANDARD) {
        await respondToInteraction(interaction, 'You need a higher role to create work tasks.');
        return;
    }
    if (!ctx.workTaskService) {
        await respondToInteraction(interaction, 'Work task service not available.');
        return;
    }

    const workDescription = getOption('description');
    if (!workDescription) {
        await respondToInteraction(interaction, 'Please provide a task description.');
        return;
    }

    const workAgentName = getOption('agent');
    const workProjectName = getOption('project');
    const buddyName = getOption('buddy');
    const buddyRounds = getOption('rounds');

    // Resolve agent
    const allAgents = listAgents(ctx.db);
    let workAgent;
    if (workAgentName) {
        // Strip model suffix like " (claude-opus-4-6)" if user typed the full display name
        const cleanWorkAgentName = workAgentName.split(' (')[0].trim();
        workAgent = allAgents.find(a =>
            a.name.toLowerCase() === cleanWorkAgentName.toLowerCase() ||
            a.name.toLowerCase().replace(/\s+/g, '') === cleanWorkAgentName.toLowerCase().replace(/\s+/g, '')
        );
        if (!workAgent) {
            const names = allAgents.map(a => a.name).join(', ');
            await respondToInteraction(interaction, `Agent not found: "${workAgentName}". Available: ${names}`);
            return;
        }
    } else {
        workAgent = ctx.config.defaultAgentId
            ? allAgents.find(a => a.id === ctx.config.defaultAgentId) ?? allAgents[0]
            : allAgents[0];
    }
    if (!workAgent) {
        await respondToInteraction(interaction, 'No agents configured.');
        return;
    }

    // Resolve project
    const workProjects = listProjects(ctx.db);
    let workProjectId: string | undefined;
    if (workProjectName) {
        const workProject = workProjects.find(p => p.name.toLowerCase() === workProjectName.toLowerCase());
        if (!workProject) {
            const names = workProjects.map(p => p.name).join(', ');
            await respondToInteraction(interaction, `Project not found: "${workProjectName}". Available: ${names}`);
            return;
        }
        workProjectId = workProject.id;
    }

    // Resolve buddy agent if specified
    let buddyAgent: typeof workAgent | undefined;
    if (buddyName) {
        const cleanBuddyName = buddyName.split(' (')[0].trim();
        buddyAgent = allAgents.find(a =>
            a.name.toLowerCase() === cleanBuddyName.toLowerCase() ||
            a.name.toLowerCase().replace(/\s+/g, '') === cleanBuddyName.toLowerCase().replace(/\s+/g, '')
        );
        if (!buddyAgent) {
            const names = allAgents.map(a => a.name).join(', ');
            await respondToInteraction(interaction, `Buddy agent not found: "${buddyName}". Available: ${names}`);
            return;
        }
    }

    if (buddyAgent && buddyAgent.id === workAgent.id) {
        await respondToInteraction(interaction, 'An agent cannot be its own buddy. Choose a different buddy agent.');
        return;
    }

    // Defer the response since task creation may take a moment
    const buddyLabel = buddyAgent ? ` with buddy **${buddyAgent.name}**` : '';
    await respondToInteraction(interaction, `Creating work task for **${workAgent.name}**${buddyLabel}...`);

    const channelId = interaction.channel_id;
    try {
        const task = await ctx.workTaskService.create({
            agentId: workAgent.id,
            description: workDescription,
            projectId: workProjectId,
            source: 'discord',
            requesterInfo: { discordUserId: userId },
            buddyConfig: buddyAgent ? {
                buddyAgentId: buddyAgent.id,
                maxRounds: buddyRounds ? Math.max(1, Math.min(10, parseInt(buddyRounds, 10))) : undefined,
            } : undefined,
        });

        // Send a rich confirmation embed in the channel
        if (channelId) {
            const fields: Array<{ name: string; value: string; inline?: boolean }> = [
                { name: 'Agent', value: workAgent.name, inline: true },
                { name: 'Status', value: 'In Progress', inline: true },
            ];
            if (buddyAgent) {
                fields.push({ name: 'Buddy', value: buddyAgent.name, inline: true });
            }
            if (task.branchName) {
                fields.push({ name: 'Branch', value: `\`${task.branchName}\``, inline: false });
            }

            await sendEmbed(ctx.delivery, ctx.config.botToken, channelId, {
                title: 'Work Task Created',
                description: workDescription.slice(0, 300) + (workDescription.length > 300 ? '...' : ''),
                color: 0x5865f2,
                fields,
                footer: { text: `Task: ${task.id} · You'll be notified when it completes` },
            });

            // Subscribe for completion notification
            ctx.workTaskService.onComplete(task.id, (completedTask) => {
                ctx.sendTaskResult(channelId, completedTask, userId).catch(err => {
                    log.error('Failed to send task result to Discord', {
                        taskId: completedTask.id,
                        error: err instanceof Error ? err.message : String(err),
                    });
                });
            });
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('Discord /work command failed', { error: message, userId });
        if (channelId) {
            await sendEmbed(ctx.delivery, ctx.config.botToken, channelId, {
                title: 'Work Task Failed',
                description: `Could not create work task: ${message.slice(0, 500)}`,
                color: 0xed4245,
            });
        }
    }
}
