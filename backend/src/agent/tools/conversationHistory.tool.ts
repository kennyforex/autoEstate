import { BaseTool } from './base.js';
import { Message } from '../../models/index.js';
import type { AgentContext, ToolResult } from '../types.js';

export class ConversationHistoryTool extends BaseTool {
  readonly name = 'conversation_history';
  readonly description =
    'Retrieve recent messages from this conversation. ' +
    'Use this when you need additional context about what the user discussed previously.';
  readonly parameters = {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Number of recent messages to retrieve (default: 10, max: 30)',
      },
    },
    required: [],
  };

  async execute(args: Record<string, unknown>, context: AgentContext, _signal?: AbortSignal): Promise<ToolResult> {
    const limit = Math.min(Number(args.limit) || 10, 30);

    try {
      const messages = await Message.find({ conversationId: context.conversationId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      const formatted = messages.reverse().map((msg) => {
        const role = msg.sender === 'customer' ? 'User' : msg.sender === 'ai' ? 'AI' : 'Agent';
        let text = msg.content || '';
        if (msg.mediaDescription) {
          text = msg.contentType === 'image'
            ? `[Image] ${msg.mediaDescription}`
            : msg.contentType === 'audio'
              ? `[Audio transcription] ${msg.mediaDescription}`
              : text;
        }
        return `${role}: ${text}`;
      });

      return {
        success: true,
        data: { messageCount: messages.length, messages: formatted },
        summary: formatted.length > 0
          ? `Recent ${formatted.length} messages:\n${formatted.join('\n')}`
          : 'No previous messages found in this conversation.',
      };
    } catch (error: any) {
      return {
        success: false,
        data: null,
        summary: `Failed to retrieve conversation history: ${error.message}`,
      };
    }
  }
}
