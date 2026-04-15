import { test, expect, gotoWithRetry } from './fixtures';

test.describe('Chat Tabs', () => {
    test.describe.configure({ mode: 'serial' });

    test('opening multiple sessions shows tabs and switching works', async ({ page, api }) => {
        const project = await api.seedProject('Tab Project');
        const agent = await api.seedAgent('Tab Agent');
        const sessionA = await api.seedSession(project.id, agent.id, { name: 'Session Alpha' });
        const sessionB = await api.seedSession(project.id, agent.id, { name: 'Session Beta' });

        // Open first session — tab should appear
        await gotoWithRetry(page, `/sessions/${sessionA.id}`, {
            isRendered: async (p) => (await p.locator('.session-view').count()) > 0,
        });
        await expect(page.locator('.tab-bar')).toBeVisible({ timeout: 10_000 });
        const tabA = page.locator('.tab', { hasText: 'Session Alpha' });
        await expect(tabA).toBeVisible();
        await expect(tabA).toHaveClass(/tab--active/);

        // Open second session — both tabs should exist
        await gotoWithRetry(page, `/sessions/${sessionB.id}`, {
            isRendered: async (p) => (await p.locator('.session-view').count()) > 0,
        });
        const tabB = page.locator('.tab', { hasText: 'Session Beta' });
        await expect(tabB).toBeVisible({ timeout: 10_000 });
        await expect(tabB).toHaveClass(/tab--active/);

        // Tab A should no longer be active
        const tabAAfter = page.locator('.tab', { hasText: 'Session Alpha' });
        await expect(tabAAfter).toBeVisible();
        await expect(tabAAfter).not.toHaveClass(/tab--active/);

        // Click Tab A — should switch back
        await tabAAfter.click();
        await page.waitForURL(`**/sessions/${sessionA.id}**`);
        await expect(page.locator('.session-view').first()).toBeVisible({ timeout: 10_000 });
        await expect(page.locator('.tab', { hasText: 'Session Alpha' })).toHaveClass(/tab--active/);
    });

    test('closing a non-active tab keeps current session', async ({ page, api }) => {
        const project = await api.seedProject('Close Tab Project');
        const agent = await api.seedAgent('Close Tab Agent');
        const sessionA = await api.seedSession(project.id, agent.id, { name: 'Stay Session' });
        const sessionB = await api.seedSession(project.id, agent.id, { name: 'Close Session' });

        // Open both sessions to register tabs
        await gotoWithRetry(page, `/sessions/${sessionA.id}`, {
            isRendered: async (p) => (await p.locator('.session-view').count()) > 0,
        });
        await gotoWithRetry(page, `/sessions/${sessionB.id}`, {
            isRendered: async (p) => (await p.locator('.session-view').count()) > 0,
        });

        // Switch back to session A (the one we want to stay on)
        await page.locator('.tab', { hasText: 'Stay Session' }).click();
        await page.waitForURL(`**/sessions/${sessionA.id}**`);
        await expect(page.locator('.tab', { hasText: 'Stay Session' })).toHaveClass(/tab--active/);

        // Close session B (non-active tab) — hover to reveal the button, then click
        const closeBtnTab = page.locator('.tab', { hasText: 'Close Session' });
        await closeBtnTab.hover();
        const closeBtn = closeBtnTab.locator('.tab__close');
        await closeBtn.click();

        // Should still be on session A
        await expect(page).toHaveURL(new RegExp(`sessions/${sessionA.id}`));
        await expect(page.locator('.session-view').first()).toBeVisible();
        await expect(page.locator('.tab', { hasText: 'Stay Session' })).toHaveClass(/tab--active/);

        // Closed tab should be gone
        await expect(page.locator('.tab', { hasText: 'Close Session' })).not.toBeVisible();
    });

    test('closing the active tab switches to adjacent tab', async ({ page, api }) => {
        const project = await api.seedProject('Active Close Project');
        const agent = await api.seedAgent('Active Close Agent');
        const sessionA = await api.seedSession(project.id, agent.id, { name: 'First Tab' });
        const sessionB = await api.seedSession(project.id, agent.id, { name: 'Second Tab' });

        // Open both
        await gotoWithRetry(page, `/sessions/${sessionA.id}`, {
            isRendered: async (p) => (await p.locator('.session-view').count()) > 0,
        });
        await gotoWithRetry(page, `/sessions/${sessionB.id}`, {
            isRendered: async (p) => (await p.locator('.session-view').count()) > 0,
        });

        // Close the active tab (session B) — hover to reveal button, then click
        const closeBtnTab = page.locator('.tab--active');
        await closeBtnTab.hover();
        const closeBtn = closeBtnTab.locator('.tab__close');
        await closeBtn.click();

        // Should switch to session A
        await page.waitForURL(`**/sessions/${sessionA.id}**`);
        await expect(page.locator('.tab', { hasText: 'First Tab' })).toHaveClass(/tab--active/);
    });

    test('closing the last tab navigates to chat', async ({ page, api }) => {
        const project = await api.seedProject('Last Tab Project');
        const agent = await api.seedAgent('Last Tab Agent');
        const session = await api.seedSession(project.id, agent.id, { name: 'Only Tab' });

        await gotoWithRetry(page, `/sessions/${session.id}`, {
            isRendered: async (p) => (await p.locator('.session-view').count()) > 0,
        });

        // Close the only tab — hover to reveal button, then click
        const closeBtnTab = page.locator('.tab--active');
        await closeBtnTab.hover();
        const closeBtn = closeBtnTab.locator('.tab__close');
        await closeBtn.click();

        // Should navigate to /chat
        await page.waitForURL('**/chat**');
    });
});
