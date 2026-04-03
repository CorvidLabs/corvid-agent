/**
 * Discord embed builders and interaction responders.
 *
 * Low-level Discord API helpers for sending messages, embeds, reactions,
 * and responding to interactions.
 */

import type { DiscordInteractionData, DiscordActionRow } from './types';
import { InteractionCallbackType, ComponentType, ButtonStyle } from './types';
import type { DeliveryTracker } from '../lib/delivery-tracker';
import { splitMessage } from './message-formatter';
import { createLogger } from '../lib/logger';

const log = createLogger('DiscordEmbeds');

const MAX_MESSAGE_LENGTH = 2000;

// ─── Rate limit tracking ──────────────────────────────────────────────────
// When Discord returns 429, we pause ALL API calls for the retry-after
// duration to avoid hammering and triggering Cloudflare IP bans.
let rateLimitedUntil = 0;

/** Check if we're currently rate-limited. Returns remaining wait ms or 0. */
export function getRateLimitWaitMs(): number {
    // Skip rate limit enforcement in test environments to prevent test contamination.
    if (process.env.BUN_TEST) return 0;
    return Math.max(0, rateLimitedUntil - Date.now());
}

/**
 * Wrapper for Discord API fetch that handles 429 rate limits globally.
 * When rate-limited, queues the request until the limit expires.
 * Prevents Cloudflare IP bans from rapid 429 retries.
 */
export async function discordFetch(url: string, init: RequestInit): Promise<Response> {
    // Interaction callbacks (/interactions/{id}/{token}/callback) are on a separate
    // rate-limit bucket and have a hard 3-second deadline from Discord.
    // Delaying them with the global rate limiter causes dropdowns/autocomplete to fail.
    const isInteractionCallback = url.includes('/interactions/') && url.endsWith('/callback');

    if (!isInteractionCallback) {
        const waitMs = getRateLimitWaitMs();
        if (waitMs > 0) {
            log.debug(`Discord rate-limited, waiting ${waitMs}ms before request`);
            await new Promise(r => setTimeout(r, waitMs));
        }
    }

    const response = await globalThis.fetch(url, init);

    if (response.status === 429 && !process.env.BUN_TEST) {
        // Parse retry-after from Discord's JSON response or header
        let retryAfterMs = 5000; // default 5s
        try {
            const retryHeader = response.headers.get('retry-after');
            if (retryHeader) {
                retryAfterMs = Math.ceil(parseFloat(retryHeader) * 1000);
            } else {
                const body = await response.clone().json().catch(() => null);
                if (body?.retry_after) {
                    retryAfterMs = Math.ceil(body.retry_after * 1000);
                }
            }
        } catch { /* use default */ }

        // Cap at 5 minutes, minimum 1 second
        retryAfterMs = Math.max(1000, Math.min(retryAfterMs, 300_000));

        // Skip rate limit tracking during tests to prevent timeout delays
        if (!process.env.BUN_TEST) {
            rateLimitedUntil = Date.now() + retryAfterMs;
            log.warn(`Discord 429 rate limited — pausing all API calls for ${retryAfterMs}ms`);
        }
    }

    return response;
}

/** Discord mention pattern: <@123456789> or <@!123456789> */
const MENTION_RE = /<@!?\d{17,20}>/g;

/** Standalone URL pattern — matches http(s) URLs not already inside markdown or angle brackets */
const STANDALONE_URL_RE = /(?<![(<\[])(https?:\/\/[^\s>)\]]+)/g;

/**
 * Extract Discord mentions from embed text so they can be placed in the
 * top-level `content` field.  Mentions inside embeds render as blue text but
 * do NOT ping; placing them in `content` restores native Discord behaviour.
 *
 * NOTE: URLs are handled separately — see {@link extractUrlsFromEmbed} and
 * {@link stripUrlsFromEmbed}.  Discord won't auto-unfurl URLs in `content`
 * when the message also contains rich embeds, so URLs must be sent as a
 * separate follow-up message with no embeds attached.
 */
