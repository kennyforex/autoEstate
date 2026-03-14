import { Assistant, Channel, Contact, Conversation, Message } from '../models/index.js';
import type {
  AgentContext,
  AgentContactInfo,
  AgentAssistantInfo,
  AgentSkillInfo,
  AgentSessionData,
  ChatMessage,
} from './types.js';

/**
 * Build an AgentContext from database entities.
 * Called once before the agent engine runs.
 */
export async function buildAgentContext(
  conversationId: string,
  channelId: string,
  contactId: string,
  assistantId: string,
  session?: AgentSessionData,
): Promise<AgentContext> {
  const [assistant, contact, messages, skillDocs] = await Promise.all([
    Assistant.findById(assistantId).populate('skills').lean(),
    Contact.findById(contactId).lean(),
    Message.find({ conversationId })
      .sort({ createdAt: -1 })
      .limit(15)
      .lean(),
    loadAssistantSkills(assistantId),
  ]);

  if (!assistant) throw new Error(`Assistant ${assistantId} not found`);
  if (!contact) throw new Error(`Contact ${contactId} not found`);

  const contactInfo: AgentContactInfo = {
    id: (contact as any)._id.toString(),
    name: (contact as any).name,
    phoneNumber: (contact as any).phoneNumber,
    whatsappId: (contact as any).whatsappId,
    email: (contact as any).email,
    company: (contact as any).company,
  };

  const assistantInfo: AgentAssistantInfo = {
    id: (assistant as any)._id.toString(),
    name: (assistant as any).name,
    primaryLanguage: (assistant as any).primaryLanguage,
    tone: (assistant as any).tone,
    instructions: (assistant as any).instructions,
    model: (assistant as any).aiModel,
    pineconeAssistantName: (assistant as any).pineconeAssistantName,
  };

  const messageHistory: ChatMessage[] = messages
    .reverse()
    .filter((msg: any) => (msg.content && msg.content.trim().length > 0) || msg.mediaDescription || msg.mediaUrl)
    .map((msg: any) => {
      let content = msg.content || '';
      if (msg.mediaUrl || msg.mediaDescription) {
        if (msg.contentType === 'image') {
          const hasCaption = msg.content && msg.content !== '[Image]';
          const caption = hasCaption ? ` User's message: "${msg.content}"` : '';
          const mediaInfo = msg.mediaUrl ? ` Image URL: ${msg.mediaUrl}` : '';
          const descriptionInfo = msg.mediaDescription ? ` Image description: ${msg.mediaDescription}` : '';
          content = `The user shared an image.${caption}${mediaInfo}${descriptionInfo}`;
        } else if (msg.contentType === 'audio') {
          const mediaInfo = msg.mediaUrl ? ` Audio URL: ${msg.mediaUrl}` : '';
          const transcriptionInfo = msg.mediaDescription ? ` Transcription: ${msg.mediaDescription}` : '';
          content = `The user sent an audio message.${mediaInfo}${transcriptionInfo}`;
        }
      }
      return {
        role: msg.sender === 'customer' ? 'user' as const : 'assistant' as const,
        content,
      };
    });

  return {
    conversationId,
    assistantId,
    channelId,
    contact: contactInfo,
    assistant: assistantInfo,
    skills: skillDocs,
    messageHistory,
    session,
  };
}

/**
 * Build a lightweight AgentContext for the Playground (no real conversation/channel/contact).
 */
export async function buildPlaygroundContext(
  assistantId: string,
  messageHistory: ChatMessage[],
  session?: AgentSessionData,
): Promise<AgentContext> {
  const [assistant, skillDocs] = await Promise.all([
    Assistant.findById(assistantId).populate('skills').lean(),
    loadAssistantSkills(assistantId),
  ]);

  if (!assistant) throw new Error(`Assistant ${assistantId} not found`);

  const assistantInfo: AgentAssistantInfo = {
    id: (assistant as any)._id.toString(),
    name: (assistant as any).name,
    primaryLanguage: (assistant as any).primaryLanguage,
    tone: (assistant as any).tone,
    instructions: (assistant as any).instructions,
    model: (assistant as any).aiModel,
    pineconeAssistantName: (assistant as any).pineconeAssistantName,
  };

  const playgroundContact: AgentContactInfo = {
    id: 'playground',
    name: 'Playground User',
  };

  return {
    conversationId: 'playground',
    assistantId,
    channelId: 'playground',
    contact: playgroundContact,
    assistant: assistantInfo,
    skills: skillDocs,
    messageHistory,
    session,
    markdownEnabled: true,
  };
}

/**
 * Load skills bound to an assistant.
 * Only loads metadata for discovery. Content loaded on-demand during execution.
 * Gracefully returns [] if the Skill model doesn't exist yet or no skills are bound.
 */
async function loadAssistantSkills(assistantId: string): Promise<AgentSkillInfo[]> {
  try {
    const { Skill } = await import('../models/Skill.js');
    const assistant = await Assistant.findById(assistantId).lean();
    const skillIds = (assistant as any)?.skills || [];
    console.log(`[AgentContext] Assistant ${assistantId} has ${skillIds.length} skill(s) bound: ${JSON.stringify(skillIds)}`);

    if (!assistant || skillIds.length === 0) {
      return [];
    }

    const skills = await Skill.find({
      _id: { $in: skillIds },
      status: 'active',
    }).lean();

    console.log(`[AgentContext] Loaded ${skills.length} active skill(s): ${skills.map((s: any) => s.slug).join(', ')}`);

    return skills.map((s: any) => ({
      name: s.name,
      slug: s.slug,
      description: s.description,
      triggerHints: s.triggerHints || [],
      hasReferences: s.hasReferences || false,
      hasExamples: s.hasExamples || false,
      availableScripts: s.scripts || [],
      storagePath: s.storagePath || '',
      instructions: s.instructions,
      requiredTools: s.requiredTools || [],
    }));
  } catch (error: any) {
    console.error('[AgentContext] Failed to load skills:', error.message);
    return [];
  }
}
