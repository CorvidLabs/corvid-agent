import { test, expect, describe } from 'bun:test';
import { isImageAttachment, extractImageBlocks, buildMultimodalContent } from '../discord/image-attachments';
import type { DiscordAttachment } from '../discord/types';

function makeAttachment(overrides: Partial<DiscordAttachment> = {}): DiscordAttachment {
    return {
        id: '123456',
        filename: 'test.png',
        content_type: 'image/png',
        size: 1024,
        url: 'https://cdn.discordapp.com/attachments/ch/msg/test.png',
        proxy_url: 'https://media.discordapp.net/attachments/ch/msg/test.png',
        width: 800,
        height: 600,
        ...overrides,
    };
}

describe('isImageAttachment', () => {
    test('accepts supported image content types', () => {
        expect(isImageAttachment(makeAttachment({ content_type: 'image/png' }))).toBe(true);
        expect(isImageAttachment(makeAttachment({ content_type: 'image/jpeg' }))).toBe(true);
        expect(isImageAttachment(makeAttachment({ content_type: 'image/gif' }))).toBe(true);
        expect(isImageAttachment(makeAttachment({ content_type: 'image/webp' }))).toBe(true);
    });

    test('rejects unsupported content types', () => {
        expect(isImageAttachment(makeAttachment({ content_type: 'image/svg+xml' }))).toBe(false);
        expect(isImageAttachment(makeAttachment({ content_type: 'application/pdf' }))).toBe(false);
        expect(isImageAttachment(makeAttachment({ content_type: 'text/plain' }))).toBe(false);
        expect(isImageAttachment(makeAttachment({ content_type: 'video/mp4' }))).toBe(false);
    });

    test('falls back to file extension when content_type is missing', () => {
        expect(isImageAttachment(makeAttachment({ content_type: undefined, filename: 'photo.jpg' }))).toBe(true);
        expect(isImageAttachment(makeAttachment({ content_type: undefined, filename: 'photo.jpeg' }))).toBe(true);
        expect(isImageAttachment(makeAttachment({ content_type: undefined, filename: 'photo.png' }))).toBe(true);
        expect(isImageAttachment(makeAttachment({ content_type: undefined, filename: 'photo.gif' }))).toBe(true);
        expect(isImageAttachment(makeAttachment({ content_type: undefined, filename: 'photo.webp' }))).toBe(true);
        expect(isImageAttachment(makeAttachment({ content_type: undefined, filename: 'doc.pdf' }))).toBe(false);
        expect(isImageAttachment(makeAttachment({ content_type: undefined, filename: 'archive.zip' }))).toBe(false);
    });
});

describe('extractImageBlocks', () => {
    test('returns empty for undefined attachments', () => {
        const result = extractImageBlocks(undefined);
        expect(result.blocks).toHaveLength(0);
        expect(result.skipped).toBe(0);
    });

    test('returns empty for empty attachments array', () => {
        const result = extractImageBlocks([]);
        expect(result.blocks).toHaveLength(0);
        expect(result.skipped).toBe(0);
    });

    test('extracts single image attachment', () => {
        const result = extractImageBlocks([makeAttachment()]);
        expect(result.blocks).toHaveLength(1);
        expect(result.skipped).toBe(0);
        expect(result.blocks[0]).toEqual({
            type: 'image',
            source: {
                type: 'url',
                url: 'https://media.discordapp.net/attachments/ch/msg/test.png',
            },
        });
    });

    test('prefers proxy_url over url', () => {
        const result = extractImageBlocks([makeAttachment({
            url: 'https://cdn.discordapp.com/original.png',
            proxy_url: 'https://media.discordapp.net/proxied.png',
        })]);
        expect(result.blocks).toHaveLength(1);
        const source = (result.blocks[0] as { source: { url: string } }).source;
        expect(source.url).toBe('https://media.discordapp.net/proxied.png');
    });

    test('falls back to url when proxy_url is empty', () => {
        const result = extractImageBlocks([makeAttachment({
            url: 'https://cdn.discordapp.com/original.png',
            proxy_url: '',
        })]);
        expect(result.blocks).toHaveLength(1);
        const source = (result.blocks[0] as { source: { url: string } }).source;
        expect(source.url).toBe('https://cdn.discordapp.com/original.png');
    });

    test('extracts multiple image attachments', () => {
        const attachments = [
            makeAttachment({ id: '1', filename: 'a.png' }),
            makeAttachment({ id: '2', filename: 'b.jpg', content_type: 'image/jpeg' }),
            makeAttachment({ id: '3', filename: 'c.gif', content_type: 'image/gif' }),
        ];
        const result = extractImageBlocks(attachments);
        expect(result.blocks).toHaveLength(3);
        expect(result.skipped).toBe(0);
    });

    test('skips non-image attachments', () => {
        const attachments = [
            makeAttachment({ filename: 'image.png', content_type: 'image/png' }),
            makeAttachment({ filename: 'doc.pdf', content_type: 'application/pdf' }),
            makeAttachment({ filename: 'video.mp4', content_type: 'video/mp4' }),
        ];
        const result = extractImageBlocks(attachments);
        expect(result.blocks).toHaveLength(1);
        expect(result.skipped).toBe(0); // non-images are silently ignored, not "skipped"
    });

    test('skips images that exceed size limit (20 MB)', () => {
        const attachments = [
            makeAttachment({ size: 1024 }), // OK
            makeAttachment({ id: '2', size: 21 * 1024 * 1024 }), // Too large
        ];
        const result = extractImageBlocks(attachments);
        expect(result.blocks).toHaveLength(1);
        expect(result.skipped).toBe(1);
    });

    test('enforces max 5 images per message', () => {
        const attachments = Array.from({ length: 7 }, (_, i) =>
            makeAttachment({ id: String(i), filename: `img${i}.png` }),
        );
        const result = extractImageBlocks(attachments);
        expect(result.blocks).toHaveLength(5);
        expect(result.skipped).toBe(2);
    });

    test('extracts images with extension-only detection (no content_type)', () => {
        const attachments = [
            makeAttachment({ id: '1', content_type: undefined, filename: 'photo.jpg' }),
            makeAttachment({ id: '2', content_type: undefined, filename: 'screenshot.jpeg' }),
            makeAttachment({ id: '3', content_type: undefined, filename: 'icon.gif' }),
            makeAttachment({ id: '4', content_type: undefined, filename: 'banner.webp' }),
            makeAttachment({ id: '5', content_type: undefined, filename: 'noext' }),
        ];
        const result = extractImageBlocks(attachments);
        // jpg, jpeg, gif, webp are valid; 'noext' has no recognized extension
        expect(result.blocks).toHaveLength(4);
        expect(result.skipped).toBe(0);
    });

    test('extracts image with unknown extension falls back gracefully', () => {
        // An image identified only by extension with an unusual but valid type
        const result = extractImageBlocks([
            makeAttachment({ id: '1', content_type: undefined, filename: 'image.png', size: 500 }),
        ]);
        expect(result.blocks).toHaveLength(1);
        expect(result.skipped).toBe(0);
    });
});

