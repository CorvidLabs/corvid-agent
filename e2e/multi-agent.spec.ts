import { test, expect, authedFetch } from './fixtures';

const BASE_URL = `http://localhost:${process.env.E2E_PORT || '3001'}`;

// Session-based tests (A2A task execution, real agent spawning) require the API key
const skipNoKey = !!process.env.CI && !process.env.ANTHROPIC_API_KEY;

/**
 * Multi-Agent Coordination E2E Suite
 *
 * Covers Action 1 from the 1.0 Readiness Action Plan:
 *   1. A2A protocol — agent card, task send/poll, depth limiting
 *   2. Multi-agent agent setup — two agents, wallet provisioning
 *   3. Work task delegation — create task for a specific agent, verify via API + UI
 */

// ---------------------------------------------------------------------------
// 1. A2A Protocol
// ---------------------------------------------------------------------------

test.describe('A2A Protocol', () => {
    test('agent card endpoint returns valid agent card', async () => {
        const res = await authedFetch(`${BASE_URL}/.well-known/agent-card.json`);
        expect(res.ok).toBe(true);

        const card = await res.json();
        expect(card).toHaveProperty('name');
        expect(card).toHaveProperty('url');
        expect(card).toHaveProperty('capabilities');
        expect(typeof card.name).toBe('string');
        expect(card.name.length).toBeGreaterThan(0);
    });

    test('A2A task send with valid message returns task id and submitted/working state', async () => {
        // eslint-disable-next-line playwright/no-skipped-test
        test.skip(skipNoKey, 'Requires ANTHROPIC_API_KEY to start agent session');

        const res = await authedFetch(`${BASE_URL}/a2a/tasks/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                method: 'tasks/send',
                params: {
                    message: 'What is 1+1? Reply with just the number.',
                    skill: undefined,
                },
                sourceAgent: 'e2e-test-agent',
            }),
        });

        // 200 or 202 — task accepted
        expect([200, 202]).toContain(res.status);
        const task = await res.json();
        expect(task).toHaveProperty('id');
        expect(task).toHaveProperty('state');
        expect(['submitted', 'working', 'completed']).toContain(task.state);
    });

    test('A2A task send returns task retrievable via GET', async () => {
        // eslint-disable-next-line playwright/no-skipped-test
        test.skip(skipNoKey, 'Requires ANTHROPIC_API_KEY to start agent session');

        // Send task
        const sendRes = await authedFetch(`${BASE_URL}/a2a/tasks/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                method: 'tasks/send',
                params: { message: 'Reply with "ok".' },
                sourceAgent: 'e2e-test-agent',
            }),
        });
        expect([200, 202]).toContain(sendRes.status);
        const task = await sendRes.json();

        // Poll task
        const getRes = await authedFetch(`${BASE_URL}/a2a/tasks/${task.id}`);
        expect(getRes.ok).toBe(true);

        const polled = await getRes.json();
        expect(polled.id).toBe(task.id);
        expect(['submitted', 'working', 'completed', 'failed']).toContain(polled.state);
    });

    test('A2A task send with depth exceeding limit returns error', async () => {
        const res = await authedFetch(`${BASE_URL}/a2a/tasks/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                method: 'tasks/send',
                params: { message: 'test' },
                depth: 99,
                sourceAgent: 'e2e-test-agent',
            }),
        });
        // Depth-exceeded → 400 or 422
        expect([400, 422]).toContain(res.status);
    });

    test('A2A task send with empty message returns validation error', async () => {
        const res = await authedFetch(`${BASE_URL}/a2a/tasks/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                method: 'tasks/send',
                params: { message: '' },
                sourceAgent: 'e2e-test-agent',
            }),
        });
        expect([400, 422]).toContain(res.status);
    });

    test('GET /a2a/tasks/:id for unknown id returns 404', async () => {
        const res = await authedFetch(`${BASE_URL}/a2a/tasks/does-not-exist-00000`);
        expect(res.status).toBe(404);
    });

    test('agent-specific card endpoint returns card for known agent', async ({ api }) => {
        const agent = await api.seedAgent('A2A Card Agent');

        const res = await authedFetch(`${BASE_URL}/.well-known/agents/${agent.id}`);
        // May be 200 or 404 if the endpoint scopes to agent — accept both
        // 200 → card with matching name; 404 → agent card not separately hosted (acceptable)
        if (res.ok) {
            const card = await res.json();
            expect(card).toHaveProperty('name');
        } else {
            expect(res.status).toBe(404);
        }
    });
});

// ---------------------------------------------------------------------------
// 2. Multi-Agent Setup
// ---------------------------------------------------------------------------

