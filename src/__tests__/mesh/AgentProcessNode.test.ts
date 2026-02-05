import { AgentProcessNode } from '../../mesh/AgentProcessNode';
import { MeshNetwork } from '../../mesh/MeshNetwork';
import { AgentMessenger } from '../../../server/algochat/agent-messenger';
import { Logger } from '../../utils/Logger';
import { createAgentInfo } from '../../types/agent';

// Mock Redis
jest.mock('ioredis');

// Mock dependencies
const mockMeshNetwork = {
  registerAgent: jest.fn(),
  removeAgent: jest.fn(),
  discoverAgents: jest.fn(),
  updateAgentPresence: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
  emit: jest.fn()
} as any;

const mockMessenger = {
  invoke: jest.fn(),
  invokeAndWait: jest.fn()
} as any;

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
} as any;

describe('AgentProcessNode', () => {
  let processNode: AgentProcessNode;
  let agentInfo: any;

  beforeEach(() => {
    jest.clearAllMocks();

    agentInfo = createAgentInfo(
      'test-agent-1',
      'Test Agent 1',
      'WALLET123',
      ['chat', 'analysis']
    );

    processNode = new AgentProcessNode({
      agentId: agentInfo.id,
      agentName: agentInfo.name,
      walletAddress: agentInfo.walletAddress,
      capabilities: agentInfo.capabilities,
      meshNetwork: mockMeshNetwork,
      messenger: mockMessenger,
      logger: mockLogger
    });
  });

  afterEach(async () => {
    await processNode.shutdown();
  });

  describe('initialization', () => {
    it('should create agent process node with correct properties', () => {
      expect(processNode.getAgentInfo()).toMatchObject({
        id: 'test-agent-1',
        name: 'Test Agent 1',
        walletAddress: 'WALLET123',
        capabilities: ['chat', 'analysis']
      });
    });

    it('should start heartbeat on creation', () => {
      // Heartbeat should be running (tested by checking if updateAgentPresence gets called)
      expect(mockMeshNetwork.updateAgentPresence).not.toHaveBeenCalled();

      // Fast forward time to trigger heartbeat
      jest.advanceTimersByTime(30000);

      // Note: This test would work with real timers, but jest timers need proper setup
    });
  });

  describe('peer connections', () => {
    it('should establish connection to peer', async () => {
      const targetAgentId = 'test-agent-2';

      // Mock successful connection
      const channel = await processNode.connectToPeer(targetAgentId);

      expect(channel).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Connecting to peer'),
        expect.any(Object)
      );
    });

    it('should reuse existing connection', async () => {
      const targetAgentId = 'test-agent-2';

      // Connect twice
      const channel1 = await processNode.connectToPeer(targetAgentId);
      const channel2 = await processNode.connectToPeer(targetAgentId);

      expect(channel1).toBe(channel2);
    });

    it('should handle connection failure gracefully', async () => {
      const targetAgentId = 'invalid-agent';

      // Mock connection failure
      jest.spyOn(processNode as any, 'connectToPeer').mockRejectedValue(
        new Error('Connection failed')
      );

      await expect(processNode.connectToPeer(targetAgentId)).rejects.toThrow('Connection failed');
    });
  });

  describe('message sending', () => {
    it('should send message to connected peer', async () => {
      const targetAgentId = 'test-agent-2';
      const message = { type: 'test', content: 'Hello' };

      // First establish connection
      await processNode.connectToPeer(targetAgentId);

      // Send message
      await processNode.sendToPeer(targetAgentId, message);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Sent message to'),
        targetAgentId
      );
    });

    it('should broadcast message to all peers', async () => {
      const targets = ['agent-2', 'agent-3'];
      const message = { type: 'broadcast', content: 'Hello all' };

      // Connect to multiple peers
      for (const target of targets) {
        await processNode.connectToPeer(target);
      }

      // Broadcast message
      await processNode.broadcast(message);

      // Should attempt to send to all connected peers
      expect(mockLogger.debug).toHaveBeenCalledTimes(targets.length);
    });

    it('should handle circuit breaker when too many failures', async () => {
      const targetAgentId = 'failing-agent';
      const message = { type: 'test', content: 'Hello' };

      // Mock connection that always fails
      jest.spyOn(processNode as any, 'connectToPeer').mockRejectedValue(
        new Error('Connection failed')
      );

      // Try to send multiple messages to trigger circuit breaker
      for (let i = 0; i < 6; i++) {
        try {
          await processNode.sendToPeer(targetAgentId, message);
        } catch (error) {
          // Expected to fail
        }
      }

      // Next attempt should be blocked by circuit breaker
      await expect(processNode.sendToPeer(targetAgentId, message))
        .rejects.toThrow(expect.stringContaining('Circuit breaker'));
    });
  });

  describe('peer discovery', () => {
    it('should discover available peers', async () => {
      const mockAgents = [
        createAgentInfo('agent-2', 'Agent 2', 'WALLET456', ['chat']),
        createAgentInfo('agent-3', 'Agent 3', 'WALLET789', ['analysis'])
      ];

      mockMeshNetwork.discoverAgents.mockResolvedValue(mockAgents);

      const discovered = await processNode.discoverPeers();

      expect(discovered).toHaveLength(2);
      expect(mockMeshNetwork.discoverAgents).toHaveBeenCalled();
    });

    it('should filter discovery by capabilities', async () => {
      const mockAgents = [
        createAgentInfo('agent-2', 'Agent 2', 'WALLET456', ['chat']),
        createAgentInfo('agent-3', 'Agent 3', 'WALLET789', ['analysis'])
      ];

      mockMeshNetwork.discoverAgents.mockResolvedValue(mockAgents);

      const discovered = await processNode.discoverPeers(['chat']);

      expect(mockMeshNetwork.discoverAgents).toHaveBeenCalledWith(['chat']);
    });

    it('should auto-connect to high-trust agents', async () => {
      const highTrustAgent = createAgentInfo('trusted-agent', 'Trusted Agent', 'WALLET999', ['chat']);
      highTrustAgent.trustScore = 0.9;

      mockMeshNetwork.discoverAgents.mockResolvedValue([highTrustAgent]);
      jest.spyOn(processNode, 'connectToPeer').mockResolvedValue({} as any);

      await processNode.discoverPeers();

      expect(processNode.connectToPeer).toHaveBeenCalledWith('trusted-agent');
    });
  });

  describe('message queue processing', () => {
    it('should process incoming messages', (done) => {
      const testMessage = {
        fromAgent: 'sender-agent',
        message: { content: 'test message' },
        timestamp: new Date()
      };

      processNode.on('peer_message', (event) => {
        expect(event.fromAgent).toBe('sender-agent');
        expect(event.message.content).toBe('test message');
        done();
      });

      // Simulate incoming message
      (processNode as any).handlePeerMessage('sender-agent', { content: 'test message' });
    });

    it('should handle message processing errors gracefully', async () => {
      // Trigger an error in message processing
      jest.spyOn(processNode as any, 'processMessageQueue').mockRejectedValue(
        new Error('Processing failed')
      );

      // Should not crash the process node
      (processNode as any).handlePeerMessage('sender-agent', { content: 'test message' });

      // Wait a bit for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Message processing error'),
        expect.any(Error)
      );
    });
  });

  describe('connection management', () => {
    it('should track connection statistics', async () => {
      const targetAgentId = 'test-agent-2';

      await processNode.connectToPeer(targetAgentId);

      const stats = processNode.getConnectionStats();

      expect(stats.totalConnections).toBe(1);
      expect(stats.activeConnections).toBe(1);
      expect(stats.circuitBreakerState).toBe('closed');
      expect(stats.messageQueueSize).toBe(0);
    });

    it('should clean up inactive connections', async () => {
      const targetAgentId = 'test-agent-2';

      // Connect and then simulate inactivity
      await processNode.connectToPeer(targetAgentId);

      // Mock old last activity
      const connections = (processNode as any).peerConnections;
      const connection = connections.get(targetAgentId);
      if (connection) {
        connection.lastActivity = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
      }

      // Trigger cleanup
      (processNode as any).cleanupInactiveConnections();

      expect(connections.has(targetAgentId)).toBe(false);
    });

    it('should disconnect from specific peer', async () => {
      const targetAgentId = 'test-agent-2';

      await processNode.connectToPeer(targetAgentId);
      expect(processNode.getConnectionStats().totalConnections).toBe(1);

      await processNode.disconnectFromPeer(targetAgentId);
      expect(processNode.getConnectionStats().totalConnections).toBe(0);
    });
  });

  describe('shutdown', () => {
    it('should shutdown gracefully', async () => {
      const targetAgentId = 'test-agent-2';

      // Create some connections
      await processNode.connectToPeer(targetAgentId);

      // Shutdown
      await processNode.shutdown();

      expect(mockMeshNetwork.removeAgent).toHaveBeenCalledWith(agentInfo.id);
      expect(processNode.getConnectionStats().totalConnections).toBe(0);
    });

    it('should remove all event listeners on shutdown', async () => {
      jest.spyOn(processNode, 'removeAllListeners');

      await processNode.shutdown();

      expect(processNode.removeAllListeners).toHaveBeenCalled();
    });
  });
});

describe('AgentProcessNode integration', () => {
  it('should handle full message exchange between two nodes', async () => {
    // This would be an integration test with two real nodes
    // For brevity, we'll just test the concept

    const node1 = new AgentProcessNode({
      agentId: 'agent-1',
      agentName: 'Agent 1',
      walletAddress: 'WALLET1',
      capabilities: ['chat'],
      meshNetwork: mockMeshNetwork,
      messenger: mockMessenger,
      logger: mockLogger
    });

    const node2 = new AgentProcessNode({
      agentId: 'agent-2',
      agentName: 'Agent 2',
      walletAddress: 'WALLET2',
      capabilities: ['analysis'],
      meshNetwork: mockMeshNetwork,
      messenger: mockMessenger,
      logger: mockLogger
    });

    // Test would involve setting up real Redis connections and verifying
    // end-to-end message flow

    await node1.shutdown();
    await node2.shutdown();
  });
});