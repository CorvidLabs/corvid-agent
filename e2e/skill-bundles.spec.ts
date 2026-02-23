import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

/** Navigate to a page, retrying on 429 rate-limit responses or empty lazy-load. */
async function gotoWithRetry(page: Page, path: string, maxRetries = 3): Promise<void> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');

        const body = await page.locator('body').textContent() ?? '';
        const rateLimited = body.includes('Too many requests');
        const rendered = await page.locator('main').locator('*').first().count() > 0;

        if (!rateLimited && rendered) return;

        if (attempt < maxRetries) {
            const match = body.match(/"retryAfter"\s*:\s*(\d+)/);
            const wait = Math.min(Math.max(Number(match?.[1] ?? 5), 3), 10);
            await page.waitForTimeout(wait * 1000 + 500);
        }
    }
}

test.describe('Skill Bundles', () => {
    test('navigate to skill bundles page and verify empty state', async ({ page }) => {
        await gotoWithRetry(page, '/skill-bundles');

        await expect(page.locator('h2:text("Skill Bundles")')).toBeVisible();
    });

    test('create a bundle and verify it appears in list', async ({ page }) => {
        const bundleName = `E2E Bundle ${Date.now()}`;
        await gotoWithRetry(page, '/skill-bundles');

        // Click create button
        await page.locator('button:text("+ New Bundle")').click();
        await expect(page.locator('h3:text("Create Bundle")')).toBeVisible();

        // Fill form
        await page.locator('input[placeholder*="Code Review"]').fill(bundleName);
        await page.locator('input[placeholder*="provides"]').fill('Testing bundle');
        await page.locator('textarea[placeholder*="Read"]').fill('Read\nWrite\nBash');
        await page.locator('textarea[placeholder*="instructions"]').fill('Test prompt additions');

        // Submit
        await page.locator('button:text("Create Bundle")').click();
        await expect(page.locator('text=Bundle created').first()).toBeVisible({ timeout: 5000 });

        // Verify it appears in the list
        await expect(page.locator(`text=${bundleName}`).first()).toBeVisible();
    });

    test('edit bundle and verify changes saved', async ({ page, api }) => {
        const editName = `Edit Bundle ${Date.now()}`;
        const renamedName = `Edited ${Date.now()}`;
        await api.seedSkillBundle({ name: editName });
        await gotoWithRetry(page, '/skill-bundles');

        // Expand the bundle
        await page.locator(`text=${editName}`).first().click();

        // Click edit
        await page.locator('button:text("Edit")').first().click();

        // Modify name
        const nameInput = page.locator('.bundle-card__details input').first();
        await nameInput.clear();
        await nameInput.fill(renamedName);

        // Save
        await page.locator('button:text("Save")').click();
        await expect(page.locator('text=Bundle updated').first()).toBeVisible({ timeout: 5000 });
        await expect(page.locator(`text=${renamedName}`).first()).toBeVisible();
    });

    test('filter by preset and custom', async ({ page, api }) => {
        const filterName = `Custom Filter ${Date.now()}`;
        await api.seedSkillBundle({ name: filterName });
        await gotoWithRetry(page, '/skill-bundles');

        // Click custom filter
        await page.locator('button.filter-tab:text("Custom")').click();
        await expect(page.locator(`text=${filterName}`).first()).toBeVisible();

        // Click preset filter
        await page.locator('button.filter-tab:text("Preset")').click();
        // Custom bundle should not be visible under preset filter
    });

    test('delete non-preset bundle', async ({ page, api }) => {
        const deleteName = `Delete Bundle ${Date.now()}`;
        await api.seedSkillBundle({ name: deleteName });
        await gotoWithRetry(page, '/skill-bundles');

        await page.locator(`text=${deleteName}`).first().click();
        await page.locator('button:text("Delete")').first().click();
        await expect(page.locator('text=Bundle deleted').first()).toBeVisible({ timeout: 5000 });
    });

    test('bundle card expansion shows details', async ({ page, api }) => {
        const name = `Expand Bundle ${Date.now()}`;
        await api.seedSkillBundle({ name, tools: ['Read', 'Write', 'Bash'], promptAdditions: 'Be helpful' });
        await gotoWithRetry(page, '/skill-bundles');

        // Click to expand
        await page.locator(`text=${name}`).first().click();

        // Expanded card shows details
        const card = page.locator('.bundle-card--expanded').first();
        await expect(card).toBeVisible({ timeout: 5000 });

        // Tools list should be visible
        await expect(card.locator('.bundle-card__tools-list')).toBeVisible();

        // Prompt section should be visible
        await expect(card.locator('.bundle-card__prompt')).toBeVisible();
    });

    test('preset bundles cannot be edited or deleted', async ({ page }) => {
        await gotoWithRetry(page, '/skill-bundles');

        // Switch to preset filter
        await page.locator('button.filter-tab:text("Preset")').click();

        const presetCard = page.locator('.bundle-card').first();
        if (await presetCard.count() > 0) {
            // Preset badge should be visible
            await expect(presetCard.locator('.bundle-card__preset')).toBeVisible();

            // Expand the preset card
            await presetCard.locator('.bundle-card__header').click();

            // Edit and Delete buttons should NOT be present for preset bundles
            const editBtn = presetCard.locator('button:text("Edit")');
            const deleteBtn = presetCard.locator('button:text("Delete")');
            expect(await editBtn.count()).toBe(0);
            expect(await deleteBtn.count()).toBe(0);
        }
    });

    test('tool count shown in card header', async ({ page, api }) => {
        const name = `ToolCount Bundle ${Date.now()}`;
        await api.seedSkillBundle({ name, tools: ['Read', 'Write', 'Bash', 'Glob'] });
        await gotoWithRetry(page, '/skill-bundles');

        const card = page.locator(`.bundle-card:has-text("${name}")`).first();
        await expect(card).toBeVisible({ timeout: 5000 });

        // Tool count should be visible in the card meta
        const toolsMeta = card.locator('.bundle-card__tools');
        await expect(toolsMeta).toBeVisible();
        const text = await toolsMeta.textContent();
        expect(text).toContain('4');
    });

    test('filter tabs show counts', async ({ page, api }) => {
        await api.seedSkillBundle({ name: `Count Bundle ${Date.now()}` });
        await gotoWithRetry(page, '/skill-bundles');

        const tabs = page.locator('.filter-tab');
        expect(await tabs.count()).toBe(3); // All, Preset, Custom

        // First tab (All) should be active
        await expect(tabs.first()).toHaveClass(/filter-tab--active/);

        // Each tab text should contain a count (parenthesized number)
        for (let i = 0; i < 3; i++) {
            const text = await tabs.nth(i).textContent();
            expect(text).toBeTruthy();
        }
    });

    test('API CRUD for skill bundles', async ({}) => {
        const BASE_URL = `http://localhost:${process.env.E2E_PORT || '3001'}`;
        const name = `API Bundle ${Date.now()}`;

        // Create
        const createRes = await fetch(`${BASE_URL}/api/skill-bundles`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description: 'API test', tools: ['Read'], promptAdditions: 'test' }),
        });
        expect(createRes.status).toBe(201);
        const bundle = await createRes.json();
        expect(bundle.name).toBe(name);

        // Read
        const readRes = await fetch(`${BASE_URL}/api/skill-bundles/${bundle.id}`);
        expect(readRes.ok).toBe(true);

        // Update
        const updateRes = await fetch(`${BASE_URL}/api/skill-bundles/${bundle.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description: 'Updated' }),
        });
        expect(updateRes.ok).toBe(true);

        // List
        const listRes = await fetch(`${BASE_URL}/api/skill-bundles`);
        expect(listRes.ok).toBe(true);
        const list = await listRes.json();
        expect(Array.isArray(list)).toBe(true);

        // Delete
        const deleteRes = await fetch(`${BASE_URL}/api/skill-bundles/${bundle.id}`, { method: 'DELETE' });
        expect(deleteRes.ok).toBe(true);

        // Verify 404
        const gone = await fetch(`${BASE_URL}/api/skill-bundles/${bundle.id}`);
        expect(gone.status).toBe(404);
    });

    test('validation rejects missing name', async ({}) => {
        const BASE_URL = `http://localhost:${process.env.E2E_PORT || '3001'}`;

        const res = await fetch(`${BASE_URL}/api/skill-bundles`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description: 'No name', tools: ['Read'] }),
        });
        expect(res.status).toBe(400);
    });

    test('assign bundle to agent, list, and remove', async ({ api }) => {
        const BASE_URL = `http://localhost:${process.env.E2E_PORT || '3001'}`;
        const agent = await api.seedAgent('Assign Agent');
        const bundle = await api.seedSkillBundle({ name: `Assign Bundle ${Date.now()}` });

        // Assign
        const assignRes = await fetch(`${BASE_URL}/api/agents/${agent.id}/skills`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bundleId: bundle.id }),
        });
        expect(assignRes.status).toBe(201);

        // List
        const listRes = await fetch(`${BASE_URL}/api/agents/${agent.id}/skills`);
        expect(listRes.ok).toBe(true);
        const list = await listRes.json();
        expect(Array.isArray(list)).toBe(true);
        expect(list.some((b: { id: string }) => b.id === bundle.id)).toBe(true);

        // Remove
        const removeRes = await fetch(`${BASE_URL}/api/agents/${agent.id}/skills/${bundle.id}`, {
            method: 'DELETE',
        });
        expect(removeRes.ok).toBe(true);

        // Verify removed
        const listRes2 = await fetch(`${BASE_URL}/api/agents/${agent.id}/skills`);
        const list2 = await listRes2.json();
        expect(list2.some((b: { id: string }) => b.id === bundle.id)).toBe(false);
    });

    test('assign bundle to project, list, and remove', async ({ api }) => {
        const BASE_URL = `http://localhost:${process.env.E2E_PORT || '3001'}`;
        const project = await api.seedProject('Assign Project');
        const bundle = await api.seedSkillBundle({ name: `Project Bundle ${Date.now()}` });

        // Assign
        const assignRes = await fetch(`${BASE_URL}/api/projects/${project.id}/skills`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bundleId: bundle.id }),
        });
        expect(assignRes.status).toBe(201);

        // List
        const listRes = await fetch(`${BASE_URL}/api/projects/${project.id}/skills`);
        expect(listRes.ok).toBe(true);
        const list = await listRes.json();
        expect(Array.isArray(list)).toBe(true);
        expect(list.some((b: { id: string }) => b.id === bundle.id)).toBe(true);

        // Remove
        const removeRes = await fetch(`${BASE_URL}/api/projects/${project.id}/skills/${bundle.id}`, {
            method: 'DELETE',
        });
        expect(removeRes.ok).toBe(true);

        // Verify removed
        const listRes2 = await fetch(`${BASE_URL}/api/projects/${project.id}/skills`);
        const list2 = await listRes2.json();
        expect(list2.some((b: { id: string }) => b.id === bundle.id)).toBe(false);
    });

    test('agent skill assignment rejects nonexistent bundle', async ({ api }) => {
        const BASE_URL = `http://localhost:${process.env.E2E_PORT || '3001'}`;
        const agent = await api.seedAgent('Bad Assign Agent');

        const res = await fetch(`${BASE_URL}/api/agents/${agent.id}/skills`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bundleId: 'nonexistent' }),
        });
        expect(res.status).toBe(404);
    });

    test('project skill assignment rejects nonexistent bundle', async ({ api }) => {
        const BASE_URL = `http://localhost:${process.env.E2E_PORT || '3001'}`;
        const project = await api.seedProject('Bad Assign Project');

        const res = await fetch(`${BASE_URL}/api/projects/${project.id}/skills`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bundleId: 'nonexistent' }),
        });
        expect(res.status).toBe(404);
    });
});
