/**
 * BrowserService — Manages a persistent Playwright browser instance that
 * agents can use for browser automation via the corvid_browser MCP tool.
 *
 * Uses the system Chrome installation (channel: 'chrome') to avoid
 * downloading additional browser binaries. Lazily launched on first use,
 * shared across all agent sessions.
 *
 * @module
 */
import { type Browser, type BrowserContext, chromium, type Page } from 'playwright';
import { createLogger } from '../lib/logger';

const log = createLogger('BrowserService');

/** Max pages allowed at once to prevent runaway tab creation. */
const MAX_PAGES = 20;
/** Page navigation timeout (ms). */
const NAV_TIMEOUT = 30_000;
export interface BrowserTab {
  id: number;
  url: string;
  title: string;
}

export class BrowserService {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private pages: Map<number, Page> = new Map();
  private nextTabId = 1;
  private launching = false;

  /** Launch the browser if not already running. */
  async ensureBrowser(): Promise<void> {
    if (this.browser?.isConnected()) return;
    if (this.launching) {
      // Wait for an in-progress launch
      while (this.launching) await new Promise((r) => setTimeout(r, 100));
      return;
    }
    this.launching = true;
    try {
      log.info('Launching Chrome browser');
      this.browser = await chromium.launch({
        channel: 'chrome',
        headless: true,
        args: ['--no-sandbox', '--disable-gpu'],
      });
      this.context = await this.browser.newContext({
        viewport: { width: 1280, height: 900 },
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      });
      this.pages.clear();
      this.nextTabId = 1;
      log.info('Chrome browser launched');
    } catch (err) {
      log.error('Failed to launch Chrome', { error: err instanceof Error ? err.message : String(err) });
      this.browser = null;
      this.context = null;
      throw err;
    } finally {
      this.launching = false;
    }
  }

  /** Check if the browser is running. */
  get isRunning(): boolean {
    return this.browser?.isConnected() === true;
  }

  /** List open tabs. */
  async tabsContext(): Promise<BrowserTab[]> {
    await this.ensureBrowser();
    const tabs: BrowserTab[] = [];
    for (const [id, page] of this.pages) {
      tabs.push({ id, url: page.url(), title: await page.title().catch(() => '') });
    }
    return tabs;
  }

  /** Create a new tab, optionally navigating to a URL. */
  async createTab(url?: string): Promise<BrowserTab> {
    await this.ensureBrowser();
    if (this.pages.size >= MAX_PAGES) {
      throw new Error(`Maximum ${MAX_PAGES} tabs reached. Close some tabs first.`);
    }
    const page = await this.context!.newPage();
    const id = this.nextTabId++;
    this.pages.set(id, page);
    page.on('close', () => this.pages.delete(id));

    if (url) {
      await page.goto(url, { timeout: NAV_TIMEOUT, waitUntil: 'domcontentloaded' });
    }
    return { id, url: page.url(), title: await page.title().catch(() => '') };
  }

  /** Close a tab. */
  async closeTab(tabId: number): Promise<void> {
    const page = this.getPage(tabId);
    await page.close();
    this.pages.delete(tabId);
  }

  /** Navigate an existing tab to a URL. */
  async navigate(tabId: number, url: string): Promise<{ url: string; title: string }> {
    const page = this.getPage(tabId);
    await page.goto(url, { timeout: NAV_TIMEOUT, waitUntil: 'domcontentloaded' });
    return { url: page.url(), title: await page.title().catch(() => '') };
  }

  /** Get the text content of a page. */
  async getPageText(tabId: number): Promise<string> {
    const page = this.getPage(tabId);
    return page.evaluate(() => document.body.innerText).catch(() => '');
  }

  /** Read page structure — returns a simplified DOM tree. */
  async readPage(tabId: number, opts?: { selector?: string; maxLength?: number }): Promise<string> {
    const page = this.getPage(tabId);
    const selector = opts?.selector ?? 'body';
    const maxLen = opts?.maxLength ?? 50_000;

    const text = await page.evaluate(
      ({ sel, max }: { sel: string; max: number }) => {
        const el = document.querySelector(sel);
        if (!el) return `No element found for selector: ${sel}`;
        // Get a simplified representation
        const lines: string[] = [];
        const walk = (node: Element, depth: number) => {
          if (lines.length > 500) return;
          const tag = node.tagName.toLowerCase();
          const id = node.id ? `#${node.id}` : '';
          const cls =
            node.className && typeof node.className === 'string'
              ? `.${node.className.split(' ').filter(Boolean).slice(0, 2).join('.')}`
              : '';
          const text =
            node.childNodes.length === 1 && node.childNodes[0].nodeType === 3
              ? ` "${(node.childNodes[0].textContent ?? '').trim().slice(0, 80)}"`
              : '';
          const href = node.getAttribute('href') ? ` href="${node.getAttribute('href')}"` : '';
          lines.push('  '.repeat(depth) + `<${tag}${id}${cls}${href}>${text}`);
          for (const child of node.children) walk(child, depth + 1);
        };
        walk(el, 0);
        return lines.join('\n').slice(0, max);
      },
      { sel: selector, max: maxLen },
    );

    return text;
  }

