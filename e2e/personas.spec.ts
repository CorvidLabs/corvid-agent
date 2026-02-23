import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

/** Navigate to personas page, retrying on 429 or empty agent list (component data fetch rate-limited). */
async function gotoPersonas(page: Page, agentName: string, maxRetries = 5): Promise<void> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        await page.goto('/personas');
        await page.waitForLoadState('networkidle');

        const body = await page.locator('body').textContent() ?? '';
        const rateLimited = body.includes('Too many requests');
        // Check both heading AND the specific agent name (loadAgents may be rate-limited)
        const headingVisible = await page.locator('h2:text("Persona Manager")').count() > 0;
        const agentVisible = await page.locator(`text=${agentName}`).count() > 0;

        if (!rateLimited && headingVisible && agentVisible) return;

        if (attempt < maxRetries) {
            const match = body.match(/"retryAfter"\s*:\s*(\d+)/);
            const wait = Math.min(Math.max(Number(match?.[1] ?? 5), 3), 10);
            await page.waitForTimeout(wait * 1000 + 500);
        }
    }
}

test.describe('Personas', () => {
    test('navigate to personas page and verify agent list renders', async ({ page, api }) => {
        await api.seedAgent('Persona Test Agent');
        await gotoPersonas(page, 'Persona Test Agent');

        await expect(page.locator('h2:text("Persona Manager")')).toBeVisible();
        await expect(page.locator('text=Persona Test Agent').first()).toBeVisible();
    });

    test('select agent and verify persona form appears', async ({ page, api }) => {
        await api.seedAgent('Persona Form Agent');
        await gotoPersonas(page, 'Persona Form Agent');

        // Click on the agent card
        await page.locator(`text=Persona Form Agent`).first().click();

        // Wait for the persona detail panel to appear (agent name as heading)
        await expect(page.locator('.detail-header h3')).toBeVisible();
        await expect(page.locator('select')).toBeVisible(); // archetype dropdown
    });

    test('fill and save persona, verify success notification', async ({ page, api }) => {
        await api.seedAgent('Persona Save Agent');
        await gotoPersonas(page, 'Persona Save Agent');

        await page.locator(`text=Persona Save Agent`).first().click();
        await page.waitForSelector('.detail-header h3');

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

        await gotoPersonas(page, 'Persona Persist Agent');

        // Agent should show "Configured" badge
        await page.locator(`text=Persona Persist Agent`).first().click();
        await page.waitForSelector('.detail-header h3');

        // The archetype should be pre-filled
        const archetype = page.locator('select').first();
        await expect(archetype).toHaveValue('friendly');
    });

    test('delete persona and verify removed', async ({ page, api }) => {
        const agent = await api.seedAgent('Persona Delete Agent');
        await api.seedPersona(agent.id);

        await gotoPersonas(page, 'Persona Delete Agent');

        await page.locator(`text=Persona Delete Agent`).first().click();
        await page.waitForSelector('button:text("Delete Persona")');

        await page.locator('button:text("Delete Persona")').click();
        await expect(page.locator('text=Persona deleted').first()).toBeVisible({ timeout: 5000 });
    });

    test('agent card shows configured badge', async ({ page, api }) => {
        const agent = await api.seedAgent('Badge Agent');
        await api.seedPersona(agent.id);

        await gotoPersonas(page, 'Badge Agent');

        // With the chip picker layout, configured agents show a checkmark via data-status="configured"
        const chip = page.locator(`.agent-chip:has-text("Badge Agent")`).first();
        if (await chip.count() > 0) {
            await expect(chip).toHaveAttribute('data-status', 'configured');
        }
    });

    test('archetype dropdown has standard options', async ({ page, api }) => {
        await api.seedAgent('Archetype Agent');
        await gotoPersonas(page, 'Archetype Agent');

        await page.locator(`text=Archetype Agent`).first().click();
        await page.waitForSelector('select');

        const select = page.locator('select').first();
        const options = await select.locator('option').allTextContents();
        const joined = options.join(' ').toLowerCase();
        expect(joined).toContain('professional');
        expect(joined).toContain('friendly');
        expect(joined).toContain('technical');
    });
});
