import { test as base, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

interface ApiHelpers {
    seedProject(name?: string): Promise<{ id: string; name: string }>;
    seedAgent(name?: string): Promise<{ id: string; name: string }>;
    seedCouncil(agentIds: string[], name?: string, chairmanAgentId?: string): Promise<{ id: string; name: string; agentIds: string[]; chairmanAgentId: string | null }>;
    seedPersona(agentId: string, data?: Record<string, unknown>): Promise<Record<string, unknown>>;
    seedSkillBundle(data?: Record<string, unknown>): Promise<{ id: string; name: string }>;
    seedMarketplaceListing(agentId: string, data?: Record<string, unknown>): Promise<{ id: string; name: string }>;
    seedMcpServer(data?: Record<string, unknown>): Promise<{ id: string; name: string }>;
    getHealth(): Promise<{ status: string; algochat: boolean }>;
    launchCouncil(councilId: string, projectId: string, prompt: string): Promise<{ launchId: string; sessionIds: string[] }>;
    getLaunch(launchId: string): Promise<{ stage: string; synthesis: string | null; sessionIds: string[]; prompt: string }>;
    waitForStage(launchId: string, stage: string, timeoutMs?: number): Promise<void>;
}

/** Retry-aware fetch that handles 429 (rate-limited) responses. */
async function fetchWithRetry(
    url: string,
    init: RequestInit,
    maxRetries: number = 3,
): Promise<Response> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const res = await fetch(url, init);
        if (res.status === 429 && attempt < maxRetries) {
            const retryAfter = parseInt(res.headers.get('Retry-After') ?? '2', 10);
            await new Promise((r) => setTimeout(r, retryAfter * 1000));
            continue;
        }
        return res;
    }
    // Unreachable, but TypeScript needs it
    return fetch(url, init);
}

export const test = base.extend<{ api: ApiHelpers }>({
    api: async ({}, use) => {
        const helpers: ApiHelpers = {
            async seedProject(name = 'E2E Test Project') {
                const res = await fetchWithRetry(`${BASE_URL}/api/projects`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, workingDir: '/tmp' }),
                });
                if (!res.ok) {
                    const body = await res.text().catch(() => '');
                    throw new Error(`seedProject failed: ${res.status} ${res.statusText} — ${body}`);
                }
                return res.json();
            },

            async seedAgent(name = 'E2E Test Agent') {
                const res = await fetchWithRetry(`${BASE_URL}/api/agents`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name,
                        model: 'claude-sonnet-4-20250514',
                        algochatEnabled: true,
                    }),
                });
                if (!res.ok) {
                    const body = await res.text().catch(() => '');
                    throw new Error(`seedAgent failed: ${res.status} ${res.statusText} — ${body}`);
                }
                return res.json();
            },

            async seedCouncil(agentIds: string[], name = 'E2E Test Council', chairmanAgentId?: string) {
                const res = await fetchWithRetry(`${BASE_URL}/api/councils`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, agentIds, chairmanAgentId }),
                });
                if (!res.ok) {
                    const body = await res.text().catch(() => '');
                    throw new Error(`seedCouncil failed: ${res.status} ${res.statusText} — ${body}`);
                }
                return res.json();
            },

            async seedPersona(agentId: string, data: Record<string, unknown> = {}) {
                const res = await fetchWithRetry(`${BASE_URL}/api/agents/${agentId}/persona`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        archetype: 'professional',
                        traits: ['helpful', 'concise'],
                        voiceGuidelines: 'Be direct and clear.',
                        background: 'E2E test persona',
                        exampleMessages: ['Sure, I can help with that.'],
                        ...data,
                    }),
                });
                if (!res.ok) {
                    const body = await res.text().catch(() => '');
                    throw new Error(`seedPersona failed: ${res.status} ${res.statusText} — ${body}`);
                }
                return res.json();
            },

            async seedSkillBundle(data: Record<string, unknown> = {}) {
                const res = await fetchWithRetry(`${BASE_URL}/api/skill-bundles`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: 'E2E Test Bundle',
                        description: 'Bundle for e2e testing',
                        tools: ['Read', 'Write'],
                        promptAdditions: 'Test prompt addition',
                        ...data,
                    }),
                });
                if (!res.ok) {
                    const body = await res.text().catch(() => '');
                    throw new Error(`seedSkillBundle failed: ${res.status} ${res.statusText} — ${body}`);
                }
                return res.json();
            },

            async seedMarketplaceListing(agentId: string, data: Record<string, unknown> = {}) {
                const res = await fetchWithRetry(`${BASE_URL}/api/marketplace/listings`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        agentId,
                        name: 'E2E Test Listing',
                        description: 'Test marketplace listing',
                        category: 'general',
                        pricingModel: 'free',
                        tags: ['test'],
                        ...data,
                    }),
                });
                if (!res.ok) {
                    const body = await res.text().catch(() => '');
                    throw new Error(`seedMarketplaceListing failed: ${res.status} ${res.statusText} — ${body}`);
                }
                return res.json();
            },

            async seedMcpServer(data: Record<string, unknown> = {}) {
                const res = await fetchWithRetry(`${BASE_URL}/api/mcp-servers`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: 'E2E Test MCP Server',
                        command: 'echo',
                        args: ['hello'],
                        enabled: true,
                        ...data,
                    }),
                });
                if (!res.ok) {
                    const body = await res.text().catch(() => '');
                    throw new Error(`seedMcpServer failed: ${res.status} ${res.statusText} — ${body}`);
                }
                return res.json();
            },

            async getHealth() {
                const res = await fetch(`${BASE_URL}/api/health`);
                expect(res.ok).toBe(true);
                return res.json();
            },

            async launchCouncil(councilId: string, projectId: string, prompt: string) {
                const res = await fetchWithRetry(`${BASE_URL}/api/councils/${councilId}/launch`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ projectId, prompt }),
                });
                if (!res.ok) {
                    const body = await res.text().catch(() => '');
                    throw new Error(`launchCouncil failed: ${res.status} ${res.statusText} — ${body}`);
                }
                return res.json();
            },

            async getLaunch(launchId: string) {
                const res = await fetch(`${BASE_URL}/api/council-launches/${launchId}`);
                expect(res.ok).toBe(true);
                return res.json();
            },

            async waitForStage(launchId: string, stage: string, timeoutMs = 60_000) {
                const start = Date.now();
                while (Date.now() - start < timeoutMs) {
                    const res = await fetch(`${BASE_URL}/api/council-launches/${launchId}`);
                    if (res.ok) {
                        const data = await res.json();
                        if (data.stage === stage) return;
                        // If we've already passed the target stage, stop waiting
                        const stages = ['responding', 'discussing', 'reviewing', 'synthesizing', 'complete'];
                        if (stages.indexOf(data.stage) > stages.indexOf(stage)) return;
                    }
                    await new Promise((r) => setTimeout(r, 500));
                }
                throw new Error(`Timed out waiting for stage '${stage}' on launch ${launchId}`);
            },
        };

        await use(helpers);
    },
});

export { expect };
