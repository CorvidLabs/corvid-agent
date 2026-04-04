/**
 * Discord informational command handlers.
 *
 * Handles `/agents`, `/status`, `/tasks`, `/config`,
 * `/quickstart`, `/dashboard`, `/help`, and `/tools` commands.
 */

import { listAgents } from '../../db/agents';
import { listActiveSchedules } from '../../db/schedules';
import { countActiveTasks, countPendingTasks, getActiveWorkTasks } from '../../db/work-tasks';
import { getToolCatalog, getToolCatalogGrouped, TOOL_CATEGORIES } from '../../mcp/tool-catalog';
import type { InteractionContext } from '../commands';
import {
  type DiscordEmbed,
  respondToInteraction,
  respondToInteractionEmbed,
  respondToInteractionEmbeds,
} from '../embeds';
import type { DiscordInteractionData } from '../types';

export async function handleAgentsCommand(ctx: InteractionContext, interaction: DiscordInteractionData): Promise<void> {
  const agents = listAgents(ctx.db);
  if (agents.length === 0) {
    await respondToInteraction(interaction, 'No agents configured.');
    return;
  }
  const lines = agents.map((a) => `\u2022 **${a.name}** (${a.model || 'no model'})`);
  await respondToInteraction(interaction, `Available agents:\n${lines.join('\n')}`);
}

/** Format seconds into a human-readable uptime string. */
export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Measure DB latency with a trivial query. */
export function measureDbLatency(db: import('bun:sqlite').Database): number {
  const start = performance.now();
  db.query('SELECT 1').get();
  return Math.round((performance.now() - start) * 100) / 100;
}

/** Get server version from package.json. */
function getVersion(): string {
  try {
    return (require('../../../package.json') as { version: string }).version;
  } catch {
    return 'unknown';
  }
}

export async function handleStatusCommand(ctx: InteractionContext, interaction: DiscordInteractionData): Promise<void> {
  const version = getVersion();
  const uptimeSeconds = Math.floor(process.uptime());
  const dbLatency = measureDbLatency(ctx.db);

  const agents = listAgents(ctx.db);
  const activeSessions = ctx.threadSessions.size;
  const activeTaskCount = countActiveTasks(ctx.db);
  const pendingTaskCount = countPendingTasks(ctx.db);

  const schedules = listActiveSchedules(ctx.db);
  const scheduleCount = schedules.length;

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: 'Version', value: `v${version}`, inline: true },
    { name: 'Uptime', value: formatUptime(uptimeSeconds), inline: true },
    { name: 'DB Latency', value: `${dbLatency}ms`, inline: true },
    { name: 'Agents', value: String(agents.length), inline: true },
    { name: 'Active Sessions', value: String(activeSessions), inline: true },
    { name: 'Tasks', value: `${activeTaskCount} active \u00b7 ${pendingTaskCount} pending`, inline: true },
    { name: 'Schedules', value: `${scheduleCount} active`, inline: true },
  ];

  const statusColor = dbLatency < 100 ? 0x57f287 : dbLatency < 500 ? 0xfee75c : 0xed4245;

  await respondToInteractionEmbed(interaction, {
    title: 'System Status',
    color: statusColor,
    fields,
    footer: { text: 'Use /dashboard for a full overview' },
    timestamp: new Date().toISOString(),
  });
}

export async function handleTasksCommand(ctx: InteractionContext, interaction: DiscordInteractionData): Promise<void> {
  const active = getActiveWorkTasks(ctx.db);
  const pendingCount = countPendingTasks(ctx.db);
  const activeCount = countActiveTasks(ctx.db);

  if (active.length === 0 && pendingCount === 0) {
    await respondToInteraction(interaction, 'No active or pending work tasks.');
    return;
  }

  const statusEmoji: Record<string, string> = {
    running: '\u{1F7E2}',
    branching: '\u{1F7E1}',
    validating: '\u{1F535}',
    queued: '\u{23F3}',
    paused: '\u{23F8}',
  };

  const taskLines = active.slice(0, 10).map((t) => {
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

// handleScheduleCommand moved to ./schedule-commands.ts

export async function handleConfigCommand(
  ctx: InteractionContext,
  interaction: DiscordInteractionData,
  _permLevel: number,
): Promise<void> {
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
      value: additionalChannels.map((id) => `<#${id}>`).join(', '),
      inline: false,
    });
  }

  await respondToInteractionEmbed(
    interaction,
    {
      title: 'Bot Configuration',
      color: 0x5865f2,
      fields: configFields,
    },
    true,
  ); // ephemeral — only visible to the admin
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
        value:
          agentCount > 0
            ? agents
                .slice(0, 5)
                .map((a) => `\`${a.name}\` — ${a.model || 'unknown'}`)
                .join('\n') + (agentCount > 5 ? `\n_...and ${agentCount - 5} more (use \`/agents\`)_` : '')
            : '_No agents configured yet — check the dashboard._',
        inline: false,
      },
    ],
    footer: { text: 'Use /help to see all commands' },
  });
}

