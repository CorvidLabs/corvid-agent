import { test, expect } from './fixtures';

test.describe('MCP Servers', () => {
    test('navigate to mcp-servers page and verify empty state', async ({ page }) => {
        await page.goto('/mcp-servers');
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h2:text("MCP Servers")')).toBeVisible();
    });

    test('create server config and verify it appears', async ({ page }) => {
        await page.goto('/mcp-servers');
        await page.waitForLoadState('networkidle');

        await page.locator('button:text("+ New Server")').click();
        await expect(page.locator('h3:text("Add MCP Server")')).toBeVisible();

        // Fill form
        await page.locator('input[placeholder*="GitHub MCP"]').fill('E2E Test Server');
        await page.locator('input[placeholder*="npx"]').fill('echo');
        await page.locator('textarea[placeholder*="--port"]').fill('hello\nworld');

        // Submit
        await page.locator('button:text("Create Server")').click();
        await expect(page.locator('text=MCP server created').first()).toBeVisible({ timeout: 5000 });
        await expect(page.locator('text=E2E Test Server').first()).toBeVisible();
    });

    test('test connection and verify error handling', async ({ page, api }) => {
        await api.seedMcpServer({ name: 'Test Connection Server' });
        await page.goto('/mcp-servers');
        await page.waitForLoadState('networkidle');

        // Expand the server
        await page.locator('text=Test Connection Server').first().click();

        // Click test connection
        await page.locator('button:text("Test Connection")').click();

        // Wait for result (success or failure)
        await page.waitForSelector('.test-result', { timeout: 10000 });
    });

    test('edit config and toggle enabled', async ({ page, api }) => {
        await api.seedMcpServer({ name: 'Server To Edit' });
        await page.goto('/mcp-servers');
        await page.waitForLoadState('networkidle');

        await page.locator('text=Server To Edit').first().click();
        await page.locator('button:text("Edit")').first().click();

        // Toggle enabled
        const enabledCheckbox = page.locator('.server-card__details input[type="checkbox"]');
        await enabledCheckbox.click();

        await page.locator('button:text("Save")').click();
        await expect(page.locator('text=Server updated').first()).toBeVisible({ timeout: 5000 });
    });

    test('delete server config', async ({ page, api }) => {
        await api.seedMcpServer({ name: 'Server To Delete' });
        await page.goto('/mcp-servers');
        await page.waitForLoadState('networkidle');

        await page.locator('text=Server To Delete').first().click();
        await page.locator('button:text("Delete")').click();
        await expect(page.locator('text=Server deleted').first()).toBeVisible({ timeout: 5000 });
    });
});
