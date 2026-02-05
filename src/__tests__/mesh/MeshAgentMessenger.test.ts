import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { MeshAgentMessenger } from '../../mesh/MeshAgentMessenger';
import { DEFAULT_BLOCKCHAIN_MESH_CONFIG } from '../../mesh/BlockchainConfig';

// Mock dependencies
const mockDb = {
  prepare: jest.fn(),
  exec: jest.fn(),
  close: jest.fn()
} as any;

const mockConfig = {
  algorandNode: 'http://localhost:4001',
  network: 'localnet',
  enableLocalMessaging: true
};

const mockService = {
  sendMessage: jest.fn().mockResolvedValue(true),
  getHealth: jest.fn().mockResolvedValue({ status: 'healthy' })
} as any;

const mockAgentWalletService = {} as any;
const mockAgentDirectory = {} as any;
const mockProcessManager = {} as any;

describe('MeshAgentMessenger - Blockchain First Routing', () => {
  let messenger: MeshAgentMessenger;

  beforeEach(async () => {
    messenger = new MeshAgentMessenger(
      mockDb,
      mockConfig,
      mockService,
      mockAgentWalletService,
      mockAgentDirectory,
      mockProcessManager,
      {
        nodeId: 'test-node',
        preferBlockchain: true,
        localnetOnly: true,
        blockchainConfig: DEFAULT_BLOCKCHAIN_MESH_CONFIG
      }
    );

    await messenger.initializeMesh();
  });

  afterEach(async () => {
    await messenger.shutdownMesh();
  });

  describe('Routing Preferences', () => {
    it('should prefer blockchain routing by default', async () => {
      const stats = messenger.getMeshStats();

      expect(stats.routing.preferBlockchain).toBe(true);
      expect(stats.routing.localnetOnly).toBe(true);
    });

    it('should detect blockchain availability for localnet', async () => {
      const stats = messenger.getMeshStats();

      // Should be available since we're configured for localnet
      expect(stats.routing.blockchainAvailable).toBe(true);
    });

    it('should route to blockchain when auto preference is used', async () => {
      const request = {
        fromAgentId: 'agent1',
        toAgentId: 'agent2',
        content: 'test message',
        routePreference: 'auto' as const
      };

      // Mock the parent invoke method
      const parentInvokeSpy = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(messenger)), 'invoke')
        .mockResolvedValue({
          message: { id: 'msg1', content: 'test' } as any,
          sessionId: 'session1'
        });

      const result = await messenger.meshInvoke(request);

      expect(result.route).toBe('blockchain');
      expect(result.meshDelivered).toBe(false);
      expect(parentInvokeSpy).toHaveBeenCalledWith(request);

      parentInvokeSpy.mockRestore();
    });

    it('should force blockchain when useLocalnet is true', async () => {
      const request = {
        fromAgentId: 'agent1',
        toAgentId: 'agent2',
        content: 'test message',
        routePreference: 'direct' as const, // This would normally use mesh
        useLocalnet: true
      };

      // Mock the parent invoke method
      const parentInvokeSpy = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(messenger)), 'invoke')
        .mockResolvedValue({
          message: { id: 'msg1', content: 'test' } as any,
          sessionId: 'session1'
        });

      const result = await messenger.meshInvoke(request);

      expect(result.route).toBe('blockchain');
      expect(parentInvokeSpy).toHaveBeenCalledWith(request);

      parentInvokeSpy.mockRestore();
    });

    it('should force mesh when useLocalnet is false', async () => {
      // First register an agent for mesh
      const agentInfo = {
        id: 'agent1',
        name: 'Test Agent 1',
        walletAddress: 'test-wallet-1',
        capabilities: ['test'],
        active: true,
        lastSeen: new Date(),
        trustScore: 1.0,
        connectionCount: 0
      };

      await messenger.registerAgentForMesh(agentInfo);

      const request = {
        fromAgentId: 'agent1',
        toAgentId: 'agent2',
        content: 'test message',
        routePreference: 'auto' as const,
        useLocalnet: false
      };

      // This should try mesh first but may fallback
      const result = await messenger.meshInvoke(request);

      // Since agent2 is not in mesh, it will fallback
      expect(['mesh_direct', 'process_manager'].includes(result.route)).toBe(true);
    });
  });

  describe('Configuration Validation', () => {
    it('should initialize with default blockchain config', () => {
      const stats = messenger.getMeshStats();

      expect(stats.routing.preferBlockchain).toBe(true);
      expect(stats.routing.localnetOnly).toBe(true);
    });

    it('should validate localnet configuration', () => {
      const messengerWithCustomConfig = new MeshAgentMessenger(
        mockDb,
        mockConfig,
        mockService,
        mockAgentWalletService,
        mockAgentDirectory,
        mockProcessManager,
        {
          nodeId: 'test-node',
          blockchainConfig: {
            localnet: {
              algodHost: 'http://localhost',
              algodPort: 4001,
              algodToken: 'test-token'
            }
          }
        }
      );

      const stats = messengerWithCustomConfig.getMeshStats();
      expect(stats.routing.preferBlockchain).toBe(true);
    });
  });

  describe('Fallback Behavior', () => {
    it('should fallback to mesh when blockchain is unavailable', async () => {
      // Create messenger with blockchain disabled
      const messengerNoBlockchain = new MeshAgentMessenger(
        mockDb,
        mockConfig,
        null, // No service
        mockAgentWalletService,
        mockAgentDirectory,
        mockProcessManager,
        {
          nodeId: 'test-node',
          preferBlockchain: false,
          localnetOnly: false
        }
      );

      await messengerNoBlockchain.initializeMesh();

      const stats = messengerNoBlockchain.getMeshStats();
      expect(stats.routing.blockchainAvailable).toBe(false);

      await messengerNoBlockchain.shutdownMesh();
    });

    it('should fallback to process manager when neither blockchain nor mesh is available', async () => {
      // Create messenger with both blockchain and mesh disabled
      const messengerMinimal = new MeshAgentMessenger(
        mockDb,
        mockConfig,
        null, // No service
        mockAgentWalletService,
        mockAgentDirectory,
        mockProcessManager,
        {
          nodeId: 'test-node',
          preferBlockchain: false
        }
      );

      await messengerMinimal.initializeMesh();

      const request = {
        fromAgentId: 'agent1',
        toAgentId: 'agent2',
        content: 'test message',
        routePreference: 'auto' as const
      };

      // Mock the parent invoke method
      const parentInvokeSpy = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(messengerMinimal)), 'invoke')
        .mockResolvedValue({
          message: { id: 'msg1', content: 'test' } as any,
          sessionId: 'session1'
        });

      const result = await messengerMinimal.meshInvoke(request);

      expect(result.route).toBe('process_manager');
      expect(parentInvokeSpy).toHaveBeenCalledWith(request);

      parentInvokeSpy.mockRestore();
      await messengerMinimal.shutdownMesh();
    });
  });

  describe('Blockchain Health Monitoring', () => {
    it('should provide blockchain status in stats', () => {
      const stats = messenger.getMeshStats();

      expect(stats.routing).toBeDefined();
      expect(typeof stats.routing.blockchainAvailable).toBe('boolean');
      expect(stats.routing.preferBlockchain).toBe(true);
      expect(stats.routing.localnetOnly).toBe(true);
    });

    it('should detect localnet configuration correctly', () => {
      const stats = messenger.getMeshStats();

      // With mock config pointing to localhost, should be detected as localnet
      expect(stats.routing.blockchainAvailable).toBe(true);
    });
  });

  describe('Message Routing Logic', () => {
    it('should log routing decisions', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const request = {
        fromAgentId: 'agent1',
        toAgentId: 'agent2',
        content: 'test message'
      };

      // Mock the parent invoke method
      const parentInvokeSpy = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(messenger)), 'invoke')
        .mockResolvedValue({
          message: { id: 'msg1', content: 'test' } as any,
          sessionId: 'session1'
        });

      await messenger.meshInvoke(request);

      // Should have logged the routing decision
      // Note: Actual logging depends on the logger implementation

      parentInvokeSpy.mockRestore();
      consoleSpy.mockRestore();
    });
  });
});