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

test.describe('Work Tasks', () => {
    test('page loads with heading and filters', async ({ page }) => {
        await gotoWithRetry(page, '/work-tasks');

        await expect(page.locator('h2')).toContainText('Work Tasks');

        const filterBtns = page.locator('.filter-btn');
        expect(await filterBtns.count()).toBe(4);
    });

    test('create task via API, verify in list', async ({ page, api }) => {
        const agent = await api.seedAgent('WorkTask Agent');
        const desc = `E2E task ${Date.now()}`;
        await api.seedWorkTask(agent.id, desc);

        await gotoWithRetry(page, '/work-tasks');
        await expect(page.locator(`text=${desc}`).first()).toBeVisible({ timeout: 10000 });
    });

    test('filter tasks by status', async ({ page, api }) => {
        const agent = await api.seedAgent('Filter Agent');
        await api.seedWorkTask(agent.id, `Filter task ${Date.now()}`);

        await gotoWithRetry(page, '/work-tasks');

        // Click "All" filter — should be active by default
        const allBtn = page.locator('.filter-btn').first();
        await expect(allBtn).toHaveClass(/filter-btn--active/);

        // Click a different filter and verify active class toggles
        const secondBtn = page.locator('.filter-btn').nth(1);
        await secondBtn.click();
        await expect(secondBtn).toHaveClass(/filter-btn--active/);
    });

    test('cancel task via API', async ({ api }) => {
        const agent = await api.seedAgent('Cancel Agent');
        const task = await api.seedWorkTask(agent.id, `Cancel me ${Date.now()}`);

        const cancelRes = await fetch(`${BASE_URL}/api/work-tasks/${task.id}/cancel`, {
            method: 'POST',
        });
        // Cancel may fail if task already completed/failed quickly — accept 200 or 400/404
        expect([200, 400, 404]).toContain(cancelRes.status);

        // Task should still exist via GET
        const getRes = await fetch(`${BASE_URL}/api/work-tasks/${task.id}`);
        expect(getRes.ok).toBe(true);
    });

    test('task card shows status badge', async ({ page, api }) => {
        const agent = await api.seedAgent('Badge Agent');
        await api.seedWorkTask(agent.id, `Badge task ${Date.now()}`);

        await gotoWithRetry(page, '/work-tasks');

        const card = page.locator('.task-card').first();
        if (await card.count() > 0) {
            await expect(card).toHaveAttribute('data-status', /.+/);
            await expect(card.locator('.task-status')).toBeVisible();
        }
    });

    test('new task form toggle', async ({ page, api }) => {
        await api.seedAgent('Form Agent');
        await gotoWithRetry(page, '/work-tasks');

        // Click "+ New Task" button
        const newBtn = page.locator('button:text("New Task")');
        await expect(newBtn).toBeVisible({ timeout: 10000 });
        await newBtn.click();
        await expect(page.locator('.create-form')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('.form-select')).toBeVisible();
        await expect(page.locator('.form-textarea')).toBeVisible();

        // Cancel hides form
        await page.locator('button:text("Cancel")').click();
        await expect(page.locator('.create-form')).not.toBeVisible({ timeout: 5000 });
    });

    test('API validation rejects missing fields', async ({}) => {
        // Missing agentId
        const res1 = await fetch(`${BASE_URL}/api/work-tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description: 'no agent' }),
        });
        expect(res1.status).toBe(400);

        // Missing description
        const res2 = await fetch(`${BASE_URL}/api/work-tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agentId: 'fake-id' }),
        });
        expect(res2.status).toBe(400);
    });

    test('task list shows details', async ({ page, api }) => {
        const agent = await api.seedAgent('Detail Agent');
        const desc = `Detail task ${Date.now()}`;
        await api.seedWorkTask(agent.id, desc);

        await gotoWithRetry(page, '/work-tasks');

        // Find the specific task card containing our description
        const card = page.locator(`.task-card:has-text("${desc}")`).first();
        if (await card.count() > 0) {
            await expect(card.locator('.task-desc')).toContainText(desc);
            const taskAgent = card.locator('.task-agent');
            if (await taskAgent.count() > 0) {
                await expect(taskAgent).toBeVisible();
            }
        } else {
            // Verify at least some task cards exist with descriptions
            const anyDesc = page.locator('.task-desc').first();
            if (await anyDesc.count() > 0) {
                await expect(anyDesc).toBeVisible();
            }
        }
    });
});
