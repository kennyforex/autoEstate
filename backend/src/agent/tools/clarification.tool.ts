import { BaseTool } from './base.js';
import type { AgentContext, ToolResult } from '../types.js';

/**
 * Special tool that signals the agent loop to pause and ask the user for clarification.
 * The engine intercepts this tool call before execute() is ever called,
 * so execute() here acts as a no-op safeguard.
 */
export class ClarificationTool extends BaseTool {
  readonly name = 'ask_clarification';
  readonly description =
    'Ask the user a follow-up question when the request is ambiguous or missing critical details. ' +
    'This pauses the reasoning loop and waits for the user\'s response before continuing.';
  readonly parameters = {
    type: 'object',
    properties: {
      question: {
        type: 'string',
        description: 'The clarifying question to ask the user',
      },
      options: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional suggested answer options for the user to choose from',
      },
    },
    required: ['question'],
  };

  async execute(args: Record<string, unknown>, _context: AgentContext): Promise<ToolResult> {
    const question = args.question as string;
    return {
      success: true,
      data: { question, options: args.options },
      summary: question,
    };
  }
}
