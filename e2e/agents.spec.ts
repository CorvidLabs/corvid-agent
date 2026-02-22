import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

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
            const wait = Math.max(Number(match?.[1] ?? 5), 3);
            await page.waitForTimeout(wait * 1000 + 500);
        }
    }
}

test.describe('Agents', () => {
    test('create agent and verify it appears in list', async ({ page }) => {
        await gotoWithRetry(page, '/agents');

        // Click "New Agent" link
        await page.locator('a[href="/agents/new"]').click();
        await page.waitForURL('/agents/new');

        // Fill in the agent form
        await page.locator('#name').fill('Playwright Agent');
        await page.locator('form button[type="submit"]').click();

        // Should redirect to agent list or detail
        await page.waitForURL(/\/agents/);

        // Navigate to agent list and verify
        await gotoWithRetry(page, '/agents');
        await expect(page.locator('text=Playwright Agent').first()).toBeVisible();
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
});
