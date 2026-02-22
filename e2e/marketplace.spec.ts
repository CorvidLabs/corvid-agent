import { test, expect } from './fixtures';

test.describe('Marketplace', () => {
    test('navigate to marketplace page', async ({ page }) => {
        await page.goto('/marketplace');
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h2:text("Marketplace")')).toBeVisible();
    });

    test('search with query and verify results update', async ({ page, api }) => {
        const agent = await api.seedAgent('Search Agent');
        await api.seedMarketplaceListing(agent.id, { name: 'Unique Searchable Listing' });

        await page.goto('/marketplace');
        await page.waitForLoadState('networkidle');

        // Type in search
        await page.locator('.search-input').fill('Unique Searchable');
        await page.locator('button:text("Search")').click();
        await page.waitForLoadState('networkidle');

        // Verify listing appears
        await expect(page.locator('text=Unique Searchable Listing').first()).toBeVisible({ timeout: 5000 });
    });

    test('create listing and verify it appears', async ({ page, api }) => {
        const agent = await api.seedAgent('Listing Creator Agent');
        await page.goto('/marketplace');
        await page.waitForLoadState('networkidle');

        await page.locator('button:text("+ New Listing")').click();
        await expect(page.locator('h3:text("Create Listing")')).toBeVisible();

        // Fill form
        await page.locator('select').first().selectOption({ label: agent.name });
        await page.locator('input[placeholder="Listing name"]').fill('E2E Marketplace Listing');
        await page.locator('textarea[placeholder*="description"]').fill('Test listing description');
        await page.locator('input[placeholder*="typescript"]').fill('test, e2e');

        // Submit
        await page.locator('button:text("Create Listing")').click();
        await expect(page.locator('text=Listing created').first()).toBeVisible({ timeout: 5000 });
        await expect(page.locator('text=E2E Marketplace Listing').first()).toBeVisible();
    });

    test('leave review and verify it appears', async ({ page, api }) => {
        const agent = await api.seedAgent('Review Agent');
        const listing = await api.seedMarketplaceListing(agent.id, { name: 'Review Target Listing' });

        await page.goto('/marketplace');
        await page.waitForLoadState('networkidle');

        // Click the listing
        await page.locator('text=Review Target Listing').first().click();
        await expect(page.locator('.detail-panel')).toBeVisible({ timeout: 5000 });

        // Leave review
        await page.locator('.review-form__rating').selectOption('4');
        await page.locator('input[placeholder="Your review..."]').fill('Great agent!');
        await page.locator('button:text("Submit")').click();
        await expect(page.locator('text=Review submitted').first()).toBeVisible({ timeout: 5000 });
    });

    test('delete listing', async ({ page, api }) => {
        const agent = await api.seedAgent('Delete Listing Agent');
        await api.seedMarketplaceListing(agent.id, { name: 'Listing To Delete' });

        await page.goto('/marketplace');
        await page.waitForLoadState('networkidle');

        await page.locator('text=Listing To Delete').first().click();
        await expect(page.locator('.detail-panel')).toBeVisible({ timeout: 5000 });

        await page.locator('button:text("Delete")').first().click();
        await expect(page.locator('text=Listing deleted').first()).toBeVisible({ timeout: 5000 });
    });
});