export function extractContentFromEmbed(embed: DiscordEmbed): string | undefined {
    const desc = embed.description;
    if (!desc) return undefined;
    const mentions = desc.match(MENTION_RE);
    if (!mentions || mentions.length === 0) return undefined;
    return Array.from(new Set(mentions)).join(' ');
}

/**
 * Extract standalone URLs from embed description.
 * Returns deduplicated URLs or undefined if none found.
 */
export function extractUrlsFromEmbed(embed: DiscordEmbed): string[] | undefined {
    const desc = embed.description;
    if (!desc) return undefined;
    const urls = desc.match(STANDALONE_URL_RE);
    if (!urls || urls.length === 0) return undefined;
    return Array.from(new Set(urls));
}

/**
 * Return a shallow copy of the embed with standalone URLs stripped from
 * the description.  The original embed is not mutated.
 */
export function stripUrlsFromEmbed(embed: DiscordEmbed): DiscordEmbed {
    if (!embed.description) return embed;
    const stripped = embed.description
        .replace(STANDALONE_URL_RE, '')
        .replace(/\n{3,}/g, '\n\n')   // collapse triple+ newlines
        .trim();
    return { ...embed, description: stripped || undefined };
}

/** When URL stripping removed all narrative text, explain why a follow-up message may appear. */
const EMBED_LINK_STRIP_FALLBACK =
    'Links are in the next message (Discord only previews URLs when they are not attached to an embed).';

/** Footer-only embeds confuse users; always provide a visible body when nothing else renders. */
const EMBED_EMPTY_BODY_FALLBACK = 'No text to display.';

function hasVisibleEmbedBody(e: DiscordEmbed): boolean {
    if (e.title?.trim()) return true;
    if (e.description?.trim()) return true;
    if (e.fields?.some((f) => f.name?.trim() || f.value?.trim())) return true;
    if (e.image?.url?.trim()) return true;
    if (e.thumbnail?.url?.trim()) return true;
    return false;
}

/**
 * Ensure an embed will show readable body text in Discord, not just a footer.
 * Call after {@link stripUrlsFromEmbed} when sending embeds to channels.
 */
export function ensureDiscordEmbedRenderable(
    embed: DiscordEmbed,
    opts?: { urlStripRemovedAllText?: boolean },
): DiscordEmbed {
    const e: DiscordEmbed = { ...embed };
    if (typeof e.description === 'string') {
        const t = e.description.trim();
        e.description = t.length > 0 ? t : undefined;
    }
    if (hasVisibleEmbedBody(e)) return e;
    if (opts?.urlStripRemovedAllText) {
        return { ...e, description: EMBED_LINK_STRIP_FALLBACK };
    }
    return { ...e, description: EMBED_EMPTY_BODY_FALLBACK };
}

function prepareOutboundEmbed(embed: DiscordEmbed): DiscordEmbed {
    const urlList = extractUrlsFromEmbed(embed);
    const hadDesc = Boolean(embed.description?.trim());
    const stripped = urlList ? stripUrlsFromEmbed(embed) : embed;
    const urlStripRemovedAllText = Boolean(urlList && hadDesc && !stripped.description?.trim());
    return ensureDiscordEmbedRenderable(stripped, { urlStripRemovedAllText });
}

/** @deprecated Use extractContentFromEmbed instead */
export const extractMentionsFromEmbed = extractContentFromEmbed;

/** Discord snowflake IDs are purely numeric strings. */
const DISCORD_SNOWFLAKE_RE = /^\d{17,20}$/;

/** Discord interaction tokens are alphanumeric with dashes, dots, and underscores. */
const DISCORD_TOKEN_RE = /^[\w.\-]{20,500}$/;

export function assertSnowflake(value: string, label: string): void {
    if (!DISCORD_SNOWFLAKE_RE.test(value)) {
        throw new Error(`Invalid Discord ${label}: expected snowflake ID (17-20 digit numeric string)`);
    }
}

