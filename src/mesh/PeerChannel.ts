import { EventEmitter } from 'events';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { MeshNetwork } from './MeshNetwork';
import { Logger } from '../utils/Logger';

export interface PeerChannelConfig {
  sourceAgentId: string;
  targetAgentId: string;
  meshNetwork: MeshNetwork;
  logger: Logger;
  redis?: Redis;
}

export interface ChannelMessage {
  id: string;
  fromAgent: string;
  toAgent: string;
  content: any;
  threadId?: string;
  timestamp: Date;
  acknowledgementRequired?: boolean;
}

export interface MessageAcknowledgement {
  messageId: string;
  fromAgent: string;
  timestamp: Date;
  status: 'received' | 'processed' | 'error';
  error?: string;
}

export class PeerChannel extends EventEmitter {
  private sourceAgentId: string;
  private targetAgentId: string;
  private channelId: string;
  private meshNetwork: MeshNetwork;
  private logger: Logger;
  private redis: Redis;

  private isConnected = false;
  private messageSubscription: string | null = null;
  private ackSubscription: string | null = null;

  // Message delivery tracking
  private pendingAcks = new Map<string, NodeJS.Timeout>();
  private messageHistory: ChannelMessage[] = [];
  private maxHistorySize = 100;

  // Rate limiting
  private rateLimiter = {
    tokens: 10,
    maxTokens: 10,
    refillRate: 1, // tokens per second
    lastRefill: Date.now()
  };

  // Connection health
  private healthcheck = {
    lastPing: null as Date | null,
    lastPong: null as Date | null,
    pingInterval: null as NodeJS.Timeout | null,
    missedPings: 0,
    maxMissedPings: 3
  };

