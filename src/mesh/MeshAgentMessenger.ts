import type { Database } from 'bun:sqlite';
import type { AlgoChatConfig } from '../../server/algochat/config';
import type { AlgoChatService } from '../../server/algochat/service';
import type { AgentWalletService } from '../../server/algochat/agent-wallet';
import type { AgentDirectory } from '../../server/algochat/agent-directory';
import type { ProcessManager } from '../../server/process/manager';
import type { AgentMessage } from '../../shared/types';
import type { WorkTaskService } from '../../server/work/service';
import { AgentMessenger } from '../../server/algochat/agent-messenger';
import { AgentProcessNode } from './AgentProcessNode';
import { MeshNetwork } from './MeshNetwork';
import { AgentInfo } from '../types/agent';
import { Logger } from '../utils/Logger';
import { createLogger } from '../../server/lib/logger';

export interface MeshInvokeRequest {
    fromAgentId: string;
    toAgentId: string;
    content: string;
    paymentMicro?: number;
    projectId?: string;
    threadId?: string;
    routePreference?: 'direct' | 'blockchain' | 'auto';
    requireAck?: boolean;
}

export interface MeshInvokeResult {
    message: AgentMessage;
    sessionId: string | null;
    route: 'mesh_direct' | 'blockchain' | 'process_manager';
    meshDelivered?: boolean;
}

/**
 * Enhanced AgentMessenger with mesh networking capabilities.
 * Extends the existing AgentMessenger to support direct peer-to-peer communication
 * while maintaining backward compatibility with blockchain-based messaging.
 */
export class MeshAgentMessenger extends AgentMessenger {
    private meshNetwork: MeshNetwork;
    private processNodes = new Map<string, AgentProcessNode>();
    private logger: Logger;
    private isInitialized = false;

    constructor(
        db: Database,
        config: AlgoChatConfig,
        service: AlgoChatService | null,
        agentWalletService: AgentWalletService,
        agentDirectory: AgentDirectory,
        processManager: ProcessManager,
        meshNetworkConfig?: {
            nodeId?: string;
            redis?: any;
            algorand?: any;
        }
    ) {
        super(db, config, service, agentWalletService, agentDirectory, processManager);

        this.logger = createLogger('MeshAgentMessenger');

        // Initialize mesh network
        this.meshNetwork = new MeshNetwork({
            nodeId: meshNetworkConfig?.nodeId || `node-${Date.now()}`,
            redis: meshNetworkConfig?.redis,
            algorand: meshNetworkConfig?.algorand,
            logger: this.logger
        });

        this.setupMeshEventHandlers();
    }

    /**
     * Initialize the mesh networking system
     */
    public async initializeMesh(): Promise<void> {
        if (this.isInitialized) return;

        try {
            this.logger.info('Initializing mesh networking system');

            // Any additional initialization can be added here
            this.isInitialized = true;

            this.logger.info('Mesh networking system initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize mesh networking:', error);
            throw error;
        }
    }

    /**
     * Register an agent with mesh networking capabilities
     */
    public async registerAgentForMesh(agentInfo: AgentInfo): Promise<AgentProcessNode> {
        await this.ensureInitialized();

        this.logger.info(`Registering agent for mesh networking: ${agentInfo.name} (${agentInfo.id})`);

        // Create process node for this agent
        const processNode = new AgentProcessNode({
            agentId: agentInfo.id,
            agentName: agentInfo.name,
            walletAddress: agentInfo.walletAddress,
            capabilities: agentInfo.capabilities,
            meshNetwork: this.meshNetwork,
            messenger: this,
            logger: this.logger
        });

        // Set up process node event handlers
        this.setupProcessNodeEventHandlers(processNode);

        // Register with mesh network
        await this.meshNetwork.registerAgent(agentInfo);

        // Store process node
        this.processNodes.set(agentInfo.id, processNode);

        this.logger.info(`Agent registered for mesh networking: ${agentInfo.id}`);
        return processNode;
    }

