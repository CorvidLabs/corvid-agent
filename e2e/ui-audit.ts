import { chromium } from 'playwright';

const BASE = `http://localhost:${process.env.E2E_PORT || '3000'}`;
const SCREENSHOT_DIR = 'e2e/screenshots/audit';

interface PageAudit {
    route: string;
    name: string;
    checks: string[];
}

const PAGES: PageAudit[] = [
    { route: '/dashboard', name: 'dashboard', checks: ['h1, h2, .page-title', '.dash-toolbar', '.metrics-row'] },
    { route: '/chat', name: 'chat', checks: ['.terminal-chat, .chat-container', 'textarea, input'] },
    { route: '/library', name: 'library', checks: ['.library, .page-shell'] },
    { route: '/observe/comms', name: 'comms', checks: ['.agent-comms, .page-shell'] },
    { route: '/observe/memory', name: 'memory', checks: ['.memory, .page-shell'] },
    { route: '/observe/analytics', name: 'analytics', checks: ['.analytics, .page-shell'] },
    { route: '/observe/logs', name: 'logs', checks: ['.logs, .page-shell'] },
    { route: '/observe/reputation', name: 'reputation', checks: ['.reputation, .page-shell'] },
    { route: '/agents', name: 'agents', checks: ['.agent-list, .page-shell'] },
    { route: '/sessions', name: 'sessions', checks: ['.session-list, .page-shell'] },
    { route: '/councils', name: 'councils', checks: ['.council-list, .page-shell'] },
    { route: '/projects', name: 'projects', checks: ['.project-list, .page-shell'] },
    { route: '/work-tasks', name: 'work-tasks', checks: ['.work-task, .page-shell'] },
    { route: '/flock', name: 'flock-directory', checks: ['.flock, .page-shell'] },
    { route: '/settings/general', name: 'settings-general', checks: ['.settings, .page-shell'] },
    { route: '/settings/access', name: 'settings-access', checks: ['.settings, .page-shell'] },
    { route: '/settings/automation', name: 'settings-automation', checks: ['.settings, .page-shell'] },
    { route: '/settings/integrations', name: 'settings-integrations', checks: ['.settings, .page-shell'] },
    { route: '/wallets', name: 'wallets', checks: ['.wallet, .page-shell'] },
    { route: '/spending', name: 'spending', checks: ['.spending, .page-shell'] },
    { route: '/models', name: 'models', checks: ['.model, .page-shell'] },
    { route: '/personas', name: 'personas', checks: ['.persona, .page-shell'] },
    { route: '/skill-bundles', name: 'skill-bundles', checks: ['.skill-bundle, .page-shell'] },
    { route: '/marketplace', name: 'marketplace', checks: ['.marketplace, .page-shell'] },
];

