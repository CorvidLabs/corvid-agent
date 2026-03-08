export type DiscordBridgeMode = 'chat' | 'work_intake';

export interface DiscordBridgeConfig {
    botToken: string;
    channelId: string;
    allowedUserIds: string[];
    mode?: DiscordBridgeMode;
    defaultAgentId?: string;
    appId?: string;
    guildId?: string;
}

export interface DiscordInteractionData {
    id: string;
    type: number; // 1=PING, 2=APPLICATION_COMMAND
    channel_id: string;
    guild_id?: string;
    member?: { user: DiscordAuthor };
    user?: DiscordAuthor;
    data?: {
        name: string;
        options?: Array<{ name: string; type: number; value: string | number | boolean }>;
    };
    token: string; // interaction token for responding
}

// Interaction types
export const InteractionType = {
    PING: 1,
    APPLICATION_COMMAND: 2,
} as const;

// Interaction callback types
export const InteractionCallbackType = {
    PONG: 1,
    CHANNEL_MESSAGE: 4,
    DEFERRED_CHANNEL_MESSAGE: 5,
} as const;

export interface DiscordGatewayPayload {
    op: number;
    d: unknown;
    s: number | null;
    t: string | null;
}

export interface DiscordHelloData {
    heartbeat_interval: number;
}

export interface DiscordReadyData {
    session_id: string;
    resume_gateway_url: string;
    user?: { id: string; username: string };
}

export interface DiscordMessageData {
    id: string;
    channel_id: string;
    author: DiscordAuthor;
    content: string;
    timestamp: string;
    /** Present when message is in a thread — the thread's channel ID */
    thread?: { id: string };
    /** Users mentioned in this message — used for @mention detection */
    mentions?: DiscordAuthor[];
}

export interface DiscordAuthor {
    id: string;
    username: string;
    bot?: boolean;
}

// Gateway opcodes
export const GatewayOp = {
    DISPATCH: 0,
    HEARTBEAT: 1,
    IDENTIFY: 2,
    PRESENCE_UPDATE: 3,
    RESUME: 6,
    RECONNECT: 7,
    INVALID_SESSION: 9,
    HELLO: 10,
    HEARTBEAT_ACK: 11,
} as const;

// Gateway intents
export const GatewayIntent = {
    GUILD_MESSAGES: 1 << 9,
    MESSAGE_CONTENT: 1 << 15,
} as const;
