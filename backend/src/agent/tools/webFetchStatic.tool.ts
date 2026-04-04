import * as cheerio from 'cheerio';
import axios from 'axios';
import { BaseTool } from './base.js';
import { AGENT_FETCH_MAX_BYTES, WEB_FETCH_MAX_SELECTOR_KEYS } from '../../config/agentToolsSandbox.js';
import { isUrlAllowedByAllowlist, parseWebFetchAllowlist } from '../../utils/webFetchAllowlist.js';
import type { AgentContext, ToolResult } from '../types.js';

export class WebFetchStaticTool extends BaseTool {
  readonly name = 'web_fetch_static';
  readonly description =
    'Fetch a public HTML page over HTTP(S) and extract text or CSS-selected fragments. ' +
    'Only URLs allowed by the server WEB_FETCH_ALLOWLIST_ORIGINS setting are permitted (no login). ' +
    'For JavaScript-heavy sites use web_browser instead. Complements web_search (which uses a search API).';
  readonly parameters = {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'Full http(s) URL to fetch',
      },
      selectors: {
        type: 'object',
        description:
          'Optional map of label -> CSS selector; each matching element\'s text is returned under that label. Max ~20 keys.',
      },
      max_chars: {
        type: 'number',
        description: 'Max total characters of extracted text (default 80000)',
      },
    },
    required: ['url'],
  };

  async execute(args: Record<string, unknown>, _context: AgentContext, signal?: AbortSignal): Promise<ToolResult> {
    const url = (args.url as string)?.trim();
    if (!url) {
      return { success: false, data: null, summary: 'url is required' };
    }

    const allow = parseWebFetchAllowlist();
    if (!isUrlAllowedByAllowlist(url, allow)) {
      return {
        success: false,
        data: null,
        summary:
          'URL is not allowlisted. Set WEB_FETCH_ALLOWLIST_ORIGINS on the server (comma-separated origins or URL prefixes), then retry.',
      };
    }

    const maxChars = Math.min(Number(args.max_chars) || 80_000, 200_000);

    try {
      const response = await axios.get<string>(url, {
        responseType: 'text',
        maxContentLength: AGENT_FETCH_MAX_BYTES,
        maxBodyLength: AGENT_FETCH_MAX_BYTES,
        timeout: 60_000,
        signal,
        validateStatus: (s) => s >= 200 && s < 400,
        headers: {
          'User-Agent': 'AutoEstateAgent/1.0',
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        },
      });

      const html = response.data;
      if (html.length > AGENT_FETCH_MAX_BYTES) {
        return {
          success: false,
          data: null,
          summary: `HTML response too large (>${AGENT_FETCH_MAX_BYTES} chars).`,
        };
      }

      const selectors = (args.selectors as Record<string, string> | undefined) || undefined;
      const $ = cheerio.load(html);
      $('script, style').remove();

      if (!selectors || Object.keys(selectors).length === 0) {
        const text = $('body').text().replace(/\s+/g, ' ').trim();
        const t = text.length > maxChars ? `${text.slice(0, maxChars)}\n[truncated]` : text;
        return {
          success: true,
          data: { url, mode: 'full_text', charCount: text.length, text: t },
          summary: `Fetched ${url} (${text.length} chars text).\n${t}`,
        };
      }

      const keys = Object.keys(selectors);
      if (keys.length > WEB_FETCH_MAX_SELECTOR_KEYS) {
        return {
          success: false,
          data: null,
          summary: `Too many selector keys (max ${WEB_FETCH_MAX_SELECTOR_KEYS})`,
        };
      }

      const extracted: Record<string, string[]> = {};
      for (const label of keys) {
        const sel = selectors[label];
        const parts: string[] = [];
        $(sel).each((_, el) => {
          parts.push($(el).text().replace(/\s+/g, ' ').trim());
        });
        extracted[label] = parts;
      }

      let blob = JSON.stringify(extracted, null, 2);
      if (blob.length > maxChars) {
        blob = blob.slice(0, maxChars) + '\n[truncated]';
      }

      return {
        success: true,
        data: { url, mode: 'selectors', extracted },
        summary: `Selectors from ${url}:\n${blob}`,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, data: null, summary: `web_fetch_static failed: ${msg}` };
    }
  }
}
