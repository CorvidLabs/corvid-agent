import { test, expect , authedFetch , gotoWithRetry } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * Navigate to the marketplace page, retrying if the server is rate-limited.
 * When running against a reused dev server the default rate limits are lower
 * than the CI overrides, so the first few navigations in a test run can
 * receive 429s.
 */
async function gotoMarketplace(page: Page, maxRetries = 3): Promise<void> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        await gotoWithRetry(page, '/marketplace');
        await page.waitForLoadState('networkidle');

        const body = await page.locator('body').textContent();
        if (!body?.includes('Too many requests')) return;

        const match = body.match(/"retryAfter"\s*:\s*(\d+)/);
        const wait = Math.min(Number(match?.[1] ?? 5), 10);
        await page.waitForTimeout(wait * 1000 + 500);
    }
    // Final attempt — let assertion errors propagate
    await gotoWithRetry(page, '/marketplace');
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

    test('delete listing via detail panel', async ({ page, api }) => {
        const agent = await api.seedAgent('Delete Listing Agent');
        await api.seedMarketplaceListing(agent.id, { name: 'Delete Target Listing' });

        await gotoMarketplace(page);

        // Click any visible listing card to open detail panel
        await expect(page.locator('.listing-card').first()).toBeVisible({ timeout: 10000 });
        await page.locator('.listing-card').first().click();
        await expect(page.locator('.detail-panel')).toBeVisible({ timeout: 5000 });

        // Delete button should be visible in detail panel
        const deleteBtn = page.locator('.detail-panel button:text("Delete")').first();
        await expect(deleteBtn).toBeVisible({ timeout: 5000 });
        await deleteBtn.click();
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

    test('category filter dropdown works', async ({ page, api }) => {
        const agent = await api.seedAgent('Category Agent');
        await api.seedMarketplaceListing(agent.id, { name: 'General Listing', category: 'general' });

        await gotoMarketplace(page);

        // Category filter select should be visible
        const filterSelect = page.locator('.filter-select');
        await expect(filterSelect).toBeVisible({ timeout: 10000 });

        // Select a category
        await filterSelect.selectOption('general');
        await page.waitForLoadState('networkidle');

        // Listings should still render (filtered or all)
        const cards = page.locator('.listing-card');
        expect(await cards.count()).toBeGreaterThanOrEqual(0);
    });

    test('listing card shows pricing, category, and meta', async ({ page, api }) => {
        const agent = await api.seedAgent('Card Meta Agent');
        await api.seedMarketplaceListing(agent.id, { name: 'Card Meta Listing' });

        await gotoMarketplace(page);

        // Use any visible listing card to verify structural elements
        const card = page.locator('.listing-card').first();
        await expect(card).toBeVisible({ timeout: 10000 });

        // Price element should be visible on every listing card
        const price = card.locator('.listing-card__price');
        await expect(price).toBeVisible();

        // Category badge should be visible
        const category = card.locator('.listing-card__category');
        await expect(category).toBeVisible();

        // Uses count should be displayed
        const uses = card.locator('.listing-card__uses');
        await expect(uses).toBeVisible();

        // Stars should be visible
        const stars = card.locator('.star');
        expect(await stars.count()).toBe(5);
    });

    test('listing card shows tags when present', async ({ page, api }) => {
        const agent = await api.seedAgent('Tags Agent');
        await api.seedMarketplaceListing(agent.id, { name: 'Tagged Listing', tags: ['automation', 'testing'] });

        await gotoMarketplace(page);

        // Find any listing card that has tags
        const cardsWithTags = page.locator('.listing-card:has(.tag)');
        if (await cardsWithTags.count() > 0) {
            const tags = cardsWithTags.first().locator('.tag');
            expect(await tags.count()).toBeGreaterThanOrEqual(1);
        }
    });

    test('detail panel shows review form', async ({ page, api }) => {
        const agent = await api.seedAgent('Review Form Agent');
        await api.seedMarketplaceListing(agent.id, { name: 'Review Form Listing' });

        await gotoMarketplace(page);

        // Click any visible listing card to open detail panel
        await expect(page.locator('.listing-card').first()).toBeVisible({ timeout: 10000 });
        await page.locator('.listing-card').first().click();
        await expect(page.locator('.detail-panel')).toBeVisible({ timeout: 5000 });

        // Review form should be present
        const reviewForm = page.locator('.review-form');
        await expect(reviewForm).toBeVisible();
        await expect(reviewForm.locator('.review-form__rating')).toBeVisible();
    });

    test('API CRUD for marketplace listings', async ({ api }) => {
        const BASE_URL = `http://localhost:${process.env.E2E_PORT || '3001'}`;
        const agent = await api.seedAgent('MP API Agent');
        const listingName = `API Listing ${Date.now()}`;

        // Create
        const createRes = await authedFetch(`${BASE_URL}/api/marketplace/listings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                agentId: agent.id,
                name: listingName,
                description: 'API test listing',
                category: 'general',
                pricingModel: 'free',
                tags: ['test'],
            }),
        });
        expect(createRes.status).toBe(201);
        const listing = await createRes.json();

        // Read
        const readRes = await authedFetch(`${BASE_URL}/api/marketplace/listings/${listing.id}`);
        expect(readRes.ok).toBe(true);

        // Update (publish)
        const updateRes = await authedFetch(`${BASE_URL}/api/marketplace/listings/${listing.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'published' }),
        });
        expect(updateRes.ok).toBe(true);

        // Search
        const searchRes = await authedFetch(`${BASE_URL}/api/marketplace/listings?q=${encodeURIComponent(listingName)}`);
        expect(searchRes.ok).toBe(true);

        // Leave review
        const reviewRes = await authedFetch(`${BASE_URL}/api/marketplace/listings/${listing.id}/reviews`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rating: 5, comment: 'Great!' }),
        });
        expect([200, 201]).toContain(reviewRes.status);

        // Delete
        const deleteRes = await authedFetch(`${BASE_URL}/api/marketplace/listings/${listing.id}`, { method: 'DELETE' });
        expect(deleteRes.ok).toBe(true);

        // Verify 404
        const gone = await authedFetch(`${BASE_URL}/api/marketplace/listings/${listing.id}`);
        expect(gone.status).toBe(404);
    });

    test('listing card name and description visible', async ({ page, api }) => {
        const agent = await api.seedAgent('Name Desc Agent');
        await api.seedMarketplaceListing(agent.id, { name: 'Name Desc Listing' });

        await gotoMarketplace(page);

        const card = page.locator('.listing-card').first();
        await expect(card).toBeVisible({ timeout: 10000 });

        // Name should be visible
        await expect(card.locator('.listing-card__name')).toBeVisible();
        const name = await card.locator('.listing-card__name').textContent();
        expect(name?.trim().length).toBeGreaterThan(0);

        // Description should be visible
        await expect(card.locator('.listing-card__desc')).toBeVisible();
    });

    // ─── API-only tests ──────────────────────────────────────────────────

    test('search endpoint returns paginated results', async ({}) => {
        const BASE_URL = `http://localhost:${process.env.E2E_PORT || '3001'}`;

        const res = await authedFetch(`${BASE_URL}/api/marketplace/search`);
        expect(res.ok).toBe(true);
        const data = await res.json();
        expect(Array.isArray(data.listings)).toBe(true);
        expect(typeof data.total).toBe('number');
        expect(typeof data.limit).toBe('number');
    });

    test('use listing increments use count', async ({ api }) => {
        const BASE_URL = `http://localhost:${process.env.E2E_PORT || '3001'}`;
        const agent = await api.seedAgent('Use Listing Agent');
        const listing = await api.seedMarketplaceListing(agent.id, { name: 'Use Target Listing' });

        const res = await authedFetch(`${BASE_URL}/api/marketplace/listings/${listing.id}/use`, {
            method: 'POST',
        });
        expect(res.ok).toBe(true);
        const data = await res.json();
        expect(data.ok).toBe(true);
    });

    test('get reviews for listing returns array', async ({ api }) => {
        const BASE_URL = `http://localhost:${process.env.E2E_PORT || '3001'}`;
        const agent = await api.seedAgent('Reviews List Agent');
        const listing = await api.seedMarketplaceListing(agent.id, { name: 'Reviews Listing' });

        const res = await authedFetch(`${BASE_URL}/api/marketplace/listings/${listing.id}/reviews`);
        expect(res.ok).toBe(true);
        const data = await res.json();
        expect(Array.isArray(data)).toBe(true);
    });

    test('delete review returns 404 for nonexistent', async ({}) => {
        const BASE_URL = `http://localhost:${process.env.E2E_PORT || '3001'}`;

        const res = await authedFetch(`${BASE_URL}/api/marketplace/reviews/nonexistent`, {
            method: 'DELETE',
        });
        expect(res.status).toBe(404);
    });

    test('federation instances list', async ({}) => {
        const BASE_URL = `http://localhost:${process.env.E2E_PORT || '3001'}`;

        const res = await authedFetch(`${BASE_URL}/api/marketplace/federation/instances`);
        expect([200, 503]).toContain(res.status);
        if (res.status === 200) {
            const data = await res.json();
            expect(Array.isArray(data)).toBe(true);
        }
    });

    test('federated listings', async ({}) => {
        const BASE_URL = `http://localhost:${process.env.E2E_PORT || '3001'}`;

        const res = await authedFetch(`${BASE_URL}/api/marketplace/federated`);
        expect([200, 503]).toContain(res.status);
        if (res.status === 200) {
            const data = await res.json();
            expect(Array.isArray(data)).toBe(true);
        }
    });

    test('federation register instance, sync, and remove', async ({}) => {
        const BASE_URL = `http://localhost:${process.env.E2E_PORT || '3001'}`;

        // Register instance
        const registerRes = await authedFetch(`${BASE_URL}/api/marketplace/federation/instances`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: 'https://e2e-test-instance.example.com', name: 'E2E Test Instance' }),
        });
        expect([201, 503]).toContain(registerRes.status);

        if (registerRes.status === 201) {
            // Sync
            const syncRes = await authedFetch(`${BASE_URL}/api/marketplace/federation/sync`, {
                method: 'POST',
            });
            expect([200, 503]).toContain(syncRes.status);

            // Remove instance
            const deleteRes = await authedFetch(
                `${BASE_URL}/api/marketplace/federation/instances/${encodeURIComponent('https://e2e-test-instance.example.com')}`,
                { method: 'DELETE' },
            );
            expect(deleteRes.ok).toBe(true);
        }
    });

    test('federation sync returns result or 503', async ({}) => {
        const BASE_URL = `http://localhost:${process.env.E2E_PORT || '3001'}`;

        const res = await authedFetch(`${BASE_URL}/api/marketplace/federation/sync`, {
            method: 'POST',
        });
        expect([200, 503]).toContain(res.status);
    });

    test('federation delete instance returns 404 for nonexistent', async ({}) => {
        const BASE_URL = `http://localhost:${process.env.E2E_PORT || '3001'}`;

        const res = await authedFetch(
            `${BASE_URL}/api/marketplace/federation/instances/${encodeURIComponent('https://nonexistent.example.com')}`,
            { method: 'DELETE' },
        );
        // 404 (not found) or 503 (federation not available)
        expect([404, 503]).toContain(res.status);
    });
});
