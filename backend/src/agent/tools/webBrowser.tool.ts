import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import type { Readable } from 'stream';
import type { Page } from 'playwright';
import { BaseTool } from './base.js';
import {
  WEB_BROWSER_DOWNLOAD_MAX_BYTES,
  WEB_BROWSER_MAX_ACTION_MS,
  WEB_BROWSER_MAX_FILENAME_LENGTH,
  WEB_BROWSER_MAX_SELECTOR_LENGTH,
  WEB_BROWSER_NAV_TIMEOUT_MS,
  WEB_BROWSER_SCREENSHOT_MAX_BYTES,
} from '../../config/agentToolsSandbox.js';
import { getUploadsRoot, resolveUploadsRelativePath } from '../../utils/uploadsPath.js';
import { isUrlAllowedByAllowlist, parseWebFetchAllowlist } from '../../utils/webFetchAllowlist.js';
import type { AgentContext, PlaywrightRunSession, ToolResult } from '../types.js';

function isWebBrowserEnabled(): boolean {
  return process.env.ENABLE_WEB_FETCH_BROWSER === 'true';
}

function isWebBrowserInteractionEnabled(): boolean {
  return process.env.WEB_BROWSER_ALLOW_INTERACTION === 'true';
}

const INTERACTION_ACTIONS = new Set([
  'fill',
  'type',
  'click',
  'press',
  'download',
  'scroll',
  'select_option',
]);

function safeConversationSegment(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'unknown';
}

function publicUploadsUrl(relativeUnderUploads: string): string {
  const rel = relativeUnderUploads.startsWith('/') ? relativeUnderUploads : `/${relativeUnderUploads}`;
  const base =
    process.env.PUBLIC_API_URL?.replace(/\/$/, '') ||
    process.env.BACKEND_PUBLIC_URL?.replace(/\/$/, '') ||
    '';
  return base ? `${base}/uploads${rel}` : `/uploads${rel}`;
}

function assertSelector(sel: string | undefined, label: string): string | ToolResult {
  if (!sel?.trim()) {
    return { success: false, data: null, summary: `${label} is required` };
  }
  const t = sel.trim();
  if (t.length > WEB_BROWSER_MAX_SELECTOR_LENGTH) {
    return {
      success: false,
      data: null,
      summary: `Selector exceeds max length (${WEB_BROWSER_MAX_SELECTOR_LENGTH})`,
    };
  }
  return t;
}

async function getOrCreateSession(
  context: AgentContext,
  storageStatePath: string | undefined,
  signal: AbortSignal | undefined,
): Promise<{ session: PlaywrightRunSession; page: Page }> {
  context.ephemeral ??= {};
  const existing = context.ephemeral.playwright;
  if (existing) {
    if (signal?.aborted) throw new Error('Aborted');
    return { session: existing, page: existing.page };
  }
  if (signal?.aborted) throw new Error('Aborted');
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const pwContext = await browser.newContext(
    storageStatePath ? { storageState: storageStatePath } : {},
  );
  const page = await pwContext.newPage();
  const session: PlaywrightRunSession = {
    browser,
    context: pwContext,
    page,
    openedAt: Date.now(),
  };
  context.ephemeral.playwright = session;
  return { session, page };
}

async function writeCaptureFile(
  context: AgentContext,
  ext: string,
  buffer: Buffer,
): Promise<{ relative: string; urlHint: string }> {
  const dir = path.join(getUploadsRoot(), 'browser-captures', safeConversationSegment(context.conversationId));
  await fs.mkdir(dir, { recursive: true });
  const name = `${randomUUID()}${ext}`;
  const abs = path.join(dir, name);
  await fs.writeFile(abs, buffer);
  const relative = `browser-captures/${safeConversationSegment(context.conversationId)}/${name}`;
  return { relative, urlHint: publicUploadsUrl(`/${relative}`) };
}

