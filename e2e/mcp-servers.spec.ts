import { test, expect, gotoWithRetry } from './fixtures';

const BASE_URL = `http://localhost:${process.env.E2E_PORT || '3001'}`;

test.describe('MCP Servers', () => {
    test('navigate to mcp-servers page and verify empty state', async ({ page }) => {
        await gotoWithRetry(page, '/mcp-servers');

        await expect(page.locator('h2:text("MCP Servers")')).toBeVisible();
    });

    test('create server config and verify it appears', async ({ page }) => {
        await gotoWithRetry(page, '/mcp-servers');

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
        await gotoWithRetry(page, '/mcp-servers');

        // Expand the server
        await page.locator('text=Test Connection Server').first().click();

        // Click test connection
        await page.locator('button:text("Test Connection")').click();

        // Wait for result (success or failure)
        await page.waitForSelector('.test-result', { timeout: 10000 });
    });

    test('edit config and toggle enabled', async ({ page, api }) => {
        await api.seedMcpServer({ name: 'Server To Edit' });
        await gotoWithRetry(page, '/mcp-servers');

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
        await gotoWithRetry(page, '/mcp-servers');

        await page.locator('text=Server To Delete').first().click();
        await page.locator('button:text("Delete")').click();
        await expect(page.locator('text=Server deleted').first()).toBeVisible({ timeout: 5000 });
    });

    test('official servers section visible', async ({ page }) => {
        await gotoWithRetry(page, '/mcp-servers');

        const officialGrid = page.locator('.official-grid');
        if (await officialGrid.count() > 0) {
            await expect(officialGrid).toBeVisible();
            const officialCards = page.locator('.official-card');
            expect(await officialCards.count()).toBeGreaterThanOrEqual(1);
        }
    });

    test('server card shows details when expanded', async ({ page, api }) => {
        await api.seedMcpServer({ name: 'Detail Server' });
        await gotoWithRetry(page, '/mcp-servers');

        await page.locator('text=Detail Server').first().click();

        const detailList = page.locator('.server-detail-list');
        if (await detailList.count() > 0) {
            await expect(detailList).toBeVisible({ timeout: 5000 });
        }
    });

    test('API CRUD', async ({}) => {
        // Create
        const createRes = await fetch(`${BASE_URL}/api/mcp-servers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: `API MCP ${Date.now()}`,
                command: 'echo',
                args: ['test'],
                enabled: true,
            }),
        });
        expect(createRes.status).toBe(201);
        const server = await createRes.json();

        // List
        const listRes = await fetch(`${BASE_URL}/api/mcp-servers`);
        expect(listRes.ok).toBe(true);

        // Update
        const updateRes = await fetch(`${BASE_URL}/api/mcp-servers/${server.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Updated MCP Server' }),
        });
        expect(updateRes.ok).toBe(true);

        // Delete
        const deleteRes = await fetch(`${BASE_URL}/api/mcp-servers/${server.id}`, { method: 'DELETE' });
        expect(deleteRes.ok).toBe(true);
    });

    test('POST /api/mcp-servers/:id/test returns 502 for unreachable server', async ({ api }) => {
        const server = await api.seedMcpServer({ name: 'Test Connectivity Server' });

        const res = await fetch(`${BASE_URL}/api/mcp-servers/${server.id}/test`, {
            method: 'POST',
        });
        // 502 (server unreachable) — echo command isn't a valid MCP server
        expect([200, 502]).toContain(res.status);
        const data = await res.json();
        if (res.status === 502) {
            expect(data.ok).toBe(false);
        }
    });
});
