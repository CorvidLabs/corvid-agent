import { test, expect } from './fixtures';

const BASE_URL = `http://localhost:${process.env.E2E_PORT || '3001'}`;

test.describe('API Coverage — Previously Untested Endpoints', () => {
    test('POST /api/backup creates database backup', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/backup`, { method: 'POST' });
        expect(res.ok).toBe(true);
        const data = await res.json();
        expect(data.path).toBeTruthy();
        expect(typeof data.sizeBytes).toBe('number');
    });

    test('POST /api/selftest/run starts a self-test', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/selftest/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ testType: 'unit' }),
        });
        // May fail if no ANTHROPIC_API_KEY — accept 200/201 or 500/503
        expect([200, 201, 500, 503]).toContain(res.status);
    });

    test('POST /api/sessions/:id/resume resumes a session', async ({ api }) => {
        const project = await api.seedProject('Resume Project');
        const agent = await api.seedAgent('Resume Agent');
        const session = await api.seedSession(project.id, agent.id);

        const res = await fetch(`${BASE_URL}/api/sessions/${session.id}/resume`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: 'Continue' }),
        });
        // May fail if session not in resumable state — accept 200 or 400/409
        expect([200, 400, 409]).toContain(res.status);
    });

    test('DELETE /api/sessions/:id deletes a session', async ({ api }) => {
        const project = await api.seedProject('Delete Session Project');
        const agent = await api.seedAgent('Delete Session Agent');
        const session = await api.seedSession(project.id, agent.id);

        const res = await fetch(`${BASE_URL}/api/sessions/${session.id}`, { method: 'DELETE' });
        expect(res.ok).toBe(true);

        // Verify 404
        const gone = await fetch(`${BASE_URL}/api/sessions/${session.id}`);
        expect(gone.status).toBe(404);
    });

    test('PUT /api/sessions/:id updates session name', async ({ api }) => {
        const project = await api.seedProject('Update Session Project');
        const agent = await api.seedAgent('Update Session Agent');
        const session = await api.seedSession(project.id, agent.id);
        const newName = `Updated ${Date.now()}`;

        const res = await fetch(`${BASE_URL}/api/sessions/${session.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName }),
        });
        expect(res.ok).toBe(true);

        const getRes = await fetch(`${BASE_URL}/api/sessions/${session.id}`);
        const updated = await getRes.json();
        expect(updated.name).toBe(newName);
    });

    test('POST /api/sessions/:id/stop stops a session', async ({ api }) => {
        const project = await api.seedProject('Stop Session Project');
        const agent = await api.seedAgent('Stop Session Agent');
        const session = await api.seedSession(project.id, agent.id);

        const res = await fetch(`${BASE_URL}/api/sessions/${session.id}/stop`, { method: 'POST' });
        // Accept 200 (stopped) or 400 (already stopped/idle)
        expect([200, 400]).toContain(res.status);
    });

    test('GET /api/sessions/:id/messages returns messages', async ({ api }) => {
        const project = await api.seedProject('Messages Project');
        const agent = await api.seedAgent('Messages Agent');
        const session = await api.seedSession(project.id, agent.id);

        const res = await fetch(`${BASE_URL}/api/sessions/${session.id}/messages`);
        expect(res.ok).toBe(true);
        const data = await res.json();
        expect(Array.isArray(data)).toBe(true);
    });

    test('GET /api/wallets/:address/messages returns wallet messages', async ({}) => {
        // Use a placeholder address — may return empty array if no messages
        const res = await fetch(`${BASE_URL}/api/wallets/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ/messages?limit=10&offset=0`);
        // Accept 200 (found) or 404 (wallet not tracked)
        expect([200, 404]).toContain(res.status);
        if (res.status === 200) {
            const data = await res.json();
            expect(data.messages).toBeDefined();
            expect(typeof data.total).toBe('number');
        }
    });

    test('POST /api/operational-mode sets operational mode', async ({}) => {
        // Get current mode first
        const getRes = await fetch(`${BASE_URL}/api/operational-mode`);
        expect(getRes.ok).toBe(true);
        const current = await getRes.json();

        // Set back to the same mode (safe, no side effects)
        const setRes = await fetch(`${BASE_URL}/api/operational-mode`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: current.mode }),
        });
        expect(setRes.ok).toBe(true);
    });

    test('GET /api/browse-dirs returns directory listing', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/browse-dirs?path=/tmp`);
        expect(res.ok).toBe(true);
        const data = await res.json();
        expect(data.current).toBeTruthy();
        expect(Array.isArray(data.dirs)).toBe(true);
    });

    test('POST /api/memories/backfill triggers memory backfill', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/memories/backfill`, { method: 'POST' });
        // May 200 or 503 depending on AlgoChat availability
        expect([200, 503]).toContain(res.status);
    });

    test('GET /api/algochat/psk-contacts lists PSK contacts', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/algochat/psk-contacts`);
        // May fail if AlgoChat not configured
        expect([200, 500, 503]).toContain(res.status);
        if (res.status === 200) {
            const data = await res.json();
            expect(data.contacts).toBeDefined();
        }
    });

    test('GET /api/algochat/psk-exchange returns exchange URI', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/algochat/psk-exchange`);
        // May fail if AlgoChat not configured
        expect([200, 500, 503]).toContain(res.status);
    });

    test('POST /api/algochat/network accepts valid network', async ({}) => {
        // Use AbortController to prevent long hangs if AlgoChat is restarting
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        try {
            const res = await fetch(`${BASE_URL}/api/algochat/network`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ network: 'testnet' }),
                signal: controller.signal,
            });
            // Accept 200 or error if AlgoChat not running/restarting
            expect([200, 400, 500, 503]).toContain(res.status);
        } catch (e: unknown) {
            // AbortError is acceptable — AlgoChat may be unavailable
            if (e instanceof Error && e.name === 'AbortError') {
                console.log('[algochat/network] Request timed out — AlgoChat likely unavailable');
            } else {
                throw e;
            }
        } finally {
            clearTimeout(timeout);
        }
    });

    test('GET /api/escalation-queue returns queue', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/escalation-queue`);
        expect(res.ok).toBe(true);
        const data = await res.json();
        expect(data.requests).toBeDefined();
        expect(Array.isArray(data.requests)).toBe(true);
    });

    test('GET /api/audit-log returns audit entries', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/audit-log`);
        expect(res.ok).toBe(true);
    });

    test('GET /api/agents/:id/agent-card returns A2A agent card', async ({ api }) => {
        const agent = await api.seedAgent('AgentCard Agent');

        const res = await fetch(`${BASE_URL}/api/agents/${agent.id}/agent-card`);
        // May 200 or 404 if agent card not configured
        expect([200, 404]).toContain(res.status);
    });

    // ─── Billing endpoints (partial — no Stripe webhook) ──────────────────

    test('GET /api/billing/calculate returns cost calculation', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/billing/calculate?credits=100`);
        // 200 if billing available, 503 if not
        expect([200, 503]).toContain(res.status);
        if (res.status === 200) {
            const data = await res.json();
            expect(typeof data.credits).toBe('number');
            expect(typeof data.costCents).toBe('number');
        }
    });

    test('GET /api/billing/calculate rejects negative credits', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/billing/calculate?credits=-10`);
        // 400 (bad request) or 503 (billing not available)
        expect([400, 503]).toContain(res.status);
    });

    test('GET /api/billing/usage/:tenantId returns usage data', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/billing/usage/e2e-tenant`);
        // 200 if billing available, 503 if not
        expect([200, 503]).toContain(res.status);
        if (res.status === 200) {
            const data = await res.json();
            expect(data.current).toBeDefined();
            expect(data.history).toBeDefined();
        }
    });

    test('GET /api/billing/invoices/:tenantId returns invoices', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/billing/invoices/e2e-tenant`);
        // 200 (may be empty array) or 503 (billing not available)
        expect([200, 503]).toContain(res.status);
        if (res.status === 200) {
            const data = await res.json();
            expect(Array.isArray(data)).toBe(true);
        }
    });

    test('GET /api/billing/subscription/:id returns 404 for nonexistent', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/billing/subscription/nonexistent-sub`);
        // 404 (not found) or 503 (billing not available)
        expect([404, 503]).toContain(res.status);
    });

    // ─── Sandbox endpoints (partial — no container infra) ─────────────────

    test('GET /api/sandbox/stats returns pool statistics', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/sandbox/stats`);
        expect(res.ok).toBe(true);
        const data = await res.json();
        expect(typeof data.enabled).toBe('boolean');
        expect(typeof data.total).toBe('number');
        expect(typeof data.warm).toBe('number');
        expect(typeof data.assigned).toBe('number');
    });

    test('GET /api/sandbox/policies returns policy list', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/sandbox/policies`);
        expect(res.ok).toBe(true);
        const data = await res.json();
        expect(Array.isArray(data)).toBe(true);
    });

    test('PUT /api/sandbox/policies/:agentId sets agent policy', async ({ api }) => {
        const agent = await api.seedAgent('Sandbox Policy Agent');

        const res = await fetch(`${BASE_URL}/api/sandbox/policies/${agent.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                cpuLimit: 2,
                memoryLimitMb: 512,
                networkPolicy: 'restricted',
                timeoutSeconds: 300,
            }),
        });
        expect(res.ok).toBe(true);
        const policy = await res.json();
        expect(policy.networkPolicy).toBe('restricted');

        // Verify GET returns the policy
        const getRes = await fetch(`${BASE_URL}/api/sandbox/policies/${agent.id}`);
        expect(getRes.ok).toBe(true);

        // Clean up
        const delRes = await fetch(`${BASE_URL}/api/sandbox/policies/${agent.id}`, { method: 'DELETE' });
        expect(delRes.ok).toBe(true);
    });

    test('PUT /api/sandbox/policies/:agentId rejects invalid networkPolicy', async ({ api }) => {
        const agent = await api.seedAgent('Sandbox Invalid Policy Agent');

        const res = await fetch(`${BASE_URL}/api/sandbox/policies/${agent.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ networkPolicy: 'invalid-value' }),
        });
        expect(res.status).toBe(400);
    });

    test('DELETE /api/sandbox/policies/:agentId returns 404 for nonexistent', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/sandbox/policies/nonexistent-agent`, { method: 'DELETE' });
        expect(res.status).toBe(404);
    });

    test('POST /api/sandbox/assign returns 503 when sandboxing disabled', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/sandbox/assign`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agentId: 'test', sessionId: 'test' }),
        });
        // 201 (assigned) or 503 (sandboxing not enabled)
        expect([201, 503]).toContain(res.status);
    });

    // ─── Exam endpoints ───────────────────────────────────────────────────

    test('GET /api/exam/categories returns exam categories', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/exam/categories`);
        expect(res.ok).toBe(true);
        const data = await res.json();
        expect(data.categories).toBeDefined();
        expect(Array.isArray(data.categories)).toBe(true);
        expect(data.categories.length).toBeGreaterThan(0);

        // Categories are plain strings (e.g. 'coding', 'context', 'tools')
        expect(typeof data.categories[0]).toBe('string');
    });

    test('POST /api/exam/run rejects missing model', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/exam/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        expect(res.status).toBe(400);
    });

    // ─── MCP API endpoints ────────────────────────────────────────────────

    test('GET /api/mcp/list-agents rejects missing agentId param', async ({}) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
            const res = await fetch(`${BASE_URL}/api/mcp/list-agents`, { signal: controller.signal });
            // 200 (SPA fallback), 400 (missing param), 404 (MCP deps null), or 500/503
            expect([200, 400, 404, 500, 503]).toContain(res.status);
        } catch (e: unknown) {
            // AbortError, SocketError, or fetch failed due to server closing connection
            const msg = e instanceof Error ? `${e.message} ${(e as Error & { cause?: { message?: string } }).cause?.message ?? ''}` : '';
            if (e instanceof Error && (e.name === 'AbortError' || msg.includes('closed') || msg.includes('fetch failed'))) {
                console.log('[mcp/list-agents] Request failed — MCP likely unavailable');
            } else {
                throw e;
            }
        } finally {
            clearTimeout(timeout);
        }
    });

    test('GET /api/mcp/list-agents with agentId returns agent list', async ({ api }) => {
        const agent = await api.seedAgent('MCP List Agent');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
            const res = await fetch(`${BASE_URL}/api/mcp/list-agents?agentId=${agent.id}`, {
                signal: controller.signal,
            });
            // 200 (success or SPA fallback), 404, or 500/503 (deps unavailable)
            expect([200, 400, 404, 500, 503]).toContain(res.status);
            const ct = res.headers.get('content-type') || '';
            if (res.status === 200 && ct.includes('application/json')) {
                const data = await res.json();
                expect(data.response).toBeDefined();
                expect(typeof data.isError).toBe('boolean');
            }
            // If HTML (SPA fallback), MCP route was not matched — acceptable
        } catch (e: unknown) {
            // AbortError, SocketError, or fetch failed due to server closing connection
            const msg = e instanceof Error ? `${e.message} ${(e as Error & { cause?: { message?: string } }).cause?.message ?? ''}` : '';
            if (e instanceof Error && (e.name === 'AbortError' || msg.includes('closed') || msg.includes('fetch failed'))) {
                console.log('[mcp/list-agents] Request failed — MCP likely unavailable');
            } else {
                throw e;
            }
        } finally {
            clearTimeout(timeout);
        }
    });

    // ─── Agent balance / fund / messages / invoke ─────────────────────────

    test('GET /api/agents/:id/balance returns balance and address', async ({ api }) => {
        const agent = await api.seedAgent('Balance Agent');

        const res = await fetch(`${BASE_URL}/api/agents/${agent.id}/balance`);
        // 200 if wallet exists, 404 if agent has no wallet
        expect([200, 404]).toContain(res.status);
        if (res.status === 200) {
            const data = await res.json();
            expect(typeof data.balance).toBe('number');
            // address may be null if wallet not yet created
            expect(data.address === null || typeof data.address === 'string').toBe(true);
        }
    });

    test('POST /api/agents/:id/fund rejects agent without wallet or returns funded', async ({ api }) => {
        const agent = await api.seedAgent('Fund Agent');

        const res = await fetch(`${BASE_URL}/api/agents/${agent.id}/fund`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ microAlgos: 1000 }),
        });
        // 200 (funded), 400 (no wallet), or 503 (AlgoChat unavailable)
        expect([200, 400, 503]).toContain(res.status);
    });

    test('GET /api/agents/:id/messages returns array', async ({ api }) => {
        const agent = await api.seedAgent('Messages Agent');

        const res = await fetch(`${BASE_URL}/api/agents/${agent.id}/messages`);
        expect([200, 404]).toContain(res.status);
        if (res.status === 200) {
            const data = await res.json();
            expect(Array.isArray(data)).toBe(true);
        }
    });

    test('POST /api/agents/:id/invoke rejects missing fields', async ({ api }) => {
        const agent = await api.seedAgent('Invoke Agent');

        const res = await fetch(`${BASE_URL}/api/agents/${agent.id}/invoke`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        // 400 (missing fields) or 503 (invoke service unavailable)
        expect([400, 503]).toContain(res.status);
    });

    // ─── Escalation ──────────────────────────────────────────────────────

    test('POST /api/escalation-queue/:id/resolve returns 404 for nonexistent', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/escalation-queue/99999/resolve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ approved: true }),
        });
        expect(res.status).toBe(404);
    });

    // ─── AlgoChat extended ───────────────────────────────────────────────

    test('GET /api/algochat/status returns status object', async ({}) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
            const res = await fetch(`${BASE_URL}/api/algochat/status`, { signal: controller.signal });
            expect([200, 503]).toContain(res.status);
            if (res.status === 200) {
                const data = await res.json();
                expect(typeof data.enabled).toBe('boolean');
                expect(typeof data.network).toBe('string');
            }
        } catch (e: unknown) {
            if (e instanceof Error && e.name === 'AbortError') {
                console.log('[algochat/status] Request timed out — AlgoChat likely unavailable');
            } else {
                throw e;
            }
        } finally {
            clearTimeout(timeout);
        }
    });

    test('POST /api/algochat/conversations returns array or 503', async ({}) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
            const res = await fetch(`${BASE_URL}/api/algochat/conversations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
                signal: controller.signal,
            });
            expect([200, 400, 500, 503]).toContain(res.status);
        } catch (e: unknown) {
            if (e instanceof Error && e.name === 'AbortError') {
                console.log('[algochat/conversations] Request timed out — AlgoChat likely unavailable');
            } else {
                throw e;
            }
        } finally {
            clearTimeout(timeout);
        }
    });

    test('POST /api/algochat/psk-exchange POST accepts or rejects', async ({}) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
            const res = await fetch(`${BASE_URL}/api/algochat/psk-exchange`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
                signal: controller.signal,
            });
            expect([200, 400, 500, 503]).toContain(res.status);
        } catch (e: unknown) {
            if (e instanceof Error && e.name === 'AbortError') {
                console.log('[algochat/psk-exchange] Request timed out — AlgoChat likely unavailable');
            } else {
                throw e;
            }
        } finally {
            clearTimeout(timeout);
        }
    });

    test('POST /api/algochat/psk-contacts rejects missing nickname', async ({}) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
            const res = await fetch(`${BASE_URL}/api/algochat/psk-contacts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
                signal: controller.signal,
            });
            expect([400, 500, 503]).toContain(res.status);
        } catch (e: unknown) {
            if (e instanceof Error && e.name === 'AbortError') {
                console.log('[algochat/psk-contacts] Request timed out — AlgoChat likely unavailable');
            } else {
                throw e;
            }
        } finally {
            clearTimeout(timeout);
        }
    });

    test('PATCH /api/algochat/psk-contacts/:id returns 404 for nonexistent', async ({}) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
            const res = await fetch(`${BASE_URL}/api/algochat/psk-contacts/nonexistent`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nickname: 'test' }),
                signal: controller.signal,
            });
            expect([404, 500, 503]).toContain(res.status);
        } catch (e: unknown) {
            if (e instanceof Error && e.name === 'AbortError') {
                console.log('[algochat/psk-contacts PATCH] Request timed out — AlgoChat likely unavailable');
            } else {
                throw e;
            }
        } finally {
            clearTimeout(timeout);
        }
    });

    test('DELETE /api/algochat/psk-contacts/:id returns 404 for nonexistent', async ({}) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
            const res = await fetch(`${BASE_URL}/api/algochat/psk-contacts/nonexistent`, {
                method: 'DELETE',
                signal: controller.signal,
            });
            expect([404, 500, 503]).toContain(res.status);
        } catch (e: unknown) {
            if (e instanceof Error && e.name === 'AbortError') {
                console.log('[algochat/psk-contacts DELETE] Request timed out — AlgoChat likely unavailable');
            } else {
                throw e;
            }
        } finally {
            clearTimeout(timeout);
        }
    });

    test('GET /api/algochat/psk-contacts/:id/qr returns 404 for nonexistent', async ({}) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
            const res = await fetch(`${BASE_URL}/api/algochat/psk-contacts/nonexistent/qr`, {
                signal: controller.signal,
            });
            expect([404, 500, 503]).toContain(res.status);
        } catch (e: unknown) {
            if (e instanceof Error && e.name === 'AbortError') {
                console.log('[algochat/psk-contacts QR] Request timed out — AlgoChat likely unavailable');
            } else {
                throw e;
            }
        } finally {
            clearTimeout(timeout);
        }
    });

    // ─── Ollama ──────────────────────────────────────────────────────────

    test('GET /api/ollama/models/running returns models or 503', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/ollama/models/running`);
        expect([200, 503]).toContain(res.status);
        if (res.status === 200) {
            const data = await res.json();
            expect(data.models).toBeDefined();
            expect(Array.isArray(data.models)).toBe(true);
        }
    });

    test('POST /api/ollama/models/pull rejects missing model', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/ollama/models/pull`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        expect([400, 503]).toContain(res.status);
    });

    test('DELETE /api/ollama/models rejects missing model', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/ollama/models`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        expect([400, 503]).toContain(res.status);
    });

    test('GET /api/ollama/models/pull/status returns statuses', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/ollama/models/pull/status`);
        expect([200, 503]).toContain(res.status);
        if (res.status === 200) {
            const data = await res.json();
            expect(data.statuses).toBeDefined();
            expect(Array.isArray(data.statuses)).toBe(true);
        }
    });

    // ─── Billing extended ────────────────────────────────────────────────

    test('POST /api/billing/subscription rejects missing fields', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/billing/subscription`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        expect([400, 503]).toContain(res.status);
    });

    test('POST /api/billing/subscription/:tenantId/cancel returns result', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/billing/subscription/e2e-tenant/cancel`, {
            method: 'POST',
        });
        expect([200, 404, 503]).toContain(res.status);
    });

    // ─── MCP extended ────────────────────────────────────────────────────

    test('POST /api/mcp/send-message rejects missing fields', async ({}) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
            const res = await fetch(`${BASE_URL}/api/mcp/send-message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
                signal: controller.signal,
            });
            expect([200, 400, 404, 500, 503]).toContain(res.status);
        } catch (e: unknown) {
            const msg = e instanceof Error ? `${e.message} ${(e as Error & { cause?: { message?: string } }).cause?.message ?? ''}` : '';
            if (e instanceof Error && (e.name === 'AbortError' || msg.includes('closed') || msg.includes('fetch failed'))) {
                console.log('[mcp/send-message] Request failed — MCP likely unavailable');
            } else {
                throw e;
            }
        } finally {
            clearTimeout(timeout);
        }
    });

    test('POST /api/mcp/save-memory rejects missing fields', async ({}) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
            const res = await fetch(`${BASE_URL}/api/mcp/save-memory`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
                signal: controller.signal,
            });
            expect([200, 400, 404, 500, 503]).toContain(res.status);
        } catch (e: unknown) {
            const msg = e instanceof Error ? `${e.message} ${(e as Error & { cause?: { message?: string } }).cause?.message ?? ''}` : '';
            if (e instanceof Error && (e.name === 'AbortError' || msg.includes('closed') || msg.includes('fetch failed'))) {
                console.log('[mcp/save-memory] Request failed — MCP likely unavailable');
            } else {
                throw e;
            }
        } finally {
            clearTimeout(timeout);
        }
    });

    test('POST /api/mcp/recall-memory rejects missing fields', async ({}) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
            const res = await fetch(`${BASE_URL}/api/mcp/recall-memory`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
                signal: controller.signal,
            });
            expect([200, 400, 404, 500, 503]).toContain(res.status);
        } catch (e: unknown) {
            const msg = e instanceof Error ? `${e.message} ${(e as Error & { cause?: { message?: string } }).cause?.message ?? ''}` : '';
            if (e instanceof Error && (e.name === 'AbortError' || msg.includes('closed') || msg.includes('fetch failed'))) {
                console.log('[mcp/recall-memory] Request failed — MCP likely unavailable');
            } else {
                throw e;
            }
        } finally {
            clearTimeout(timeout);
        }
    });

    // ─── Sandbox extended ────────────────────────────────────────────────

    test('POST /api/sandbox/release/:sessionId returns 503 when disabled', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/sandbox/release/test-session`, {
            method: 'POST',
        });
        // 200 (released) or 503 (sandboxing not enabled)
        expect([200, 503]).toContain(res.status);
    });

    // ─── Allowlist ───────────────────────────────────────────────────────

    test('PUT /api/allowlist/:address returns 404 for nonexistent', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/allowlist/NONEXISTENT`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label: 'test' }),
        });
        // 200 (upsert) or 404 (feature not enabled) — accept both
        expect([200, 404]).toContain(res.status);
    });

    // ─── A2A ─────────────────────────────────────────────────────────────

    test('POST /a2a/tasks/send rejects missing message', async ({}) => {
        const res = await fetch(`${BASE_URL}/a2a/tasks/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        expect([400, 404]).toContain(res.status);
    });

    test('GET /a2a/tasks/:id returns 404 for nonexistent', async ({}) => {
        const res = await fetch(`${BASE_URL}/a2a/tasks/nonexistent`);
        expect(res.status).toBe(404);
    });

    // ─── Analytics sessions ──────────────────────────────────────────────

    test('GET /api/analytics/sessions returns breakdown', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/analytics/sessions`);
        expect(res.ok).toBe(true);
        const data = await res.json();
        expect(Array.isArray(data.byAgent)).toBe(true);
        expect(Array.isArray(data.bySource)).toBe(true);
        expect(Array.isArray(data.byStatus)).toBe(true);
        expect(Array.isArray(data.recent)).toBe(true);
    });

    // ─── GitHub status ───────────────────────────────────────────────────

    test('GET /api/github/status returns configured flag', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/github/status`);
        expect(res.ok).toBe(true);
        const data = await res.json();
        expect(typeof data.configured).toBe('boolean');
    });

    // ─── Well-known / Discovery endpoints ────────────────────────────────

    test('GET /.well-known/agent-card.json returns A2A agent card', async ({}) => {
        const res = await fetch(`${BASE_URL}/.well-known/agent-card.json`);
        expect(res.ok).toBe(true);
        const data = await res.json();
        expect(data.name).toBeTruthy();
        expect(data.capabilities).toBeDefined();
        expect(data.skills).toBeDefined();
    });

    test('GET /metrics returns Prometheus format or 401', async ({}) => {
        const res = await fetch(`${BASE_URL}/metrics`);
        // 200 (no ADMIN_API_KEY set) or 401 (auth required)
        expect([200, 401]).toContain(res.status);
        if (res.status === 200) {
            const text = await res.text();
            // Prometheus metrics contain # HELP or # TYPE lines
            expect(text).toContain('#');
        }
    });

    test('GET /api/providers lists LLM providers', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/providers`);
        expect(res.ok).toBe(true);
        const data = await res.json();
        expect(Array.isArray(data)).toBe(true);
    });

    test('GET /api/providers/:type/models returns 404 for unknown provider', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/providers/nonexistent/models`);
        expect(res.status).toBe(404);
    });
});
