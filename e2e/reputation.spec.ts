import { test, expect , authedFetch , gotoWithRetry } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * Navigate to the reputation page, retrying on 429 responses.
 * Also handles the case where the page HTML loads but the Angular lazy
 * chunk gets rate-limited, leaving an empty &lt;main&gt;.
 */
async function gotoReputation(page: Page, maxRetries = 3): Promise<void> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        await gotoWithRetry(page, '/reputation');
        await page.waitForLoadState('networkidle');

        const body = await page.locator('body').textContent() ?? '';
        const rateLimited = body.includes('Too many requests');
        // Check if the component actually rendered (h2 present)
        const rendered = await page.locator('h2').count() > 0;

        if (!rateLimited && rendered) return;

        if (attempt < maxRetries) {
            const match = body.match(/"retryAfter"\s*:\s*(\d+)/);
            const wait = Math.min(Math.max(Number(match?.[1] ?? 5), 3), 10);
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

    test('score ring has data-level attribute', async ({ page, api }) => {
        const agent = await api.seedAgent('Rep Ring Level Agent');
        await api.seedReputationEvent(agent.id, 'task_completed', 10);
        await api.computeScore(agent.id);

        await gotoReputation(page);

        const card = page.locator('.agent-card').first();
        await expect(card).toBeVisible({ timeout: 5000 });

        // Score ring fill should have a data-level attribute
        const fill = card.locator('.score-ring__fill');
        await expect(fill).toBeVisible();
        const level = await fill.getAttribute('data-level');
        expect(['verified', 'high', 'medium', 'low', 'untrusted']).toContain(level);
    });

    test('trust badge color matches trust level', async ({ page, api }) => {
        const agent = await api.seedAgent('Rep Trust Color Agent');
        await api.seedReputationEvent(agent.id, 'task_completed', 10);
        await api.computeScore(agent.id);

        await gotoReputation(page);

        const card = page.locator('.agent-card').first();
        await expect(card).toBeVisible({ timeout: 5000 });

        const badge = card.locator('.trust-badge');
        await expect(badge).toBeVisible();
        const level = await badge.getAttribute('data-level');
        expect(['verified', 'high', 'medium', 'low', 'untrusted']).toContain(level);
    });

    test('component bar weights and values visible', async ({ page, api }) => {
        const agent = await api.seedAgent('Rep Weights Agent');
        await api.seedReputationEvent(agent.id, 'task_completed', 10);
        await api.computeScore(agent.id);

        await gotoReputation(page);

        const card = page.locator('.agent-card').first();
        await expect(card).toBeVisible({ timeout: 5000 });

        // Each bar should have weight and value
        const weights = card.locator('.comp-bar__weight');
        expect(await weights.count()).toBe(5);

        const values = card.locator('.comp-bar__value');
        expect(await values.count()).toBe(5);

        // First weight should have numeric text
        const firstWeight = await weights.first().textContent();
        expect(firstWeight?.trim().length).toBeGreaterThan(0);
    });

    test('detail panel shows expanded component bars', async ({ page, api }) => {
        const agent = await api.seedAgent('Rep Detail Bars Agent');
        await api.seedReputationEvent(agent.id, 'task_completed', 10);
        await api.computeScore(agent.id);

        await gotoReputation(page);

        const card = page.locator('.agent-card').first();
        await expect(card).toBeVisible({ timeout: 5000 });
        await card.click();

        await expect(page.locator('.detail-panel')).toBeVisible({ timeout: 5000 });

        // Detail panel should have expanded bars
        const detailBars = page.locator('.detail-bar');
        expect(await detailBars.count()).toBe(5);

        // Each bar should have label, weight, and value
        await expect(page.locator('.detail-bar__label').first()).toBeVisible();
        await expect(page.locator('.detail-bar__value').first()).toBeVisible();
    });

    test('event impact shows positive/negative coloring', async ({ page, api }) => {
        const agent = await api.seedAgent('Rep Impact Agent');
        await api.seedReputationEvent(agent.id, 'task_completed', 10);
        await api.seedReputationEvent(agent.id, 'task_failed', -5);
        await api.computeScore(agent.id);

        await gotoReputation(page);

        const card = page.locator('.agent-card:has-text("Rep Impact Agent")').first();
        await expect(card).toBeVisible({ timeout: 5000 });
        await card.click();

        await expect(page.locator('.events-list')).toBeVisible({ timeout: 5000 });

        // Event impacts should have data-impact attribute
        const impacts = page.locator('.event-impact');
        expect(await impacts.count()).toBeGreaterThanOrEqual(1);

        // Check that impacts have valid data-impact values
        const firstImpact = await impacts.first().getAttribute('data-impact');
        expect(['positive', 'negative']).toContain(firstImpact);
    });

    test('attestation section in detail panel', async ({ page, api }) => {
        const agent = await api.seedAgent('Rep Attestation Agent');
        await api.seedReputationEvent(agent.id, 'task_completed', 10);
        await api.computeScore(agent.id);

        await gotoReputation(page);

        const card = page.locator('.agent-card:has-text("Rep Attestation Agent")').first();
        await expect(card).toBeVisible({ timeout: 5000 });
        await card.click();

        await expect(page.locator('.detail-panel')).toBeVisible({ timeout: 5000 });

        // Attestation section may or may not be visible depending on AlgoChat config
        const attestation = page.locator('.attestation');
        if (await attestation.count() > 0) {
            await expect(attestation).toBeVisible();
        }
        // Regardless, the detail panel should show the expanded component bars
        await expect(page.locator('.detail-bar').first()).toBeVisible();
    });

    test('API endpoints for reputation', async ({ api }) => {
        const BASE_URL = `http://localhost:${process.env.E2E_PORT || '3001'}`;
        const agent = await api.seedAgent('Rep API Agent');

        // Create events
        await api.seedReputationEvent(agent.id, 'task_completed', 10);
        await api.seedReputationEvent(agent.id, 'task_failed', -3);

        // Compute score
        const computeRes = await authedFetch(`${BASE_URL}/api/reputation/scores/${agent.id}`, { method: 'POST' });
        expect(computeRes.ok).toBe(true);
        const score = await computeRes.json();
        expect(typeof score.overallScore).toBe('number');
        expect(['verified', 'high', 'medium', 'low', 'untrusted']).toContain(score.trustLevel);
        expect(score.components).toBeDefined();

        // Get score
        const getRes = await authedFetch(`${BASE_URL}/api/reputation/scores/${agent.id}`);
        expect(getRes.ok).toBe(true);

        // Get events
        const eventsRes = await authedFetch(`${BASE_URL}/api/reputation/events/${agent.id}`);
        expect(eventsRes.ok).toBe(true);
        const events = await eventsRes.json();
        expect(Array.isArray(events)).toBe(true);
        expect(events.length).toBeGreaterThanOrEqual(2);

        // Compute all scores
        const allRes = await authedFetch(`${BASE_URL}/api/reputation/scores`, { method: 'POST' });
        expect(allRes.ok).toBe(true);
    });

    // ─── Additional API coverage ─────────────────────────────────────────

    test('list all scores returns array', async ({ api }) => {
        const BASE_URL = `http://localhost:${process.env.E2E_PORT || '3001'}`;

        // Ensure at least one score exists
        const agent = await api.seedAgent('List Scores Agent');
        await api.seedReputationEvent(agent.id, 'task_completed', 10);
        await api.computeScore(agent.id);

        const res = await authedFetch(`${BASE_URL}/api/reputation/scores`);
        expect(res.ok).toBe(true);
        const data = await res.json();
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBeGreaterThanOrEqual(1);
        expect(data[0].agentId).toBeDefined();
        expect(typeof data[0].overallScore).toBe('number');
        expect(data[0].trustLevel).toBeDefined();
    });

    test('create reputation event via API', async ({ api }) => {
        const BASE_URL = `http://localhost:${process.env.E2E_PORT || '3001'}`;
        const agent = await api.seedAgent('Event API Agent');

        const res = await authedFetch(`${BASE_URL}/api/reputation/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                agentId: agent.id,
                eventType: 'session_completed',
                scoreImpact: 3,
            }),
        });
        expect([201, 200]).toContain(res.status);
    });

    test('get attestation returns 404 for agent with no attestation', async ({ api }) => {
        const BASE_URL = `http://localhost:${process.env.E2E_PORT || '3001'}`;
        const agent = await api.seedAgent('No Attestation Agent');

        const res = await authedFetch(`${BASE_URL}/api/reputation/attestation/${agent.id}`);
        // 404 (no attestation) or 503 (AlgoChat unavailable)
        expect([404, 503]).toContain(res.status);
    });

    test('create attestation for agent', async ({ api }) => {
        const BASE_URL = `http://localhost:${process.env.E2E_PORT || '3001'}`;
        const agent = await api.seedAgent('Attestation Agent');
        await api.seedReputationEvent(agent.id, 'task_completed', 10);
        await api.computeScore(agent.id);

        const res = await authedFetch(`${BASE_URL}/api/reputation/attestation/${agent.id}`, {
            method: 'POST',
        });
        // 201 (created) or 503 (AlgoChat unavailable)
        expect([201, 200, 503]).toContain(res.status);
        if (res.status === 201 || res.status === 200) {
            const data = await res.json();
            expect(typeof data.hash).toBe('string');
        }
    });
});
