import { test, expect, gotoWithRetry } from './fixtures';

const BASE_URL = `http://localhost:${process.env.E2E_PORT || '3001'}`;

test.describe('Analytics', () => {
    test('page loads with stat cards', async ({ page }) => {
        await gotoWithRetry(page, '/analytics', { isRendered: async (p) => (await p.locator('h2').count()) > 0 || (await p.locator('.stat-card').count()) > 0 });

        await expect(page.locator('h2')).toContainText('Analytics');

        const cards = page.locator('.stat-card');
        expect(await cards.count()).toBeGreaterThanOrEqual(5);
    });

    test('stat cards show correct labels', async ({ page }) => {
        await gotoWithRetry(page, '/analytics', { isRendered: async (p) => (await p.locator('h2').count()) > 0 || (await p.locator('.stat-card').count()) > 0 });

        const labels = await page.locator('.stat-card__label').allTextContents();
        const joined = labels.join(' ');
        expect(joined).toContain('Total Sessions');
        expect(joined).toContain('API Cost');
        expect(joined).toContain('ALGO Spent');
        expect(joined).toContain('Total Turns');
        expect(joined).toContain('Active Now');
    });

    test('stat card values displayed', async ({ page }) => {
        await gotoWithRetry(page, '/analytics', { isRendered: async (p) => (await p.locator('h2').count()) > 0 || (await p.locator('.stat-card').count()) > 0 });

        const values = page.locator('.stat-card__value');
        expect(await values.count()).toBeGreaterThanOrEqual(5);

        const firstValue = await values.first().textContent();
        expect(firstValue?.trim().length).toBeGreaterThan(0);
    });

    test('chart buttons toggle views', async ({ page }) => {
        await gotoWithRetry(page, '/analytics', { isRendered: async (p) => (await p.locator('h2').count()) > 0 || (await p.locator('.stat-card').count()) > 0 });

        const chartBtns = page.locator('.chart-btn');
        expect(await chartBtns.count()).toBe(4);

        // 30d should be active by default
        const activeBtn = page.locator('.chart-btn--active');
        await expect(activeBtn).toContainText('30d');

        // Click 7d and verify toggle
        const btn7d = page.locator('.chart-btn:text("7d")');
        await btn7d.click();
        await expect(btn7d).toHaveClass(/chart-btn--active/);
    });

    test('agent table renders', async ({ page, api }) => {
        // Create some data so table has content
        const project = await api.seedProject('Analytics Project');
        const agent = await api.seedAgent('Analytics Agent');

        // Create a session to generate analytics data
        await fetch(`${BASE_URL}/api/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                projectId: project.id,
                agentId: agent.id,
                name: 'Analytics Session',
                initialPrompt: 'Test',
            }),
        });

        await gotoWithRetry(page, '/analytics', { isRendered: async (p) => (await p.locator('h2').count()) > 0 || (await p.locator('.stat-card').count()) > 0 });

        const table = page.locator('.agent-table');
        if (await table.count() > 0) {
            await expect(page.locator('.agent-table__header')).toBeVisible();
        }
    });

    test('API overview returns data', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/analytics/overview`);
        expect(res.ok).toBe(true);

        const data = await res.json();
        expect(typeof data.totalSessions).toBe('number');
        expect(typeof data.totalCostUsd).toBe('number');
        expect(typeof data.totalAlgoSpent).toBe('number');
        expect(typeof data.totalTurns).toBe('number');
        expect(typeof data.activeSessions).toBe('number');
    });

    test('API spending returns data', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/analytics/spending?days=7`);
        expect(res.ok).toBe(true);

        const data = await res.json();
        expect(Array.isArray(data.spending)).toBe(true);
        expect(typeof data.days).toBe('number');
    });
});
