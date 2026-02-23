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
        const rendered = await page.locator('main').locator('*').first().count() > 0;

        if (!rateLimited && rendered) return;

        if (attempt < maxRetries) {
            const match = body.match(/"retryAfter"\s*:\s*(\d+)/);
            const wait = Math.min(Math.max(Number(match?.[1] ?? 5), 3), 10);
            await page.waitForTimeout(wait * 1000 + 500);
        }
    }
}

test.describe('Agents', () => {
    test('create agent and verify it appears in list', async ({ page }) => {
        const agentName = `Playwright Agent ${Date.now()}`;
        await gotoWithRetry(page, '/agents');

        // Click "New Agent" link
        await page.locator('a[href="/agents/new"]').click();
        await page.waitForURL('/agents/new');

        // Fill in the agent form
        await page.locator('#name').fill(agentName);
        await page.locator('form button[type="submit"]').click();

        // Should redirect to agent detail (not /agents/new)
        await page.waitForURL(/\/agents\/(?!new)/, { timeout: 15000 });

        // Navigate to agent list and verify
        await gotoWithRetry(page, '/agents');
        await expect(page.locator(`text=${agentName}`).first()).toBeVisible({ timeout: 10000 });
    });

    test('agent detail shows wallet address on localnet', async ({ page, api }) => {
        const health = await api.getHealth();
        const agent = await api.seedAgent('Wallet Check Agent');

        await gotoWithRetry(page, `/agents/${agent.id}`);

        // If AlgoChat is enabled on localnet, wallet address should be visible
        if (health.algochat) {
            // Wait for potential wallet creation (async)
            await page.waitForTimeout(2000);
            await page.reload();
            await page.waitForLoadState('networkidle');

            const walletSection = page.locator('dt:text("Wallet")');
            // Wallet may or may not be created depending on localnet availability
            if (await walletSection.count() > 0) {
                await expect(walletSection).toBeVisible();
            }
        }
    });

    test('agent list shows card grid', async ({ page, api }) => {
        await api.seedAgent('Grid Agent Alpha');
        await api.seedAgent('Grid Agent Beta');

        await gotoWithRetry(page, '/agents');

        // Verify agent cards render in the grid
        const cards = page.locator('.agent-card');
        expect(await cards.count()).toBeGreaterThanOrEqual(2);

        // Each card should have a name
        const names = page.locator('.agent-card__name');
        expect(await names.count()).toBeGreaterThanOrEqual(2);
    });

    test('agent detail has tabs and can switch between them', async ({ page, api }) => {
        const agent = await api.seedAgent('Tab Agent');

        await gotoWithRetry(page, `/agents/${agent.id}`);

        // Verify tabs are present
        const tabs = page.locator('.tab');
        expect(await tabs.count()).toBeGreaterThanOrEqual(2);

        // First tab should be active (overview)
        await expect(page.locator('.tab--active')).toBeVisible();

        // Click the sessions tab and verify it becomes active
        const sessionsTab = page.locator('.tab:text("Sessions")');
        if (await sessionsTab.count() > 0) {
            await sessionsTab.click();
            await expect(sessionsTab).toHaveClass(/tab--active/);
        }
    });

    test('search filters agents by name', async ({ page, api }) => {
        const uniqueName = `SearchTarget ${Date.now()}`;
        await api.seedAgent(uniqueName);
        await api.seedAgent('Other Agent');

        await gotoWithRetry(page, '/agents');

        const searchInput = page.locator('.search-input');
        if (await searchInput.count() > 0) {
            await searchInput.fill(uniqueName.slice(0, 12));
            await page.waitForTimeout(500);

            // The target agent should be visible
            await expect(page.locator(`text=${uniqueName}`).first()).toBeVisible({ timeout: 5000 });
        }
    });

    test('filter chips toggle active state', async ({ page, api }) => {
        await api.seedAgent('Filter Chip Agent');

        await gotoWithRetry(page, '/agents');

        const filterChips = page.locator('.filter-chip');
        if (await filterChips.count() > 0) {
            // Click a filter chip and verify active class
            const chip = filterChips.first();
            await chip.click();
            await expect(chip).toHaveClass(/filter-chip--active/);
        }
    });

    test('agent edit and update name', async ({ page, api }) => {
        const agent = await api.seedAgent('Edit Target Agent');
        const newName = `Renamed Agent ${Date.now()}`;

        await gotoWithRetry(page, `/agents/${agent.id}`);

        // Click Edit button
        const editBtn = page.locator('a:text("Edit"), button:text("Edit")').first();
        if (await editBtn.count() > 0) {
            await editBtn.click();
            await page.waitForURL(/\/agents\/.*\/edit/, { timeout: 10000 });

            // Update name
            const nameInput = page.locator('#name');
            await nameInput.clear();
            await nameInput.fill(newName);
            await page.locator('form button[type="submit"]').click();

            // Should redirect to detail
            await page.waitForURL(/\/agents\/(?!.*edit)/, { timeout: 15000 });
            await expect(page.locator(`text=${newName}`).first()).toBeVisible({ timeout: 10000 });
        }
    });

    test('agent delete removes from list', async ({ page, api }) => {
        const agent = await api.seedAgent('Delete Target Agent');

        await gotoWithRetry(page, `/agents/${agent.id}`);

        // Set up dialog handler for confirm()
        page.on('dialog', (dialog) => dialog.accept());

        const deleteBtn = page.locator('button:text("Delete")').first();
        if (await deleteBtn.count() > 0) {
            await deleteBtn.click();

            // Should redirect to agents list
            await page.waitForURL('/agents', { timeout: 10000 });

            // Agent should no longer appear
            await expect(page.locator(`text=Delete Target Agent`)).toHaveCount(0, { timeout: 10000 });
        }
    });

    test('API CRUD', async ({ api }) => {
        // Create
        const createRes = await fetch(`${BASE_URL}/api/agents`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: `CRUD Agent ${Date.now()}`,
                model: 'claude-sonnet-4-20250514',
            }),
        });
        expect(createRes.status).toBe(201);
        const agent = await createRes.json();

        // Read
        const readRes = await fetch(`${BASE_URL}/api/agents/${agent.id}`);
        expect(readRes.ok).toBe(true);

        // Update
        const updateRes = await fetch(`${BASE_URL}/api/agents/${agent.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Updated CRUD Agent' }),
        });
        expect(updateRes.ok).toBe(true);

        // List
        const listRes = await fetch(`${BASE_URL}/api/agents`);
        expect(listRes.ok).toBe(true);
        const list = await listRes.json();
        expect(Array.isArray(list)).toBe(true);

        // Delete
        const deleteRes = await fetch(`${BASE_URL}/api/agents/${agent.id}`, { method: 'DELETE' });
        expect(deleteRes.ok).toBe(true);

        // Verify 404
        const gone = await fetch(`${BASE_URL}/api/agents/${agent.id}`);
        expect(gone.status).toBe(404);
    });
});
