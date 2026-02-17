/**
 * Stripe — Stripe API integration for subscription and payment management.
 *
 * Uses the Stripe REST API directly (no SDK dependency) to keep
 * the dependency footprint minimal.
 */
const STRIPE_API_BASE = 'https://api.stripe.com/v1';

/**
 * Constant-time string comparison to prevent timing attacks on HMAC verification.
 */
function timingSafeCompare(a: string, b: string): boolean {
    const encoder = new TextEncoder();
    const bufA = encoder.encode(a);
    const bufB = encoder.encode(b);
    const len = Math.max(bufA.length, bufB.length);
    const paddedA = new Uint8Array(len);
    const paddedB = new Uint8Array(len);
    paddedA.set(bufA);
    paddedB.set(bufB);
    let result = bufA.length ^ bufB.length;
    for (let i = 0; i < len; i++) {
        result |= paddedA[i] ^ paddedB[i];
    }
    return result === 0;
}

/**
 * Make a request to the Stripe API.
 */
async function stripeRequest<T>(
    method: string,
    path: string,
    body?: Record<string, string>,
): Promise<T> {
    const apiKey = process.env.STRIPE_SECRET_KEY;
    if (!apiKey) {
        throw new Error('STRIPE_SECRET_KEY is not configured');
    }

    const url = `${STRIPE_API_BASE}${path}`;
    const headers: Record<string, string> = {
        'Authorization': `Bearer ${apiKey}`,
    };

    const options: RequestInit = { method, headers, signal: AbortSignal.timeout(15_000) };

    if (body && (method === 'POST' || method === 'PUT')) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        options.body = new URLSearchParams(body).toString();
    }

    const response = await fetch(url, options);
    const data = await response.json() as T & { error?: { message: string; type: string } };

    if (!response.ok) {
        const err = (data as { error?: { message: string } }).error;
        throw new Error(`Stripe API error: ${err?.message ?? response.statusText}`);
    }

    return data;
}

// ─── Customers ───────────────────────────────────────────────────────────────

export interface StripeCustomer {
    id: string;
    email: string;
    name: string | null;
    metadata: Record<string, string>;
}

export async function createCustomer(
    email: string,
    name: string,
    metadata?: Record<string, string>,
): Promise<StripeCustomer> {
    const body: Record<string, string> = { email, name };
    if (metadata) {
        for (const [key, value] of Object.entries(metadata)) {
            body[`metadata[${key}]`] = value;
        }
    }

    return stripeRequest<StripeCustomer>('POST', '/customers', body);
}

export async function getCustomer(customerId: string): Promise<StripeCustomer> {
    return stripeRequest<StripeCustomer>('GET', `/customers/${customerId}`);
}

// ─── Subscriptions ───────────────────────────────────────────────────────────

export interface StripeSubscription {
    id: string;
    customer: string;
    status: string;
    current_period_start: number;
    current_period_end: number;
    cancel_at_period_end: boolean;
    items: { data: Array<{ id: string; price: { id: string } }> };
}

export async function createSubscription(
    customerId: string,
    priceId: string,
): Promise<StripeSubscription> {
    return stripeRequest<StripeSubscription>('POST', '/subscriptions', {
        customer: customerId,
        'items[0][price]': priceId,
    });
}

export async function cancelSubscription(
    subscriptionId: string,
    atPeriodEnd: boolean = true,
): Promise<StripeSubscription> {
    if (atPeriodEnd) {
        return stripeRequest<StripeSubscription>('POST', `/subscriptions/${subscriptionId}`, {
            cancel_at_period_end: 'true',
        });
    }
    return stripeRequest<StripeSubscription>('DELETE', `/subscriptions/${subscriptionId}`);
}

// ─── Usage Records ───────────────────────────────────────────────────────────

export async function createUsageRecord(
    subscriptionItemId: string,
    quantity: number,
    timestamp?: number,
): Promise<{ id: string }> {
    const body: Record<string, string> = {
        quantity: String(quantity),
        action: 'set',
    };
    if (timestamp) {
        body.timestamp = String(timestamp);
    }

    return stripeRequest<{ id: string }>(
        'POST',
        `/subscription_items/${subscriptionItemId}/usage_records`,
        body,
    );
}

// ─── Webhook Verification ────────────────────────────────────────────────────

/**
 * Verify a Stripe webhook signature.
 * Returns the parsed event payload if valid, throws if invalid.
 */
export async function verifyWebhookSignature(
    payload: string,
    signature: string,
    secret: string,
): Promise<{ type: string; data: { object: Record<string, unknown> } }> {
    const parts = signature.split(',');
    const timestampPart = parts.find((p) => p.startsWith('t='));
    const sigPart = parts.find((p) => p.startsWith('v1='));

    if (!timestampPart || !sigPart) {
        throw new Error('Invalid webhook signature format');
    }

    const timestamp = timestampPart.slice(2);
    const expectedSig = sigPart.slice(3);

    // Compute expected signature
    const signedPayload = `${timestamp}.${payload}`;
    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
    const computed = Array.from(new Uint8Array(mac))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

    if (!timingSafeCompare(computed, expectedSig)) {
        throw new Error('Webhook signature verification failed');
    }

    // Check timestamp tolerance (5 minutes)
    const eventTime = parseInt(timestamp, 10) * 1000;
    if (Math.abs(Date.now() - eventTime) > 300_000) {
        throw new Error('Webhook timestamp too old');
    }

    return JSON.parse(payload);
}
