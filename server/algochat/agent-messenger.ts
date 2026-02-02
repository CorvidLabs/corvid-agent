import type { Database } from 'bun:sqlite';
import type { AlgoChatConfig } from './config';
import type { AlgoChatService } from './service';
import type { AgentWalletService } from './agent-wallet';
import type { AgentDirectory } from './agent-directory';
import type { ProcessManager } from '../process/manager';
import type { AgentMessage } from '../../shared/types';
import type { ClaudeStreamEvent } from '../process/types';
import { extractContentText } from '../process/types';
import { getAgent } from '../db/agents';
import { createSession } from '../db/sessions';
import {
    createAgentMessage,
    updateAgentMessageStatus,
    getAgentMessage,
} from '../db/agent-messages';
import { createLogger } from '../lib/logger';

const log = createLogger('AgentMessenger');

const DEFAULT_PAYMENT_MICRO = 1000; // 0.001 ALGO

export interface AgentInvokeRequest {
    fromAgentId: string;
    toAgentId: string;
    content: string;
    paymentMicro?: number;
    projectId?: string;
}

export interface AgentInvokeResult {
    message: AgentMessage;
    sessionId: string | null;
}

export class AgentMessenger {
    private db: Database;
    private service: AlgoChatService | null;
    private agentWalletService: AgentWalletService;
    private agentDirectory: AgentDirectory;
    private processManager: ProcessManager;

    constructor(
        db: Database,
        _config: AlgoChatConfig,
        service: AlgoChatService | null,
        agentWalletService: AgentWalletService,
        agentDirectory: AgentDirectory,
        processManager: ProcessManager,
    ) {
        this.db = db;
        this.service = service;
        this.agentWalletService = agentWalletService;
        this.agentDirectory = agentDirectory;
        this.processManager = processManager;
    }

    async invoke(request: AgentInvokeRequest): Promise<AgentInvokeResult> {
        const { fromAgentId, toAgentId, content, projectId } = request;
        const paymentMicro = request.paymentMicro ?? DEFAULT_PAYMENT_MICRO;

        // Guards
        if (fromAgentId === toAgentId) {
            throw new Error('An agent cannot invoke itself');
        }

        const fromAgent = getAgent(this.db, fromAgentId);
        if (!fromAgent) throw new Error(`Source agent ${fromAgentId} not found`);

        const toAgent = getAgent(this.db, toAgentId);
        if (!toAgent) throw new Error(`Target agent ${toAgentId} not found`);

        // Create the agent_messages row
        const agentMessage = createAgentMessage(this.db, {
            fromAgentId,
            toAgentId,
            content,
            paymentMicro,
        });

        log.info(`Agent invoke: ${fromAgent.name} → ${toAgent.name}`, {
            messageId: agentMessage.id,
            paymentMicro,
        });

        // Send on-chain payment from Agent A → Agent B
        let txid: string | null = null;
        try {
            txid = await this.sendOnChainMessage(fromAgentId, toAgentId, content, paymentMicro);
        } catch (err) {
            log.warn('On-chain send failed, proceeding without txid', {
                error: err instanceof Error ? err.message : String(err),
            });
        }

        updateAgentMessageStatus(this.db, agentMessage.id, 'sent', { txid: txid ?? undefined });

        // Create a session for Agent B to process the message
        const resolvedProjectId = projectId ?? toAgent.defaultProjectId ?? this.getDefaultProjectId();
        const prompt = `Agent "${fromAgent.name}" sent you a message (${(paymentMicro / 1_000_000).toFixed(6)} ALGO):\n\n${content}`;

        const session = createSession(this.db, {
            projectId: resolvedProjectId,
            agentId: toAgentId,
            name: `Agent Msg: ${fromAgent.name} → ${toAgent.name}`,
            initialPrompt: prompt,
            source: 'agent',
        });

        updateAgentMessageStatus(this.db, agentMessage.id, 'processing', { sessionId: session.id });

        // Subscribe to session events and buffer the response
        this.subscribeForAgentResponse(agentMessage.id, session.id, fromAgentId, toAgentId);

        // Start the session process
        this.processManager.startProcess(session, prompt);

        const updatedMessage = getAgentMessage(this.db, agentMessage.id);
        return {
            message: updatedMessage ?? agentMessage,
            sessionId: session.id,
        };
    }

    private subscribeForAgentResponse(
        messageId: string,
        sessionId: string,
        fromAgentId: string,
        toAgentId: string,
    ): void {
        let responseBuffer = '';

        const callback = (sid: string, event: ClaudeStreamEvent) => {
            if (sid !== sessionId) return;

            if (event.type === 'assistant' && event.message?.content) {
                responseBuffer += extractContentText(event.message.content);
            }

            if (event.type === 'result' || event.type === 'session_exited') {
                this.processManager.unsubscribe(sessionId, callback);

                const response = responseBuffer.trim();
                if (!response) {
                    updateAgentMessageStatus(this.db, messageId, 'failed');
                    return;
                }

                // Send the response back on-chain from B → A
                this.sendOnChainMessage(toAgentId, fromAgentId, response, 0)
                    .then((responseTxid) => {
                        updateAgentMessageStatus(this.db, messageId, 'completed', {
                            response,
                            responseTxid: responseTxid ?? undefined,
                        });
                        log.info(`Agent message completed`, { messageId, responseTxid });
                    })
                    .catch((err) => {
                        // Still mark completed even if on-chain response fails
                        updateAgentMessageStatus(this.db, messageId, 'completed', { response });
                        log.warn('On-chain response send failed', {
                            messageId,
                            error: err instanceof Error ? err.message : String(err),
                        });
                    });
            }
        };

        this.processManager.subscribe(sessionId, callback);
    }

    private async sendOnChainMessage(
        fromAgentId: string,
        toAgentId: string,
        content: string,
        paymentMicro: number,
    ): Promise<string | null> {
        if (!this.service) return null;

        const fromAccount = await this.agentWalletService.getAgentChatAccount(fromAgentId);
        if (!fromAccount) {
            log.debug(`No wallet for agent ${fromAgentId}, skipping on-chain send`);
            return null;
        }

        const toEntry = await this.agentDirectory.resolve(toAgentId);
        if (!toEntry?.walletAddress) {
            log.debug(`No wallet address for agent ${toAgentId}, skipping on-chain send`);
            return null;
        }

        // Discover the target's public key for encryption
        let toPubKey: Uint8Array;
        try {
            toPubKey = await this.service.algorandService.discoverPublicKey(toEntry.walletAddress);
        } catch {
            log.debug(`Could not discover public key for ${toEntry.walletAddress}`);
            return null;
        }

        // Send encrypted message with optional payment
        const sendOptions = paymentMicro > 0 ? { amount: paymentMicro } : undefined;
        const result = await this.service.algorandService.sendMessage(
            fromAccount.account,
            toEntry.walletAddress,
            toPubKey,
            content,
            sendOptions,
        );

        log.info(`On-chain message sent`, {
            from: fromAccount.address,
            to: toEntry.walletAddress,
            txid: result.txid,
            paymentMicro,
        });

        return result.txid;
    }

    private getDefaultProjectId(): string {
        const { listProjects, createProject } = require('../db/projects');
        const projects = listProjects(this.db);
        if (projects.length > 0) return projects[0].id;

        const project = createProject(this.db, {
            name: 'Agent Messages',
            workingDir: process.cwd(),
        });
        return project.id;
    }
}