  constructor(config: PeerChannelConfig) {
    super();

    this.sourceAgentId = config.sourceAgentId;
    this.targetAgentId = config.targetAgentId;
    this.meshNetwork = config.meshNetwork;
    this.logger = config.logger;

    // Create unique channel identifier
    this.channelId = this.createChannelId(config.sourceAgentId, config.targetAgentId);

    // Use provided Redis or create new connection
    this.redis = config.redis || new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3
    });

    this.setupRateLimiter();
  }

  /**
   * Create a deterministic channel ID for bidirectional communication
   */
  private createChannelId(agent1: string, agent2: string): string {
    // Sort agents to ensure same channel ID regardless of who initiates
    const sortedAgents = [agent1, agent2].sort();
    return `channel:${sortedAgents[0]}:${sortedAgents[1]}`;
  }

  /**
   * Establish the peer channel connection
   */
  public async connect(): Promise<void> {
    if (this.isConnected) return;

    try {
      // Subscribe to incoming messages
      this.messageSubscription = `${this.channelId}:messages:${this.sourceAgentId}`;
      this.ackSubscription = `${this.channelId}:acks:${this.sourceAgentId}`;

      await this.redis.subscribe(this.messageSubscription, this.ackSubscription);

      // Set up message handlers
      this.redis.on('message', (channel, message) => {
        this.handleIncomingMessage(channel, message);
      });

      // Start health checking
      this.startHealthCheck();

      this.isConnected = true;
      this.emit('connected');

      this.logger.debug(`Peer channel connected: ${this.sourceAgentId} -> ${this.targetAgentId}`);

    } catch (error) {
      this.logger.error(`Failed to connect peer channel: ${this.sourceAgentId} -> ${this.targetAgentId}`, error);
      throw error;
    }
  }

  /**
   * Send a message through the peer channel
   */
  public async sendMessage(content: any, threadId?: string, options?: { requireAck?: boolean }): Promise<void> {
    if (!this.isConnected) {
      throw new Error(`Channel not connected: ${this.sourceAgentId} -> ${this.targetAgentId}`);
    }

    // Check rate limiting
    if (!this.checkRateLimit()) {
      throw new Error('Rate limit exceeded for peer channel');
    }

    const message: ChannelMessage = {
      id: uuidv4(),
      fromAgent: this.sourceAgentId,
      toAgent: this.targetAgentId,
      content,
      threadId,
      timestamp: new Date(),
      acknowledgementRequired: options?.requireAck || false
    };

    try {
      // Send message to target agent's subscription
      const targetChannel = `${this.channelId}:messages:${this.targetAgentId}`;
      await this.redis.publish(targetChannel, JSON.stringify(message));

      // Store in message history
      this.addToHistory(message);

      // Set up acknowledgement timeout if required
      if (message.acknowledgementRequired) {
        this.setupAckTimeout(message.id);
      }

      this.emit('message_sent', message);
      this.logger.debug(`Message sent via peer channel: ${message.id}`);

    } catch (error) {
      this.logger.error(`Failed to send peer message: ${message.id}`, error);
      throw error;
    }
  }

  /**
   * Send an acknowledgement for a received message
   */
  public async sendAcknowledgement(
    messageId: string,
    status: 'received' | 'processed' | 'error',
    error?: string
  ): Promise<void> {
    const ack: MessageAcknowledgement = {
      messageId,
      fromAgent: this.sourceAgentId,
      timestamp: new Date(),
      status,
      error
    };

    try {
      const ackChannel = `${this.channelId}:acks:${this.targetAgentId}`;
      await this.redis.publish(ackChannel, JSON.stringify(ack));

      this.logger.debug(`Acknowledgement sent: ${messageId} -> ${status}`);
    } catch (error) {
      this.logger.error(`Failed to send acknowledgement: ${messageId}`, error);
    }
  }

  /**
   * Get the channel's message history
   */
  public getMessageHistory(limit?: number): ChannelMessage[] {
    const messages = [...this.messageHistory];
    return limit ? messages.slice(-limit) : messages;
  }

  /**
   * Check if the channel is healthy and connected
   */
  public isHealthy(): boolean {
    return this.isConnected &&
           this.healthcheck.missedPings < this.healthcheck.maxMissedPings;
  }

  /**
   * Get channel statistics
   */
  public getStats() {
    return {
      channelId: this.channelId,
      isConnected: this.isConnected,
      isHealthy: this.isHealthy(),
      messagesSent: this.messageHistory.filter(m => m.fromAgent === this.sourceAgentId).length,
      messagesReceived: this.messageHistory.filter(m => m.fromAgent === this.targetAgentId).length,
      pendingAcks: this.pendingAcks.size,
      rateLimiterTokens: this.rateLimiter.tokens,
      lastActivity: this.messageHistory.length > 0 ?
        this.messageHistory[this.messageHistory.length - 1].timestamp : null
    };
  }

  /**
   * Handle incoming messages from Redis
   */
  private handleIncomingMessage(channel: string, message: string): void {
    try {
      if (channel === this.messageSubscription) {
        // Handle incoming message
        const channelMessage: ChannelMessage = JSON.parse(message);

        // Verify the message is for us
        if (channelMessage.toAgent !== this.sourceAgentId) {
          return;
        }

        // Add to history
        this.addToHistory(channelMessage);

        // Send automatic acknowledgement if required
        if (channelMessage.acknowledgementRequired) {
          this.sendAcknowledgement(channelMessage.id, 'received');
        }

        // Emit message event
        this.emit('message', channelMessage);

      } else if (channel === this.ackSubscription) {
        // Handle acknowledgement
        const ack: MessageAcknowledgement = JSON.parse(message);
        this.handleAcknowledgement(ack);
      }

    } catch (error) {
      this.logger.error(`Error handling incoming message: ${channel}`, error);
    }
  }

  /**
   * Handle message acknowledgement
   */
  private handleAcknowledgement(ack: MessageAcknowledgement): void {
    const timeout = this.pendingAcks.get(ack.messageId);
    if (timeout) {
      clearTimeout(timeout);
      this.pendingAcks.delete(ack.messageId);
    }

    this.emit('acknowledgement', ack);
    this.logger.debug(`Acknowledgement received: ${ack.messageId} -> ${ack.status}`);
  }

  /**
   * Set up acknowledgement timeout
   */
  private setupAckTimeout(messageId: string): void {
    const timeout = setTimeout(() => {
      this.pendingAcks.delete(messageId);
      this.emit('ack_timeout', { messageId });
      this.logger.warn(`Acknowledgement timeout for message: ${messageId}`);
    }, 30000); // 30 second timeout

    this.pendingAcks.set(messageId, timeout);
  }

  /**
   * Add message to history with size limiting
   */
  private addToHistory(message: ChannelMessage): void {
    this.messageHistory.push(message);

    if (this.messageHistory.length > this.maxHistorySize) {
      this.messageHistory.shift();
    }
  }

  /**
   * Check rate limiting
   */
  private checkRateLimit(): boolean {
    const now = Date.now();
    const elapsed = (now - this.rateLimiter.lastRefill) / 1000;

    // Refill tokens
    const tokensToAdd = elapsed * this.rateLimiter.refillRate;
    this.rateLimiter.tokens = Math.min(
      this.rateLimiter.maxTokens,
      this.rateLimiter.tokens + tokensToAdd
    );
    this.rateLimiter.lastRefill = now;

    // Check if we have tokens
    if (this.rateLimiter.tokens >= 1) {
      this.rateLimiter.tokens--;
      return true;
    }

    return false;
  }

  /**
   * Set up rate limiter refill
   */
  private setupRateLimiter(): void {
    setInterval(() => {
      this.checkRateLimit(); // This will refill tokens
    }, 1000);
  }

  /**
   * Start health checking
   */
  private startHealthCheck(): void {
    this.healthcheck.pingInterval = setInterval(() => {
      this.sendPing();
    }, 30000); // Ping every 30 seconds
  }

  /**
   * Send ping for health check
   */
  private async sendPing(): Promise<void> {
    try {
      await this.sendMessage({ type: 'ping', timestamp: new Date() });
      this.healthcheck.lastPing = new Date();
    } catch (error) {
      this.healthcheck.missedPings++;
      this.logger.warn(`Health check ping failed: ${this.healthcheck.missedPings}`);

      if (this.healthcheck.missedPings >= this.healthcheck.maxMissedPings) {
        this.emit('unhealthy');
      }
    }
  }

  /**
   * Handle incoming ping
   */
  private async handlePing(): Promise<void> {
    try {
      await this.sendMessage({ type: 'pong', timestamp: new Date() });
    } catch (error) {
      this.logger.error('Failed to respond to ping', error);
    }
  }

  /**
   * Handle incoming pong
   */
  private handlePong(): void {
    this.healthcheck.lastPong = new Date();
    this.healthcheck.missedPings = 0;
  }

  /**
   * Disconnect the peer channel
   */
  public async disconnect(): Promise<void> {
    if (!this.isConnected) return;

    try {
      // Clear health check
      if (this.healthcheck.pingInterval) {
        clearInterval(this.healthcheck.pingInterval);
      }

      // Clear pending acknowledgement timeouts
      for (const timeout of this.pendingAcks.values()) {
        clearTimeout(timeout);
      }
      this.pendingAcks.clear();

      // Unsubscribe from Redis channels
      if (this.messageSubscription) {
        await this.redis.unsubscribe(this.messageSubscription);
      }
      if (this.ackSubscription) {
        await this.redis.unsubscribe(this.ackSubscription);
      }

      this.isConnected = false;
      this.emit('disconnected');

      this.logger.debug(`Peer channel disconnected: ${this.sourceAgentId} -> ${this.targetAgentId}`);

    } catch (error) {
      this.logger.error('Error disconnecting peer channel', error);
      throw error;
    }
  }
}