import { BaseTool } from './base.js';
import { Contact } from '../../models/index.js';
import type { AgentContext, ToolResult } from '../types.js';

export class ContactLookupTool extends BaseTool {
  readonly name = 'contact_lookup';
  readonly description =
    'Look up the current contact\'s details (name, phone number, email, company). ' +
    'Use this when you need to personalise a response or verify contact information.';
  readonly parameters = {
    type: 'object',
    properties: {
      fields: {
        type: 'array',
        items: { type: 'string', enum: ['name', 'phoneNumber', 'email', 'company', 'all'] },
        description: 'Which fields to retrieve. Use "all" to get everything.',
      },
    },
    required: ['fields'],
  };

  async execute(args: Record<string, unknown>, context: AgentContext): Promise<ToolResult> {
    const fields = args.fields as string[];
    const wantAll = fields.includes('all');

    try {
      const contact = await Contact.findById(context.contact.id).lean();

      if (!contact) {
        return {
          success: false,
          data: null,
          summary: 'Contact not found in the database.',
        };
      }

      const result: Record<string, unknown> = {};
      if (wantAll || fields.includes('name')) result.name = contact.name || 'Unknown';
      if (wantAll || fields.includes('phoneNumber')) result.phoneNumber = contact.phoneNumber || 'N/A';
      if (wantAll || fields.includes('email')) result.email = contact.email || 'N/A';
      if (wantAll || fields.includes('company')) result.company = contact.company || 'N/A';

      const parts = Object.entries(result).map(([k, v]) => `${k}: ${v}`);
      return {
        success: true,
        data: result,
        summary: `Contact info — ${parts.join(', ')}`,
      };
    } catch (error: any) {
      return {
        success: false,
        data: null,
        summary: `Failed to look up contact: ${error.message}`,
      };
    }
  }
}
