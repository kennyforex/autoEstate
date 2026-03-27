import axios from 'axios';
import { BaseTool } from './base.js';
import type { AgentContext, ToolResult } from '../types.js';

const BRAVE_API_KEY = process.env.BRAVE_SEARCH_API_KEY || '';
const BRAVE_SEARCH_URL = 'https://api.search.brave.com/res/v1/web/search';

interface BraveWebResult {
  title: string;
  url: string;
  description: string;
}

interface BraveSearchResponse {
  web?: { results: BraveWebResult[] };
  query?: { original: string };
}

export class WebSearchTool extends BaseTool {
  readonly name = 'web_search';
  readonly description =
    'Search the web for real-time information. Use this when the knowledge base lacks an answer, ' +
    'when the user asks about current events, live availability, public holiday schedules, ' +
    'or anything that requires up-to-date external data.';
  readonly parameters = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results to return (default: 5, max: 10)',
      },
    },
    required: ['query'],
  };

  async execute(
    args: Record<string, unknown>,
    _context: AgentContext,
    signal?: AbortSignal,
  ): Promise<ToolResult> {
    const query = args.query as string;
    const maxResults = Math.min(Number(args.maxResults) || 5, 10);

    if (!query) {
      return { success: false, data: null, summary: 'Error: query parameter is required' };
    }

    if (!BRAVE_API_KEY) {
      return {
        success: false,
        data: null,
        summary:
          'Web search is not configured. Set the BRAVE_SEARCH_API_KEY environment variable. ' +
          'Get a free key (2,000 queries/month, no credit card) at https://brave.com/search/api/',
      };
    }

    try {
      const response = await axios.get<BraveSearchResponse>(BRAVE_SEARCH_URL, {
        params: {
          q: query,
          count: maxResults,
        },
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': BRAVE_API_KEY,
        },
        timeout: 15_000,
        signal,
      });

      const results = response.data.web?.results || [];

      if (results.length === 0) {
        return {
          success: true,
          data: { query, results: [] },
          summary: `No web results found for: "${query}"`,
        };
      }

      const cleanHtml = (s: string) => s.replace(/<\/?[^>]+(>|$)/g, '').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');

      const formatted = results.map((r, i) => (
        `[${i + 1}] ${cleanHtml(r.title)}\n    Source: ${r.url}\n    ${cleanHtml(r.description).substring(0, 400)}`
      ));

      const summary =
        `Found ${results.length} web results for "${query}". ` +
        `Use these results to answer the user's question:\n\n${formatted.join('\n\n')}`;

      return {
        success: true,
        data: {
          query,
          results: results.map(r => ({
            title: r.title,
            url: r.url,
            snippet: r.description,
          })),
        },
        summary,
      };
    } catch (error: any) {
      const status = error.response?.status;
      const detail = error.response?.data?.message || error.message;
      console.error(`[WebSearch] Brave search failed (status=${status}): ${detail}`);
      return {
        success: false,
        data: null,
        summary: `Web search failed: ${detail}`,
      };
    }
  }
}