export function assertInteractionToken(value: string): void {
    if (!DISCORD_TOKEN_RE.test(value)) {
        throw new Error('Invalid Discord interaction token (expected 20-500 alphanumeric characters with dashes, dots, or underscores)');
    }
}

export interface DiscordEmbedAuthor {
    name: string;
    url?: string;
    icon_url?: string;
}

export interface DiscordEmbed {
    title?: string;
    description?: string;
    color?: number;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
    footer?: { text: string };
    author?: DiscordEmbedAuthor;
    timestamp?: string;
    image?: { url: string };
    thumbnail?: { url: string };
}

/** Metadata for building rich embed footers with session context. */
export interface FooterContext {
    agentName: string;
    agentModel?: string;
    sessionId?: string;
    projectName?: string;
    status?: string;
}

/** Stats that can be appended to the footer on completion embeds. */
export interface FooterStats {
    filesChanged?: number;
    turns?: number;
    tools?: number;
    commits?: number;
}

/**
 * Build a detailed footer string with full session context.
 * Format: `AgentName · model · project · sid:XXXXXX · status`
 * Segments are omitted when their value is not provided.
 */
export function buildFooterText(ctx: FooterContext): string {
    const parts: string[] = [ctx.agentName];
    if (ctx.agentModel) {
        parts.push(ctx.agentModel);
    }
    if (ctx.projectName) {
        parts.push(ctx.projectName);
    }
    if (ctx.sessionId) {
        parts.push(`sid:${ctx.sessionId.slice(0, 8)}`);
    }
    if (ctx.status) {
        parts.push(ctx.status);
    }
    return parts.join(' · ');
}

/**
 * Build a footer with session context AND run stats.
 * Format: `AgentName · model · project · sid:XXXXXX · status | 5 files · 12 turns · 38 tools`
 */
export function buildFooterWithStats(ctx: FooterContext, stats: FooterStats): string {
    const base = buildFooterText(ctx);
    const statParts: string[] = [];
    if (stats.filesChanged && stats.filesChanged > 0) {
        statParts.push(`${stats.filesChanged} files`);
    }
    if (stats.turns && stats.turns > 0) {
        statParts.push(`${stats.turns} turns`);
    }
    if (stats.tools && stats.tools > 0) {
        statParts.push(`${stats.tools} tools`);
    }
    if (stats.commits && stats.commits > 0) {
        statParts.push(`${stats.commits} commits`);
    }
    if (statParts.length === 0) return base;
    return `${base} | ${statParts.join(' · ')}`;
}

export async function respondToInteraction(interaction: DiscordInteractionData, content: string): Promise<void> {
    assertSnowflake(interaction.id, 'interaction ID');
    assertInteractionToken(interaction.token);
    const response = await discordFetch(
        `https://discord.com/api/v10/interactions/${interaction.id}/${interaction.token}/callback`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: InteractionCallbackType.CHANNEL_MESSAGE,
                data: { content: content.slice(0, MAX_MESSAGE_LENGTH) },
            }),
        },
    );

    if (!response.ok) {
        const error = await response.text();
        log.error('Failed to respond to Discord interaction', {
            status: response.status,
            error: error.slice(0, 200),
        });
    }
}

export async function respondToInteractionEmbed(
    interaction: DiscordInteractionData,
    embed: DiscordEmbed,
    ephemeral = false,
): Promise<void> {
    assertSnowflake(interaction.id, 'interaction ID');
    assertInteractionToken(interaction.token);
    const response = await discordFetch(
        `https://discord.com/api/v10/interactions/${interaction.id}/${interaction.token}/callback`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: InteractionCallbackType.CHANNEL_MESSAGE,
                data: {
                    embeds: [embed],
                    ...(ephemeral ? { flags: 64 } : {}),
                },
            }),
        },
    );

    if (!response.ok) {
        const error = await response.text();
        log.error('Failed to respond to Discord interaction with embed', {
            status: response.status,
            error: error.slice(0, 200),
        });
    }
}

