import { test as base, expect } from '@playwright/test';
import { randomBytes } from 'node:crypto';

const BASE_URL = `http://localhost:${process.env.E2E_PORT || '3001'}`;

interface ApiHelpers {
    seedProject(name?: string): Promise<{ id: string; name: string }>;
    seedAgent(name?: string): Promise<{ id: string; name: string }>;
    seedCouncil(agentIds: string[], name?: string, chairmanAgentId?: string): Promise<{ id: string; name: string; agentIds: string[]; chairmanAgentId: string | null }>;
    seedPersona(agentId: string, data?: Record<string, unknown>): Promise<Record<string, unknown>>;
    seedSkillBundle(data?: Record<string, unknown>): Promise<{ id: string; name: string }>;
    seedMarketplaceListing(agentId: string, data?: Record<string, unknown>): Promise<{ id: string; name: string }>;
    seedMcpServer(data?: Record<string, unknown>): Promise<{ id: string; name: string }>;
    seedReputationEvent(agentId: string, eventType?: string, scoreImpact?: number): Promise<{ ok: boolean }>;
    seedWorkTask(agentId: string, description?: string, projectId?: string): Promise<{ id: string; status: string }>;
    seedSchedule(agentId: string, data?: Record<string, unknown>): Promise<{ id: string; name: string; status: string }>;
    seedWorkflow(agentId: string, data?: Record<string, unknown>): Promise<{ id: string; name: string; status: string; nodes: unknown[]; edges: unknown[] }>;
    seedWebhook(agentId: string, data?: Record<string, unknown>): Promise<{ id: string; repo: string; status: string; mentionUsername: string }>;
    seedMentionPolling(agentId: string, data?: Record<string, unknown>): Promise<{ id: string; repo: string; status: string; mentionUsername: string }>;
    seedSession(projectId: string, agentId?: string, data?: Record<string, unknown>): Promise<{ id: string; name: string; status: string }>;
    getSettings(): Promise<{ creditConfig: Record<string, string>; system: { schemaVersion: number; agentCount: number } }>;
    computeScore(agentId: string): Promise<Record<string, unknown>>;
    computeAllScores(): Promise<Record<string, unknown>>;
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
                        name: `E2E Test Bundle ${Date.now()}-${randomBytes(3).toString('hex').slice(0, 4)}`,
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
                const listing = await res.json();

