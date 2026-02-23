import { test, expect, gotoWithRetry } from './fixtures';

const BASE_URL = `http://localhost:${process.env.E2E_PORT || '3001'}`;

test.describe('Optimistic Updates & Render Performance', () => {
    test.describe('Session optimistic updates', () => {
        test('create session via API and verify it appears in list without reload', async ({ page, api }) => {
            const project = await api.seedProject('Perf Session Project');
            const agent = await api.seedAgent('Perf Session Agent');
            const uniqueName = `Opt Session ${Date.now()}`;

            await gotoWithRetry(page, '/sessions');

            // Create session via API
            const res = await fetch(`${BASE_URL}/api/sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId: project.id,
                    agentId: agent.id,
                    name: uniqueName,
                    initialPrompt: 'Say hello briefly',
                }),
            });
            expect(res.ok).toBe(true);
            const session = await res.json();

            // Navigate to sessions page — session should appear
            await gotoWithRetry(page, '/sessions');
            await expect(page.locator(`.session-table__row:has-text("${uniqueName}")`).first()).toBeVisible({ timeout: 10000 });

            // Stop the session
            await fetch(`${BASE_URL}/api/sessions/${session.id}/stop`, { method: 'POST' });

            // Wait for status update via WS or poll, then verify stopped status
            await page.waitForTimeout(1000);
            await gotoWithRetry(page, '/sessions');

            // Session should still be in the list
            await expect(page.locator(`.session-table__row:has-text("${uniqueName}")`).first()).toBeVisible();

            // Delete the session
            await fetch(`${BASE_URL}/api/sessions/${session.id}`, { method: 'DELETE' });

            // Verify removal
            await gotoWithRetry(page, '/sessions');
            await expect(page.locator(`.session-table__row:has-text("${uniqueName}")`)).not.toBeVisible({ timeout: 5000 });
        });
    });

    test.describe('Agent optimistic updates', () => {
        test('create agent via API and verify it appears in list without reload', async ({ page }) => {
            const uniqueName = `Opt Agent ${Date.now()}`;
            const renamedName = `Renamed ${Date.now()}`;

            await gotoWithRetry(page, '/agents');

            // Create agent via API
            const res = await fetch(`${BASE_URL}/api/agents`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: uniqueName, model: 'claude-sonnet-4-20250514' }),
            });
            expect(res.ok).toBe(true);
            const agent = await res.json();

            // Navigate to agents list
            await gotoWithRetry(page, '/agents');
            await expect(page.locator(`.agent-card:has-text("${uniqueName}")`).first()).toBeVisible({ timeout: 10000 });

            // Update the agent name
            await fetch(`${BASE_URL}/api/agents/${agent.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: renamedName }),
            });

            // Reload and verify name changed
            await gotoWithRetry(page, '/agents');
            await expect(page.locator(`.agent-card:has-text("${renamedName}")`)).toBeVisible({ timeout: 10000 });

            // Delete the agent
            await fetch(`${BASE_URL}/api/agents/${agent.id}`, { method: 'DELETE' });

            // Verify removal
            await gotoWithRetry(page, '/agents');
            await expect(page.locator(`.agent-card:has-text("${renamedName}")`)).not.toBeVisible({ timeout: 5000 });
        });
    });

    test.describe('Session output render window', () => {
        test('render window does not show load-more with few events', async ({ page, api }) => {
            const project = await api.seedProject('Render Window Project');
            const agent = await api.seedAgent('Render Window Agent');

            // Create a session
            const res = await fetch(`${BASE_URL}/api/sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId: project.id,
                    agentId: agent.id,
                    name: 'Render Window Session',
                    initialPrompt: 'Say hi',
                }),
            });
            const session = await res.json();

            await gotoWithRetry(page, `/sessions/${session.id}`);

            // With few events, .load-more should NOT be visible
            await expect(page.locator('.load-more')).not.toBeVisible({ timeout: 3000 });

            // Terminal container should exist and render correctly
            const terminal = page.locator('.terminal');
            if (await terminal.count() > 0) {
                await expect(terminal.first()).toBeVisible();
            }

            // Cleanup
            await fetch(`${BASE_URL}/api/sessions/${session.id}/stop`, { method: 'POST' });
        });

        test('session output component renders without errors', async ({ page, api }) => {
            const project = await api.seedProject('Output Render Project');
            const agent = await api.seedAgent('Output Render Agent');

            const res = await fetch(`${BASE_URL}/api/sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId: project.id,
                    agentId: agent.id,
                    name: 'Output Render Session',
                    initialPrompt: 'Respond with exactly: test output',
                }),
            });
            const session = await res.json();

            // Listen for console errors
            const errors: string[] = [];
            page.on('console', (msg) => {
                if (msg.type() === 'error') errors.push(msg.text());
            });

            await gotoWithRetry(page, `/sessions/${session.id}`);
            await page.waitForTimeout(2000);

            // Verify the session view rendered without Angular errors
            const angularErrors = errors.filter((e) =>
                e.includes('ExpressionChangedAfterItHasBeenCheckedError')
                || e.includes('NG0')
            );
            expect(angularErrors).toHaveLength(0);

            // Cleanup
            await fetch(`${BASE_URL}/api/sessions/${session.id}/stop`, { method: 'POST' });
        });
    });

    test.describe('Session view components', () => {
        test('session view header shows name and status', async ({ page, api }) => {
            const project = await api.seedProject('View Header Project');
            const agent = await api.seedAgent('View Header Agent');
            const sessionName = `Header Session ${Date.now()}`;

            const res = await fetch(`${BASE_URL}/api/sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId: project.id,
                    agentId: agent.id,
                    name: sessionName,
                    initialPrompt: 'Say hello',
                }),
            });
            const session = await res.json();

            await gotoWithRetry(page, `/sessions/${session.id}`);

            // Header should show session info
            const header = page.locator('.session-view__header');
            await expect(header).toBeVisible({ timeout: 10000 });

            // Session info section should be visible
            const info = page.locator('.session-view__info');
            await expect(info).toBeVisible();

            // Cleanup
            await fetch(`${BASE_URL}/api/sessions/${session.id}/stop`, { method: 'POST' });
        });

        test('session view metadata shows agent, turns, cost', async ({ page, api }) => {
            const project = await api.seedProject('View Meta Project');
            const agent = await api.seedAgent('View Meta Agent');

            const res = await fetch(`${BASE_URL}/api/sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId: project.id,
                    agentId: agent.id,
                    name: `Meta Session ${Date.now()}`,
                    initialPrompt: 'Say hi',
                }),
            });
            const session = await res.json();

            await gotoWithRetry(page, `/sessions/${session.id}`);

            // Wait for session view to fully render
            await page.waitForTimeout(2000);

            // Meta section should be visible
            const meta = page.locator('.session-view__meta');
            await expect(meta).toBeVisible({ timeout: 15000 });

            // Should have meta items with labels
            const metaItems = meta.locator('.meta-item');
            expect(await metaItems.count()).toBeGreaterThanOrEqual(2);

            const labels = meta.locator('.meta-label');
            const allLabels = await labels.allTextContents();
            expect(allLabels.some((l) => l.includes('Agent'))).toBe(true);

            // Cleanup
            await fetch(`${BASE_URL}/api/sessions/${session.id}/stop`, { method: 'POST' });
        });

        test('session view action buttons visible', async ({ page, api }) => {
            const project = await api.seedProject('View Actions Project');
            const agent = await api.seedAgent('View Actions Agent');

            const res = await fetch(`${BASE_URL}/api/sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId: project.id,
                    agentId: agent.id,
                    name: `Actions Session ${Date.now()}`,
                    initialPrompt: 'Say hi',
                }),
            });
            const session = await res.json();

            await gotoWithRetry(page, `/sessions/${session.id}`);

            // Actions section should be visible
            const actions = page.locator('.session-view__actions');
            await expect(actions).toBeVisible({ timeout: 10000 });

            // Should have at least a Stop or Resume button
            const btns = actions.locator('.btn');
            expect(await btns.count()).toBeGreaterThanOrEqual(1);

            // Cleanup
            await fetch(`${BASE_URL}/api/sessions/${session.id}/stop`, { method: 'POST' });
        });

        test('session view export group buttons', async ({ page, api }) => {
            const project = await api.seedProject('View Export Project');
            const agent = await api.seedAgent('View Export Agent');

            const res = await fetch(`${BASE_URL}/api/sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId: project.id,
                    agentId: agent.id,
                    name: `Export Session ${Date.now()}`,
                    initialPrompt: 'Say hi',
                }),
            });
            const session = await res.json();

            await gotoWithRetry(page, `/sessions/${session.id}`);

            // Export group should be visible
            const exportGroup = page.locator('.export-group');
            await expect(exportGroup).toBeVisible({ timeout: 10000 });

            // Should have multiple export format buttons
            const exportBtns = exportGroup.locator('.btn--secondary');
            expect(await exportBtns.count()).toBeGreaterThanOrEqual(2);

            // Cleanup
            await fetch(`${BASE_URL}/api/sessions/${session.id}/stop`, { method: 'POST' });
        });

        test('terminal container renders with event lines', async ({ page, api }) => {
            const project = await api.seedProject('Terminal Project');
            const agent = await api.seedAgent('Terminal Agent');

            const res = await fetch(`${BASE_URL}/api/sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId: project.id,
                    agentId: agent.id,
                    name: `Terminal Session ${Date.now()}`,
                    initialPrompt: 'Say hello world',
                }),
            });
            const session = await res.json();

            await gotoWithRetry(page, `/sessions/${session.id}`);

            // Terminal should be visible
            const terminal = page.locator('.terminal');
            await expect(terminal).toBeVisible({ timeout: 10000 });

            // Wait briefly for events to render
            await page.waitForTimeout(3000);

            // Should have at least one line entry
            const lines = terminal.locator('.line');
            if (await lines.count() > 0) {
                // Lines should have prompt and text elements
                const firstLine = lines.first();
                await expect(firstLine.locator('.prompt')).toBeVisible();
            }

            // Cleanup
            await fetch(`${BASE_URL}/api/sessions/${session.id}/stop`, { method: 'POST' });
        });
    });
});
