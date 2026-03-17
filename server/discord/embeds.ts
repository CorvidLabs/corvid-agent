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

export interface DiscordEmbed {
    title?: string;
    description?: string;
    color?: number;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
    footer?: { text: string };
    timestamp?: string;
}

/** Metadata for building rich embed footers with session context. */
export interface FooterContext {
    agentName: string;
    agentModel: string;
    sessionId?: string;
    projectName?: string;
    status?: string;
}

/**
 * Build a standardized footer string with session metadata.
 * Format: `agentName · model | project | sid:abc12345 · status`
 * Shorter segments are omitted when not available.
 */
export function buildFooterText(ctx: FooterContext): string {
    const parts: string[] = [`${ctx.agentName} · ${ctx.agentModel}`];
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

export async function respondToInteraction(interaction: DiscordInteractionData, content: string): Promise<void> {
    assertSnowflake(interaction.id, 'interaction ID');
    assertInteractionToken(interaction.token);
    const response = await fetch(
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
    const response = await fetch(
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

export async function acknowledgeButton(interaction: DiscordInteractionData, message: string): Promise<void> {
    assertSnowflake(interaction.id, 'interaction ID');
    assertInteractionToken(interaction.token);
    const response = await fetch(
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

export async function sendEmbed(
    delivery: DeliveryTracker,
    botToken: string,
    channelId: string,
    embed: DiscordEmbed,
): Promise<string | null> {
    try {
        const { result } = await delivery.sendWithReceipt('discord', async () => {
            const response = await fetch(
                `https://discord.com/api/v10/channels/${channelId}/messages`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bot ${botToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ embeds: [embed] }),
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

            const response = await fetch(
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
            const response = await fetch(
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
    try {
        const { result } = await delivery.sendWithReceipt('discord', async () => {
            const response = await fetch(
                `https://discord.com/api/v10/channels/${encodeURIComponent(channelId)}/messages`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bot ${botToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        embeds: [embed],
                        message_reference: { message_id: replyToMessageId },
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
                const response = await fetch(
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
        const response = await fetch(
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
        const response = await fetch(
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
        const response = await fetch(
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

/** Re-export splitEmbedDescription for use by other modules. */
export { splitEmbedDescription } from './message-formatter';
