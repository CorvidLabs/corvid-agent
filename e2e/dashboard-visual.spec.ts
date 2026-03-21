import { test, expect, gotoWithRetry } from './fixtures';
import type { Page } from '@playwright/test';

/** Navigate to dashboard, retrying on 429 rate-limit responses or empty lazy-load. */
async function gotoDashboard(page: Page, maxRetries = 3): Promise<void> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        await gotoWithRetry(page, '/dashboard');
        await page.waitForLoadState('networkidle');

        const body = await page.locator('body').textContent() ?? '';
        const rateLimited = body.includes('Too many requests');
        const rendered = await page.locator('.metric-card').count() > 0;

        if (!rateLimited && rendered) return;

        if (attempt < maxRetries) {
            const match = body.match(/"retryAfter"\s*:\s*(\d+)/);
            const wait = Math.min(Math.max(Number(match?.[1] ?? 5), 3), 10);
            await page.waitForTimeout(wait * 1000 + 500);
        }
    }
}

test.describe('Dashboard Visual Tests', () => {
    test('full dashboard screenshot', async ({ page, api }) => {
        await api.seedProject('Visual Test Project');
        await api.seedAgent('Visual Test Agent');
        const project = await api.seedProject('Screenshot Project');
        const agent = await api.seedAgent('Screenshot Agent');
        await api.seedSession(project.id, agent.id);

        await gotoDashboard(page);

        // Wait for all widgets to render
        await expect(page.locator('.metric-card').first()).toBeVisible({ timeout: 10000 });
        await page.waitForTimeout(1000); // Let animations settle

        // Full page screenshot
        await page.screenshot({
            path: 'e2e/screenshots/dashboard-full.png',
            fullPage: true,
        });
    });

    test('toolbar and metrics screenshot', async ({ page, api }) => {
        await api.seedProject('Toolbar Project');
        await api.seedAgent('Toolbar Agent');

        await gotoDashboard(page);
        await expect(page.locator('.metric-card').first()).toBeVisible({ timeout: 10000 });

        // Toolbar area
        const toolbar = page.locator('.dash-toolbar');
        if (await toolbar.count() > 0) {
            await toolbar.screenshot({ path: 'e2e/screenshots/dashboard-toolbar.png' });
        }

        // Metrics section
        const metrics = page.locator('.metrics-row');
        if (await metrics.count() > 0) {
            await metrics.first().screenshot({ path: 'e2e/screenshots/dashboard-metrics.png' });
        }
    });

    test('agent grid screenshot', async ({ page, api }) => {
        await api.seedAgent('Grid Agent 1');
        await api.seedAgent('Grid Agent 2');
        await api.seedAgent('Grid Agent 3');

        await gotoDashboard(page);
        await expect(page.locator('.agent-grid').first()).toBeVisible({ timeout: 10000 });

        const grid = page.locator('.agent-grid');
        await grid.screenshot({ path: 'e2e/screenshots/dashboard-agent-grid.png' });
    });

    test('system status and activity screenshot', async ({ page, api }) => {
        const project = await api.seedProject('Activity Project');
        const agent = await api.seedAgent('Activity Agent');
        await api.seedSession(project.id, agent.id);

        await gotoDashboard(page);
        await page.waitForTimeout(1500);

        // Status section
        const statusSection = page.locator('.section--status');
        if (await statusSection.count() > 0) {
            await statusSection.screenshot({ path: 'e2e/screenshots/dashboard-status.png' });
        }

        // Activity feed
        const feedSection = page.locator('.section--feed');
        if (await feedSection.count() > 0) {
            await feedSection.screenshot({ path: 'e2e/screenshots/dashboard-feed.png' });
        }
    });
});
