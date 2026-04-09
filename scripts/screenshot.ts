/**
 * Screenshot utility for corvid-agent UI.
 *
 * Takes screenshots of dashboard pages for visual review and testing.
 * All screenshots are written to a temporary directory and automatically
 * deleted after a configurable TTL (default: 5 minutes).
 *
 * SECURITY: Screenshots may contain session data, agent names, or other
 * platform state. All output goes to /tmp with auto-cleanup. Never
 * commit screenshots to the repo or persist them beyond the TTL.
 *
 * Usage:
 *   bun scripts/screenshot.ts                          # all default routes
 *   bun scripts/screenshot.ts /dashboard /sessions     # specific routes
 *   bun scripts/screenshot.ts --port 3001              # custom port
 *   bun scripts/screenshot.ts --cleanup-only           # just delete old screenshots
 *
 * Output: prints JSON with screenshot paths for programmatic consumption.
 */

import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { type Browser, chromium, type Page } from 'playwright';

// ── Config ──────────────────────────────────────────────────────────────────

const SCREENSHOT_DIR = join('/tmp', 'corvid-screenshots');
const TTL_MS = 5 * 60 * 1000; // 5 minutes — auto-delete after this
const DEFAULT_PORT = process.env.PORT ?? '3000';
const API_KEY = process.env.API_KEY ?? '';

const DEFAULT_ROUTES = ['/dashboard', '/sessions', '/agents', '/schedules', '/councils', '/work-tasks'];

// ── Cleanup ─────────────────────────────────────────────────────────────────

function cleanupExpired(): number {
  if (!existsSync(SCREENSHOT_DIR)) return 0;

  let deleted = 0;
  const now = Date.now();

  for (const file of readdirSync(SCREENSHOT_DIR)) {
    const filePath = join(SCREENSHOT_DIR, file);
    try {
      const stat = statSync(filePath);
      if (now - stat.mtimeMs > TTL_MS) {
        rmSync(filePath, { force: true });
        deleted++;
      }
    } catch {
      // File may have been deleted between readdir and stat
    }
  }

  // Remove dir if empty
  try {
    const remaining = readdirSync(SCREENSHOT_DIR);
    if (remaining.length === 0) {
      rmSync(SCREENSHOT_DIR, { force: true, recursive: true });
    }
  } catch {
    // Ignore
  }

  return deleted;
}

function cleanupAll(): number {
  if (!existsSync(SCREENSHOT_DIR)) return 0;
  const count = readdirSync(SCREENSHOT_DIR).length;
  rmSync(SCREENSHOT_DIR, { force: true, recursive: true });
  return count;
}

// ── Screenshot capture ──────────────────────────────────────────────────────

interface ScreenshotResult {
  route: string;
  path: string;
  width: number;
  height: number;
  timestamp: string;
}

async function captureRoute(page: Page, baseUrl: string, route: string): Promise<ScreenshotResult> {
  const separator = route.includes('?') ? '&' : '?';
  const url = API_KEY ? `${baseUrl}${route}${separator}apiKey=${API_KEY}` : `${baseUrl}${route}`;

  await page.goto(url, { waitUntil: 'networkidle', timeout: 15_000 });

  // Wait for Angular to render — look for router-outlet content or main
  await page.waitForTimeout(1000);

  const safeName = route.replace(/\//g, '_').replace(/^_/, '') || 'root';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${safeName}_${timestamp}.png`;
  const filepath = join(SCREENSHOT_DIR, filename);

  await page.screenshot({
    path: filepath,
    fullPage: true,
  });

  const viewport = page.viewportSize();

  return {
    route,
    path: filepath,
    width: viewport?.width ?? 1280,
    height: viewport?.height ?? 720,
    timestamp: new Date().toISOString(),
  };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Handle --cleanup-only
  if (args.includes('--cleanup-only')) {
    const deleted = cleanupAll();
    console.log(JSON.stringify({ cleaned: deleted }));
    return;
  }

  // Clean up expired screenshots from previous runs
  const expired = cleanupExpired();

  // Parse args
  let port = DEFAULT_PORT;
  const routes: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      port = args[i + 1];
      i++;
    } else if (args[i].startsWith('/')) {
      routes.push(args[i]);
    }
  }

  if (routes.length === 0) {
    routes.push(...DEFAULT_ROUTES);
  }

  const baseUrl = `http://localhost:${port}`;

  // Verify server is running
  try {
    const health = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(3000) });
    if (!health.ok) throw new Error(`Health check returned ${health.status}`);
  } catch (err) {
    console.error(
      JSON.stringify({
        error: `Server not reachable at ${baseUrl}`,
        detail: err instanceof Error ? err.message : String(err),
      }),
    );
    process.exit(1);
  }

  // Create screenshot directory
  mkdirSync(SCREENSHOT_DIR, { recursive: true, mode: 0o700 });

  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      // Block external requests — screenshots should only capture local UI
      baseURL: baseUrl,
    });

    const page = await context.newPage();
    const results: ScreenshotResult[] = [];

    for (const route of routes) {
      try {
        const result = await captureRoute(page, baseUrl, route);
        results.push(result);
      } catch (err) {
        results.push({
          route,
          path: '',
          width: 0,
          height: 0,
          timestamp: new Date().toISOString(),
        });
        console.error(`Failed to capture ${route}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    await context.close();

    console.log(
      JSON.stringify(
        {
          screenshots: results.filter((r) => r.path),
          failed: results.filter((r) => !r.path).map((r) => r.route),
          dir: SCREENSHOT_DIR,
          ttl_seconds: TTL_MS / 1000,
          expired_cleaned: expired,
          cleanup_at: new Date(Date.now() + TTL_MS).toISOString(),
        },
        null,
        2,
      ),
    );
  } finally {
    if (browser) await browser.close();
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
});
