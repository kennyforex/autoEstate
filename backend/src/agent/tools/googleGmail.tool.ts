import { BaseTool } from './base.js';
import { googleWorkspaceService } from '../../services/googleWorkspace.service.js';
import type { AgentContext, ToolResult } from '../types.js';

export class GoogleGmailTool extends BaseTool {
  readonly name = 'google_gmail';
  readonly description =
    'Manage Gmail: send emails, search inbox, read messages, reply. ' +
    'Requires the admin to have connected their Google account in Settings.';
  readonly parameters = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['send', 'search', 'read', 'reply', 'triage'],
        description: 'The Gmail action to perform',
      },
      to: {
        type: 'string',
        description: 'Recipient email (for send)',
      },
      subject: {
        type: 'string',
        description: 'Email subject (for send)',
      },
      body: {
        type: 'string',
        description: 'Email body text (for send/reply)',
      },
      query: {
        type: 'string',
        description: 'Search query using Gmail syntax (for search)',
      },
      messageId: {
        type: 'string',
        description: 'Message ID (for read/reply)',
      },
      maxResults: {
        type: 'number',
        description: 'Max results for search/triage (default 10)',
      },
    },
    required: ['action'],
  };

  async execute(args: Record<string, unknown>, context: AgentContext, _signal?: AbortSignal): Promise<ToolResult> {
    const userId = context.userId;
    if (!userId) {
      return { success: false, data: null, summary: 'Google account is not connected. The admin needs to connect Google in Settings > Connected Apps.' };
    }

    const action = args.action as string;

    try {
      switch (action) {
        case 'send': {
          const to = args.to as string;
          const subject = args.subject as string;
          const body = args.body as string;
          if (!to || !subject || !body) {
            return { success: false, data: null, summary: 'Missing required parameters: to, subject, body' };
          }
          const result = await googleWorkspaceService.sendEmail(userId, { to, subject, body });
          return { success: true, data: result, summary: `Email sent to ${to} with subject "${subject}"` };
        }

        case 'triage':
        case 'search': {
          const query = action === 'triage' ? 'is:inbox is:unread' : (args.query as string || 'is:inbox');
          const maxResults = (args.maxResults as number) || 10;
          const messages = await googleWorkspaceService.getInbox(userId, { query, maxResults });
          if (messages.length === 0) {
            return { success: true, data: [], summary: 'No messages found.' };
          }
          const summary = messages.map((m, i) =>
            `${i + 1}. From: ${m.from} | Subject: ${m.subject} | Date: ${m.date} | ID: ${m.id}`,
          ).join('\n');
          return { success: true, data: messages, summary: `Found ${messages.length} message(s):\n${summary}` };
        }

        case 'read': {
          const messageId = args.messageId as string;
          if (!messageId) {
            return { success: false, data: null, summary: 'Missing required parameter: messageId' };
          }
          const msg = await googleWorkspaceService.getMessage(userId, messageId);
          return {
            success: true,
            data: msg,
            summary: `From: ${msg.from}\nTo: ${msg.to}\nSubject: ${msg.subject}\nDate: ${msg.date}\n\n${msg.body.substring(0, 1500)}`,
          };
        }

        case 'reply': {
          const messageId = args.messageId as string;
          const body = args.body as string;
          if (!messageId || !body) {
            return { success: false, data: null, summary: 'Missing required parameters: messageId, body' };
          }
          const result = await googleWorkspaceService.replyToEmail(userId, { messageId, body });
          return { success: true, data: result, summary: `Reply sent successfully (thread: ${result.threadId})` };
        }

        default:
          return { success: false, data: null, summary: `Unknown action "${action}". Use: send, search, read, reply, triage.` };
      }
    } catch (error: any) {
      if (error.message === 'GOOGLE_NOT_CONNECTED') {
        return { success: false, data: null, summary: 'Google account is not connected. The admin needs to connect Google in Settings > Connected Apps.' };
      }
      console.error(`[GoogleGmail] Error:`, error.message);
      return { success: false, data: null, summary: `Gmail error: ${error.message}` };
    }
  }
}
