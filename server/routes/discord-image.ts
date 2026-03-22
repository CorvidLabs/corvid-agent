/**
 * Discord image sending route.
 *
 *   POST /api/discord/send-image — Send an image to a Discord channel.
 *
 * Accepts JSON body with:
 *   - channelId: Discord channel ID
 *   - imageBase64: Base64-encoded image data
 *   - filename?: Filename for the attachment (default: "image.png")
 *   - contentType?: MIME type (default: "image/png")
 *   - message?: Optional text message to include
 *   - replyToMessageId?: Message ID to reply to
 *
 * Or multipart/form-data with:
 *   - channelId (form field)
 *   - image (file)
 *   - message (optional form field)
 *   - replyToMessageId (optional form field)
 */

import { resolve, sep } from 'node:path';
import { json, handleRouteError } from '../lib/response';
import { getDeliveryTracker } from '../lib/delivery-tracker';
import { sendMessageWithFiles, sendEmbedWithFiles, type DiscordFileAttachment } from '../discord/embeds';
import { createLogger } from '../lib/logger';
import type { RequestContext } from '../middleware/guards';

/** Allowed roots for imagePath — restrict filesystem reads to safe directories. */
const ALLOWED_IMAGE_ROOTS = [
    resolve(process.cwd()),  // project directory
    '/tmp',
];

const log = createLogger('DiscordImageRoute');

export function handleDiscordImageRoutes(
    req: Request,
    url: URL,
    _context: RequestContext,
): Response | Promise<Response> | null {
    if (url.pathname !== '/api/discord/send-image') return null;
    if (req.method !== 'POST') return null;

    return handleSendImage(req);
}

async function handleSendImage(req: Request): Promise<Response> {
    const botToken = process.env.DISCORD_BOT_TOKEN;
    if (!botToken) {
        return json({ error: 'Discord bot token not configured' }, 503);
    }

    try {
        let channelId: string;
        let imageData: Uint8Array;
        let filename: string;
        let contentType: string;
        let message: string | undefined;
        let replyToMessageId: string | undefined;

        const ct = req.headers.get('content-type') ?? '';

        if (ct.includes('multipart/form-data')) {
            const form = await req.formData();
            channelId = form.get('channelId') as string;
            message = (form.get('message') as string) || undefined;
            replyToMessageId = (form.get('replyToMessageId') as string) || undefined;

            const file = form.get('image') as File | null;
            if (!file) {
                return json({ error: 'Missing "image" file in form data' }, 400);
            }
            imageData = new Uint8Array(await file.arrayBuffer());
            filename = file.name || 'image.png';
            contentType = file.type || 'image/png';
        } else {
            const body = await req.json() as {
                channelId?: string;
                imageBase64?: string;
                imagePath?: string;
                filename?: string;
                contentType?: string;
                message?: string;
                replyToMessageId?: string;
            };

            if (!body.channelId) {
                return json({ error: 'Missing required field: channelId' }, 400);
            }
            channelId = body.channelId;
            message = body.message;
            replyToMessageId = body.replyToMessageId;
            filename = body.filename ?? 'image.png';
            contentType = body.contentType ?? 'image/png';

            if (body.imageBase64) {
                imageData = Buffer.from(body.imageBase64, 'base64');
            } else if (body.imagePath) {
                // Resolve and validate path to prevent path traversal (CWE-22)
                const resolvedPath = resolve(body.imagePath);
                const isAllowed = ALLOWED_IMAGE_ROOTS.some(root => {
                    const normalizedRoot = resolve(root);
                    if (resolvedPath === normalizedRoot) return true;
                    const rootWithSep = normalizedRoot.endsWith(sep) ? normalizedRoot : normalizedRoot + sep;
                    return resolvedPath.startsWith(rootWithSep);
                });
                if (!isAllowed) {
                    log.warn('Blocked path traversal attempt', { imagePath: body.imagePath });
                    return json({ error: 'imagePath is outside allowed directories' }, 403);
                }

                const file = Bun.file(resolvedPath);
                if (!await file.exists()) {
                    return json({ error: 'File not found' }, 400);
                }
                imageData = new Uint8Array(await file.arrayBuffer());
                // Infer content type from extension if not specified
                if (!body.contentType) {
                    const ext = body.imagePath.split('.').pop()?.toLowerCase();
                    if (ext === 'jpg' || ext === 'jpeg') contentType = 'image/jpeg';
                    else if (ext === 'gif') contentType = 'image/gif';
                    else if (ext === 'webp') contentType = 'image/webp';
                }
            } else {
                return json({ error: 'Must provide either imageBase64 or imagePath' }, 400);
            }
        }

        if (!channelId) {
            return json({ error: 'Missing required field: channelId' }, 400);
        }

        const delivery = getDeliveryTracker();
        const attachment: DiscordFileAttachment = {
            name: filename,
            data: imageData,
            contentType,
        };

        let messageId: string | null;

        if (replyToMessageId) {
            // Send as embed with image + reply reference
            messageId = await sendEmbedWithFiles(delivery, botToken, channelId, {
                description: message || undefined,
                image: { url: `attachment://${filename}` },
            }, [attachment]);
        } else if (message) {
            messageId = await sendMessageWithFiles(delivery, botToken, channelId, message, [attachment]);
        } else {
            // Just the image, no text
            messageId = await sendMessageWithFiles(delivery, botToken, channelId, '', [attachment]);
        }

        if (!messageId) {
            return json({ error: 'Failed to send image to Discord' }, 502);
        }

        log.info('Sent image to Discord', { channelId, filename, messageId });
        return json({ success: true, messageId });
    } catch (err) {
        return handleRouteError(err);
    }
}
