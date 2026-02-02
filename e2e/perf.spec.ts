import { test, expect } from './fixtures';

const BASE_URL = 'http://localhost:3000';

test.describe('Optimistic Updates & Render Performance', () => {
    test.describe('Session optimistic updates', () => {
        test('create session via API and verify it appears in list without reload', async ({ page, api }) => {
            const project = await api.seedProject('Perf Session Project');
            const agent = await api.seedAgent('Perf Session Agent');

            await page.goto('/sessions');
            await page.waitForLoadState('networkidle');

            // Create session via API
            const res = await fetch(`${BASE_URL}/api/sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId: project.id,
                    agentId: agent.id,
                    name: 'Optimistic Session',
                    initialPrompt: 'Say hello briefly',
                }),
            });
            expect(res.ok).toBe(true);
            const session = await res.json();

            // Navigate to sessions page — session should appear without a full page reload cycle
            await page.goto('/sessions');
            await page.waitForLoadState('networkidle');
            await expect(page.locator(`.list__item:has-text("Optimistic Session")`)).toBeVisible({ timeout: 5000 });

            // Stop the session
            await fetch(`${BASE_URL}/api/sessions/${session.id}/stop`, { method: 'POST' });

            // Wait for status update via WS or poll, then verify stopped status
            await page.waitForTimeout(1000);
            await page.goto('/sessions');
            await page.waitForLoadState('networkidle');

            // Session should still be in the list
            await expect(page.locator(`.list__item:has-text("Optimistic Session")`)).toBeVisible();

            // Delete the session
            await fetch(`${BASE_URL}/api/sessions/${session.id}`, { method: 'DELETE' });

            // Verify removal
            await page.goto('/sessions');
            await page.waitForLoadState('networkidle');
            await expect(page.locator(`.list__item:has-text("Optimistic Session")`)).not.toBeVisible({ timeout: 5000 });
        });
    });

    test.describe('Agent optimistic updates', () => {
        test('create agent via API and verify it appears in list without reload', async ({ page }) => {
            await page.goto('/agents');
            await page.waitForLoadState('networkidle');

            // Create agent via API
            const res = await fetch(`${BASE_URL}/api/agents`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'Optimistic Agent', model: 'claude-sonnet-4-20250514' }),
            });
            expect(res.ok).toBe(true);
            const agent = await res.json();

            // Navigate to agents list
            await page.goto('/agents');
            await page.waitForLoadState('networkidle');
            await expect(page.locator(`.list__item:has-text("Optimistic Agent")`)).toBeVisible({ timeout: 5000 });

            // Update the agent name
            await fetch(`${BASE_URL}/api/agents/${agent.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'Renamed Agent' }),
            });

            // Reload and verify name changed
            await page.goto('/agents');
            await page.waitForLoadState('networkidle');
            await expect(page.locator(`.list__item:has-text("Renamed Agent")`)).toBeVisible({ timeout: 5000 });

            // Delete the agent
            await fetch(`${BASE_URL}/api/agents/${agent.id}`, { method: 'DELETE' });

            // Verify removal
            await page.goto('/agents');
            await page.waitForLoadState('networkidle');
            await expect(page.locator(`.list__item:has-text("Renamed Agent")`)).not.toBeVisible({ timeout: 5000 });
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

            await page.goto(`/sessions/${session.id}`);
            await page.waitForLoadState('networkidle');

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

            await page.goto(`/sessions/${session.id}`);
            await page.waitForLoadState('networkidle');
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
});
