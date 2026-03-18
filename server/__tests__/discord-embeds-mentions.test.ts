import { describe, test, expect, spyOn, afterEach } from 'bun:test';
import { sendEmbed, sendReplyEmbed, editEmbed } from '../discord/embeds';
import { DeliveryTracker } from '../lib/delivery-tracker';

function mockFetchOk(responseBody: Record<string, unknown> = { id: '12345678901234567' }) {
    return spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(responseBody), { status: 200 }),
    );
}

const CHANNEL_ID = '12345678901234567';
const MESSAGE_ID = '99999999999999999';
const BOT_TOKEN = 'test-bot-token';

describe('sendEmbed mention extraction', () => {
    let tracker: DeliveryTracker;

    afterEach(() => {
        // @ts-expect-error - restore original fetch
        globalThis.fetch?.mockRestore?.();
    });

    test('includes content field when embed has mentions', async () => {
        tracker = new DeliveryTracker();
        const fetchSpy = mockFetchOk();
        await sendEmbed(tracker, BOT_TOKEN, CHANNEL_ID, {
            description: 'Hey <@180715808593281025> check this out',
        });
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
        expect(body.content).toBe('<@180715808593281025>');
        expect(body.embeds).toHaveLength(1);
        fetchSpy.mockRestore();
    });

    test('omits content field when embed has no mentions', async () => {
        tracker = new DeliveryTracker();
        const fetchSpy = mockFetchOk();
        await sendEmbed(tracker, BOT_TOKEN, CHANNEL_ID, {
            description: 'No mentions here',
        });
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
        expect(body.content).toBeUndefined();
        fetchSpy.mockRestore();
    });
});

describe('sendReplyEmbed mention extraction', () => {
    let tracker: DeliveryTracker;

    afterEach(() => {
        // @ts-expect-error - restore original fetch
        globalThis.fetch?.mockRestore?.();
    });

    test('includes content field when embed has mentions', async () => {
        tracker = new DeliveryTracker();
        const fetchSpy = mockFetchOk();
        await sendReplyEmbed(tracker, BOT_TOKEN, CHANNEL_ID, MESSAGE_ID, {
            description: 'Replying to <@180715808593281025>',
        });
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
        expect(body.content).toBe('<@180715808593281025>');
        expect(body.message_reference).toEqual({ message_id: MESSAGE_ID });
        fetchSpy.mockRestore();
    });

    test('omits content field when embed has no mentions', async () => {
        tracker = new DeliveryTracker();
        const fetchSpy = mockFetchOk();
        await sendReplyEmbed(tracker, BOT_TOKEN, CHANNEL_ID, MESSAGE_ID, {
            description: 'Just a reply',
        });
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
        expect(body.content).toBeUndefined();
        fetchSpy.mockRestore();
    });
});

describe('editEmbed mention extraction', () => {
    let tracker: DeliveryTracker;

    afterEach(() => {
        // @ts-expect-error - restore original fetch
        globalThis.fetch?.mockRestore?.();
    });

    test('includes content field when embed has mentions', async () => {
        tracker = new DeliveryTracker();
        const fetchSpy = mockFetchOk();
        await editEmbed(tracker, BOT_TOKEN, CHANNEL_ID, MESSAGE_ID, {
            description: 'Updated with <@180715808593281025>',
        });
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
        expect(body.content).toBe('<@180715808593281025>');
        fetchSpy.mockRestore();
    });

    test('omits content field when embed has no mentions', async () => {
        tracker = new DeliveryTracker();
        const fetchSpy = mockFetchOk();
        await editEmbed(tracker, BOT_TOKEN, CHANNEL_ID, MESSAGE_ID, {
            description: 'Updated without mentions',
        });
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
        expect(body.content).toBeUndefined();
        fetchSpy.mockRestore();
    });
});
