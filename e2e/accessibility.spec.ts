import { test, expect, gotoWithRetry } from './fixtures';
import AxeBuilder from '@axe-core/playwright';

/**
 * Accessibility (a11y) audit — runs axe-core against every major page.
 * Covers WCAG 2.1 Level AA by default.
 */

/** Pages that need no seeded data. */
const STATIC_PAGES = [
    { name: 'Dashboard', path: '/dashboard' },
    { name: 'Agents', path: '/agents' },
    { name: 'New Agent', path: '/agents/new' },
    { name: 'Sessions', path: '/sessions' },
    { name: 'Councils', path: '/sessions/councils' },
    { name: 'Work Tasks', path: '/sessions/work-tasks' },
    { name: 'Projects', path: '/projects' },
    { name: 'New Project', path: '/projects/new' },
    { name: 'Chat', path: '/chat' },
    { name: 'Library', path: '/library' },
    { name: 'Comms', path: '/observe/comms' },
    { name: 'Memory', path: '/observe/memory' },
    { name: 'Analytics', path: '/observe/analytics' },
    { name: 'Logs', path: '/observe/logs' },
    { name: 'Reputation', path: '/observe/reputation' },
    { name: 'Settings', path: '/settings' },
    { name: 'Settings Security', path: '/settings/security' },
    { name: 'Settings Access', path: '/settings/access-control' },
    { name: 'Settings Automation', path: '/settings/automation' },
    { name: 'Settings Integrations', path: '/settings/integrations' },
    { name: 'Models', path: '/agents/models' },
    { name: 'Personas', path: '/agents/personas' },
    { name: 'Skill Bundles', path: '/agents/skill-bundles' },
    { name: 'Flock Directory', path: '/agents/flock-directory' },
    { name: 'Marketplace', path: '/marketplace' },
];

test.describe('Accessibility audit', () => {
    for (const { name, path } of STATIC_PAGES) {
        test(`${name} (${path}) has no critical a11y violations`, async ({ page }) => {
            await gotoWithRetry(page, path);
            await page.waitForLoadState('networkidle');
            // Give Angular time to render
            await page.waitForTimeout(1000);

            const results = await new AxeBuilder({ page })
                .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
                .analyze();

            const critical = results.violations.filter(
                (v) => v.impact === 'critical' || v.impact === 'serious',
            );

            if (critical.length > 0) {
                const summary = critical.map((v) => {
                    const nodes = v.nodes.slice(0, 3).map((n) => n.html).join('\n    ');
                    return `[${v.impact}] ${v.id}: ${v.description}\n  Help: ${v.helpUrl}\n  Nodes:\n    ${nodes}`;
                }).join('\n\n');
                console.log(`\n=== A11y violations on ${name} (${path}) ===\n${summary}\n`);
            }

            // Fail on critical/serious violations
            expect(critical, `${name} has ${critical.length} critical/serious a11y violations`).toHaveLength(0);
        });
    }
});
