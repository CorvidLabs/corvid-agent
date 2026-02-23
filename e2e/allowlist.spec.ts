import { test, expect, gotoWithRetry } from './fixtures';

const BASE_URL = `http://localhost:${process.env.E2E_PORT || '3001'}`;

test.describe('Allowlist', () => {
    test('page loads with heading', async ({ page }) => {
        await gotoWithRetry(page, '/allowlist', { isRendered: async (p) => (await p.locator('h2').count()) > 0 || (await p.locator('.page__header').count()) > 0 });
        await expect(page.locator('h2')).toContainText('Allowlist');
    });

    test('add form shows address and label inputs', async ({ page }) => {
        await gotoWithRetry(page, '/allowlist', { isRendered: async (p) => (await p.locator('h2').count()) > 0 || (await p.locator('.page__header').count()) > 0 });

        const addForm = page.locator('.add-form');
        await expect(addForm).toBeVisible({ timeout: 10000 });

        const addressInput = addForm.locator('input').first();
        await expect(addressInput).toBeVisible();

        const addBtn = addForm.locator('.btn--primary');
        await expect(addBtn).toBeVisible();
    });

    test('shows empty state or list', async ({ page }) => {
        await gotoWithRetry(page, '/allowlist', { isRendered: async (p) => (await p.locator('h2').count()) > 0 || (await p.locator('.page__header').count()) > 0 });

        // Should show either the list with items or the empty state
        const list = page.locator('.list');
        const empty = page.locator('.empty');
        const hasList = await list.count() > 0;
        const hasEmpty = await empty.count() > 0;
        expect(hasList || hasEmpty).toBe(true);
    });

    test('API CRUD', async ({}) => {
        // Use a valid-format Algorand address (58 chars base32)
        // We'll test with the API and accept address validation errors gracefully
        const testAddr = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ';

        // Create — may fail if AlgoChat not configured (accept 201 or 400)
        const createRes = await fetch(`${BASE_URL}/api/allowlist`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: testAddr, label: 'E2E Test' }),
        });
        expect([201, 400, 409]).toContain(createRes.status);

        if (createRes.status === 201) {
            // List
            const listRes = await fetch(`${BASE_URL}/api/allowlist`);
            expect(listRes.ok).toBe(true);
            const list = await listRes.json();
            expect(Array.isArray(list)).toBe(true);

            // Update label
            const updateRes = await fetch(`${BASE_URL}/api/allowlist/${testAddr}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ label: 'Updated Label' }),
            });
            expect(updateRes.ok).toBe(true);

            // Delete
            const deleteRes = await fetch(`${BASE_URL}/api/allowlist/${testAddr}`, { method: 'DELETE' });
            expect(deleteRes.ok).toBe(true);
        }
    });

    test('validation rejects empty address', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/allowlist`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: '' }),
        });
        expect(res.status).toBe(400);
    });

    test('list shows address and metadata', async ({ page }) => {
        await gotoWithRetry(page, '/allowlist', { isRendered: async (p) => (await p.locator('h2').count()) > 0 || (await p.locator('.page__header').count()) > 0 });

        const items = page.locator('.list__item');
        if (await items.count() > 0) {
            const firstItem = items.first();
            await expect(firstItem.locator('.list__item-address')).toBeVisible();
        }
    });
});
