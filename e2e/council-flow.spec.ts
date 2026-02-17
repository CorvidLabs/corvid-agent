import { test, expect } from './fixtures';

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
        const ctx = await browser.newContext({ baseURL: 'http://localhost:3000' });
        const page = await ctx.newPage();

        // Check network context
        const healthRes = await fetch('http://localhost:3000/api/health');
        networkInfo = await healthRes.json();
        console.log(`[council-flow] Network context: algochat=${networkInfo.algochat}`);

        // Seed test data
        const projectRes = await fetch('http://localhost:3000/api/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Council Flow Project', workingDir: '/tmp' }),
        });
        const project = await projectRes.json();
        projectId = project.id;

        const agent1Res = await fetch('http://localhost:3000/api/agents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Flow Agent Alpha', model: 'claude-sonnet-4-20250514' }),
        });
        const agent1 = await agent1Res.json();
        agent1Id = agent1.id;

        const agent2Res = await fetch('http://localhost:3000/api/agents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Flow Agent Beta', model: 'claude-sonnet-4-20250514' }),
        });
        const agent2 = await agent2Res.json();
        agent2Id = agent2.id;

        // Council WITH chairman
        const councilRes = await fetch('http://localhost:3000/api/councils', {
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
        const noChairRes = await fetch('http://localhost:3000/api/councils', {
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

        await page.goto(`/council-launches/${launchId}`);
        await page.waitForLoadState('networkidle');

        // Stage bar should exist
        await expect(page.locator('.stage-bar')).toBeVisible();

        // At least 2 member session cards
        const cardCount = await page.locator('.grid-card').count();
        expect(cardCount).toBeGreaterThanOrEqual(2);
    });

    test('wait for review stage', async ({ page, api }) => {
        // Poll until at least 'reviewing'
        await api.waitForStage(launchId, 'reviewing', 90_000);

        const launch = await api.getLaunch(launchId);
        const stages = ['reviewing', 'synthesizing', 'complete'];
        expect(stages).toContain(launch.stage);

        // Navigate and verify stage bar advanced
        await page.goto(`/council-launches/${launchId}`);
        await page.waitForLoadState('networkidle');

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
        await page.goto(`/council-launches/${launchId}`);
        await page.waitForLoadState('networkidle');

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
});
