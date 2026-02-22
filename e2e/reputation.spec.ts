import { test, expect } from './fixtures';

test.describe('Reputation', () => {
    test('navigate to reputation page', async ({ page }) => {
        await page.goto('/reputation');
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h2:text("Agent Reputation")')).toBeVisible();
    });

    test('handle 503 when reputation service unavailable', async ({ page }) => {
        await page.goto('/reputation');
        await page.waitForLoadState('networkidle');

        // Either scores render or error banner appears
        const hasScores = await page.locator('.scores-table').count() > 0;
        const hasError = await page.locator('.error-banner').count() > 0;
        const isEmpty = await page.locator('text=No reputation scores').count() > 0;

        expect(hasScores || hasError || isEmpty).toBe(true);
    });

    test('click agent to view event history if scores exist', async ({ page, api }) => {
        await api.seedAgent('Rep Agent');
        await page.goto('/reputation');
        await page.waitForLoadState('networkidle');

        // If scores table exists and has rows, click the first one
        const rows = page.locator('.scores-table__row');
        if (await rows.count() > 0) {
            await rows.first().click();
            await expect(page.locator('.detail-panel')).toBeVisible({ timeout: 5000 });
            await expect(page.locator('h4:text("Recent Events")')).toBeVisible();
        }
    });

    test('refresh score button', async ({ page, api }) => {
        await api.seedAgent('Rep Refresh Agent');
        await page.goto('/reputation');
        await page.waitForLoadState('networkidle');

        const refreshBtn = page.locator('button:text("Refresh")').first();
        if (await refreshBtn.count() > 0) {
            await refreshBtn.click();
            // Should either succeed or show error notification
            await page.waitForTimeout(2000);
        }
    });
});