export async function respondToInteractionEmbeds(
    interaction: DiscordInteractionData,
    embeds: DiscordEmbed[],
    ephemeral = false,
): Promise<void> {
    assertSnowflake(interaction.id, 'interaction ID');
    assertInteractionToken(interaction.token);
    const response = await discordFetch(
        `https://discord.com/api/v10/interactions/${interaction.id}/${interaction.token}/callback`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: InteractionCallbackType.CHANNEL_MESSAGE,
                data: {
                    embeds,
                    ...(ephemeral ? { flags: 64 } : {}),
                },
            }),
        },
    );

    if (!response.ok) {
        const error = await response.text();
        log.error('Failed to respond to Discord interaction with embeds', {
            status: response.status,
            error: error.slice(0, 200),
        });
    }
}

/**
 * Defer a slash command response — shows "thinking..." in Discord.
 * Follow up later with editDeferredResponse().
 */
export async function deferInteraction(interaction: DiscordInteractionData, ephemeral = false): Promise<void> {
    assertSnowflake(interaction.id, 'interaction ID');
    assertInteractionToken(interaction.token);
    const response = await discordFetch(
        `https://discord.com/api/v10/interactions/${interaction.id}/${interaction.token}/callback`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: InteractionCallbackType.DEFERRED_CHANNEL_MESSAGE,
                data: ephemeral ? { flags: 64 } : {},
            }),
        },
    );

    if (!response.ok) {
        const error = await response.text();
        log.error('Failed to defer interaction', { status: response.status, error: error.slice(0, 200) });
    }
}

/**
 * Edit the deferred "thinking..." response with the final content.
 */
export async function editDeferredResponse(
    interaction: DiscordInteractionData,
    content: string,
    embeds?: DiscordEmbed[],
): Promise<void> {
    assertInteractionToken(interaction.token);
    const appId = process.env.DISCORD_APP_ID;
    if (!appId) {
        log.error('DISCORD_APP_ID not set — cannot edit deferred response');
        return;
    }
    const body: Record<string, unknown> = {};
    if (content) body.content = content.slice(0, MAX_MESSAGE_LENGTH);
    if (embeds) body.embeds = embeds;

    const response = await discordFetch(
        `https://discord.com/api/v10/webhooks/${appId}/${interaction.token}/messages/@original`,
        {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        },
    );

    if (!response.ok) {
        const error = await response.text();
        log.error('Failed to edit deferred response', { status: response.status, error: error.slice(0, 200) });
    }
}

/**
 * Respond to an interaction with an ephemeral (only-visible-to-user) message.
 */
export async function respondEphemeral(interaction: DiscordInteractionData, content: string): Promise<void> {
    assertSnowflake(interaction.id, 'interaction ID');
    assertInteractionToken(interaction.token);
    const response = await discordFetch(
        `https://discord.com/api/v10/interactions/${interaction.id}/${interaction.token}/callback`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: InteractionCallbackType.CHANNEL_MESSAGE,
                data: { content: content.slice(0, MAX_MESSAGE_LENGTH), flags: 64 },
            }),
        },
    );

    if (!response.ok) {
        const error = await response.text();
        log.error('Failed to send ephemeral response', { status: response.status, error: error.slice(0, 200) });
    }
}

export async function acknowledgeButton(interaction: DiscordInteractionData, message: string): Promise<void> {
    assertSnowflake(interaction.id, 'interaction ID');
    assertInteractionToken(interaction.token);
    const response = await discordFetch(
        `https://discord.com/api/v10/interactions/${interaction.id}/${interaction.token}/callback`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: InteractionCallbackType.CHANNEL_MESSAGE,
                data: { content: message, flags: 64 }, // 64 = ephemeral
            }),
        },
    );

    if (!response.ok) {
        const error = await response.text();
        log.error('Failed to acknowledge button', { status: response.status, error: error.slice(0, 200) });
    }
}

