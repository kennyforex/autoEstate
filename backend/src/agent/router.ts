import { createChatCompletion } from "../config/aiChatProvider.js";
import type { AgentContext, AgentSkillInfo, RouterDecision } from "./types.js";

/** Min classifier confidence (0–1) to auto-force `execute_skill` without main model veto. */
function forceSkillMinConfidence(): number {
  const raw = process.env.AGENT_ROUTER_FORCE_SKILL_MIN_CONFIDENCE;
  if (raw === undefined || raw === "") return 0.85;
  const n = parseFloat(raw);
  if (Number.isNaN(n)) return 0.85;
  return Math.max(0, Math.min(1, n));
}

/**
 * Remove huge base64 data URLs from the message so the intent-classifier LLM
 * request stays small (OpenRouter may return 400 when the prompt embeds multi-hundred-KB data).
 */
/**
 * User explicitly wants the main agent to use web search / fetch tools or general news,
 * not a continuation of an installed skill (e.g. cake booking).
 * When true, we skip "suggest_skill" so execute_skill is not injected for the wrong skill.
 */
export function wantsGeneralWebOrNewsIntent(message: string): boolean {
  const s = message.trim();
  if (!s) return false;
  if (/\bweb_search\b/i.test(s)) return true;
  if (/\bweb_fetch_static\b|\bweb_browser\b/i.test(s)) return true;
  if (/\bweb search\b/i.test(s)) return true;
  if (/\bsearch the web\b|\bsearch online\b/i.test(s)) return true;
  // Chinese: news / headlines / HK news queries
  if (/今日新聞|頭條新聞|最新新聞|香港新聞|即時新聞|搜尋.*新聞|查.*新聞|新聞.*列表/i.test(s)) {
    return true;
  }
  if (/yahoo\.|google\.com\/search|搜尋引擎|網上.*新聞/i.test(s)) return true;
  if (/\btoday'?s news\b|\bnews today\b|\blatest news\b/i.test(s)) return true;
  return false;
}

export function sanitizeMessageForIntentRouting(message: string): string {
  let s = message.replace(
    /data:(?:image\/[a-zA-Z0-9.+-]+|application\/pdf);base64,[A-Za-z0-9+/=\s]{200,}/g,
    "[attachment: base64 omitted — user sent an image or PDF]",
  );
  if (s.length > 12000) {
    s = `${s.slice(0, 12000)}\n...[truncated for routing]`;
  }
  return s;
}

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

  // 1.5 General web / news / explicit tool names — never continue a product skill by mistake
  if (wantsGeneralWebOrNewsIntent(userMessage)) {
    console.log(
      `[Router] General web/news intent — llm_decide (skip suggest_skill / classifier force)`,
    );
    return { action: "llm_decide" };
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
  if (classified?.slug) {
    const minConf = forceSkillMinConfidence();
    if (classified.confidence >= minConf) {
      return {
        action: "force_skill",
        slug: classified.slug,
        reason: `LLM classifier matched skill (confidence ${classified.confidence.toFixed(2)} ≥ ${minConf})`,
      };
    }
    return {
      action: "llm_decide",
      hint: {
        slug: classified.slug,
        reason:
          "LLM classifier suggests this skill; confidence is below automatic routing threshold — main agent decides",
        confidence: classified.confidence,
      },
    };
  }

  return { action: "llm_decide" };
}

export interface ClassifyIntentResult {
  slug: string | null;
  confidence: number;
}

/**
 * Use a fast LLM to classify the user's message against available skills.
 * Returns slug and confidence, or null slug if no skill matches.
 */
async function classifyIntent(
  userMessage: string,
  skills: AgentSkillInfo[],
): Promise<ClassifyIntentResult | null> {
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
    '- Return ONLY valid JSON: { "slug": "<skill-slug>" | "none", "confidence": <number 0.0–1.0> }\n' +
    '- "confidence": how certain you are that this skill should handle the message (1.0 = clear match, 0.4 = weak guess).\n' +
    '- Choose "none" for: general news/headlines, web search, weather, sports scores, trivia, ' +
    "or anything that is NOT described by a skill below (even if the user wrote in Chinese/English).\n" +
    '- Choose a skill slug ONLY when the user wants that skill\'s product/service/workflow ' +
    "(e.g. ordering, booking, payments described in the skill).\n" +
    "- Consider all languages (e.g. Chinese, English, mixed)\n\n" +
    `Skills:\n${skillList}\n\n` +
    `User message: "${sanitizeMessageForIntentRouting(userMessage)}"`;

  try {
    const response = await createChatCompletion({
      useCase: "router",
      title: "Foodflow Router",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      maxTokens: 80,
      timeout: 5000,
    });

    const content = response.choices?.[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log(
        `[Router] LLM classifier returned non-JSON: ${content.substring(0, 100)}`,
      );
      return null;
    }
    const parsed = JSON.parse(jsonMatch[0]);
    const slug = parsed?.slug as string | undefined;

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

    let confidence = 0.9;
    if (typeof parsed.confidence === "number" && !Number.isNaN(parsed.confidence)) {
      confidence = Math.max(0, Math.min(1, parsed.confidence));
    }

    console.log(
      `[Router] LLM classifier matched skill: "${slug}" (confidence ${confidence})`,
    );
    return { slug, confidence };
  } catch (err: any) {
    console.warn(
      `[Router] LLM classification failed (falling back to llm_decide): ${err.message}`,
    );
    return null;
  }
}
