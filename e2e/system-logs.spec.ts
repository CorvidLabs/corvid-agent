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
        const rendered = await page.locator('h2').count() > 0;

        if (!rateLimited && rendered) return;

        if (attempt < maxRetries) {
            const match = body.match(/"retryAfter"\s*:\s*(\d+)/);
            const wait = Math.min(Math.max(Number(match?.[1] ?? 5), 3), 10);
            await page.waitForTimeout(wait * 1000 + 500);
        }
    }
}

test.describe('System Logs', () => {
    test('page loads with tabs', async ({ page }) => {
        await gotoWithRetry(page, '/logs');

        await expect(page.locator('h2')).toContainText('System Logs');

        // Two tabs
        await expect(page.locator('.tab-btn:text("Event Logs")')).toBeVisible();
        await expect(page.locator('.tab-btn:text("Credit Transactions")')).toBeVisible();

        // Event Logs tab should be active by default
        await expect(page.locator('.tab-btn:text("Event Logs")')).toHaveClass(/tab-btn--active/);
    });

    test('event logs tab shows list or empty', async ({ page }) => {
        await gotoWithRetry(page, '/logs');

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
        await gotoWithRetry(page, '/logs');

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
        await gotoWithRetry(page, '/logs');

        // Type filter chips (all, council, escalation, work-task)
        const typeChips = page.locator('.filter-chip').filter({ hasNot: page.locator('.filter-chip--level') });
        const levelChips = page.locator('.filter-chip--level');

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
        const res = await fetch(`${BASE_URL}/api/system-logs?type=all&limit=10`);
        expect(res.ok).toBe(true);

        const data = await res.json();
        expect(Array.isArray(data.logs)).toBe(true);
        expect(typeof data.total).toBe('number');
    });

    test('API returns credit transactions', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/system-logs/credit-transactions?limit=10`);
        expect(res.ok).toBe(true);

        const data = await res.json();
        expect(Array.isArray(data.transactions)).toBe(true);
        expect(typeof data.total).toBe('number');
    });

    test('search and toolbar controls', async ({ page }) => {
        await gotoWithRetry(page, '/logs');

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