/**
 * Send a plain-text message (no embeds) to a Discord channel.
 * Used internally to send URL follow-ups so Discord can auto-unfurl them.
 */
async function sendPlainMessage(
    botToken: string,
    channelId: string,
    content: string,
): Promise<void> {
    try {
        const response = await discordFetch(
            `https://discord.com/api/v10/channels/${channelId}/messages`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bot ${botToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ content }),
            },
        );
        if (!response.ok) {
            const error = await response.text();
            log.error('Failed to send URL follow-up', { status: response.status, error: error.slice(0, 200) });
        }
    } catch (err) {
        log.error('Error sending URL follow-up', { error: String(err) });
    }
}

/**
 * Send a follow-up message with extracted URLs so Discord auto-unfurls them.
 * Discord won't unfurl URLs in `content` when rich embeds are present in the
 * same message, so URLs must be in a separate embed-free message.
 */
async function sendUrlFollowUp(
    botToken: string,
    channelId: string,
    embed: DiscordEmbed,
): Promise<void> {
    const urls = extractUrlsFromEmbed(embed);
    if (!urls) return;
    await sendPlainMessage(botToken, channelId, urls.join('\n'));
}

export async function sendEmbed(
    delivery: DeliveryTracker,
    botToken: string,
    channelId: string,
    embed: DiscordEmbed,
): Promise<string | null> {
    const urls = extractUrlsFromEmbed(embed);
    const cleanEmbed = prepareOutboundEmbed(embed);
    try {
        const { result } = await delivery.sendWithReceipt('discord', async () => {
            const response = await discordFetch(
                `https://discord.com/api/v10/channels/${channelId}/messages`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bot ${botToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        embeds: [cleanEmbed],
                        ...(extractContentFromEmbed(embed) ? { content: extractContentFromEmbed(embed) } : {}),
                    }),
                },
            );

            if (!response.ok) {
                const error = await response.text();
                log.error('Failed to send Discord embed', { status: response.status, error: error.slice(0, 200) });
                throw new Error(`Discord embed failed: ${response.status}`);
            }

            const data = await response.json() as { id: string };
            return data.id;
        });
        // Send URLs as a separate message so Discord unfurls them
        if (urls) await sendUrlFollowUp(botToken, channelId, embed);
        return result;
    } catch {
        // Error already logged by DeliveryTracker
        return null;
    }
}

export async function sendMessageWithEmbed(
    delivery: DeliveryTracker,
    botToken: string,
    channelId: string,
    content: string | undefined,
    embed: DiscordEmbed,
): Promise<void> {
    try {
        await delivery.sendWithReceipt('discord', async () => {
            const body: Record<string, unknown> = { embeds: [embed] };
            if (content) body.content = content;

            const response = await discordFetch(
                `https://discord.com/api/v10/channels/${channelId}/messages`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bot ${botToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(body),
                },
            );

            if (!response.ok) {
                const error = await response.text();
                log.error('Failed to send Discord embed', { status: response.status, error: error.slice(0, 200) });
                throw new Error(`Discord embed failed: ${response.status}`);
            }
        });
    } catch {
        // Error already logged by DeliveryTracker
    }
}

export async function sendEmbedWithButtons(
    delivery: DeliveryTracker,
    botToken: string,
    channelId: string,
    embed: DiscordEmbed,
    components: DiscordActionRow[],
): Promise<void> {
    try {
        await delivery.sendWithReceipt('discord', async () => {
            const response = await discordFetch(
                `https://discord.com/api/v10/channels/${channelId}/messages`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bot ${botToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ embeds: [embed], components }),
                },
            );

            if (!response.ok) {
                const error = await response.text();
                log.error('Failed to send Discord embed with buttons', { status: response.status, error: error.slice(0, 200) });
                throw new Error(`Discord embed+buttons failed: ${response.status}`);
            }
        });
    } catch {
        // Error already logged by DeliveryTracker
    }
}