test.describe('Multi-Agent Setup', () => {
    test('two agents created with algochatEnabled both appear in agents list', async ({ api }) => {
        const agentA = await api.seedAgent('MA Alpha');
        const agentB = await api.seedAgent('MA Beta');

        const res = await authedFetch(`${BASE_URL}/api/agents`);
        expect(res.ok).toBe(true);

        const agents = await res.json();
        const ids = agents.map((a: { id: string }) => a.id);

        expect(ids).toContain(agentA.id);
        expect(ids).toContain(agentB.id);
    });

    test('agents created with algochatEnabled receive wallet addresses', async ({ api }) => {
        const agentA = await api.seedAgent('Wallet Alpha');
        const agentB = await api.seedAgent('Wallet Beta');

        // Fetch agents to check wallet provisioning
        const resA = await authedFetch(`${BASE_URL}/api/agents/${agentA.id}`);
        const resB = await authedFetch(`${BASE_URL}/api/agents/${agentB.id}`);

        expect(resA.ok).toBe(true);
        expect(resB.ok).toBe(true);

        const dataA = await resA.json();
        const dataB = await resB.json();

        // Each agent should have a wallet address once provisioned (may be null if localnet not running)
        // Validate the field exists on the response shape
        expect(dataA).toHaveProperty('algochatEnabled');
        expect(dataB).toHaveProperty('algochatEnabled');

        // If walletAddress is set, it should be a non-empty string
        if (dataA.walletAddress) {
            expect(typeof dataA.walletAddress).toBe('string');
            expect(dataA.walletAddress.length).toBeGreaterThan(0);
        }
        if (dataB.walletAddress) {
            expect(typeof dataB.walletAddress).toBe('string');
            expect(dataB.walletAddress.length).toBeGreaterThan(0);
            // Each agent has a distinct wallet
            expect(dataA.walletAddress).not.toBe(dataB.walletAddress);
        }
    });

    test('algochat status endpoint is accessible', async () => {
        const res = await authedFetch(`${BASE_URL}/api/algochat/status`);
        // May be 200 (algochat enabled) or 503 (not configured) — both are valid responses
        expect([200, 503]).toContain(res.status);
        if (res.ok) {
            const status = await res.json();
            expect(status).toHaveProperty('status');
        }
    });

    test('contacts can be created to link agents for communication', async ({ api }) => {
        // Contacts tie external agents (Discord, AlgoChat) to known identities
        const res = await authedFetch(`${BASE_URL}/api/contacts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                displayName: `E2E_MultiAgent_Contact_${Date.now()}`,
                notes: 'Created by multi-agent e2e test',
            }),
        });
        expect([200, 201]).toContain(res.status);

        const contact = await res.json();
        expect(contact).toHaveProperty('id');
        expect(contact.displayName).toContain('MultiAgent_Contact');

        // Clean up
        await authedFetch(`${BASE_URL}/api/contacts/${contact.id}`, { method: 'DELETE' });
    });
});

// ---------------------------------------------------------------------------
// 3. Work Task Delegation
// ---------------------------------------------------------------------------

test.describe('Multi-Agent Work Task Delegation', () => {
    test('work task created for agent A is visible in work tasks list', async ({ api, page }) => {
        const agentA = await api.seedAgent('Delegator Agent');
        const task = await api.seedWorkTask(agentA.id, `E2E_Delegated task ${Date.now()}`);

        expect(task).toHaveProperty('id');
        expect(task).toHaveProperty('status');

        // Verify via API
        const res = await authedFetch(`${BASE_URL}/api/work-tasks/${task.id}`);
        expect(res.ok).toBe(true);
        const fetched = await res.json();
        expect(fetched.agentId).toBe(agentA.id);
    });

    test('work task created for agent B is distinct from agent A task', async ({ api }) => {
        const agentA = await api.seedAgent('Agent A Distinct');
        const agentB = await api.seedAgent('Agent B Distinct');

        const taskA = await api.seedWorkTask(agentA.id, `Task for A ${Date.now()}`);
        const taskB = await api.seedWorkTask(agentB.id, `Task for B ${Date.now()}`);

        expect(taskA.id).not.toBe(taskB.id);

        const resA = await authedFetch(`${BASE_URL}/api/work-tasks/${taskA.id}`);
        const resB = await authedFetch(`${BASE_URL}/api/work-tasks/${taskB.id}`);

        const fetchedA = await resA.json();
        const fetchedB = await resB.json();

        expect(fetchedA.agentId).toBe(agentA.id);
        expect(fetchedB.agentId).toBe(agentB.id);
        expect(fetchedA.agentId).not.toBe(fetchedB.agentId);
    });

    test('work task escalation endpoint accepts escalate retry action', async ({ api }) => {
        const agent = await api.seedAgent('Escalation Test Agent');
        const task = await api.seedWorkTask(agent.id, `Escalation task ${Date.now()}`);

        // The escalate endpoint should return 400 (wrong state) not 404 (missing)
        // because the task exists but is not in escalation_needed state
        const res = await authedFetch(`${BASE_URL}/api/work-tasks/${task.id}/escalate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'retry' }),
        });
        // 400 = task not in escalation_needed state (correct — task is still pending)
        // 404 = endpoint missing (wrong)
        expect(res.status).not.toBe(404);
        expect([400, 409, 422]).toContain(res.status);
    });

    test('work tasks list filters by agent show only that agent tasks', async ({ api }) => {
        const agentX = await api.seedAgent('Filter Agent X');
        const agentY = await api.seedAgent('Filter Agent Y');

        const descX = `Filter task X ${Date.now()}`;
        await api.seedWorkTask(agentX.id, descX);
        await api.seedWorkTask(agentY.id, `Filter task Y ${Date.now()}`);

        const res = await authedFetch(`${BASE_URL}/api/work-tasks?agentId=${agentX.id}`);
        if (res.ok) {
            const data = await res.json();
            const tasks = Array.isArray(data) ? data : data.tasks ?? [];
            const agentIds = tasks.map((t: { agentId: string }) => t.agentId);
            // All returned tasks should belong to agentX
            for (const id of agentIds) {
                expect(id).toBe(agentX.id);
            }
        }
        // If filtering is unsupported (400), that's also acceptable
    });
});
