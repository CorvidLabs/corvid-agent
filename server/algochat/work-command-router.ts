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
            respond('Usage: /work <task description>');
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

        this.workTaskService.create({
            agentId,
            description,
            source: 'algochat',
            requesterInfo: { participant },
        }).then((task) => {
            respond(`Work task started: ${task.id}\nBranch: ${task.branchName ?? 'creating...'}\nStatus: ${task.status}`);

            this.workTaskService?.onComplete(task.id, (completed) => {
                if (completed.status === 'completed' && completed.prUrl) {
                    respond(`Work task completed!\nPR: ${completed.prUrl}`);
                } else {
                    respond(`Work task failed: ${completed.error ?? 'Unknown error'}`);
                }
            });
        }).catch((err) => {
            respond(`Work task error: ${err instanceof Error ? err.message : String(err)}`);
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
            throw new Error('[WORK] prefix requires a task description');
        }

        if (!this.workTaskService) {
            throw new Error('Work task service not available');
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
                response: `Work task error: ${err instanceof Error ? err.message : String(err)}`,
            });
            emitMessageUpdate(agentMessage.id);
            throw err;
        }
    }
}
