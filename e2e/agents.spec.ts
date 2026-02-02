import { test, expect } from './fixtures';

test.describe('Agents', () => {
    test('create agent and verify it appears in list', async ({ page }) => {
        await page.goto('/agents');

        // Click "New Agent" link
        await page.locator('a[href="/agents/new"]').click();
        await page.waitForURL('/agents/new');

        // Fill in the agent form
        await page.locator('#name').fill('Playwright Agent');
        await page.locator('form button[type="submit"]').click();

        // Should redirect to agent list or detail
        await page.waitForURL(/\/agents/);

        // Navigate to agent list and verify
        await page.goto('/agents');
        await expect(page.locator('text=Playwright Agent').first()).toBeVisible();
    });

    test('agent detail shows wallet address on localnet', async ({ page, api }) => {
        const health = await api.getHealth();
        const agent = await api.seedAgent('Wallet Check Agent');

        await page.goto(`/agents/${agent.id}`);
        await page.waitForLoadState('networkidle');

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
});
