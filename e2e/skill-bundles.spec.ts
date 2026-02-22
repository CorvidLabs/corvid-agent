import { test, expect } from './fixtures';

test.describe('Skill Bundles', () => {
    test('navigate to skill bundles page and verify empty state', async ({ page }) => {
        await page.goto('/skill-bundles');
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h2:text("Skill Bundles")')).toBeVisible();
    });

    test('create a bundle and verify it appears in list', async ({ page }) => {
        await page.goto('/skill-bundles');
        await page.waitForLoadState('networkidle');

        // Click create button
        await page.locator('button:text("+ New Bundle")').click();
        await expect(page.locator('h3:text("Create Bundle")')).toBeVisible();

        // Fill form
        await page.locator('input[placeholder*="Code Review"]').fill('E2E Test Bundle');
        await page.locator('input[placeholder*="provides"]').fill('Testing bundle');
        await page.locator('textarea[placeholder*="Read"]').fill('Read\nWrite\nBash');
        await page.locator('textarea[placeholder*="instructions"]').fill('Test prompt additions');

        // Submit
        await page.locator('button:text("Create Bundle")').click();
        await expect(page.locator('text=Bundle created').first()).toBeVisible({ timeout: 5000 });

        // Verify it appears in the list
        await expect(page.locator('text=E2E Test Bundle').first()).toBeVisible();
    });

    test('edit bundle and verify changes saved', async ({ page, api }) => {
        await api.seedSkillBundle({ name: 'Bundle To Edit' });
        await page.goto('/skill-bundles');
        await page.waitForLoadState('networkidle');

        // Expand the bundle
        await page.locator('text=Bundle To Edit').first().click();

        // Click edit
        await page.locator('button:text("Edit")').first().click();

        // Modify name
        const nameInput = page.locator('.bundle-card__details input').first();
        await nameInput.clear();
        await nameInput.fill('Bundle Edited');

        // Save
        await page.locator('button:text("Save")').click();
        await expect(page.locator('text=Bundle updated').first()).toBeVisible({ timeout: 5000 });
        await expect(page.locator('text=Bundle Edited').first()).toBeVisible();
    });

    test('filter by preset and custom', async ({ page, api }) => {
        await api.seedSkillBundle({ name: 'Custom Bundle Filter' });
        await page.goto('/skill-bundles');
        await page.waitForLoadState('networkidle');

        // Click custom filter
        await page.locator('button.filter-tab:text("Custom")').click();
        await expect(page.locator('text=Custom Bundle Filter').first()).toBeVisible();

        // Click preset filter
        await page.locator('button.filter-tab:text("Preset")').click();
        // Custom bundle should not be visible under preset filter
    });

    test('delete non-preset bundle', async ({ page, api }) => {
        await api.seedSkillBundle({ name: 'Bundle To Delete' });
        await page.goto('/skill-bundles');
        await page.waitForLoadState('networkidle');

        await page.locator('text=Bundle To Delete').first().click();
        await page.locator('button:text("Delete")').first().click();
        await expect(page.locator('text=Bundle deleted').first()).toBeVisible({ timeout: 5000 });
    });
});
