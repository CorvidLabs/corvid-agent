/**
 * Discord image attachment extraction and conversion to Claude multimodal content blocks.
 *
 * Extracts image attachments from Discord messages and converts them to
 * ContentBlockParam arrays compatible with the Anthropic Messages API.
 */

import type { DiscordAttachment } from './types';
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages/messages';
import { createLogger } from '../lib/logger';

const log = createLogger('DiscordImageAttachments');

/** Supported image MIME types for Claude multimodal input. */
const SUPPORTED_IMAGE_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
]);

/** Maximum file size for image attachments (20 MB). */
const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024;

/** Maximum number of image attachments per message. */
const MAX_IMAGES_PER_MESSAGE = 5;

/**
 * Check whether an attachment is a supported image.
 * Uses content_type when available, falls back to file extension.
 */
export function isImageAttachment(attachment: DiscordAttachment): boolean {
    if (attachment.content_type) {
        return SUPPORTED_IMAGE_TYPES.has(attachment.content_type);
    }
    // Fallback: check file extension
    const ext = attachment.filename.split('.').pop()?.toLowerCase();
    return ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'gif' || ext === 'webp';
}

/**
 * Infer the media type for an image attachment.
 * Returns the content_type if set and supported, otherwise infers from filename.
 */
function inferMediaType(attachment: DiscordAttachment): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' {
    if (attachment.content_type && SUPPORTED_IMAGE_TYPES.has(attachment.content_type)) {
        return attachment.content_type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
    }
    const ext = attachment.filename.split('.').pop()?.toLowerCase();
    switch (ext) {
        case 'jpg':
        case 'jpeg':
            return 'image/jpeg';
        case 'png':
            return 'image/png';
        case 'gif':
            return 'image/gif';
        case 'webp':
            return 'image/webp';
        default:
            return 'image/png'; // safe default
    }
}

/** Result of extracting images from a Discord message's attachments. */
export interface ExtractedImages {
    /** Image content blocks ready for the Claude API. */
    blocks: ContentBlockParam[];
    /** Number of images that were skipped (too large, unsupported type, over limit). */
    skipped: number;
}

/**
 * Extract image attachments from a Discord message and convert them to
 * Claude API content blocks using URL image sources.
 *
 * Applies size limits and format validation. Skips attachments that are
 * too large or have unsupported formats.
 */
export function extractImageBlocks(attachments: DiscordAttachment[] | undefined): ExtractedImages {
    if (!attachments || attachments.length === 0) {
        return { blocks: [], skipped: 0 };
    }

    const blocks: ContentBlockParam[] = [];
    let skipped = 0;

    for (const attachment of attachments) {
        // Skip non-image attachments
        if (!isImageAttachment(attachment)) continue;

        // Enforce per-message image limit
        if (blocks.length >= MAX_IMAGES_PER_MESSAGE) {
            skipped++;
            log.info('Skipping image attachment: per-message limit reached', {
                filename: attachment.filename,
                limit: MAX_IMAGES_PER_MESSAGE,
            });
            continue;
        }

        // Enforce size limit
        if (attachment.size > MAX_IMAGE_SIZE_BYTES) {
            skipped++;
            log.info('Skipping image attachment: too large', {
                filename: attachment.filename,
                size: attachment.size,
                maxSize: MAX_IMAGE_SIZE_BYTES,
            });
            continue;
        }

        // Use proxy_url (longer-lived) with fallback to url
        const imageUrl = attachment.proxy_url || attachment.url;

        blocks.push({
            type: 'image',
            source: {
                type: 'url',
                url: imageUrl,
            },
        } as ContentBlockParam);

        log.debug('Extracted image attachment', {
            filename: attachment.filename,
            contentType: inferMediaType(attachment),
            size: attachment.size,
            width: attachment.width,
            height: attachment.height,
        });
    }

    return { blocks, skipped };
}

/**
 * Build a multimodal content array from text and image attachments.
 * Returns a string if there are no images (preserving existing behavior),
 * or an array of ContentBlockParam if images are present.
 */
export function buildMultimodalContent(
    text: string,
    attachments: DiscordAttachment[] | undefined,
): string | ContentBlockParam[] {
    const { blocks: imageBlocks, skipped } = extractImageBlocks(attachments);

    if (imageBlocks.length === 0) {
        // No images — return plain string for backward compatibility
        if (skipped > 0) {
            return `${text}\n\n[${skipped} image attachment(s) skipped — unsupported format or too large]`;
        }
        return text;
    }

    const contentBlocks: ContentBlockParam[] = [];

    // Text first, then images
    if (text) {
        contentBlocks.push({ type: 'text', text } as ContentBlockParam);
    }

    contentBlocks.push(...imageBlocks);

    if (skipped > 0) {
        contentBlocks.push({
            type: 'text',
            text: `[${skipped} additional image attachment(s) skipped — unsupported format or too large]`,
        } as ContentBlockParam);
    }

    return contentBlocks;
}
