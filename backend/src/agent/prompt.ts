import type { AgentContext } from './types.js';

const ACTION_KEYWORDS: Record<string, string> = {
  book: 'BOOKING / SCHEDULING',
  booking: 'BOOKING / SCHEDULING',
  schedule: 'BOOKING / SCHEDULING',
  appointment: 'BOOKING / SCHEDULING',
  reserve: 'BOOKING / SCHEDULING',
  estimate: 'PRICING / ESTIMATION',
  pricing: 'PRICING / ESTIMATION',
  price: 'PRICING / ESTIMATION',
  cost: 'PRICING / ESTIMATION',
  quote: 'PRICING / ESTIMATION',
  greet: 'GREETING',
  greeting: 'GREETING',
  welcome: 'GREETING',
  search: 'SEARCH / LOOKUP',
  find: 'SEARCH / LOOKUP',
  lookup: 'SEARCH / LOOKUP',
  track: 'TRACKING / STATUS',
  status: 'TRACKING / STATUS',
  support: 'SUPPORT / HELP',
  help: 'SUPPORT / HELP',
  complaint: 'COMPLAINT / FEEDBACK',
  feedback: 'COMPLAINT / FEEDBACK',
};

function extractActionWords(description: string): string {
  const lower = description.toLowerCase();
  for (const [keyword, action] of Object.entries(ACTION_KEYWORDS)) {
    if (lower.includes(keyword)) return action;
  }
  const firstVerb = lower.match(/^(\w+s?)\b/);
  return firstVerb ? firstVerb[1] : '';
}

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
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'Asia/Hong_Kong',
  });
  const timeStr = now.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Hong_Kong',
    hour12: false,
  });
  parts.push(
    'You are a helpful customer support agent. ' +
    'You solve the user\'s request by reasoning step-by-step and using the tools available to you.',
  );
  parts.push(`Today is ${dateStr}, current time is ${timeStr} (Hong Kong Time).`);

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
    parts.push('## Skills');
    parts.push(
      'You have specialized skills installed. When a user\'s request matches a skill\'s purpose, ' +
      'you MUST delegate by calling `execute_skill` with that skill\'s slug and the user\'s message.',
    );
    parts.push('');
    parts.push(
      'Rules:\n' +
      '- NEVER answer directly when a skill should handle the request — ALWAYS use `execute_skill`.\n' +
      '- When a skill is actively conversing with the user (collecting info, asking questions), ' +
      'continue routing through `execute_skill` with the same slug.\n' +
      '- NEVER fabricate data (prices, availability, dates, etc.) that should come from a skill.\n' +
      '- Even if a skill previously completed, a NEW request that matches that skill\'s purpose ' +
      'MUST be handled by calling `execute_skill` again. Completed observations are only valid for ' +
      'the specific request they were collected for — NEVER extrapolate or reuse them to answer different questions.',
    );
    parts.push('');
    parts.push('Available skills:');
    for (const skill of skills) {
      const actionWords = extractActionWords(skill.description);
      const action = actionWords || 'General';
      parts.push(
        `- slug: \`${skill.slug}\` | Action: **${action.toUpperCase()}** | ${skill.description}`,
      );
    }

    if (context.goalStack && context.goalStack.goals.length > 0) {
      parts.push('');
      parts.push('### Current Goal Stack');
      for (const goal of context.goalStack.goals) {
        const icon = goal.status === 'active' ? '🔵' : goal.status === 'suspended' ? '⏸️' : '✅';
        let detail = '';
        // Show step progress for active/suspended goals
        if (goal.steps && goal.steps.length > 0 && goal.status !== 'completed') {
          const completed = goal.steps.filter((s) => s.status === 'completed').length;
          const activeStep = goal.steps.find((s) => s.status === 'active');
          detail = ` (step ${completed + 1}/${goal.steps.length}${activeStep ? `: ${activeStep.label}` : ''})`;
        }
        const obs = Object.keys(goal.observations).length > 0
          ? ` | collected: ${Object.entries(goal.observations).map(([k,v]) => `${k}=${v}`).join(', ')}`
          : '';
        parts.push(`${icon} \`${goal.skillSlug}\`: ${goal.status}${detail}${obs}`);
      }
    }
  }

  // ── Agent behaviour guidelines ──
  parts.push('');
  parts.push('## Agent Guidelines');
  parts.push(
    '- Use the knowledge_base tool to look up domain-specific information before answering factual questions.\n' +
    '- If the knowledge base has no answer and the question involves real-time data, current events, ' +
    'public holiday schedules, or external facts, use the web_search tool.\n' +
    '- IMPORTANT: When you receive results from web_search, you MUST summarize the key findings and present ' +
    'them to the user in a helpful way. NEVER ignore tool results or say you cannot answer after ' +
    'successfully retrieving search results. The search results ARE your source of truth — synthesize them.\n' +
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
