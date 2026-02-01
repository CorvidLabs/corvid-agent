import type { Database } from 'bun:sqlite';
import type { ProcessManager } from '../process/manager';
import type { AlgoChatConfig } from './config';
import type { AlgoChatService } from './service';
import type { AlgoChatStatus } from '../../shared/types';
import {
    getConversationByParticipant,
    createConversation,
    updateConversationRound,
    listConversations,
} from '../db/sessions';
import { getAgent, getAlgochatEnabledAgents } from '../db/agents';
import { createSession } from '../db/sessions';
import type { ClaudeStreamEvent } from '../process/types';
import { extractContentText } from '../process/types';

export type AlgoChatEventCallback = (
    participant: string,
    content: string,
    direction: 'inbound' | 'outbound',
) => void;

export type LocalChatSendFn = (
    participant: string,
    content: string,
    direction: 'inbound' | 'outbound',
) => void;

export class AlgoChatBridge {
    private db: Database;
    private processManager: ProcessManager;
    private config: AlgoChatConfig;
    private service: AlgoChatService;
    private eventCallbacks: Set<AlgoChatEventCallback> = new Set();
    private publicKeyCache: Map<string, Uint8Array> = new Map();
    private localAgentSessions: Map<string, string> = new Map();

    constructor(
        db: Database,
        processManager: ProcessManager,
        config: AlgoChatConfig,
        service: AlgoChatService,
    ) {
        this.db = db;
        this.processManager = processManager;
        this.config = config;
        this.service = service;

        this.setupMessageHandler();
    }

    start(): void {
        this.service.syncManager.start();
        console.log('[AlgoChat Bridge] Started listening for messages');
    }

    stop(): void {
        this.service.syncManager.stop();
        console.log('[AlgoChat Bridge] Stopped');
    }

    onEvent(callback: AlgoChatEventCallback): void {
        this.eventCallbacks.add(callback);
    }

    offEvent(callback: AlgoChatEventCallback): void {
        this.eventCallbacks.delete(callback);
    }

    getStatus(): AlgoChatStatus {
        const conversations = listConversations(this.db);
        return {
            enabled: true,
            address: this.service.chatAccount.address,
            network: this.config.network,
            syncInterval: this.config.syncInterval,
            activeConversations: conversations.length,
        };
    }

    /**
     * Handle a message from the browser dashboard chat UI.
     * Routes through the same agent→session→process flow, but sends the
     * response back via the provided callback instead of on-chain.
     */
    async handleLocalMessage(
        agentId: string,
        content: string,
        sendFn: LocalChatSendFn,
    ): Promise<void> {
        const agent = getAgent(this.db, agentId);
        if (!agent) {
            console.error(`[AlgoChat Bridge] Agent ${agentId} not found`);
            return;
        }

        sendFn('local', content, 'inbound');

        const existingSessionId = this.localAgentSessions.get(agentId);

        if (existingSessionId) {
            const sent = this.processManager.sendMessage(existingSessionId, content);
            if (sent) {
                this.subscribeForLocalResponse(existingSessionId, sendFn);
                return;
            }

            // Session not running — try to resume
            const { getSession } = await import('../db/sessions');
            const session = getSession(this.db, existingSessionId);
            if (session) {
                this.subscribeForLocalResponse(session.id, sendFn);
                this.processManager.resumeProcess(session, content);
                return;
            }
        }

        // Create a new session
        const projectId = this.getDefaultProjectId();
        const session = createSession(this.db, {
            projectId,
            agentId,
            name: `Chat: ${agent.name}`,
            initialPrompt: content,
            source: 'web',
        });

        this.localAgentSessions.set(agentId, session.id);
        this.subscribeForLocalResponse(session.id, sendFn);
        this.processManager.startProcess(session, content);
    }

    private setupMessageHandler(): void {
        this.service.syncManager.on('onMessagesReceived', (participant, messages) => {
            for (const msg of messages) {
                this.handleIncomingMessage(participant, msg.content, msg.confirmedRound).catch((err) => {
                    console.error('[AlgoChat Bridge] Error handling message:', err);
                });
            }
        });
    }

