import { PeerChannel } from '../../mesh/PeerChannel';
import { MeshNetwork } from '../../mesh/MeshNetwork';
import { Logger } from '../../utils/Logger';

// Mock Redis
const mockRedis = {
  subscribe: jest.fn(),
  unsubscribe: jest.fn(),
  publish: jest.fn(),
  on: jest.fn(),
  off: jest.fn()
} as any;

const mockMeshNetwork = {
  on: jest.fn(),
  off: jest.fn()
} as any;

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
} as any;

describe('PeerChannel', () => {
  let peerChannel: PeerChannel;

  beforeEach(() => {
    jest.clearAllMocks();

    peerChannel = new PeerChannel({
      sourceAgentId: 'agent-1',
      targetAgentId: 'agent-2',
      meshNetwork: mockMeshNetwork,
      logger: mockLogger,
      redis: mockRedis
    });
  });

  afterEach(async () => {
    await peerChannel.disconnect();
  });

  describe('channel creation', () => {
    it('should create channel with deterministic ID', () => {
      // Test that channel IDs are the same regardless of who initiates
      const channel1 = new PeerChannel({
        sourceAgentId: 'agent-a',
        targetAgentId: 'agent-b',
        meshNetwork: mockMeshNetwork,
        logger: mockLogger,
        redis: mockRedis
      });

      const channel2 = new PeerChannel({
        sourceAgentId: 'agent-b',
        targetAgentId: 'agent-a',
        meshNetwork: mockMeshNetwork,
        logger: mockLogger,
        redis: mockRedis
      });

      const id1 = (channel1 as any).channelId;
      const id2 = (channel2 as any).channelId;

      expect(id1).toBe(id2);

      channel1.disconnect();
      channel2.disconnect();
    });

    it('should set up rate limiting', () => {
      const rateLimiter = (peerChannel as any).rateLimiter;

      expect(rateLimiter.tokens).toBe(10);
      expect(rateLimiter.maxTokens).toBe(10);
      expect(rateLimiter.refillRate).toBe(1);
    });
  });

  describe('connection management', () => {
    it('should connect successfully', async () => {
      mockRedis.subscribe.mockResolvedValue('OK');

      await peerChannel.connect();

      expect(mockRedis.subscribe).toHaveBeenCalled();
      expect(mockRedis.on).toHaveBeenCalledWith('message', expect.any(Function));
      expect(peerChannel.isHealthy()).toBe(true);
    });

    it('should handle connection failure', async () => {
      mockRedis.subscribe.mockRejectedValue(new Error('Redis error'));

      await expect(peerChannel.connect()).rejects.toThrow('Redis error');
    });

    it('should not connect twice', async () => {
      mockRedis.subscribe.mockResolvedValue('OK');

      await peerChannel.connect();
      await peerChannel.connect(); // Second call should be ignored

      expect(mockRedis.subscribe).toHaveBeenCalledTimes(1);
    });
  });

  describe('message sending', () => {
    beforeEach(async () => {
      mockRedis.subscribe.mockResolvedValue('OK');
      mockRedis.publish.mockResolvedValue(1);
      await peerChannel.connect();
      jest.clearAllMocks();
    });

    it('should send message successfully', async () => {
      const content = { type: 'test', data: 'Hello' };

      await peerChannel.sendMessage(content);

      expect(mockRedis.publish).toHaveBeenCalledWith(
        expect.stringContaining('agent-2'),
        expect.stringContaining('Hello')
      );

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Message sent')
      );
    });

    it('should handle message with thread ID', async () => {
      const content = { type: 'test', data: 'Hello' };
      const threadId = 'thread-123';

      await peerChannel.sendMessage(content, threadId);

      expect(mockRedis.publish).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining(threadId)
      );
    });

    it('should respect rate limiting', async () => {
      const content = { type: 'test', data: 'Hello' };

      // Exhaust rate limit tokens
      const rateLimiter = (peerChannel as any).rateLimiter;
      rateLimiter.tokens = 0;

      await expect(peerChannel.sendMessage(content))
        .rejects.toThrow('Rate limit exceeded');

      expect(mockRedis.publish).not.toHaveBeenCalled();
    });

    it('should require connection before sending', async () => {
      await peerChannel.disconnect();

      const content = { type: 'test', data: 'Hello' };

      await expect(peerChannel.sendMessage(content))
        .rejects.toThrow('Channel not connected');
    });

    it('should handle acknowledgement requirements', async () => {
      const content = { type: 'test', data: 'Hello' };

      await peerChannel.sendMessage(content, undefined, { requireAck: true });

      const sentMessage = JSON.parse(mockRedis.publish.mock.calls[0][1]);
      expect(sentMessage.acknowledgementRequired).toBe(true);

      // Should set up acknowledgement timeout
      const pendingAcks = (peerChannel as any).pendingAcks;
      expect(pendingAcks.size).toBe(1);
    });
  });

  describe('message receiving', () => {
    beforeEach(async () => {
      mockRedis.subscribe.mockResolvedValue('OK');
      await peerChannel.connect();
      jest.clearAllMocks();
    });

    it('should receive and emit messages', (done) => {
      const testMessage = {
        id: 'msg-123',
        fromAgent: 'agent-2',
        toAgent: 'agent-1',
        content: { type: 'test', data: 'Hello' },
        timestamp: new Date().toISOString()
      };

      peerChannel.on('message', (message) => {
        expect(message.content.data).toBe('Hello');
        done();
      });

      // Simulate incoming message
      const messageHandler = mockRedis.on.mock.calls[0][1];
      const channel = (peerChannel as any).messageSubscription;
      messageHandler(channel, JSON.stringify(testMessage));
    });

    it('should ignore messages not for this agent', () => {
      const testMessage = {
        id: 'msg-123',
        fromAgent: 'agent-2',
        toAgent: 'agent-3', // Wrong recipient
        content: { type: 'test', data: 'Hello' },
        timestamp: new Date().toISOString()
      };

      const messageSpy = jest.fn();
      peerChannel.on('message', messageSpy);

      // Simulate incoming message
      const messageHandler = mockRedis.on.mock.calls[0][1];
      const channel = (peerChannel as any).messageSubscription;
      messageHandler(channel, JSON.stringify(testMessage));

      expect(messageSpy).not.toHaveBeenCalled();
    });

    it('should send automatic acknowledgement when required', async () => {
      const testMessage = {
        id: 'msg-123',
        fromAgent: 'agent-2',
        toAgent: 'agent-1',
        content: { type: 'test', data: 'Hello' },
        timestamp: new Date().toISOString(),
        acknowledgementRequired: true
      };

      jest.spyOn(peerChannel, 'sendAcknowledgement').mockResolvedValue();

      // Simulate incoming message
      const messageHandler = mockRedis.on.mock.calls[0][1];
      const channel = (peerChannel as any).messageSubscription;
      messageHandler(channel, JSON.stringify(testMessage));

      expect(peerChannel.sendAcknowledgement).toHaveBeenCalledWith(
        'msg-123',
        'received'
      );
    });

    it('should handle malformed messages gracefully', () => {
      const messageSpy = jest.fn();
      peerChannel.on('message', messageSpy);

      // Simulate malformed message
      const messageHandler = mockRedis.on.mock.calls[0][1];
      const channel = (peerChannel as any).messageSubscription;
      messageHandler(channel, 'invalid-json');

      expect(messageSpy).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error handling incoming message'),
        expect.any(Error)
      );
    });
  });

  describe('acknowledgements', () => {
    beforeEach(async () => {
      mockRedis.subscribe.mockResolvedValue('OK');
      await peerChannel.connect();
      jest.clearAllMocks();
    });

    it('should send acknowledgement', async () => {
      await peerChannel.sendAcknowledgement('msg-123', 'received');

      expect(mockRedis.publish).toHaveBeenCalledWith(
        expect.stringContaining('acks'),
        expect.stringContaining('msg-123')
      );
    });

    it('should handle acknowledgement timeout', (done) => {
      const messageId = 'msg-123';

      peerChannel.on('ack_timeout', (event) => {
        expect(event.messageId).toBe(messageId);
        done();
      });

      // Set up acknowledgement timeout with short duration
      const timeout = setTimeout(() => {
        (peerChannel as any).pendingAcks.delete(messageId);
        peerChannel.emit('ack_timeout', { messageId });
      }, 100);

      (peerChannel as any).pendingAcks.set(messageId, timeout);
    });

    it('should clear timeout on acknowledgement received', () => {
      const messageId = 'msg-123';
      const mockTimeout = setTimeout(() => {}, 1000);

      (peerChannel as any).pendingAcks.set(messageId, mockTimeout);

      // Simulate acknowledgement
      const ack = {
        messageId,
        fromAgent: 'agent-2',
        timestamp: new Date().toISOString(),
        status: 'received'
      };

      (peerChannel as any).handleAcknowledgement(ack);

      expect((peerChannel as any).pendingAcks.has(messageId)).toBe(false);
    });
  });

  describe('health monitoring', () => {
    beforeEach(async () => {
      mockRedis.subscribe.mockResolvedValue('OK');
      await peerChannel.connect();
    });

    it('should report healthy when connected', () => {
      expect(peerChannel.isHealthy()).toBe(true);
    });

    it('should report unhealthy after missed pings', () => {
      const healthcheck = (peerChannel as any).healthcheck;
      healthcheck.missedPings = 5; // Exceed threshold

      expect(peerChannel.isHealthy()).toBe(false);
    });

    it('should send ping for health check', async () => {
      jest.spyOn(peerChannel, 'sendMessage').mockResolvedValue();

      await (peerChannel as any).sendPing();

      expect(peerChannel.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'ping' })
      );
    });

    it('should respond to ping with pong', async () => {
      jest.spyOn(peerChannel, 'sendMessage').mockResolvedValue();

      await (peerChannel as any).handlePing();

      expect(peerChannel.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'pong' })
      );
    });

    it('should reset missed pings on pong', () => {
      const healthcheck = (peerChannel as any).healthcheck;
      healthcheck.missedPings = 2;

      (peerChannel as any).handlePong();

      expect(healthcheck.missedPings).toBe(0);
    });
  });

  describe('message history', () => {
    beforeEach(async () => {
      mockRedis.subscribe.mockResolvedValue('OK');
      await peerChannel.connect();
    });

    it('should maintain message history', async () => {
      const content1 = { type: 'test', data: 'Hello 1' };
      const content2 = { type: 'test', data: 'Hello 2' };

      await peerChannel.sendMessage(content1);
      await peerChannel.sendMessage(content2);

      const history = peerChannel.getMessageHistory();

      expect(history).toHaveLength(2);
      expect(history[0].content.data).toBe('Hello 1');
      expect(history[1].content.data).toBe('Hello 2');
    });

    it('should limit history size', async () => {
      const maxHistorySize = (peerChannel as any).maxHistorySize;

      // Send more messages than history limit
      for (let i = 0; i < maxHistorySize + 10; i++) {
        await peerChannel.sendMessage({ type: 'test', data: `Message ${i}` });
      }

      const history = peerChannel.getMessageHistory();
      expect(history).toHaveLength(maxHistorySize);
    });

    it('should get limited history', async () => {
      await peerChannel.sendMessage({ type: 'test', data: 'Hello 1' });
      await peerChannel.sendMessage({ type: 'test', data: 'Hello 2' });
      await peerChannel.sendMessage({ type: 'test', data: 'Hello 3' });

      const limitedHistory = peerChannel.getMessageHistory(2);

      expect(limitedHistory).toHaveLength(2);
      expect(limitedHistory[0].content.data).toBe('Hello 2');
      expect(limitedHistory[1].content.data).toBe('Hello 3');
    });
  });

  describe('statistics', () => {
    beforeEach(async () => {
      mockRedis.subscribe.mockResolvedValue('OK');
      await peerChannel.connect();
    });

    it('should provide channel statistics', async () => {
      await peerChannel.sendMessage({ type: 'test', data: 'Hello' });

      const stats = peerChannel.getStats();

      expect(stats).toHaveProperty('channelId');
      expect(stats).toHaveProperty('isConnected', true);
      expect(stats).toHaveProperty('isHealthy', true);
      expect(stats).toHaveProperty('messagesSent', 1);
      expect(stats).toHaveProperty('messagesReceived', 0);
      expect(stats).toHaveProperty('pendingAcks', 0);
      expect(stats).toHaveProperty('rateLimiterTokens');
    });

    it('should track sent and received messages separately', async () => {
      // Send a message
      await peerChannel.sendMessage({ type: 'test', data: 'Outgoing' });

      // Simulate received message
      const testMessage = {
        id: 'msg-123',
        fromAgent: 'agent-2',
        toAgent: 'agent-1',
        content: { type: 'test', data: 'Incoming' },
        timestamp: new Date().toISOString()
      };

      const messageHandler = mockRedis.on.mock.calls[0][1];
      const channel = (peerChannel as any).messageSubscription;
      messageHandler(channel, JSON.stringify(testMessage));

      const stats = peerChannel.getStats();

      expect(stats.messagesSent).toBe(1);
      expect(stats.messagesReceived).toBe(1);
    });
  });

  describe('disconnection', () => {
    beforeEach(async () => {
      mockRedis.subscribe.mockResolvedValue('OK');
      await peerChannel.connect();
    });

    it('should disconnect gracefully', async () => {
      await peerChannel.disconnect();

      expect(mockRedis.unsubscribe).toHaveBeenCalled();
      expect(peerChannel.isHealthy()).toBe(false);
    });

    it('should clear pending acknowledgements on disconnect', async () => {
      // Set up pending acknowledgement
      const timeout = setTimeout(() => {}, 1000);
      (peerChannel as any).pendingAcks.set('msg-123', timeout);

      await peerChannel.disconnect();

      expect((peerChannel as any).pendingAcks.size).toBe(0);
    });

    it('should emit disconnected event', async () => {
      const disconnectedSpy = jest.fn();
      peerChannel.on('disconnected', disconnectedSpy);

      await peerChannel.disconnect();

      expect(disconnectedSpy).toHaveBeenCalled();
    });

    it('should handle disconnect when not connected', async () => {
      await peerChannel.disconnect();
      await peerChannel.disconnect(); // Second call should be safe

      expect(mockRedis.unsubscribe).toHaveBeenCalledTimes(2);
    });
  });
});