import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

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
            const wait = Math.max(Number(match?.[1] ?? 5), 3);
            await page.waitForTimeout(wait * 1000 + 500);
        }
    }
}

test.describe('Sessions', () => {
    test('session list renders', async ({ page, api }) => {
        await api.seedProject('Session Project');

        await gotoWithRetry(page, '/sessions');

        // Session list page should load without errors
        await expect(page.locator('h2')).toBeVisible();
    });

    test('session view shows terminal output with correct structure', async ({ page, api }) => {
        const project = await api.seedProject('View Project');
        const agent = await api.seedAgent('View Agent');

        // Create a session via API
        const res = await fetch('http://localhost:3000/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                projectId: project.id,
                agentId: agent.id,
                name: 'E2E Session',
                initialPrompt: 'Test prompt',
            }),
        });
        const session = await res.json();

        await gotoWithRetry(page, `/sessions/${session.id}`);

        // Should show the session view
        await expect(page.locator('.session-view')).toBeVisible({ timeout: 10000 });
    });

    test('session list shows table layout', async ({ page, api }) => {
        const project = await api.seedProject('Table Project');
        const agent = await api.seedAgent('Table Agent');

        // Create a session via API
        const res = await fetch('http://localhost:3000/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                projectId: project.id,
                agentId: agent.id,
                name: 'Table Test Session',
                initialPrompt: 'Test prompt',
            }),
        });
        expect(res.ok).toBe(true);

        await gotoWithRetry(page, '/sessions');

        // Verify session table structure
        await expect(page.locator('.session-table')).toBeVisible({ timeout: 10000 });

        const rows = page.locator('.session-table__row');
        expect(await rows.count()).toBeGreaterThanOrEqual(1);
    });
});