                // Publish the listing so it appears in search results
                const pubRes = await fetchWithRetry(`${BASE_URL}/api/marketplace/listings/${listing.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'published' }),
                });
                if (!pubRes.ok) {
                    const body = await pubRes.text().catch(() => '');
                    throw new Error(`publishListing failed: ${pubRes.status} ${pubRes.statusText} — ${body}`);
                }

                return pubRes.json();
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

            async seedReputationEvent(agentId: string, eventType = 'task_completed', scoreImpact = 5) {
                const res = await fetchWithRetry(`${BASE_URL}/api/reputation/events`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ agentId, eventType, scoreImpact }),
                });
                if (!res.ok) {
                    const body = await res.text().catch(() => '');
                    throw new Error(`seedReputationEvent failed: ${res.status} ${res.statusText} — ${body}`);
                }
                return res.json();
            },

            async seedWorkTask(agentId: string, description = 'E2E work task', projectId?: string) {
                // Work tasks require a projectId; create one if not provided
                let pid = projectId;
                if (!pid) {
                    const projRes = await fetchWithRetry(`${BASE_URL}/api/projects`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: `WT Project ${Date.now()}`, workingDir: '/tmp' }),
                    });
                    if (projRes.ok) {
                        const proj = await projRes.json();
                        pid = proj.id;
                    }
                }
                const res = await fetchWithRetry(`${BASE_URL}/api/work-tasks`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ agentId, description, projectId: pid }),
                });
                if (!res.ok) {
                    const body = await res.text().catch(() => '');
                    throw new Error(`seedWorkTask failed: ${res.status} ${res.statusText} — ${body}`);
                }
                return res.json();
            },

            async seedSchedule(agentId: string, data: Record<string, unknown> = {}) {
                const res = await fetchWithRetry(`${BASE_URL}/api/schedules`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        agentId,
                        name: `E2E Schedule ${Date.now()}-${randomBytes(3).toString('hex').slice(0, 4)}`,
                        intervalMs: 3600000,
                        actions: [{ type: 'review_prs', repos: ['test/repo'] }],
                        approvalPolicy: 'auto',
                        ...data,
                    }),
                });
                if (!res.ok) {
                    const body = await res.text().catch(() => '');
                    throw new Error(`seedSchedule failed: ${res.status} ${res.statusText} — ${body}`);
                }
                return res.json();
            },

            async seedWorkflow(agentId: string, data: Record<string, unknown> = {}) {
                const res = await fetchWithRetry(`${BASE_URL}/api/workflows`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        agentId,
                        name: `E2E Workflow ${Date.now()}-${randomBytes(3).toString('hex').slice(0, 4)}`,
                        nodes: [
                            { id: 'start', type: 'start', label: 'Start' },
                            { id: 'agent', type: 'agent_session', label: 'Agent Session', config: { prompt: 'test' } },
                            { id: 'end', type: 'end', label: 'End' },
                        ],
                        edges: [
                            { id: 'e1', sourceNodeId: 'start', targetNodeId: 'agent' },
                            { id: 'e2', sourceNodeId: 'agent', targetNodeId: 'end' },
                        ],
                        maxConcurrency: 1,
                        ...data,
                    }),
                });
                if (!res.ok) {
                    const body = await res.text().catch(() => '');
                    throw new Error(`seedWorkflow failed: ${res.status} ${res.statusText} — ${body}`);
                }
                return res.json();
            },

            async seedWebhook(agentId: string, data: Record<string, unknown> = {}) {
                // Webhook registrations require a projectId
                let projectId = data.projectId as string | undefined;
                if (!projectId) {
                    const projRes = await fetchWithRetry(`${BASE_URL}/api/projects`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: `WH Project ${Date.now()}`, workingDir: '/tmp' }),
                    });
                    if (projRes.ok) {
                        const proj = await projRes.json();
                        projectId = proj.id;
                    }
                }
                const res = await fetchWithRetry(`${BASE_URL}/api/webhooks`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        agentId,
                        repo: `e2e-org/repo-${Date.now()}`,
                        mentionUsername: `e2e-bot-${randomBytes(3).toString('hex').slice(0, 4)}`,
                        events: ['issue_comment', 'pull_request_review_comment'],
                        projectId,
                        ...data,
                    }),
                });
                if (!res.ok) {
                    const body = await res.text().catch(() => '');
                    throw new Error(`seedWebhook failed: ${res.status} ${res.statusText} — ${body}`);
                }
                return res.json();
            },

            async seedMentionPolling(agentId: string, data: Record<string, unknown> = {}) {
                // Mention polling requires a projectId
                let projectId = data.projectId as string | undefined;
                if (!projectId) {
                    const projRes = await fetchWithRetry(`${BASE_URL}/api/projects`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: `MP Project ${Date.now()}`, workingDir: '/tmp' }),
                    });
                    if (projRes.ok) {
                        const proj = await projRes.json();
                        projectId = proj.id;
                    }
                }
                const res = await fetchWithRetry(`${BASE_URL}/api/mention-polling`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        agentId,
                        projectId,
                        repo: `e2e-org/poll-${Date.now()}`,
                        mentionUsername: `e2e-poll-${randomBytes(3).toString('hex').slice(0, 4)}`,
                        intervalSeconds: 300,
                        eventFilter: ['issue_comment', 'pull_request_review_comment'],
                        ...data,
                    }),
                });
                if (!res.ok) {
                    const body = await res.text().catch(() => '');
                    throw new Error(`seedMentionPolling failed: ${res.status} ${res.statusText} — ${body}`);
                }
                return res.json();
            },

            async seedSession(projectId: string, agentId?: string, data: Record<string, unknown> = {}) {
                const res = await fetchWithRetry(`${BASE_URL}/api/sessions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        projectId,
                        agentId,
                        name: `E2E Session ${Date.now()}-${randomBytes(3).toString('hex').slice(0, 4)}`,
                        ...data,
                    }),
                });
                if (!res.ok) {
                    const body = await res.text().catch(() => '');
                    throw new Error(`seedSession failed: ${res.status} ${res.statusText} — ${body}`);
                }
                return res.json();
            },

            async getSettings() {
                const res = await fetchWithRetry(`${BASE_URL}/api/settings`, {
                    method: 'GET',
                });
                if (!res.ok) {
                    const body = await res.text().catch(() => '');
                    throw new Error(`getSettings failed: ${res.status} ${res.statusText} — ${body}`);
                }
                return res.json();
            },

            async computeScore(agentId: string) {
                const res = await fetchWithRetry(`${BASE_URL}/api/reputation/scores/${agentId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                });
                if (!res.ok) {
                    const body = await res.text().catch(() => '');
                    throw new Error(`computeScore failed: ${res.status} ${res.statusText} — ${body}`);
                }
                return res.json();
            },

            async computeAllScores() {
                const res = await fetchWithRetry(`${BASE_URL}/api/reputation/scores`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                });
                if (!res.ok) {
                    const body = await res.text().catch(() => '');
                    throw new Error(`computeAllScores failed: ${res.status} ${res.statusText} — ${body}`);
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
