/**
 * WorkCommandRouter — Consolidates all [WORK] command routing logic.
 *
 * Two entry points feed into the same WorkTaskService:
 *
 * 1. **Slash command** (`/work <description>`) — from CommandHandler
 * 2. **Agent prefix** (`[WORK] <description>`) — from AgentMessenger
 *
 * Extracted from command-handler.ts and agent-messenger.ts to centralize
 * work task creation, completion callback registration, and error handling.
 *
 * @module
 */
import type { Database } from 'bun:sqlite';
import type { WorkTaskService } from '../work/service';
import {
    createAgentMessage,
    updateAgentMessageStatus,
    getAgentMessage,
} from '../db/agent-messages';
import { getProjectByName, listProjects } from '../db/projects';
import { listAgents } from '../db/agents';
import { ValidationError, NotFoundError } from '../lib/errors';
import { createLogger } from '../lib/logger';

const log = createLogger('WorkCommandRouter');

/** Parameters for handling an agent-to-agent [WORK] request. */
export interface AgentWorkRequestParams {
    fromAgentId: string;
    fromAgentName: string;
    toAgentId: string;
    content: string;
    paymentMicro: number;
    threadId: string;
    projectId?: string;
    /** Callback to emit message update events (for WS broadcast). */
    emitMessageUpdate: (messageId: string) => void;
}

/** Result of handling an agent [WORK] request. */
export interface AgentWorkRequestResult {
    message: import('../../shared/types').AgentMessage;
    sessionId: string | null;
}

export class WorkCommandRouter {
    private workTaskService: WorkTaskService | null = null;
    private db: Database;

    constructor(db: Database) {
        this.db = db;
    }

    /** Inject or update the WorkTaskService dependency. */
    setWorkTaskService(service: WorkTaskService): void {
        this.workTaskService = service;
    }

    /** Check whether a WorkTaskService is available. */
    get hasService(): boolean {
        return this.workTaskService !== null;
    }

    /**
     * Handle the `/work <description>` slash command from AlgoChat.
     *
     * Supports `--project <name>` flag to specify the target project.
     *
     * @param participant - The sender's address
     * @param description - The task description (already parsed, without `/work` prefix)
     * @param respond - Callback to send a response message
     * @param findAgent - Callback to resolve the agent for new conversations
     */
    handleSlashCommand(
        participant: string,
        description: string,
        respond: (text: string) => void,
        findAgent: () => string | null,
    ): void {
        if (!description) {
            respond('Usage: /work [--project <name>] <task description>');
            return;
        }

        if (!this.workTaskService) {
            respond('Work task service not available');
            return;
        }

        const agentId = findAgent();
        if (!agentId) {
            respond('No agent available for work tasks');
            return;
        }

        // Parse --project and --buddy flags
        let projectId: string | undefined;
        let buddyAgentId: string | undefined;
        let buddyMaxRounds: number | undefined;
        let taskDescription = description;

        // Parse --project flag
        const projectMatch = taskDescription.match(/--project\s+(\S+)/i);
        if (projectMatch) {
            const projectName = projectMatch[1];
            const project = getProjectByName(this.db, projectName);
            if (!project) {
                const available = listProjects(this.db).map(p => p.name).join(', ');
                respond(`Project not found: "${projectName}". Available: ${available}`);
                return;
            }
            projectId = project.id;
            taskDescription = taskDescription.replace(/--project\s+\S+/i, '').trim();
        }

        // Parse --buddy flag
        const buddyMatch = taskDescription.match(/--buddy\s+(\S+)/i);
        if (buddyMatch) {
            const buddyName = buddyMatch[1];
            const agents = listAgents(this.db);
            const buddyAgent = agents.find(a =>
                a.name.toLowerCase() === buddyName.toLowerCase() ||
                a.name.toLowerCase().replace(/\s+/g, '') === buddyName.toLowerCase().replace(/\s+/g, '')
            );
            if (!buddyAgent) {
                const names = agents.map(a => a.name).join(', ');
                respond(`Buddy agent not found: "${buddyName}". Available: ${names}`);
                return;
            }
            buddyAgentId = buddyAgent.id;
            taskDescription = taskDescription.replace(/--buddy\s+\S+/i, '').trim();
        }

        // Parse --rounds flag
        const roundsMatch = taskDescription.match(/--rounds\s+(\d+)/i);
        if (roundsMatch) {
            buddyMaxRounds = parseInt(roundsMatch[1], 10);
            taskDescription = taskDescription.replace(/--rounds\s+\d+/i, '').trim();
        }

        if (!taskDescription) {
            respond('Usage: /work [--project <name>] [--buddy <agent>] [--rounds <n>] <task description>');
            return;
        }

        this.workTaskService.create({
            agentId,
            description: taskDescription,
            projectId,
            source: 'algochat',
            requesterInfo: { participant },
            buddyConfig: buddyAgentId ? { buddyAgentId, maxRounds: buddyMaxRounds } : undefined,
        }).then((task) => {
            const lines = [
                `✓ Work task created: ${task.id}`,
                `Branch: ${task.branchName ?? '(creating...)'}`,
                `Status: ${task.status}`,
                '',
                'I\'ll notify you when it completes with the PR link.',
            ];
            respond(lines.join('\n'));

            this.workTaskService?.onComplete(task.id, (completed) => {
                if (completed.status === 'completed' && completed.prUrl) {
                    const completedLines = [
                        `✓ Work task completed: ${completed.id}`,
                        `PR: ${completed.prUrl}`,
                        ...(completed.summary ? [`Summary: ${completed.summary.slice(0, 500)}`] : []),
                    ];
                    respond(completedLines.join('\n'));
                } else {
                    respond(`✗ Work task failed: ${completed.id}\nError: ${completed.error ?? 'Unknown error'}`);
                }
            });
        }).catch((err) => {
            log.error('Slash command work task error', { error: err instanceof Error ? err.message : String(err) });
            respond('Work task creation failed. Check server logs for details.');
        });
    }