  /** Find elements matching a CSS selector or text. */
  async find(tabId: number, query: string): Promise<string> {
    const page = this.getPage(tabId);
    // Try as CSS selector first, fall back to text search
    const results = await page.evaluate((q: string) => {
      const matches: string[] = [];
      // CSS selector
      try {
        const els = document.querySelectorAll(q);
        if (els.length > 0) {
          els.forEach((el, i) => {
            if (i >= 20) return;
            const tag = el.tagName.toLowerCase();
            const text = (el.textContent ?? '').trim().slice(0, 100);
            matches.push(`[${i}] <${tag}> "${text}"`);
          });
          return `Found ${els.length} elements matching selector "${q}":\n${matches.join('\n')}`;
        }
      } catch {
        /* not a valid selector */
      }
      // Text search
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let count = 0;
      while (walker.nextNode() && count < 20) {
        const node = walker.currentNode;
        if (node.textContent && node.textContent.toLowerCase().includes(q.toLowerCase())) {
          const parent = node.parentElement;
          const tag = parent?.tagName.toLowerCase() ?? '?';
          matches.push(`[${count}] <${tag}> "${node.textContent.trim().slice(0, 100)}"`);
          count++;
        }
      }
      return matches.length > 0
        ? `Found ${matches.length} text matches for "${q}":\n${matches.join('\n')}`
        : `No matches found for "${q}"`;
    }, query);
    return results;
  }

  /** Execute JavaScript in a tab. */
  async executeJs(tabId: number, code: string): Promise<string> {
    const page = this.getPage(tabId);
    const result = await page.evaluate(code).catch((err: Error) => `Error: ${err.message}`);
    return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
  }

  /** Take a screenshot of a tab. Returns base64-encoded PNG. */
  async screenshot(tabId: number, opts?: { fullPage?: boolean }): Promise<Buffer> {
    const page = this.getPage(tabId);
    return page.screenshot({ fullPage: opts?.fullPage, type: 'png' });
  }

  /** Click at coordinates or on a selector. */
  async click(tabId: number, target: { x: number; y: number } | { selector: string }): Promise<void> {
    const page = this.getPage(tabId);
    if ('selector' in target) {
      await page.click(target.selector, { timeout: 5000 });
    } else {
      await page.mouse.click(target.x, target.y);
    }
  }

  /** Type text (optionally into a selector). */
  async type(tabId: number, text: string, selector?: string): Promise<void> {
    const page = this.getPage(tabId);
    if (selector) {
      await page.fill(selector, text);
    } else {
      await page.keyboard.type(text);
    }
  }

  /** Press a key or key combination. */
  async press(tabId: number, key: string): Promise<void> {
    const page = this.getPage(tabId);
    await page.keyboard.press(key);
  }

  /** Scroll the page. */
  async scroll(tabId: number, direction: 'up' | 'down', amount?: number): Promise<void> {
    const page = this.getPage(tabId);
    const delta = (amount ?? 500) * (direction === 'up' ? -1 : 1);
    await page.mouse.wheel(0, delta);
  }

  /** Fill a form field. */
  async formInput(tabId: number, selector: string, value: string): Promise<void> {
    const page = this.getPage(tabId);
    await page.fill(selector, value);
  }

  /** Wait for a specified duration or for a selector to appear. */
  async wait(tabId: number, opts: { ms?: number; selector?: string }): Promise<void> {
    const page = this.getPage(tabId);
    if (opts.selector) {
      await page.waitForSelector(opts.selector, { timeout: opts.ms ?? 10_000 });
    } else {
      await page.waitForTimeout(opts.ms ?? 1000);
    }
  }

  /** Shut down the browser. */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close().catch((err) => {
        log.warn('Browser close failed', { error: err instanceof Error ? err.message : String(err) });
      });
      this.browser = null;
      this.context = null;
      this.pages.clear();
      log.info('Browser closed');
    }
  }

  /** Get a page by tab ID, or throw. */
  private getPage(tabId: number): Page {
    const page = this.pages.get(tabId);
    if (!page) {
      const available = [...this.pages.keys()];
      throw new Error(
        `Tab ${tabId} not found. Available tabs: ${available.length > 0 ? available.join(', ') : 'none — create one with tabs_create'}`,
      );
    }
    return page;
  }
}