export async function sendReplyEmbed(
    delivery: DeliveryTracker,
    botToken: string,
    channelId: string,
    replyToMessageId: string,
    embed: DiscordEmbed,
): Promise<string | null> {
    assertSnowflake(channelId, 'channel ID');
    assertSnowflake(replyToMessageId, 'message ID');
    const urls = extractUrlsFromEmbed(embed);
    const cleanEmbed = prepareOutboundEmbed(embed);
    try {
        const { result } = await delivery.sendWithReceipt('discord', async () => {
            const response = await discordFetch(
                `https://discord.com/api/v10/channels/${encodeURIComponent(channelId)}/messages`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bot ${botToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        embeds: [cleanEmbed],
                        message_reference: { message_id: replyToMessageId },
                        ...(extractContentFromEmbed(embed) ? { content: extractContentFromEmbed(embed) } : {}),
                    }),
                },
            );

            if (!response.ok) {
                const error = await response.text();
                log.error('Failed to send Discord reply embed', { status: response.status, error: error.slice(0, 200) });
                throw new Error(`Discord reply embed failed: ${response.status}`);
            }

            const data = await response.json() as { id: string };
            return data.id;
        });
        // Send URLs as a separate message so Discord unfurls them
        if (urls) await sendUrlFollowUp(botToken, channelId, embed);
        return result;
    } catch {
        // Error already logged by DeliveryTracker
        return null;
    }
}

export function buildActionRow(...buttons: Array<{ label: string; customId: string; style?: number; emoji?: string }>): DiscordActionRow {
    return {
        type: ComponentType.ACTION_ROW,
        components: buttons.map(b => ({
            type: ComponentType.BUTTON,
            style: b.style ?? ButtonStyle.SECONDARY,
            label: b.label,
            custom_id: b.customId,
            ...(b.emoji ? { emoji: { name: b.emoji } } : {}),
        })),
    };
}

export async function sendDiscordMessage(
    delivery: DeliveryTracker,
    botToken: string,
    channelId: string,
    content: string,
): Promise<void> {
    // Smart-split at natural boundaries (paragraphs, sentences, code blocks)
    const chunks = splitMessage(content, MAX_MESSAGE_LENGTH);

    for (const chunk of chunks) {
        try {
            await delivery.sendWithReceipt('discord', async () => {
                const response = await discordFetch(
                    `https://discord.com/api/v10/channels/${channelId}/messages`,
                    {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bot ${botToken}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ content: chunk }),
                    },
                );

                if (!response.ok) {
                    const error = await response.text();
                    log.error('Failed to send Discord message', { status: response.status, error: error.slice(0, 200) });
                    throw new Error(`Discord sendMessage failed: ${response.status}`);
                }
            });
        } catch {
            // Error already logged by DeliveryTracker
        }
    }
}

export async function sendTypingIndicator(botToken: string, channelId: string): Promise<void> {
    try {
        const response = await discordFetch(
            `https://discord.com/api/v10/channels/${channelId}/typing`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bot ${botToken}`,
                },
            },
        );
        if (!response.ok) {
            log.debug('Failed to send typing indicator', { status: response.status });
        }
    } catch {
        // Best-effort — don't fail on typing indicator errors
    }
}

export async function addReaction(botToken: string, channelId: string, messageId: string, emoji: string): Promise<void> {
    try {
        assertSnowflake(channelId, 'channel ID');
        assertSnowflake(messageId, 'message ID');
        const response = await discordFetch(
            `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}/reactions/${emoji}/@me`,
            {
                method: 'PUT',
                headers: {
                    'Authorization': `Bot ${botToken}`,
                },
            },
        );
        if (!response.ok) {
            log.debug('Failed to add reaction', { status: response.status, emoji });
        }
    } catch {
        // Best-effort — don't fail on reaction errors
    }
}

export async function removeReaction(botToken: string, channelId: string, messageId: string, emoji: string): Promise<void> {
    try {
        assertSnowflake(channelId, 'channel ID');
        assertSnowflake(messageId, 'message ID');
        const response = await discordFetch(
            `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}/reactions/${emoji}/@me`,
            {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bot ${botToken}`,
                },
            },
        );
        if (!response.ok) {
            log.debug('Failed to remove reaction', { status: response.status, emoji });
        }
    } catch {
        // Best-effort
    }
}

