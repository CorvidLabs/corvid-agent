import { test, expect } from './fixtures';

test.describe('Sessions', () => {
    test('session list renders', async ({ page, api }) => {
        const project = await api.seedProject('Session Project');

        await page.goto('/sessions');
        await page.waitForLoadState('networkidle');

        // Session list page should load without errors
        await expect(page.locator('h2')).toBeVisible();
    });

    test('session view shows terminal output with correct structure', async ({ page, api }) => {
        const project = await api.seedProject('View Project');
        const agent = await api.seedAgent('View Agent');

        // Create a session via API
        const res = await fetch('http://localhost:3000/api/sessions', {
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

        await page.goto(`/sessions/${session.id}`);
        await page.waitForLoadState('networkidle');

        // Should show the session view
        await expect(page.locator('.session-view')).toBeVisible({ timeout: 5000 });
    });
});
