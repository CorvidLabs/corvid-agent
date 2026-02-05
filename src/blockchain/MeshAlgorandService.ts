import algosdk from 'algosdk';
import { AgentInfo, AgentRegistration, NetworkTopology } from '../types/agent';
import { Logger } from '../utils/Logger';

export interface AlgorandMeshConfig {
  algodToken: string;
  algodServer: string;
  algodPort: number;
  indexerToken?: string;
  indexerServer?: string;
  indexerPort?: number;
  appId?: number; // Smart contract app ID for agent registry
  logger: Logger;
}

export interface OnChainAgentRecord {
  agentId: string;
  name: string;
  walletAddress: string;
  capabilities: string[];
  nodeId: string;
  endpoint?: string;
  trustScore: number;
  registeredAt: number; // Unix timestamp
  lastSeen: number; // Unix timestamp
  metadata: string; // JSON string
}

export interface MeshNetworkState {
  totalAgents: number;
  activeAgents: number;
  networkHealth: number; // 0-100 score
  lastUpdated: number;
  topologyHash: string;
}

/**
 * Enhanced Algorand service for mesh networking with decentralized agent discovery
 */
export class MeshAlgorandService {
  private algodClient: algosdk.Algodv2;
  private indexerClient: algosdk.Indexer | null = null;
  private appId: number;
  private logger: Logger;

  // Cache for performance
  private agentCache = new Map<string, OnChainAgentRecord>();
  private cacheExpiry = new Map<string, number>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(config: AlgorandMeshConfig) {
    this.algodClient = new algosdk.Algodv2(
      config.algodToken,
      config.algodServer,
      config.algodPort
    );

    if (config.indexerToken && config.indexerServer && config.indexerPort) {
      this.indexerClient = new algosdk.Indexer(
        config.indexerToken,
        config.indexerServer,
        config.indexerPort
      );
    }

    this.appId = config.appId || this.getDefaultAppId();
    this.logger = config.logger;
  }

  /**
   * Register an agent on the blockchain for decentralized discovery
   */
  async registerAgent(registration: AgentRegistration): Promise<string> {
    const { agentInfo, credentials, nodeInfo, policies } = registration;

    this.logger.info(`Registering agent on blockchain: ${agentInfo.name} (${agentInfo.id})`);

    try {
      // Prepare application call transaction
      const suggestedParams = await this.algodClient.getTransactionParams().do();

      // Encode agent information
      const agentData: OnChainAgentRecord = {
        agentId: agentInfo.id,
        name: agentInfo.name,
        walletAddress: agentInfo.walletAddress,
        capabilities: agentInfo.capabilities,
        nodeId: nodeInfo.nodeId,
        endpoint: nodeInfo.endpoint,
        trustScore: agentInfo.trustScore,
        registeredAt: Math.floor(Date.now() / 1000),
        lastSeen: Math.floor(Date.now() / 1000),
        metadata: JSON.stringify({
          ...agentInfo.metadata,
          protocols: nodeInfo.protocols,
          policies
        })
      };

      // Create application call arguments
      const appArgs = [
        new TextEncoder().encode('register'),
        new TextEncoder().encode(JSON.stringify(agentData))
      ];

      // Create account from private key (this would be the agent's wallet)
      const account = this.getAgentAccount();

      // Create application call transaction
      const appCallTxn = algosdk.makeApplicationCallTxnFromObject({
        from: account.addr,
        appIndex: this.appId,
        onComplete: algosdk.OnApplicationComplete.NoOpOC,
        appArgs,
        suggestedParams
      });

      // Sign and send transaction
      const signedTxn = appCallTxn.signTxn(account.sk);
      const { txId } = await this.algodClient.sendRawTransaction(signedTxn).do();

      // Wait for confirmation
      await this.waitForConfirmation(txId);

      // Update cache
      this.agentCache.set(agentInfo.id, agentData);
      this.cacheExpiry.set(agentInfo.id, Date.now() + this.CACHE_TTL);

      this.logger.info(`Agent registered on blockchain: ${agentInfo.id}, TxID: ${txId}`);
      return txId;

    } catch (error) {
      this.logger.error(`Failed to register agent on blockchain:`, error);
      throw error;
    }
  }

  /**
   * Update agent presence on the blockchain
   */
  async updateAgentPresence(agentInfo: AgentInfo): Promise<string | null> {
    try {
      const suggestedParams = await this.algodClient.getTransactionParams().do();

      // Update last seen timestamp
      const updateData = {
        agentId: agentInfo.id,
        lastSeen: Math.floor(Date.now() / 1000),
        trustScore: agentInfo.trustScore,
        active: agentInfo.active
      };

      const appArgs = [
        new TextEncoder().encode('update_presence'),
        new TextEncoder().encode(JSON.stringify(updateData))
      ];

      const account = this.getAgentAccount();

      const appCallTxn = algosdk.makeApplicationCallTxnFromObject({
        from: account.addr,
        appIndex: this.appId,
        onComplete: algosdk.OnApplicationComplete.NoOpOC,
        appArgs,
        suggestedParams
      });

      const signedTxn = appCallTxn.signTxn(account.sk);
      const { txId } = await this.algodClient.sendRawTransaction(signedTxn).do();

      await this.waitForConfirmation(txId);

      // Update cache if exists
      const cached = this.agentCache.get(agentInfo.id);
      if (cached) {
        cached.lastSeen = updateData.lastSeen;
        cached.trustScore = updateData.trustScore;
      }

      this.logger.debug(`Agent presence updated: ${agentInfo.id}, TxID: ${txId}`);
      return txId;

    } catch (error) {
      this.logger.warn(`Failed to update agent presence on blockchain:`, error);
      return null; // Non-critical failure
    }
  }

