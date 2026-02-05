import { agentRelationshipsDb, NetworkMetrics, AgentRelationship, CollaborationType } from '../db/agent-relationships.js';
import { relationshipManager } from './relationship-manager.js';

interface NetworkNode {
  id: string;
  relationships: string[];
  specializations: string[];
}


export interface ClusterInfo {
  id: string;
  memberIds: string[];
  centralityScore: number;
  specializationDominance: string[];
}

export interface GovernanceIntervention {
  type: 'clustering_prevention' | 'isolation_mitigation' | 'relationship_suggestion' | 'topology_rebalancing' | 'specialization_promotion';
  targetAgentIds: string[];
  description: string;
  automated: boolean;
  actionTaken?: string;
}

/**
 * Service for monitoring and managing network topology
 * Implements graph algorithms to analyze agent relationship patterns
 */
export class NetworkTopologyService {
  private interventionCooldown: Map<string, Date> = new Map();
  private readonly INTERVENTION_COOLDOWN_HOURS = 24;

  // ==================== Network Analysis ====================

  /**
   * Perform comprehensive network analysis
   */
  async analyzeNetworkTopology(): Promise<{
    metrics: NetworkMetrics;
    clusters: ClusterInfo[];
    bridgeAgents: string[];
    bottleneckAgents: string[];
    recommendations: GovernanceIntervention[];
  }> {
    const relationships = this.getActiveNetworkRelationships();
    const nodes = this.buildNetworkNodes(relationships);
    const adjacencyMatrix = this.buildAdjacencyMatrix(nodes, relationships);

    // Calculate advanced metrics
    const metrics = await this.calculateAdvancedMetrics(nodes, relationships, adjacencyMatrix);
    const clusters = this.detectCommunities(nodes, relationships);
    const bridgeAgents = this.identifyBridgeAgents(nodes, relationships);
    const bottleneckAgents = this.identifyBottleneckAgents(nodes, relationships);
    const recommendations = await this.generateGovernanceRecommendations(
      metrics,
      clusters,
      bridgeAgents,
      bottleneckAgents
    );

    return { metrics, clusters, bridgeAgents, bottleneckAgents, recommendations };
  }

  /**
   * Calculate clustering coefficient for the network
   */
  calculateClusteringCoefficient(nodes: NetworkNode[], relationships: AgentRelationship[]): number {
    let totalCoefficient = 0;
    let nodeCount = 0;

    for (const node of nodes) {
      if (node.relationships.length < 2) {
        continue; // Skip nodes with fewer than 2 connections
      }

      const neighbors = this.getNeighbors(node.id, relationships);
      const possibleTriangles = (neighbors.length * (neighbors.length - 1)) / 2;

      if (possibleTriangles === 0) {
        continue;
      }

      // Count actual triangles
      let actualTriangles = 0;
      for (let i = 0; i < neighbors.length; i++) {
        for (let j = i + 1; j < neighbors.length; j++) {
          if (this.areConnected(neighbors[i], neighbors[j], relationships)) {
            actualTriangles++;
          }
        }
      }

      const nodeCoefficient = actualTriangles / possibleTriangles;
      totalCoefficient += nodeCoefficient;
      nodeCount++;
    }

    return nodeCount > 0 ? totalCoefficient / nodeCount : 0;
  }

