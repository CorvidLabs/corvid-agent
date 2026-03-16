/**
 * Discord informational command handlers.
 *
 * Handles `/agents`, `/status`, `/tasks`, `/schedule`, `/config`,
 * `/quickstart`, and `/help` commands.
 */

import type { InteractionContext } from '../commands';
import type { DiscordInteractionData } from '../types';
import { PermissionLevel } from '../types';
import { listAgents } from '../../db/agents';
import { getActiveWorkTasks, countPendingTasks, countActiveTasks } from '../../db/work-tasks';
import { listActiveSchedules } from '../../db/schedules';
import {
    respondToInteraction,
    respondToInteractionEmbed,
} from '../embeds';

export async function handleAgentsCommand(
    ctx: InteractionContext,
    interaction: DiscordInteractionData,
): Promise<void> {
    const agents = listAgents(ctx.db);
    if (agents.length === 0) {
        await respondToInteraction(interaction, 'No agents configured.');
        return;
    }
    const lines = agents.map(a => `\u2022 **${a.name}** (${a.model || 'no model'})`);
    await respondToInteraction(interaction, `Available agents:\n${lines.join('\n')}`);
}

export async function handleStatusCommand(
    ctx: InteractionContext,
    interaction: DiscordInteractionData,
): Promise<void> {
    const activeSessions = ctx.threadSessions.size;
    await respondToInteraction(interaction,
        `Active thread sessions: **${activeSessions}**\nUse \`/session\` to start a new conversation.`);
}

export async function handleTasksCommand(
    ctx: InteractionContext,
    interaction: DiscordInteractionData,
): Promise<void> {
    const active = getActiveWorkTasks(ctx.db);
    const pendingCount = countPendingTasks(ctx.db);
    const activeCount = countActiveTasks(ctx.db);

    if (active.length === 0 && pendingCount === 0) {
        await respondToInteraction(interaction, 'No active or pending work tasks.');
        return;
    }

    const statusEmoji: Record<string, string> = {
        running: '\u{1F7E2}', branching: '\u{1F7E1}', validating: '\u{1F535}',
        queued: '\u{23F3}', paused: '\u{23F8}',
    };

    const taskLines = active.slice(0, 10).map(t => {
        const emoji = statusEmoji[t.status] || '\u{26AA}';
        const desc = t.description.slice(0, 80) + (t.description.length > 80 ? '...' : '');
        return `${emoji} **${t.status}** — ${desc}`;
    });

    const fields: Array<{ name: string; value: string; inline?: boolean }> = [
        { name: 'Active', value: String(activeCount), inline: true },
        { name: 'Pending', value: String(pendingCount), inline: true },
    ];

    if (taskLines.length > 0) {
        fields.push({ name: 'Tasks', value: taskLines.join('\n'), inline: false });
    }

    await respondToInteractionEmbed(interaction, {
        title: 'Work Tasks',
        color: 0x5865f2,
        fields,
        footer: { text: `Showing up to 10 active tasks` },
    });
}

export async function handleScheduleCommand(
    ctx: InteractionContext,
    interaction: DiscordInteractionData,
): Promise<void> {
    const schedules = listActiveSchedules(ctx.db);
    if (schedules.length === 0) {
        await respondToInteraction(interaction, 'No active schedules configured.');
        return;
    }

    const lines = schedules.slice(0, 15).map(s => {
        const nextRun = s.nextRunAt
            ? `<t:${Math.floor(new Date(s.nextRunAt).getTime() / 1000)}:R>`
            : 'not scheduled';
        const lastRun = s.lastRunAt
            ? `<t:${Math.floor(new Date(s.lastRunAt).getTime() / 1000)}:R>`
            : 'never';
        return `\u2022 **${s.name}** — next: ${nextRun} · last: ${lastRun} · runs: ${s.executionCount}`;
    });

    await respondToInteractionEmbed(interaction, {
        title: 'Schedules',
        description: lines.join('\n'),
        color: 0x57f287,
        footer: { text: `${schedules.length} active schedule${schedules.length === 1 ? '' : 's'}` },
    });
}

