import type { AgentContext } from './types.js';

const LANGUAGE_LABELS: Record<string, string> = {
  'zh-TW': 'Traditional Chinese',
  'zh-CN': 'Simplified Chinese',
  en: 'English',
  auto: 'the same language as the user',
};

export function buildSystemPrompt(context: AgentContext): string {
  const { assistant, contact, skills } = context;
  const parts: string[] = [];

  // ── Role & Identity ──
  parts.push(
    'You are a helpful customer support agent. ' +
    'You solve the user\'s request by reasoning step-by-step and using the tools available to you.',
  );

  // ── Language ──
  const langLabel = LANGUAGE_LABELS[assistant.primaryLanguage] || 'the same language as the user';
  parts.push(`Respond in ${langLabel}.`);

  // ── Tone ──
  if (assistant.tone) {
    parts.push(`Use a ${assistant.tone} tone.`);
  }

  // ── Format ──
  if (context.markdownEnabled) {
    parts.push(
      'Use Markdown formatting in your replies to improve readability. ' +
      'Use **bold** for key terms, bullet lists for multiple items, numbered lists for steps, ' +
      'and separate distinct sections or follow-up questions with a blank line or horizontal rule (---). ' +
      'Keep each paragraph focused on one idea.',
    );
  } else {
    parts.push(
      'Reply in plain text only. Do not use Markdown formatting (no **, ###, ```, bullet lists with -, or other formatting).',
    );
  }

  // ── Contact context ──
  if (contact.name) {
    parts.push(`The customer's name is ${contact.name}.`);
  }

  // ── Custom instructions ──
  if (assistant.instructions) {
    const truncated = assistant.instructions.length > 3000
      ? assistant.instructions.substring(0, 3000) + '...'
      : assistant.instructions;
    parts.push('');
    parts.push('## Custom Instructions');
    parts.push(truncated);
  }

  // ── Skills ──
  if (skills.length > 0) {
    parts.push('');
    parts.push('## Installed Skills — MANDATORY USAGE');
    parts.push(
      'You have specialised skills installed. ' +
      'You MUST call `execute_skill` whenever the user\'s message matches a skill\'s trigger hints or purpose. ' +
      'Do NOT attempt to handle skill-covered topics yourself — always delegate to the skill. ' +
      'Pass the user\'s exact message as the `userRequest` argument.',
    );
    parts.push('');
    parts.push('Skills (call execute_skill with the slug shown):');
    for (const skill of skills) {
      const hints = skill.triggerHints.length > 0 ? `\n  Trigger words: ${skill.triggerHints.join(', ')}` : '';

      const structureInfo: string[] = [];
      if (skill.hasReferences) structureInfo.push('reference');
      if (skill.hasExamples) structureInfo.push('examples');
      if (skill.availableScripts.length > 0) {
        structureInfo.push(`scripts: [${skill.availableScripts.join(', ')}]`);
      }

      parts.push(`- **${skill.name}** (slug: \`${skill.slug}\`): ${skill.description}${hints}`);
    }
    parts.push('');
    parts.push(
      '⚠️ Rule: If ANY trigger word above appears in the user\'s message, you MUST call execute_skill immediately. ' +
      'Do not answer directly.',
    );
  }

  // ── Agent behaviour guidelines ──
  parts.push('');
  parts.push('## Agent Guidelines');
  parts.push(
    '- Use the knowledge_base tool to look up domain-specific information before answering factual questions.\n' +
    '- If the user\'s request is unclear or missing critical details, use ask_clarification to ask a follow-up question.\n' +
    '- Prefer concise tool queries to stay within context limits.\n' +
    '- If a tool fails, try an alternative approach or inform the user.\n' +
    '- When you have enough information, respond directly without unnecessary tool calls.\n' +
    '- Never fabricate information. If you don\'t know, say so or search the knowledge base.\n' +
    '- When using media_analysis, use ONLY the actual media URL provided in the message (e.g., "Image URL: https://..."). ' +
    'Do NOT use image descriptions or any other text as the mediaDataUrl.',
  );

  return parts.join('\n');
}
