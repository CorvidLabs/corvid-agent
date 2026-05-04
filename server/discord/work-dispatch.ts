/**
 * Discord work-task dispatch.
 *
 * Handles /work intake from monitored channels and sends task lifecycle
 * status embeds back to the originating channel.
 */

import type { WorkTask } from '../../shared/types/work-tasks';
import { listAgents } from '../db/agents';
import { createLogger } from '../lib/logger';
import { CorvidEmbed, EMBED_COLORS, sendDiscordMessage, sendEmbed, sendMessageWithEmbed } from './embeds';
import type { MessageHandlerContext } from './message-router';

const log = createLogger('DiscordWorkDispatch');

/** Replace Discord mention IDs with @username, strip unresolved ones. */
function resolveMentions(
  text: string,
  mentions?: Array<{ id: string; username: string }>,
  botUserId?: string | null,
): string {
  let resolved = text;
  for (const mention of mentions ?? []) {
    if (mention.id === botUserId) continue;
    resolved = resolved.replace(new RegExp(`<@!?${mention.id}>`, 'g'), `@${mention.username}`);
  }
  return resolved.replace(/<@!?\d+>/g, '').trim();
}

export async function handleWorkIntake(
  ctx: MessageHandlerContext,
  channelId: string,
  messageId: string,
  userId: string,
  text: string,
  mentions?: Array<{ id: string; username: string }>,
): Promise<void> {
  if (!ctx.workTaskService) {
    await sendDiscordMessage(
      ctx.delivery,
      ctx.config.botToken,
      channelId,
      'Work intake mode requires WorkTaskService. Check server configuration.',
    );
    return;
  }

  const description = resolveMentions(text, mentions, ctx.botUserId);
  if (!description) {
    await sendDiscordMessage(ctx.delivery, ctx.config.botToken, channelId, 'Please provide a task description.');
    return;
  }

  const agents = listAgents(ctx.db);
  const agent = ctx.config.defaultAgentId
    ? (agents.find((a) => a.id === ctx.config.defaultAgentId) ?? agents[0])
    : agents[0];
  if (!agent) {
    await sendDiscordMessage(
      ctx.delivery,
      ctx.config.botToken,
      channelId,
      'No agents configured. Create an agent first.',
    );
    return;
  }

  try {
    const task = await ctx.workTaskService.create({
      agentId: agent.id,
      description,
      source: 'discord',
      sourceId: messageId,
      requesterInfo: { discordUserId: userId, channelId, messageId },
    });

    log.info('Work task created from Discord', { taskId: task.id, userId });

    const { embed: queuedEmbed } = CorvidEmbed.workTaskQueued(task.id, description, task.status).build();
    await sendEmbed(ctx.delivery, ctx.config.botToken, channelId, queuedEmbed);

    ctx.workTaskService.onStatusChange(task.id, (updatedTask) => {
      const activeStatuses = new Set(['branching', 'running', 'validating']);
      if (activeStatuses.has(updatedTask.status)) {
        const { embed: statusEmbed } = CorvidEmbed.workTaskStatus(
          updatedTask.id,
          updatedTask.status,
          updatedTask.iterationCount,
        ).build();
        sendEmbed(ctx.delivery, ctx.config.botToken, channelId, statusEmbed).catch((err) => {
          log.debug('Failed to send work task status embed', {
            taskId: updatedTask.id,
            status: updatedTask.status,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    });

    ctx.workTaskService.onComplete(task.id, (completedTask) => {
      sendTaskResult(ctx, channelId, completedTask).catch((err) => {
        log.error('Failed to send task result to Discord', {
          taskId: completedTask.id,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('Failed to create work task from Discord', { error: message, userId });

    const { embed: failEmbed } = new CorvidEmbed()
      .setTitle('Task Failed')
      .setDescription(message.slice(0, 500))
      .setColor(EMBED_COLORS.error)
      .build();
    await sendEmbed(ctx.delivery, ctx.config.botToken, channelId, failEmbed);
  }
}

export async function sendTaskResult(
  ctx: MessageHandlerContext,
  channelId: string,
  task: WorkTask,
  mentionUserId?: string,
): Promise<void> {
  const mention = mentionUserId ? `<@${mentionUserId}> ` : '';

  if (task.status === 'completed') {
    const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

    if (task.prUrl) {
      fields.push({ name: 'Pull Request', value: task.prUrl, inline: false });
    }
    if (task.summary) {
      fields.push({ name: 'Summary', value: task.summary.slice(0, 1024), inline: false });
    }
    if (task.branchName) {
      fields.push({ name: 'Branch', value: `\`${task.branchName}\``, inline: true });
    }
    fields.push({ name: 'Iterations', value: String(task.iterationCount), inline: true });

    const { embed: completedEmbed } = CorvidEmbed.workTaskCompleted(task.id, task.description)
      .setFields(fields)
      .build();
    await sendMessageWithEmbed(
      ctx.delivery,
      ctx.config.botToken,
      channelId,
      mention ? `${mention}Your work task is done!` : undefined,
      completedEmbed,
    );
  } else if (task.status === 'failed') {
    const errorFields: Array<{ name: string; value: string; inline?: boolean }> = [
      ...((task.error ? [{ name: 'Error', value: task.error.slice(0, 1024), inline: false }] : []) as Array<{
        name: string;
        value: string;
        inline?: boolean;
      }>),
      { name: 'Iterations', value: String(task.iterationCount), inline: true },
    ];
    const { embed: failedEmbed } = CorvidEmbed.workTaskFailed(task.id, task.description)
      .setFields(errorFields)
      .build();
    await sendMessageWithEmbed(
      ctx.delivery,
      ctx.config.botToken,
      channelId,
      mention ? `${mention}Your work task encountered an issue.` : undefined,
      failedEmbed,
    );
  }
}
