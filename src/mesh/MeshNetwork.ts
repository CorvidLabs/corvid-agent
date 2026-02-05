import { EventEmitter } from 'events';
import Redis from 'ioredis';
import { MeshMeshAlgorandService } from '../blockchain/MeshMeshAlgorandService';
import { AgentInfo } from '../types/agent';
import { Logger } from '../utils/Logger';

export interface MeshNetworkConfig {
  nodeId: string;
  redis?: Redis;
  algorand?: MeshMeshAlgorandService;
  logger: Logger;
}

export interface NetworkTopology {
  nodes: Map<string, AgentInfo>;
  connections: Map<string, Set<string>>;
  lastUpdated: Date;
}

export interface RoutingTable {
  directRoutes: Map<string, string>; // agentId -> nodeId
  multiHopRoutes: Map<string, string[]>; // agentId -> [nodeId1, nodeId2, ...]
}

export class MeshNetwork extends EventEmitter {
  private nodeId: string;
  private redis: Redis;
  private algorand: MeshAlgorandService | undefined;
  private logger: Logger;

  private localAgents = new Map<string, AgentInfo>();
  private networkTopology: NetworkTopology;
  private routingTable: RoutingTable;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private topologyUpdateInterval: NodeJS.Timeout | null = null;

  // Network health monitoring
  private networkHealth = {
    lastTopologyUpdate: null as Date | null,
    nodeFailures: new Map<string, number>(),
    partitionDetected: false,
    averageLatency: 0,
    connectionCount: 0
  };

