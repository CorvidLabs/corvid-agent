import { MeshNetwork } from '../../mesh/MeshNetwork';
import { Logger } from '../../utils/Logger';
import { createAgentInfo, AgentInfo } from '../../types/agent';

// Mock Redis
jest.mock('ioredis');

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
} as any;

const mockRedis = {
  hset: jest.fn(),
  hdel: jest.fn(),
  hgetall: jest.fn(),
  publish: jest.fn(),
  subscribe: jest.fn(),
  unsubscribe: jest.fn(),
  on: jest.fn(),
  off: jest.fn()
} as any;

describe('MeshNetwork', () => {
  let meshNetwork: MeshNetwork;
  let testAgent: AgentInfo;

  beforeEach(() => {
    jest.clearAllMocks();

    testAgent = createAgentInfo(
      'test-agent-1',
      'Test Agent 1',
      'WALLET123',
      ['chat', 'analysis']
    );

    meshNetwork = new MeshNetwork({
      nodeId: 'test-node-1',
      redis: mockRedis,
      logger: mockLogger
    });
  });

  afterEach(async () => {
    await meshNetwork.shutdown();
  });

  describe('agent registration', () => {
    it('should register agent successfully', async () => {
      mockRedis.hset.mockResolvedValue('OK');

      await meshNetwork.registerAgent(testAgent);

      expect(mockRedis.hset).toHaveBeenCalledWith(
        'mesh:agents',
        testAgent.id,
        expect.stringContaining(testAgent.name)
      );

      expect(mockRedis.publish).toHaveBeenCalledWith(
        'mesh:events',
        expect.stringContaining('agent_joined')
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Registering agent'),
        expect.stringContaining(testAgent.name)
      );
    });

    it('should handle registration failure', async () => {
      mockRedis.hset.mockRejectedValue(new Error('Redis error'));

      await expect(meshNetwork.registerAgent(testAgent)).rejects.toThrow('Redis error');
    });

    it('should emit agent_registered event', async () => {
      const eventSpy = jest.fn();
      meshNetwork.on('agent_registered', eventSpy);

      mockRedis.hset.mockResolvedValue('OK');

      await meshNetwork.registerAgent(testAgent);

      expect(eventSpy).toHaveBeenCalledWith(testAgent);
    });
  });

  describe('agent removal', () => {
    beforeEach(async () => {
      mockRedis.hset.mockResolvedValue('OK');
      await meshNetwork.registerAgent(testAgent);
      jest.clearAllMocks();
    });

    it('should remove agent successfully', async () => {
      mockRedis.hdel.mockResolvedValue(1);

      await meshNetwork.removeAgent(testAgent.id);

      expect(mockRedis.hdel).toHaveBeenCalledWith('mesh:agents', testAgent.id);

      expect(mockRedis.publish).toHaveBeenCalledWith(
        'mesh:events',
        expect.stringContaining('agent_left')
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Removing agent'),
        testAgent.id
      );
    });

    it('should emit agent_removed event', async () => {
      const eventSpy = jest.fn();
      meshNetwork.on('agent_removed', eventSpy);

      mockRedis.hdel.mockResolvedValue(1);

      await meshNetwork.removeAgent(testAgent.id);

      expect(eventSpy).toHaveBeenCalledWith(testAgent.id);
    });
  });

  describe('agent discovery', () => {
    const mockAgentsData = {
      'agent-1': JSON.stringify({
        id: 'agent-1',
        name: 'Agent 1',
        walletAddress: 'WALLET1',
        capabilities: ['chat'],
        nodeId: 'node-1',
        lastSeen: new Date(),
        trustScore: 0.8
      }),
      'agent-2': JSON.stringify({
        id: 'agent-2',
        name: 'Agent 2',
        walletAddress: 'WALLET2',
        capabilities: ['analysis'],
        nodeId: 'node-2',
        lastSeen: new Date(),
        trustScore: 0.9
      })
    };

    it('should discover all agents', async () => {
      mockRedis.hgetall.mockResolvedValue(mockAgentsData);

      const agents = await meshNetwork.discoverAgents();

      expect(agents).toHaveLength(2);
      expect(agents[0].id).toBe('agent-2'); // Higher trust score should be first
      expect(agents[1].id).toBe('agent-1');
    });

    it('should filter agents by capabilities', async () => {
      mockRedis.hgetall.mockResolvedValue(mockAgentsData);

      const agents = await meshNetwork.discoverAgents(['chat']);

      expect(agents).toHaveLength(1);
      expect(agents[0].id).toBe('agent-1');
    });

    it('should handle discovery errors gracefully', async () => {
      mockRedis.hgetall.mockRejectedValue(new Error('Redis error'));

      const agents = await meshNetwork.discoverAgents();

      expect(agents).toHaveLength(0);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to discover agents:',
        expect.any(Error)
      );
    });

    it('should handle malformed agent data', async () => {
      mockRedis.hgetall.mockResolvedValue({
        'agent-1': 'invalid-json',
        'agent-2': JSON.stringify(mockAgentsData['agent-2'])
      });

      const agents = await meshNetwork.discoverAgents();

      expect(agents).toHaveLength(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse agent data'),
        expect.any(Error)
      );
    });
  });

  describe('presence updates', () => {
    beforeEach(async () => {
      mockRedis.hset.mockResolvedValue('OK');
      await meshNetwork.registerAgent(testAgent);
      jest.clearAllMocks();
    });

    it('should update agent presence', async () => {
      const updatedAgent = { ...testAgent, lastSeen: new Date(), trustScore: 0.9 };

      await meshNetwork.updateAgentPresence(updatedAgent);

      expect(mockRedis.hset).toHaveBeenCalledWith(
        'mesh:agents',
        testAgent.id,
        expect.stringContaining('"trustScore":0.9')
      );
    });

    it('should handle presence update for unregistered agent', async () => {
      const unregisteredAgent = createAgentInfo('unknown-agent', 'Unknown', 'WALLET999');

      await meshNetwork.updateAgentPresence(unregisteredAgent);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Attempted to update presence for unregistered agent')
      );
    });
  });

  describe('routing', () => {
    it('should find direct route to agent', () => {
      // Setup topology with direct route
      (meshNetwork as any).routingTable.directRoutes.set('target-agent', 'target-node');

      const route = meshNetwork.findRoute('target-agent');

      expect(route).toEqual(['target-node']);
    });

    it('should find multi-hop route to agent', () => {
      // Setup topology with multi-hop route
      (meshNetwork as any).routingTable.multiHopRoutes.set('target-agent', ['node-1', 'node-2']);

      const route = meshNetwork.findRoute('target-agent');

      expect(route).toEqual(['node-1', 'node-2']);
    });

    it('should return empty route when no path exists', () => {
      const route = meshNetwork.findRoute('unknown-agent');

      expect(route).toEqual([]);
    });
  });

  describe('network health', () => {
    it('should provide network health metrics', () => {
      const health = meshNetwork.getNetworkHealth();

      expect(health).toHaveProperty('totalNodes');
      expect(health).toHaveProperty('totalConnections');
      expect(health).toHaveProperty('lastTopologyUpdate');
      expect(health).toHaveProperty('routingTableSize');
    });

    it('should track node failures', () => {
      const nodeId = 'failing-node';

      // Simulate node failure
      (meshNetwork as any).handleNodeFailure(nodeId);

      const health = meshNetwork.getNetworkHealth();
      expect(health.nodeFailures.get(nodeId)).toBe(1);
    });
  });

  describe('topology management', () => {
    it('should return current topology', () => {
      const topology = meshNetwork.getTopology();

      expect(topology).toHaveProperty('nodes');
      expect(topology).toHaveProperty('connections');
      expect(topology).toHaveProperty('lastUpdated');
      expect(topology.nodes).toBeInstanceOf(Map);
      expect(topology.connections).toBeInstanceOf(Map);
    });

    it('should update topology from network events', () => {
      const newAgent = createAgentInfo('new-agent', 'New Agent', 'WALLET456');

      // Simulate network event
      (meshNetwork as any).handleNetworkEvent({
        type: 'agent_joined',
        data: newAgent
      });

      const topology = meshNetwork.getTopology();
      expect(topology.nodes.has('new-agent')).toBe(true);
    });
  });

  describe('network events', () => {
    it('should handle agent_joined events', () => {
      const eventSpy = jest.fn();
      meshNetwork.on('agent_joined', eventSpy);

      const newAgent = createAgentInfo('new-agent', 'New Agent', 'WALLET456');

      (meshNetwork as any).handleNetworkEvent({
        type: 'agent_joined',
        data: newAgent
      });

      expect(eventSpy).toHaveBeenCalledWith(newAgent);
    });

    it('should handle agent_left events', () => {
      const eventSpy = jest.fn();
      meshNetwork.on('agent_left', eventSpy);

      (meshNetwork as any).handleNetworkEvent({
        type: 'agent_left',
        data: { agentId: 'leaving-agent' }
      });

      expect(eventSpy).toHaveBeenCalledWith('leaving-agent');
    });

    it('should ignore events for local agents', () => {
      // Register a local agent
      (meshNetwork as any).localAgents.set('local-agent', testAgent);

      const eventSpy = jest.fn();
      meshNetwork.on('agent_joined', eventSpy);

      // Event for local agent should be ignored
      (meshNetwork as any).handleNetworkEvent({
        type: 'agent_joined',
        data: { id: 'local-agent', name: 'Local Agent' }
      });

      expect(eventSpy).not.toHaveBeenCalled();
    });
  });

  describe('heartbeat and maintenance', () => {
    it('should remove stale agents during topology update', async () => {
      // Mock agents with one stale agent
      const staleTime = Date.now() - 15 * 60 * 1000; // 15 minutes ago
      const mockAgentsData = {
        'fresh-agent': JSON.stringify({
          id: 'fresh-agent',
          lastSeen: new Date()
        }),
        'stale-agent': JSON.stringify({
          id: 'stale-agent',
          lastSeen: new Date(staleTime)
        })
      };

      mockRedis.hgetall.mockResolvedValue(mockAgentsData);

      // Trigger topology update
      await (meshNetwork as any).updateNetworkTopology();

      const topology = meshNetwork.getTopology();
      expect(topology.nodes.has('fresh-agent')).toBe(true);
      expect(topology.nodes.has('stale-agent')).toBe(false);
    });

    it('should broadcast heartbeat events', async () => {
      // Add a local agent
      (meshNetwork as any).localAgents.set(testAgent.id, testAgent);

      // Trigger heartbeat
      await (meshNetwork as any).startHeartbeat();

      // The heartbeat interval should be set up
      expect(mockRedis.publish).toHaveBeenCalled();
    });
  });

  describe('shutdown', () => {
    it('should shutdown gracefully', async () => {
      // Add a local agent
      (meshNetwork as any).localAgents.set(testAgent.id, testAgent);

      await meshNetwork.shutdown();

      expect(mockRedis.unsubscribe).toHaveBeenCalledWith('mesh:events');
      expect(mockLogger.info).toHaveBeenCalledWith('Shutting down mesh network');
    });

    it('should remove all agents on shutdown', async () => {
      // Add multiple local agents
      (meshNetwork as any).localAgents.set('agent-1', createAgentInfo('agent-1', 'Agent 1', 'W1'));
      (meshNetwork as any).localAgents.set('agent-2', createAgentInfo('agent-2', 'Agent 2', 'W2'));

      jest.spyOn(meshNetwork, 'removeAgent').mockResolvedValue();

      await meshNetwork.shutdown();

      expect(meshNetwork.removeAgent).toHaveBeenCalledTimes(2);
    });
  });
});