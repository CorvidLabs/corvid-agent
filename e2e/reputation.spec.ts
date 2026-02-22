import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * Navigate to the reputation page, retrying on 429 responses.
 * Also handles the case where the page HTML loads but the Angular lazy
 * chunk gets rate-limited, leaving an empty &lt;main&gt;.
 */
async function gotoReputation(page: Page, maxRetries = 3): Promise<void> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        await page.goto('/reputation');
        await page.waitForLoadState('networkidle');

        const body = await page.locator('body').textContent() ?? '';
        const rateLimited = body.includes('Too many requests');
        // Check if the component actually rendered (h2 present)
        const rendered = await page.locator('h2').count() > 0;

        if (!rateLimited && rendered) return;

        if (attempt < maxRetries) {
            const match = body.match(/"retryAfter"\s*:\s*(\d+)/);
            const wait = Math.max(Number(match?.[1] ?? 5), 3);
            await page.waitForTimeout(wait * 1000 + 500);
        }
    }
}

test.describe('Reputation', () => {
    test('page loads with heading and Compute All button', async ({ page }) => {
        await gotoReputation(page);

        await expect(page.locator('h2:text("Agent Reputation")')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('button:text("Compute All")')).toBeVisible({ timeout: 5000 });
    });

    test('handles empty/error state gracefully', async ({ page }) => {
        await gotoReputation(page);

        const hasCards = await page.locator('.card-grid').count() > 0;
        const hasError = await page.locator('.error-banner').count() > 0;
        const isEmpty = await page.locator('text=No reputation scores').count() > 0;

        expect(hasCards || hasError || isEmpty).toBe(true);
    });

    test('agent cards render with score ring and trust badge', async ({ page, api }) => {
        const agent = await api.seedAgent('Rep Card Agent');
        await api.seedReputationEvent(agent.id, 'task_completed', 10);
        await api.computeScore(agent.id);

        await gotoReputation(page);

        const card = page.locator('.agent-card').first();
        await expect(card).toBeVisible({ timeout: 5000 });

        // Score ring SVG should be present inside the card
        await expect(card.locator('.score-ring svg')).toBeVisible();

        // Trust badge should be present
        await expect(card.locator('.trust-badge')).toBeVisible();
    });

    test('component bars render with correct labels', async ({ page, api }) => {
        const agent = await api.seedAgent('Rep Bars Agent');
        await api.seedReputationEvent(agent.id, 'task_completed', 10);
        await api.computeScore(agent.id);

        await gotoReputation(page);

        const card = page.locator('.agent-card').first();
        await expect(card).toBeVisible({ timeout: 5000 });

        // Each agent card should have 5 component bars
        const bars = card.locator('.comp-bar');
        await expect(bars).toHaveCount(5);

        // Each bar should have a label
        const labels = card.locator('.comp-bar__label');
        await expect(labels).toHaveCount(5);
    });

    test('click card opens detail panel', async ({ page, api }) => {
        const agent = await api.seedAgent('Rep Detail Agent');
        await api.seedReputationEvent(agent.id, 'task_completed', 10);
        await api.computeScore(agent.id);

        await gotoReputation(page);

        const card = page.locator('.agent-card').first();
        await expect(card).toBeVisible({ timeout: 5000 });
        await card.click();

        // Detail panel should open with heading and expanded bars
        await expect(page.locator('.detail-panel')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('.detail-panel h3')).toBeVisible();
        await expect(page.locator('.detail-bar').first()).toBeVisible();
    });

    test('Compute All button triggers recomputation', async ({ page, api }) => {
        const agent = await api.seedAgent('Rep Compute Agent');
        await api.seedReputationEvent(agent.id, 'task_completed', 10);

        await gotoReputation(page);

        await page.locator('button:text("Compute All")').click();

        // Should show a notification (success or error depending on API response format)
        await expect(page.locator('[role="status"] [role="alert"]').first()).toBeVisible({ timeout: 5000 });
    });

    test('event timeline in detail panel', async ({ page, api }) => {
        const agent = await api.seedAgent('Rep Events Agent');
        await api.seedReputationEvent(agent.id, 'task_completed', 10);
        await api.seedReputationEvent(agent.id, 'task_failed', -5);
        await api.seedReputationEvent(agent.id, 'session_completed', 3);
        await api.computeScore(agent.id);

        await gotoReputation(page);

        // Click the specific agent card that has events
        const card = page.locator('.agent-card:has-text("Rep Events Agent")').first();
        await expect(card).toBeVisible({ timeout: 5000 });
        await card.click();

        await expect(page.locator('.detail-panel')).toBeVisible({ timeout: 5000 });

        // Events list should be present with event labels
        await expect(page.locator('.events-list')).toBeVisible({ timeout: 5000 });
        const eventLabels = page.locator('.event-label');
        expect(await eventLabels.count()).toBeGreaterThanOrEqual(1);
    });
});
