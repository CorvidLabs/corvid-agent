/**
 * Tests for POST /api/discord/send-image — Discord image route.
 *
 * Uses dependency injection (DiscordImageDeps) instead of mock.module to
 * avoid polluting the global module registry and breaking other test files
 * that import from discord/embeds or delivery-tracker.
 */
import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { handleDiscordImageRoutes, type DiscordImageDeps } from '../routes/discord-image';
import type { RequestContext } from '../middleware/guards';

const ctx: RequestContext = {
    tenantId: 'default',
    authenticated: true,
    tenantRole: 'owner',
};

function fakeReq(body: unknown, contentType = 'application/json'): { req: Request; url: URL } {
    const url = new URL('http://localhost:3000/api/discord/send-image');
    const req = new Request(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': contentType },
        body: JSON.stringify(body),
    });
    return { req, url };
}

const mockSendMessageWithFiles = mock(() => Promise.resolve('msg-123'));
const mockSendEmbedWithFiles = mock(() => Promise.resolve('embed-msg-456'));
const mockGetDeliveryTracker = mock(() => ({}) as any);

const deps: DiscordImageDeps = {
    sendMessageWithFiles: mockSendMessageWithFiles as any,
    sendEmbedWithFiles: mockSendEmbedWithFiles as any,
    getDeliveryTracker: mockGetDeliveryTracker,
};

describe('Discord Image Route', () => {
    const originalBotToken = process.env.DISCORD_BOT_TOKEN;

    beforeEach(() => {
        mockSendMessageWithFiles.mockClear();
        mockSendEmbedWithFiles.mockClear();
        process.env.DISCORD_BOT_TOKEN = 'test-token';
    });

    afterEach(() => {
        if (originalBotToken !== undefined) {
            process.env.DISCORD_BOT_TOKEN = originalBotToken;
        } else {
            delete process.env.DISCORD_BOT_TOKEN;
        }
    });

    it('returns null for non-matching paths', () => {
        const url = new URL('http://localhost:3000/api/discord/other');
        const req = new Request(url.toString(), { method: 'POST' });
        expect(handleDiscordImageRoutes(req, url, ctx, deps)).toBeNull();
    });

    it('returns null for non-POST methods', () => {
        const url = new URL('http://localhost:3000/api/discord/send-image');
        const req = new Request(url.toString(), { method: 'GET' });
        expect(handleDiscordImageRoutes(req, url, ctx, deps)).toBeNull();
    });

    it('returns 503 when DISCORD_BOT_TOKEN is not set', async () => {
        delete process.env.DISCORD_BOT_TOKEN;
        const { req, url } = fakeReq({ channelId: 'ch-1', imageBase64: 'aGVsbG8=' });
        const res = await handleDiscordImageRoutes(req, url, ctx, deps);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(503);
        const data = await res!.json() as { error: string };
        expect(data.error).toContain('Discord bot token not configured');
    });

    it('returns 400 when channelId is missing', async () => {
        const { req, url } = fakeReq({ imageBase64: 'aGVsbG8=' });
        const res = await handleDiscordImageRoutes(req, url, ctx, deps);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(400);
        const data = await res!.json() as { error: string };
        expect(data.error).toContain('channelId');
    });

    it('returns 400 when neither imageBase64 nor imagePath is provided', async () => {
        const { req, url } = fakeReq({ channelId: 'ch-1' });
        const res = await handleDiscordImageRoutes(req, url, ctx, deps);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(400);
        const data = await res!.json() as { error: string };
        expect(data.error).toMatch(/imageBase64|imagePath/);
    });

    it('returns 403 for path traversal attempts', async () => {
        const { req, url } = fakeReq({ channelId: 'ch-1', imagePath: '../../etc/passwd' });
        const res = await handleDiscordImageRoutes(req, url, ctx, deps);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(403);
        const data = await res!.json() as { error: string };
        expect(data.error).toContain('outside allowed directories');
    });

    it('sends image with base64 data and returns success', async () => {
        const imageBase64 = Buffer.from('hello').toString('base64');
        const { req, url } = fakeReq({ channelId: 'ch-1', imageBase64, message: 'hi!' });
        const res = await handleDiscordImageRoutes(req, url, ctx, deps);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json() as { success: boolean; messageId: string };
        expect(data.success).toBe(true);
        expect(data.messageId).toBe('msg-123');
        expect(mockSendMessageWithFiles).toHaveBeenCalledTimes(1);
    });

    it('sends embed when replyToMessageId is provided', async () => {
        const imageBase64 = Buffer.from('img').toString('base64');
        const { req, url } = fakeReq({
            channelId: 'ch-1',
            imageBase64,
            replyToMessageId: 'msg-ref',
        });
        const res = await handleDiscordImageRoutes(req, url, ctx, deps);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json() as { success: boolean; messageId: string };
        expect(data.success).toBe(true);
        expect(data.messageId).toBe('embed-msg-456');
        expect(mockSendEmbedWithFiles).toHaveBeenCalledTimes(1);
    });

    it('returns 502 when Discord send fails (null messageId)', async () => {
        mockSendMessageWithFiles.mockImplementationOnce(() => Promise.resolve(null as unknown as string));
        const imageBase64 = Buffer.from('img').toString('base64');
        const { req, url } = fakeReq({ channelId: 'ch-1', imageBase64 });
        const res = await handleDiscordImageRoutes(req, url, ctx, deps);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(502);
        const data = await res!.json() as { error: string };
        expect(data.error).toContain('Failed to send image');
    });

    it('uses custom filename and contentType if provided', async () => {
        const imageBase64 = Buffer.from('img').toString('base64');
        const { req, url } = fakeReq({
            channelId: 'ch-1',
            imageBase64,
            filename: 'photo.jpg',
            contentType: 'image/jpeg',
        });
        const res = await handleDiscordImageRoutes(req, url, ctx, deps);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const callArgs = mockSendMessageWithFiles.mock.calls[0] as unknown as unknown[][];
        const attachments = callArgs?.[4] as Array<{ name: string; contentType: string }> | undefined;
        expect(attachments?.[0]?.name).toBe('photo.jpg');
        expect(attachments?.[0]?.contentType).toBe('image/jpeg');
    });
});
