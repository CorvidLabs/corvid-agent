import { EventEmitter } from 'events';
import { AgentMessenger } from '../../server/algochat/agent-messenger';
import { PeerChannel } from './PeerChannel';
import { MeshNetwork } from './MeshNetwork';
import { AgentInfo } from '../types/agent';
import { Logger } from '../utils/Logger';

export interface AgentProcessNodeConfig {
  agentId: string;
  agentName: string;
  walletAddress: string;
  capabilities: string[];
  meshNetwork: MeshNetwork;
  messenger: AgentMessenger;
  logger: Logger;
}

export interface PeerConnection {
  agentId: string;
  channel: PeerChannel;
  lastActivity: Date;
  trustScore: number;
  active: boolean;
}

export class AgentProcessNode extends EventEmitter {
  private agentId: string;
  private agentName: string;
  private walletAddress: string;
  private capabilities: string[];
  private meshNetwork: MeshNetwork;
  private messenger: AgentMessenger;
  private logger: Logger;

  private peerConnections = new Map<string, PeerConnection>();
  private messageQueue: Array<{ fromAgent: string; message: any; timestamp: Date }> = [];
  private isProcessing = false;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  // Circuit breaker for overloaded agents
  private circuitBreaker = {
    failureCount: 0,
    lastFailure: null as Date | null,
    state: 'closed' as 'closed' | 'open' | 'half-open',
    threshold: 5,
    timeout: 30000 // 30 seconds
  };

  constructor(config: AgentProcessNodeConfig) {
    super();
    this.agentId = config.agentId;
    this.agentName = config.agentName;
    this.walletAddress = config.walletAddress;
    this.capabilities = config.capabilities;
    this.meshNetwork = config.meshNetwork;
    this.messenger = config.messenger;
    this.logger = config.logger;

    this.setupEventHandlers();
    this.startHeartbeat();
  }

  /**
   * Get agent information for discovery
   */
  public getAgentInfo(): AgentInfo {
    return {
      id: this.agentId,
      name: this.agentName,
      walletAddress: this.walletAddress,
      capabilities: this.capabilities,
      active: true,
      lastSeen: new Date(),
      trustScore: this.calculateOverallTrustScore(),
      connectionCount: this.peerConnections.size
    };
  }

  /**
   * Establish a direct peer connection with another agent
   */
  public async connectToPeer(targetAgentId: string): Promise<PeerChannel> {
    this.logger.info(`[${this.agentName}] Connecting to peer: ${targetAgentId}`);

    // Check if already connected
    if (this.peerConnections.has(targetAgentId)) {
      const existing = this.peerConnections.get(targetAgentId)!;
      if (existing.active) {
        return existing.channel;
      }
    }

    // Create new peer channel
    const channel = new PeerChannel({
      sourceAgentId: this.agentId,
      targetAgentId,
      meshNetwork: this.meshNetwork,
      logger: this.logger
    });

    // Set up channel event handlers
    channel.on('message', (message) => {
      this.handlePeerMessage(targetAgentId, message);
    });

    channel.on('disconnected', () => {
      this.handlePeerDisconnection(targetAgentId);
    });

    channel.on('error', (error) => {
      this.logger.error(`[${this.agentName}] Peer channel error with ${targetAgentId}:`, error);
      this.updateCircuitBreaker(false);
    });

    // Establish connection
    await channel.connect();

    // Store connection
    this.peerConnections.set(targetAgentId, {
      agentId: targetAgentId,
      channel,
      lastActivity: new Date(),
      trustScore: 1.0,
      active: true
    });

    this.emit('peer_connected', { agentId: targetAgentId });
    return channel;
  }

