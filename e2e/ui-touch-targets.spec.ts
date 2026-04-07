import { test, expect, gotoWithRetry } from './fixtures';

/**
 * UI touch-target and button-spacing audit.
 *
 * Checks WCAG 2.5.8 (Target Size) — interactive elements should be at least
 * 44×44 CSS pixels, or 24×24 with adequate spacing. Also checks that adjacent
 * buttons aren't overlapping or touching their borders (< 4px gap).
 */

const MIN_TARGET_SIZE = 44; // px — WCAG 2.5.8 Level AAA
const MIN_TARGET_SIZE_AA = 24; // px — WCAG 2.5.5 Level AA
const MIN_GAP_BETWEEN_TARGETS = 4; // px — minimum spacing so targets don't "touch"

/** Pages to audit with their routes. */
const AUDIT_PAGES = [
    { name: 'Dashboard', path: '/dashboard' },
    { name: 'Agents', path: '/agents' },
    { name: 'Sessions', path: '/sessions' },
    { name: 'Chat', path: '/chat' },
    { name: 'Projects', path: '/projects' },
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

interface TouchTargetIssue {
    element: string;
    text: string;
    width: number;
    height: number;
    issue: string;
}

interface SpacingIssue {
    elementA: string;
    elementB: string;
    textA: string;
    textB: string;
    gap: number;
    direction: 'horizontal' | 'vertical';
}

test.describe('Touch target & button spacing audit', () => {
    for (const { name, path } of AUDIT_PAGES) {
        test(`${name} — buttons meet minimum touch-target size`, async ({ page }) => {
            await gotoWithRetry(page, path);
            await page.waitForLoadState('networkidle');
            await page.waitForTimeout(1000);

            const issues = await page.evaluate((minAA: number) => {
                const results: TouchTargetIssue[] = [];
                const interactiveSelectors = 'button, a[href], [role="button"], input[type="submit"], input[type="button"], .btn, [tabindex="0"]';
                const elements = document.querySelectorAll(interactiveSelectors);

                for (const el of elements) {
                    const rect = el.getBoundingClientRect();
                    // Skip hidden/off-screen elements
                    if (rect.width === 0 || rect.height === 0) continue;
                    if (rect.top > window.innerHeight || rect.left > window.innerWidth) continue;

                    const style = window.getComputedStyle(el);
                    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;

                    const text = (el.textContent || '').trim().slice(0, 50);
                    const tag = el.tagName.toLowerCase();
                    const classes = (el.className && typeof el.className === 'string') ? el.className.split(' ').filter(c => c.startsWith('btn')).join(' ') : '';
                    const descriptor = `<${tag}${classes ? ` class="${classes}"` : ''}>`;

                    const issues: string[] = [];

                    if (rect.height < minAA) {
                        issues.push(`height ${Math.round(rect.height)}px < ${minAA}px`);
                    }
                    if (rect.width < minAA) {
                        issues.push(`width ${Math.round(rect.width)}px < ${minAA}px`);
                    }

                    // Check if text is touching the border (padding too small)
                    const paddingTop = parseFloat(style.paddingTop);
                    const paddingBottom = parseFloat(style.paddingBottom);
                    const paddingLeft = parseFloat(style.paddingLeft);
                    const paddingRight = parseFloat(style.paddingRight);

                    if (tag === 'button' || el.classList.contains('btn')) {
                        if (paddingTop < 4 || paddingBottom < 4) {
                            issues.push(`vertical padding ${Math.round(paddingTop)}/${Math.round(paddingBottom)}px < 4px`);
                        }
                        if (paddingLeft < 6 || paddingRight < 6) {
                            issues.push(`horizontal padding ${Math.round(paddingLeft)}/${Math.round(paddingRight)}px < 6px`);
                        }
                    }

                    if (issues.length > 0) {
                        results.push({
                            element: descriptor,
                            text,
                            width: Math.round(rect.width),
                            height: Math.round(rect.height),
                            issue: issues.join('; '),
                        });
                    }
                }
                return results;
            }, MIN_TARGET_SIZE_AA);

            if (issues.length > 0) {
                const summary = issues.map(i =>
                    `  ${i.element} "${i.text}" (${i.width}×${i.height}px): ${i.issue}`
                ).join('\n');
                console.log(`\n=== Touch target issues on ${name} (${path}) ===\n${summary}\n`);
            }

            // Warn but don't fail on size issues — report them for fixing
            // Fail only if buttons are critically small (< 16px in either dimension)
            const critical = issues.filter(i => i.width < 16 || i.height < 16);
            expect(critical, `${name} has ${critical.length} critically small touch targets (<16px)`).toHaveLength(0);
        });

        test(`${name} — adjacent buttons have adequate spacing`, async ({ page }) => {
            await gotoWithRetry(page, path);
            await page.waitForLoadState('networkidle');
            await page.waitForTimeout(1000);

            const spacingIssues = await page.evaluate((minGap: number) => {
                const results: SpacingIssue[] = [];
                const buttons = Array.from(document.querySelectorAll('button, a[href], [role="button"], .btn'));

                // Only check visible buttons
                const visible = buttons.filter(el => {
                    const rect = el.getBoundingClientRect();
                    if (rect.width === 0 || rect.height === 0) return false;
                    const style = window.getComputedStyle(el);
                    return style.display !== 'none' && style.visibility !== 'hidden';
                });

                for (let i = 0; i < visible.length; i++) {
                    const a = visible[i];
                    const rectA = a.getBoundingClientRect();

                    for (let j = i + 1; j < visible.length; j++) {
                        const b = visible[j];
                        const rectB = b.getBoundingClientRect();

                        // Only check elements that are nearby (within 100px)
                        const dx = Math.max(0, Math.max(rectA.left, rectB.left) - Math.min(rectA.right, rectB.right));
                        const dy = Math.max(0, Math.max(rectA.top, rectB.top) - Math.min(rectA.bottom, rectB.bottom));
                        if (dx > 100 || dy > 100) continue;

                        // Check horizontal adjacency (same row, within vertical overlap)
                        const verticalOverlap = rectA.top < rectB.bottom && rectB.top < rectA.bottom;
                        if (verticalOverlap) {
                            const hGap = Math.max(0, Math.max(rectA.left, rectB.left) - Math.min(rectA.right, rectB.right));
                            if (hGap < minGap && hGap >= 0) {
                                const textA = (a.textContent || '').trim().slice(0, 30);
                                const textB = (b.textContent || '').trim().slice(0, 30);
                                const tagA = a.tagName.toLowerCase();
                                const tagB = b.tagName.toLowerCase();
                                results.push({
                                    elementA: `<${tagA}>`,
                                    elementB: `<${tagB}>`,
                                    textA,
                                    textB,
                                    gap: Math.round(hGap * 10) / 10,
                                    direction: 'horizontal',
                                });
                            }
                        }

                        // Check vertical adjacency (same column, within horizontal overlap)
                        const horizontalOverlap = rectA.left < rectB.right && rectB.left < rectA.right;
                        if (horizontalOverlap && !verticalOverlap) {
                            const vGap = Math.max(0, Math.max(rectA.top, rectB.top) - Math.min(rectA.bottom, rectB.bottom));
                            if (vGap < minGap && vGap >= 0) {
                                const textA = (a.textContent || '').trim().slice(0, 30);
                                const textB = (b.textContent || '').trim().slice(0, 30);
                                const tagA = a.tagName.toLowerCase();
                                const tagB = b.tagName.toLowerCase();
                                results.push({
                                    elementA: `<${tagA}>`,
                                    elementB: `<${tagB}>`,
                                    textA,
                                    textB,
                                    gap: Math.round(vGap * 10) / 10,
                                    direction: 'vertical',
                                });
                            }
                        }
                    }
                }
                return results;
            }, MIN_GAP_BETWEEN_TARGETS);

            if (spacingIssues.length > 0) {
                const summary = spacingIssues.map(s =>
                    `  "${s.textA}" ↔ "${s.textB}" — ${s.gap}px ${s.direction} gap (min ${MIN_GAP_BETWEEN_TARGETS}px)`
                ).join('\n');
                console.log(`\n=== Button spacing issues on ${name} (${path}) ===\n${summary}\n`);
            }

            // Fail on overlapping buttons (0px gap = touching/overlapping)
            const overlapping = spacingIssues.filter(s => s.gap === 0);
            expect(overlapping, `${name} has ${overlapping.length} overlapping/touching button pairs`).toHaveLength(0);
        });
    }

    // Mobile viewport tests — buttons are harder to tap on small screens
    const MOBILE_PAGES = [
        { name: 'Dashboard (mobile)', path: '/dashboard' },
        { name: 'Chat (mobile)', path: '/chat' },
        { name: 'Agents (mobile)', path: '/agents' },
        { name: 'Sessions (mobile)', path: '/sessions' },
        { name: 'Settings (mobile)', path: '/settings' },
    ];

    for (const { name, path } of MOBILE_PAGES) {
        test(`${name} — touch targets are tappable at 375px`, async ({ page }) => {
            await page.setViewportSize({ width: 375, height: 812 });
            await gotoWithRetry(page, path);
            await page.waitForLoadState('networkidle');
            await page.waitForTimeout(1000);

            const issues = await page.evaluate((minTarget: number) => {
                const results: TouchTargetIssue[] = [];
                const elements = document.querySelectorAll('button, a[href], [role="button"], .btn');

                for (const el of elements) {
                    const rect = el.getBoundingClientRect();
                    if (rect.width === 0 || rect.height === 0) continue;
                    if (rect.top > window.innerHeight) continue;

                    const style = window.getComputedStyle(el);
                    if (style.display === 'none' || style.visibility === 'hidden') continue;

                    const text = (el.textContent || '').trim().slice(0, 50);
                    const tag = el.tagName.toLowerCase();
                    const classes = (el.className && typeof el.className === 'string') ? el.className.split(' ').filter(c => c.startsWith('btn')).join(' ') : '';

                    // On mobile, all interactive elements should be at least 44px for comfortable tapping
                    if (rect.height < minTarget || rect.width < minTarget) {
                        results.push({
                            element: `<${tag}${classes ? ` class="${classes}"` : ''}>`,
                            text,
                            width: Math.round(rect.width),
                            height: Math.round(rect.height),
                            issue: `${Math.round(rect.width)}×${Math.round(rect.height)}px < ${minTarget}×${minTarget}px recommended`,
                        });
                    }
                }
                return results;
            }, MIN_TARGET_SIZE);

            if (issues.length > 0) {
                const summary = issues.map(i =>
                    `  ${i.element} "${i.text}" — ${i.width}×${i.height}px`
                ).join('\n');
                console.log(`\n=== Mobile touch target warnings on ${name} (${path}) ===\n${summary}\n`);
            }

            // On mobile, fail if any button is smaller than 24px (AA minimum)
            const tooSmall = issues.filter(i => i.width < MIN_TARGET_SIZE_AA || i.height < MIN_TARGET_SIZE_AA);
            expect(tooSmall, `${name} has ${tooSmall.length} buttons below AA minimum (${MIN_TARGET_SIZE_AA}px)`).toHaveLength(0);
        });
    }
});

test.describe('Button padding audit (text touching border)', () => {
    const KEY_PAGES = [
        { name: 'Settings', path: '/settings' },
        { name: 'Agents', path: '/agents' },
        { name: 'Dashboard', path: '/dashboard' },
        { name: 'Chat', path: '/chat' },
        { name: 'Sessions', path: '/sessions' },
    ];

    for (const { name, path } of KEY_PAGES) {
        test(`${name} — button text has adequate padding from border`, async ({ page }) => {
            await gotoWithRetry(page, path);
            await page.waitForLoadState('networkidle');
            await page.waitForTimeout(1000);

            const paddingIssues = await page.evaluate(() => {
                const results: Array<{
                    element: string;
                    text: string;
                    padding: string;
                    fontSize: string;
                    borderWidth: string;
                }> = [];

                const buttons = document.querySelectorAll('button, .btn');
                for (const btn of buttons) {
                    const rect = btn.getBoundingClientRect();
                    if (rect.width === 0 || rect.height === 0) continue;

                    const style = window.getComputedStyle(btn);
                    if (style.display === 'none' || style.visibility === 'hidden') continue;

                    const pt = parseFloat(style.paddingTop);
                    const pb = parseFloat(style.paddingBottom);
                    const pl = parseFloat(style.paddingLeft);
                    const pr = parseFloat(style.paddingRight);
                    const fontSize = parseFloat(style.fontSize);
                    const borderWidth = parseFloat(style.borderWidth) || 0;

                    const text = (btn.textContent || '').trim().slice(0, 40);
                    const tag = btn.tagName.toLowerCase();
                    const classes = (btn.className && typeof btn.className === 'string')
                        ? '.' + btn.className.split(/\s+/).filter(Boolean).join('.')
                        : '';

                    // Flag buttons where padding is less than 25% of font size (text crammed against border)
                    const minPaddingForFont = fontSize * 0.25;
                    const vertCrammed = pt < minPaddingForFont || pb < minPaddingForFont;
                    const horizCrammed = pl < minPaddingForFont || pr < minPaddingForFont;

                    // Also flag if border is present and padding is very tight
                    const hasBorder = borderWidth > 0;
                    const borderCrammed = hasBorder && (pt < 3 || pb < 3 || pl < 5 || pr < 5);

                    if (vertCrammed || horizCrammed || borderCrammed) {
                        results.push({
                            element: `<${tag}${classes}>`,
                            text,
                            padding: `${Math.round(pt)}/${Math.round(pr)}/${Math.round(pb)}/${Math.round(pl)}`,
                            fontSize: `${Math.round(fontSize)}px`,
                            borderWidth: `${borderWidth}px`,
                        });
                    }
                }
                return results;
            });

            if (paddingIssues.length > 0) {
                const summary = paddingIssues.map(i =>
                    `  ${i.element} "${i.text}" — padding: ${i.padding} (T/R/B/L), font: ${i.fontSize}, border: ${i.borderWidth}`
                ).join('\n');
                console.log(`\n=== Button padding issues on ${name} (${path}) ===\n${summary}\n`);
            }

            // Report count for awareness — these are the "touching their own border" issues Leif mentioned
            if (paddingIssues.length > 0) {
                console.log(`  → ${paddingIssues.length} buttons with cramped padding on ${name}`);
            }
        });
    }
});