    /**
     * Enhanced invoke with mesh networking support
     */
    public async meshInvoke(request: MeshInvokeRequest): Promise<MeshInvokeResult> {
        await this.ensureInitialized();

        const { fromAgentId, toAgentId, routePreference = 'auto' } = request;

        // Determine routing strategy
        const route = await this.determineRoute(fromAgentId, toAgentId, routePreference);

        switch (route) {
            case 'mesh_direct':
                return await this.invokeThroughMesh(request);

            case 'blockchain':
                const legacyResult = await super.invoke(request);
                return {
                    ...legacyResult,
                    route: 'blockchain',
                    meshDelivered: false
                };

            case 'process_manager':
            default:
                const pmResult = await super.invoke(request);
                return {
                    ...pmResult,
                    route: 'process_manager',
                    meshDelivered: false
                };
        }
    }

    /**
     * Invoke through mesh network (direct peer communication)
     */
    private async invokeThroughMesh(request: MeshInvokeRequest): Promise<MeshInvokeResult> {
        const { fromAgentId, toAgentId, content, threadId, requireAck = false } = request;

        // Get source process node
        const sourceNode = this.processNodes.get(fromAgentId);
        if (!sourceNode) {
            throw new Error(`Source agent ${fromAgentId} not registered for mesh networking`);
        }

        // Check if target agent is available in mesh
        const targetAgent = await this.findAgentInMesh(toAgentId);
        if (!targetAgent) {
            // Fallback to traditional routing
            this.logger.info(`Target agent ${toAgentId} not in mesh, falling back to blockchain`);
            const legacyResult = await super.invoke(request);
            return {
                ...legacyResult,
                route: 'blockchain',
                meshDelivered: false
            };
        }

        // Create agent message record (same as traditional flow)
        const agentMessage = await this.createAgentMessageRecord(request);

        try {
            // Send message through mesh network
            await sourceNode.sendToPeer(toAgentId, {
                messageId: agentMessage.id,
                content,
                threadId,
                timestamp: new Date(),
                paymentInfo: request.paymentMicro ? {
                    amount: request.paymentMicro,
                    currency: 'ALGO'
                } : undefined
            }, threadId);

            // Update message status
            this.updateMessageStatus(agentMessage.id, 'sent', {
                route: 'mesh_direct',
                deliveredAt: new Date().toISOString()
            });

            this.logger.info(`Message sent through mesh: ${fromAgentId} -> ${toAgentId}`, {
                messageId: agentMessage.id,
                threadId
            });

            return {
                message: agentMessage,
                sessionId: null, // Mesh messages don't create sessions immediately
                route: 'mesh_direct',
                meshDelivered: true
            };

        } catch (error) {
            this.logger.warn(`Mesh delivery failed, falling back to blockchain:`, error);

            // Fallback to traditional routing
            const legacyResult = await super.invoke(request);
            return {
                ...legacyResult,
                route: 'blockchain',
                meshDelivered: false
            };
        }
    }

    /**
     * Determine the best route for agent communication
     */
    private async determineRoute(
        fromAgentId: string,
        toAgentId: string,
        preference: 'direct' | 'blockchain' | 'auto'
    ): Promise<'mesh_direct' | 'blockchain' | 'process_manager'> {
        if (preference === 'blockchain') {
            return 'blockchain';
        }

        if (preference === 'direct') {
            // Force mesh routing even if not optimal
            return 'mesh_direct';
        }

        // Auto routing - choose based on availability and network health
        const sourceNode = this.processNodes.get(fromAgentId);
        const targetInMesh = await this.findAgentInMesh(toAgentId);

        if (sourceNode && targetInMesh) {
            const meshHealth = this.meshNetwork.getNetworkHealth();

            // Use mesh if network is healthy
            if (meshHealth.totalNodes > 1 && !meshHealth.partitionDetected) {
                return 'mesh_direct';
            }
        }

        // Default to traditional routing
        return 'process_manager';
    }

