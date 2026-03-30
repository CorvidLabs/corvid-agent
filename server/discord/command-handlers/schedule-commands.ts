/**
 * Discord schedule management command handlers.
 *
 * Handles `/schedule list|create|pause|resume|delete|templates` for managing
 * scheduled actions from Discord. Requires admin permissions for modifications.
 */

import type { InteractionContext } from '../commands';
import type { DiscordInteractionData } from '../types';
import { PermissionLevel } from '../types';
import { listAgents } from '../../db/agents';
import {
    listSchedules,
    getSchedule,
    createSchedule,
    updateSchedule,
    deleteSchedule,
} from '../../db/schedules';
import type { ScheduleAction, ScheduleActionType } from '../../../shared/types';
import { respondToInteraction, respondEphemeral, respondToInteractionEmbed } from '../embeds';
import { listPipelineTemplates, getPipelineTemplate } from '../../scheduler/pipeline';
import { createLogger } from '../../lib/logger';

const log = createLogger('DiscordScheduleCommands');

/**
 * Handles `/schedule` command with subcommands:
 * - list: Show all schedules (any user)
 * - create: Create a new schedule (admin)
 * - pause: Pause a schedule (admin)
 * - resume: Resume a schedule (admin)
 * - delete: Delete a schedule (admin)
 * - templates: List available pipeline templates (any user)
 */
export async function handleScheduleCommand(
    ctx: InteractionContext,
    interaction: DiscordInteractionData,
    permLevel: number,
): Promise<void> {
    const options = interaction.data?.options ?? [];
    const subcommand = options[0];

    // Backwards compatibility: no subcommand means "list"
    if (!subcommand || subcommand.type !== 1) {
        await handleScheduleList(ctx, interaction);
        return;
    }

    const subName = subcommand.name;
    const subOpts = subcommand.options ?? [];
    const getSubOption = (name: string) => subOpts.find(o => o.name === name)?.value as string | undefined;

    switch (subName) {
        case 'list':
            await handleScheduleList(ctx, interaction);
            break;
        case 'create':
            if (permLevel < PermissionLevel.ADMIN) {
                await respondEphemeral(interaction, 'Creating schedules requires admin permissions.');
                return;
            }
            await handleScheduleCreate(ctx, interaction, getSubOption);
            break;
        case 'pause':
            if (permLevel < PermissionLevel.ADMIN) {
                await respondEphemeral(interaction, 'Pausing schedules requires admin permissions.');
                return;
            }
            await handleSchedulePause(ctx, interaction, getSubOption);
            break;
        case 'resume':
            if (permLevel < PermissionLevel.ADMIN) {
                await respondEphemeral(interaction, 'Resuming schedules requires admin permissions.');
                return;
            }
            await handleScheduleResume(ctx, interaction, getSubOption);
            break;
        case 'delete':
            if (permLevel < PermissionLevel.ADMIN) {
                await respondEphemeral(interaction, 'Deleting schedules requires admin permissions.');
                return;
            }
            await handleScheduleDelete(ctx, interaction, getSubOption);
            break;
        case 'templates':
            await handleScheduleTemplates(interaction);
            break;
        default:
            await respondToInteraction(interaction, `Unknown subcommand: ${subName}`);
    }
}

// ─── Subcommand Handlers ─────────────────────────────────────────────────────

