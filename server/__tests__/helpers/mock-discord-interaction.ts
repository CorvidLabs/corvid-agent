/**
 * Test helpers: create lightweight mock discord.js interaction objects.
 *
 * After the Phase 3 Part 2 migration, handlers receive discord.js interaction
 * objects directly (ChatInputCommandInteraction, AutocompleteInteraction,
 * MessageComponentInteraction). These mocks satisfy the duck-typed interface
 * without importing the full discord.js library.
 *
 * Responses are captured on the mock's `_responses` array (populated by
 * `reply()` and `editReply()` calls) rather than through the REST client mock.
 */

import { mock } from 'bun:test';

export interface MockInteractionOptions {
    /** STRING options by name. */
    strings?: Record<string, string | null>;
    /** INTEGER options by name. */
    integers?: Record<string, number | null>;
    /** BOOLEAN options by name. */
    booleans?: Record<string, boolean | null>;
    /** USER options — value is a { id: string } object. */
    users?: Record<string, { id: string; username?: string } | null>;
    /** CHANNEL options — value is a { id: string } object. */
    channels?: Record<string, { id: string } | null>;
    /** ROLE options — value is a { id: string } object. */
    roles?: Record<string, { id: string } | null>;
    /** Subcommand name (for commands that use addSubcommand). */
    subcommand?: string | null;
    /** Subcommand group name (for commands that use addSubcommandGroup). */
    subcommandGroup?: string | null;
}

export interface MockInteractionResponse {
    content?: string;
    embeds?: Array<Record<string, unknown>>;
    ephemeral?: boolean;
    [key: string]: unknown;
}

/**
 * Create a mock ChatInputCommandInteraction (slash command).
 *
 * @param commandName The name of the slash command (e.g. 'session', 'admin')
 * @param opts        Option values the interaction should surface
 * @param userId      Discord user ID of the invoker
 * @param channelId   Discord channel ID where the command was issued
 * @param memberRoles Role IDs the invoking member holds
 */
export function makeMockChatInteraction(
    commandName: string,
    opts: MockInteractionOptions = {},
    userId = '200000000000000001',
    channelId = '100000000000000001',
    memberRoles: string[] = [],
) {
    const responses: MockInteractionResponse[] = [];
    let deferred = false;

    return {
        commandName,
        channelId,
        user: { id: userId, username: 'testuser' },
        member: { roles: memberRoles, user: { id: userId, username: 'testuser' } },
        isChatInputCommand: () => true as const,
        isAutocomplete: () => false as const,
        isMessageComponent: () => false as const,
        reply: mock(async (data: MockInteractionResponse) => { responses.push(data); }),
        deferReply: mock(async () => { deferred = true; }),
        editReply: mock(async (data: MockInteractionResponse) => { responses.push(data); }),
        options: {
            getString: (name: string) => opts.strings?.[name] ?? null,
            getInteger: (name: string) => opts.integers?.[name] ?? null,
            getBoolean: (name: string) => opts.booleans?.[name] ?? null,
            getUser: (name: string) => opts.users?.[name] ?? null,
            getChannel: (name: string) => opts.channels?.[name] ?? null,
            getRole: (name: string) => opts.roles?.[name] ?? null,
            getSubcommand: (_required?: boolean) => opts.subcommand ?? null,
            getSubcommandGroup: (_required?: boolean) => opts.subcommandGroup ?? null,
        },
        // ─── Test accessors ───────────────────────────────────────────────
        _responses: responses,
        get _deferred() { return deferred; },
        /** First response content string. */
        getContent: () => (responses[0]?.content as string) ?? '',
        /** First response embed. */
        getEmbed: () => {
            const embeds = responses[0]?.embeds as Array<Record<string, unknown>> | undefined;
            return embeds?.[0] ?? null;
        },
        /** All embeds from the first response. */
        getEmbeds: () => (responses[0]?.embeds as Array<Record<string, unknown>>) ?? [],
    };
}

/**
 * Create a mock AutocompleteInteraction.
 *
 * @param commandName  The slash command name that triggered autocomplete
 * @param focusedName  The option field currently focused
 * @param focusedValue The value the user has typed so far
 */
export function makeMockAutocompleteInteraction(
    commandName: string,
    focusedName: string,
    focusedValue = '',
) {
    const responded: Array<{ name: string; value: string }[]> = [];

    return {
        commandName,
        isAutocomplete: () => true as const,
        isChatInputCommand: () => false as const,
        isMessageComponent: () => false as const,
        options: {
            getFocused: (_full?: boolean) => ({ name: focusedName, value: focusedValue, focused: true }),
        },
        respond: mock(async (choices: Array<{ name: string; value: string }>) => {
            responded.push(choices);
        }),
        // ─── Test accessors ───────────────────────────────────────────────
        _responded: responded,
        getChoices: () => responded[0] ?? [],
    };
}

/**
 * Create a mock AutocompleteInteraction with NO focused option.
 * Used to test the "no focused option" edge case.
 */
export function makeMockAutocompleteNoFocus(commandName: string) {
    const responded: Array<{ name: string; value: string }[]> = [];

    return {
        commandName,
        isAutocomplete: () => true as const,
        isChatInputCommand: () => false as const,
        isMessageComponent: () => false as const,
        options: {
            // getFocused(true) is expected to throw or return null — simulate discord.js
            // behaviour by returning a non-focused placeholder
            getFocused: (_full?: boolean) => ({ name: 'agent', value: '', focused: false }),
        },
        respond: mock(async (choices: Array<{ name: string; value: string }>) => {
            responded.push(choices);
        }),
        _responded: responded,
        getChoices: () => responded[0] ?? [],
    };
}

/**
 * Create a mock MessageComponentInteraction (button / select menu click).
 *
 * @param customId    The custom_id string of the button/component pressed
 * @param userId      Discord user ID of the clicker
 * @param channelId   Discord channel (or thread) ID
 * @param memberRoles Role IDs the member holds
 */
export function makeMockComponentInteraction(
    customId: string,
    userId = '200000000000000001',
    channelId = '100000000000000001',
    memberRoles: string[] = [],
) {
    const responses: MockInteractionResponse[] = [];

    return {
        customId,
        channelId,
        user: { id: userId, username: 'testuser' },
        member: { roles: memberRoles, user: { id: userId, username: 'testuser' } },
        isChatInputCommand: () => false as const,
        isAutocomplete: () => false as const,
        isMessageComponent: () => true as const,
        reply: mock(async (data: MockInteractionResponse) => { responses.push(data); }),
        // ─── Test accessors ───────────────────────────────────────────────
        _responses: responses,
        getContent: () => (responses[0]?.content as string) ?? '',
    };
}
