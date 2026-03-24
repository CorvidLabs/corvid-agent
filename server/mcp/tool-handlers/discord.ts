import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpToolContext } from './types';
import { textResult, errorResult } from './types';
import { sendDiscordMessage, sendMessageWithFiles, type DiscordFileAttachment } from '../../discord/embeds';
import { getDeliveryTracker } from '../../lib/delivery-tracker';
import { createLogger } from '../../lib/logger';

const log = createLogger('McpToolHandlers');

export async function handleDiscordSendMessage(
    _ctx: McpToolContext,
    args: { channel_id: string; message: string; reply_to?: string },
): Promise<CallToolResult> {
    if (!args.channel_id?.trim()) {
        return errorResult('channel_id is required.');
    }
    if (!args.message?.trim()) {
        return errorResult('message is required.');
    }

    const botToken = process.env.DISCORD_BOT_TOKEN;
    if (!botToken) {
        return errorResult('Discord bot token is not configured. Set DISCORD_BOT_TOKEN environment variable.');
    }

    try {
        const delivery = getDeliveryTracker();
        await sendDiscordMessage(delivery, botToken, args.channel_id, args.message);

        log.info('Sent Discord message via MCP tool', {
            channelId: args.channel_id,
            messagePreview: args.message.slice(0, 100),
        });

        return textResult(`Message sent to Discord channel ${args.channel_id}.`);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('Failed to send Discord message', { error: message });
        return errorResult(`Failed to send Discord message: ${message}`);
    }
}

export async function handleDiscordSendImage(
    _ctx: McpToolContext,
    args: { channel_id: string; image_base64: string; filename?: string; content_type?: string; message?: string },
): Promise<CallToolResult> {
    if (!args.channel_id?.trim()) {
        return errorResult('channel_id is required.');
    }
    if (!args.image_base64?.trim()) {
        return errorResult('image_base64 is required.');
    }

    const botToken = process.env.DISCORD_BOT_TOKEN;
    if (!botToken) {
        return errorResult('Discord bot token is not configured. Set DISCORD_BOT_TOKEN environment variable.');
    }

    try {
        const imageData = Buffer.from(args.image_base64, 'base64');
        const filename = args.filename ?? 'image.png';
        const contentType = args.content_type ?? 'image/png';

        const attachment: DiscordFileAttachment = {
            name: filename,
            data: imageData,
            contentType,
        };

        const delivery = getDeliveryTracker();
        const messageId = await sendMessageWithFiles(
            delivery,
            botToken,
            args.channel_id,
            args.message ?? '',
            [attachment],
        );

        if (!messageId) {
            return errorResult('Discord API returned no message ID — the upload may have failed.');
        }

        log.info('Sent Discord image via MCP tool', {
            channelId: args.channel_id,
            filename,
            messageId,
        });

        return textResult(`Image "${filename}" sent to Discord channel ${args.channel_id} (message ID: ${messageId}).`);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('Failed to send Discord image', { error: message });
        return errorResult(`Failed to send Discord image: ${message}`);
    }
}
