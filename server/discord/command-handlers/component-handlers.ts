/**
 * Discord button/component interaction handlers.
 *
 * Handles resume_thread, new_session, archive_thread, and stop_session
 * button clicks from Discord message components.
 */

import type { GuildMember, MessageComponentInteraction, RepliableInteraction } from 'discord.js';
import type { SessionSource } from '../../../shared/types';
import { listAgents } from '../../db/agents';
import { deleteThreadSession, saveThreadSession, updateThreadSessionActivity } from '../../db/discord-thread-sessions';
import { listProjects } from '../../db/projects';
import { createSession, getSession } from '../../db/sessions';
import { createLogger } from '../../lib/logger';
import { resolveAndCreateWorktree } from '../../lib/worktree';
import type { InteractionContext } from '../commands';
import { acknowledgeButton, assertSnowflake, respondEphemeral, respondToInteraction } from '../embeds';
import { resolvePermissionLevel } from '../permissions';
import type { ThreadSessionInfo } from '../thread-manager';
import { archiveThread, resolveDefaultAgent } from '../thread-manager';
import { PermissionLevel } from '../types';

// discord.js types RepliableInteraction as a union of concrete subtypes (ButtonInteraction,
// SelectMenuInteraction, etc.), so MessageComponentInteraction — the abstract base — is not
// directly assignable. Cast once here so the embeds helpers can accept it.
function asRepliable(i: MessageComponentInteraction): RepliableInteraction {
  return i as unknown as RepliableInteraction;
}

const log = createLogger('DiscordCommands');