/**
 * Convert a hex color string (e.g. '#ff00aa' or 'ff00aa') to a Discord
 * embed color integer.  Returns `null` for invalid input so callers can
 * fall back to the hash-based color.
 */
export function hexColorToInt(hex: string | null | undefined): number | null {
    if (!hex) return null;
    const cleaned = hex.replace(/^#/, '');
    if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return null;
    return parseInt(cleaned, 16);
}

/** Generate a consistent color for an agent name. */
export function agentColor(name: string): number {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
    }
    // Map to a pleasant color range (avoid very dark/light)
    const hue = Math.abs(hash) % 360;
    // HSL to RGB approximation for Discord embed colors
    const s = 0.6, l = 0.5;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (hue < 60) { r = c; g = x; }
    else if (hue < 120) { r = x; g = c; }
    else if (hue < 180) { g = c; b = x; }
    else if (hue < 240) { g = x; b = c; }
    else if (hue < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return (Math.round((r + m) * 255) << 16)
         | (Math.round((g + m) * 255) << 8)
         | Math.round((b + m) * 255);
}

/** Agent identity info for building personalized embed authors. */
export interface AgentIdentity {
    agentName: string;
    displayIcon?: string | null;
    avatarUrl?: string | null;
}

/**
 * Build a Discord embed `author` block from agent identity.
 * Shows the agent's avatar as a small icon next to their name.
 * If displayIcon (emoji) is set, it's prepended to the name.
 */
export function buildAgentAuthor(identity: AgentIdentity): DiscordEmbedAuthor {
    const name = identity.displayIcon
        ? `${identity.displayIcon} ${identity.agentName}`
        : identity.agentName;
    return {
        name,
        ...(identity.avatarUrl ? { icon_url: identity.avatarUrl } : {}),
    };
}

export async function editEmbed(
    delivery: DeliveryTracker,
    botToken: string,
    channelId: string,
    messageId: string,
    embed: DiscordEmbed,
): Promise<void> {
    assertSnowflake(channelId, 'channel ID');
    assertSnowflake(messageId, 'message ID');
    const urls = extractUrlsFromEmbed(embed);
    const cleanEmbed = prepareOutboundEmbed(embed);
    try {
        await delivery.sendWithReceipt('discord', async () => {
            const response = await discordFetch(
                `https://discord.com/api/v10/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`,
                {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bot ${botToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        embeds: [cleanEmbed],
                        ...(extractContentFromEmbed(embed) ? { content: extractContentFromEmbed(embed) } : {}),
                    }),
                },
            );

            if (!response.ok) {
                const error = await response.text();
                log.error('Failed to edit Discord embed', { status: response.status, error: error.slice(0, 200) });
                throw new Error(`Discord embed edit failed: ${response.status}`);
            }
        });
        // Send URLs as a separate follow-up message so Discord unfurls them
        if (urls) await sendUrlFollowUp(botToken, channelId, embed);
    } catch {
        // Error already logged by DeliveryTracker
    }
}

// ── File attachment support ──────────────────────────────────────────

/** A file to attach to an outbound Discord message. */
export interface DiscordFileAttachment {
    /** Filename shown in Discord (e.g. "chart.png"). */
    name: string;
    /** Raw file contents. */
    data: Uint8Array | Buffer;
    /** MIME type (defaults to "application/octet-stream"). */
    contentType?: string;
}

/** Discord bot file size limit (25 MB). */
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