  /**
   * Send a message to a specific peer
   */
  public async sendToPeer(targetAgentId: string, message: any, threadId?: string): Promise<void> {
    // Check circuit breaker
    if (this.circuitBreaker.state === 'open') {
      if (Date.now() - this.circuitBreaker.lastFailure!.getTime() > this.circuitBreaker.timeout) {
        this.circuitBreaker.state = 'half-open';
        this.logger.info(`[${this.agentName}] Circuit breaker half-open, attempting recovery`);
      } else {
        throw new Error(`Circuit breaker open for agent ${this.agentId}`);
      }
    }

    try {
      let connection = this.peerConnections.get(targetAgentId);

      // Establish connection if not exists
      if (!connection || !connection.active) {
        const channel = await this.connectToPeer(targetAgentId);
        connection = this.peerConnections.get(targetAgentId)!;
      }

      // Send message through peer channel
      await connection.channel.sendMessage(message, threadId);

      // Update activity and trust score
      connection.lastActivity = new Date();
      connection.trustScore = Math.min(connection.trustScore + 0.01, 1.0);

      this.updateCircuitBreaker(true);
      this.logger.debug(`[${this.agentName}] Sent message to ${targetAgentId}`);

    } catch (error) {
      this.logger.error(`[${this.agentName}] Failed to send to ${targetAgentId}:`, error);
      this.updateCircuitBreaker(false);
      throw error;
    }
  }

  /**
   * Broadcast a message to all connected peers
   */
  public async broadcast(message: any, excludeAgents?: string[]): Promise<void> {
    const exclude = new Set(excludeAgents || []);
    const sendPromises: Promise<void>[] = [];

    for (const [agentId, connection] of this.peerConnections) {
      if (exclude.has(agentId) || !connection.active) continue;

      sendPromises.push(
        this.sendToPeer(agentId, message).catch(error => {
          this.logger.warn(`[${this.agentName}] Broadcast failed to ${agentId}:`, error);
        })
      );
    }

    await Promise.allSettled(sendPromises);
  }

  /**
   * Discover and connect to available peers
   */
  public async discoverPeers(capabilities?: string[]): Promise<AgentInfo[]> {
    try {
      const availableAgents = await this.meshNetwork.discoverAgents(capabilities);

      // Filter out self and already connected agents
      const newAgents = availableAgents.filter(agent =>
        agent.id !== this.agentId && !this.peerConnections.has(agent.id)
      );

      // Auto-connect to high-trust agents
      const autoConnectPromises = newAgents
        .filter(agent => agent.trustScore > 0.8)
        .map(agent => this.connectToPeer(agent.id).catch(error => {
          this.logger.warn(`[${this.agentName}] Auto-connect failed to ${agent.id}:`, error);
        }));

      await Promise.allSettled(autoConnectPromises);

      return newAgents;
    } catch (error) {
      this.logger.error(`[${this.agentName}] Peer discovery failed:`, error);
      return [];
    }
  }

