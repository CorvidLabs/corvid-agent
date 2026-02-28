import { test, expect, gotoWithRetry , authedFetch } from './fixtures';

const BASE_URL = `http://localhost:${process.env.E2E_PORT || '3001'}`;

test.describe('System Logs', () => {
    test('page loads with tabs', async ({ page }) => {
        await gotoWithRetry(page, '/logs', { isRendered: async (p) => (await p.locator('h2').count()) > 0 });

        await expect(page.locator('h2')).toContainText('System Logs');

        // Two tabs
        await expect(page.locator('.tab-btn:text("Event Logs")')).toBeVisible();
        await expect(page.locator('.tab-btn:text("Credit Transactions")')).toBeVisible();

        // Event Logs tab should be active by default
        await expect(page.locator('.tab-btn:text("Event Logs")')).toHaveClass(/tab-btn--active/);
    });

    test('event logs tab shows list or empty', async ({ page }) => {
        await gotoWithRetry(page, '/logs', { isRendered: async (p) => (await p.locator('h2').count()) > 0 });

        const hasList = await page.locator('.log-list').count() > 0;
        const hasEmpty = await page.locator('.empty').count() > 0;
        expect(hasList || hasEmpty).toBe(true);

        if (hasList) {
            const entry = page.locator('.log-entry').first();
            await expect(entry).toHaveAttribute('data-level', /.+/);
            await expect(entry.locator('.log-type')).toBeVisible();
            await expect(entry.locator('.log-message')).toBeVisible();
        }
    });

    test('credit transactions tab', async ({ page }) => {
        await gotoWithRetry(page, '/logs', { isRendered: async (p) => (await p.locator('h2').count()) > 0 });

        // Click Credit Transactions tab
        const creditTab = page.locator('.tab-btn:text("Credit Transactions")');
        await creditTab.click();
        await expect(creditTab).toHaveClass(/tab-btn--active/);

        const hasTable = await page.locator('.credit-table').count() > 0;
        const hasEmpty = await page.locator('.empty').count() > 0;
        expect(hasTable || hasEmpty).toBe(true);

        if (hasTable) {
            const header = page.locator('.credit-header');
            const headerText = await header.textContent() ?? '';
            expect(headerText).toContain('Type');
            expect(headerText).toContain('Amount');
            expect(headerText).toContain('Balance');
            expect(headerText).toContain('Wallet');
            expect(headerText).toContain('Time');
        }
    });

    test('log type and level filters', async ({ page }) => {
        await gotoWithRetry(page, '/logs', { isRendered: async (p) => (await p.locator('h2').count()) > 0 });

        // At least some filter chips should exist
        const totalChips = page.locator('.filter-chip');
        expect(await totalChips.count()).toBeGreaterThanOrEqual(4);

        // Click a chip and verify active class
        const firstChip = totalChips.first();
        await firstChip.click();
        // The "all" chip should toggle active
        const hasActive = await page.locator('.filter-chip--active').count() > 0;
        expect(hasActive).toBe(true);
    });

    test('API returns logs', async ({}) => {
        const res = await authedFetch(`${BASE_URL}/api/system-logs?type=all&limit=10`);
        expect(res.ok).toBe(true);

        const data = await res.json();
        expect(Array.isArray(data.logs)).toBe(true);
        expect(typeof data.total).toBe('number');
    });

    test('API returns credit transactions', async ({}) => {
        const res = await authedFetch(`${BASE_URL}/api/system-logs/credit-transactions?limit=10`);
        expect(res.ok).toBe(true);

        const data = await res.json();
        expect(Array.isArray(data.transactions)).toBe(true);
        expect(typeof data.total).toBe('number');
    });

    test('search and toolbar controls', async ({ page }) => {
        await gotoWithRetry(page, '/logs', { isRendered: async (p) => (await p.locator('h2').count()) > 0 });

        // Search input with placeholder
        const search = page.locator('.log-search');
        await expect(search).toBeVisible();
        const placeholder = await search.getAttribute('placeholder');
        expect(placeholder).toBeTruthy();

        // Auto-refresh button
        await expect(page.locator('button:text("Auto-refresh")')).toBeVisible();

        // Export button
        await expect(page.locator('button:text("Export")')).toBeVisible();
    });
});
