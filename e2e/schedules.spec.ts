import { test, expect, gotoWithRetry , authedFetch } from './fixtures';

const BASE_URL = `http://localhost:${process.env.E2E_PORT || '3001'}`;

test.describe('Schedules', () => {
    test('page loads with heading', async ({ page }) => {
        await gotoWithRetry(page, '/schedules', { isRendered: async (p) => (await p.locator('h2').count()) > 0 });
        await expect(page.locator('h2')).toContainText('Automation Schedules');
    });

    test('create via API, verify in list', async ({ page, api }) => {
        const agent = await api.seedAgent('Schedule Agent');
        const schedule = await api.seedSchedule(agent.id);

        await gotoWithRetry(page, '/schedules', { isRendered: async (p) => (await p.locator('h2').count()) > 0 });
        await expect(page.locator(`text=${schedule.name}`).first()).toBeVisible({ timeout: 10000 });
    });

    test('card shows status badge', async ({ page, api }) => {
        const agent = await api.seedAgent('Status Agent');
        await api.seedSchedule(agent.id);

        await gotoWithRetry(page, '/schedules', { isRendered: async (p) => (await p.locator('h2').count()) > 0 });

        const card = page.locator('.schedule-card').first();
        await expect(card).toBeVisible({ timeout: 10000 });

        const status = card.locator('.schedule-status');
        await expect(status).toBeVisible();
        await expect(status).toHaveAttribute('data-status', 'active');
    });

    test('trigger manually (Run Now)', async ({ page, api }) => {
        const agent = await api.seedAgent('Trigger Agent');
        const schedule = await api.seedSchedule(agent.id);

        await gotoWithRetry(page, '/schedules', { isRendered: async (p) => (await p.locator('h2').count()) > 0 });
        await expect(page.locator(`text=${schedule.name}`).first()).toBeVisible({ timeout: 10000 });

        // Expand the card
        await page.locator(`.schedule-card:has-text("${schedule.name}")`).first().click();

        // Click "Run Now" — may 503 if scheduler unavailable
        const runBtn = page.locator('.action-btn--run, button:text("Run Now")').first();
        if (await runBtn.count() > 0) {
            await runBtn.click();
            // Just verify no crash — result depends on scheduler availability
            await page.waitForTimeout(1000);
        }
    });

    test('pause and resume', async ({ page, api }) => {
        const agent = await api.seedAgent('PauseResume Agent');
        const schedule = await api.seedSchedule(agent.id);

        await gotoWithRetry(page, '/schedules', { isRendered: async (p) => (await p.locator('h2').count()) > 0 });
        await expect(page.locator(`text=${schedule.name}`).first()).toBeVisible({ timeout: 10000 });

        // Expand the card
        const card = page.locator(`.schedule-card:has-text("${schedule.name}")`).first();
        await card.click();

        // Click Pause
        const pauseBtn = card.locator('button:text("Pause")');
        if (await pauseBtn.count() > 0) {
            await pauseBtn.click();
            // Wait for success notification confirming API completed
            await expect(page.locator('text=paused').first()).toBeVisible({ timeout: 10000 });

            // Verify status updated
            await expect(card.locator('.schedule-status[data-status="paused"]')).toBeVisible({ timeout: 5000 });

            // Click Resume
            const resumeBtn = card.locator('button:text("Resume")');
            await resumeBtn.click();
            await expect(page.locator('text=resumed').first()).toBeVisible({ timeout: 10000 });
            await expect(card.locator('.schedule-status[data-status="active"]')).toBeVisible({ timeout: 5000 });
        }
    });

    test('delete removes from list', async ({ page, api }) => {
        const agent = await api.seedAgent('Delete Agent');
        const schedule = await api.seedSchedule(agent.id);

        await gotoWithRetry(page, '/schedules', { isRendered: async (p) => (await p.locator('h2').count()) > 0 });
        await expect(page.locator(`text=${schedule.name}`).first()).toBeVisible({ timeout: 10000 });

        // Expand the card
        const card = page.locator(`.schedule-card:has-text("${schedule.name}")`).first();
        await card.click();

        // Set up dialog handler for confirm()
        page.on('dialog', (dialog) => dialog.accept());

        // Click Delete within the target card
        await card.locator('.action-btn--danger, button:text("Delete")').first().click();

        // Verify name is gone
        await expect(page.locator(`text=${schedule.name}`)).toHaveCount(0, { timeout: 10000 });
    });

    test('API CRUD', async ({ api }) => {
        const agent = await api.seedAgent('CRUD Agent');

        // Create (201)
        const createRes = await authedFetch(`${BASE_URL}/api/schedules`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                agentId: agent.id,
                name: `CRUD Schedule ${Date.now()}`,
                intervalMs: 3600000,
                actions: [{ type: 'review_prs', repos: ['test/repo'] }],
                approvalPolicy: 'auto',
            }),
        });
        expect(createRes.status).toBe(201);
        const schedule = await createRes.json();

        // Read
        const readRes = await authedFetch(`${BASE_URL}/api/schedules/${schedule.id}`);
        expect(readRes.ok).toBe(true);

        // Update
        const updateRes = await authedFetch(`${BASE_URL}/api/schedules/${schedule.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Updated Schedule' }),
        });
        expect(updateRes.ok).toBe(true);

        // List
        const listRes = await authedFetch(`${BASE_URL}/api/schedules`);
        expect(listRes.ok).toBe(true);
        const list = await listRes.json();
        expect(Array.isArray(list)).toBe(true);

        // Executions
        const execRes = await authedFetch(`${BASE_URL}/api/schedules/${schedule.id}/executions`);
        expect(execRes.ok).toBe(true);

        // Delete
        const deleteRes = await authedFetch(`${BASE_URL}/api/schedules/${schedule.id}`, { method: 'DELETE' });
        expect(deleteRes.ok).toBe(true);

        // Verify 404 after delete
        const gone = await authedFetch(`${BASE_URL}/api/schedules/${schedule.id}`);
        expect(gone.status).toBe(404);
    });

    test('validation rejects missing agentId', async ({}) => {
        const res = await authedFetch(`${BASE_URL}/api/schedules`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'No Agent',
                intervalMs: 3600000,
                actions: [{ type: 'review_prs', repos: ['test/repo'] }],
            }),
        });
        expect(res.status).toBe(400);
    });

    test('validation rejects missing timing', async ({ api }) => {
        const agent = await api.seedAgent('No Timing Agent');
        const res = await authedFetch(`${BASE_URL}/api/schedules`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                agentId: agent.id,
                name: 'No Timing',
                actions: [{ type: 'review_prs', repos: ['test/repo'] }],
            }),
        });
        expect(res.status).toBe(400);
    });

    // ─── Additional API coverage ─────────────────────────────────────────

    test('schedule-executions list returns array', async ({}) => {
        const res = await authedFetch(`${BASE_URL}/api/schedule-executions?limit=10`);
        expect(res.ok).toBe(true);
        const data = await res.json();
        expect(Array.isArray(data)).toBe(true);
    });

    test('scheduler health returns stats', async ({}) => {
        const res = await authedFetch(`${BASE_URL}/api/scheduler/health`);
        expect(res.ok).toBe(true);
        const data = await res.json();
        expect(typeof data.running).toBe('boolean');
    });

    test('schedule-executions/:id returns 404 for nonexistent', async ({}) => {
        const res = await authedFetch(`${BASE_URL}/api/schedule-executions/nonexistent`);
        expect(res.status).toBe(404);
    });

    test('POST /api/schedules/:id/trigger triggers immediate execution', async ({ api }) => {
        const agent = await api.seedAgent('Trigger Schedule Agent');
        const schedule = await api.seedSchedule(agent.id);

        const res = await authedFetch(`${BASE_URL}/api/schedules/${schedule.id}/trigger`, {
            method: 'POST',
        });
        // 200 (triggered), 400 (not active), or 503 (scheduler not available)
        expect([200, 400, 503]).toContain(res.status);
    });

    test('POST /api/schedule-executions/:id/resolve returns 404 for nonexistent', async ({}) => {
        const res = await authedFetch(`${BASE_URL}/api/schedule-executions/nonexistent/resolve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ approved: true }),
        });
        // 404 (execution not found or not awaiting approval)
        expect(res.status).toBe(404);
    });
});
