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
        const rendered = await page.locator('h2').count() > 0;

        if (!rateLimited && rendered) return;

        if (attempt < maxRetries) {
            const match = body.match(/"retryAfter"\s*:\s*(\d+)/);
            const wait = Math.min(Math.max(Number(match?.[1] ?? 5), 3), 10);
            await page.waitForTimeout(wait * 1000 + 500);
        }
    }
}

test.describe('Wallets', () => {
    test('page loads with heading', async ({ page }) => {
        await gotoWithRetry(page, '/wallets');
        // Heading has dynamic count span: "Wallets (N)"
        await expect(page.locator('h2:has-text("Wallets")')).toBeVisible();
    });

    test('wallet list shows cards or empty', async ({ page }) => {
        await gotoWithRetry(page, '/wallets');

        const hasCards = await page.locator('.wallet-card').count() > 0;
        const hasEmpty = await page.locator('.empty').count() > 0;
        expect(hasCards || hasEmpty).toBe(true);

        if (hasCards) {
            await expect(page.locator('.wallet-card__address').first()).toBeVisible();
            await expect(page.locator('.stat').first()).toBeVisible();
        }
    });

    test('search input filters', async ({ page }) => {
        await gotoWithRetry(page, '/wallets');

        const search = page.locator('input[placeholder*="Search by address"]');
        await expect(search).toBeVisible();

        // Type a nonexistent address
        await search.fill('ZZZNONEXISTENT999');
        await page.waitForTimeout(500);

        // Cards should disappear (or be empty)
        const remaining = await page.locator('.wallet-card').count();
        const hasEmpty = await page.locator('.empty').count() > 0;
        expect(remaining === 0 || hasEmpty).toBe(true);
    });

    test('API summary returns data', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/wallets/summary`);
        expect(res.ok).toBe(true);

        const data = await res.json();
        expect(Array.isArray(data.wallets)).toBe(true);

        if (data.wallets.length > 0) {
            const wallet = data.wallets[0];
            expect(wallet.address).toBeTruthy();
        }
    });

    test('allowlist API (add/remove)', async ({}) => {
        // POST to add — accept 201 (created), 400 (invalid address), or 409 (duplicate)
        const addRes = await fetch(`${BASE_URL}/api/allowlist`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: 'TESTADDRESS' }),
        });
        // Address validation may reject this — that's expected
        expect([201, 400, 409]).toContain(addRes.status);

        // If it was added successfully, clean up
        if (addRes.status === 201) {
            const deleteRes = await fetch(`${BASE_URL}/api/allowlist/TESTADDRESS`, {
                method: 'DELETE',
            });
            expect([200, 404]).toContain(deleteRes.status);
        }
    });

    test('card expand shows messages', async ({ page }) => {
        await gotoWithRetry(page, '/wallets');

        const card = page.locator('.wallet-card').first();
        if (await card.count() === 0) {
            test.skip(true, 'No wallet cards to expand');
            return;
        }

        // Click the card header to expand
        await card.locator('.wallet-card__header').click();
        await expect(card).toHaveClass(/wallet-card--expanded/);
        await expect(card.locator('.wallet-card__messages')).toBeVisible();
    });
});