  /**
   * Discover agents from the blockchain registry
   */
  async discoverAgents(
    capabilities?: string[],
    maxAge?: number
  ): Promise<AgentInfo[]> {
    try {
      this.logger.debug(`Discovering agents from blockchain registry`);

      // Try to read from smart contract state
      const agents = await this.readAgentRegistry();

      // Filter by capabilities if specified
      let filteredAgents = agents;
      if (capabilities && capabilities.length > 0) {
        filteredAgents = agents.filter(agent =>
          capabilities.some(cap => agent.capabilities.includes(cap))
        );
      }

      // Filter by age if specified (default: 1 hour)
      const maxAgeSeconds = maxAge || (60 * 60); // 1 hour
      const cutoff = Math.floor(Date.now() / 1000) - maxAgeSeconds;

      const activeAgents = filteredAgents.filter(agent =>
        agent.lastSeen >= cutoff
      );

      // Convert to AgentInfo format
      const agentInfos: AgentInfo[] = activeAgents.map(record => ({
        id: record.agentId,
        name: record.name,
        walletAddress: record.walletAddress,
        capabilities: record.capabilities,
        active: true,
        lastSeen: new Date(record.lastSeen * 1000),
        trustScore: record.trustScore,
        metadata: JSON.parse(record.metadata || '{}')
      }));

      this.logger.info(`Discovered ${agentInfos.length} agents from blockchain`);
      return agentInfos;

    } catch (error) {
      this.logger.error(`Failed to discover agents from blockchain:`, error);
      return [];
    }
  }

  /**
   * Get specific agent information from blockchain
   */
  async getAgent(agentId: string): Promise<AgentInfo | null> {
    // Check cache first
    const cached = this.agentCache.get(agentId);
    const cacheExpiry = this.cacheExpiry.get(agentId);

    if (cached && cacheExpiry && Date.now() < cacheExpiry) {
      return this.recordToAgentInfo(cached);
    }

    try {
      const agents = await this.discoverAgents();
      return agents.find(agent => agent.id === agentId) || null;

    } catch (error) {
      this.logger.error(`Failed to get agent ${agentId} from blockchain:`, error);
      return null;
    }
  }

  /**
   * Remove agent from the blockchain registry
   */
  async removeAgent(agentId: string): Promise<string | null> {
    try {
      const suggestedParams = await this.algodClient.getTransactionParams().do();

      const appArgs = [
        new TextEncoder().encode('unregister'),
        new TextEncoder().encode(agentId)
      ];

      const account = this.getAgentAccount();

      const appCallTxn = algosdk.makeApplicationCallTxnFromObject({
        from: account.addr,
        appIndex: this.appId,
        onComplete: algosdk.OnApplicationComplete.NoOpOC,
        appArgs,
        suggestedParams
      });

      const signedTxn = appCallTxn.signTxn(account.sk);
      const { txId } = await this.algodClient.sendRawTransaction(signedTxn).do();

      await this.waitForConfirmation(txId);

      // Remove from cache
      this.agentCache.delete(agentId);
      this.cacheExpiry.delete(agentId);

      this.logger.info(`Agent removed from blockchain: ${agentId}, TxID: ${txId}`);
      return txId;

    } catch (error) {
      this.logger.error(`Failed to remove agent from blockchain:`, error);
      return null;
    }
  }

  /**
   * Store network topology on blockchain for global coordination
   */
  async storeNetworkTopology(topology: NetworkTopology): Promise<string | null> {
    try {
      const suggestedParams = await this.algodClient.getTransactionParams().do();

      // Create a simplified topology record
      const topologyData = {
        nodeCount: topology.nodes.size,
        connectionCount: Array.from(topology.connections.values())
          .reduce((sum, connections) => sum + connections.size, 0),
        lastUpdated: Math.floor(topology.lastUpdated.getTime() / 1000),
        hash: this.calculateTopologyHash(topology)
      };

      const appArgs = [
        new TextEncoder().encode('update_topology'),
        new TextEncoder().encode(JSON.stringify(topologyData))
      ];

      const account = this.getAgentAccount();

      const appCallTxn = algosdk.makeApplicationCallTxnFromObject({
        from: account.addr,
        appIndex: this.appId,
        onComplete: algosdk.OnApplicationComplete.NoOpOC,
        appArgs,
        suggestedParams
      });

      const signedTxn = appCallTxn.signTxn(account.sk);
      const { txId } = await this.algodClient.sendRawTransaction(signedTxn).do();

      await this.waitForConfirmation(txId);

      this.logger.debug(`Network topology stored on blockchain: TxID: ${txId}`);
      return txId;

    } catch (error) {
      this.logger.warn(`Failed to store network topology on blockchain:`, error);
      return null;
    }
  }

