import type { AgentContext, RouterDecision } from './types.js';

/**
 * Deterministic intent router. Examines goal stack and conversation state
 * to decide whether to force a skill, suggest one, or let the LLM decide.
 *
 * Replaces the prompt-based "Step 1/2/3" routing and synthetic tool-call
 * injection that was previously spread across engine.ts and prompt.ts.
 */
export function routeIntent(context: AgentContext): RouterDecision {
  if (context.skills.length === 0) {
    return { action: 'llm_decide' };
  }

  const goalStack = context.goalStack;

  // 1. Check if a skill just completed and there are suspended goals to resume
  if (goalStack && goalStack.goals.length > 0) {
    const lastAssistantMsg = context.messageHistory
      .filter(m => m.role === 'assistant')
      .slice(-1)[0];

    if (lastAssistantMsg?.content?.includes(':complete')) {
      const completedMatch = lastAssistantMsg.content.match(
        /<!-- skill:(\S+?):complete\s+(\{.*?\}) -->/,
      );
      const completedSlug = completedMatch?.[1];
      let completedObs: Record<string, string> = {};
      if (completedMatch?.[2]) {
        try { completedObs = JSON.parse(completedMatch[2]); } catch { /* ignore */ }
      }

      const suspended = goalStack.goals.filter(g => g.status === 'suspended');
      if (suspended.length > 0) {
        const toResume = suspended[0];

        if (completedSlug && toResume.skillSlug === completedSlug) {
          toResume.status = 'completed';
          toResume.observations = { ...toResume.observations, ...completedObs };
          toResume.completedAt = Date.now();

          const nextSuspended = goalStack.goals.filter(g => g.status === 'suspended');
          if (nextSuspended.length > 0) {
            return {
              action: 'force_skill',
              slug: nextSuspended[0].skillSlug,
              reason: `resuming next suspended goal after "${completedSlug}" auto-completed`,
            };
          }
          return { action: 'llm_decide' };
        }

        return {
          action: 'force_skill',
          slug: toResume.skillSlug,
          reason: 'resuming suspended goal after skill completion',
        };
      }
    }
  }

  // 2. Check for an active (non-completed) skill conversation — advisory only
  const recent = context.messageHistory.slice(-4);
  for (let i = recent.length - 1; i >= 0; i--) {
    const msg = recent[i];
    if (msg.role === 'assistant' && msg.content) {
      if (msg.content.match(/<!-- skill:(\S+?):complete/)) break;
      const skillMatch = msg.content.match(/<!-- skill:(\S+) -->/);
      if (skillMatch) {
        return { action: 'suggest_skill', slug: skillMatch[1] };
      }
      break;
    }
  }

  return { action: 'llm_decide' };
}
