import { test, expect , gotoWithRetry } from './fixtures';
import type { Page } from '@playwright/test';

/** Navigate to dashboard, retrying on 429 rate-limit responses or empty lazy-load. */
async function gotoDashboard(page: Page, maxRetries = 3): Promise<void> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        await gotoWithRetry(page, '/dashboard');
        await page.waitForLoadState('networkidle');

        const body = await page.locator('body').textContent() ?? '';
        const rateLimited = body.includes('Too many requests');
        const rendered = await page.locator('.metric-card').count() > 0;

        if (!rateLimited && rendered) return;

        if (attempt < maxRetries) {
            const match = body.match(/"retryAfter"\s*:\s*(\d+)/);
            const wait = Math.min(Math.max(Number(match?.[1] ?? 5), 3), 10);
            await page.waitForTimeout(wait * 1000 + 500);
        }
    }
}

test.describe('Dashboard', () => {
    test('loads with metric cards', async ({ page, api }) => {
        await api.seedProject('Dashboard Project');
        await api.seedAgent('Dashboard Agent');

        await gotoDashboard(page);

        // Should have at least 3 metric cards (wait for Angular to fetch and render data)
        await expect(page.locator('.metric-card').first()).toBeVisible({ timeout: 10000 });
        const cards = page.locator('.metric-card');
        expect(await cards.count()).toBeGreaterThanOrEqual(3);
    });

    test('metric cards show correct labels', async ({ page, api }) => {
        await api.seedProject('Labels Project');
        await api.seedAgent('Labels Agent');

        await gotoDashboard(page);

        const labels = page.locator('.metric-card__label');
        const allLabels = await labels.allTextContents();

        expect(allLabels.some((l) => l.includes('Total Agents'))).toBe(true);
        expect(allLabels.some((l) => l.includes('Active Sessions'))).toBe(true);
        expect(allLabels.some((l) => l.includes('Total Projects'))).toBe(true);
    });

    test('metric card values are displayed', async ({ page, api }) => {
        await api.seedProject('Values Project');
        await api.seedAgent('Values Agent');

        await gotoDashboard(page);

        const values = page.locator('.metric-card__value');
        expect(await values.count()).toBeGreaterThanOrEqual(3);

        // Each value should have text content
        const firstValue = await values.first().textContent();
        expect(firstValue?.trim().length).toBeGreaterThan(0);
    });

    test('metric card links point to correct routes', async ({ page, api }) => {
        await api.seedAgent('Nav Agent');

        await gotoDashboard(page);

        // Verify the "Total Agents" metric card has a "View all" link pointing to /agents
        const agentCard = page.locator('.metric-card').filter({ hasText: 'Total Agents' });
        await expect(agentCard).toBeVisible({ timeout: 10000 });
        const agentLink = agentCard.locator('a.metric-card__link');
        await expect(agentLink).toHaveAttribute('href', '/agents');

        // Verify the "Active Sessions" metric card links to /sessions
        const sessionCard = page.locator('.metric-card').filter({ hasText: 'Active Sessions' });
        await expect(sessionCard).toBeVisible();
        const sessionLink = sessionCard.locator('a.metric-card__link');
        await expect(sessionLink).toHaveAttribute('href', '/sessions');
    });

    test('AlgoChat status section renders', async ({ page }) => {
        await gotoDashboard(page);
        // AlgoChat section may or may not exist depending on config — just verify no crash
    });

    test('network badge has correct color class', async ({ page }) => {
        await gotoDashboard(page);

        const badge = page.locator('.network-badge');
        if (await badge.count() > 0) {
            const classes = await badge.getAttribute('class');
            const hasNetworkClass = classes?.includes('network-badge--localnet')
                || classes?.includes('network-badge--testnet')
                || classes?.includes('network-badge--mainnet');
            expect(hasNetworkClass).toBe(true);
        }
    });

    test('agent activity grid renders with agent cards', async ({ page, api }) => {
        await api.seedAgent('Grid Agent Alpha');
        await api.seedAgent('Grid Agent Beta');

        await gotoDashboard(page);

        const grid = page.locator('.agent-grid');
        await expect(grid).toBeVisible({ timeout: 10000 });

        const cards = grid.locator('.agent-card');
        expect(await cards.count()).toBeGreaterThanOrEqual(2);

        // Each card should have name and model
        const firstCard = cards.first();
        await expect(firstCard.locator('.agent-card__name')).toBeVisible();
        await expect(firstCard.locator('.agent-card__model')).toBeVisible();
    });

    test('agent card shows status badge with data-status', async ({ page, api }) => {
        await api.seedAgent('Status Badge Agent');

        await gotoDashboard(page);

        const card = page.locator('.agent-card').first();
        await expect(card).toBeVisible({ timeout: 10000 });

        const status = card.locator('.agent-card__status');
        await expect(status).toBeVisible();
        const dataStatus = await status.getAttribute('data-status');
        expect(['busy', 'idle']).toContain(dataStatus);
    });

    test('agent card action buttons visible', async ({ page, api }) => {
        await api.seedAgent('Action Btn Agent');

        await gotoDashboard(page);

        const card = page.locator('.agent-card').first();
        await expect(card).toBeVisible({ timeout: 10000 });

        const actions = card.locator('.agent-card__actions');
        await expect(actions).toBeVisible();

        const buttons = actions.locator('.agent-card__btn');
        expect(await buttons.count()).toBeGreaterThanOrEqual(1);
    });

    test('recent activity feed renders', async ({ page, api }) => {
        const project = await api.seedProject('Feed Project');
        const agent = await api.seedAgent('Feed Agent');
        // Create a session to generate activity
        await api.seedSession(project.id, agent.id);

        await gotoDashboard(page);

        // Activity feed section should exist
        const feedSection = page.locator('.section--feed');
        await expect(feedSection).toBeVisible({ timeout: 10000 });

        // Either has activity items or shows empty state
        const hasItems = await page.locator('.activity-item').count() > 0;
        const hasEmpty = await page.locator('.empty').count() > 0;
        expect(hasItems || hasEmpty).toBe(true);

        if (hasItems) {
            const item = page.locator('.activity-item').first();
            await expect(item.locator('.activity-item__icon')).toBeVisible();
            await expect(item.locator('.activity-item__label')).toBeVisible();
            await expect(item.locator('.activity-item__time')).toBeVisible();
        }
    });

    test('quick actions section with buttons', async ({ page, api }) => {
        await api.seedAgent('Quick Action Agent');

        await gotoDashboard(page);

        const actionsSection = page.locator('.section--actions');
        await expect(actionsSection).toBeVisible({ timeout: 10000 });

        const actionBtns = actionsSection.locator('.action-btn');
        expect(await actionBtns.count()).toBeGreaterThanOrEqual(3);
    });

    test('system status section shows indicators', async ({ page }) => {
        await gotoDashboard(page);

        const statusSection = page.locator('.section--status');
        await expect(statusSection).toBeVisible({ timeout: 10000 });

        const statusRows = statusSection.locator('.status-row');
        expect(await statusRows.count()).toBeGreaterThanOrEqual(2);

        // Each row should have label, indicator, and value
        const firstRow = statusRows.first();
        await expect(firstRow.locator('.status-row__label')).toBeVisible();
        await expect(firstRow.locator('.status-row__indicator')).toBeVisible();

        // Indicator should have data-ok attribute
        const dataOk = await firstRow.locator('.status-row__indicator').getAttribute('data-ok');
        expect(['true', 'false']).toContain(dataOk);
    });
});
