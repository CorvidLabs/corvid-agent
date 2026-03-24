import { test, expect, describe, beforeEach, afterEach, mock } from 'bun:test';
import { isImageAttachment, extractImageBlocks, buildMultimodalContent, appendAttachmentUrls } from '../discord/image-attachments';
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

/** Fake PNG data for mocking fetch responses. */
const FAKE_IMAGE_DATA = new Uint8Array([0x89, 0x50, 0x4E, 0x47]);
const FAKE_IMAGE_BASE64 = Buffer.from(FAKE_IMAGE_DATA).toString('base64');

/** Save original fetch so we can restore it. */
const originalFetch = globalThis.fetch;

function mockFetchSuccess() {
    globalThis.fetch = mock(async () => new Response(FAKE_IMAGE_DATA, {
        status: 200,
        headers: { 'content-type': 'image/png' },
    })) as typeof fetch;
}

function mockFetchFailure(status = 404) {
    globalThis.fetch = mock(async () => new Response(null, { status })) as typeof fetch;
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
    beforeEach(() => mockFetchSuccess());
    afterEach(() => { globalThis.fetch = originalFetch; });

    test('returns empty for undefined attachments', async () => {
        const result = await extractImageBlocks(undefined);
        expect(result.blocks).toHaveLength(0);
        expect(result.skipped).toBe(0);
    });

    test('returns empty for empty attachments array', async () => {
        const result = await extractImageBlocks([]);
        expect(result.blocks).toHaveLength(0);
        expect(result.skipped).toBe(0);
    });

    test('extracts single image attachment as base64', async () => {
        const result = await extractImageBlocks([makeAttachment()]);
        expect(result.blocks).toHaveLength(1);
        expect(result.skipped).toBe(0);
        expect(result.blocks[0]).toEqual({
            type: 'image',
            source: {
                type: 'base64',
                media_type: 'image/png',
                data: FAKE_IMAGE_BASE64,
            },
        });
    });

    test('fetches proxy_url over url', async () => {
        const fetchMock = mock(async () => new Response(FAKE_IMAGE_DATA, {
            status: 200,
            headers: { 'content-type': 'image/png' },
        }));
        globalThis.fetch = fetchMock as typeof fetch;

        await extractImageBlocks([makeAttachment({
            url: 'https://cdn.discordapp.com/original.png',
            proxy_url: 'https://media.discordapp.net/proxied.png',
        })]);
        expect(fetchMock).toHaveBeenCalledWith('https://media.discordapp.net/proxied.png');
    });

    test('falls back to url when proxy_url is empty', async () => {
        const fetchMock = mock(async () => new Response(FAKE_IMAGE_DATA, {
            status: 200,
            headers: { 'content-type': 'image/png' },
        }));
        globalThis.fetch = fetchMock as typeof fetch;

        await extractImageBlocks([makeAttachment({
            url: 'https://cdn.discordapp.com/original.png',
            proxy_url: '',
        })]);
        expect(fetchMock).toHaveBeenCalledWith('https://cdn.discordapp.com/original.png');
    });

    test('extracts multiple image attachments', async () => {
        const attachments = [
            makeAttachment({ id: '1', filename: 'a.png' }),
            makeAttachment({ id: '2', filename: 'b.jpg', content_type: 'image/jpeg' }),
            makeAttachment({ id: '3', filename: 'c.gif', content_type: 'image/gif' }),
        ];
        const result = await extractImageBlocks(attachments);
        expect(result.blocks).toHaveLength(3);
        expect(result.skipped).toBe(0);
    });

    test('skips non-image attachments', async () => {
        const attachments = [
            makeAttachment({ filename: 'image.png', content_type: 'image/png' }),
            makeAttachment({ filename: 'doc.pdf', content_type: 'application/pdf' }),
            makeAttachment({ filename: 'video.mp4', content_type: 'video/mp4' }),
        ];
        const result = await extractImageBlocks(attachments);
        expect(result.blocks).toHaveLength(1);
        expect(result.skipped).toBe(0); // non-images are silently ignored, not "skipped"
    });

    test('skips images that exceed size limit (20 MB)', async () => {
        const attachments = [
            makeAttachment({ size: 1024 }), // OK
            makeAttachment({ id: '2', size: 21 * 1024 * 1024 }), // Too large
        ];
        const result = await extractImageBlocks(attachments);
        expect(result.blocks).toHaveLength(1);
        expect(result.skipped).toBe(1);
    });

    test('enforces max 5 images per message', async () => {
        const attachments = Array.from({ length: 7 }, (_, i) =>
            makeAttachment({ id: String(i), filename: `img${i}.png` }),
        );
        const result = await extractImageBlocks(attachments);
        expect(result.blocks).toHaveLength(5);
        expect(result.skipped).toBe(2);
    });

    test('extracts images with extension-only detection (no content_type)', async () => {
        const attachments = [
            makeAttachment({ id: '1', content_type: undefined, filename: 'photo.jpg' }),
            makeAttachment({ id: '2', content_type: undefined, filename: 'screenshot.jpeg' }),
            makeAttachment({ id: '3', content_type: undefined, filename: 'icon.gif' }),
            makeAttachment({ id: '4', content_type: undefined, filename: 'banner.webp' }),
            makeAttachment({ id: '5', content_type: undefined, filename: 'noext' }),
        ];
        const result = await extractImageBlocks(attachments);
        // jpg, jpeg, gif, webp are valid; 'noext' has no recognized extension
        expect(result.blocks).toHaveLength(4);
        expect(result.skipped).toBe(0);
    });

    test('skips images that fail to download', async () => {
        mockFetchFailure(404);
        const result = await extractImageBlocks([makeAttachment()]);
        expect(result.blocks).toHaveLength(0);
        expect(result.skipped).toBe(1);
    });

    test('skips images when fetch throws', async () => {
        globalThis.fetch = mock(async () => { throw new Error('network error'); }) as typeof fetch;
        const result = await extractImageBlocks([makeAttachment()]);
        expect(result.blocks).toHaveLength(0);
        expect(result.skipped).toBe(1);
    });
});