    private async handleIncomingMessage(
        participant: string,
        content: string,
        confirmedRound: number,
    ): Promise<void> {
        console.log(`[AlgoChat Bridge] Message from ${participant}: ${content.slice(0, 100)}`);
        this.emitEvent(participant, content, 'inbound');

        let conversation = getConversationByParticipant(this.db, participant);

        if (!conversation) {
            const agentId = this.findAgentForNewConversation();
            if (!agentId) {
                console.log('[AlgoChat Bridge] No AlgoChat-enabled agent found, ignoring message');
                return;
            }

            const agent = getAgent(this.db, agentId);
            if (!agent) return;

            const session = createSession(this.db, {
                projectId: this.getDefaultProjectId(),
                agentId,
                name: `AlgoChat: ${participant.slice(0, 8)}...`,
                initialPrompt: content,
                source: 'algochat',
            });

            conversation = createConversation(this.db, participant, agentId, session.id);

            this.subscribeForResponse(session.id, participant);
            this.processManager.startProcess(session, content);
        } else {
            if (conversation.sessionId) {
                const sent = this.processManager.sendMessage(conversation.sessionId, content);
                if (!sent) {
                    const { getSession } = await import('../db/sessions');
                    const session = getSession(this.db, conversation.sessionId);
                    if (session) {
                        this.subscribeForResponse(session.id, participant);
                        this.processManager.resumeProcess(session, content);
                    }
                }
            }
        }

        updateConversationRound(this.db, conversation.id, confirmedRound);
    }

    private subscribeForResponse(sessionId: string, participant: string): void {
        let responseBuffer = '';

        const callback = (sid: string, event: ClaudeStreamEvent) => {
            if (sid !== sessionId) return;

            if (event.type === 'assistant' && event.message?.content) {
                responseBuffer += extractContentText(event.message.content);
            }

            if (event.type === 'result' || event.type === 'session_exited') {
                this.processManager.unsubscribe(sessionId, callback);

                if (responseBuffer.trim()) {
                    this.sendResponse(participant, responseBuffer.trim());
                }
            }
        };

        this.processManager.subscribe(sessionId, callback);
    }

    private subscribeForLocalResponse(sessionId: string, sendFn: LocalChatSendFn): void {
        let responseBuffer = '';

        const callback = (sid: string, event: ClaudeStreamEvent) => {
            if (sid !== sessionId) return;

            if (event.type === 'assistant' && event.message?.content) {
                responseBuffer += extractContentText(event.message.content);
            }

            if (event.type === 'result' || event.type === 'session_exited') {
                this.processManager.unsubscribe(sessionId, callback);

                if (responseBuffer.trim()) {
                    sendFn('local', responseBuffer.trim(), 'outbound');
                }
            }
        };

        this.processManager.subscribe(sessionId, callback);
    }

    private async sendResponse(participant: string, content: string): Promise<void> {
        try {
            // Discover recipient's public key (cached after first lookup)
            const pubKey = await this.getPublicKey(participant);

            await this.service.algorandService.sendMessage(
                this.service.chatAccount,
                participant,
                pubKey,
                content,
            );

            console.log(`[AlgoChat Bridge] Sent response to ${participant}: ${content.slice(0, 100)}`);
            this.emitEvent(participant, content, 'outbound');
        } catch (err) {
            console.error('[AlgoChat Bridge] Failed to send response:', err);
        }
    }

    private async getPublicKey(address: string): Promise<Uint8Array> {
        const cached = this.publicKeyCache.get(address);
        if (cached) return cached;

        const pubKey = await this.service.algorandService.discoverPublicKey(address);
        this.publicKeyCache.set(address, pubKey);
        return pubKey;
    }

    private findAgentForNewConversation(): string | null {
        if (this.config.defaultAgentId) {
            return this.config.defaultAgentId;
        }

        const agents = getAlgochatEnabledAgents(this.db);
        const autoAgent = agents.find((a) => a.algochatAuto);
        return autoAgent?.id ?? agents[0]?.id ?? null;
    }

    private getDefaultProjectId(): string {
        const { listProjects, createProject } = require('../db/projects');
        const projects = listProjects(this.db);
        if (projects.length > 0) return projects[0].id;

        const project = createProject(this.db, {
            name: 'AlgoChat Default',
            workingDir: process.cwd(),
        });
        return project.id;
    }

    private emitEvent(
        participant: string,
        content: string,
        direction: 'inbound' | 'outbound',
    ): void {
        for (const cb of this.eventCallbacks) {
            cb(participant, content, direction);
        }
    }
}
