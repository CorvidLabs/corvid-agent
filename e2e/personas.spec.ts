import { test, expect } from './fixtures';

test.describe('Personas', () => {
    test('navigate to personas page and verify agent list renders', async ({ page, api }) => {
        await api.seedAgent('Persona Test Agent');
        await page.goto('/personas');
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h2:text("Persona Manager")')).toBeVisible();
        await expect(page.locator('text=Persona Test Agent').first()).toBeVisible();
    });

    test('select agent and verify persona form appears', async ({ page, api }) => {
        await api.seedAgent('Persona Form Agent');
        await page.goto('/personas');
        await page.waitForLoadState('networkidle');

        // Click on the agent card
        await page.locator(`text=Persona Form Agent`).first().click();

        // Wait for the persona form to appear
        await expect(page.locator('h3:text("Persona for Persona Form Agent")')).toBeVisible();
        await expect(page.locator('select')).toBeVisible(); // archetype dropdown
    });

    test('fill and save persona, verify success notification', async ({ page, api }) => {
        await api.seedAgent('Persona Save Agent');
        await page.goto('/personas');
        await page.waitForLoadState('networkidle');

        await page.locator(`text=Persona Save Agent`).first().click();
        await page.waitForSelector('h3:text("Persona for Persona Save Agent")');

        // Fill form
        await page.locator('select').first().selectOption('technical');
        await page.locator('input[placeholder*="helpful"]').fill('precise, analytical');
        await page.locator('textarea[placeholder*="communicate"]').fill('Use technical language.');
        await page.locator('textarea[placeholder*="background"]').fill('Expert in TypeScript.');

        // Save
        await page.locator('button:text("Save Persona")').click();
        await expect(page.locator('text=Persona saved successfully').first()).toBeVisible({ timeout: 5000 });
    });

    test('reload page and verify persona persists', async ({ page, api }) => {
        const agent = await api.seedAgent('Persona Persist Agent');
        await api.seedPersona(agent.id, { archetype: 'friendly', traits: ['warm', 'approachable'] });

        await page.goto('/personas');
        await page.waitForLoadState('networkidle');

        // Agent should show "Configured" badge
        await page.locator(`text=Persona Persist Agent`).first().click();
        await page.waitForSelector('h3:text("Persona for Persona Persist Agent")');

        // The archetype should be pre-filled
        const archetype = page.locator('select').first();
        await expect(archetype).toHaveValue('friendly');
    });

    test('delete persona and verify removed', async ({ page, api }) => {
        const agent = await api.seedAgent('Persona Delete Agent');
        await api.seedPersona(agent.id);

        await page.goto('/personas');
        await page.waitForLoadState('networkidle');

        await page.locator(`text=Persona Delete Agent`).first().click();
        await page.waitForSelector('button:text("Delete Persona")');

        await page.locator('button:text("Delete Persona")').click();
        await expect(page.locator('text=Persona deleted').first()).toBeVisible({ timeout: 5000 });
    });
});
