import { test, expect, gotoWithRetry } from './fixtures';

const BASE_URL = `http://localhost:${process.env.E2E_PORT || '3001'}`;

test.describe('Projects', () => {
    test('page loads with heading', async ({ page }) => {
        await gotoWithRetry(page, '/projects', { isRendered: async (p) => (await p.locator('h2').count()) > 0 || (await p.locator('.list').count()) > 0 });
        await expect(page.locator('h2')).toBeVisible();
        const heading = await page.locator('h2').textContent();
        expect(heading).toContain('Projects');
    });

    test('create project via form', async ({ page }) => {
        const projectName = `PW Project ${Date.now()}`;
        await gotoWithRetry(page, '/projects/new', { isRendered: async (p) => (await p.locator('h2').count()) > 0 || (await p.locator('.list').count()) > 0 });

        await page.locator('#name').fill(projectName);
        await page.locator('#workingDir').fill('/tmp');
        await page.locator('form button[type="submit"]').click();

        // Should redirect to project detail
        await page.waitForURL(/\/projects\/(?!new)/, { timeout: 15000 });
        await expect(page.locator('h2')).toContainText(projectName);

        // Verify in list
        await gotoWithRetry(page, '/projects', { isRendered: async (p) => (await p.locator('h2').count()) > 0 || (await p.locator('.list').count()) > 0 });
        await expect(page.locator(`text=${projectName}`).first()).toBeVisible({ timeout: 10000 });
    });

    test('project detail shows info', async ({ page, api }) => {
        const project = await api.seedProject('Detail Project');
        await gotoWithRetry(page, `/projects/${project.id}`, { isRendered: async (p) => (await p.locator('h2').count()) > 0 || (await p.locator('.list').count()) > 0 });

        await expect(page.locator('h2')).toContainText('Detail Project');
        await expect(page.locator('dt:text("Working Directory")')).toBeVisible();
        await expect(page.locator('button:text("Edit"), a:text("Edit")').first()).toBeVisible();
        await expect(page.locator('button:text("Delete")').first()).toBeVisible();
    });

    test('edit project updates name', async ({ page, api }) => {
        const project = await api.seedProject('Edit Me Project');
        const newName = `Edited Project ${Date.now()}`;

        await gotoWithRetry(page, `/projects/${project.id}`, { isRendered: async (p) => (await p.locator('h2').count()) > 0 || (await p.locator('.list').count()) > 0 });
        await page.locator('a:text("Edit"), button:text("Edit")').first().click();
        await page.waitForURL(/\/projects\/.*\/edit/);

        await page.locator('#name').clear();
        await page.locator('#name').fill(newName);
        await page.locator('form button[type="submit"]').click();

        // Should redirect back to detail with updated name
        await page.waitForURL(/\/projects\/(?!.*edit)/, { timeout: 15000 });
        await expect(page.locator('h2')).toContainText(newName);
    });

    test('delete project removes from list', async ({ page, api }) => {
        const project = await api.seedProject('Delete Me Project');
        await gotoWithRetry(page, `/projects/${project.id}`, { isRendered: async (p) => (await p.locator('h2').count()) > 0 || (await p.locator('.list').count()) > 0 });

        await page.locator('button:text("Delete")').first().click();

        // Should redirect to project list
        await page.waitForURL('/projects', { timeout: 15000 });

        // Verify name is gone
        await expect(page.locator('text=Delete Me Project')).toHaveCount(0, { timeout: 5000 });
    });

    test('API CRUD works', async ({}) => {
        // Create
        const createRes = await fetch(`${BASE_URL}/api/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: `API CRUD ${Date.now()}`, workingDir: '/tmp' }),
        });
        expect(createRes.status).toBe(201);
        const project = await createRes.json();
        expect(project.id).toBeTruthy();

        // Read
        const readRes = await fetch(`${BASE_URL}/api/projects/${project.id}`);
        expect(readRes.ok).toBe(true);
        const read = await readRes.json();
        expect(read.id).toBe(project.id);

        // Update
        const updateRes = await fetch(`${BASE_URL}/api/projects/${project.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Updated Name' }),
        });
        expect(updateRes.ok).toBe(true);

        // Delete
        const deleteRes = await fetch(`${BASE_URL}/api/projects/${project.id}`, { method: 'DELETE' });
        expect(deleteRes.ok).toBe(true);

        // Verify 404 after delete
        const gone = await fetch(`${BASE_URL}/api/projects/${project.id}`);
        expect(gone.status).toBe(404);
    });

    test('list shows items with structure', async ({ page, api }) => {
        await api.seedProject('Structure A');
        await api.seedProject('Structure B');

        await gotoWithRetry(page, '/projects', { isRendered: async (p) => (await p.locator('h2').count()) > 0 || (await p.locator('.list').count()) > 0 });

        const items = page.locator('.list__item');
        expect(await items.count()).toBeGreaterThanOrEqual(2);

        await expect(page.locator('.list__item-title').first()).toBeVisible();
        await expect(page.locator('.list__item-path').first()).toBeVisible();
    });

    test('validation rejects missing fields', async ({}) => {
        // Missing workingDir
        const res1 = await fetch(`${BASE_URL}/api/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'No Dir' }),
        });
        expect(res1.status).toBe(400);

        // Missing name
        const res2 = await fetch(`${BASE_URL}/api/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workingDir: '/tmp' }),
        });
        expect(res2.status).toBe(400);
    });
});
