/**
 * Tests for Stripe API integration — webhook signature verification,
 * API request handling, and subscription management.
 *
 * All HTTP calls are mocked via global fetch override.
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { verifyWebhookSignature, createCustomer, getCustomer, createSubscription, cancelSubscription, createUsageRecord } from '../billing/stripe';

// ─── Webhook Verification ──────────────────────────────────────────────────

describe('verifyWebhookSignature', () => {
    const secret = 'whsec_test_secret_key_12345';

    async function signPayload(payload: string, timestamp: number): Promise<string> {
        const signedPayload = `${timestamp}.${payload}`;
        const key = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(secret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign'],
        );
        const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
        return Array.from(new Uint8Array(mac))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
    }

    it('verifies a valid webhook signature', async () => {
        const payload = JSON.stringify({ type: 'invoice.paid', data: { object: { id: 'inv_123' } } });
        const timestamp = Math.floor(Date.now() / 1000);
        const sig = await signPayload(payload, timestamp);
        const header = `t=${timestamp},v1=${sig}`;

        const result = await verifyWebhookSignature(payload, header, secret);
        expect(result.type).toBe('invoice.paid');
        expect(result.data.object.id).toBe('inv_123');
    });

    it('rejects invalid signature format (missing t=)', async () => {
        await expect(
            verifyWebhookSignature('{}', 'v1=abc123', secret),
        ).rejects.toThrow('Invalid webhook signature format');
    });

    it('rejects invalid signature format (missing v1=)', async () => {
        await expect(
            verifyWebhookSignature('{}', 't=12345', secret),
        ).rejects.toThrow('Invalid webhook signature format');
    });

    it('rejects wrong signature', async () => {
        const timestamp = Math.floor(Date.now() / 1000);
        const header = `t=${timestamp},v1=0000000000000000000000000000000000000000000000000000000000000000`;

        await expect(
            verifyWebhookSignature('{"type":"test"}', header, secret),
        ).rejects.toThrow('Webhook signature verification failed');
    });

    it('rejects stale timestamp (older than 5 minutes)', async () => {
        const payload = JSON.stringify({ type: 'test', data: { object: {} } });
        // 10 minutes ago
        const staleTimestamp = Math.floor(Date.now() / 1000) - 600;
        const sig = await signPayload(payload, staleTimestamp);
        const header = `t=${staleTimestamp},v1=${sig}`;

        await expect(
            verifyWebhookSignature(payload, header, secret),
        ).rejects.toThrow('Webhook timestamp too old');
    });

    it('accepts timestamp within 5-minute tolerance', async () => {
        const payload = JSON.stringify({ type: 'test.event', data: { object: { ok: true } } });
        // 2 minutes ago (well within tolerance)
        const recentTimestamp = Math.floor(Date.now() / 1000) - 120;
        const sig = await signPayload(payload, recentTimestamp);
        const header = `t=${recentTimestamp},v1=${sig}`;

        const result = await verifyWebhookSignature(payload, header, secret);
        expect(result.type).toBe('test.event');
    });

    it('rejects payload tampered after signing', async () => {
        const originalPayload = JSON.stringify({ type: 'original', data: { object: {} } });
        const timestamp = Math.floor(Date.now() / 1000);
        const sig = await signPayload(originalPayload, timestamp);
        const header = `t=${timestamp},v1=${sig}`;

        const tamperedPayload = JSON.stringify({ type: 'tampered', data: { object: {} } });

        await expect(
            verifyWebhookSignature(tamperedPayload, header, secret),
        ).rejects.toThrow('Webhook signature verification failed');
    });
});

// ─── Stripe API Functions ──────────────────────────────────────────────────

describe('Stripe API functions', () => {
    let originalFetch: typeof globalThis.fetch;
    let originalEnv: string | undefined;

    beforeEach(() => {
        originalFetch = globalThis.fetch;
        originalEnv = process.env.STRIPE_SECRET_KEY;
        process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        if (originalEnv !== undefined) {
            process.env.STRIPE_SECRET_KEY = originalEnv;
        } else {
            delete process.env.STRIPE_SECRET_KEY;
        }
    });

    it('createCustomer sends correct request', async () => {
        globalThis.fetch = (async (url: any, init: any) => {
            expect(String(url)).toContain('/v1/customers');
            expect(init.method).toBe('POST');
            expect(init.headers.Authorization).toBe('Bearer sk_test_123');
            expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
            const body = new URLSearchParams(init.body);
            expect(body.get('email')).toBe('test@example.com');
            expect(body.get('name')).toBe('Test User');

            return new Response(JSON.stringify({
                id: 'cus_test',
                email: 'test@example.com',
                name: 'Test User',
                metadata: {},
            }), { status: 200 });
        }) as typeof fetch;

        const customer = await createCustomer('test@example.com', 'Test User');
        expect(customer.id).toBe('cus_test');
        expect(customer.email).toBe('test@example.com');
    });

    it('createCustomer includes metadata', async () => {
        globalThis.fetch = (async (_url: any, init: any) => {
            const body = new URLSearchParams(init.body);
            expect(body.get('metadata[agentId]')).toBe('agent-1');

            return new Response(JSON.stringify({
                id: 'cus_meta',
                email: 'meta@test.com',
                name: 'Meta',
                metadata: { agentId: 'agent-1' },
            }), { status: 200 });
        }) as typeof fetch;

        const customer = await createCustomer('meta@test.com', 'Meta', { agentId: 'agent-1' });
        expect(customer.metadata.agentId).toBe('agent-1');
    });

    it('getCustomer sends GET request', async () => {
        globalThis.fetch = (async (url: any, init: any) => {
            expect(String(url)).toContain('/v1/customers/cus_123');
            expect(init.method).toBe('GET');

            return new Response(JSON.stringify({
                id: 'cus_123',
                email: 'get@test.com',
                name: 'Get Test',
                metadata: {},
            }), { status: 200 });
        }) as typeof fetch;

        const customer = await getCustomer('cus_123');
        expect(customer.id).toBe('cus_123');
    });

    it('createSubscription sends correct params', async () => {
        globalThis.fetch = (async (_url: any, init: any) => {
            const body = new URLSearchParams(init.body);
            expect(body.get('customer')).toBe('cus_123');
            expect(body.get('items[0][price]')).toBe('price_abc');

            return new Response(JSON.stringify({
                id: 'sub_test',
                customer: 'cus_123',
                status: 'active',
                current_period_start: 1000000,
                current_period_end: 2000000,
                cancel_at_period_end: false,
                items: { data: [{ id: 'si_123', price: { id: 'price_abc' } }] },
            }), { status: 200 });
        }) as typeof fetch;

        const sub = await createSubscription('cus_123', 'price_abc');
        expect(sub.id).toBe('sub_test');
        expect(sub.status).toBe('active');
    });

    it('cancelSubscription at period end sends correct flag', async () => {
        globalThis.fetch = (async (url: any, init: any) => {
            expect(String(url)).toContain('/v1/subscriptions/sub_123');
            expect(init.method).toBe('POST');
            const body = new URLSearchParams(init.body);
            expect(body.get('cancel_at_period_end')).toBe('true');

            return new Response(JSON.stringify({
                id: 'sub_123',
                customer: 'cus_1',
                status: 'active',
                current_period_start: 1000,
                current_period_end: 2000,
                cancel_at_period_end: true,
                items: { data: [] },
            }), { status: 200 });
        }) as typeof fetch;

        const sub = await cancelSubscription('sub_123', true);
        expect(sub.cancel_at_period_end).toBe(true);
    });

    it('cancelSubscription immediately sends DELETE', async () => {
        globalThis.fetch = (async (url: any, init: any) => {
            expect(init.method).toBe('DELETE');
            expect(String(url)).toContain('/v1/subscriptions/sub_123');

            return new Response(JSON.stringify({
                id: 'sub_123',
                customer: 'cus_1',
                status: 'canceled',
                current_period_start: 1000,
                current_period_end: 2000,
                cancel_at_period_end: false,
                items: { data: [] },
            }), { status: 200 });
        }) as typeof fetch;

        const sub = await cancelSubscription('sub_123', false);
        expect(sub.status).toBe('canceled');
    });

    it('createUsageRecord sends quantity and action', async () => {
        globalThis.fetch = (async (_url: any, init: any) => {
            const body = new URLSearchParams(init.body);
            expect(body.get('quantity')).toBe('100');
            expect(body.get('action')).toBe('set');

            return new Response(JSON.stringify({ id: 'usage_123' }), { status: 200 });
        }) as typeof fetch;

        const result = await createUsageRecord('si_item_1', 100);
        expect(result.id).toBe('usage_123');
    });

    it('createUsageRecord includes timestamp when provided', async () => {
        globalThis.fetch = (async (_url: any, init: any) => {
            const body = new URLSearchParams(init.body);
            expect(body.get('timestamp')).toBe('1700000000');

            return new Response(JSON.stringify({ id: 'usage_ts' }), { status: 200 });
        }) as typeof fetch;

        await createUsageRecord('si_item_1', 50, 1700000000);
    });

    it('throws on API error response', async () => {
        globalThis.fetch = (async () => {
            return new Response(JSON.stringify({
                error: { message: 'Invalid API Key', type: 'authentication_error' },
            }), { status: 401 });
        }) as typeof fetch;

        await expect(getCustomer('cus_bad')).rejects.toThrow('Invalid API Key');
    });

    it('throws when STRIPE_SECRET_KEY is not configured', async () => {
        delete process.env.STRIPE_SECRET_KEY;

        await expect(getCustomer('cus_any')).rejects.toThrow('STRIPE_SECRET_KEY is not configured');
    });
});
