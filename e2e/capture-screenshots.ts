import { chromium } from 'playwright';

const BASE = `http://localhost:${process.env.E2E_PORT || '3000'}`;

async function main() {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Full page
    await page.screenshot({ path: 'e2e/screenshots/dashboard-full.png', fullPage: true });
    console.log('✓ dashboard-full.png');

    // Toolbar
    const toolbar = page.locator('.dash-toolbar');
    if ((await toolbar.count()) > 0) {
        await toolbar.screenshot({ path: 'e2e/screenshots/dashboard-toolbar.png' });
        console.log('✓ dashboard-toolbar.png');
    }

    // Metrics row
    const metrics = page.locator('.metrics-row');
    if ((await metrics.count()) > 0) {
        await metrics.first().screenshot({ path: 'e2e/screenshots/dashboard-metrics.png' });
        console.log('✓ dashboard-metrics.png');
    }

    // Agent grid
    const grid = page.locator('.agent-grid');
    if ((await grid.count()) > 0) {
        await grid.screenshot({ path: 'e2e/screenshots/dashboard-agent-grid.png' });
        console.log('✓ dashboard-agent-grid.png');
    }

    // Activity feed
    const feed = page.locator('.section--feed');
    if ((await feed.count()) > 0) {
        await feed.screenshot({ path: 'e2e/screenshots/dashboard-feed.png' });
        console.log('✓ dashboard-feed.png');
    }

    // Status section — clip to actual content bounds
    const status = page.locator('.section--status');
    if ((await status.count()) > 0) {
        await status.scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
        const box = await status.boundingBox();
        console.log(`  status bounding box: ${JSON.stringify(box)}`);
        // Use evaluate to get the actual scrollHeight vs clientHeight
        const dims = await status.evaluate((el) => ({
            scrollH: el.scrollHeight,
            clientH: el.clientHeight,
            offsetH: el.offsetHeight,
            computedH: getComputedStyle(el).height,
        }));
        console.log(`  status dims: ${JSON.stringify(dims)}`);
        // Take screenshot clipped to actual content height
        const clipH = Math.min(dims.scrollH + 4, box?.height ?? 9999);
        if (box) {
            await page.screenshot({
                path: 'e2e/screenshots/dashboard-status.png',
                clip: { x: box.x, y: box.y, width: box.width, height: clipH },
            });
        }
        console.log('✓ dashboard-status.png');
    }

    // Comparison table (Developer view)
    const comparison = page.locator('.comparison-table');
    if ((await comparison.count()) > 0) {
        await comparison.scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
        await comparison.screenshot({ path: 'e2e/screenshots/dashboard-comparison.png' });
        console.log('✓ dashboard-comparison.png');
    }

    await browser.close();
    console.log('\nDone!');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
