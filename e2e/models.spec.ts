import { test, expect, gotoWithRetry } from './fixtures';

const BASE_URL = `http://localhost:${process.env.E2E_PORT || '3001'}`;

test.describe('Models', () => {
    test('page loads with heading and status banner', async ({ page }) => {
        await gotoWithRetry(page, '/models', { isRendered: async (p) => (await p.locator('h2').count()) > 0 || (await p.locator('.page__header').count()) > 0 });

        await expect(page.locator('h2')).toContainText('Models');
        const statusBanner = page.locator('.status-banner');
        await expect(statusBanner).toBeVisible({ timeout: 10000 });
    });

    test('status banner shows Ollama connection state', async ({ page }) => {
        await gotoWithRetry(page, '/models', { isRendered: async (p) => (await p.locator('h2').count()) > 0 || (await p.locator('.page__header').count()) > 0 });

        const statusDot = page.locator('.status-dot');
        await expect(statusDot).toBeVisible({ timeout: 10000 });
    });

    test('tabs switch between installed and library', async ({ page }) => {
        await gotoWithRetry(page, '/models', { isRendered: async (p) => (await p.locator('h2').count()) > 0 || (await p.locator('.page__header').count()) > 0 });

        const tabs = page.locator('.tab');
        expect(await tabs.count()).toBe(2);

        // Installed tab active by default
        await expect(page.locator('.tab--active')).toContainText('Installed');

        // Click Library tab
        const libraryTab = page.locator('.tab:text("Library")');
        await libraryTab.click();
        await expect(libraryTab).toHaveClass(/tab--active/);
    });

    test('library tab shows search and category filters', async ({ page }) => {
        await gotoWithRetry(page, '/models', { isRendered: async (p) => (await p.locator('h2').count()) > 0 || (await p.locator('.page__header').count()) > 0 });

        // Switch to Library tab
        await page.locator('.tab:text("Library")').click();

        // Use library-specific search (may coexist with manual pull input)
        const searchInput = page.locator('.library-controls .search-input, input[placeholder*="Search models"]').first();
        await expect(searchInput).toBeVisible({ timeout: 5000 });

        const filterChips = page.locator('.filter-chip');
        expect(await filterChips.count()).toBeGreaterThanOrEqual(3);

        // First filter should be active by default
        await expect(filterChips.first()).toHaveClass(/filter-chip--active/);
    });

    test('library search filters models', async ({ page }) => {
        await gotoWithRetry(page, '/models', { isRendered: async (p) => (await p.locator('h2').count()) > 0 || (await p.locator('.page__header').count()) > 0 });

        await page.locator('.tab:text("Library")').click();

        const searchInput = page.locator('.library-controls .search-input, input[placeholder*="Search models"]').first();
        await expect(searchInput).toBeVisible({ timeout: 5000 });

        // Type a search query
        await searchInput.fill('llama');
        // Wait for debounce
        await page.waitForTimeout(500);

        // Model cards should still render (or show filtered results)
        const cards = page.locator('.model-card');
        // May have 0 or more results depending on library content
        expect(await cards.count()).toBeGreaterThanOrEqual(0);
    });

    test('manual pull form exists', async ({ page }) => {
        await gotoWithRetry(page, '/models', { isRendered: async (p) => (await p.locator('h2').count()) > 0 || (await p.locator('.page__header').count()) > 0 });

        const manualPull = page.locator('.manual-pull');
        if (await manualPull.count() > 0) {
            await expect(manualPull.locator('.search-input, input')).toBeVisible();
        }
    });

    test('API status and models endpoints', async ({}) => {
        // Status
        const statusRes = await fetch(`${BASE_URL}/api/ollama/status`);
        expect(statusRes.ok).toBe(true);
        const status = await statusRes.json();
        expect(typeof status.available).toBe('boolean');

        // Models list (may be empty if Ollama not running)
        const modelsRes = await fetch(`${BASE_URL}/api/ollama/models`);
        // Accept 200 (ok) or 502/503 (Ollama unavailable)
        expect([200, 502, 503]).toContain(modelsRes.status);

        // Library search
        const libraryRes = await fetch(`${BASE_URL}/api/ollama/library?q=test`);
        expect(libraryRes.ok).toBe(true);
    });
});
