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
    /** The bot's managed role ID (used to detect @role mentions of the bot). */
    botRoleId?: string;
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
    /**
     * Per-channel permission floors. Maps channel IDs to a minimum permission level.
     * Users in that channel get at least this level, regardless of roles.
     * Useful for invite-only channels where members don't have specific roles.
     */
    channelPermissions?: Record<string, number>;
    /**
     * Channel IDs where STANDARD-tier users may use full `/message` tool access
     * (same capabilities as admin in that channel, but replies still require STANDARD+).
     * Admins always have full `/message` in any monitored channel.
     */
    messageFullToolChannelIds?: string[];
}

/** Recursive option type — supports subcommand groups and subcommands with nested options. */
export interface DiscordInteractionOption {
    name: string;
    type: number;
    value?: string | number | boolean;
    /** True when this is the option the user is currently typing (autocomplete interactions only) */
    focused?: boolean;
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
    /**
     * Timestamp (ms since epoch) set by the gateway when the INTERACTION_CREATE event
     * is received. Used to enforce Discord's 3-second interaction response deadline —
     * stale autocomplete responses are skipped rather than sending a guaranteed 404.
     */
    receivedAt?: number;
}

// Interaction types
export const InteractionType = {
    PING: 1,
    APPLICATION_COMMAND: 2,
    MESSAGE_COMPONENT: 3,
    APPLICATION_COMMAND_AUTOCOMPLETE: 4,
} as const;

// Interaction callback types
export const InteractionCallbackType = {
    PONG: 1,
    CHANNEL_MESSAGE: 4,
    DEFERRED_CHANNEL_MESSAGE: 5,
    UPDATE_MESSAGE: 7,
    AUTOCOMPLETE_RESULT: 8,
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

/** A file attached to a Discord message. */
export interface DiscordAttachment {
    id: string;
    filename: string;
    /** MIME type (e.g. "image/png") — may be absent for unknown types. */
    content_type?: string;
    /** File size in bytes. */
    size: number;
    /** CDN URL for the attachment. */
    url: string;
    /** Proxied CDN URL (preferred — does not expire as quickly). */
    proxy_url: string;
    /** Image width in pixels (only present for image attachments). */
    width?: number;
    /** Image height in pixels (only present for image attachments). */
    height?: number;
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
    /** Role IDs mentioned in this message — used for role @mention detection */
    mention_roles?: string[];
    /** Guild member info — includes roles when GUILD_MEMBERS intent is present */
    member?: { roles: string[] };
    /** Present when this message is a reply to another message */
    message_reference?: { message_id: string; channel_id?: string; guild_id?: string };
    /** The message being replied to (populated by Discord when available) */
    referenced_message?: {
        id: string;
        content: string;
        author: DiscordAuthor;
    } | null;
    /** File attachments on the message. */
    attachments?: DiscordAttachment[];
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

/** Payload received from Discord MESSAGE_REACTION_ADD dispatch event. */
export interface DiscordReactionData {
    user_id: string;
    channel_id: string;
    message_id: string;
    guild_id?: string;
    emoji: { id: string | null; name: string };
}
