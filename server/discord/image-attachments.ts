/**
 * Discord image attachment extraction and conversion to Claude multimodal content blocks.
 *
 * Extracts image attachments from Discord messages and converts them to
 * ContentBlockParam arrays compatible with the Anthropic Messages API.
 */

import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages/messages';
import { createLogger } from '../lib/logger';
import type { DiscordAttachment } from './types';

const log = createLogger('DiscordImageAttachments');

/** Supported image MIME types for Claude multimodal input. */
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

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
 * Claude API content blocks using base64-encoded image data.
 *
 * Downloads images at receive time so that expired Discord CDN URLs
 * don't cause failures when Claude processes the message later.
 *
 * Applies size limits and format validation. Skips attachments that are
 * too large, unsupported, or fail to download.
 */
export async function extractImageBlocks(attachments: DiscordAttachment[] | undefined): Promise<ExtractedImages> {
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

    // Download the image now — Discord CDN URLs expire, so we can't
    // rely on Claude being able to fetch them later.
    const imageUrl = attachment.proxy_url || attachment.url;
    const mediaType = inferMediaType(attachment);

    try {
      const resp = await fetch(imageUrl);
      if (!resp.ok) {
        skipped++;
        log.warn('Failed to download image attachment', {
          filename: attachment.filename,
          url: imageUrl,
          status: resp.status,
        });
        continue;
      }

      const arrayBuffer = await resp.arrayBuffer();
      const base64Data = Buffer.from(arrayBuffer).toString('base64');

      blocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType,
          data: base64Data,
        },
      } as ContentBlockParam);

      log.debug('Downloaded and encoded image attachment', {
        filename: attachment.filename,
        contentType: mediaType,
        size: attachment.size,
        base64Length: base64Data.length,
        width: attachment.width,
        height: attachment.height,
      });
    } catch (err) {
      skipped++;
      log.warn('Error downloading image attachment', {
        filename: attachment.filename,
        url: imageUrl,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { blocks, skipped };
}

/**
 * Extract URLs from attachments and append them to the text as a fallback.
 * Ensures the agent always sees attachment links even if multimodal content
 * blocks are not supported by the runtime or the session resumes text-only.
 */
export function appendAttachmentUrls(text: string, attachments: DiscordAttachment[] | undefined): string {
  if (!attachments || attachments.length === 0) return text;

  const urls: string[] = [];
  for (const attachment of attachments) {
    const url = attachment.proxy_url || attachment.url;
    if (url) {
      urls.push(url);
    }
  }

  if (urls.length === 0) return text;

  const urlSection = urls.map((u) => `[attachment: ${u}]`).join('\n');
  return text ? `${text}\n\n${urlSection}` : urlSection;
}

/**
 * Build a multimodal content array from text and image attachments.
 * Returns a string if there are no images (preserving existing behavior),
 * or an array of ContentBlockParam if images are present.
 *
 * Attachment URLs are always included in the text portion as a fallback,
 * ensuring the agent can see them even if image content blocks are not
 * rendered by the runtime.
 */
export async function buildMultimodalContent(
  text: string,
  attachments: DiscordAttachment[] | undefined,
): Promise<string | ContentBlockParam[]> {
  const { blocks: imageBlocks, skipped } = await extractImageBlocks(attachments);

  // Always include attachment URLs in the text as a fallback
  const textWithUrls = appendAttachmentUrls(text, attachments);

  if (imageBlocks.length === 0) {
    // No images — return plain string for backward compatibility
    if (skipped > 0) {
      return `${textWithUrls}\n\n[${skipped} image attachment(s) skipped — unsupported format or too large]`;
    }
    return textWithUrls;
  }

  const contentBlocks: ContentBlockParam[] = [];

  // Text (with URLs) first, then images
  if (textWithUrls) {
    contentBlocks.push({ type: 'text', text: textWithUrls } as ContentBlockParam);
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