/**
 * Build a multipart/form-data body for Discord messages with file attachments.
 * The `payload_json` part carries the normal message JSON; file parts use `files[n]`.
 */
function buildMultipartBody(
    payload: Record<string, unknown>,
    files: DiscordFileAttachment[],
): FormData {
    const form = new FormData();
    form.append('payload_json', JSON.stringify(payload));
    for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const blob = new Blob([new Uint8Array(f.data) as unknown as ArrayBuffer], { type: f.contentType ?? 'application/octet-stream' });
        form.append(`files[${i}]`, blob, f.name);
    }
    return form;
}

/**
 * Send an embed with file attachments.
 * Files can be referenced in the embed via `attachment://filename.png` in image/thumbnail URLs.
 */
export async function sendEmbedWithFiles(
    delivery: DeliveryTracker,
    botToken: string,
    channelId: string,
    embed: DiscordEmbed,
    files: DiscordFileAttachment[],
): Promise<string | null> {
    for (const f of files) {
        if (f.data.byteLength > MAX_FILE_SIZE_BYTES) {
            log.error('File too large for Discord upload', { name: f.name, size: f.data.byteLength });
            return null;
        }
    }

    const urls = extractUrlsFromEmbed(embed);
    const cleanEmbed = prepareOutboundEmbed(embed);

    try {
        const { result } = await delivery.sendWithReceipt('discord', async () => {
            const payload: Record<string, unknown> = {
                embeds: [cleanEmbed],
                attachments: files.map((f, i) => ({ id: i, filename: f.name })),
            };
            const extracted = extractContentFromEmbed(embed);
            if (extracted) payload.content = extracted;

            const form = buildMultipartBody(payload, files);
            const response = await discordFetch(
                `https://discord.com/api/v10/channels/${channelId}/messages`,
                {
                    method: 'POST',
                    headers: { 'Authorization': `Bot ${botToken}` },
                    body: form,
                },
            );

            if (!response.ok) {
                const error = await response.text();
                log.error('Failed to send Discord embed with files', { status: response.status, error: error.slice(0, 200) });
                throw new Error(`Discord embed+files failed: ${response.status}`);
            }

            const data = await response.json() as { id: string };
            return data.id;
        });
        // Send URLs as a separate message so Discord unfurls them
        if (urls) await sendUrlFollowUp(botToken, channelId, embed);
        return result;
    } catch {
        return null;
    }
}

/**
 * Send a plain-text message with file attachments.
 */
export async function sendMessageWithFiles(
    delivery: DeliveryTracker,
    botToken: string,
    channelId: string,
    content: string,
    files: DiscordFileAttachment[],
): Promise<string | null> {
    for (const f of files) {
        if (f.data.byteLength > MAX_FILE_SIZE_BYTES) {
            log.error('File too large for Discord upload', { name: f.name, size: f.data.byteLength });
            return null;
        }
    }

    try {
        const { result } = await delivery.sendWithReceipt('discord', async () => {
            const payload: Record<string, unknown> = {
                content: content.slice(0, MAX_MESSAGE_LENGTH),
                attachments: files.map((f, i) => ({ id: i, filename: f.name })),
            };

            const form = buildMultipartBody(payload, files);
            const response = await discordFetch(
                `https://discord.com/api/v10/channels/${channelId}/messages`,
                {
                    method: 'POST',
                    headers: { 'Authorization': `Bot ${botToken}` },
                    body: form,
                },
            );

            if (!response.ok) {
                const error = await response.text();
                log.error('Failed to send Discord message with files', { status: response.status, error: error.slice(0, 200) });
                throw new Error(`Discord message+files failed: ${response.status}`);
            }

            const data = await response.json() as { id: string };
            return data.id;
        });
        return result;
    } catch {
        return null;
    }
}

/** Re-export splitEmbedDescription and collapseCodeBlocks for use by other modules. */
export { splitEmbedDescription, collapseCodeBlocks } from './message-formatter';
