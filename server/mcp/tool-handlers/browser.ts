/**
 * corvid_browser — Browser automation tool handler.
 *
 * Provides agents with browser control via Playwright and the system Chrome.
 * Actions: tabs_context, tabs_create, close_tab, navigate, get_page_text,
 * read_page, find, click, type, press, scroll, form_input, javascript,
 * screenshot, wait.
 *
 * @module
 */
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { createLogger } from '../../lib/logger';
import type { McpToolContext } from './types';
import { errorResult, textResult } from './types';

const log = createLogger('McpBrowser');

export async function handleBrowser(
  ctx: McpToolContext,
  args: {
    action: string;
    tab_id?: number;
    url?: string;
    query?: string;
    selector?: string;
    code?: string;
    text?: string;
    key?: string;
    value?: string;
    direction?: string;
    amount?: number;
    x?: number;
    y?: number;
    full_page?: boolean;
    max_length?: number;
    ms?: number;
  },
): Promise<CallToolResult> {
  if (!ctx.browserService) {
    return errorResult('Browser service is not available. The server may not have Playwright/Chrome installed.');
  }

  const svc = ctx.browserService;

  try {
    switch (args.action) {
      // ─── Tab management ──────────────────────────────────────────
      case 'tabs_context': {
        const tabs = await svc.tabsContext();
        if (tabs.length === 0) {
          return textResult('No open tabs. Use action "tabs_create" to open one.');
        }
        const lines = tabs.map((t) => `Tab ${t.id}: ${t.title || '(untitled)'} — ${t.url}`);
        return textResult(`Open tabs:\n${lines.join('\n')}`);
      }

      case 'tabs_create': {
        ctx.emitStatus?.('Opening new browser tab...');
        const tab = await svc.createTab(args.url);
        return textResult(`Created tab ${tab.id}: ${tab.title || '(untitled)'} — ${tab.url}`);
      }

      case 'close_tab': {
        if (args.tab_id == null) return errorResult('tab_id is required for close_tab');
        await svc.closeTab(args.tab_id);
        return textResult(`Closed tab ${args.tab_id}`);
      }

      // ─── Navigation ──────────────────────────────────────────────
      case 'navigate': {
        if (args.tab_id == null) return errorResult('tab_id is required for navigate');
        if (!args.url) return errorResult('url is required for navigate');
        ctx.emitStatus?.(`Navigating to ${args.url}...`);
        const result = await svc.navigate(args.tab_id, args.url);
        return textResult(`Navigated to: ${result.title} — ${result.url}`);
      }

      // ─── Reading ─────────────────────────────────────────────────
      case 'get_page_text': {
        if (args.tab_id == null) return errorResult('tab_id is required for get_page_text');
        ctx.emitStatus?.('Reading page text...');
        const text = await svc.getPageText(args.tab_id);
        const truncated = text.length > 50_000 ? `${text.slice(0, 50_000)}\n...(truncated)` : text;
        return textResult(truncated);
      }

      case 'read_page': {
        if (args.tab_id == null) return errorResult('tab_id is required for read_page');
        ctx.emitStatus?.('Reading page structure...');
        const html = await svc.readPage(args.tab_id, {
          selector: args.selector,
          maxLength: args.max_length,
        });
        return textResult(html);
      }

      case 'find': {
        if (args.tab_id == null) return errorResult('tab_id is required for find');
        if (!args.query) return errorResult('query is required for find (CSS selector or text)');
        const found = await svc.find(args.tab_id, args.query);
        return textResult(found);
      }

      // ─── Interaction ─────────────────────────────────────────────
      case 'click': {
        if (args.tab_id == null) return errorResult('tab_id is required for click');
        if (args.selector) {
          await svc.click(args.tab_id, { selector: args.selector });
        } else if (args.x != null && args.y != null) {
          await svc.click(args.tab_id, { x: args.x, y: args.y });
        } else {
          return errorResult('click requires either selector or x+y coordinates');
        }
        return textResult('Clicked');
      }

      case 'type': {
        if (args.tab_id == null) return errorResult('tab_id is required for type');
        if (!args.text) return errorResult('text is required for type');
        await svc.type(args.tab_id, args.text, args.selector);
        return textResult(`Typed "${args.text.slice(0, 50)}${args.text.length > 50 ? '...' : ''}"`);
      }

      case 'press': {
        if (args.tab_id == null) return errorResult('tab_id is required for press');
        if (!args.key) return errorResult('key is required for press (e.g. "Enter", "Tab", "Escape")');
        await svc.press(args.tab_id, args.key);
        return textResult(`Pressed ${args.key}`);
      }

      case 'scroll': {
        if (args.tab_id == null) return errorResult('tab_id is required for scroll');
        const dir = (args.direction ?? 'down') as 'up' | 'down';
        await svc.scroll(args.tab_id, dir, args.amount);
        return textResult(`Scrolled ${dir}`);
      }

      case 'form_input': {
        if (args.tab_id == null) return errorResult('tab_id is required for form_input');
        if (!args.selector) return errorResult('selector is required for form_input');
        if (args.value == null) return errorResult('value is required for form_input');
        await svc.formInput(args.tab_id, args.selector, args.value);
        return textResult(`Filled "${args.selector}" with value`);
      }

      // ─── Advanced ────────────────────────────────────────────────
      case 'javascript': {
        if (args.tab_id == null) return errorResult('tab_id is required for javascript');
        if (!args.code) return errorResult('code is required for javascript');
        ctx.emitStatus?.('Executing JavaScript...');
        const jsResult = await svc.executeJs(args.tab_id, args.code);
        return textResult(jsResult);
      }

      case 'screenshot': {
        if (args.tab_id == null) return errorResult('tab_id is required for screenshot');
        ctx.emitStatus?.('Taking screenshot...');
        const buf = await svc.screenshot(args.tab_id, { fullPage: args.full_page });
        const result: CallToolResult = {
          content: [
            {
              type: 'image',
              data: buf.toString('base64'),
              mimeType: 'image/png',
            },
          ],
        };
        return result;
      }

      case 'wait': {
        if (args.tab_id == null) return errorResult('tab_id is required for wait');
        await svc.wait(args.tab_id, { ms: args.ms, selector: args.selector });
        return textResult(args.selector ? `Element "${args.selector}" appeared` : `Waited ${args.ms ?? 1000}ms`);
      }

      default:
        return errorResult(
          `Unknown action "${args.action}". Valid actions: tabs_context, tabs_create, close_tab, ` +
            'navigate, get_page_text, read_page, find, click, type, press, scroll, form_input, ' +
            'javascript, screenshot, wait',
        );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('Browser action failed', { action: args.action, error: message });
    return errorResult(`Browser ${args.action} failed: ${message}`);
  }
}