export async function handleComponentInteraction(
  ctx: InteractionContext,
  interaction: MessageComponentInteraction,
): Promise<void> {
  const customId = interaction.customId;
  if (!customId) return;

  const userId = interaction.user.id;

  const memberRoles: string[] = [];
  if (interaction.member) {
    const m = interaction.member;
    if ('cache' in (m.roles as object)) {
      memberRoles.push(...(m.roles as GuildMember['roles']).cache.keys());
    } else if (Array.isArray(m.roles)) {
      memberRoles.push(...m.roles);
    }
  }

  const permLevel = resolvePermissionLevel(
    ctx.config,
    ctx.mutedUsers,
    userId,
    memberRoles,
    interaction.channelId ?? undefined,
  );
  const ri = asRepliable(interaction);
  if (permLevel <= PermissionLevel.BLOCKED) {
    await respondEphemeral(ri, 'You do not have permission to use this bot.');
    return;
  }

  const [action] = customId.split(':');

  switch (action) {
    case 'resume_thread': {
      if (permLevel < PermissionLevel.STANDARD) {
        await respondEphemeral(ri, 'You need a higher role to resume sessions.');
        return;
      }
      const threadId = interaction.channelId;
      const info = ctx.threadSessions.get(threadId) ?? tryRecoverThreadFromCtx(ctx, threadId);
      if (!info) {
        await respondToInteraction(ri, 'No session found for this thread. Use `/session` to start a new one.');
        return;
      }

      // Un-archive the thread if it was archived
      await unarchiveThread(threadId);

      // Don't resubscribe here — the process isn't running yet.
      // subscribeForResponseWithEmbed will be called by routeToThread when
      // the user sends a message and resumeProcess actually starts the process.
      // Subscribing now would start the zombie-detection timer against a
      // non-running process, triggering a false "session ended unexpectedly" embed.
      ctx.threadLastActivity.set(threadId, Date.now());
      updateThreadSessionActivity(ctx.db, threadId);

      await acknowledgeButton(ri, 'Session resumed — send a message to continue.');
      break;
    }

    case 'new_session': {
      if (permLevel < PermissionLevel.STANDARD) {
        await respondEphemeral(ri, 'You need a higher role to create sessions.');
        return;
      }

      const threadId = interaction.channelId;
      const prevInfo = ctx.threadSessions.get(threadId);

      // Stop existing session if still running
      if (prevInfo && ctx.processManager.isRunning(prevInfo.sessionId)) {
        ctx.processManager.stopProcess(prevInfo.sessionId);
        const cb = ctx.threadCallbacks.get(threadId);
        if (cb) {
          ctx.processManager.unsubscribe(cb.sessionId, cb.callback);
          ctx.threadCallbacks.delete(threadId);
        }
      }

      // Resolve agent and project from previous session or defaults
      const agent = prevInfo ? listAgents(ctx.db).find((a) => a.name === prevInfo.agentName) : undefined;
      const resolvedAgent = agent ?? resolveDefaultAgent(ctx.db, ctx.config);
      if (!resolvedAgent) {
        await respondToInteraction(ri, 'No agents configured. Use `/session` to start manually.');
        return;
      }

      const projects = listProjects(ctx.db);
      const project = prevInfo?.projectName
        ? (projects.find((p) => p.name.toLowerCase() === prevInfo.projectName!.toLowerCase()) ?? projects[0])
        : projects[0];
      if (!project) {
        await respondToInteraction(ri, 'No projects configured.');
        return;
      }

      // Create worktree
      let workDir: string | undefined;
      if (project.workingDir || project.gitUrl) {
        const result = await resolveAndCreateWorktree(project, resolvedAgent.name, crypto.randomUUID());
        if (result.success) workDir = result.workDir;
      }

      const newSession = createSession(ctx.db, {
        projectId: project.id,
        agentId: resolvedAgent.id,
        name: `Discord thread:${threadId}`,
        initialPrompt: prevInfo?.topic ?? 'New session',
        source: 'discord' as SessionSource,
        workDir,
        keepAlive: true,
      });

      const threadInfo: ThreadSessionInfo = {
        sessionId: newSession.id,
        agentName: resolvedAgent.name,
        agentModel: resolvedAgent.model || 'unknown',
        ownerUserId: userId,
        topic: prevInfo?.topic,
        projectName: project.name,
        displayColor: resolvedAgent.displayColor,
        displayIcon: resolvedAgent.displayIcon,
        avatarUrl: resolvedAgent.avatarUrl,
        creatorPermLevel: permLevel,
      };
      ctx.threadSessions.set(threadId, threadInfo);
      ctx.threadLastActivity.set(threadId, Date.now());
      saveThreadSession(ctx.db, threadId, threadInfo);

      ctx.subscribeForResponseWithEmbed(
        newSession.id,
        threadId,
        resolvedAgent.name,
        resolvedAgent.model || 'unknown',
        project.name,
        resolvedAgent.displayColor,
        resolvedAgent.displayIcon,
        resolvedAgent.avatarUrl,
      );

      ctx.processManager.startProcess(newSession, 'New session started. Ready for instructions.');

      await acknowledgeButton(ri, `New session started with **${resolvedAgent.name}** on **${project.name}**.`);
      break;
    }

    case 'continue_thread': {
      if (permLevel < PermissionLevel.STANDARD) {
        await respondEphemeral(ri, 'You need a higher role to create threads.');
        return;
      }

      // Extract session ID from custom_id (format: continue_thread:sessionId)
      const parts = customId.split(':');
      const sourceSessionId = parts[1];
      const sourceSession = sourceSessionId ? getSession(ctx.db, sourceSessionId) : null;

      // Resolve agent
      const ctAgent = resolveDefaultAgent(ctx.db, ctx.config);
      if (!ctAgent) {
        await respondToInteraction(ri, 'No agents configured.');
        return;
      }

      const ctProjects = listProjects(ctx.db);
      const ctProject = ctAgent.defaultProjectId
        ? (ctProjects.find((p) => p.id === ctAgent.defaultProjectId) ?? ctProjects[0])
        : ctProjects[0];
      if (!ctProject) {
        await respondToInteraction(ri, 'No projects configured.');
        return;
      }

      // Create thread from the channel
      const sourceChannelId = interaction.channelId;
      const threadName = `${ctAgent.name} — continued`;
      const newThreadId = await ctx.createStandaloneThread(sourceChannelId, threadName);
      if (!newThreadId) {
        await respondToInteraction(ri, 'Failed to create thread. Try using `/session` instead.');
        return;
      }

      // Create worktree
      let ctWorkDir: string | undefined;
      if (ctProject.workingDir || ctProject.gitUrl) {
        const result = await resolveAndCreateWorktree(ctProject, ctAgent.name, crypto.randomUUID());
        if (result.success) ctWorkDir = result.workDir;
      }

      const ctSession = createSession(ctx.db, {
        projectId: ctProject.id,
        agentId: ctAgent.id,
        name: `Discord thread:${newThreadId}`,
        initialPrompt: 'Continued from channel mention',
        source: 'discord' as SessionSource,
        workDir: ctWorkDir,
        keepAlive: true,
      });

      const ctThreadInfo: ThreadSessionInfo = {
        sessionId: ctSession.id,
        agentName: ctAgent.name,
        agentModel: ctAgent.model || 'unknown',
        ownerUserId: userId,
        projectName: ctProject.name,
        displayColor: ctAgent.displayColor,
        displayIcon: ctAgent.displayIcon,
        avatarUrl: ctAgent.avatarUrl,
        creatorPermLevel: permLevel,
      };
      ctx.threadSessions.set(newThreadId, ctThreadInfo);
      ctx.threadLastActivity.set(newThreadId, Date.now());
      saveThreadSession(ctx.db, newThreadId, ctThreadInfo);

      ctx.subscribeForResponseWithEmbed(
        ctSession.id,
        newThreadId,
        ctAgent.name,
        ctAgent.model || 'unknown',
        ctProject.name,
        ctAgent.displayColor,
        ctAgent.displayIcon,
        ctAgent.avatarUrl,
      );

      // Carry context from the source session if available
      const contextMsg = sourceSession
        ? 'Continued from a channel conversation. The user clicked "Continue in Thread" to move this conversation here. Greet them and ask how you can help.'
        : 'New thread session started from a channel conversation. Greet the user and ask how you can help.';
      ctx.processManager.startProcess(ctSession, contextMsg);

      await acknowledgeButton(ri, `Thread created! Continue the conversation in <#${newThreadId}>.`);
      break;
    }

    case 'create_issue': {
      if (permLevel < PermissionLevel.STANDARD) {
        await respondEphemeral(ri, 'You need a higher role to create issues.');
        return;
      }

      const ciThreadId = interaction.channelId;
      const ciInfo = ctx.threadSessions.get(ciThreadId);
      if (!ciInfo) {
        await respondToInteraction(ri, 'No session found in this thread. Cannot create an issue without context.');
        return;
      }

      // Resume or send a message to the session asking it to create an issue
      const ciSession = getSession(ctx.db, ciInfo.sessionId);
      if (ciSession && ctx.processManager.isRunning(ciInfo.sessionId)) {
        ctx.processManager.sendMessage(
          ciInfo.sessionId,
          '[System: The user clicked the "Create Issue" button. Create a GitHub issue summarizing the key findings, decisions, or work done in this conversation. Ask the user to confirm the title and description before submitting.]',
        );
        await acknowledgeButton(ri, 'Creating issue from conversation — check the thread for details.');
      } else {
        await respondToInteraction(
          ri,
          'Session is no longer active. Send a message first to start a new session, then ask to create an issue.',
        );
      }
      break;
    }

    case 'archive_thread': {
      const threadId = interaction.channelId;
      const info = ctx.threadSessions.get(threadId);

      // Clean up subscriptions if any
      const cb = ctx.threadCallbacks.get(threadId);
      if (cb) {
        ctx.processManager.unsubscribe(cb.sessionId, cb.callback);
        ctx.threadCallbacks.delete(threadId);
      }
      ctx.threadSessions.delete(threadId);
      ctx.threadLastActivity.delete(threadId);
      deleteThreadSession(ctx.db, threadId);

      // Stop the process if still running
      if (info && ctx.processManager.isRunning(info.sessionId)) {
        ctx.processManager.stopProcess(info.sessionId);
      }

      await acknowledgeButton(ri, 'Thread archived.');
      await archiveThread(threadId);
      break;
    }

    case 'stop_session': {
      const threadId = interaction.channelId;
      const info = ctx.threadSessions.get(threadId);
      if (!info) {
        await respondToInteraction(ri, 'No active session in this thread.');
        return;
      }

      if (info.ownerUserId && info.ownerUserId !== userId && permLevel < PermissionLevel.ADMIN) {
        await respondEphemeral(ri, 'Only the session owner or an admin can stop this session.');
        return;
      }

      ctx.processManager.stopProcess(info.sessionId);
      const cb = ctx.threadCallbacks.get(threadId);
      if (cb) {
        ctx.processManager.unsubscribe(cb.sessionId, cb.callback);
        ctx.threadCallbacks.delete(threadId);
      }

      // Trigger buddy review if configured
      if (info.buddyConfig && ctx.buddyService) {
        const agentId = ctx.db
          .query<{ agent_id: string }, [string]>('SELECT agent_id FROM sessions WHERE id = ? LIMIT 1')
          .get(info.sessionId)?.agent_id;
        if (agentId) {
          ctx.buddyService
            .startSession({
              leadAgentId: agentId,
              buddyAgentId: info.buddyConfig.buddyAgentId,
              prompt: info.topic ?? 'End-of-session review',
              source: 'discord',
              sessionId: info.sessionId,
              maxRounds: info.buddyConfig.maxRounds,
            })
            .catch((err) => {
              log.warn('Failed to start buddy review for /session', {
                sessionId: info.sessionId,
                error: err instanceof Error ? err.message : String(err),
              });
            });
          await acknowledgeButton(ri, `Session stopped. **${info.buddyConfig.buddyAgentName}** is reviewing...`);
        } else {
          await acknowledgeButton(ri, 'Session stopped.');
        }
      } else {
        await acknowledgeButton(ri, 'Session stopped.');
      }
      break;
    }

    default:
      log.debug('Unknown button custom_id', { customId });
      await respondToInteraction(ri, 'Unknown action.');
  }
}

