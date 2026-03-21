import { BaseTool } from './base.js';
import { assistantService } from '../../services/assistant.service.js';
import type { AgentContext, ToolResult } from '../types.js';

export class KnowledgeBaseTool extends BaseTool {
  readonly name = 'knowledge_base';
  readonly description =
    'Search the knowledge base (uploaded documents, PDFs, videos) for information relevant to the user\'s question. ' +
    'Use this when the user asks about products, services, policies, pricing, or any domain-specific knowledge.';
  readonly parameters = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query to find relevant information in the knowledge base',
      },
    },
    required: ['query'],
  };

  async execute(args: Record<string, unknown>, context: AgentContext, _signal?: AbortSignal): Promise<ToolResult> {
    const query = args.query as string;

    if (!query) {
      return { success: false, data: null, summary: 'Error: query parameter is required' };
    }

    try {
      const response = await assistantService.chat(
        context.assistantId,
        [{ role: 'user', content: query }],
      );

      const content = response.message.content || '';
      const citations = response.citations || [];
      const citationSummary = citations.length > 0
        ? ` [${citations.length} source(s) cited]`
        : '';

      return {
        success: true,
        data: { content, citations, model: response.model },
        summary: content + citationSummary,
      };
    } catch (error: any) {
      return {
        success: false,
        data: null,
        summary: `Knowledge base search failed: ${error.message}`,
      };
    }
  }
}
