import { test, expect, gotoWithRetry , authedFetch } from './fixtures';

const BASE_URL = `http://localhost:${process.env.E2E_PORT || '3001'}`;

test.describe('Webhooks', () => {
    test('page loads with heading', async ({ page }) => {
        await gotoWithRetry(page, '/webhooks', { isRendered: async (p) => (await p.locator('h2').count()) > 0 });
        await expect(page.locator('h2')).toContainText('GitHub Webhooks');
    });

    test('create via API, verify in list', async ({ page, api }) => {
        const agent = await api.seedAgent('Webhook Agent');
        const webhook = await api.seedWebhook(agent.id);

        await gotoWithRetry(page, '/webhooks', { isRendered: async (p) => (await p.locator('h2').count()) > 0 });
        await expect(page.locator(`text=${webhook.repo}`).first()).toBeVisible({ timeout: 10000 });
    });

    test('card shows status badge', async ({ page, api }) => {
        const agent = await api.seedAgent('WH Status Agent');
        await api.seedWebhook(agent.id);

        await gotoWithRetry(page, '/webhooks', { isRendered: async (p) => (await p.locator('h2').count()) > 0 });

        const card = page.locator('.reg-card').first();
        await expect(card).toBeVisible({ timeout: 10000 });

        const status = card.locator('.reg-status');
        await expect(status).toBeVisible();
        await expect(status).toHaveAttribute('data-status', 'active');
    });

    test('filter buttons toggle active state', async ({ page, api }) => {
        const agent = await api.seedAgent('WH Filter Agent');
        await api.seedWebhook(agent.id);

        await gotoWithRetry(page, '/webhooks', { isRendered: async (p) => (await p.locator('h2').count()) > 0 });

        const filterBtns = page.locator('.filter-btn');
        expect(await filterBtns.count()).toBeGreaterThanOrEqual(2);

        // First button (All) should be active by default
        await expect(filterBtns.first()).toHaveClass(/filter-btn--active/);

        // Click a different filter
        const secondBtn = filterBtns.nth(1);
        await secondBtn.click();
        await expect(secondBtn).toHaveClass(/filter-btn--active/);
    });

    test('card expands to show event tags and deliveries', async ({ page, api }) => {
        const agent = await api.seedAgent('WH Expand Agent');
        const webhook = await api.seedWebhook(agent.id);

        await gotoWithRetry(page, '/webhooks', { isRendered: async (p) => (await p.locator('h2').count()) > 0 });
        await expect(page.locator(`text=${webhook.repo}`).first()).toBeVisible({ timeout: 10000 });

        // Click to expand
        const card = page.locator(`.reg-card:has-text("${webhook.repo}")`).first();
        await card.locator('.reg-card__header').click();

        // Should show event tags
        await expect(card.locator('.event-tag').first()).toBeVisible({ timeout: 5000 });

        // Should show deliveries section
        await expect(card.locator('.reg-deliveries').first()).toBeVisible({ timeout: 5000 });
    });

    test('new webhook form toggle', async ({ page, api }) => {
        await api.seedAgent('WH Form Agent');
        await gotoWithRetry(page, '/webhooks', { isRendered: async (p) => (await p.locator('h2').count()) > 0 });

        // Click "+ New Webhook" button
        const newBtn = page.locator('button:text("New Webhook")');
        await expect(newBtn).toBeVisible({ timeout: 10000 });
        await newBtn.click();
        await expect(page.locator('.create-form')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('.form-select').first()).toBeVisible();

        // Cancel hides form
        await page.locator('button:text("Cancel")').first().click();
        await expect(page.locator('.create-form')).not.toBeVisible({ timeout: 5000 });
    });

    test('delete removes from list', async ({ page, api }) => {
        const agent = await api.seedAgent('WH Delete Agent');
        const webhook = await api.seedWebhook(agent.id);

        await gotoWithRetry(page, '/webhooks', { isRendered: async (p) => (await p.locator('h2').count()) > 0 });
        await expect(page.locator(`text=${webhook.repo}`).first()).toBeVisible({ timeout: 10000 });

        // Expand the card
        const card = page.locator(`.reg-card:has-text("${webhook.repo}")`).first();
        await card.locator('.reg-card__header').click();

        // Handle the confirm() dialog
        page.on('dialog', (dialog) => dialog.accept());

        // Click Delete
        const deleteBtn = card.locator('.action-btn--danger').first();
        await expect(deleteBtn).toBeVisible({ timeout: 5000 });
        await deleteBtn.click();

        // Wait for deletion to process via reactive signal update
        await expect(page.locator(`text=${webhook.repo}`)).toHaveCount(0, { timeout: 10000 });
    });

    test('API CRUD', async ({ api }) => {
        const agent = await api.seedAgent('WH CRUD Agent');
        const project = await api.seedProject('WH CRUD Project');

        // Create (201)
        const createRes = await authedFetch(`${BASE_URL}/api/webhooks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                agentId: agent.id,
                repo: `crud-org/repo-${Date.now()}`,
                mentionUsername: 'crud-bot',
                events: ['issue_comment'],
                projectId: project.id,
            }),
        });
        expect(createRes.status).toBe(201);
        const webhook = await createRes.json();
        expect(webhook.status).toBe('active');

        // Read
        const readRes = await authedFetch(`${BASE_URL}/api/webhooks/${webhook.id}`);
        expect(readRes.ok).toBe(true);

        // Update (pause)
        const updateRes = await authedFetch(`${BASE_URL}/api/webhooks/${webhook.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'paused' }),
        });
        expect(updateRes.ok).toBe(true);
        const updated = await updateRes.json();
        expect(updated.status).toBe('paused');

        // List
        const listRes = await authedFetch(`${BASE_URL}/api/webhooks`);
        expect(listRes.ok).toBe(true);
        const list = await listRes.json();
        expect(list.registrations).toBeDefined();

        // Deliveries
        const delRes = await authedFetch(`${BASE_URL}/api/webhooks/${webhook.id}/deliveries`);
        expect(delRes.ok).toBe(true);
        const deliveries = await delRes.json();
        expect(deliveries.deliveries).toBeDefined();

        // All deliveries
        const allDelRes = await authedFetch(`${BASE_URL}/api/webhooks/deliveries`);
        expect(allDelRes.ok).toBe(true);

        // Delete
        const deleteRes = await authedFetch(`${BASE_URL}/api/webhooks/${webhook.id}`, { method: 'DELETE' });
        expect(deleteRes.ok).toBe(true);

        // Verify 404
        const gone = await authedFetch(`${BASE_URL}/api/webhooks/${webhook.id}`);
        expect(gone.status).toBe(404);
    });

    test('validation rejects missing fields', async ({ api }) => {
        const agent = await api.seedAgent('WH Validation Agent');

        // Missing repo
        const res1 = await authedFetch(`${BASE_URL}/api/webhooks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                agentId: agent.id,
                mentionUsername: 'bot',
                events: ['issue_comment'],
            }),
        });
        expect(res1.status).toBe(400);

        // Missing agentId
        const res2 = await authedFetch(`${BASE_URL}/api/webhooks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                repo: 'org/repo',
                mentionUsername: 'bot',
                events: ['issue_comment'],
            }),
        });
        expect(res2.status).toBe(400);
    });
});
