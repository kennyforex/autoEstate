import axios from "axios";
import { openRouterConfig } from "../config/openrouter.js";
import type { AgentContext, AgentSkillInfo, RouterDecision } from "./types.js";

/**
 * Intent router with LLM-based classification for new requests.
 *
 * Priority order:
 * 1. Resume suspended goals after a skill completes
 * 2. Continue an active skill conversation
 * 3. LLM-based intent classification (fast model) for new requests
 */
export async function routeIntent(
  context: AgentContext,
  userMessage: string,
): Promise<RouterDecision> {
  if (context.skills.length === 0) {
    return { action: "llm_decide" };
  }

  const goalStack = context.goalStack;

  // 1. Resume suspended goals after a skill completion
  if (goalStack && goalStack.goals.length > 0) {
    const lastAssistantMsg = context.messageHistory
      .filter((m) => m.role === "assistant")
      .slice(-1)[0];

    if (lastAssistantMsg?.content?.includes(":complete")) {
      const completedMatch = lastAssistantMsg.content.match(
        /<!-- skill:(\S+?):complete\s+(\{.*?\}) -->/,
      );
      const completedSlug = completedMatch?.[1];
      let completedObs: Record<string, string> = {};
      if (completedMatch?.[2]) {
        try {
          completedObs = JSON.parse(completedMatch[2]);
        } catch {
          /* ignore */
        }
      }

      const suspended = goalStack.goals.filter((g) => g.status === "suspended");
      if (suspended.length > 0) {
        const toResume = suspended[0];

        if (completedSlug && toResume.skillSlug === completedSlug) {
          toResume.status = "completed";
          toResume.observations = { ...toResume.observations, ...completedObs };
          toResume.completedAt = Date.now();

          const nextSuspended = goalStack.goals.filter(
            (g) => g.status === "suspended",
          );
          if (nextSuspended.length > 0) {
            return {
              action: "force_skill",
              slug: nextSuspended[0].skillSlug,
              reason: `resuming next suspended goal after "${completedSlug}" auto-completed`,
            };
          }
          return { action: "llm_decide" };
        }

        return {
          action: "force_skill",
          slug: toResume.skillSlug,
          reason: "resuming suspended goal after skill completion",
        };
      }
    }
  }

  // 2. Continue an active (in-progress) skill conversation
  const recent = context.messageHistory.slice(-4);
  for (let i = recent.length - 1; i >= 0; i--) {
    const msg = recent[i];
    if (msg.role === "assistant" && msg.content) {
      if (msg.content.match(/<!-- skill:(\S+?):complete/)) break;
      const skillMatch = msg.content.match(/<!-- skill:(\S+) -->/);
      if (skillMatch) {
        return { action: "suggest_skill", slug: skillMatch[1] };
      }
      break;
    }
  }

  // 3. LLM-based intent classification for new requests
  const classified = await classifyIntent(userMessage, context.skills);
  if (classified) {
    return {
      action: "force_skill",
      slug: classified,
      reason: "LLM classifier matched skill",
    };
  }

  return { action: "llm_decide" };
}

/**
 * Use a fast LLM to classify the user's message against available skills.
 * Returns the matched skill slug, or null if no skill matches.
 */
async function classifyIntent(
  userMessage: string,
  skills: AgentSkillInfo[],
): Promise<string | null> {
  const skillList = skills
    .map((s) => {
      const own =
        s.ownerDisplayName != null && s.ownerDisplayName !== ""
          ? ` [assigned to ${s.ownerDisplayName}${s.ownerRoleTitle ? `, ${s.ownerRoleTitle}` : ""}${s.ownerResponsibilitiesSnippet ? ` — ${s.ownerResponsibilitiesSnippet.slice(0, 120)}` : ""}]`
          : "";
      return `- "${s.slug}": ${s.name} - ${s.description}${own}`;
    })
    .join("\n");
  console.log(skillList);

  const prompt =
    "You are an intent classifier. Given a user message and a list of available skills, " +
    "decide which skill (if any) should handle the request.\n\n" +
    "Rules:\n" +
    '- Return ONLY valid JSON: { "slug": "<skill-slug>" } or { "slug": "none" }\n' +
    '- Choose "none" ONLY if the message clearly does NOT relate to ANY skill\n' +
    "- If the message could match a skill even loosely, pick that skill\n" +
    "- Consider all languages (e.g. Chinese, English, mixed)\n\n" +
    `Skills:\n${skillList}\n\n` +
    `User message: "${userMessage}"`;

  try {
    const response = await axios.post(
      `${openRouterConfig.baseUrl}/chat/completions`,
      {
        model: process.env.OPENROUTER_ROUTER_MODEL || "deepseek/deepseek-chat",
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        max_tokens: 50,
      },
      {
        headers: {
          Authorization: `Bearer ${openRouterConfig.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://autoestate.ai",
          "X-Title": "AutoEstate Router",
        },
        timeout: 5000,
      },
    );

    const content = response.data.choices?.[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      console.log(
        `[Router] LLM classifier returned non-JSON: ${content.substring(0, 100)}`,
      );
      return null;
    }
    const parsed = JSON.parse(jsonMatch[0]);
    const slug = parsed?.slug;

    if (!slug || slug === "none") {
      console.log(`[Router] LLM classifier: no skill match`);
      return null;
    }

    const valid = skills.some((s) => s.slug === slug);
    if (!valid) {
      console.log(
        `[Router] LLM classifier returned unknown slug "${slug}" — ignoring`,
      );
      return null;
    }

    console.log(`[Router] LLM classifier matched skill: "${slug}"`);
    return slug;
  } catch (err: any) {
    console.warn(
      `[Router] LLM classification failed (falling back to llm_decide): ${err.message}`,
    );
    return null;
  }
}