  /**
   * Process incoming messages from the queue
   */
  private async processMessageQueue(): Promise<void> {
    if (this.isProcessing || this.messageQueue.length === 0) return;

    this.isProcessing = true;

    try {
      while (this.messageQueue.length > 0) {
        const item = this.messageQueue.shift()!;

        // Emit message event for the agent to handle
        this.emit('peer_message', {
          fromAgent: item.fromAgent,
          message: item.message,
          timestamp: item.timestamp
        });

        // Small delay to prevent overwhelming
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    } catch (error) {
      this.logger.error(`[${this.agentName}] Message processing error:`, error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Handle incoming peer message
   */
  private handlePeerMessage(fromAgent: string, message: any): void {
    const connection = this.peerConnections.get(fromAgent);
    if (connection) {
      connection.lastActivity = new Date();
      connection.trustScore = Math.min(connection.trustScore + 0.005, 1.0);
    }

    // Queue message for processing
    this.messageQueue.push({
      fromAgent,
      message,
      timestamp: new Date()
    });

    // Process queue asynchronously
    setImmediate(() => this.processMessageQueue());
  }

  /**
   * Handle peer disconnection
   */
  private handlePeerDisconnection(agentId: string): void {
    const connection = this.peerConnections.get(agentId);
    if (connection) {
      connection.active = false;
      this.emit('peer_disconnected', { agentId });
      this.logger.info(`[${this.agentName}] Peer disconnected: ${agentId}`);
    }
  }

  /**
   * Calculate overall trust score
   */
  private calculateOverallTrustScore(): number {
    if (this.peerConnections.size === 0) return 1.0;

    const totalTrust = Array.from(this.peerConnections.values())
      .reduce((sum, conn) => sum + conn.trustScore, 0);

    return totalTrust / this.peerConnections.size;
  }

  /**
   * Update circuit breaker state
   */
  private updateCircuitBreaker(success: boolean): void {
    if (success) {
      this.circuitBreaker.failureCount = 0;
      if (this.circuitBreaker.state === 'half-open') {
        this.circuitBreaker.state = 'closed';
        this.logger.info(`[${this.agentName}] Circuit breaker closed, fully recovered`);
      }
    } else {
      this.circuitBreaker.failureCount++;
      this.circuitBreaker.lastFailure = new Date();

      if (this.circuitBreaker.failureCount >= this.circuitBreaker.threshold) {
        this.circuitBreaker.state = 'open';
        this.logger.warn(`[${this.agentName}] Circuit breaker opened due to failures`);
      }
    }
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Handle mesh network events
    this.meshNetwork.on('agent_joined', (agentInfo: AgentInfo) => {
      if (agentInfo.id !== this.agentId) {
        this.emit('agent_discovered', agentInfo);
      }
    });

    this.meshNetwork.on('agent_left', (agentId: string) => {
      this.handlePeerDisconnection(agentId);
    });
  }

  /**
   * Start heartbeat to maintain network presence
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(async () => {
      try {
        // Update presence in mesh network
        await this.meshNetwork.updateAgentPresence(this.getAgentInfo());

        // Clean up inactive connections
        this.cleanupInactiveConnections();

      } catch (error) {
        this.logger.error(`[${this.agentName}] Heartbeat error:`, error);
      }
    }, 30000); // 30 second heartbeat
  }

  /**
   * Clean up inactive peer connections
   */
  private cleanupInactiveConnections(): void {
    const now = new Date();
    const timeout = 5 * 60 * 1000; // 5 minutes

    for (const [agentId, connection] of this.peerConnections) {
      if (now.getTime() - connection.lastActivity.getTime() > timeout) {
        this.logger.info(`[${this.agentName}] Cleaning up inactive connection to ${agentId}`);
        connection.channel.disconnect();
        this.peerConnections.delete(agentId);
        this.emit('peer_disconnected', { agentId });
      }
    }
  }

  /**
   * Get connection statistics
   */
  public getConnectionStats() {
    const connections = Array.from(this.peerConnections.values());

    return {
      totalConnections: connections.length,
      activeConnections: connections.filter(c => c.active).length,
      averageTrustScore: this.calculateOverallTrustScore(),
      circuitBreakerState: this.circuitBreaker.state,
      messageQueueSize: this.messageQueue.length,
      lastHeartbeat: new Date()
    };
  }

  /**
   * Disconnect from a specific peer
   */
  public async disconnectFromPeer(agentId: string): Promise<void> {
    const connection = this.peerConnections.get(agentId);
    if (connection) {
      await connection.channel.disconnect();
      this.peerConnections.delete(agentId);
      this.emit('peer_disconnected', { agentId });
    }
  }

  /**
   * Shutdown the process node
   */
  public async shutdown(): Promise<void> {
    this.logger.info(`[${this.agentName}] Shutting down process node`);

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Disconnect all peers
    const disconnectPromises = Array.from(this.peerConnections.keys())
      .map(agentId => this.disconnectFromPeer(agentId));

    await Promise.allSettled(disconnectPromises);

    // Remove from mesh network
    await this.meshNetwork.removeAgent(this.agentId);

    this.removeAllListeners();
  }
}