    /**
     * Find an agent in the mesh network
     */
    private async findAgentInMesh(agentId: string): Promise<AgentInfo | null> {
        try {
            const agents = await this.meshNetwork.discoverAgents();
            return agents.find(agent => agent.id === agentId) || null;
        } catch (error) {
            this.logger.warn(`Failed to discover agents in mesh:`, error);
            return null;
        }
    }

    /**
     * Create agent message record (extracted from parent class logic)
     */
    private async createAgentMessageRecord(request: MeshInvokeRequest): Promise<AgentMessage> {
        // This would use the same createAgentMessage logic from the parent class
        // For now, we'll create a simplified version
        const { createAgentMessage } = await import('../../server/db/agent-messages');

        return createAgentMessage(this['db'], {
            fromAgentId: request.fromAgentId,
            toAgentId: request.toAgentId,
            content: request.content,
            paymentMicro: request.paymentMicro || 1000,
            threadId: request.threadId || crypto.randomUUID(),
        });
    }

    /**
     * Update message status
     */
    private updateMessageStatus(messageId: string, status: string, metadata?: any): void {
        const { updateAgentMessageStatus } = require('../../server/db/agent-messages');
        updateAgentMessageStatus(this['db'], messageId, status, metadata);
    }

    /**
     * Setup mesh network event handlers
     */
    private setupMeshEventHandlers(): void {
        this.meshNetwork.on('agent_joined', (agentInfo: AgentInfo) => {
            this.logger.info(`Agent joined mesh network: ${agentInfo.name} (${agentInfo.id})`);
        });

        this.meshNetwork.on('agent_left', (agentId: string) => {
            this.logger.info(`Agent left mesh network: ${agentId}`);

            // Clean up process node if it's ours
            const processNode = this.processNodes.get(agentId);
            if (processNode) {
                processNode.shutdown();
                this.processNodes.delete(agentId);
            }
        });

        this.meshNetwork.on('topology_updated', (topology) => {
            this.logger.debug(`Mesh topology updated: ${topology.nodes.size} nodes`);
        });
    }

    /**
     * Setup process node event handlers
     */
    private setupProcessNodeEventHandlers(processNode: AgentProcessNode): void {
        processNode.on('peer_message', async (event) => {
            await this.handleIncomingMeshMessage(processNode, event);
        });

        processNode.on('peer_connected', (event) => {
            this.logger.debug(`Peer connected to ${processNode.getAgentInfo().name}: ${event.agentId}`);
        });

        processNode.on('peer_disconnected', (event) => {
            this.logger.debug(`Peer disconnected from ${processNode.getAgentInfo().name}: ${event.agentId}`);
        });
    }

    /**
     * Handle incoming mesh message
     */
    private async handleIncomingMeshMessage(
        processNode: AgentProcessNode,
        event: { fromAgent: string; message: any; timestamp: Date }
    ): Promise<void> {
        const { fromAgent, message } = event;
        const agentInfo = processNode.getAgentInfo();

        this.logger.info(`Received mesh message: ${fromAgent} -> ${agentInfo.id}`, {
            messageId: message.messageId,
            threadId: message.threadId
        });

        try {
            // Create a session to process the message (similar to traditional flow)
            const { createSession } = await import('../../server/db/sessions');
            const { getAgent } = await import('../../server/db/agents');

            const fromAgentRecord = getAgent(this['db'], fromAgent);
            const toAgentRecord = getAgent(this['db'], agentInfo.id);

            if (!fromAgentRecord || !toAgentRecord) {
                this.logger.warn(`Agent record not found for mesh message: ${fromAgent} -> ${agentInfo.id}`);
                return;
            }

            // Build prompt with mesh context
            const prompt = `Agent "${fromAgentRecord.name}" sent you a message via mesh network:\n\n${message.content}`;

            // Create session
            const session = createSession(this['db'], {
                projectId: toAgentRecord.defaultProjectId || this.getDefaultProjectId(),
                agentId: agentInfo.id,
                name: `Mesh Msg: ${fromAgentRecord.name} → ${toAgentRecord.name}`,
                initialPrompt: prompt,
                source: 'mesh',
            });

            // Start processing the message
            const processManager = this['processManager'] as ProcessManager;
            processManager.startProcess(session, prompt);

            // Subscribe to session events for response
            this.subscribeMeshResponse(processNode, fromAgent, message.messageId, session.id, message.threadId);

        } catch (error) {
            this.logger.error(`Failed to process incoming mesh message:`, error);
        }
    }