describe('appendAttachmentUrls', () => {
    test('returns text unchanged when no attachments', () => {
        expect(appendAttachmentUrls('hello', undefined)).toBe('hello');
        expect(appendAttachmentUrls('hello', [])).toBe('hello');
    });

    test('appends attachment URLs to text', () => {
        const result = appendAttachmentUrls('hello', [makeAttachment()]);
        expect(result).toContain('hello');
        expect(result).toContain('[attachment: https://media.discordapp.net/attachments/ch/msg/test.png]');
    });

    test('returns URLs only when text is empty', () => {
        const result = appendAttachmentUrls('', [makeAttachment()]);
        expect(result).toBe('[attachment: https://media.discordapp.net/attachments/ch/msg/test.png]');
    });

    test('appends multiple attachment URLs', () => {
        const attachments = [
            makeAttachment({ id: '1', proxy_url: 'https://media.discordapp.net/a.png' }),
            makeAttachment({ id: '2', proxy_url: 'https://media.discordapp.net/b.png' }),
        ];
        const result = appendAttachmentUrls('look', attachments);
        expect(result).toContain('[attachment: https://media.discordapp.net/a.png]');
        expect(result).toContain('[attachment: https://media.discordapp.net/b.png]');
    });

    test('falls back to url when proxy_url is empty', () => {
        const result = appendAttachmentUrls('hi', [makeAttachment({ proxy_url: '', url: 'https://cdn.discordapp.com/direct.png' })]);
        expect(result).toContain('[attachment: https://cdn.discordapp.com/direct.png]');
    });
});

