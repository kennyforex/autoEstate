import { BaseTool } from './base.js';
import type { AgentContext, ToolResult } from '../types.js';

/**
 * Placeholder tool for Google Calendar integration.
 * The tool interface is defined so the agent can reason about booking,
 * but the actual Google API integration is deferred to a future release.
 */
export class CalendarTool extends BaseTool {
  readonly name = 'calendar_booking';
  readonly description =
    'Book an appointment or check availability on the calendar. ' +
    'NOTE: This tool is not yet connected to a live calendar system. ' +
    'Inform the user that booking will be handled by a team member.';
  readonly parameters = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['check_availability', 'book', 'cancel'],
        description: 'The calendar action to perform',
      },
      date: {
        type: 'string',
        description: 'The requested date (ISO 8601 format, e.g. 2026-03-20)',
      },
      time: {
        type: 'string',
        description: 'The requested time (e.g. 14:00)',
      },
      duration: {
        type: 'number',
        description: 'Duration in minutes (default: 60)',
      },
      notes: {
        type: 'string',
        description: 'Additional notes for the booking',
      },
    },
    required: ['action'],
  };

  async execute(args: Record<string, unknown>, _context: AgentContext, _signal?: AbortSignal): Promise<ToolResult> {
    const action = args.action as string;

    return {
      success: false,
      data: { action, ...args, reason: 'not_implemented' },
      summary:
        `Calendar "${action}" is not yet available. ` +
        'The booking request has been noted. A team member will follow up to confirm the appointment.',
    };
  }
}