export async function handleDashboardCommand(
  ctx: InteractionContext,
  interaction: DiscordInteractionData,
): Promise<void> {
  const version = getVersion();
  const uptimeSeconds = Math.floor(process.uptime());
  const dbLatency = measureDbLatency(ctx.db);

  const agents = listAgents(ctx.db);
  const activeSessions = ctx.threadSessions.size;
  const activeTaskCount = countActiveTasks(ctx.db);
  const pendingTaskCount = countPendingTasks(ctx.db);
  const activeTasks = getActiveWorkTasks(ctx.db);
  const schedules = listActiveSchedules(ctx.db);

  const statusColor = dbLatency < 100 ? 0x57f287 : dbLatency < 500 ? 0xfee75c : 0xed4245;

  // Embed 1: System overview
  const overviewEmbed: DiscordEmbed = {
    title: 'Dashboard — System Overview',
    color: statusColor,
    fields: [
      { name: 'Version', value: `v${version}`, inline: true },
      { name: 'Uptime', value: formatUptime(uptimeSeconds), inline: true },
      { name: 'DB Latency', value: `${dbLatency}ms`, inline: true },
    ],
    timestamp: new Date().toISOString(),
  };

  // Embed 2: Agent roster — mark agents with active thread sessions
  const activeAgentNames = new Set<string>();
  for (const info of ctx.threadSessions.values()) {
    activeAgentNames.add(info.agentName);
  }

  const agentLines =
    agents.length > 0
      ? agents.slice(0, 10).map((a) => {
          const indicator = activeAgentNames.has(a.name) ? '\u{1F7E2}' : '\u{26AA}';
          return `${indicator} **${a.name}** \u2014 ${a.model || 'no model'}`;
        })
      : ['_No agents configured._'];

  const agentEmbed: DiscordEmbed = {
    title: 'Agents',
    description: agentLines.join('\n'),
    color: 0x5865f2,
    fields: [
      { name: 'Total', value: String(agents.length), inline: true },
      { name: 'Active Sessions', value: String(activeSessions), inline: true },
    ],
  };

  // Embed 3: Work pipeline
  const statusEmoji: Record<string, string> = {
    running: '\u{1F7E2}',
    branching: '\u{1F7E1}',
    validating: '\u{1F535}',
    queued: '\u{23F3}',
    paused: '\u{23F8}',
  };

  const taskLines = activeTasks.slice(0, 5).map((t) => {
    const emoji = statusEmoji[t.status] || '\u{26AA}';
    const desc = t.description.slice(0, 60) + (t.description.length > 60 ? '...' : '');
    return `${emoji} **${t.status}** \u2014 ${desc}`;
  });

  const workEmbed: DiscordEmbed = {
    title: 'Work Pipeline',
    description: taskLines.length > 0 ? taskLines.join('\n') : '_No active tasks._',
    color: 0xeb459e,
    fields: [
      { name: 'Active', value: String(activeTaskCount), inline: true },
      { name: 'Pending', value: String(pendingTaskCount), inline: true },
    ],
  };

  // Embed 4: Schedule health
  const scheduleLines = schedules.slice(0, 8).map((s) => {
    const nextRun = s.nextRunAt ? `<t:${Math.floor(new Date(s.nextRunAt).getTime() / 1000)}:R>` : 'not scheduled';
    return `\u2022 **${s.name}** \u2014 next: ${nextRun} \u00b7 runs: ${s.executionCount}`;
  });

  const scheduleEmbed: DiscordEmbed = {
    title: 'Schedules',
    description: scheduleLines.length > 0 ? scheduleLines.join('\n') : '_No active schedules._',
    color: 0x57f287,
    footer: { text: `${schedules.length} schedule${schedules.length === 1 ? '' : 's'} active` },
  };

  await respondToInteractionEmbeds(interaction, [overviewEmbed, agentEmbed, workEmbed, scheduleEmbed]);
}

export async function handleHelpCommand(interaction: DiscordInteractionData): Promise<void> {
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
          '`/status` — Show system status and key metrics',
          '`/dashboard` — Comprehensive system overview',
          '`/tasks` — View active work tasks and queue status',
          '`/schedule` — Show schedule status and next runs',
          '`/tools` — Browse the MCP tool catalog',
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

export async function handleToolsCommand(
  interaction: DiscordInteractionData,
  getOption: (name: string) => string | undefined,
): Promise<void> {
  const category = getOption('category');

  if (category) {
    // Single category — show detailed tool list
    const { tools } = getToolCatalog(category);
    const cat = TOOL_CATEGORIES.find((c) => c.name === category);
    if (tools.length === 0) {
      await respondToInteraction(interaction, `No tools found in category "${category}".`);
      return;
    }

    const toolLines = tools.map((t) => {
      const flags = [t.conditional ? '\u{1F527}' : '', t.restricted ? '\u{1F512}' : ''].filter(Boolean).join('');
      return `\u2022 \`${t.name}\` — ${t.description}${flags ? ` ${flags}` : ''}`;
    });

    await respondToInteractionEmbed(interaction, {
      title: `Tools — ${cat?.label ?? category}`,
      description: cat?.description ?? '',
      color: 0x5865f2,
      fields: [
        { name: `${tools.length} tool${tools.length === 1 ? '' : 's'}`, value: toolLines.join('\n'), inline: false },
      ],
      footer: { text: '\u{1F527} = requires special service \u00b7 \u{1F512} = restricted' },
    });
  } else {
    // Overview — show all categories with tool counts
    const grouped = getToolCatalogGrouped();
    const totalTools = grouped.reduce((sum, g) => sum + g.tools.length, 0);

    const fields = grouped.map((g) => ({
      name: `${g.category.label} (${g.tools.length})`,
      value:
        g.tools
          .slice(0, 4)
          .map((t) => `\`${t.name}\``)
          .join(', ') + (g.tools.length > 4 ? ` _+${g.tools.length - 4} more_` : ''),
      inline: false,
    }));

    await respondToInteractionEmbed(interaction, {
      title: 'MCP Tool Catalog',
      description: `**${totalTools} tools** across ${grouped.length} categories. Use \`/tools category:<name>\` to see details.`,
      color: 0x5865f2,
      fields,
      footer: { text: 'Also available at GET /api/tools' },
    });
  }
}