describe('buildMultimodalContent', () => {
    test('returns plain string when no attachments', () => {
        const result = buildMultimodalContent('hello', undefined);
        expect(result).toBe('hello');
    });

    test('returns plain string when attachments are empty', () => {
        const result = buildMultimodalContent('hello', []);
        expect(result).toBe('hello');
    });

    test('returns plain string when attachments have no images', () => {
        const result = buildMultimodalContent('hello', [
            makeAttachment({ content_type: 'application/pdf', filename: 'doc.pdf' }),
        ]);
        expect(result).toBe('hello');
    });

    test('returns content block array when images are present', () => {
        const result = buildMultimodalContent('check this out', [makeAttachment()]);
        expect(Array.isArray(result)).toBe(true);
        const blocks = result as Array<{ type: string }>;
        expect(blocks).toHaveLength(2);
        expect(blocks[0].type).toBe('text');
        expect(blocks[1].type).toBe('image');
    });

    test('text block contains the message text', () => {
        const result = buildMultimodalContent('my message', [makeAttachment()]);
        expect(Array.isArray(result)).toBe(true);
        const blocks = result as Array<{ type: string; text?: string }>;
        expect(blocks[0]).toEqual({ type: 'text', text: 'my message' });
    });

    test('handles empty text with images', () => {
        const result = buildMultimodalContent('', [makeAttachment()]);
        expect(Array.isArray(result)).toBe(true);
        const blocks = result as Array<{ type: string }>;
        // Empty text is omitted, only image block
        expect(blocks).toHaveLength(1);
        expect(blocks[0].type).toBe('image');
    });

    test('appends skip notice when images are skipped', () => {
        const oversizedAttachments = [
            makeAttachment({ size: 1024 }), // OK
            makeAttachment({ id: '2', size: 25 * 1024 * 1024 }), // Too large
        ];
        const result = buildMultimodalContent('text', oversizedAttachments);
        expect(Array.isArray(result)).toBe(true);
        const blocks = result as Array<{ type: string; text?: string }>;
        const lastBlock = blocks[blocks.length - 1];
        expect(lastBlock.type).toBe('text');
        expect(lastBlock.text).toContain('skipped');
    });

    test('returns string with skip notice when all images are skipped', () => {
        const oversizedAttachments = [
            makeAttachment({ size: 25 * 1024 * 1024 }), // Too large
        ];
        const result = buildMultimodalContent('text', oversizedAttachments);
        expect(typeof result).toBe('string');
        expect(result as string).toContain('skipped');
    });

    test('includes skip notice with valid images and over-limit images', () => {
        // 5 valid images + 2 over limit = 5 extracted + 2 skipped
        const attachments = Array.from({ length: 7 }, (_, i) =>
            makeAttachment({ id: String(i), filename: `img${i}.png`, size: 1024 }),
        );
        const result = buildMultimodalContent('look at these', attachments);
        expect(Array.isArray(result)).toBe(true);
        const blocks = result as Array<{ type: string; text?: string }>;
        // text + 5 images + skip notice
        expect(blocks).toHaveLength(7);
        expect(blocks[0]).toEqual({ type: 'text', text: 'look at these' });
        expect(blocks[6].type).toBe('text');
        expect(blocks[6].text).toContain('skipped');
    });

    test('handles images with extension-only detection in multimodal content', () => {
        const attachments = [
            makeAttachment({ content_type: undefined, filename: 'shot.jpg' }),
            makeAttachment({ id: '2', content_type: undefined, filename: 'cap.webp' }),
        ];
        const result = buildMultimodalContent('check these', attachments);
        expect(Array.isArray(result)).toBe(true);
        const blocks = result as Array<{ type: string }>;
        expect(blocks).toHaveLength(3); // text + 2 images
        expect(blocks[0].type).toBe('text');
        expect(blocks[1].type).toBe('image');
        expect(blocks[2].type).toBe('image');
    });
});