    /**
     * Handle a [WORK] prefix in an agent-to-agent message.
     *
     * Creates an agent_messages row, delegates to WorkTaskService for task
     * creation, and registers a completion callback that updates the message
     * status.
     *
     * @returns The created agent message and session ID, or throws on error.
     */
    async handleAgentWorkRequest(params: AgentWorkRequestParams): Promise<AgentWorkRequestResult> {
        const {
            fromAgentId,
            fromAgentName,
            toAgentId,
            content,
            paymentMicro,
            threadId,
            projectId,
            emitMessageUpdate,
        } = params;

        const description = content.slice('[WORK]'.length).trim();
        if (!description) {
            throw new ValidationError('[WORK] prefix requires a task description');
        }

        if (!this.workTaskService) {
            throw new NotFoundError('Work task service');
        }

        const agentMessage = createAgentMessage(this.db, {
            fromAgentId,
            toAgentId,
            content,
            paymentMicro,
            threadId,
        });

        try {
            const task = await this.workTaskService.create({
                agentId: toAgentId,
                description,
                projectId,
                source: 'agent',
                sourceId: agentMessage.id,
                requesterInfo: { fromAgentId, fromAgentName },
            });

            updateAgentMessageStatus(this.db, agentMessage.id, 'processing', { sessionId: task.sessionId ?? undefined });
            emitMessageUpdate(agentMessage.id);

            this.workTaskService.onComplete(task.id, (completed) => {
                if (completed.status === 'completed' && completed.prUrl) {
                    updateAgentMessageStatus(this.db, agentMessage.id, 'completed', {
                        response: `PR created: ${completed.prUrl}`,
                    });
                } else {
                    updateAgentMessageStatus(this.db, agentMessage.id, 'failed', {
                        response: completed.error ?? 'Work task failed',
                        errorCode: 'WORK_TASK_ERROR',
                    });
                }
                emitMessageUpdate(agentMessage.id);
            });

            return {
                message: getAgentMessage(this.db, agentMessage.id) ?? agentMessage,
                sessionId: task.sessionId,
            };
        } catch (err) {
            updateAgentMessageStatus(this.db, agentMessage.id, 'failed', {
                response: 'Work task creation failed',
                errorCode: 'WORK_TASK_ERROR',
            });
            emitMessageUpdate(agentMessage.id);
            throw err;
        }
    }
}
