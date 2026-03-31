import { Assistant, Channel, Contact, Conversation, Message } from '../models/index.js';
import { conversationStateService } from '../services/conversationState.service.js';
import type {
  AgentContext,
  AgentContactInfo,
  AgentAssistantInfo,
  AgentSkillInfo,
  AgentTeamMemberInfo,
  AgentSessionData,
  ChatMessage,
} from './types.js';

const RESP_SNIP_LEN = 400;

function buildTeamRoster(
  assistant: Record<string, unknown>,
  idToSlug: Map<string, string>,
): AgentTeamMemberInfo[] {
  const staff = (assistant.staff as Array<Record<string, unknown>>) || [];
  return staff.map((st) => ({
    staffId: (st._id as { toString(): string }).toString(),
    displayName: String(st.displayName ?? ''),
    roleTitle: String(st.roleTitle ?? ''),
    responsibilitiesSnippet: String(st.responsibilities ?? '').slice(0, RESP_SNIP_LEN),
    skillSlugs: (st.skillIds as Array<{ toString(): string }> | undefined)
      ?.map((id) => idToSlug.get(id.toString()))
      .filter((s): s is string => Boolean(s)) ?? [],
    isManager: Boolean(st.isManager),
  }));
}

/**
 * Load skills for the agent plus team roster and per-skill ownership from staff assignments.
 */
