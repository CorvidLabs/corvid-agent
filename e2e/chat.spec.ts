import { test, expect , gotoWithRetry } from './fixtures';

test.describe('Chat', () => {
    test.describe.configure({ mode: 'serial' });

    test.beforeEach(async ({ api }) => {
        await api.seedProject('Chat Project');
        await api.seedAgent('Chat Agent');
    });

    async function setupChat(page: import('@playwright/test').Page) {
        await gotoWithRetry(page, '/dashboard');
        await page.waitForLoadState('networkidle');

        // Wait for dashboard to fully render with AlgoChat section
        const localChat = page.locator('.dashboard__local-chat');
        try {
            await expect(localChat).toBeVisible({ timeout: 10_000 });
        } catch {
            return false;
        }

        // Wait for agent select to have options beyond the placeholder
        const agentSelect = page.locator('select[aria-label="Select an agent"]');
        await expect(agentSelect).toBeVisible({ timeout: 5000 });

        // Wait until we have more than just the placeholder option
        await page.waitForFunction(() => {
            const sel = document.querySelector('select[aria-label="Select an agent"]');
            return sel && sel.querySelectorAll('option').length > 1;
        }, { timeout: 10_000 });

        // Select first real agent option (index 0 is placeholder)
        await agentSelect.selectOption({ index: 1 });

        // Wait for the terminal input to appear and become enabled
        const input = page.locator('.terminal__input');
        await expect(input).toBeVisible({ timeout: 5000 });
        await expect(input).toBeEnabled({ timeout: 5000 });

        return true;
    }

    test('select agent + project, send message, verify inbound appears', async ({ page }) => {
        const ready = await setupChat(page);
        if (!ready) {
            test.skip(true, 'AlgoChat not enabled, skipping chat test');
            return;
        }

        // Type and send a message
        const input = page.locator('.terminal__input');
        await input.fill('Hello from Playwright');
        await input.press('Enter');

        // Verify inbound message appears
        await expect(page.locator('.terminal__line--inbound')).toBeVisible({ timeout: 10_000 });
        await expect(page.locator('.terminal__line--inbound .terminal__text')).toContainText('Hello from Playwright');
    });

    test('wait for outbound agent response', async ({ page }) => {
        test.setTimeout(90_000);
        const ready = await setupChat(page);
        if (!ready) {
            test.skip(true, 'AlgoChat not enabled');
            return;
        }

        // Send message
        const input = page.locator('.terminal__input');
        await input.fill('Say hello');
        await input.press('Enter');

        // Wait for outbound response (longer timeout for Claude processing)
        // Requires ANTHROPIC_API_KEY on the server
        await expect(page.locator('.terminal__line--outbound')).toBeVisible({ timeout: 80_000 });
    });

    test('tip button sends reward and shows confirmation', async ({ page }) => {
        const ready = await setupChat(page);
        if (!ready) {
            test.skip(true, 'AlgoChat not enabled');
            return;
        }

        // Click tip button
        const tipBtn = page.locator('.chat-tip-btn');
        await expect(tipBtn).toBeVisible({ timeout: 5000 });
        await tipBtn.click();

        // Should show confirmation text
        await expect(tipBtn).toContainText('Tipped!');

        // Should revert after 2 seconds
        await expect(tipBtn).toContainText('Tip 0.1', { timeout: 3000 });
    });

    test('chat messages have distinct inbound/outbound styling', async ({ page }) => {
        test.setTimeout(90_000);
        const ready = await setupChat(page);
        if (!ready) {
            test.skip(true, 'AlgoChat not enabled');
            return;
        }

        const input = page.locator('.terminal__input');
        await input.fill('Test styling');
        await input.press('Enter');

        // Wait for inbound message
        await expect(page.locator('.terminal__line--inbound')).toBeVisible({ timeout: 10_000 });

        // Verify inbound prompt is "> "
        const inboundPrompt = page.locator('.terminal__line--inbound .terminal__prompt');
        await expect(inboundPrompt).toContainText('>');

        // Wait for outbound and verify different prompt
        await expect(page.locator('.terminal__line--outbound')).toBeVisible({ timeout: 60_000 });
        const outboundPrompt = page.locator('.terminal__line--outbound .terminal__prompt');
        await expect(outboundPrompt).toContainText('assistant>');
    });
});
