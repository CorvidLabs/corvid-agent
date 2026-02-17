export interface DiscordBridgeConfig {
    botToken: string;
    channelId: string;
}

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
}

export interface DiscordMessageData {
    id: string;
    channel_id: string;
    author: DiscordAuthor;
    content: string;
    timestamp: string;
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