export async function handleConfigCommand(
    ctx: InteractionContext,
    interaction: DiscordInteractionData,
    permLevel: number,
): Promise<void> {
    if (permLevel < PermissionLevel.ADMIN) {
        await respondToInteraction(interaction, 'Only admins can view bot configuration.');
        return;
    }
    const configFields: Array<{ name: string; value: string; inline?: boolean }> = [
        { name: 'Mode', value: ctx.config.mode || 'chat', inline: true },
        { name: 'Public Mode', value: ctx.config.publicMode ? 'enabled' : 'disabled', inline: true },
        { name: 'Active Sessions', value: String(ctx.threadSessions.size), inline: true },
        { name: 'Channel', value: `<#${ctx.config.channelId}>`, inline: true },
        { name: 'Default Permission', value: String(ctx.config.defaultPermissionLevel ?? 1), inline: true },
    ];

    const additionalChannels = ctx.config.additionalChannelIds ?? [];
    if (additionalChannels.length > 0) {
        configFields.push({
            name: 'Additional Channels',
            value: additionalChannels.map(id => `<#${id}>`).join(', '),
            inline: false,
        });
    }

    await respondToInteractionEmbed(interaction, {
        title: 'Bot Configuration',
        color: 0x5865f2,
        fields: configFields,
    }, true); // ephemeral — only visible to the admin
}

export async function handleQuickstartCommand(
    ctx: InteractionContext,
    interaction: DiscordInteractionData,
): Promise<void> {
    const agents = listAgents(ctx.db);
    const agentCount = agents.length;
    const firstAgent = agents[0]?.name ?? 'your agent';

    const steps = [
        '**1. Start a session**',
        `Use \`/session\` to pick an agent and topic. ${agentCount > 0 ? `Try \`/session ${firstAgent} Hello!\`` : 'Set up an agent first in the dashboard.'}`,
        '',
        '**2. Chat in the thread**',
        'A new thread is created for your conversation. Send messages and the agent will respond.',
        '',
        '**3. Quick one-off replies**',
        `@mention the bot in the channel for a fast reply without creating a thread.`,
        '',
        '**4. Explore commands**',
        'Use `/help` to see all available commands and what they do.',
    ].join('\n');

    await respondToInteractionEmbed(interaction, {
        title: 'Welcome to CorvidAgent!',
        description: steps,
        color: 0x5865f2,
        fields: [
            {
                name: 'Available Agents',
                value: agentCount > 0
                    ? agents.slice(0, 5).map(a => `\`${a.name}\` — ${a.model || 'unknown'}`).join('\n')
                        + (agentCount > 5 ? `\n_...and ${agentCount - 5} more (use \`/agents\`)_` : '')
                    : '_No agents configured yet — check the dashboard._',
                inline: false,
            },
        ],
        footer: { text: 'Use /help to see all commands' },
    });
}

export async function handleHelpCommand(
    interaction: DiscordInteractionData,
): Promise<void> {
    await respondToInteractionEmbed(interaction, {
        title: 'CorvidAgent Commands',
        color: 0x5865f2,
        fields: [
            {
                name: 'Conversations',
                value: [
                    '`/session <agent> <topic>` — Start a threaded conversation',
                    '`/quickstart` — Guided walkthrough for new users',
                    '`@mention` — Quick one-off reply in channel',
                ].join('\n'),
                inline: false,
            },
            {
                name: 'Information',
                value: [
                    '`/agents` — List all available agents and models',
                    '`/status` — Show active sessions and bot status',
                    '`/tasks` — View active work tasks and queue status',
                    '`/schedule` — Show schedule status and next runs',
                    '`/help` — Show this help message',
                ].join('\n'),
                inline: false,
            },
            {
                name: 'Advanced',
                value: [
                    '`/council <topic>` — Launch a multi-agent council deliberation',
                    '`/mute <user>` — Mute a user (admin)',
                    '`/unmute <user>` — Unmute a user (admin)',
                ].join('\n'),
                inline: false,
            },
            {
                name: 'Admin Configuration',
                value: [
                    '`/config` — Show current bot configuration',
                    '`/admin channels add/remove/list` — Manage monitored channels',
                    '`/admin users add/remove/list` — Manage allowed users',
                    '`/admin roles set/remove/list` — Manage role permissions',
                    '`/admin mode <chat|work_intake>` — Set bridge mode',
                    '`/admin public <on|off>` — Toggle public mode',
                    '`/admin show` — Show current configuration',
                ].join('\n'),
                inline: false,
            },
        ],
        footer: { text: 'New here? Try /quickstart for a guided walkthrough' },
    });
}
