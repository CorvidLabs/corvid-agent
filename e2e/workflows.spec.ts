import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

const BASE_URL = `http://localhost:${process.env.E2E_PORT || '3001'}`;

/** Navigate to a page, retrying on 429 rate-limit responses or empty lazy-load. */
async function gotoWithRetry(page: Page, path: string, maxRetries = 3): Promise<void> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');

        const body = await page.locator('body').textContent() ?? '';
        const rateLimited = body.includes('Too many requests');
        const rendered = await page.locator('h1:text("Workflows")').count() > 0;

        if (!rateLimited && rendered) return;

        if (attempt < maxRetries) {
            const match = body.match(/"retryAfter"\s*:\s*(\d+)/);
            const wait = Math.min(Math.max(Number(match?.[1] ?? 5), 3), 10);
            await page.waitForTimeout(wait * 1000 + 500);
        }
    }
}

test.describe('Workflows', () => {
    test('page loads with heading', async ({ page }) => {
        await gotoWithRetry(page, '/workflows');
        await expect(page.locator('h1:text("Workflows")')).toBeVisible();
    });

    test('create via API, verify in list', async ({ page, api }) => {
        const agent = await api.seedAgent('Workflow Agent');
        const workflow = await api.seedWorkflow(agent.id);

        await gotoWithRetry(page, '/workflows');
        await expect(page.locator(`text=${workflow.name}`).first()).toBeVisible({ timeout: 10000 });
    });

    test('card shows node chips when expanded', async ({ page, api }) => {
        const agent = await api.seedAgent('NodeChip Agent');
        const workflow = await api.seedWorkflow(agent.id);

        await gotoWithRetry(page, '/workflows');
        await expect(page.locator(`text=${workflow.name}`).first()).toBeVisible({ timeout: 10000 });

        // Click to expand
        await page.locator(`.workflow-card:has-text("${workflow.name}")`).first().click();

        await expect(page.locator('.flow-viz').first()).toBeVisible({ timeout: 5000 });
        const chips = page.locator('.node-chip');
        expect(await chips.count()).toBeGreaterThanOrEqual(3);
    });

    test('edit name via API, verify update', async ({ page, api }) => {
        const agent = await api.seedAgent('EditName Agent');
        const workflow = await api.seedWorkflow(agent.id);
        const newName = `Updated Workflow ${Date.now()}`;

        // Update via API
        const res = await fetch(`${BASE_URL}/api/workflows/${workflow.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName }),
        });
        expect(res.ok).toBe(true);

        await gotoWithRetry(page, '/workflows');
        await expect(page.locator(`text=${newName}`).first()).toBeVisible({ timeout: 10000 });
    });

    test('trigger via API creates a run', async ({ api }) => {
        const agent = await api.seedAgent('Trigger Agent');
        const project = await api.seedProject('Trigger Project');
        const workflow = await api.seedWorkflow(agent.id);

        // Activate the workflow first
        const activateRes = await fetch(`${BASE_URL}/api/workflows/${workflow.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'active' }),
        });
        expect(activateRes.ok).toBe(true);

        // Trigger — may 503 if workflow service unavailable
        const triggerRes = await fetch(`${BASE_URL}/api/workflows/${workflow.id}/trigger`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId: project.id }),
        });
        expect([201, 503]).toContain(triggerRes.status);
    });

    test('delete removes from list', async ({ page, api }) => {
        const agent = await api.seedAgent('Delete Agent');
        const workflow = await api.seedWorkflow(agent.id);

        await gotoWithRetry(page, '/workflows');
        await expect(page.locator(`text=${workflow.name}`).first()).toBeVisible({ timeout: 10000 });

        // Expand the card
        const card = page.locator(`.workflow-card:has-text("${workflow.name}")`).first();
        await card.click();

        // Click Delete scoped to this card (no confirm dialog for workflows)
        const deleteBtn = card.locator('.btn-danger, button:text("Delete")').first();
        await expect(deleteBtn).toBeVisible({ timeout: 5000 });
        await deleteBtn.click();

        // Verify name is gone
        await expect(page.locator(`text=${workflow.name}`)).toHaveCount(0, { timeout: 10000 });
    });

    test('API CRUD', async ({ api }) => {
        const agent = await api.seedAgent('CRUD Agent');

        // Create (201, status=draft)
        const createRes = await fetch(`${BASE_URL}/api/workflows`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                agentId: agent.id,
                name: `CRUD Workflow ${Date.now()}`,
                nodes: [
                    { id: 'start', type: 'start', label: 'Start' },
                    { id: 'agent', type: 'agent_session', label: 'Agent', config: { prompt: 'test' } },
                    { id: 'end', type: 'end', label: 'End' },
                ],
                edges: [
                    { id: 'e1', sourceNodeId: 'start', targetNodeId: 'agent' },
                    { id: 'e2', sourceNodeId: 'agent', targetNodeId: 'end' },
                ],
                maxConcurrency: 1,
            }),
        });
        expect(createRes.status).toBe(201);
        const workflow = await createRes.json();
        expect(workflow.status).toBe('draft');

        // Read
        const readRes = await fetch(`${BASE_URL}/api/workflows/${workflow.id}`);
        expect(readRes.ok).toBe(true);

        // Update
        const updateRes = await fetch(`${BASE_URL}/api/workflows/${workflow.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Updated' }),
        });
        expect(updateRes.ok).toBe(true);

        // List
        const listRes = await fetch(`${BASE_URL}/api/workflows`);
        expect(listRes.ok).toBe(true);

        // Runs
        const runsRes = await fetch(`${BASE_URL}/api/workflows/${workflow.id}/runs`);
        expect(runsRes.ok).toBe(true);

        // Delete
        const deleteRes = await fetch(`${BASE_URL}/api/workflows/${workflow.id}`, { method: 'DELETE' });
        expect(deleteRes.ok).toBe(true);

        // Verify 404
        const gone = await fetch(`${BASE_URL}/api/workflows/${workflow.id}`);
        expect(gone.status).toBe(404);
    });

    test('validation rejects missing start node', async ({ api }) => {
        const agent = await api.seedAgent('NoStart Agent');
        const res = await fetch(`${BASE_URL}/api/workflows`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                agentId: agent.id,
                name: 'No Start',
                nodes: [{ id: 'end', type: 'end', label: 'End' }],
                edges: [],
                maxConcurrency: 1,
            }),
        });
        expect(res.status).toBe(400);
    });

    test('card shows correct status badge', async ({ page, api }) => {
        const agent = await api.seedAgent('StatusBadge Agent');
        await api.seedWorkflow(agent.id);

        await gotoWithRetry(page, '/workflows');

        const card = page.locator('.workflow-card').first();
        await expect(card).toBeVisible({ timeout: 10000 });
        const badge = card.locator('.status-badge');
        await expect(badge).toBeVisible();
        await expect(badge).toContainText('draft');
        await expect(badge).toHaveClass(/status-draft/);
    });

    // ─── Additional API coverage ─────────────────────────────────────────

    test('workflow-runs list returns array', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/workflow-runs?limit=10`);
        expect(res.ok).toBe(true);
        const data = await res.json();
        expect(Array.isArray(data)).toBe(true);
    });

    test('workflow health is shadowed by :id route', async ({}) => {
        // /api/workflows/health is unreachable because /api/workflows/:id matches first
        const res = await fetch(`${BASE_URL}/api/workflows/health`);
        // Returns 404 because getWorkflow(db, "health") returns null
        expect(res.status).toBe(404);
    });

    test('workflow-runs/:id returns 404 for nonexistent', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/workflow-runs/nonexistent`);
        expect(res.status).toBe(404);
    });

    test('POST /api/workflow-runs/:id/action rejects nonexistent run', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/workflow-runs/nonexistent/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'cancel' }),
        });
        // 400 (run not found/not running), or 503 (workflow service unavailable)
        expect([400, 503]).toContain(res.status);
    });

    test('GET /api/workflow-runs/:id/nodes returns array for nonexistent run', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/workflow-runs/nonexistent/nodes`);
        expect(res.ok).toBe(true);
        const data = await res.json();
        // Returns empty array for nonexistent run (no 404 check in handler)
        expect(Array.isArray(data)).toBe(true);
    });
});
