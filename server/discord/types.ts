export type DiscordBridgeMode = 'chat' | 'work_intake';

export interface DiscordBridgeConfig {
    botToken: string;
    /** Primary channel ID (always monitored). */
    channelId: string;
    /** Additional channel IDs to monitor (multi-channel support). */
    additionalChannelIds?: string[];
    allowedUserIds: string[];
    mode?: DiscordBridgeMode;
    defaultAgentId?: string;
    appId?: string;
    guildId?: string;
    /**
     * When true, any user can interact with the bot (subject to role-based access).
     * When false (default), only allowedUserIds can interact.
     */
    publicMode?: boolean;
    /**
     * Role-based access control. Maps Discord role IDs to permission levels.
     * Higher levels can access more features.
     *   0 = blocked (cannot interact)
     *   1 = basic (chat in threads, @mention)
     *   2 = standard (slash commands, sessions)
     *   3 = admin (council, work intake, mute/unmute)
     */
    rolePermissions?: Record<string, number>;
    /**
     * Default permission level for users with no matching role.
     * Only applies in publicMode. Default: 1 (basic).
     */
    defaultPermissionLevel?: number;
    /**
     * Rate limit overrides by permission level.
     * Maps permission level → max messages per window.
     */
    rateLimitByLevel?: Record<number, number>;
}

/** Recursive option type — supports subcommand groups and subcommands with nested options. */
export interface DiscordInteractionOption {
    name: string;
    type: number;
    value?: string | number | boolean;
    /** Nested options — present for SUB_COMMAND (type 1) and SUB_COMMAND_GROUP (type 2) */
    options?: DiscordInteractionOption[];
}

export interface DiscordInteractionData {
    id: string;
    type: number; // 1=PING, 2=APPLICATION_COMMAND, 3=MESSAGE_COMPONENT
    channel_id: string;
    guild_id?: string;
    member?: { user: DiscordAuthor; roles?: string[] };
    user?: DiscordAuthor;
    data?: {
        name: string;
        options?: DiscordInteractionOption[];
        /** For component interactions — the custom_id of the button clicked */
        custom_id?: string;
        /** For component interactions — the component type */
        component_type?: number;
    };
    token: string; // interaction token for responding
    /** The message the component was attached to (for component interactions) */
    message?: { id: string; channel_id: string };
}

// Interaction types
export const InteractionType = {
    PING: 1,
    APPLICATION_COMMAND: 2,
    MESSAGE_COMPONENT: 3,
} as const;

// Interaction callback types
export const InteractionCallbackType = {
    PONG: 1,
    CHANNEL_MESSAGE: 4,
    DEFERRED_CHANNEL_MESSAGE: 5,
    UPDATE_MESSAGE: 7,
} as const;

// Component types
export const ComponentType = {
    ACTION_ROW: 1,
    BUTTON: 2,
} as const;

// Button styles
export const ButtonStyle = {
    PRIMARY: 1,
    SECONDARY: 2,
    SUCCESS: 3,
    DANGER: 4,
} as const;

export interface DiscordButton {
    type: typeof ComponentType.BUTTON;
    style: number;
    label: string;
    custom_id: string;
    emoji?: { name: string };
    disabled?: boolean;
}

export interface DiscordActionRow {
    type: typeof ComponentType.ACTION_ROW;
    components: DiscordButton[];
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
    /** Guild member info — includes roles when GUILD_MEMBERS intent is present */
    member?: { roles: string[] };
}

/** Permission levels for role-based access. */
export const PermissionLevel = {
    BLOCKED: 0,
    BASIC: 1,
    STANDARD: 2,
    ADMIN: 3,
} as const;
export type PermissionLevel = (typeof PermissionLevel)[keyof typeof PermissionLevel];

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
    GUILDS: 1 << 0,
    GUILD_MEMBERS: 1 << 1,
    GUILD_MESSAGES: 1 << 9,
    MESSAGE_CONTENT: 1 << 15,
} as const;
