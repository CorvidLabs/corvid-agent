import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

/** Navigate to a page, retrying on 429 rate-limit responses or empty lazy-load. */
async function gotoWithRetry(page: Page, path: string, maxRetries = 3): Promise<void> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');

        const body = await page.locator('body').textContent() ?? '';
        const rateLimited = body.includes('Too many requests');
        const rendered = await page.locator('main').locator('*').first().count() > 0;

        if (!rateLimited && rendered) return;

        if (attempt < maxRetries) {
            const match = body.match(/"retryAfter"\s*:\s*(\d+)/);
            const wait = Math.min(Math.max(Number(match?.[1] ?? 5), 3), 10);
            await page.waitForTimeout(wait * 1000 + 500);
        }
    }
}

const BASE_URL = `http://localhost:${process.env.E2E_PORT || '3001'}`;

// Council sessions require a working Claude API — skip in CI without it
const skipNoKey = !!process.env.CI && !process.env.ANTHROPIC_API_KEY;

test.describe.serial('Council Deliberation Flow', () => {
    // eslint-disable-next-line playwright/no-skipped-test
    test.skip(skipNoKey, 'Requires ANTHROPIC_API_KEY for SDK sessions');

    let projectId: string;
    let agent1Id: string;
    let agent2Id: string;
    let councilWithChairmanId: string;
    let councilNoChairmanId: string;
    let launchId: string;
    let networkInfo: { algochat: boolean };

    test.beforeAll(async ({ browser }) => {
        // Use a fresh context for seeding
        const ctx = await browser.newContext({ baseURL: BASE_URL });
        const page = await ctx.newPage();

        // Check network context
        const healthRes = await fetch(`${BASE_URL}/api/health`);
        networkInfo = await healthRes.json();
        console.log(`[council-flow] Network context: algochat=${networkInfo.algochat}`);

        // Seed test data
        const projectRes = await fetch(`${BASE_URL}/api/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Council Flow Project', workingDir: '/tmp' }),
        });
        const project = await projectRes.json();
        projectId = project.id;

        const agent1Res = await fetch(`${BASE_URL}/api/agents`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Flow Agent Alpha', model: 'claude-sonnet-4-20250514' }),
        });
        const agent1 = await agent1Res.json();
        agent1Id = agent1.id;

        const agent2Res = await fetch(`${BASE_URL}/api/agents`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Flow Agent Beta', model: 'claude-sonnet-4-20250514' }),
        });
        const agent2 = await agent2Res.json();
        agent2Id = agent2.id;

        // Council WITH chairman
        const councilRes = await fetch(`${BASE_URL}/api/councils`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Flow Council With Chairman',
                agentIds: [agent1Id, agent2Id],
                chairmanAgentId: agent1Id,
            }),
        });
        const council = await councilRes.json();
        councilWithChairmanId = council.id;

        // Council WITHOUT chairman
        const noChairRes = await fetch(`${BASE_URL}/api/councils`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Flow Council No Chairman',
                agentIds: [agent1Id, agent2Id],
            }),
        });
        const noChair = await noChairRes.json();
        councilNoChairmanId = noChair.id;

        await page.close();
        await ctx.close();
    });

    test('launch council and verify responding stage', async ({ page, api }) => {
        const launch = await api.launchCouncil(
            councilWithChairmanId,
            projectId,
            'What is 2+2? Respond concisely.',
        );
        launchId = launch.launchId;
        expect(launch.sessionIds).toHaveLength(2);

        await gotoWithRetry(page, `/council-launches/${launchId}`);

        // Stage bar should exist
        await expect(page.locator('.stage-bar')).toBeVisible();

        // At least 2 member session feed entries
        const entryCount = await page.locator('.feed-entry').count();
        expect(entryCount).toBeGreaterThanOrEqual(2);
    });

    test('wait for review stage', async ({ page, api }) => {
        // Poll until at least 'reviewing'
        await api.waitForStage(launchId, 'reviewing', 90_000);

        const launch = await api.getLaunch(launchId);
        const stages = ['reviewing', 'synthesizing', 'complete'];
        expect(stages).toContain(launch.stage);

        // Navigate and verify stage bar advanced
        await gotoWithRetry(page, `/council-launches/${launchId}`);

        // Review sessions should appear (if still in reviewing stage or later)
        if (launch.stage === 'reviewing') {
            // Wait briefly for UI to render review cards
            await page.waitForTimeout(1000);
            const reviewCards = page.locator('h3:has-text("Peer Reviews")');
            // May or may not be visible if stage already advanced
            if (await reviewCards.count() > 0) {
                await expect(reviewCards).toBeVisible();
            }
        }
    });

    test('wait for synthesis stage', async ({ page, api }) => {
        // Poll until at least 'synthesizing'
        await api.waitForStage(launchId, 'synthesizing', 90_000);

        const launch = await api.getLaunch(launchId);
        const stages = ['synthesizing', 'complete'];
        expect(stages).toContain(launch.stage);
    });

    test('wait for complete and verify council decision', async ({ page, api }) => {
        // Poll until complete
        await api.waitForStage(launchId, 'complete', 120_000);

        const launch = await api.getLaunch(launchId);
        expect(launch.stage).toBe('complete');
        expect(launch.synthesis).toBeTruthy();
        expect(typeof launch.synthesis).toBe('string');
        expect(launch.synthesis!.length).toBeGreaterThan(0);

        // Navigate to launch view — give Angular time to fetch and render
        await gotoWithRetry(page, `/council-launches/${launchId}`);

        // Wait for the synthesis section to appear (component may need a refresh cycle)
        await expect(page.locator('.synthesis')).toBeVisible({ timeout: 15_000 });

        // Stage bar should show all steps done
        const doneSteps = page.locator('.stage-step--done');
        expect(await doneSteps.count()).toBeGreaterThanOrEqual(3);

        // Council Decision header and content should be visible
        await expect(page.locator('.synthesis__header')).toBeVisible({ timeout: 10_000 });
        await expect(page.locator('h3.synthesis__title')).toHaveText('Council Decision', { timeout: 10_000 });
        await expect(page.locator('.synthesis__content')).toBeVisible({ timeout: 10_000 });

        // Synthesis content should have actual text
        const synthesisText = await page.locator('.synthesis__content').textContent();
        expect(synthesisText?.trim().length).toBeGreaterThan(0);
    });

    test('council without chairman still completes with synthesis', async ({ api }) => {
        const launch = await api.launchCouncil(
            councilNoChairmanId,
            projectId,
            'What is 3+3? Respond concisely.',
        );
        expect(launch.sessionIds).toHaveLength(2);

        // Wait for complete — auto-fallback should produce synthesis
        await api.waitForStage(launch.launchId, 'complete', 120_000);

        const result = await api.getLaunch(launch.launchId);
        expect(result.stage).toBe('complete');
        // Synthesis should be produced even without a chairman
        expect(result.synthesis).toBeTruthy();
        expect(typeof result.synthesis).toBe('string');
        expect(result.synthesis!.length).toBeGreaterThan(0);
    });

    test('network context annotation', async ({ api }) => {
        const health = await api.getHealth();
        console.log(`[council-flow] Health check: status=${health.status}, algochat=${health.algochat}`);

        if (health.algochat) {
            console.log('[council-flow] Running on network with AlgoChat enabled');
        } else {
            console.log('[council-flow] AlgoChat not available — skipping AlgoChat-specific assertions');
        }

        // Basic health check passes regardless of network
        expect(health.status).toBeTruthy();
    });

    test('stage bar shows data-stage attributes', async ({ page }) => {
        // Navigate to the existing completed launch
        await gotoWithRetry(page, `/council-launches/${launchId}`);

        const steps = page.locator('.stage-step');
        expect(await steps.count()).toBeGreaterThanOrEqual(4);

        // Each step should have a data-stage attribute
        const validStages = ['responding', 'discussing', 'reviewing', 'synthesizing', 'complete'];
        for (let i = 0; i < await steps.count(); i++) {
            const dataStage = await steps.nth(i).getAttribute('data-stage');
            expect(validStages).toContain(dataStage);
        }

        // Stage connectors should exist between steps
        const connectors = page.locator('.stage-connector');
        expect(await connectors.count()).toBeGreaterThanOrEqual(3);
    });

    test('feed entries expand and collapse', async ({ page }) => {
        await gotoWithRetry(page, `/council-launches/${launchId}`);

        const entries = page.locator('.feed-entry');
        expect(await entries.count()).toBeGreaterThanOrEqual(1);

        const firstEntry = entries.first();

        // Entry should have meta info (agent name)
        await expect(firstEntry.locator('.feed-meta')).toBeVisible();
        await expect(firstEntry.locator('.feed-name')).toBeVisible();

        // Click to expand
        const toggle = firstEntry.locator('.feed-toggle');
        if (await toggle.count() > 0) {
            await toggle.click();
            await expect(firstEntry).toHaveClass(/feed-entry--expanded/);

            // Content should be visible when expanded
            await expect(firstEntry.locator('.feed-content')).toBeVisible({ timeout: 3000 });

            // Click again to collapse
            await toggle.click();
        }
    });

    test('log panel toggle', async ({ page }) => {
        await gotoWithRetry(page, `/council-launches/${launchId}`);

        // Look for Show/Hide Logs button
        const logsBtn = page.locator('button:text("Logs"), button:text("Hide Logs")').first();
        if (await logsBtn.count() > 0) {
            await logsBtn.click();
            await page.waitForTimeout(500);

            // Log panel should be visible after clicking
            const logPanel = page.locator('.log-panel');
            if (await logPanel.count() > 0) {
                await expect(logPanel).toBeVisible({ timeout: 5000 });
            }
        }
    });

    test('synthesis section structure', async ({ page }) => {
        await gotoWithRetry(page, `/council-launches/${launchId}`);

        // Wait for synthesis to appear
        await expect(page.locator('.synthesis')).toBeVisible({ timeout: 15000 });

        // Verify synthesis structure
        await expect(page.locator('.synthesis__header')).toBeVisible();
        await expect(page.locator('.synthesis__icon')).toBeVisible();
        await expect(page.locator('.synthesis__title')).toBeVisible();
        await expect(page.locator('.synthesis__content')).toBeVisible();

        // Content should have non-empty text
        const content = await page.locator('.synthesis__content').textContent();
        expect(content?.trim().length).toBeGreaterThan(0);
    });

    test('API council launches endpoint', async ({}) => {
        // List launches
        const listRes = await fetch(`${BASE_URL}/api/council-launches`);
        expect(listRes.ok).toBe(true);
        const list = await listRes.json();
        expect(Array.isArray(list)).toBe(true);

        // Get specific launch
        const getRes = await fetch(`${BASE_URL}/api/council-launches/${launchId}`);
        expect(getRes.ok).toBe(true);
        const launch = await getRes.json();
        expect(launch.stage).toBe('complete');
        expect(launch.prompt).toBeTruthy();
        expect(launch.synthesis).toBeTruthy();
    });
});