async function handleScheduleList(
    ctx: InteractionContext,
    interaction: DiscordInteractionData,
): Promise<void> {
    const schedules = listSchedules(ctx.db);
    if (schedules.length === 0) {
        await respondToInteraction(interaction, 'No schedules configured. Use `/schedule create` to add one.');
        return;
    }

    const lines = schedules.slice(0, 15).map(s => {
        const status = s.status === 'active' ? '\u{1F7E2}' : '\u{1F534}';
        const nextRun = s.nextRunAt
            ? `<t:${Math.floor(new Date(s.nextRunAt).getTime() / 1000)}:R>`
            : 'not scheduled';
        const lastRun = s.lastRunAt
            ? `<t:${Math.floor(new Date(s.lastRunAt).getTime() / 1000)}:R>`
            : 'never';
        const actions = s.actions.map(a => a.type).join(', ');
        return `${status} **${s.name}** (\`${s.id.slice(0, 8)}\`)\n  Actions: ${actions} · Next: ${nextRun} · Last: ${lastRun} · Runs: ${s.executionCount}`;
    });

    await respondToInteractionEmbed(interaction, {
        title: 'Schedules',
        description: lines.join('\n\n'),
        color: 0x57f287,
        footer: { text: `${schedules.length} schedule${schedules.length === 1 ? '' : 's'} total` },
    });
}

async function handleScheduleCreate(
    ctx: InteractionContext,
    interaction: DiscordInteractionData,
    getOption: (name: string) => string | undefined,
): Promise<void> {
    const name = getOption('name');
    const agentName = getOption('agent');
    const cron = getOption('cron');
    const actionType = getOption('action_type') ?? 'discord_post';
    const channelId = getOption('channel');
    const templateId = getOption('template');

    if (!name) {
        await respondToInteraction(interaction, 'Please provide a schedule name.');
        return;
    }

    // Resolve agent by name, or fall back to first agent
    const agents = listAgents(ctx.db);
    if (agents.length === 0) {
        await respondToInteraction(interaction, 'No agents configured.');
        return;
    }
    const agent = (agentName && agents.find(a => a.name === agentName)) || agents[0];

    // If using a template, resolve it
    if (templateId) {
        const template = getPipelineTemplate(templateId);
        if (!template) {
            const available = listPipelineTemplates().map(t => `\`${t.id}\``).join(', ');
            await respondToInteraction(interaction, `Unknown template: \`${templateId}\`. Available: ${available}`);
            return;
        }

        // Replace placeholder channelId in template steps
        const steps = template.steps.map(step => {
            if (step.action.channelId === 'CHANNEL_ID' && channelId) {
                return { ...step, action: { ...step.action, channelId } };
            }
            return step;
        });

        const schedule = createSchedule(ctx.db, {
            agentId: agent.id,
            name,
            description: `Created from template: ${template.name}`,
            cronExpression: cron ?? '0 9 * * *',
            actions: steps.map(s => s.action),
            executionMode: 'pipeline',
            pipelineSteps: steps,
            approvalPolicy: 'auto',
        });

        await respondToInteractionEmbed(interaction, {
            title: 'Schedule Created',
            description: `**${schedule.name}** using template \`${templateId}\`\nCron: \`${schedule.cronExpression}\`\nSteps: ${steps.length}`,
            color: 0x57f287,
            footer: { text: `ID: ${schedule.id}` },
        });
        log.info('Schedule created via Discord', { id: schedule.id, name, templateId });
        return;
    }

    // Direct schedule creation
    if (!cron) {
        await respondToInteraction(interaction, 'Please provide a cron expression (e.g., `0 9 * * *` for 9am daily).');
        return;
    }

    const actions: ScheduleAction[] = [{
        type: actionType as ScheduleActionType,
        ...(channelId ? { channelId } : {}),
        ...(actionType === 'discord_post' ? { message: `Scheduled post from "${name}"` } : {}),
    }];

    const schedule = createSchedule(ctx.db, {
        agentId: agent.id,
        name,
        description: `Created via Discord /schedule create`,
        cronExpression: cron,
        actions,
        approvalPolicy: 'auto',
    });

    await respondToInteractionEmbed(interaction, {
        title: 'Schedule Created',
        description: `**${schedule.name}**\nAction: \`${actionType}\`\nCron: \`${cron}\``,
        color: 0x57f287,
        footer: { text: `ID: ${schedule.id}` },
    });
    log.info('Schedule created via Discord', { id: schedule.id, name, actionType });
}

