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
            || await page.locator('.form').count() > 0;

        if (!rateLimited && rendered) return;

        if (attempt < maxRetries) {
            const match = body.match(/"retryAfter"\s*:\s*(\d+)/);
            const wait = Math.min(Math.max(Number(match?.[1] ?? 5), 3), 10);
            await page.waitForTimeout(wait * 1000 + 500);
        }
    }
}

test.describe('Session Launcher', () => {
    test('page loads with heading and form', async ({ page }) => {
        await gotoWithRetry(page, '/sessions/new');

        await expect(page.locator('h2')).toContainText('Launch Session');
        await expect(page.locator('.form')).toBeVisible({ timeout: 10000 });
    });

    test('form shows all fields', async ({ page, api }) => {
        await api.seedProject('Launcher Project');
        await api.seedAgent('Launcher Agent');

        await gotoWithRetry(page, '/sessions/new');

        // Project select
        const projectSelect = page.locator('.form__input').first();
        await expect(projectSelect).toBeVisible({ timeout: 10000 });

        // Session name input
        const nameInput = page.locator('input[placeholder*="Optional label"]');
        if (await nameInput.count() > 0) {
            await expect(nameInput).toBeVisible();
        }

        // Initial prompt textarea
        const textarea = page.locator('.form__textarea');
        if (await textarea.count() > 0) {
            await expect(textarea).toBeVisible();
        }

        // Launch and Cancel buttons
        await expect(page.locator('.btn--primary')).toBeVisible();
        await expect(page.locator('.btn--secondary')).toBeVisible();
    });

    test('cancel navigates back to sessions', async ({ page }) => {
        await gotoWithRetry(page, '/sessions/new');

        await page.locator('.btn--secondary').click();
        await page.waitForURL('/sessions', { timeout: 10000 });
    });

    test('launch button disabled without project', async ({ page }) => {
        await gotoWithRetry(page, '/sessions/new');

        const launchBtn = page.locator('.btn--primary');
        await expect(launchBtn).toBeVisible({ timeout: 10000 });
        // Button should be disabled when form is invalid (no project selected)
        await expect(launchBtn).toBeDisabled();
    });

    test('create session via API', async ({ api }) => {
        const project = await api.seedProject('API Session Project');
        const agent = await api.seedAgent('API Session Agent');

        // Create session
        const createRes = await fetch(`${BASE_URL}/api/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                projectId: project.id,
                agentId: agent.id,
                name: `API Session ${Date.now()}`,
            }),
        });
        expect(createRes.status).toBe(201);
        const session = await createRes.json();
        expect(session.id).toBeTruthy();
        expect(session.status).toBeTruthy();

        // Verify via GET
        const getRes = await fetch(`${BASE_URL}/api/sessions/${session.id}`);
        expect(getRes.ok).toBe(true);
    });

    test('validation rejects missing projectId', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'No Project' }),
        });
        expect(res.status).toBe(400);
    });
});
