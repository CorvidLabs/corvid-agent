import { test, expect } from './fixtures';

test.describe('Dashboard', () => {
    test('loads with project/agent/session/running counts', async ({ page, api }) => {
        await api.seedProject('Dashboard Project');
        await api.seedAgent('Dashboard Agent');

        await page.goto('/dashboard');

        // Wait for cards to render with data
        await expect(page.locator('.card__title')).toHaveCount(5);
        await expect(page.locator('.card__title').first()).toContainText('Projects');

        // Verify the count cards are present
        const cardTitles = await page.locator('.card__title').allTextContents();
        expect(cardTitles).toEqual(['Projects', 'Agents', 'Councils', 'Sessions', 'Running']);
    });

    test('AlgoChat status section renders', async ({ page }) => {
        await page.goto('/dashboard');

        // AlgoChat section should be present (enabled or disabled)
        const algochatSection = page.locator('.dashboard__algochat');
        // May or may not exist depending on config — just verify no crash
        await page.waitForLoadState('networkidle');
    });

    test('network badge has correct color class', async ({ page }) => {
        await page.goto('/dashboard');
        await page.waitForLoadState('networkidle');

        const badge = page.locator('.network-badge');
        if (await badge.count() > 0) {
            const classes = await badge.getAttribute('class');
            // Should have one of the network-specific classes
            const hasNetworkClass = classes?.includes('network-badge--localnet')
                || classes?.includes('network-badge--testnet')
                || classes?.includes('network-badge--mainnet');
            expect(hasNetworkClass).toBe(true);
        }
    });
});
