/**
 * Channel adapter abstraction for multi-channel messaging.
 *
 * Defines the `ChannelAdapter` interface that all messaging channels
 * (AlgoChat, Slack, Discord, etc.) implement, along with the unified
 * `SessionMessage` format and `ChannelStatus` type.
 *
 * @module
 */

/**
 * Unified message format that all channel adapters convert to/from.
 * Provides a channel-agnostic representation of a message flowing
 * through the system.
 */
export interface SessionMessage {
    id: string;
    channelType: string;
    participant: string;
    content: string;
    direction: 'inbound' | 'outbound';
    timestamp: Date;
    metadata?: Record<string, unknown>;
}

/**
 * Channel health/status information returned by `getStatus()`.
 * Each adapter populates the fields relevant to its channel type
 * and may include additional data in `details`.
 */
export interface ChannelStatus {
    channelType: string;
    enabled: boolean;
    connected: boolean;
    details?: Record<string, unknown>;
}

/**
 * Interface for messaging channel adapters.
 *
 * Implementations bridge external messaging systems (Algorand on-chain
 * chat, Slack, Discord, etc.) with the internal agent session system.
 * Each adapter handles protocol-specific concerns (authentication,
 * message encoding, transport) while exposing a uniform API.
 */
export interface ChannelAdapter {
    /** Identifier for the channel type (e.g., 'algochat', 'slack', 'discord'). */
    readonly channelType: string;

    /** Send an outbound message to a participant. */
    sendMessage(participant: string, content: string): Promise<void>;

    /** Register a handler for inbound messages. */
    onMessage(handler: (msg: SessionMessage) => void): void;

    /** Start the channel adapter (begin listening for messages). */
    start(): void;

    /** Stop the channel adapter (cease listening, clean up resources). */
    stop(): void;

    /** Get the current health/status of the channel. */
    getStatus(): Promise<ChannelStatus>;
}
