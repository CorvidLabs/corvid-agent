/**
 * Auth Flow routes — Device authorization flow for CLI login.
 *
 * Implements OAuth 2.0 Device Authorization Grant (RFC 8628) pattern
 * for CLI-to-server authentication.
 */
import type { Database } from 'bun:sqlite';
import { json } from '../lib/response';
import { parseBodyOrThrow, ValidationError, DeviceTokenSchema, DeviceAuthorizeSchema } from '../lib/validation';
import { createLogger } from '../lib/logger';

const log = createLogger('AuthFlow');

const DEVICE_CODE_EXPIRY_MS = 600_000; // 10 minutes
const USER_CODE_LENGTH = 8;

interface PendingAuth {
    deviceCode: string;
    userCode: string;
    expiresAt: number;
    tenantId: string | null;
    accessToken: string | null;
    email: string | null;
    status: 'pending' | 'authorized' | 'denied' | 'expired';
}

// In-memory store for pending device auth flows.
// Capped at 100 entries to prevent unbounded growth; expired entries are cleaned on each new request.
const MAX_PENDING_AUTHS = 100;
const pendingAuths = new Map<string, PendingAuth>();

function generateCode(length: number): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No ambiguous chars (0/O, 1/I)
    // Use rejection sampling to avoid modulo bias (CodeQL js/biased-cryptographic-random)
    const maxUnbiased = Math.floor(256 / chars.length) * chars.length; // 240 for 30 chars
    let code = '';
    while (code.length < length) {
        const bytes = crypto.getRandomValues(new Uint8Array(length - code.length + 8));
        for (let i = 0; i < bytes.length && code.length < length; i++) {
            if (bytes[i] < maxUnbiased) {
                code += chars[bytes[i] % chars.length];
            }
        }
    }
    return code;
}

function cleanupExpired(): void {
    const now = Date.now();
    for (const [code, auth] of pendingAuths) {
        if (auth.expiresAt < now) {
            pendingAuths.delete(code);
        }
    }
}

export function handleAuthFlowRoutes(
    req: Request,
    url: URL,
    db: Database,
): Response | Promise<Response> | null {
    const path = url.pathname;
    const method = req.method;

    // Initiate device auth
    if (path === '/api/auth/device' && method === 'POST') {
        return handleDeviceAuth(db);
    }

    // Poll for token
    if (path === '/api/auth/device/token' && method === 'POST') {
        return handleDeviceToken(req);
    }

    // Authorize a device (called from web UI after user logs in)
    if (path === '/api/auth/device/authorize' && method === 'POST') {
        return handleDeviceAuthorize(req);
    }

    // Verify page (shows user code input)
    if (path === '/api/auth/verify' && method === 'GET') {
        return handleVerifyPage(url);
    }

    return null;
}

function handleDeviceAuth(_db: Database): Response {
    cleanupExpired();

    // Enforce cap to prevent unbounded memory growth
    if (pendingAuths.size >= MAX_PENDING_AUTHS) {
        return json({ error: 'Too many pending device authorizations. Try again later.' }, 429);
    }

    const deviceCode = crypto.randomUUID();
    const userCode = generateCode(USER_CODE_LENGTH);

    const auth: PendingAuth = {
        deviceCode,
        userCode,
        expiresAt: Date.now() + DEVICE_CODE_EXPIRY_MS,
        tenantId: null,
        accessToken: null,
        email: null,
        status: 'pending',
    };

    pendingAuths.set(deviceCode, auth);

    log.info('Device auth initiated', { userCode });

    // In production, verificationUrl would point to the web dashboard
    const baseUrl = process.env.PUBLIC_URL ?? 'http://localhost:3578';

    return json({
        deviceCode,
        userCode,
        verificationUrl: `${baseUrl}/api/auth/verify?code=${userCode}`,
        expiresIn: DEVICE_CODE_EXPIRY_MS / 1000,
        interval: 2,
    });
}

