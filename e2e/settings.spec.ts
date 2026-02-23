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
        const rendered = await page.locator('h2').count() > 0
            || await page.locator('.settings__section').count() > 0;

        if (!rateLimited && rendered) return;

        if (attempt < maxRetries) {
            const match = body.match(/"retryAfter"\s*:\s*(\d+)/);
            const wait = Math.min(Math.max(Number(match?.[1] ?? 5), 3), 10);
            await page.waitForTimeout(wait * 1000 + 500);
        }
    }
}

test.describe('Settings', () => {
    test('page loads with all sections', async ({ page }) => {
        await gotoWithRetry(page, '/settings');

        await expect(page.locator('h2')).toContainText('Settings');
        const sections = page.locator('.settings__section');
        expect(await sections.count()).toBeGreaterThanOrEqual(3);

        // Verify key section toggles exist
        const toggleTexts = await page.locator('.section-toggle').allTextContents();
        const joined = toggleTexts.join(' ');
        // At least some core sections should be present
        expect(joined).toContain('System Info');
        expect(joined).toContain('Health');
    });

    test('system info shows stats', async ({ page }) => {
        await gotoWithRetry(page, '/settings');

        await expect(page.locator('.info-grid').first()).toBeVisible({ timeout: 10000 });

        const labels = await page.locator('.info-label').allTextContents();
        const joined = labels.join(' ');
        expect(joined).toContain('Schema Version');
        expect(joined).toContain('Agents');
        expect(joined).toContain('Projects');
        expect(joined).toContain('Sessions');
    });

    test('health grid with status dots', async ({ page }) => {
        await gotoWithRetry(page, '/settings');

        await expect(page.locator('.health-grid').first()).toBeVisible({ timeout: 10000 });

        const healthItems = page.locator('.health-item');
        expect(await healthItems.count()).toBeGreaterThanOrEqual(3);

        const dot = page.locator('.health-dot').first();
        const status = await dot.getAttribute('data-status');
        expect(['ok', 'warn', 'off']).toContain(status);
    });

    test('credit config editable', async ({ page }) => {
        await gotoWithRetry(page, '/settings');

        await expect(page.locator('.credit-grid').first()).toBeVisible({ timeout: 10000 });

        // Modify an input to trigger dirty state
        const input = page.locator('.credit-input').first();
        const originalValue = await input.inputValue();
        await input.clear();
        await input.fill('999');

        await expect(input).toHaveClass(/credit-input--dirty/);
        await expect(page.locator('.dirty-badge').first()).toBeVisible();

        // Discard changes
        await page.locator('button:text("Discard")').click();
        await expect(input).toHaveValue(originalValue);
    });

    test('database backup button exists', async ({ page }) => {
        await gotoWithRetry(page, '/settings');

        const backupBtn = page.locator('.backup-btn');
        await expect(backupBtn).toBeVisible({ timeout: 10000 });
        await expect(backupBtn).toContainText('Create Backup');
        await expect(backupBtn).toBeEnabled();
    });

    test('operational mode buttons', async ({ page }) => {
        await gotoWithRetry(page, '/settings');

        await expect(page.locator('.mode-selector').first()).toBeVisible({ timeout: 10000 });

        const modeBtns = page.locator('.mode-btn');
        expect(await modeBtns.count()).toBe(3);

        // One should be active
        const activeBtn = page.locator('.mode-btn--active');
        expect(await activeBtn.count()).toBe(1);

        // Mode description visible
        await expect(page.locator('.mode-desc').first()).toBeVisible();
    });

    test('section toggle collapses and expands', async ({ page }) => {
        await gotoWithRetry(page, '/settings');

        // Scope to the System Info section specifically
        const section = page.locator('.settings__section').filter({ has: page.locator('.section-toggle:has-text("System Info")') }).first();
        const infoGrid = section.locator('.info-grid');
        await expect(infoGrid).toBeVisible({ timeout: 10000 });

        // Click the System Info toggle to collapse (uses @if, element is removed from DOM)
        const toggle = section.locator('.section-toggle');
        await toggle.click();
        // After collapse, the chevron should change to right-pointing (▶)
        await expect(toggle.locator('.section-chevron')).toContainText('\u25B6', { timeout: 5000 });
        await expect(infoGrid).toHaveCount(0, { timeout: 5000 });

        // Click again to expand
        await toggle.click();
        await expect(section.locator('.info-grid')).toBeVisible({ timeout: 5000 });
    });

    test('API endpoints return data', async ({ api }) => {
        // GET /api/settings
        const settings = await api.getSettings();
        expect(settings.system).toBeDefined();
        expect(settings.creditConfig).toBeDefined();
        expect(typeof settings.system.schemaVersion).toBe('number');

        // GET /api/health
        const healthRes = await fetch(`${BASE_URL}/api/health`);
        expect(healthRes.ok).toBe(true);
        const health = await healthRes.json();
        expect(health.status).toBeTruthy();

        // GET /api/operational-mode
        const modeRes = await fetch(`${BASE_URL}/api/operational-mode`);
        expect(modeRes.ok).toBe(true);
        const mode = await modeRes.json();
        expect(mode.mode).toBeTruthy();

        // PUT /api/settings/credits (with valid key)
        const creditRes = await fetch(`${BASE_URL}/api/settings/credits`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credits_per_algo: '1000' }),
        });
        expect(creditRes.ok).toBe(true);
    });

    test('credit config rejects unknown keys', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/settings/credits`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ unknown_key: '123' }),
        });
        expect(res.status).toBe(400);
    });

    test('mode badge shows current mode', async ({ page }) => {
        await gotoWithRetry(page, '/settings');

        const badge = page.locator('.section-badge--mode');
        await expect(badge).toBeVisible({ timeout: 10000 });

        const text = (await badge.textContent())?.trim().toLowerCase() ?? '';
        expect(['normal', 'queued', 'paused']).toContain(text);

        const dataMode = await badge.getAttribute('data-mode');
        expect(['normal', 'queued', 'paused']).toContain(dataMode);
    });
});