describe('buildMultimodalContent', () => {
    beforeEach(() => mockFetchSuccess());
    afterEach(() => { globalThis.fetch = originalFetch; });

    test('returns plain string when no attachments', async () => {
        const result = await buildMultimodalContent('hello', undefined);
        expect(result).toBe('hello');
    });

    test('returns plain string when attachments are empty', async () => {
        const result = await buildMultimodalContent('hello', []);
        expect(result).toBe('hello');
    });

    test('returns plain string with URL when attachments have no images', async () => {
        const result = await buildMultimodalContent('hello', [
            makeAttachment({ content_type: 'application/pdf', filename: 'doc.pdf' }),
        ]);
        // Non-image attachments still get their URL appended
        expect(typeof result).toBe('string');
        expect(result as string).toContain('hello');
        expect(result as string).toContain('[attachment:');
    });

    test('returns content block array when images are present', async () => {
        const result = await buildMultimodalContent('check this out', [makeAttachment()]);
        expect(Array.isArray(result)).toBe(true);
        const blocks = result as Array<{ type: string }>;
        expect(blocks).toHaveLength(2);
        expect(blocks[0].type).toBe('text');
        expect(blocks[1].type).toBe('image');
    });

    test('text block contains message text and attachment URL', async () => {
        const result = await buildMultimodalContent('my message', [makeAttachment()]);
        expect(Array.isArray(result)).toBe(true);
        const blocks = result as Array<{ type: string; text?: string }>;
        expect(blocks[0].type).toBe('text');
        expect(blocks[0].text).toContain('my message');
        expect(blocks[0].text).toContain('[attachment:');
    });

    test('handles empty text with images — URL-only text block', async () => {
        const result = await buildMultimodalContent('', [makeAttachment()]);
        expect(Array.isArray(result)).toBe(true);
        const blocks = result as Array<{ type: string; text?: string }>;
        // text block with URL + image block
        expect(blocks).toHaveLength(2);
        expect(blocks[0].type).toBe('text');
        expect(blocks[0].text).toContain('[attachment:');
        expect(blocks[1].type).toBe('image');
    });

    test('appends skip notice when images are skipped', async () => {
        const oversizedAttachments = [
            makeAttachment({ size: 1024 }), // OK
            makeAttachment({ id: '2', size: 25 * 1024 * 1024 }), // Too large
        ];
        const result = await buildMultimodalContent('text', oversizedAttachments);
        expect(Array.isArray(result)).toBe(true);
        const blocks = result as Array<{ type: string; text?: string }>;
        const lastBlock = blocks[blocks.length - 1];
        expect(lastBlock.type).toBe('text');
        expect(lastBlock.text).toContain('skipped');
    });

    test('returns string with skip notice when all images are skipped', async () => {
        const oversizedAttachments = [
            makeAttachment({ size: 25 * 1024 * 1024 }), // Too large
        ];
        const result = await buildMultimodalContent('text', oversizedAttachments);
        expect(typeof result).toBe('string');
        expect(result as string).toContain('skipped');
    });

    test('includes skip notice with valid images and over-limit images', async () => {
        // 5 valid images + 2 over limit = 5 extracted + 2 skipped
        const attachments = Array.from({ length: 7 }, (_, i) =>
            makeAttachment({ id: String(i), filename: `img${i}.png`, size: 1024 }),
        );
        const result = await buildMultimodalContent('look at these', attachments);
        expect(Array.isArray(result)).toBe(true);
        const blocks = result as Array<{ type: string; text?: string }>;
        // text (with URLs) + 5 images + skip notice
        expect(blocks).toHaveLength(7);
        expect(blocks[0].type).toBe('text');
        expect(blocks[0].text).toContain('look at these');
        expect(blocks[6].type).toBe('text');
        expect(blocks[6].text).toContain('skipped');
    });

    test('handles images with extension-only detection in multimodal content', async () => {
        const attachments = [
            makeAttachment({ content_type: undefined, filename: 'shot.jpg' }),
            makeAttachment({ id: '2', content_type: undefined, filename: 'cap.webp' }),
        ];
        const result = await buildMultimodalContent('check these', attachments);
        expect(Array.isArray(result)).toBe(true);
        const blocks = result as Array<{ type: string }>;
        expect(blocks).toHaveLength(3); // text (with URLs) + 2 images
        expect(blocks[0].type).toBe('text');
        expect(blocks[1].type).toBe('image');
        expect(blocks[2].type).toBe('image');
    });

    test('falls back to string when all image downloads fail', async () => {
        mockFetchFailure(500);
        const result = await buildMultimodalContent('hello', [makeAttachment()]);
        // All images failed to download → no image blocks → returns string with skip notice
        expect(typeof result).toBe('string');
        expect(result as string).toContain('skipped');
    });
});