async function handleDeviceToken(req: Request): Promise<Response> {
    let data: { deviceCode: string };
    try {
        data = await parseBodyOrThrow(req, DeviceTokenSchema);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.detail }, 400);
        throw err;
    }

    const auth = pendingAuths.get(data.deviceCode);
    if (!auth) {
        return json({ error: 'expired', error_description: 'Device code expired or invalid' }, 400);
    }

    if (auth.expiresAt < Date.now()) {
        pendingAuths.delete(data.deviceCode);
        return json({ error: 'expired', error_description: 'Device code expired' }, 400);
    }

    if (auth.status === 'denied') {
        pendingAuths.delete(data.deviceCode);
        return json({ error: 'denied', error_description: 'Authorization denied' }, 400);
    }

    if (auth.status === 'pending') {
        return json({ error: 'authorization_pending' }, 400);
    }

    if (auth.status === 'authorized' && auth.accessToken) {
        // Success! Return the token and clean up
        const response = {
            accessToken: auth.accessToken,
            tenantId: auth.tenantId,
            tenantName: auth.tenantId ?? 'default',
            email: auth.email ?? '',
        };
        pendingAuths.delete(data.deviceCode);
        return json(response);
    }

    return json({ error: 'authorization_pending' }, 400);
}

async function handleDeviceAuthorize(req: Request): Promise<Response> {
    let data: { userCode: string; tenantId: string; email: string; approve: boolean };
    try {
        data = await parseBodyOrThrow(req, DeviceAuthorizeSchema);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.detail }, 400);
        throw err;
    }

    // Find the pending auth by user code
    let found: PendingAuth | null = null;
    for (const auth of pendingAuths.values()) {
        if (auth.userCode === data.userCode && auth.status === 'pending') {
            found = auth;
            break;
        }
    }

    if (!found) {
        return json({ error: 'Invalid or expired user code' }, 404);
    }

    if (!data.approve) {
        found.status = 'denied';
        return json({ ok: true, status: 'denied' });
    }

    // Generate an access token
    const accessToken = `ca_${crypto.randomUUID().replace(/-/g, '')}`;
    found.status = 'authorized';
    found.tenantId = data.tenantId;
    found.accessToken = accessToken;
    found.email = data.email;

    log.info('Device authorized', { userCode: data.userCode, tenantId: data.tenantId });

    return json({ ok: true, status: 'authorized' });
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function handleVerifyPage(url: URL): Response {
    const rawCode = url.searchParams.get('code') ?? '';
    // Validate: user codes are uppercase alphanumeric only
    const code = /^[A-Z0-9]{0,16}$/.test(rawCode) ? rawCode : '';
    const safeCode = escapeHtml(code);

    const html = `<!DOCTYPE html>
<html><head><title>CorvidAgent - Device Authorization</title>
<style>
  body { font-family: system-ui; max-width: 400px; margin: 80px auto; padding: 0 20px; }
  h1 { font-size: 1.5rem; }
  .code { font-size: 2rem; font-weight: bold; letter-spacing: 0.3em; text-align: center;
          padding: 20px; background: #f5f5f5; border-radius: 8px; margin: 20px 0; }
  .info { color: #666; font-size: 0.9rem; }
</style>
</head><body>
<h1>Device Authorization</h1>
<p>Confirm this code matches what's shown in your terminal:</p>
<div class="code">${safeCode || '--------'}</div>
<p class="info">If this code matches, click Authorize below to grant access to the CLI.</p>
<button onclick="authorize()" style="width:100%;padding:12px;font-size:1rem;cursor:pointer;
  background:#2563eb;color:white;border:none;border-radius:6px;">Authorize</button>
<script>
async function authorize() {
  const code = document.querySelector('.code').textContent.trim();
  if (!code || code === '--------') return;
  const resp = await fetch('/api/auth/device/authorize', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({userCode:code,tenantId:'default',email:'owner@localhost',approve:true})
  });
  if (resp.ok) { document.body.innerHTML = '<h1>Authorized!</h1><p>You can close this window.</p>'; }
  else { document.body.innerHTML = '<h1>Error</h1><p>Authorization failed.</p>'; }
}
</script>
</body></html>`;

    return new Response(html, {
        headers: { 'Content-Type': 'text/html' },
    });
}