export class WebBrowserTool extends BaseTool {
  readonly name = 'web_browser';
  readonly description =
    'Headless Chromium (Playwright): multi-step automation on allowlisted URLs. ' +
    'The same browser tab is reused for all calls in one assistant turn — navigate, then screenshot, click, etc. ' +
    'Requires ENABLE_WEB_FETCH_BROWSER=true and WEB_FETCH_ALLOWLIST_ORIGINS. ' +
    'Interactive actions (fill, click, type, press, download, scroll, select_option) require WEB_BROWSER_ALLOW_INTERACTION=true. ' +
    'Optional storage_state_uploads_path loads cookies once on first session create. Never put passwords in chat.';
  readonly parameters = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: [
          'navigate',
          'get_text',
          'get_selector_text',
          'goto_text',
          'goto_selector',
          'fill',
          'type',
          'click',
          'press',
          'screenshot',
          'download',
          'wait_for_selector',
          'scroll',
          'select_option',
        ],
        description:
          'navigate: goto URL | get_text: body text (optional url to navigate first) | get_selector_text: text from selector | ' +
          'goto_text/goto_selector: legacy one-shot (url + optional selector) | fill/type/click/press/download/scroll/select_option: interaction | ' +
          'screenshot: PNG to uploads | wait_for_selector | download: URL fetch or click-triggered',
      },
      url: { type: 'string', description: 'Target URL for navigate, goto_*, get_text (optional), download (direct GET)' },
      selector: { type: 'string', description: 'CSS selector for element actions' },
      text: { type: 'string', description: 'For fill/type' },
      key: { type: 'string', description: 'For press, e.g. Enter, Tab' },
      full_page: { type: 'boolean', description: 'screenshot: capture full scrollable page' },
      clear_first: { type: 'boolean', description: 'fill: clear field first' },
      timeout_ms: { type: 'number', description: 'Override timeout for wait/click/nav (bounded by sandbox)' },
      wait_until: {
        type: 'string',
        enum: ['load', 'domcontentloaded', 'networkidle', 'commit'],
        description: 'navigate: when navigation is considered done',
      },
      storage_state_uploads_path: {
        type: 'string',
        description: 'Optional: path relative to uploads/ to Playwright storageState JSON (first session only)',
      },
      delta_y: { type: 'number', description: 'scroll: pixel delta for mouse wheel' },
      scroll_selector: { type: 'string', description: 'scroll: scroll element into view' },
      download_selector: { type: 'string', description: 'download: click selector and save file from download event' },
      select_values: {
        type: 'array',
        items: { type: 'string' },
        description: 'select_option: option values to select',
      },
      filename_hint: {
        type: 'string',
        description: 'download: optional safe filename suffix (no path separators)',
      },
    },
    required: ['action'],
  };

  async execute(
    args: Record<string, unknown>,
    context: AgentContext,
    signal?: AbortSignal,
  ): Promise<ToolResult> {
    if (!isWebBrowserEnabled()) {
      return {
        success: false,
        data: null,
        summary:
          'web_browser is disabled. Set ENABLE_WEB_FETCH_BROWSER=true on the server and run: npx playwright install chromium',
      };
    }

    const action = String(args.action || '').trim();
    if (!action) {
      return { success: false, data: null, summary: 'action is required' };
    }

    const needsInteraction = INTERACTION_ACTIONS.has(action);
    if (needsInteraction && !isWebBrowserInteractionEnabled()) {
      return {
        success: false,
        data: null,
        summary:
          'This web_browser action requires WEB_BROWSER_ALLOW_INTERACTION=true on the server (fill, click, type, press, download, scroll, select_option).',
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

    const allow = parseWebFetchAllowlist();
    const timeoutNav = Math.min(
      (args.timeout_ms as number | undefined) ?? WEB_BROWSER_NAV_TIMEOUT_MS,
      WEB_BROWSER_MAX_ACTION_MS,
    );
    const timeoutAction = Math.min(
      (args.timeout_ms as number | undefined) ?? WEB_BROWSER_MAX_ACTION_MS,
      WEB_BROWSER_MAX_ACTION_MS,
    );

    const waitUntil = (args.wait_until as 'load' | 'domcontentloaded' | 'networkidle' | 'commit' | undefined) || 'networkidle';

    try {
      const { session, page } = await getOrCreateSession(context, storageStatePath, signal);

      const runNavigate = async (url: string) => {
        if (!isUrlAllowedByAllowlist(url, allow)) {
          throw new Error(
            'URL is not allowlisted. Configure WEB_FETCH_ALLOWLIST_ORIGINS (same as web_fetch_static).',
          );
        }
        await page.goto(url, { waitUntil, timeout: timeoutNav });
      };

      switch (action) {
        case 'navigate': {
          const url = (args.url as string)?.trim();
          if (!url) return { success: false, data: null, summary: 'navigate requires url' };
          await runNavigate(url);
          return {
            success: true,
            data: { url: page.url() },
            summary: `Navigated to ${page.url()}`,
          };
        }

        case 'get_text': {
          const url = (args.url as string | undefined)?.trim();
          if (url) await runNavigate(url);
          if (signal?.aborted) throw new Error('Aborted');
          const text = await page.locator('body').innerText({ timeout: timeoutAction });
          const max = 120_000;
          const t = text.length > max ? `${text.slice(0, max)}\n[truncated]` : text;
          return {
            success: true,
            data: { url: page.url(), charCount: text.length },
            summary: `Rendered page text (${text.length} chars):\n${t}`,
          };
        }

        case 'get_selector_text': {
          const url = (args.url as string | undefined)?.trim();
          if (url) await runNavigate(url);
          const sel = assertSelector(args.selector as string | undefined, 'selector');
          if (typeof sel !== 'string') return sel;
          if (signal?.aborted) throw new Error('Aborted');
          const text = await page.locator(sel).first().innerText({ timeout: timeoutAction });
          return {
            success: true,
            data: { url: page.url(), selector: sel, text },
            summary: `Selector "${sel}":\n${text}`,
          };
        }

        case 'goto_text': {
          const url = (args.url as string)?.trim();
          if (!url) return { success: false, data: null, summary: 'goto_text requires url' };
          await runNavigate(url);
          if (signal?.aborted) throw new Error('Aborted');
          const text = await page.locator('body').innerText({ timeout: timeoutAction });
          const max = 120_000;
          const t = text.length > max ? `${text.slice(0, max)}\n[truncated]` : text;
          return {
            success: true,
            data: { url: page.url(), charCount: text.length, text: t },
            summary: `Rendered page text (${text.length} chars):\n${t}`,
          };
        }

        case 'goto_selector': {
          const url = (args.url as string)?.trim();
          if (!url) return { success: false, data: null, summary: 'goto_selector requires url' };
          const sel = assertSelector(args.selector as string | undefined, 'selector');
          if (typeof sel !== 'string') return sel;
          await runNavigate(url);
          if (signal?.aborted) throw new Error('Aborted');
          const text = await page.locator(sel).first().innerText({ timeout: timeoutAction }).catch(() => '');
          return {
            success: true,
            data: { url: page.url(), selector: sel, text },
            summary: `Selector "${sel}":\n${text}`,
          };
        }

        case 'fill': {
          const sel = assertSelector(args.selector as string | undefined, 'selector');
          if (typeof sel !== 'string') return sel;
          const text = (args.text as string | undefined) ?? '';
          const clearFirst = Boolean(args.clear_first);
          const loc = page.locator(sel).first();
          if (clearFirst) await loc.clear({ timeout: timeoutAction });
          await loc.fill(text, { timeout: timeoutAction });
          return { success: true, data: { selector: sel }, summary: `Filled selector "${sel}"` };
        }

        case 'type': {
          const sel = assertSelector(args.selector as string | undefined, 'selector');
          if (typeof sel !== 'string') return sel;
          const text = (args.text as string | undefined) ?? '';
          await page.locator(sel).first().click({ timeout: timeoutAction });
          await page.keyboard.type(text, { delay: 20 });
          return { success: true, data: { selector: sel }, summary: `Typed into "${sel}"` };
        }

        case 'click': {
          const sel = assertSelector(args.selector as string | undefined, 'selector');
          if (typeof sel !== 'string') return sel;
          await page.locator(sel).first().click({ timeout: timeoutAction });
          return { success: true, data: { selector: sel }, summary: `Clicked "${sel}"` };
        }

        case 'press': {
          const key = (args.key as string | undefined)?.trim();
          if (!key) return { success: false, data: null, summary: 'press requires key' };
          await page.keyboard.press(key, { delay: 10 });
          return { success: true, data: { key }, summary: `Pressed ${key}` };
        }

        case 'screenshot': {
          const fullPage = Boolean(args.full_page);
          const buf = await page.screenshot({
            type: 'png',
            fullPage,
            timeout: timeoutAction,
          });
          if (buf.length > WEB_BROWSER_SCREENSHOT_MAX_BYTES) {
            return {
              success: false,
              data: null,
              summary: `Screenshot too large (${buf.length} bytes); max ${WEB_BROWSER_SCREENSHOT_MAX_BYTES}`,
            };
          }
          const { relative, urlHint } = await writeCaptureFile(context, '.png', buf);
          return {
            success: true,
            data: {
              path: `/uploads/${relative}`,
              uploadsRelative: relative,
              urlHint,
              bytes: buf.length,
              fullPage,
            },
            summary: `Screenshot saved (${buf.length} bytes). Open: ${urlHint}`,
          };
        }

        case 'wait_for_selector': {
          const sel = assertSelector(args.selector as string | undefined, 'selector');
          if (typeof sel !== 'string') return sel;
          await page.waitForSelector(sel, { timeout: timeoutAction, state: 'visible' });
          return { success: true, data: { selector: sel }, summary: `Element visible: ${sel}` };
        }

        case 'scroll': {
          const scrollSel = (args.scroll_selector as string | undefined)?.trim();
          const deltaY = args.delta_y as number | undefined;
          if (scrollSel) {
            if (scrollSel.length > WEB_BROWSER_MAX_SELECTOR_LENGTH) {
              return {
                success: false,
                data: null,
                summary: `scroll_selector exceeds max length (${WEB_BROWSER_MAX_SELECTOR_LENGTH})`,
              };
            }
            await page.locator(scrollSel).first().scrollIntoViewIfNeeded({ timeout: timeoutAction });
            return { success: true, data: { scroll_selector: scrollSel }, summary: `Scrolled into view: ${scrollSel}` };
          }
          if (typeof deltaY === 'number' && Number.isFinite(deltaY)) {
            await page.mouse.wheel(0, deltaY);
            return { success: true, data: { delta_y: deltaY }, summary: `Mouse wheel deltaY=${deltaY}` };
          }
          return {
            success: false,
            data: null,
            summary: 'scroll requires scroll_selector or delta_y',
          };
        }

        case 'select_option': {
          const sel = assertSelector(args.selector as string | undefined, 'selector');
          if (typeof sel !== 'string') return sel;
          const values = args.select_values as string[] | undefined;
          if (!values?.length) {
            return { success: false, data: null, summary: 'select_option requires select_values' };
          }
          await page.locator(sel).first().selectOption(values, { timeout: timeoutAction });
          return {
            success: true,
            data: { selector: sel, values },
            summary: `Selected options on "${sel}": ${values.join(', ')}`,
          };
        }

        case 'download': {
          const directUrl = (args.url as string | undefined)?.trim();
          const downloadSel = (args.download_selector as string | undefined)?.trim();

          if (directUrl && !downloadSel) {
            if (!isUrlAllowedByAllowlist(directUrl, allow)) {
              return {
                success: false,
                data: null,
                summary: 'download url is not allowlisted',
              };
            }
            const response = await session.context.request.get(directUrl, {
              timeout: timeoutAction,
              maxRedirects: 5,
            });
            if (!response.ok()) {
              return {
                success: false,
                data: null,
                summary: `download GET failed: HTTP ${response.status()}`,
              };
            }
            const buf = Buffer.from(await response.body());
            if (buf.length > WEB_BROWSER_DOWNLOAD_MAX_BYTES) {
              return {
                success: false,
                data: null,
                summary: `Download too large (${buf.length} bytes); max ${WEB_BROWSER_DOWNLOAD_MAX_BYTES}`,
              };
            }
            const hint = (args.filename_hint as string | undefined)?.trim().slice(0, WEB_BROWSER_MAX_FILENAME_LENGTH);
            const ext = hint?.includes('.') ? path.extname(hint) || '.bin' : '.bin';
            const safeExt = ext.replace(/[^a-zA-Z0-9._-]/g, '') || '.bin';
            const { relative, urlHint } = await writeCaptureFile(context, safeExt, buf);
            const mime = response.headers()['content-type'] || 'application/octet-stream';
            return {
              success: true,
              data: {
                path: `/uploads/${relative}`,
                uploadsRelative: relative,
                urlHint,
                bytes: buf.length,
                contentType: mime,
              },
              summary: `Downloaded ${buf.length} bytes (${mime}). Saved: ${urlHint}`,
            };
          }

          if (downloadSel) {
            if (downloadSel.length > WEB_BROWSER_MAX_SELECTOR_LENGTH) {
              return {
                success: false,
                data: null,
                summary: `download_selector exceeds max length (${WEB_BROWSER_MAX_SELECTOR_LENGTH})`,
              };
            }
            const hint = (args.filename_hint as string | undefined)?.trim().slice(0, WEB_BROWSER_MAX_FILENAME_LENGTH);
            const dlPromise = page.waitForEvent('download', { timeout: timeoutAction });
            await page.locator(downloadSel).first().click({ timeout: timeoutAction });
            const download = await dlPromise;
            const suggested = download.suggestedFilename();
            const ext = path.extname(suggested || '') || '.bin';
            const stream = await download.createReadStream();
            if (!stream) {
              return { success: false, data: null, summary: 'download stream unavailable' };
            }
            const chunks: Buffer[] = [];
            let total = 0;
            for await (const ch of stream) {
              total += ch.length;
              if (total > WEB_BROWSER_DOWNLOAD_MAX_BYTES) {
                (stream as Readable).destroy?.();
                return {
                  success: false,
                  data: null,
                  summary: `Download exceeds max size (${WEB_BROWSER_DOWNLOAD_MAX_BYTES} bytes)`,
                };
              }
              chunks.push(Buffer.isBuffer(ch) ? ch : Buffer.from(ch));
            }
            const buf = Buffer.concat(chunks);
            const safeName = hint && !hint.includes('/') && !hint.includes('..') ? hint : `${randomUUID()}${ext}`;
            const ext2 = path.extname(safeName) || ext;
            const { relative, urlHint } = await writeCaptureFile(context, ext2, buf);
            return {
              success: true,
              data: {
                path: `/uploads/${relative}`,
                uploadsRelative: relative,
                urlHint,
                bytes: buf.length,
                suggestedFilename: suggested,
              },
              summary: `Download saved (${buf.length} bytes): ${urlHint}`,
            };
          }

          return {
            success: false,
            data: null,
            summary: 'download requires url (direct GET) or download_selector (click)',
          };
        }

        default:
          return { success: false, data: null, summary: `Unknown action: ${action}` };
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[web_browser]', msg);
      return { success: false, data: null, summary: `web_browser failed: ${msg}` };
    }
  }
}