  /**
   * Calculate average path length using Floyd-Warshall algorithm
   */
  calculateAveragePathLength(nodes: NetworkNode[], adjacencyMatrix: number[][]): number {
    const n = nodes.length;
    const distances: number[][] = [];

    // Initialize distance matrix
    for (let i = 0; i < n; i++) {
      distances[i] = [];
      for (let j = 0; j < n; j++) {
        if (i === j) {
          distances[i][j] = 0;
        } else if (adjacencyMatrix[i][j] > 0) {
          distances[i][j] = 1; // Direct connection
        } else {
          distances[i][j] = Infinity;
        }
      }
    }

    // Floyd-Warshall algorithm
    for (let k = 0; k < n; k++) {
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (distances[i][k] + distances[k][j] < distances[i][j]) {
            distances[i][j] = distances[i][k] + distances[k][j];
          }
        }
      }
    }

    // Calculate average path length
    let totalDistance = 0;
    let pathCount = 0;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (distances[i][j] !== Infinity) {
          totalDistance += distances[i][j];
          pathCount++;
        }
      }
    }

    return pathCount > 0 ? totalDistance / pathCount : 0;
  }

  /**
   * Detect communities using simple modularity-based clustering
   */
  detectCommunities(nodes: NetworkNode[], relationships: AgentRelationship[]): ClusterInfo[] {
    const clusters: ClusterInfo[] = [];
    const visited = new Set<string>();

    for (const node of nodes) {
      if (visited.has(node.id)) {
        continue;
      }

      const cluster = this.performDepthFirstClustering(node.id, relationships, visited);

      if (cluster.memberIds.length >= 2) {
        // Calculate cluster metrics
        const centralityScore = this.calculateClusterCentrality(cluster.memberIds, relationships);
        const specializationDominance = this.analyzeClusterSpecializations(cluster.memberIds);

        clusters.push({
          id: `cluster_${clusters.length + 1}`,
          memberIds: cluster.memberIds,
          centralityScore,
          specializationDominance,
        });
      }
    }

    return clusters.sort((a, b) => b.centralityScore - a.centralityScore);
  }

  /**
   * Identify bridge agents (high betweenness centrality)
   */
  identifyBridgeAgents(nodes: NetworkNode[], relationships: AgentRelationship[]): string[] {
    const betweennessCentrality = this.calculateBetweennessCentrality(nodes, relationships);

    // Return agents with above-average betweenness centrality
    const avgCentrality = Object.values(betweennessCentrality).reduce((a, b) => a + b, 0) / Object.keys(betweennessCentrality).length;

    return Object.entries(betweennessCentrality)
      .filter(([_, centrality]) => centrality > avgCentrality * 1.5)
      .map(([agentId, _]) => agentId)
      .sort((a, b) => betweennessCentrality[b] - betweennessCentrality[a]);
  }

  /**
   * Identify bottleneck agents (critical for network connectivity)
   */
  identifyBottleneckAgents(nodes: NetworkNode[], relationships: AgentRelationship[]): string[] {
    const bottlenecks: string[] = [];

    for (const node of nodes) {
      // Simulate removal of this agent
      const filteredRelationships = relationships.filter(
        rel => rel.agentAId !== node.id && rel.agentBId !== node.id
      );

      const originalComponents = this.countConnectedComponents(nodes, relationships);
      const componentsWithoutNode = this.countConnectedComponents(
        nodes.filter(n => n.id !== node.id),
        filteredRelationships
      );

      // If removing this node increases components, it's a bottleneck
      if (componentsWithoutNode > originalComponents) {
        bottlenecks.push(node.id);
      }
    }

    return bottlenecks;
  }

  // ==================== Governance Interventions ====================

  /**
   * Generate automated governance recommendations
   */
  async generateGovernanceRecommendations(
    metrics: NetworkMetrics,
    clusters: ClusterInfo[],
    bridgeAgents: string[],
    bottleneckAgents: string[]
  ): Promise<GovernanceIntervention[]> {
    const recommendations: GovernanceIntervention[] = [];

    // Address clustering issues
    const tightClusters = clusters.filter(cluster =>
      cluster.centralityScore > 0.8 && cluster.memberIds.length > 5
    );

    for (const cluster of tightClusters) {
      if (!this.isInterventionOnCooldown(`cluster_${cluster.id}`)) {
        recommendations.push({
          type: 'clustering_prevention',
          targetAgentIds: cluster.memberIds,
          description: `Tight cluster detected with ${cluster.memberIds.length} members. Suggest cross-cluster connections.`,
          automated: true,
          actionTaken: 'Suggest relationships outside cluster for 2-3 members',
        });
      }
    }

    // Address isolation
    if (metrics.isolatedAgentCount > 0) {
      const isolatedAgents = await this.findIsolatedAgents();
      recommendations.push({
        type: 'isolation_mitigation',
        targetAgentIds: isolatedAgents,
        description: `${isolatedAgents.length} isolated agents need connections`,
        automated: true,
        actionTaken: 'Create introduction requests for isolated agents',
      });
    }

    // Protect bridge agents
    for (const bridgeAgent of bridgeAgents) {
      if (!this.isInterventionOnCooldown(`bridge_${bridgeAgent}`)) {
        recommendations.push({
          type: 'specialization_promotion',
          targetAgentIds: [bridgeAgent],
          description: `Bridge agent ${bridgeAgent} is critical for network connectivity`,
          automated: false,
          actionTaken: 'Monitor for overload and suggest backup bridges',
        });
      }
    }

    // Address bottlenecks
    for (const bottleneck of bottleneckAgents) {
      recommendations.push({
        type: 'topology_rebalancing',
        targetAgentIds: [bottleneck],
        description: `Bottleneck agent ${bottleneck} is single point of failure`,
        automated: true,
        actionTaken: 'Create alternative paths around bottleneck',
      });
    }

    return recommendations;
  }

  /**
   * Execute a governance intervention
   */
  async executeIntervention(intervention: GovernanceIntervention): Promise<boolean> {
    try {
      switch (intervention.type) {
        case 'clustering_prevention':
          await this.preventClustering(intervention.targetAgentIds);
          break;
        case 'isolation_mitigation':
          await this.mitigateIsolation(intervention.targetAgentIds);
          break;
        case 'topology_rebalancing':
          await this.rebalanceTopology(intervention.targetAgentIds);
          break;
        case 'specialization_promotion':
          await this.promoteSpecializationBridges(intervention.targetAgentIds);
          break;
        default:
          throw new Error(`Unknown intervention type: ${intervention.type}`);
      }

      // Record intervention
      await this.recordIntervention(intervention);

      // Set cooldown
      intervention.targetAgentIds.forEach(agentId => {
        const cooldownKey = `${intervention.type}_${agentId}`;
        const cooldownUntil = new Date();
        cooldownUntil.setHours(cooldownUntil.getHours() + this.INTERVENTION_COOLDOWN_HOURS);
        this.interventionCooldown.set(cooldownKey, cooldownUntil);
      });

      return true;
    } catch (error) {
      console.error(`Failed to execute intervention:`, error);
      return false;
    }
  }

  // ==================== Intervention Implementations ====================

  private async preventClustering(clusterMemberIds: string[]): Promise<void> {
    // Select 2-3 most connected members of the cluster
    const selectedMembers = clusterMemberIds.slice(0, 3);

    for (const memberId of selectedMembers) {
      const suggestions = await relationshipManager.suggestNewRelationships(memberId, 2);

      // Filter suggestions to exclude cluster members
      const externalSuggestions = suggestions.filter(
        suggestion => !clusterMemberIds.includes(suggestion.targetId)
      );

      // Create introduction requests for external connections
      for (const suggestion of externalSuggestions) {
        await relationshipManager.processIntroductionRequest(
          memberId,
          suggestion.targetId,
          suggestion.collaborationTypes,
          `Governance intervention: Reducing cluster density`,
          `This introduction is suggested to improve network diversity and reduce clustering.`
        );
      }
    }
  }

  private async mitigateIsolation(isolatedAgentIds: string[]): Promise<void> {
    for (const agentId of isolatedAgentIds) {
      const suggestions = await relationshipManager.suggestNewRelationships(agentId, 3);

      // Create introduction requests for isolated agents
      for (const suggestion of suggestions.slice(0, 2)) { // Limit to 2 initial connections
        await relationshipManager.processIntroductionRequest(
          agentId,
          suggestion.targetId,
          suggestion.collaborationTypes,
          `Governance intervention: Connecting isolated agent`,
          `This introduction helps integrate an isolated agent into the network.`
        );
      }
    }
  }

  private async rebalanceTopology(bottleneckAgentIds: string[]): Promise<void> {
    for (const bottleneckId of bottleneckAgentIds) {
      // Get bottleneck's neighbors
      const relationships = agentRelationshipsDb.getAgentRelationships(bottleneckId, 'active');
      const neighbors = relationships.map(rel =>
        rel.agentAId === bottleneckId ? rel.agentBId : rel.agentAId
      );

      // Try to create direct connections between neighbors to bypass bottleneck
      for (let i = 0; i < neighbors.length - 1; i++) {
        for (let j = i + 1; j < neighbors.length; j++) {
          const existing = agentRelationshipsDb.getRelationshipBetweenAgents(neighbors[i], neighbors[j]);

          if (!existing) {
            // Suggest connection between bottleneck's neighbors
            await relationshipManager.processIntroductionRequest(
              neighbors[i],
              neighbors[j],
              [CollaborationType.KNOWLEDGE_EXCHANGE],
              `Governance intervention: Creating alternative path around bottleneck ${bottleneckId}`,
              `This connection helps distribute the network load and reduces dependency on bottleneck agents.`
            );
          }
        }
      }
    }
  }

  private async promoteSpecializationBridges(bridgeAgentIds: string[]): Promise<void> {
    // For bridge agents, suggest mentorship relationships to create backup bridges
    for (const bridgeId of bridgeAgentIds) {
      const suggestions = await relationshipManager.suggestNewRelationships(bridgeId, 2);

      // Look for potential mentees who could become future bridges
      for (const suggestion of suggestions) {
        if (suggestion.collaborationTypes.includes(CollaborationType.MENTORSHIP)) {
          await relationshipManager.processIntroductionRequest(
            bridgeId,
            suggestion.targetId,
            [CollaborationType.MENTORSHIP],
            `Governance intervention: Developing bridge agent capacity`,
            `This mentorship helps develop backup bridge agents to improve network resilience.`
          );
        }
      }
    }
  }

  // ==================== Helper Methods ====================

  private getActiveNetworkRelationships(): AgentRelationship[] {
    // This would typically call agentRelationshipsDb, but we'll simulate for now
    // In practice, you'd fetch all active relationships from the database
    return []; // TODO: Implement actual database call
  }

  private buildNetworkNodes(relationships: AgentRelationship[]): NetworkNode[] {
    const nodeMap = new Map<string, NetworkNode>();

    for (const rel of relationships) {
      // Add agent A
      if (!nodeMap.has(rel.agentAId)) {
        nodeMap.set(rel.agentAId, {
          id: rel.agentAId,
          relationships: [],
          specializations: agentRelationshipsDb.getAgentSpecializations(rel.agentAId).map(s => s.specialization),
        });
      }

      // Add agent B
      if (!nodeMap.has(rel.agentBId)) {
        nodeMap.set(rel.agentBId, {
          id: rel.agentBId,
          relationships: [],
          specializations: agentRelationshipsDb.getAgentSpecializations(rel.agentBId).map(s => s.specialization),
        });
      }

      // Add relationship references
      nodeMap.get(rel.agentAId)!.relationships.push(rel.id);
      nodeMap.get(rel.agentBId)!.relationships.push(rel.id);
    }

    return Array.from(nodeMap.values());
  }

  private buildAdjacencyMatrix(nodes: NetworkNode[], relationships: AgentRelationship[]): number[][] {
    const n = nodes.length;
    const nodeIndexMap = new Map(nodes.map((node, index) => [node.id, index]));
    const matrix: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));

    for (const rel of relationships) {
      const indexA = nodeIndexMap.get(rel.agentAId);
      const indexB = nodeIndexMap.get(rel.agentBId);

      if (indexA !== undefined && indexB !== undefined) {
        matrix[indexA][indexB] = rel.strengthScore;
        matrix[indexB][indexA] = rel.strengthScore; // Undirected graph
      }
    }

    return matrix;
  }

  private async calculateAdvancedMetrics(
    nodes: NetworkNode[],
    relationships: AgentRelationship[],
    adjacencyMatrix: number[][]
  ): Promise<NetworkMetrics> {
    const basicMetrics = agentRelationshipsDb.getLatestNetworkMetrics() || {
      totalAgents: 0,
      totalRelationships: 0,
      networkDensity: 0,
      isolatedAgentCount: 0,
      overconnectedAgentCount: 0,
    };

    const clusteringCoefficient = this.calculateClusteringCoefficient(nodes, relationships);
    const averagePathLength = this.calculateAveragePathLength(nodes, adjacencyMatrix);
    const largestComponentSize = this.findLargestConnectedComponent(nodes, relationships);

    return {
      ...basicMetrics,
      clusteringCoefficient,
      averagePathLength,
      largestComponentSize,
    };
  }

  private performDepthFirstClustering(
    startNodeId: string,
    relationships: AgentRelationship[],
    visited: Set<string>
  ): { memberIds: string[] } {
    const cluster: string[] = [];
    const stack: string[] = [startNodeId];

    while (stack.length > 0) {
      const currentId = stack.pop()!;

      if (visited.has(currentId)) {
        continue;
      }

      visited.add(currentId);
      cluster.push(currentId);

      // Add neighbors to stack
      const neighbors = this.getNeighbors(currentId, relationships);
      for (const neighborId of neighbors) {
        if (!visited.has(neighborId)) {
          stack.push(neighborId);
        }
      }
    }

    return { memberIds: cluster };
  }

  private calculateClusterCentrality(memberIds: string[], relationships: AgentRelationship[]): number {
    const clusterRelationships = relationships.filter(rel =>
      memberIds.includes(rel.agentAId) && memberIds.includes(rel.agentBId)
    );

    const possibleInternalConnections = (memberIds.length * (memberIds.length - 1)) / 2;
    return possibleInternalConnections > 0 ? clusterRelationships.length / possibleInternalConnections : 0;
  }

  private analyzeClusterSpecializations(memberIds: string[]): string[] {
    const specializationCounts = new Map<string, number>();

    for (const memberId of memberIds) {
      const specs = agentRelationshipsDb.getAgentSpecializations(memberId);
      for (const spec of specs) {
        specializationCounts.set(spec.specialization, (specializationCounts.get(spec.specialization) || 0) + 1);
      }
    }

    return Array.from(specializationCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([spec, _]) => spec);
  }

  private calculateBetweennessCentrality(nodes: NetworkNode[], relationships: AgentRelationship[]): Record<string, number> {
    const centrality: Record<string, number> = {};
    nodes.forEach(node => centrality[node.id] = 0);

    // Simplified betweenness centrality calculation
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const paths = this.findAllShortestPaths(nodes[i].id, nodes[j].id, relationships);

        for (const path of paths) {
          // Add to centrality of intermediate nodes
          for (let k = 1; k < path.length - 1; k++) {
            centrality[path[k]] += 1 / paths.length;
          }
        }
      }
    }

    return centrality;
  }

  private getNeighbors(agentId: string, relationships: AgentRelationship[]): string[] {
    return relationships
      .filter(rel => rel.agentAId === agentId || rel.agentBId === agentId)
      .map(rel => rel.agentAId === agentId ? rel.agentBId : rel.agentAId);
  }

  private areConnected(agentA: string, agentB: string, relationships: AgentRelationship[]): boolean {
    return relationships.some(rel =>
      (rel.agentAId === agentA && rel.agentBId === agentB) ||
      (rel.agentAId === agentB && rel.agentBId === agentA)
    );
  }

  private countConnectedComponents(nodes: NetworkNode[], relationships: AgentRelationship[]): number {
    const visited = new Set<string>();
    let components = 0;

    for (const node of nodes) {
      if (!visited.has(node.id)) {
        this.performDepthFirstClustering(node.id, relationships, visited);
        components++;
      }
    }

    return components;
  }

  private findLargestConnectedComponent(nodes: NetworkNode[], relationships: AgentRelationship[]): number {
    const visited = new Set<string>();
    let maxSize = 0;

    for (const node of nodes) {
      if (!visited.has(node.id)) {
        const component = this.performDepthFirstClustering(node.id, relationships, visited);
        maxSize = Math.max(maxSize, component.memberIds.length);
      }
    }

    return maxSize;
  }

  private findAllShortestPaths(source: string, target: string, relationships: AgentRelationship[]): string[][] {
    // Simplified shortest path finding (BFS-based)
    // In practice, you'd want a more sophisticated algorithm
    const queue: { node: string; path: string[] }[] = [{ node: source, path: [source] }];
    const visited = new Set<string>();
    const paths: string[][] = [];
    let shortestLength = Infinity;

    while (queue.length > 0) {
      const { node, path } = queue.shift()!;

      if (node === target) {
        if (path.length <= shortestLength) {
          if (path.length < shortestLength) {
            paths.length = 0; // Clear longer paths
            shortestLength = path.length;
          }
          paths.push([...path]);
        }
        continue;
      }

      if (visited.has(node) || path.length >= shortestLength) {
        continue;
      }

      visited.add(node);

      const neighbors = this.getNeighbors(node, relationships);
      for (const neighbor of neighbors) {
        if (!path.includes(neighbor)) {
          queue.push({ node: neighbor, path: [...path, neighbor] });
        }
      }
    }

    return paths;
  }

  private async findIsolatedAgents(): Promise<string[]> {
    // This would query the database for agents with no relationships
    // For now, return empty array
    return [];
  }

  private isInterventionOnCooldown(key: string): boolean {
    const cooldownUntil = this.interventionCooldown.get(key);
    return cooldownUntil ? cooldownUntil > new Date() : false;
  }

  private async recordIntervention(intervention: GovernanceIntervention): Promise<void> {
    // Record intervention in the database
    // This would be implemented with the actual database schema
    console.log(`Recording intervention:`, intervention);
  }
}

// Export singleton instance
export const networkTopologyService = new NetworkTopologyService();