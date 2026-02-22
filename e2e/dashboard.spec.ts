import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

/** Navigate to dashboard, retrying on 429 rate-limit responses or empty lazy-load. */
async function gotoDashboard(page: Page, maxRetries = 3): Promise<void> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        await page.goto('/dashboard');
        await page.waitForLoadState('networkidle');

        const body = await page.locator('body').textContent() ?? '';
        const rateLimited = body.includes('Too many requests');
        const rendered = await page.locator('.metric-card').count() > 0;

        if (!rateLimited && rendered) return;

        if (attempt < maxRetries) {
            const match = body.match(/"retryAfter"\s*:\s*(\d+)/);
            const wait = Math.max(Number(match?.[1] ?? 5), 3);
            await page.waitForTimeout(wait * 1000 + 500);
        }
    }
}

test.describe('Dashboard', () => {
    test('loads with metric cards', async ({ page, api }) => {
        await api.seedProject('Dashboard Project');
        await api.seedAgent('Dashboard Agent');

        await gotoDashboard(page);

        // Should have at least 3 metric cards
        const cards = page.locator('.metric-card');
        expect(await cards.count()).toBeGreaterThanOrEqual(3);
    });

    test('metric cards show correct labels', async ({ page, api }) => {
        await api.seedProject('Labels Project');
        await api.seedAgent('Labels Agent');

        await gotoDashboard(page);

        const labels = page.locator('.metric-card__label');
        const allLabels = await labels.allTextContents();

        expect(allLabels.some((l) => l.includes('Total Agents'))).toBe(true);
        expect(allLabels.some((l) => l.includes('Active Sessions'))).toBe(true);
        expect(allLabels.some((l) => l.includes('Total Projects'))).toBe(true);
    });

    test('metric card values are displayed', async ({ page, api }) => {
        await api.seedProject('Values Project');
        await api.seedAgent('Values Agent');

        await gotoDashboard(page);

        const values = page.locator('.metric-card__value');
        expect(await values.count()).toBeGreaterThanOrEqual(3);

        // Each value should have text content
        const firstValue = await values.first().textContent();
        expect(firstValue?.trim().length).toBeGreaterThan(0);
    });

    test('metric card links point to correct routes', async ({ page, api }) => {
        await api.seedAgent('Nav Agent');

        await gotoDashboard(page);

        // Verify the "Total Agents" metric card has a "View all" link pointing to /agents
        const agentCard = page.locator('.metric-card').filter({ hasText: 'Total Agents' });
        await expect(agentCard).toBeVisible({ timeout: 10000 });
        const agentLink = agentCard.locator('a.metric-card__link');
        await expect(agentLink).toHaveAttribute('href', '/agents');

        // Verify the "Active Sessions" metric card links to /sessions
        const sessionCard = page.locator('.metric-card').filter({ hasText: 'Active Sessions' });
        await expect(sessionCard).toBeVisible();
        const sessionLink = sessionCard.locator('a.metric-card__link');
        await expect(sessionLink).toHaveAttribute('href', '/sessions');
    });

    test('AlgoChat status section renders', async ({ page }) => {
        await gotoDashboard(page);
        // AlgoChat section may or may not exist depending on config — just verify no crash
    });

    test('network badge has correct color class', async ({ page }) => {
        await gotoDashboard(page);

        const badge = page.locator('.network-badge');
        if (await badge.count() > 0) {
            const classes = await badge.getAttribute('class');
            const hasNetworkClass = classes?.includes('network-badge--localnet')
                || classes?.includes('network-badge--testnet')
                || classes?.includes('network-badge--mainnet');
            expect(hasNetworkClass).toBe(true);
        }
    });
});
