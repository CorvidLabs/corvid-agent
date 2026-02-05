/**
 * Core agent types for mesh networking
 */

export interface AgentInfo {
  id: string;
  name: string;
  walletAddress: string;
  capabilities: string[];
  active: boolean;
  lastSeen: Date;
  trustScore: number;
  connectionCount?: number;
  description?: string;
  version?: string;
  metadata?: Record<string, any>;
}

export interface AgentCapability {
  name: string;
  description: string;
  version: string;
  parameters?: {
    [key: string]: {
      type: 'string' | 'number' | 'boolean' | 'object' | 'array';
      required: boolean;
      description: string;
      default?: any;
    };
  };
}

export interface AgentProfile extends AgentInfo {
  capabilities: AgentCapability[];
  performance: {
    averageResponseTime: number;
    successRate: number;
    totalMessages: number;
    lastActiveSession: Date | null;
  };
  reputation: {
    trustScore: number;
    endorsements: number;
    complaints: number;
    verifications: string[]; // List of verified capabilities
  };
  networking: {
    preferredProtocols: string[];
    maxConcurrentConnections: number;
    rateLimits: {
      messagesPerMinute: number;
      dataPerMinute: number; // bytes
    };
  };
}

export interface AgentSession {
  id: string;
  agentId: string;
  threadId?: string;
  status: 'active' | 'idle' | 'busy' | 'offline';
  startTime: Date;
  lastActivity: Date;
  messageCount: number;
  currentTask?: {
    type: string;
    description: string;
    startTime: Date;
    estimatedCompletion?: Date;
  };
}

export interface AgentConnectionRequest {
  sourceAgentId: string;
  targetAgentId: string;
  purpose: string;
  capabilities?: string[];
  expectedDuration?: number; // minutes
  priority: 'low' | 'normal' | 'high' | 'urgent';
  metadata?: Record<string, any>;
}

export interface AgentConnectionResponse {
  accepted: boolean;
  reason?: string;
  conditions?: {
    timeLimit?: number; // minutes
    messageLimit?: number;
    capabilities?: string[];
  };
  alternativeAgents?: string[]; // Suggest other agents if declined
}

export interface AgentMessage {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  threadId?: string;
  content: string;
  timestamp: Date;
  type: 'request' | 'response' | 'broadcast' | 'system';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  metadata?: {
    paymentInfo?: {
      amount: number;
      currency: string;
      txId?: string;
    };
    capability?: string;
    replyTo?: string;
    expectsReply?: boolean;
    ttl?: Date; // Time to live
  };
}

export interface AgentNetworkEvent {
  id: string;
  type: 'agent_joined' | 'agent_left' | 'connection_established' | 'connection_lost' | 'message_sent' | 'error';
  timestamp: Date;
  sourceAgentId?: string;
  targetAgentId?: string;
  data: any;
  severity: 'info' | 'warning' | 'error';
}

export interface MeshNetworkHealth {
  totalNodes: number;
  activeConnections: number;
  averageLatency: number;
  messageQueue: {
    size: number;
    averageAge: number; // milliseconds
  };
  errorRate: number; // percentage
  partitionDetected: boolean;
  lastHealthCheck: Date;
}

export interface AgentDiscoveryQuery {
  capabilities?: string[];
  trustScoreMin?: number;
  maxDistance?: number; // network hops
  excludeAgents?: string[];
  includeOffline?: boolean;
  sortBy?: 'trustScore' | 'lastSeen' | 'responseTime' | 'proximity';
}

export interface AgentRegistration {
  agentInfo: AgentInfo;
  credentials: {
    walletSignature: string;
    publicKey: string;
  };
  nodeInfo: {
    nodeId: string;
    endpoint?: string;
    protocols: string[];
  };
  policies: {
    autoAcceptConnections: boolean;
    allowedCapabilities: string[];
    rateLimits: {
      connectionsPerHour: number;
      messagesPerMinute: number;
    };
  };
}

export interface NetworkTopology {
  nodes: Map<string, AgentInfo>;
  connections: Map<string, Set<string>>;
  lastUpdated: Date;
  metrics?: {
    clusteringCoefficient: number;
    averagePathLength: number;
    networkDiameter: number;
    connectivity: number;
  };
}

export interface RoutingInfo {
  path: string[];
  hopCount: number;
  estimatedLatency: number;
  reliability: number;
  cost?: number;
  alternative?: RoutingInfo[];
}

export interface AgentCluster {
  id: string;
  name: string;
  description: string;
  memberAgents: string[];
  capabilities: string[];
  coordinator?: string; // Agent ID that manages the cluster
  policies: {
    joinApprovalRequired: boolean;
    minimumTrustScore: number;
    allowedCapabilities: string[];
  };
  metadata?: Record<string, any>;
}

/**
 * Factory functions for creating agent types
 */

export function createAgentInfo(
  id: string,
  name: string,
  walletAddress: string,
  capabilities: string[] = []
): AgentInfo {
  return {
    id,
    name,
    walletAddress,
    capabilities,
    active: true,
    lastSeen: new Date(),
    trustScore: 1.0,
    connectionCount: 0
  };
}

export function createAgentMessage(
  fromAgentId: string,
  toAgentId: string,
  content: string,
  type: AgentMessage['type'] = 'request',
  priority: AgentMessage['priority'] = 'normal'
): AgentMessage {
  return {
    id: crypto.randomUUID(),
    fromAgentId,
    toAgentId,
    content,
    timestamp: new Date(),
    type,
    priority
  };
}

export function createAgentSession(agentId: string): AgentSession {
  return {
    id: crypto.randomUUID(),
    agentId,
    status: 'active',
    startTime: new Date(),
    lastActivity: new Date(),
    messageCount: 0
  };
}

/**
 * Utility functions
 */

export function isAgentOnline(agent: AgentInfo, timeoutMs: number = 5 * 60 * 1000): boolean {
  const now = new Date();
  return agent.active && (now.getTime() - agent.lastSeen.getTime()) < timeoutMs;
}

export function calculateAgentDistance(from: AgentInfo, to: AgentInfo, topology: NetworkTopology): number {
  // Simplified distance calculation - in a real implementation,
  // this would use graph algorithms to find the shortest path
  const connections = topology.connections.get(from.id);
  if (!connections) return Infinity;

  if (connections.has(to.id)) return 1; // Direct connection

  // For now, return a simple heuristic based on trust score similarity
  const trustDiff = Math.abs(from.trustScore - to.trustScore);
  return 2 + trustDiff * 10; // Base distance + trust penalty
}

export function filterAgentsByCapabilities(
  agents: AgentInfo[],
  requiredCapabilities: string[]
): AgentInfo[] {
  return agents.filter(agent =>
    requiredCapabilities.every(cap =>
      agent.capabilities.includes(cap)
    )
  );
}

export function sortAgentsByTrustScore(agents: AgentInfo[]): AgentInfo[] {
  return [...agents].sort((a, b) => b.trustScore - a.trustScore);
}

export function validateAgentInfo(agent: Partial<AgentInfo>): agent is AgentInfo {
  return !!(
    agent.id &&
    agent.name &&
    agent.walletAddress &&
    Array.isArray(agent.capabilities) &&
    typeof agent.active === 'boolean' &&
    agent.lastSeen instanceof Date &&
    typeof agent.trustScore === 'number'
  );
}