  /**
   * Read agent registry from smart contract
   */
  private async readAgentRegistry(): Promise<OnChainAgentRecord[]> {
    try {
      const appInfo = await this.algodClient.getApplicationByID(this.appId).do();
      const globalState = appInfo.params['global-state'];

      const agents: OnChainAgentRecord[] = [];

      for (const item of globalState) {
        const key = Buffer.from(item.key, 'base64').toString();

        if (key.startsWith('agent:')) {
          const value = item.value.type === 2
            ? Buffer.from(item.value.bytes, 'base64').toString()
            : item.value.uint;

          if (typeof value === 'string') {
            try {
              const agentRecord: OnChainAgentRecord = JSON.parse(value);
              agents.push(agentRecord);
            } catch (parseError) {
              this.logger.warn(`Failed to parse agent record: ${key}`, parseError);
            }
          }
        }
      }

      return agents;

    } catch (error) {
      this.logger.error('Failed to read agent registry from smart contract:', error);
      return [];
    }
  }

  /**
   * Calculate topology hash for change detection
   */
  private calculateTopologyHash(topology: NetworkTopology): string {
    const data = {
      nodes: Array.from(topology.nodes.keys()).sort(),
      connections: Array.from(topology.connections.entries())
        .map(([node, connections]) => [node, Array.from(connections).sort()])
        .sort()
    };

    // Simple hash - in production, use a proper hashing algorithm
    return Buffer.from(JSON.stringify(data)).toString('base64').slice(0, 16);
  }

  /**
   * Convert OnChainAgentRecord to AgentInfo
   */
  private recordToAgentInfo(record: OnChainAgentRecord): AgentInfo {
    return {
      id: record.agentId,
      name: record.name,
      walletAddress: record.walletAddress,
      capabilities: record.capabilities,
      active: true,
      lastSeen: new Date(record.lastSeen * 1000),
      trustScore: record.trustScore,
      metadata: JSON.parse(record.metadata || '{}')
    };
  }

  /**
   * Wait for transaction confirmation
   */
  private async waitForConfirmation(txId: string): Promise<void> {
    const timeout = 10000; // 10 seconds
    const start = Date.now();

    while (Date.now() - start < timeout) {
      try {
        const status = await this.algodClient.status().do();
        const txInfo = await this.algodClient.pendingTransactionInformation(txId).do();

        if (txInfo['confirmed-round'] && txInfo['confirmed-round'] > 0) {
          return;
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        this.logger.debug(`Waiting for transaction confirmation: ${txId}`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    throw new Error(`Transaction confirmation timeout: ${txId}`);
  }

  /**
   * Get and validate the agent's Algorand account from the mnemonic environment variable.
   * Throws a descriptive error if AGENT_MNEMONIC is missing or empty.
   */
  private getAgentAccount(): algosdk.Account {
    const mnemonic = process.env.AGENT_MNEMONIC;
    if (!mnemonic || mnemonic.trim().length === 0) {
      throw new Error(
        'AGENT_MNEMONIC environment variable is not set or is empty. ' +
        'This is required for blockchain transactions.'
      );
    }
    return algosdk.mnemonicToSecretKey(mnemonic);
  }

  /**
   * Get default app ID (would be deployed smart contract)
   */
  private getDefaultAppId(): number {
    // In production, this would be the deployed smart contract ID
    // For now, return a placeholder
    return parseInt(process.env.MESH_APP_ID || '1');
  }

  /**
   * Deploy the mesh networking smart contract
   */
  async deployMeshContract(): Promise<number> {
    // This would contain the TEAL code for the mesh networking smart contract
    // For now, return a placeholder app ID
    throw new Error('Smart contract deployment not implemented in this example');
  }

  /**
   * Get network statistics from blockchain
   */
  async getNetworkStats(): Promise<MeshNetworkState | null> {
    try {
      const agents = await this.readAgentRegistry();
      const now = Math.floor(Date.now() / 1000);
      const oneHourAgo = now - 3600;

      const activeAgents = agents.filter(agent => agent.lastSeen >= oneHourAgo);

      // Calculate health score based on active agents ratio
      const healthScore = agents.length > 0
        ? Math.round((activeAgents.length / agents.length) * 100)
        : 0;

      return {
        totalAgents: agents.length,
        activeAgents: activeAgents.length,
        networkHealth: healthScore,
        lastUpdated: now,
        topologyHash: '' // Would be calculated from actual topology
      };

    } catch (error) {
      this.logger.error('Failed to get network stats from blockchain:', error);
      return null;
    }
  }

  /**
   * Clear agent cache
   */
  clearCache(): void {
    this.agentCache.clear();
    this.cacheExpiry.clear();
  }
}