    /**
     * Subscribe to mesh response events
     */
    private subscribeMeshResponse(
        processNode: AgentProcessNode,
        toAgentId: string,
        originalMessageId: string,
        sessionId: string,
        threadId?: string
    ): void {
        const processManager = this['processManager'] as ProcessManager;
        const { extractContentText } = require('../../server/process/types');

        let responseBuffer = '';
        let completed = false;

        const finish = async () => {
            if (completed) return;
            completed = true;
            processManager.unsubscribe(sessionId, callback);

            const response = responseBuffer.trim();
            if (!response) return;

            try {
                // Send response back through mesh
                await processNode.sendToPeer(toAgentId, {
                    messageId: crypto.randomUUID(),
                    content: response,
                    threadId,
                    timestamp: new Date(),
                    replyTo: originalMessageId
                }, threadId);

                this.logger.info(`Mesh response sent: ${processNode.getAgentInfo().id} -> ${toAgentId}`);
            } catch (error) {
                this.logger.error('Failed to send mesh response:', error);
            }
        };

        const callback = (sid: string, event: any) => {
            if (sid !== sessionId || completed) return;

            if (event.type === 'assistant' && event.message?.content) {
                responseBuffer += extractContentText(event.message.content);
            }

            if (event.type === 'session_exited') {
                finish();
            }
        };

        processManager.subscribe(sessionId, callback);
    }

    /**
     * Get mesh network statistics
     */
    public getMeshStats() {
        return {
            networkHealth: this.meshNetwork.getNetworkHealth(),
            processNodes: Array.from(this.processNodes.entries()).map(([agentId, node]) => ({
                agentId,
                agentName: node.getAgentInfo().name,
                connectionStats: node.getConnectionStats()
            })),
            topology: this.meshNetwork.getTopology(),
            isInitialized: this.isInitialized
        };
    }

    /**
     * Discover available agents in the mesh
     */
    public async discoverMeshAgents(capabilities?: string[]): Promise<AgentInfo[]> {
        await this.ensureInitialized();
        return await this.meshNetwork.discoverAgents(capabilities);
    }

    /**
     * Force agent discovery refresh
     */
    public async refreshAgentDiscovery(): Promise<void> {
        await this.ensureInitialized();

        for (const processNode of this.processNodes.values()) {
            await processNode.discoverPeers();
        }
    }

    /**
     * Shutdown mesh networking
     */
    public async shutdownMesh(): Promise<void> {
        this.logger.info('Shutting down mesh networking system');

        // Shutdown all process nodes
        const shutdownPromises = Array.from(this.processNodes.values())
            .map(node => node.shutdown());

        await Promise.allSettled(shutdownPromises);
        this.processNodes.clear();

        // Shutdown mesh network
        await this.meshNetwork.shutdown();

        this.isInitialized = false;
        this.logger.info('Mesh networking system shut down');
    }

    /**
     * Ensure mesh is initialized
     */
    private async ensureInitialized(): Promise<void> {
        if (!this.isInitialized) {
            await this.initializeMesh();
        }
    }

    /**
     * Get default project ID (inherited method access)
     */
    private getDefaultProjectId(): string {
        return this['getDefaultProjectId']();
    }
}