async function handleSchedulePause(
    ctx: InteractionContext,
    interaction: DiscordInteractionData,
    getOption: (name: string) => string | undefined,
): Promise<void> {
    const scheduleId = getOption('schedule');
    const schedule = resolveSchedule(ctx, scheduleId);

    if (!schedule) {
        await respondToInteraction(interaction, scheduleId
            ? `Schedule not found: \`${scheduleId}\``
            : 'Please provide a schedule ID (use `/schedule list` to see IDs).');
        return;
    }

    if (schedule.status === 'paused') {
        await respondToInteraction(interaction, `Schedule **${schedule.name}** is already paused.`);
        return;
    }

    updateSchedule(ctx.db, schedule.id, { status: 'paused' });
    await respondToInteractionEmbed(interaction, {
        title: 'Schedule Paused',
        description: `**${schedule.name}** has been paused.`,
        color: 0xfee75c,
        footer: { text: `ID: ${schedule.id}` },
    });
    log.info('Schedule paused via Discord', { id: schedule.id, name: schedule.name });
}

async function handleScheduleResume(
    ctx: InteractionContext,
    interaction: DiscordInteractionData,
    getOption: (name: string) => string | undefined,
): Promise<void> {
    const scheduleId = getOption('schedule');
    const schedule = resolveSchedule(ctx, scheduleId);

    if (!schedule) {
        await respondToInteraction(interaction, scheduleId
            ? `Schedule not found: \`${scheduleId}\``
            : 'Please provide a schedule ID (use `/schedule list` to see IDs).');
        return;
    }

    if (schedule.status === 'active') {
        await respondToInteraction(interaction, `Schedule **${schedule.name}** is already active.`);
        return;
    }

    updateSchedule(ctx.db, schedule.id, { status: 'active' });
    await respondToInteractionEmbed(interaction, {
        title: 'Schedule Resumed',
        description: `**${schedule.name}** is now active.`,
        color: 0x57f287,
        footer: { text: `ID: ${schedule.id}` },
    });
    log.info('Schedule resumed via Discord', { id: schedule.id, name: schedule.name });
}

async function handleScheduleDelete(
    ctx: InteractionContext,
    interaction: DiscordInteractionData,
    getOption: (name: string) => string | undefined,
): Promise<void> {
    const scheduleId = getOption('schedule');
    const schedule = resolveSchedule(ctx, scheduleId);

    if (!schedule) {
        await respondToInteraction(interaction, scheduleId
            ? `Schedule not found: \`${scheduleId}\``
            : 'Please provide a schedule ID (use `/schedule list` to see IDs).');
        return;
    }

    deleteSchedule(ctx.db, schedule.id);
    await respondToInteractionEmbed(interaction, {
        title: 'Schedule Deleted',
        description: `**${schedule.name}** has been deleted.`,
        color: 0xed4245,
        footer: { text: `ID: ${schedule.id}` },
    });
    log.info('Schedule deleted via Discord', { id: schedule.id, name: schedule.name });
}

async function handleScheduleTemplates(
    interaction: DiscordInteractionData,
): Promise<void> {
    const templates = listPipelineTemplates();
    const lines = templates.map(t => {
        const steps = t.steps.map(s => s.action.type).join(' → ');
        return `**${t.name}** (\`${t.id}\`)\n  ${t.description}\n  Steps: ${steps}`;
    });

    await respondToInteractionEmbed(interaction, {
        title: 'Pipeline Templates',
        description: lines.join('\n\n'),
        color: 0x5865f2,
        footer: { text: `${templates.length} templates available · Use with /schedule create --template <id>` },
    });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Resolve a schedule by full or partial ID. */
function resolveSchedule(ctx: InteractionContext, idOrPrefix: string | undefined) {
    if (!idOrPrefix) return null;
    // Try exact match first
    const exact = getSchedule(ctx.db, idOrPrefix);
    if (exact) return exact;
    // Try prefix match
    const all = listSchedules(ctx.db);
    return all.find(s => s.id.startsWith(idOrPrefix)) ?? null;
}
