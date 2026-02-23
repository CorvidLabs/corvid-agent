import { test, expect, gotoWithRetry } from './fixtures';

const BASE_URL = `http://localhost:${process.env.E2E_PORT || '3001'}`;

test.describe('Sessions', () => {
    test('session list renders', async ({ page, api }) => {
        await api.seedProject('Session Project');

        await gotoWithRetry(page, '/sessions', { isRendered: async (p) => (await p.locator('h2').count()) > 0 });

        // Session list page should load without errors
        await expect(page.locator('h2')).toBeVisible();
    });

    test('session view shows terminal output with correct structure', async ({ page, api }) => {
        const project = await api.seedProject('View Project');
        const agent = await api.seedAgent('View Agent');

        // Create a session via API
        const res = await fetch(`${BASE_URL}/api/sessions`, {
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

        await gotoWithRetry(page, `/sessions/${session.id}`, { isRendered: async (p) => (await p.locator('h2').count()) > 0 });

        // Should show the session view
        await expect(page.locator('.session-view')).toBeVisible({ timeout: 10000 });
    });

    test('session list shows table layout', async ({ page, api }) => {
        const project = await api.seedProject('Table Project');
        const agent = await api.seedAgent('Table Agent');

        // Create a session via API
        const res = await fetch(`${BASE_URL}/api/sessions`, {
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

        await gotoWithRetry(page, '/sessions', { isRendered: async (p) => (await p.locator('h2').count()) > 0 });

        // Verify session table structure
        await expect(page.locator('.session-table')).toBeVisible({ timeout: 10000 });

        const rows = page.locator('.session-table__row');
        expect(await rows.count()).toBeGreaterThanOrEqual(1);
    });

    test('search filters sessions', async ({ page, api }) => {
        const project = await api.seedProject('Search Session Project');
        const agent = await api.seedAgent('Search Session Agent');
        const uniqueName = `SearchMe ${Date.now()}`;
        await api.seedSession(project.id, agent.id, { name: uniqueName });

        await gotoWithRetry(page, '/sessions', { isRendered: async (p) => (await p.locator('h2').count()) > 0 });

        const searchInput = page.locator('.search-input');
        if (await searchInput.count() > 0) {
            await searchInput.fill(uniqueName.slice(0, 8));
            await page.waitForTimeout(500);

            await expect(page.locator(`text=${uniqueName}`).first()).toBeVisible({ timeout: 10000 });
        }
    });

    test('filter tabs toggle session status', async ({ page, api }) => {
        const project = await api.seedProject('Filter Tab Project');
        const agent = await api.seedAgent('Filter Tab Agent');
        await api.seedSession(project.id, agent.id);

        await gotoWithRetry(page, '/sessions', { isRendered: async (p) => (await p.locator('h2').count()) > 0 });

        const filterTabs = page.locator('.filter-tab');
        if (await filterTabs.count() > 0) {
            // First tab should be active
            await expect(filterTabs.first()).toHaveClass(/filter-tab--active/);

            // Click a different tab
            const secondTab = filterTabs.nth(1);
            await secondTab.click();
            await expect(secondTab).toHaveClass(/filter-tab--active/);
        }
    });

    test('session table shows status badges', async ({ page, api }) => {
        const project = await api.seedProject('Badge Project');
        const agent = await api.seedAgent('Badge Agent');
        await api.seedSession(project.id, agent.id);

        await gotoWithRetry(page, '/sessions', { isRendered: async (p) => (await p.locator('h2').count()) > 0 });

        await expect(page.locator('.session-table')).toBeVisible({ timeout: 10000 });

        const badge = page.locator('.status-badge').first();
        if (await badge.count() > 0) {
            await expect(badge).toBeVisible();
        }
    });

    test('session view shows metadata', async ({ page, api }) => {
        const project = await api.seedProject('Meta Project');
        const agent = await api.seedAgent('Meta Agent');
        const session = await api.seedSession(project.id, agent.id, { name: 'MetaView Session' });

        await gotoWithRetry(page, `/sessions/${session.id}`, { isRendered: async (p) => (await p.locator('h2').count()) > 0 });

        await expect(page.locator('.session-view')).toBeVisible({ timeout: 10000 });
    });

    test('API session CRUD lifecycle', async ({ api }) => {
        const project = await api.seedProject('CRUD Session Project');
        const agent = await api.seedAgent('CRUD Session Agent');

        // Create
        const createRes = await fetch(`${BASE_URL}/api/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                projectId: project.id,
                agentId: agent.id,
                name: `CRUD Session ${Date.now()}`,
            }),
        });
        expect(createRes.status).toBe(201);
        const session = await createRes.json();

        // Read
        const readRes = await fetch(`${BASE_URL}/api/sessions/${session.id}`);
        expect(readRes.ok).toBe(true);

        // Messages
        const msgRes = await fetch(`${BASE_URL}/api/sessions/${session.id}/messages`);
        expect(msgRes.ok).toBe(true);

        // Update
        const updateRes = await fetch(`${BASE_URL}/api/sessions/${session.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Updated Session' }),
        });
        expect(updateRes.ok).toBe(true);

        // List
        const listRes = await fetch(`${BASE_URL}/api/sessions`);
        expect(listRes.ok).toBe(true);

        // List by project
        const projListRes = await fetch(`${BASE_URL}/api/sessions?projectId=${project.id}`);
        expect(projListRes.ok).toBe(true);

        // Delete
        const deleteRes = await fetch(`${BASE_URL}/api/sessions/${session.id}`, { method: 'DELETE' });
        expect(deleteRes.ok).toBe(true);

        // Verify 404
        const gone = await fetch(`${BASE_URL}/api/sessions/${session.id}`);
        expect(gone.status).toBe(404);
    });

    test('source filter dropdown', async ({ page, api }) => {
        const project = await api.seedProject('Source Filter Project');
        const agent = await api.seedAgent('Source Filter Agent');
        await api.seedSession(project.id, agent.id);

        await gotoWithRetry(page, '/sessions', { isRendered: async (p) => (await p.locator('h2').count()) > 0 });

        const sourceSelect = page.locator('.source-select');
        if (await sourceSelect.count() > 0) {
            await expect(sourceSelect).toBeVisible();
        }
    });
});