/** Try to recover a thread session from the database. Used by component interactions. */
function tryRecoverThreadFromCtx(ctx: InteractionContext, threadId: string): ThreadSessionInfo | null {
  try {
    const row = ctx.db
      .query(
        `SELECT s.id, s.agent_id, s.initial_prompt, a.name as agent_name, a.model as agent_model, p.name as project_name
             FROM sessions s
             LEFT JOIN agents a ON a.id = s.agent_id
             LEFT JOIN projects p ON p.id = s.project_id
             WHERE s.name = ? AND s.source = 'discord'
             ORDER BY s.created_at DESC LIMIT 1`,
      )
      .get(`Discord thread:${threadId}`) as {
      id: string;
      agent_id: string;
      initial_prompt: string;
      agent_name: string;
      agent_model: string;
      project_name: string | null;
    } | null;

    if (!row) {
      log.info('No session found in DB for thread recovery', { threadId, searchName: `Discord thread:${threadId}` });
      return null;
    }

    log.info('Recovered thread session from DB', { threadId, sessionId: row.id, agentName: row.agent_name });
    const info: ThreadSessionInfo = {
      sessionId: row.id,
      agentName: row.agent_name || 'Agent',
      agentModel: row.agent_model || 'unknown',
      ownerUserId: '',
      topic: row.initial_prompt || undefined,
      projectName: row.project_name || undefined,
    };
    ctx.threadSessions.set(threadId, info);
    // Persist to dedicated thread sessions table for future fast recovery
    const { saveThreadSession } =
      require('../../db/discord-thread-sessions') as typeof import('../../db/discord-thread-sessions');
    saveThreadSession(ctx.db, threadId, info);
    return info;
  } catch (err) {
    log.error('Failed to recover thread session from DB', {
      threadId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** Un-archive a thread so it can receive messages again. */
async function unarchiveThread(threadId: string): Promise<void> {
  assertSnowflake(threadId, 'thread ID');
  try {
    const { getRestClient } = await import('../rest-client');
    await getRestClient().modifyChannel(threadId, { archived: false });
  } catch (err) {
    log.debug('Failed to unarchive thread', { threadId, error: err instanceof Error ? err.message : String(err) });
  }
}