  constructor(config: MeshNetworkConfig) {
    super();

    this.nodeId = config.nodeId;
    this.logger = config.logger;
    this.algorand = config.algorand;

    // Initialize Redis connection
    this.redis = config.redis || new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3
    });

    // Initialize network state
    this.networkTopology = {
      nodes: new Map(),
      connections: new Map(),
      lastUpdated: new Date()
    };

    this.routingTable = {
      directRoutes: new Map(),
      multiHopRoutes: new Map()
    };

    this.setupNetworkMonitoring();
    this.startHeartbeat();
  }

  /**
   * Register a local agent with the mesh network
   */
  public async registerAgent(agentInfo: AgentInfo): Promise<void> {
    this.logger.info(`Registering agent with mesh: ${agentInfo.name} (${agentInfo.id})`);

    // Store locally
    this.localAgents.set(agentInfo.id, agentInfo);

    // Register in distributed registry (Redis)
    await this.redis.hset(
      'mesh:agents',
      agentInfo.id,
      JSON.stringify({
        ...agentInfo,
        nodeId: this.nodeId,
        registeredAt: new Date().toISOString()
      })
    );

    // Register on blockchain if available
    if (this.algorand) {
      try {
        await this.algorand.registerAgent(agentInfo);
      } catch (error) {
        this.logger.warn('Failed to register agent on blockchain:', error);
      }
    }

    // Update local topology
    this.networkTopology.nodes.set(agentInfo.id, agentInfo);
    this.updateRoutingTable();

    // Broadcast agent joined event
    await this.broadcastNetworkEvent('agent_joined', agentInfo);

    this.emit('agent_registered', agentInfo);
  }

  /**
   * Remove an agent from the mesh network
   */
  public async removeAgent(agentId: string): Promise<void> {
    this.logger.info(`Removing agent from mesh: ${agentId}`);

    // Remove locally
    this.localAgents.delete(agentId);

    // Remove from distributed registry
    await this.redis.hdel('mesh:agents', agentId);

    // Remove from topology
    this.networkTopology.nodes.delete(agentId);
    this.networkTopology.connections.delete(agentId);

    // Clean up connections to this agent
    for (const [nodeId, connections] of this.networkTopology.connections) {
      connections.delete(agentId);
    }

    this.updateRoutingTable();

    // Broadcast agent left event
    await this.broadcastNetworkEvent('agent_left', { agentId });

    this.emit('agent_removed', agentId);
  }

  /**
   * Discover available agents in the network
   */
  public async discoverAgents(capabilities?: string[]): Promise<AgentInfo[]> {
    try {
      // Get all agents from distributed registry
      const agentData = await this.redis.hgetall('mesh:agents');
      const agents: AgentInfo[] = [];

      for (const [agentId, data] of Object.entries(agentData)) {
        try {
          const parsed = JSON.parse(data);
          // Convert ISO string back to Date after JSON deserialization
          const agentInfo: AgentInfo = {
            ...parsed,
            lastSeen: new Date(parsed.lastSeen)
          };

          // Filter by capabilities if specified
          if (capabilities && capabilities.length > 0) {
            const hasCapabilities = capabilities.every(cap =>
              agentInfo.capabilities.includes(cap)
            );
            if (!hasCapabilities) continue;
          }

          // Update last seen based on node health
          const nodeId = (JSON.parse(data) as any).nodeId;
          const nodeHealth = this.networkHealth.nodeFailures.get(nodeId) || 0;

          if (nodeHealth < 3) { // Node is healthy
            agents.push(agentInfo);
          }

        } catch (error) {
          this.logger.warn(`Failed to parse agent data for ${agentId}:`, error);
        }
      }

      // Sort by trust score and last seen
      agents.sort((a, b) => {
        const scoreDiff = b.trustScore - a.trustScore;
        if (Math.abs(scoreDiff) > 0.1) return scoreDiff;

        return b.lastSeen.getTime() - a.lastSeen.getTime();
      });

      return agents;

    } catch (error) {
      this.logger.error('Failed to discover agents:', error);
      return [];
    }
  }

  /**
   * Update agent presence in the network
   */
  public async updateAgentPresence(agentInfo: AgentInfo): Promise<void> {
    const existingAgent = this.localAgents.get(agentInfo.id);
    if (!existingAgent) {
      this.logger.warn(`Attempted to update presence for unregistered agent: ${agentInfo.id}`);
      return;
    }

    // Update last seen
    agentInfo.lastSeen = new Date();

    // Store locally
    this.localAgents.set(agentInfo.id, agentInfo);

    // Update distributed registry
    await this.redis.hset(
      'mesh:agents',
      agentInfo.id,
      JSON.stringify({
        ...agentInfo,
        nodeId: this.nodeId,
        lastUpdated: new Date().toISOString()
      })
    );

    // Update topology
    this.networkTopology.nodes.set(agentInfo.id, agentInfo);
    this.networkTopology.lastUpdated = new Date();
  }

  /**
   * Find the optimal route to an agent
   */
  public findRoute(targetAgentId: string): string[] {
    // Check direct route first
    const directRoute = this.routingTable.directRoutes.get(targetAgentId);
    if (directRoute) {
      return [directRoute];
    }

    // Check multi-hop routes
    const multiHopRoute = this.routingTable.multiHopRoutes.get(targetAgentId);
    if (multiHopRoute) {
      return multiHopRoute;
    }

    // No route found
    return [];
  }

  /**
   * Get network topology information
   */
  public getTopology(): NetworkTopology {
    return {
      nodes: new Map(this.networkTopology.nodes),
      connections: new Map(this.networkTopology.connections),
      lastUpdated: this.networkTopology.lastUpdated
    };
  }

  /**
   * Get network health metrics
   */
  public getNetworkHealth() {
    return {
      ...this.networkHealth,
      totalNodes: this.networkTopology.nodes.size,
      totalConnections: Array.from(this.networkTopology.connections.values())
        .reduce((sum, connections) => sum + connections.size, 0),
      lastTopologyUpdate: this.networkTopology.lastUpdated,
      routingTableSize: this.routingTable.directRoutes.size + this.routingTable.multiHopRoutes.size
    };
  }

  /**
   * Setup network monitoring
   */
  private setupNetworkMonitoring(): void {
    // Subscribe to network events
    this.redis.subscribe('mesh:events');

    this.redis.on('message', (channel, message) => {
      if (channel === 'mesh:events') {
        this.handleNetworkEvent(JSON.parse(message));
      }
    });

    // Start topology update interval
    this.topologyUpdateInterval = setInterval(async () => {
      await this.updateNetworkTopology();
    }, 60000); // Update every minute
  }

  /**
   * Handle network events from other nodes
   */
  private handleNetworkEvent(event: any): void {
    switch (event.type) {
      case 'agent_joined':
        if (event.data.id && !this.localAgents.has(event.data.id)) {
          this.networkTopology.nodes.set(event.data.id, event.data);
          this.updateRoutingTable();
          this.emit('agent_joined', event.data);
        }
        break;

      case 'agent_left':
        if (event.data.agentId && !this.localAgents.has(event.data.agentId)) {
          this.networkTopology.nodes.delete(event.data.agentId);
          this.updateRoutingTable();
          this.emit('agent_left', event.data.agentId);
        }
        break;

      case 'topology_update':
        this.mergeTopologyUpdate(event.data);
        break;

      case 'node_failure':
        this.handleNodeFailure(event.data.nodeId);
        break;
    }
  }

  /**
   * Update network topology from distributed sources
   */
  private async updateNetworkTopology(): Promise<void> {
    try {
      const agents = await this.discoverAgents();
      const now = new Date();

      // Update topology with discovered agents
      for (const agent of agents) {
        this.networkTopology.nodes.set(agent.id, agent);
      }

      // Remove stale agents (not seen for 10 minutes)
      const staleThreshold = 10 * 60 * 1000; // 10 minutes
      for (const [agentId, agentInfo] of this.networkTopology.nodes) {
        if (now.getTime() - agentInfo.lastSeen.getTime() > staleThreshold) {
          this.networkTopology.nodes.delete(agentId);
          this.logger.info(`Removed stale agent from topology: ${agentId}`);
        }
      }

      this.networkTopology.lastUpdated = now;
      this.networkHealth.lastTopologyUpdate = now;

      this.updateRoutingTable();
      this.emit('topology_updated', this.getTopology());

    } catch (error) {
      this.logger.error('Failed to update network topology:', error);
    }
  }

  /**
   * Update routing table based on current topology
   */
  private updateRoutingTable(): void {
    this.routingTable.directRoutes.clear();
    this.routingTable.multiHopRoutes.clear();

    // For now, we'll use simple direct routing
    // In the future, this could implement more sophisticated routing algorithms
    for (const [agentId, agentInfo] of this.networkTopology.nodes) {
      if (this.localAgents.has(agentId)) continue;

      // Direct route (all agents are directly reachable for now)
      this.routingTable.directRoutes.set(agentId, agentId);
    }

    this.logger.debug(`Updated routing table: ${this.routingTable.directRoutes.size} direct routes`);
  }

  /**
   * Broadcast network event to other nodes
   */
  private async broadcastNetworkEvent(type: string, data: any): Promise<void> {
    try {
      const event = {
        type,
        data,
        nodeId: this.nodeId,
        timestamp: new Date().toISOString()
      };

      await this.redis.publish('mesh:events', JSON.stringify(event));
    } catch (error) {
      this.logger.error('Failed to broadcast network event:', error);
    }
  }

  /**
   * Merge topology update from another node
   */
  private mergeTopologyUpdate(updateData: any): void {
    // Simple merge strategy - accept updates for agents not managed locally
    if (updateData.agents) {
      for (const agent of updateData.agents) {
        if (!this.localAgents.has(agent.id)) {
          this.networkTopology.nodes.set(agent.id, agent);
        }
      }
    }

    this.updateRoutingTable();
  }

  /**
   * Handle node failure detection
   */
  private handleNodeFailure(nodeId: string): void {
    const currentFailures = this.networkHealth.nodeFailures.get(nodeId) || 0;
    this.networkHealth.nodeFailures.set(nodeId, currentFailures + 1);

    // Remove agents from failed node if too many failures
    if (currentFailures >= 3) {
      for (const [agentId, agentInfo] of this.networkTopology.nodes) {
        // Note: We'd need to track nodeId per agent to implement this properly
        // For now, we'll rely on the stale agent cleanup in updateNetworkTopology
      }
    }

    this.logger.warn(`Node failure detected: ${nodeId} (${currentFailures + 1} failures)`);
  }

  /**
   * Start heartbeat to maintain network presence
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(async () => {
      try {
        // Update presence for all local agents
        for (const agentInfo of this.localAgents.values()) {
          await this.updateAgentPresence(agentInfo);
        }

        // Broadcast node health
        await this.broadcastNetworkEvent('node_heartbeat', {
          nodeId: this.nodeId,
          agentCount: this.localAgents.size,
          health: this.getNetworkHealth()
        });

      } catch (error) {
        this.logger.error('Heartbeat error:', error);
      }
    }, 30000); // 30 second heartbeat
  }

  /**
   * Shutdown the mesh network
   */
  public async shutdown(): Promise<void> {
    this.logger.info('Shutting down mesh network');

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    if (this.topologyUpdateInterval) {
      clearInterval(this.topologyUpdateInterval);
    }

    // Remove all local agents
    const agentIds = Array.from(this.localAgents.keys());
    for (const agentId of agentIds) {
      await this.removeAgent(agentId);
    }

    // Unsubscribe from Redis
    await this.redis.unsubscribe('mesh:events');

    this.removeAllListeners();
  }
}