import { BaseTool } from './base.js';
import { googleWorkspaceService } from '../../services/googleWorkspace.service.js';
import type { AgentContext, ToolResult } from '../types.js';

export class GoogleCalendarTool extends BaseTool {
  readonly name = 'google_calendar';
  readonly description =
    'Manage Google Calendar: view agenda, create events, list upcoming events, delete events. ' +
    'Requires the admin to have connected their Google account in Settings.';
  readonly parameters = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['agenda', 'create_event', 'list_events', 'delete_event'],
        description: 'The calendar action to perform',
      },
      summary: {
        type: 'string',
        description: 'Event title (for create_event)',
      },
      startTime: {
        type: 'string',
        description: 'Start time in ISO 8601 (for create_event)',
      },
      endTime: {
        type: 'string',
        description: 'End time in ISO 8601 (for create_event)',
      },
      description: {
        type: 'string',
        description: 'Event description (for create_event)',
      },
      location: {
        type: 'string',
        description: 'Event location (for create_event)',
      },
      attendees: {
        type: 'string',
        description: 'Comma-separated attendee emails (for create_event)',
      },
      timezone: {
        type: 'string',
        description: 'IANA timezone for agenda (e.g. Asia/Hong_Kong)',
      },
      eventId: {
        type: 'string',
        description: 'Event ID (for delete_event)',
      },
      timeMin: {
        type: 'string',
        description: 'Start of range in ISO 8601 (for list_events)',
      },
      timeMax: {
        type: 'string',
        description: 'End of range in ISO 8601 (for list_events)',
      },
      maxResults: {
        type: 'number',
        description: 'Max events to return (default 10)',
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
        case 'agenda': {
          const events = await googleWorkspaceService.getAgenda(userId, {
            timezone: args.timezone as string | undefined,
          });
          if (events.length === 0) {
            return { success: true, data: [], summary: 'No events for the rest of today.' };
          }
          const summary = events.map((e, i) =>
            `${i + 1}. ${e.summary || '(No title)'} | ${e.start} - ${e.end}${e.location ? ` | ${e.location}` : ''}`,
          ).join('\n');
          return { success: true, data: events, summary: `Today's agenda (${events.length} event(s)):\n${summary}` };
        }

        case 'create_event': {
          const summary = args.summary as string;
          const startTime = args.startTime as string;
          const endTime = args.endTime as string;
          if (!summary || !startTime || !endTime) {
            return { success: false, data: null, summary: 'Missing required parameters: summary, startTime, endTime' };
          }
          const attendees = args.attendees ? (args.attendees as string).split(',').map((e) => e.trim()) : undefined;
          const result = await googleWorkspaceService.createEvent(userId, {
            summary,
            startTime,
            endTime,
            description: args.description as string | undefined,
            location: args.location as string | undefined,
            attendees,
          });
          return {
            success: true,
            data: result,
            summary: `Event "${result.summary}" created: ${result.start} - ${result.end}. Link: ${result.htmlLink}`,
          };
        }

        case 'list_events': {
          const events = await googleWorkspaceService.listEvents(userId, {
            timeMin: args.timeMin as string | undefined,
            timeMax: args.timeMax as string | undefined,
            maxResults: args.maxResults as number | undefined,
          });
          if (events.length === 0) {
            return { success: true, data: [], summary: 'No upcoming events found.' };
          }
          const summary = events.map((e, i) =>
            `${i + 1}. ${e.summary || '(No title)'} | ${e.start} - ${e.end}${e.location ? ` | ${e.location}` : ''}`,
          ).join('\n');
          return { success: true, data: events, summary: `${events.length} upcoming event(s):\n${summary}` };
        }

        case 'delete_event': {
          const eventId = args.eventId as string;
          if (!eventId) {
            return { success: false, data: null, summary: 'Missing required parameter: eventId' };
          }
          await googleWorkspaceService.deleteEvent(userId, eventId);
          return { success: true, data: { deleted: true }, summary: `Event ${eventId} deleted.` };
        }

        default:
          return { success: false, data: null, summary: `Unknown action "${action}". Use: agenda, create_event, list_events, delete_event.` };
      }
    } catch (error: any) {
      if (error.message === 'GOOGLE_NOT_CONNECTED') {
        return { success: false, data: null, summary: 'Google account is not connected. The admin needs to connect Google in Settings > Connected Apps.' };
      }
      console.error(`[GoogleCalendar] Error:`, error.message);
      return { success: false, data: null, summary: `Calendar error: ${error.message}` };
    }
  }
}