async function loadAssistantSkillsAndRoster(assistantId: string): Promise<{
  skills: AgentSkillInfo[];
  teamRoster: AgentTeamMemberInfo[];
}> {
  try {
    const { Skill } = await import('../models/Skill.js');
    const assistant = await Assistant.findById(assistantId).lean();

    if (!assistant) {
      return { skills: [], teamRoster: [] };
    }

    const a = assistant as Record<string, unknown>;
    const skillIds = (a.skills as unknown[]) || [];

    console.log(
      `[AgentContext] Assistant ${assistantId} has ${skillIds.length} skill(s) bound: ${JSON.stringify(skillIds)}`,
    );

    const skillsLean =
      skillIds.length === 0
        ? []
        : await Skill.find({
            _id: { $in: skillIds },
            status: 'active',
          }).lean();

    const idToSlug = new Map<string, string>();
    for (const s of skillsLean) {
      const doc = s as { _id: { toString(): string }; slug: string };
      idToSlug.set(doc._id.toString(), doc.slug);
    }

    const skillIdToOwner = new Map<
      string,
      { staffId: string; displayName: string; roleTitle: string; responsibilities: string }
    >();
    for (const st of (a.staff as Array<Record<string, unknown>>) || []) {
      const staffId = (st._id as { toString(): string }).toString();
      for (const sid of (st.skillIds as Array<{ toString(): string }>) || []) {
        skillIdToOwner.set(sid.toString(), {
          staffId,
          displayName: String(st.displayName ?? ''),
          roleTitle: String(st.roleTitle ?? ''),
          responsibilities: String(st.responsibilities ?? '').slice(0, RESP_SNIP_LEN),
        });
      }
    }

    const teamRoster = buildTeamRoster(a, idToSlug);

    const skills: AgentSkillInfo[] = skillsLean.map((s) => {
      const doc = s as {
        _id: { toString(): string };
        name: string;
        slug: string;
        description: string;
        triggerHints?: string[];
        hasReferences?: boolean;
        hasExamples?: boolean;
        scripts?: string[];
        storagePath?: string;
        steps?: unknown;
        instructions?: string;
        requiredTools?: string[];
        reminderDelay?: number;
        maxReminders?: number;
      };
      const owner = skillIdToOwner.get(doc._id.toString());
      return {
        name: doc.name,
        slug: doc.slug,
        description: doc.description,
        triggerHints: doc.triggerHints || [],
        hasReferences: doc.hasReferences || false,
        hasExamples: doc.hasExamples || false,
        availableScripts: doc.scripts || [],
        storagePath: doc.storagePath || '',
        steps: doc.steps as AgentSkillInfo['steps'],
        instructions: doc.instructions,
        requiredTools: doc.requiredTools || [],
        reminderDelay: doc.reminderDelay || 0,
        maxReminders: doc.maxReminders || 0,
        ownerDisplayName: owner?.displayName,
        ownerRoleTitle: owner?.roleTitle,
        ownerResponsibilitiesSnippet: owner?.responsibilities,
        ownerStaffId: owner?.staffId,
      };
    });

    console.log(
      `[AgentContext] Loaded ${skills.length} active skill(s): ${skills.map((x) => x.slug).join(', ')}`,
    );

    return { skills, teamRoster };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[AgentContext] Failed to load skills:', msg);
    return { skills: [], teamRoster: [] };
  }
}

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
  const [assistant, contact, messages, loaded, goalStack] = await Promise.all([
    Assistant.findById(assistantId).populate('skills').lean(),
    Contact.findById(contactId).lean(),
    Message.find({ conversationId })
      .sort({ createdAt: -1 })
      .limit(15)
      .lean(),
    loadAssistantSkillsAndRoster(assistantId),
    conversationStateService.load(conversationId),
  ]);

  if (!assistant) throw new Error(`Assistant ${assistantId} not found`);
  if (!contact) throw new Error(`Contact ${contactId} not found`);

  const { skills: skillDocs, teamRoster } = loaded;

  const contactInfo: AgentContactInfo = {
    id: (contact as { _id: { toString(): string } })._id.toString(),
    name: (contact as { name?: string }).name,
    phoneNumber: (contact as { phoneNumber?: string }).phoneNumber,
    whatsappId: (contact as { whatsappId?: string }).whatsappId,
    email: (contact as { email?: string }).email,
    company: (contact as { company?: string }).company,
  };

  const a = assistant as Record<string, unknown>;
  const mgr = teamRoster.find((t) => t.isManager);
  const assistantInfo: AgentAssistantInfo = {
    id: (a._id as { toString(): string }).toString(),
    name: String(a.name ?? ''),
    departmentName: (a.departmentName as string | undefined) || String(a.name ?? ''),
    managerName: mgr?.displayName || (a.managerName as string | undefined),
    managerNickname: a.managerNickname as string | undefined,
    primaryLanguage: a.primaryLanguage as AgentAssistantInfo['primaryLanguage'],
    tone: a.tone as AgentAssistantInfo['tone'],
    instructions: a.instructions as string | undefined,
    model: String(a.aiModel ?? ''),
    pineconeAssistantName: String(a.pineconeAssistantName ?? ''),
    teamRoster,
  };

  const messageHistory: ChatMessage[] = messages
    .reverse()
    .filter(
      (msg: Record<string, unknown>) =>
        (msg.content && String(msg.content).trim().length > 0) ||
        msg.mediaDescription ||
        msg.mediaUrl,
    )
    .map((msg: Record<string, unknown>) => {
      let content = String(msg.content || '');
      if (msg.mediaUrl || msg.mediaDescription) {
        if (msg.contentType === 'image') {
          const hasCaption = msg.content && msg.content !== '[Image]';
          const caption = hasCaption ? ` User's message: "${msg.content}"` : '';
          const mediaInfo = msg.mediaUrl ? ` Image URL: ${msg.mediaUrl}` : '';
          const descriptionInfo = msg.mediaDescription
            ? ` Image description: ${msg.mediaDescription}`
            : '';
          content = `The user shared an image.${caption}${mediaInfo}${descriptionInfo}`;
        } else if (msg.contentType === 'audio') {
          const mediaInfo = msg.mediaUrl ? ` Audio URL: ${msg.mediaUrl}` : '';
          const transcriptionInfo = msg.mediaDescription
            ? ` Transcription: ${msg.mediaDescription}`
            : '';
          content = `The user sent an audio message.${mediaInfo}${transcriptionInfo}`;
        }
      }
      return {
        role: msg.sender === 'customer' ? ('user' as const) : ('assistant' as const),
        content,
      };
    });

  const userId = (a.createdBy as { toString(): string } | undefined)?.toString();

  return {
    conversationId,
    assistantId,
    channelId,
    userId,
    contact: contactInfo,
    assistant: assistantInfo,
    skills: skillDocs,
    messageHistory,
    session,
    goalStack: goalStack || undefined,
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
  const [assistant, loaded] = await Promise.all([
    Assistant.findById(assistantId).populate('skills').lean(),
    loadAssistantSkillsAndRoster(assistantId),
  ]);

  if (!assistant) throw new Error(`Assistant ${assistantId} not found`);

  const { skills: skillDocs, teamRoster } = loaded;

  const a = assistant as Record<string, unknown>;
  const mgr = teamRoster.find((t) => t.isManager);
  const assistantInfo: AgentAssistantInfo = {
    id: (a._id as { toString(): string }).toString(),
    name: String(a.name ?? ''),
    departmentName: (a.departmentName as string | undefined) || String(a.name ?? ''),
    managerName: mgr?.displayName || (a.managerName as string | undefined),
    managerNickname: a.managerNickname as string | undefined,
    primaryLanguage: a.primaryLanguage as AgentAssistantInfo['primaryLanguage'],
    tone: a.tone as AgentAssistantInfo['tone'],
    instructions: a.instructions as string | undefined,
    model: String(a.aiModel ?? ''),
    pineconeAssistantName: String(a.pineconeAssistantName ?? ''),
    teamRoster,
  };

  const playgroundContact: AgentContactInfo = {
    id: 'playground',
    name: 'Playground User',
  };

  const userId = (a.createdBy as { toString(): string } | undefined)?.toString();

  return {
    conversationId: 'playground',
    assistantId,
    channelId: 'playground',
    userId,
    contact: playgroundContact,
    assistant: assistantInfo,
    skills: skillDocs,
    messageHistory,
    session,
    markdownEnabled: true,
  };
}
