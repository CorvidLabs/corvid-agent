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

test.describe('Feed', () => {
    test('page loads with heading and list or empty', async ({ page }) => {
        await gotoWithRetry(page, '/feed');

        await expect(page.locator('h2')).toContainText('Feed');

        const hasList = await page.locator('.feed__list').count() > 0;
        const hasEmpty = await page.locator('.feed__empty').count() > 0;
        expect(hasList || hasEmpty).toBe(true);
    });

    test('direction filter chips', async ({ page }) => {
        await gotoWithRetry(page, '/feed');

        const chips = page.locator('.dir-chip');
        expect(await chips.count()).toBe(6);

        // "All" should be active by default
        const allChip = page.locator('.dir-chip').first();
        await expect(allChip).toHaveClass(/dir-chip--active/);

        // Click a different chip and verify toggle
        const secondChip = page.locator('.dir-chip').nth(1);
        await secondChip.click();
        await expect(secondChip).toHaveClass(/dir-chip--active/);
    });

    test('search input accepts text', async ({ page }) => {
        await gotoWithRetry(page, '/feed');

        const search = page.locator('.feed__search');
        await expect(search).toBeVisible();
        await search.fill('test search');

        // Page should still render without crash
        const hasList = await page.locator('.feed__list').count() > 0;
        const hasEmpty = await page.locator('.feed__empty').count() > 0;
        expect(hasList || hasEmpty).toBe(true);
    });

    test('feed API returns messages', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/feed/history?limit=10&offset=0`);
        expect(res.ok).toBe(true);

        const data = await res.json();
        expect(Array.isArray(data.messages)).toBe(true);
        expect(typeof data.total).toBe('number');
    });

    test('pagination controls', async ({ page }) => {
        await gotoWithRetry(page, '/feed');

        // Enter search text to trigger pagination rendering
        const search = page.locator('.feed__search');
        await search.fill('a');
        await page.waitForTimeout(500);

        const pagination = page.locator('.feed__pagination');
        if (await pagination.count() > 0) {
            await expect(page.locator('.feed__page-info')).toBeVisible();
            await expect(page.locator('.feed__page-controls')).toBeVisible();
        }
    });

    test('auto-scroll, export, clear buttons', async ({ page }) => {
        await gotoWithRetry(page, '/feed');

        // Auto-scroll button
        const autoScroll = page.locator('button:text("Auto-scroll")');
        await expect(autoScroll).toBeVisible();

        // Export button
        await expect(page.locator('button:text("Export")')).toBeVisible();

        // Clear button
        await expect(page.locator('button:text("Clear")')).toBeVisible();
    });
});