async function main() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    const results: { name: string; route: string; status: string; errors: string[]; consoleErrors: string[]; loadTime: number }[] = [];

    // Collect console errors
    const consoleErrors: string[] = [];
    page.on('console', msg => {
        if (msg.type() === 'error') {
            consoleErrors.push(msg.text());
        }
    });

    // Collect uncaught exceptions
    page.on('pageerror', err => {
        consoleErrors.push(`UNCAUGHT: ${err.message}`);
    });

    for (const p of PAGES) {
        consoleErrors.length = 0;
        const errors: string[] = [];
        const start = Date.now();

        try {
            const response = await page.goto(`${BASE}${p.route}`, { waitUntil: 'networkidle', timeout: 15000 });
            const loadTime = Date.now() - start;

            if (!response || response.status() >= 400) {
                errors.push(`HTTP ${response?.status() ?? 'no response'}`);
            }

            // Wait a bit for Angular rendering
            await page.waitForTimeout(1500);

            // Check for error overlays
            const errorOverlay = await page.locator('.cdk-overlay-container .error, .toast-error, [class*="error"]').count();
            if (errorOverlay > 0) {
                const errorText = await page.locator('.cdk-overlay-container .error, .toast-error').first().textContent().catch(() => '');
                if (errorText) errors.push(`Error overlay: ${errorText.slice(0, 100)}`);
            }

            // Check if page is blank (no content rendered)
            const bodyText = await page.locator('body').textContent();
            if (!bodyText || bodyText.trim().length < 10) {
                errors.push('Page appears blank');
            }

            // Check for "loading" states stuck
            const loadingSpinners = await page.locator('.skeleton, .loading, [class*="spinner"]').count();

            // Take screenshot
            await page.screenshot({
                path: `${SCREENSHOT_DIR}/${p.name}.png`,
                fullPage: true
            });

            // Check viewport-specific issues
            const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
            if (overflowX) errors.push('Horizontal overflow detected');

            // Collect console errors for this page
            const pageConsoleErrors = [...consoleErrors];

            results.push({
                name: p.name,
                route: p.route,
                status: errors.length === 0 && pageConsoleErrors.length === 0 ? '✅' :
                        errors.length > 0 ? '❌' : '⚠️',
                errors,
                consoleErrors: pageConsoleErrors,
                loadTime,
            });

            const icon = errors.length === 0 ? '✅' : '❌';
            console.log(`${icon} ${p.name} (${p.route}) — ${loadTime}ms${loadingSpinners > 0 ? ` [${loadingSpinners} loading]` : ''}${errors.length > 0 ? ` ERRORS: ${errors.join(', ')}` : ''}`);
            if (pageConsoleErrors.length > 0) {
                console.log(`   ⚠️ Console errors: ${pageConsoleErrors.slice(0, 3).join(' | ')}`);
            }

        } catch (err: any) {
            const loadTime = Date.now() - start;
            errors.push(`Navigation failed: ${err.message.slice(0, 100)}`);
            results.push({
                name: p.name,
                route: p.route,
                status: '❌',
                errors,
                consoleErrors: [...consoleErrors],
                loadTime,
            });
            console.log(`❌ ${p.name} (${p.route}) — FAILED: ${err.message.slice(0, 100)}`);
        }
    }

    // Now test mobile viewport
    console.log('\n--- Mobile viewport (375x812) ---');
    await page.setViewportSize({ width: 375, height: 812 });

    const mobilePages = ['/dashboard', '/chat', '/agents', '/sessions', '/settings/general'];
    for (const route of mobilePages) {
        try {
            await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 15000 });
            await page.waitForTimeout(1000);
            await page.screenshot({
                path: `${SCREENSHOT_DIR}/mobile-${route.replace(/\//g, '-').slice(1)}.png`,
                fullPage: true
            });

            const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
            console.log(`${overflowX ? '❌' : '✅'} Mobile: ${route}${overflowX ? ' — HORIZONTAL OVERFLOW' : ''}`);
        } catch (err: any) {
            console.log(`❌ Mobile: ${route} — ${err.message.slice(0, 80)}`);
        }
    }

    // Summary
    console.log('\n=== SUMMARY ===');
    const passed = results.filter(r => r.status === '✅').length;
    const warned = results.filter(r => r.status === '⚠️').length;
    const failed = results.filter(r => r.status === '❌').length;
    console.log(`${passed} passed, ${warned} warnings, ${failed} failed out of ${results.length} pages`);

    if (failed > 0) {
        console.log('\nFailed pages:');
        for (const r of results.filter(r => r.status === '❌')) {
            console.log(`  ${r.name}: ${r.errors.join(', ')}`);
        }
    }

    const avgLoad = Math.round(results.reduce((s, r) => s + r.loadTime, 0) / results.length);
    const slowest = results.reduce((a, b) => a.loadTime > b.loadTime ? a : b);
    console.log(`\nAvg load: ${avgLoad}ms, Slowest: ${slowest.name} (${slowest.loadTime}ms)`);

    await browser.close();
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
