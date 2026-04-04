import type { AgentContext } from '../../agent/types.js';

/** Minimal context for tool smoke tests (no DB, no Google user). */
export const stubAgentContext: AgentContext = {
  conversationId: 'script-test',
  assistantId: '507f1f77bcf86cd799439011',
  channelId: 'script-test',
  contact: { id: '507f1f77bcf86cd799439099' },
  assistant: {
    id: 'a1',
    name: 'Script',
    primaryLanguage: 'en',
    tone: 'professional',
    model: 'stub',
    pineconeAssistantName: 'stub',
  },
  skills: [],
  messageHistory: [],
};
