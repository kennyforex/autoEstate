import { BaseTool } from './base.js';
import { WEB_BROWSER_NAV_TIMEOUT_MS } from '../../config/agentToolsSandbox.js';
import { resolveUploadsRelativePath } from '../../utils/uploadsPath.js';
import { isUrlAllowedByAllowlist, parseWebFetchAllowlist } from '../../utils/webFetchAllowlist.js';
import type { AgentContext, ToolResult } from '../types.js';

const ENABLED = process.env.ENABLE_WEB_FETCH_BROWSER === 'true';

export class WebBrowserTool extends BaseTool {
  readonly name = 'web_browser';
  readonly description =
    'Headless Chromium: open an allowlisted URL with JavaScript rendering, return visible text or a CSS-selected fragment. ' +
    'Requires ENABLE_WEB_FETCH_BROWSER=true and WEB_FETCH_ALLOWLIST_ORIGINS. ' +
    'Optional Playwright storage state (exported cookies) can be loaded from an uploads-relative path for authenticated sessions — ' +
    'do not put secrets in chat; prefer server-side session files.';
  readonly parameters = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['goto_text', 'goto_selector'],
        description: 'goto_text: body innerText | goto_selector: first match text per selector',
      },
      url: { type: 'string', description: 'Page URL (must match allowlist)' },
      selector: {
        type: 'string',
        description: 'For goto_selector: single CSS selector',
      },
      storage_state_uploads_path: {
        type: 'string',
        description:
          'Optional: path relative to uploads/ to a Playwright storageState JSON (from manual export).',
      },
    },
    required: ['action', 'url'],
  };

  async execute(args: Record<string, unknown>, _context: AgentContext, signal?: AbortSignal): Promise<ToolResult> {
    if (!ENABLED) {
      return {
        success: false,
        data: null,
        summary:
          'web_browser is disabled. Set ENABLE_WEB_FETCH_BROWSER=true on the server and run: npx playwright install chromium',
      };
    }

    const url = (args.url as string)?.trim();
    const action = args.action as string;
    if (!url) {
      return { success: false, data: null, summary: 'url is required' };
    }

    const allow = parseWebFetchAllowlist();
    if (!isUrlAllowedByAllowlist(url, allow)) {
      return {
        success: false,
        data: null,
        summary:
          'URL is not allowlisted. Configure WEB_FETCH_ALLOWLIST_ORIGINS (same as web_fetch_static).',
      };
    }

    let storageStatePath: string | undefined;
    const rel = (args.storage_state_uploads_path as string | undefined)?.trim();
    if (rel) {
      const resolved = resolveUploadsRelativePath(rel);
      if (!resolved.ok) {
        return { success: false, data: null, summary: resolved.error };
      }
      storageStatePath = resolved.abs;
    }

    try {
      const { chromium } = await import('playwright');
      const browser = await chromium.launch({ headless: true });
      try {
        const context = await browser.newContext(
          storageStatePath ? { storageState: storageStatePath } : {},
        );
        const page = await context.newPage();
        await page.goto(url, {
          waitUntil: 'networkidle',
          timeout: WEB_BROWSER_NAV_TIMEOUT_MS,
        });
        if (signal?.aborted) {
          throw new Error('Aborted');
        }

        if (action === 'goto_text') {
          const text = await page.locator('body').innerText();
          const max = 120_000;
          const t = text.length > max ? `${text.slice(0, max)}\n[truncated]` : text;
          await context.close();
          return {
            success: true,
            data: { url, charCount: text.length, text: t },
            summary: `Rendered page text (${text.length} chars):\n${t}`,
          };
        }

        if (action === 'goto_selector') {
          const sel = (args.selector as string)?.trim();
          if (!sel) {
            await context.close();
            return { success: false, data: null, summary: 'goto_selector requires selector' };
          }
          const text = await page.locator(sel).first().innerText().catch(() => '');
          await context.close();
          return {
            success: true,
            data: { url, selector: sel, text },
            summary: `Selector "${sel}":\n${text}`,
          };
        }

        await context.close();
        return { success: false, data: null, summary: `Unknown action: ${action}` };
      } finally {
        await browser.close();
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[web_browser]', msg);
      return { success: false, data: null, summary: `web_browser failed: ${msg}` };
    }
  }
}
