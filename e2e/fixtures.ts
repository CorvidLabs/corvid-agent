import { test as base, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

interface ApiHelpers {
    seedProject(name?: string): Promise<{ id: string; name: string }>;
    seedAgent(name?: string): Promise<{ id: string; name: string }>;
    seedCouncil(agentIds: string[], name?: string, chairmanAgentId?: string): Promise<{ id: string; name: string; agentIds: string[]; chairmanAgentId: string | null }>;
    getHealth(): Promise<{ status: string; algochat: boolean }>;
    launchCouncil(councilId: string, projectId: string, prompt: string): Promise<{ launchId: string; sessionIds: string[] }>;
    getLaunch(launchId: string): Promise<{ stage: string; synthesis: string | null; sessionIds: string[]; prompt: string }>;
    waitForStage(launchId: string, stage: string, timeoutMs?: number): Promise<void>;
}

export const test = base.extend<{ api: ApiHelpers }>({
    api: async ({}, use) => {
        const helpers: ApiHelpers = {
            async seedProject(name = 'E2E Test Project') {
                const res = await fetch(`${BASE_URL}/api/projects`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, workingDir: '/tmp' }),
                });
                expect(res.ok).toBe(true);
                return res.json();
            },

            async seedAgent(name = 'E2E Test Agent') {
                const res = await fetch(`${BASE_URL}/api/agents`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name,
                        model: 'claude-sonnet-4-20250514',
                        algochatEnabled: true,
                    }),
                });
                expect(res.ok).toBe(true);
                return res.json();
            },

            async seedCouncil(agentIds: string[], name = 'E2E Test Council', chairmanAgentId?: string) {
                const res = await fetch(`${BASE_URL}/api/councils`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, agentIds, chairmanAgentId }),
                });
                expect(res.ok).toBe(true);
                return res.json();
            },

            async getHealth() {
                const res = await fetch(`${BASE_URL}/api/health`);
                expect(res.ok).toBe(true);
                return res.json();
            },

            async launchCouncil(councilId: string, projectId: string, prompt: string) {
                const res = await fetch(`${BASE_URL}/api/councils/${councilId}/launch`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ projectId, prompt }),
                });
                expect(res.ok).toBe(true);
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
                        const stages = ['responding', 'reviewing', 'synthesizing', 'complete'];
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
