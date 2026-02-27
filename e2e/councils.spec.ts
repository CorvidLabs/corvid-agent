import { test, expect, gotoWithRetry , authedFetch } from './fixtures';

const BASE_URL = `http://localhost:${process.env.E2E_PORT || '3001'}`;

test.describe('Councils', () => {
    test('navigate to councils page from sidebar', async ({ page }) => {
        await gotoWithRetry(page, '/dashboard');
        const link = page.locator('a.sidebar__link[href="/councils"]');
        await expect(link).toBeVisible({ timeout: 10_000 });
        await link.click();
        await page.waitForURL('/councils');
        await expect(page.locator('h2')).toBeVisible();
    });

    test('councils page loads successfully', async ({ page }) => {
        await gotoWithRetry(page, '/councils');
        await expect(page.locator('h2')).toBeVisible({ timeout: 10_000 });
        // Wait for either council cards or empty state to render
        await expect(
            page.locator('.council-card, .empty').first()
        ).toBeVisible({ timeout: 10_000 });
    });

    test('create council via form and verify it appears in list', async ({ page, api }) => {
        // Seed agents first (return values unused — seeding is the side-effect)
        await api.seedAgent('Council Agent A');
        await api.seedAgent('Council Agent B');

        await gotoWithRetry(page, '/councils/new');
        await expect(page.locator('h2')).toHaveText('New Council');

        // Fill form
        await page.locator('#name').fill('My Test Council');
        await page.locator('#description').fill('A council for testing');

        // Select agents via checkboxes
        await page.locator(`input[type="checkbox"]`).nth(0).check();
        await page.locator(`input[type="checkbox"]`).nth(1).check();

        // Submit
        await page.locator('form button[type="submit"]').click();

        // Should redirect to council detail
        await page.waitForURL(/\/councils\//);
        await expect(page.locator('h2')).toHaveText('My Test Council');

        // Navigate to list and verify
        await gotoWithRetry(page, '/councils');
        await expect(page.locator('text=My Test Council').first()).toBeVisible();
    });

    test('council detail shows members and launch form', async ({ page, api }) => {
        const agent1 = await api.seedAgent('Detail Agent 1');
        const agent2 = await api.seedAgent('Detail Agent 2');
        const council = await api.seedCouncil([agent1.id, agent2.id], 'Detail Council', agent1.id);

        await gotoWithRetry(page, `/councils/${council.id}`);

        // Verify council info
        await expect(page.locator('h2')).toHaveText('Detail Council');
        await expect(page.locator('text=2 agents')).toBeVisible();
        await expect(page.locator('text=Detail Agent 1').first()).toBeVisible();

        // Verify launch form elements exist
        await expect(page.locator('select[aria-label="Select a project"]')).toBeVisible();
        await expect(page.locator('textarea[aria-label="Council prompt"]')).toBeVisible();
        await expect(page.locator('button:has-text("Launch Council")')).toBeVisible();
    });

    test('edit council updates name', async ({ page, api }) => {
        const agent1 = await api.seedAgent('Edit Agent 1');
        const council = await api.seedCouncil([agent1.id], 'Before Edit');

        await gotoWithRetry(page, `/councils/${council.id}`);

        // Click edit
        await page.locator('a:has-text("Edit")').click();
        await page.waitForURL(/\/councils\/.*\/edit/);

        // Wait for form to load existing data (name input should have existing value)
        await expect(page.locator('#name')).toHaveValue('Before Edit');

        // Wait for agent checkboxes to appear and be checked
        await expect(page.locator('input[type="checkbox"]:checked')).toHaveCount(1);

        // Change name
        await page.locator('#name').fill('After Edit');
        await page.locator('form button[type="submit"]').click();

        // Should redirect back to detail
        await page.waitForURL(/\/councils\/[^/]+$/);
        await expect(page.locator('h2')).toHaveText('After Edit');
    });

    test('delete council removes it from list', async ({ page, api }) => {
        const agent1 = await api.seedAgent('Delete Agent');
        const council = await api.seedCouncil([agent1.id], 'To Be Deleted');

        await gotoWithRetry(page, `/councils/${council.id}`);

        await page.locator('button:has-text("Delete")').click();
        await page.waitForURL('/councils');

        // The deleted council should not appear
        await expect(page.locator('text=To Be Deleted')).not.toBeVisible();
    });

    test('dashboard shows councils section', async ({ page, api }) => {
        const agent1 = await api.seedAgent('Dash Agent');
        await api.seedCouncil([agent1.id], 'Dashboard Council');

        await gotoWithRetry(page, '/dashboard');

        // Dashboard uses .section containers, not .card — check for councils quick action or link
        const councilLink = page.locator('a[href="/councils"]').first();
        await expect(councilLink).toBeVisible({ timeout: 10_000 });
    });

    test('council API CRUD works correctly', async ({ api }) => {
        const agent1 = await api.seedAgent('API Agent 1');
        const agent2 = await api.seedAgent('API Agent 2');

        // Create
        const council = await api.seedCouncil([agent1.id, agent2.id], 'API Council', agent1.id);
        expect(council.name).toBe('API Council');
        expect(council.agentIds).toHaveLength(2);
        expect(council.chairmanAgentId).toBe(agent1.id);

        // Read
        const getRes = await authedFetch(`${BASE_URL}/api/councils/${council.id}`);
        expect(getRes.ok).toBe(true);
        const fetched = await getRes.json();
        expect(fetched.name).toBe('API Council');

        // Update
        const updateRes = await authedFetch(`${BASE_URL}/api/councils/${council.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Updated Council', agentIds: [agent1.id] }),
        });
        expect(updateRes.ok).toBe(true);
        const updated = await updateRes.json();
        expect(updated.name).toBe('Updated Council');
        expect(updated.agentIds).toHaveLength(1);

        // Delete
        const deleteRes = await authedFetch(`${BASE_URL}/api/councils/${council.id}`, {
            method: 'DELETE',
        });
        expect(deleteRes.ok).toBe(true);

        // Verify deleted
        const checkRes = await authedFetch(`${BASE_URL}/api/councils/${council.id}`);
        expect(checkRes.status).toBe(404);
    });

    test('council launch creates sessions', async ({ api }) => {
        const project = await api.seedProject('Launch Test Project');
        const agent1 = await api.seedAgent('Launch Agent 1');
        const agent2 = await api.seedAgent('Launch Agent 2');
        const council = await api.seedCouncil([agent1.id, agent2.id], 'Launch Council', agent1.id);

        // Launch council
        const launchRes = await authedFetch(`${BASE_URL}/api/councils/${council.id}/launch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId: project.id, prompt: 'Say hello' }),
        });
        expect(launchRes.status).toBe(201);
        const launch = await launchRes.json();
        expect(launch.launchId).toBeTruthy();
        expect(launch.sessionIds).toHaveLength(2);

        // Get launch
        const getLaunchRes = await authedFetch(`${BASE_URL}/api/council-launches/${launch.launchId}`);
        expect(getLaunchRes.ok).toBe(true);
        const launchData = await getLaunchRes.json();
        // Stage may be 'responding', 'discussing', or 'reviewing' if auto-advance triggered
        expect(['responding', 'discussing', 'reviewing']).toContain(launchData.stage);
        expect(launchData.sessionIds.length).toBeGreaterThanOrEqual(2);
        expect(launchData.prompt).toBe('Say hello');

        // List launches for this council
        const listRes = await authedFetch(`${BASE_URL}/api/councils/${council.id}/launches`);
        expect(listRes.ok).toBe(true);
        const launches = await listRes.json();
        expect(launches.length).toBeGreaterThanOrEqual(1);
    });

    test('launch view page loads with session feed', async ({ page, api }) => {
        const project = await api.seedProject('View Test Project');
        const agent1 = await api.seedAgent('View Agent 1');
        const agent2 = await api.seedAgent('View Agent 2');
        const council = await api.seedCouncil([agent1.id, agent2.id], 'View Council');

        // Launch via API
        const launchRes = await authedFetch(`${BASE_URL}/api/councils/${council.id}/launch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId: project.id, prompt: 'Test prompt' }),
        });
        const launch = await launchRes.json();

        // Navigate to launch view
        await gotoWithRetry(page, `/council-launches/${launch.launchId}`);

        // Verify stage bar exists
        await expect(page.locator('.stage-bar')).toBeVisible();

        // Session entries depend on Claude API being available; verify feed or stage-bar exists
        const entryCount = await page.locator('.feed-entry').count();
        if (entryCount > 0) {
            expect(entryCount).toBeGreaterThanOrEqual(2);
            await expect(page.locator('.feed-name').first()).toBeVisible();
        }
        // At minimum, the launch page and stage-bar rendered (verified above)
    });

    test('council validation rejects empty agentIds', async () => {
        const res = await authedFetch(`${BASE_URL}/api/councils`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Bad Council', agentIds: [] }),
        });
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toContain('agentIds');
    });

    test('council validation rejects missing name', async () => {
        const res = await authedFetch(`${BASE_URL}/api/councils`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agentIds: ['fake-id'] }),
        });
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toContain('name');
    });

    test('review endpoint rejects if stage is not responding', async ({ api }) => {
        const project = await api.seedProject('Review Reject Project');
        const agent1 = await api.seedAgent('Review Reject Agent');
        const council = await api.seedCouncil([agent1.id], 'Review Reject Council');

        // Launch
        const launchRes = await authedFetch(`${BASE_URL}/api/councils/${council.id}/launch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId: project.id, prompt: 'test' }),
        });
        const launch = await launchRes.json();

        // Trigger review — may succeed (manual) or fail (auto-advance beat us)
        await authedFetch(`${BASE_URL}/api/council-launches/${launch.launchId}/review`, {
            method: 'POST',
        });

        // Wait briefly for auto-advance to settle if it's running
        await new Promise((r) => setTimeout(r, 500));

        // Either way, the stage should no longer be 'responding' — a second call must fail
        const reviewRes2 = await authedFetch(`${BASE_URL}/api/council-launches/${launch.launchId}/review`, {
            method: 'POST',
        });
        expect(reviewRes2.status).toBe(400);
    });

    test('manual synthesize endpoint rejects when no chairman and not in reviewing stage', async ({ api }) => {
        const project = await api.seedProject('Synth Reject Project');
        const agent1 = await api.seedAgent('Synth Reject Agent');
        // Create council WITHOUT chairman
        const council = await api.seedCouncil([agent1.id], 'No Chairman Council');

        // Launch
        const launchRes = await authedFetch(`${BASE_URL}/api/councils/${council.id}/launch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId: project.id, prompt: 'test' }),
        });
        const launch = await launchRes.json();

        // Wait for auto-advance to progress — the no-chairman path now uses
        // a fallback synthesizer, so the launch will auto-advance past reviewing
        await new Promise((r) => setTimeout(r, 2000));

        // A manual /synthesize call should fail because the stage has already
        // advanced past 'reviewing' (auto-advance handled synthesis via fallback)
        const synthRes = await authedFetch(`${BASE_URL}/api/council-launches/${launch.launchId}/synthesize`, {
            method: 'POST',
        });
        expect(synthRes.status).toBe(400);
        const data = await synthRes.json();
        // Error will be either "Cannot synthesize from stage '...'" or "no chairman"
        expect(data.error).toBeTruthy();
    });

    // ─── Additional API coverage ─────────────────────────────────────────

    test('council launches returns array', async ({ api }) => {
        const project = await api.seedProject('Launches List Project');
        const agent1 = await api.seedAgent('Launches List Agent');
        const council = await api.seedCouncil([agent1.id], 'Launches List Council');

        // Create a launch
        await api.launchCouncil(council.id, project.id, 'List test');

        const res = await authedFetch(`${BASE_URL}/api/councils/${council.id}/launches`);
        expect(res.ok).toBe(true);
        const data = await res.json();
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBeGreaterThanOrEqual(1);
    });

    test('discussion messages returns array', async ({ api }) => {
        const project = await api.seedProject('Discussion Project');
        const agent1 = await api.seedAgent('Discussion Agent');
        const council = await api.seedCouncil([agent1.id], 'Discussion Council');
        const launch = await api.launchCouncil(council.id, project.id, 'Discussion test');

        const res = await authedFetch(`${BASE_URL}/api/council-launches/${launch.launchId}/discussion-messages`);
        expect(res.ok).toBe(true);
        const data = await res.json();
        expect(Array.isArray(data)).toBe(true);
    });

    test('abort launch returns 400 for already complete or 404', async ({ api }) => {
        const project = await api.seedProject('Abort Project');
        const agent1 = await api.seedAgent('Abort Agent');
        const council = await api.seedCouncil([agent1.id], 'Abort Council');
        const launch = await api.launchCouncil(council.id, project.id, 'Abort test');

        // Wait briefly for auto-advance
        await new Promise((r) => setTimeout(r, 2000));

        const res = await authedFetch(`${BASE_URL}/api/council-launches/${launch.launchId}/abort`, {
            method: 'POST',
        });
        // 200 (aborted), 400 (already complete), or 404
        expect([200, 400, 404]).toContain(res.status);
    });

    test('chat rejects incomplete council launch', async ({ api }) => {
        const project = await api.seedProject('Chat Reject Project');
        const agent1 = await api.seedAgent('Chat Reject Agent');
        const council = await api.seedCouncil([agent1.id], 'Chat Reject Council');
        const launch = await api.launchCouncil(council.id, project.id, 'Chat test');

        const res = await authedFetch(`${BASE_URL}/api/council-launches/${launch.launchId}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'test' }),
        });
        // 400 (not in correct stage) or 404
        expect([400, 404]).toContain(res.status);
    });

    test('council launch logs returns array', async ({ api }) => {
        const project = await api.seedProject('Logs Project');
        const agent1 = await api.seedAgent('Logs Agent');
        const council = await api.seedCouncil([agent1.id], 'Logs Council');
        const launch = await api.launchCouncil(council.id, project.id, 'Logs test');

        const res = await authedFetch(`${BASE_URL}/api/council-launches/${launch.launchId}/logs`);
        expect(res.ok).toBe(true);
        const data = await res.json();
        expect(Array.isArray(data)).toBe(true);
    });
});
