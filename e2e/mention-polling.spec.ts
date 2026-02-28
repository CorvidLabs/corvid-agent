import { test, expect, gotoWithRetry , authedFetch } from './fixtures';

const BASE_URL = `http://localhost:${process.env.E2E_PORT || '3001'}`;

test.describe('Mention Polling', () => {
    test('page loads with heading', async ({ page }) => {
        await gotoWithRetry(page, '/mention-polling', { isRendered: async (p) => (await p.locator('h2').count()) > 0 });
        await expect(page.locator('h2')).toContainText('GitHub Mention Polling');
    });

    test('stats banner shows service stats', async ({ page }) => {
        await gotoWithRetry(page, '/mention-polling', { isRendered: async (p) => (await p.locator('h2').count()) > 0 });

        const banner = page.locator('.stats-banner');
        await expect(banner).toBeVisible({ timeout: 10000 });

        const statItems = banner.locator('.stat-item');
        expect(await statItems.count()).toBeGreaterThanOrEqual(2);
    });

    test('create via API, verify in list', async ({ page, api }) => {
        const agent = await api.seedAgent('MP List Agent');
        const config = await api.seedMentionPolling(agent.id);

        await gotoWithRetry(page, '/mention-polling', { isRendered: async (p) => (await p.locator('h2').count()) > 0 });
        await expect(page.locator(`text=${config.repo}`).first()).toBeVisible({ timeout: 10000 });
    });

    test('card shows status badge', async ({ page, api }) => {
        const agent = await api.seedAgent('MP Status Agent');
        await api.seedMentionPolling(agent.id);

        await gotoWithRetry(page, '/mention-polling', { isRendered: async (p) => (await p.locator('h2').count()) > 0 });

        const card = page.locator('.config-card').first();
        await expect(card).toBeVisible({ timeout: 10000 });

        const status = card.locator('.config-status');
        await expect(status).toBeVisible();
        await expect(status).toHaveAttribute('data-status', 'active');
    });

    test('filter buttons toggle active state', async ({ page, api }) => {
        const agent = await api.seedAgent('MP Filter Agent');
        await api.seedMentionPolling(agent.id);

        await gotoWithRetry(page, '/mention-polling', { isRendered: async (p) => (await p.locator('h2').count()) > 0 });

        const filterBtns = page.locator('.filter-btn');
        expect(await filterBtns.count()).toBeGreaterThanOrEqual(2);

        await expect(filterBtns.first()).toHaveClass(/filter-btn--active/);

        const secondBtn = filterBtns.nth(1);
        await secondBtn.click();
        await expect(secondBtn).toHaveClass(/filter-btn--active/);
    });

    test('new config form toggle', async ({ page, api }) => {
        await api.seedAgent('MP Form Agent');
        await gotoWithRetry(page, '/mention-polling', { isRendered: async (p) => (await p.locator('h2').count()) > 0 });

        const newBtn = page.locator('button:text("New Config")');
        await expect(newBtn).toBeVisible({ timeout: 10000 });
        await newBtn.click();
        await expect(page.locator('.create-form')).toBeVisible({ timeout: 5000 });

        // Cancel hides form
        await page.locator('button:text("Cancel")').first().click();
        await expect(page.locator('.create-form')).not.toBeVisible({ timeout: 5000 });
    });

    test('API CRUD', async ({ api }) => {
        const agent = await api.seedAgent('MP CRUD Agent');
        const project = await api.seedProject('MP CRUD Project');

        // Create
        const createRes = await authedFetch(`${BASE_URL}/api/mention-polling`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                agentId: agent.id,
                projectId: project.id,
                repo: `crud-org/poll-${Date.now()}`,
                mentionUsername: 'crud-poller',
                intervalSeconds: 120,
                eventFilter: ['issue_comment'],
            }),
        });
        expect(createRes.status).toBe(201);
        const config = await createRes.json();
        expect(config.status).toBe('active');

        // Read
        const readRes = await authedFetch(`${BASE_URL}/api/mention-polling/${config.id}`);
        expect(readRes.ok).toBe(true);

        // Stats
        const statsRes = await authedFetch(`${BASE_URL}/api/mention-polling/stats`);
        expect(statsRes.ok).toBe(true);
        const stats = await statsRes.json();
        expect(typeof stats.totalConfigs).toBe('number');

        // Activity
        const actRes = await authedFetch(`${BASE_URL}/api/mention-polling/${config.id}/activity`);
        expect(actRes.ok).toBe(true);

        // Update (pause)
        const updateRes = await authedFetch(`${BASE_URL}/api/mention-polling/${config.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'paused' }),
        });
        expect(updateRes.ok).toBe(true);

        // List
        const listRes = await authedFetch(`${BASE_URL}/api/mention-polling`);
        expect(listRes.ok).toBe(true);

        // Delete
        const deleteRes = await authedFetch(`${BASE_URL}/api/mention-polling/${config.id}`, { method: 'DELETE' });
        expect(deleteRes.ok).toBe(true);

        // Verify gone
        const gone = await authedFetch(`${BASE_URL}/api/mention-polling/${config.id}`);
        expect(gone.status).toBe(404);
    });

    test('validation rejects missing fields', async ({}) => {
        // Missing agentId
        const res1 = await authedFetch(`${BASE_URL}/api/mention-polling`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                repo: 'org/repo',
                mentionUsername: 'bot',
            }),
        });
        expect(res1.status).toBe(400);

        // Missing repo
        const res2 = await authedFetch(`${BASE_URL}/api/mention-polling`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                agentId: 'fake-id',
                mentionUsername: 'bot',
            }),
        });
        expect(res2.status).toBe(400);
    });
});
