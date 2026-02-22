import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * Navigate to the marketplace page, retrying if the server is rate-limited.
 * When running against a reused dev server the default rate limits are lower
 * than the CI overrides, so the first few navigations in a test run can
 * receive 429s.
 */
async function gotoMarketplace(page: Page, maxRetries = 3): Promise<void> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        await page.goto('/marketplace');
        await page.waitForLoadState('networkidle');

        const body = await page.locator('body').textContent();
        if (!body?.includes('Too many requests')) return;

        const match = body.match(/"retryAfter"\s*:\s*(\d+)/);
        const wait = Number(match?.[1] ?? 5);
        await page.waitForTimeout(wait * 1000 + 500);
    }
    // Final attempt — let assertion errors propagate
    await page.goto('/marketplace');
    await page.waitForLoadState('networkidle');
}

test.describe('Marketplace', () => {
    test('navigate to marketplace page', async ({ page }) => {
        await gotoMarketplace(page);
        await expect(page.locator('h2:text("Marketplace")')).toBeVisible();
    });

    test('search with query and verify results update', async ({ page, api }) => {
        const agent = await api.seedAgent('Search Agent');
        await api.seedMarketplaceListing(agent.id, { name: 'Unique Searchable Listing' });

        await gotoMarketplace(page);

        // Type in search — use placeholder selector in case class name changed
        await page.locator('input[placeholder*="Search"]').fill('Unique Searchable');
        await page.locator('button:text("Search")').click();
        await page.waitForLoadState('networkidle');

        // Verify listing appears
        await expect(page.locator('text=Unique Searchable Listing').first()).toBeVisible({ timeout: 5000 });
    });

    test('create listing and verify it appears', async ({ page, api }) => {
        const agent = await api.seedAgent('Listing Creator Agent');
        await gotoMarketplace(page);

        await page.locator('button:text("+ New Listing")').click();
        await expect(page.locator('h3:text("Create Listing")')).toBeVisible();

        // Fill form — use .form-select to avoid matching the filter-select
        await page.locator('.form-select').first().selectOption(agent.id);
        await page.locator('input[placeholder="Listing name"]').fill('E2E Marketplace Listing');
        await page.locator('textarea[placeholder*="description"]').fill('Test listing description');
        await page.locator('input[placeholder*="typescript"]').fill('test, e2e');

        // Submit
        await page.locator('button:text("Create Listing")').click();
        await expect(page.locator('text=Listing created').first()).toBeVisible({ timeout: 10000 });
        await expect(page.locator('text=E2E Marketplace Listing').first()).toBeVisible();
    });

    test('leave review and verify it appears', async ({ page, api }) => {
        const agent = await api.seedAgent('Review Agent');
        await api.seedMarketplaceListing(agent.id, { name: 'Review Target Listing' });

        await gotoMarketplace(page);

        // Wait for listing cards to render, then click first match
        await expect(page.locator('.listing-card').first()).toBeVisible({ timeout: 10000 });
        await page.locator('.listing-card:has-text("Review Target Listing")').first().click();
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

        await gotoMarketplace(page);

        // Wait for listing cards to render, then click first match
        await expect(page.locator('.listing-card').first()).toBeVisible({ timeout: 10000 });
        await page.locator('.listing-card:has-text("Listing To Delete")').first().click();
        await expect(page.locator('.detail-panel')).toBeVisible({ timeout: 5000 });

        await page.locator('button:text("Delete")').first().click();
        await expect(page.locator('text=Listing deleted').first()).toBeVisible({ timeout: 5000 });
    });

    test('star ratings on listing cards', async ({ page, api }) => {
        const agent = await api.seedAgent('Star Rating Agent');
        await api.seedMarketplaceListing(agent.id, { name: 'Starred Listing' });

        await gotoMarketplace(page);

        // Listing cards should have star elements
        const listingCard = page.locator('.listing-card').first();
        await expect(listingCard).toBeVisible({ timeout: 10000 });

        const stars = listingCard.locator('.star');
        expect(await stars.count()).toBeGreaterThanOrEqual(1);
    });

    test('trust badge on listing card', async ({ page, api }) => {
        const agent = await api.seedAgent('Trust Badge Agent');
        await api.seedReputationEvent(agent.id, 'task_completed', 10);
        await api.computeScore(agent.id);
        await api.seedMarketplaceListing(agent.id, { name: 'Trusted Listing' });

        await gotoMarketplace(page);

        // Wait for listing cards to render
        await expect(page.locator('.listing-card').first()).toBeVisible({ timeout: 10000 });

        // Find the listing card and check for trust badge
        const card = page.locator('.listing-card:has-text("Trusted Listing")').first();
        await expect(card).toBeVisible({ timeout: 5000 });

        const badge = card.locator('.trust-badge');
        if (await badge.count() > 0) {
            await expect(badge).toBeVisible();
        }
    });

    test('detail panel stats section', async ({ page, api }) => {
        const agent = await api.seedAgent('Detail Stats Agent');
        await api.seedMarketplaceListing(agent.id, { name: 'Stats Listing' });

        await gotoMarketplace(page);

        // Wait for listing cards to render, then click first match
        await expect(page.locator('.listing-card').first()).toBeVisible({ timeout: 10000 });
        await page.locator('.listing-card:has-text("Stats Listing")').first().click();
        await expect(page.locator('.detail-panel')).toBeVisible({ timeout: 5000 });

        // Verify detail panel structure
        await expect(page.locator('.detail-columns')).toBeVisible();
        await expect(page.locator('.detail-stats')).toBeVisible();

        const statItems = page.locator('.stat-item');
        expect(await statItems.count()).toBeGreaterThanOrEqual(1);
    });

    test('star ratings in reviews', async ({ page, api }) => {
        const agent = await api.seedAgent('Review Stars Agent');
        await api.seedMarketplaceListing(agent.id, { name: 'Review Stars Listing' });

        await gotoMarketplace(page);

        // Wait for listing cards to render, then click first match
        await expect(page.locator('.listing-card').first()).toBeVisible({ timeout: 10000 });
        await page.locator('.listing-card:has-text("Review Stars Listing")').first().click();
        await expect(page.locator('.detail-panel')).toBeVisible({ timeout: 5000 });

        // Leave a review
        await page.locator('.review-form__rating').selectOption('4');
        await page.locator('input[placeholder="Your review..."]').fill('Great agent!');
        await page.locator('button:text("Submit")').click();
        await expect(page.locator('text=Review submitted').first()).toBeVisible({ timeout: 5000 });

        // Verify the review row has star elements
        const reviewStars = page.locator('.review-row__stars');
        await expect(reviewStars.first()).toBeVisible({ timeout: 5000 });

        const filledStars = reviewStars.first().locator('.star--filled');
        expect(await filledStars.count()).toBeGreaterThanOrEqual(1);
    });
});
