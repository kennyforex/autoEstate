/**
 * Deep Agent Prototype — side-by-side comparison with existing AgentEngine.
 *
 * Converts car-wash-estimator + car-service-booking skills into deepagentsjs
 * SubAgents, wraps knowledge_base as a LangChain tool, and wires them into
 * a single createDeepAgent supervisor.
 *
 * Usage:
 *   npx tsx src/agent/deepagent-prototype.ts
 *
 * Set OPENROUTER_API_KEY in your .env before running.
 */

import { tool } from "langchain";
import { createDeepAgent } from "deepagents";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { z } from "zod";
import { execSync } from "child_process";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

/** Run from backend/ (see package.json scripts). */
const SKILLS_DIR = path.resolve(process.cwd(), "skills");

function openRouterModel(modelName: string) {
  return new ChatOpenAI({
    modelName,
    temperature: 0.3,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
    },
    apiKey: process.env.OPENROUTER_API_KEY,
  });
}

// ─────────────────────────────────────────────
// 1. Wrap existing tools as LangChain tools
// ─────────────────────────────────────────────

/**
 * estimate_car_wash_price — runs the existing Python script directly
 * so the prototype uses the exact same pricing logic.
 */
const estimateCarWashPrice = tool(
  async ({
    vehicleType,
    services,
  }: {
    vehicleType: string;
    services: string;
  }) => {
    const scriptPath = path.join(
      SKILLS_DIR,
      "car-wash-estimator",
      "estimate_price.py",
    );
    try {
      const output = execSync(
        `python3 "${scriptPath}" "${vehicleType}" "${services}"`,
        {
          timeout: 10_000,
          encoding: "utf-8",
        },
      );
      return output.trim();
    } catch (err: any) {
      return JSON.stringify({ error: err.message });
    }
  },
  {
    name: "estimate_car_wash_price",
    description:
      "Calculate car wash price. Returns a JSON breakdown with per-service prices, " +
      "multi-service discount, and total in HKD.",
    schema: z.object({
      vehicleType: z
        .enum(["motorcycle", "sedan", "suv", "truck", "van"])
        .describe("Customer vehicle type"),
      services: z
        .string()
        .describe(
          "Comma-separated service codes: basic, interior, full, engine",
        ),
    }),
  },
);

/**
 * knowledge_base — thin wrapper around Pinecone RAG via your existing
 * assistant service. In the prototype we keep it simple with a stub.
 * Replace the body with `assistantService.chat(...)` to test with real RAG.
 */
const knowledgeBase = tool(
  async ({ query }: { query: string }) => {
    // Stub: In production, call assistantService.chat(assistantId, [...])
    return (
      `[Knowledge Base] No results found for: "${query}". ` +
      "In production this calls Pinecone RAG via assistantService.chat()."
    );
  },
  {
    name: "knowledge_base",
    description:
      "Search uploaded documents, PDFs, and knowledge base for information " +
      "about products, services, policies, or pricing.",
    schema: z.object({
      query: z.string().describe("Search query"),
    }),
  },
);

// ─────────────────────────────────────────────
// 1b. Google Workspace tools (via gws CLI)
// ─────────────────────────────────────────────

const GWS_EXEC_OPTS = { timeout: 15_000, encoding: "utf-8" as const };

const gmailSend = tool(
  async ({ to, subject, body }: { to: string; subject: string; body: string }) => {
    try {
      return execSync(
        `gws gmail +send --to "${to}" --subject "${subject}" --body "${body}"`,
        GWS_EXEC_OPTS,
      ).trim();
    } catch (err: any) {
      return JSON.stringify({ error: err.message });
    }
  },
  {
    name: "gmail_send",
    description: "Send an email via Gmail. Returns JSON confirmation.",
    schema: z.object({
      to: z.string().describe("Recipient email address"),
      subject: z.string().describe("Email subject line"),
      body: z.string().describe("Email body text"),
    }),
  },
);

const gmailTriage = tool(
  async () => {
    try {
      return execSync("gws gmail +triage", GWS_EXEC_OPTS).trim();
    } catch (err: any) {
      return JSON.stringify({ error: err.message });
    }
  },
  {
    name: "gmail_triage",
    description: "Show unread inbox summary — sender, subject, date.",
    schema: z.object({}),
  },
);

const gmailSearch = tool(
  async ({ query, maxResults }: { query: string; maxResults?: number }) => {
    const max = maxResults ?? 5;
    try {
      return execSync(
        `gws gmail users messages list --params '{"q": "${query}", "maxResults": ${max}}'`,
        GWS_EXEC_OPTS,
      ).trim();
    } catch (err: any) {
      return JSON.stringify({ error: err.message });
    }
  },
  {
    name: "gmail_search",
    description: "Search Gmail messages using Gmail query syntax (from:, subject:, is:unread, etc).",
    schema: z.object({
      query: z.string().describe("Gmail search query"),
      maxResults: z.number().optional().describe("Max results to return (default 5)"),
    }),
  },
);

const calendarAgenda = tool(
  async ({ timezone }: { timezone?: string }) => {
    const tzFlag = timezone ? ` --timezone "${timezone}"` : "";
    try {
      return execSync(`gws calendar +agenda${tzFlag}`, GWS_EXEC_OPTS).trim();
    } catch (err: any) {
      return JSON.stringify({ error: err.message });
    }
  },
  {
    name: "calendar_agenda",
    description: "Show today's calendar agenda. Uses Google account timezone by default.",
    schema: z.object({
      timezone: z.string().optional().describe("IANA timezone, e.g. Asia/Hong_Kong"),
    }),
  },
);

const calendarCreate = tool(
  async ({
    summary,
    startTime,
    endTime,
    attendees,
    description,
    location,
  }: {
    summary: string;
    startTime: string;
    endTime: string;
    attendees?: string;
    description?: string;
    location?: string;
  }) => {
    let eventJson: Record<string, unknown> = {
      summary,
      start: { dateTime: startTime },
      end: { dateTime: endTime },
    };
    if (description) eventJson.description = description;
    if (location) eventJson.location = location;
    if (attendees) {
      eventJson.attendees = attendees
        .split(",")
        .map((e) => ({ email: e.trim() }));
    }
    try {
      return execSync(
        `gws calendar events insert --params '{"calendarId": "primary"}' --json '${JSON.stringify(eventJson)}'`,
        GWS_EXEC_OPTS,
      ).trim();
    } catch (err: any) {
      return JSON.stringify({ error: err.message });
    }
  },
  {
    name: "calendar_create_event",
    description: "Create a new Google Calendar event.",
    schema: z.object({
      summary: z.string().describe("Event title"),
      startTime: z.string().describe("Start time in ISO 8601, e.g. 2026-03-25T14:00:00+08:00"),
      endTime: z.string().describe("End time in ISO 8601"),
      attendees: z.string().optional().describe("Comma-separated attendee emails"),
      description: z.string().optional().describe("Event description"),
      location: z.string().optional().describe("Event location"),
    }),
  },
);

const driveList = tool(
  async ({ pageSize }: { pageSize?: number }) => {
    const size = pageSize ?? 10;
    try {
      return execSync(
        `gws drive files list --params '{"pageSize": ${size}}'`,
        GWS_EXEC_OPTS,
      ).trim();
    } catch (err: any) {
      return JSON.stringify({ error: err.message });
    }
  },
  {
    name: "drive_list_files",
    description: "List recent files in Google Drive.",
    schema: z.object({
      pageSize: z.number().optional().describe("Number of files to list (default 10)"),
    }),
  },
);

const driveSearch = tool(
  async ({ query, pageSize }: { query: string; pageSize?: number }) => {
    const size = pageSize ?? 10;
    try {
      return execSync(
        `gws drive files list --params '{"q": "${query}", "pageSize": ${size}}'`,
        GWS_EXEC_OPTS,
      ).trim();
    } catch (err: any) {
      return JSON.stringify({ error: err.message });
    }
  },
  {
    name: "drive_search_files",
    description: "Search Google Drive files using Drive query syntax.",
    schema: z.object({
      query: z.string().describe("Drive search query, e.g. name contains 'report'"),
      pageSize: z.number().optional().describe("Max results (default 10)"),
    }),
  },
);

// ─────────────────────────────────────────────
// 2. Reference material (loaded at startup)
// ─────────────────────────────────────────────

const CAR_WASH_REFERENCE = `
## Pricing Tiers by Vehicle Type

| Vehicle     | Basic | Interior | Full Detail | Engine Bay |
|-------------|-------|----------|-------------|------------|
| Motorcycle  | $80   | N/A      | $200        | $60        |
| Sedan       | $150  | $200     | $580        | $120       |
| SUV         | $200  | $280     | $780        | $150       |
| Truck       | $220  | $300     | $850        | $180       |
| Van         | $250  | $320     | $900        | $180       |

All prices in HKD. 10% discount when booking 2+ services together.

## Services
- **Basic Exterior Wash**: High-pressure rinse, foam, hand wash, wheel cleaning (~30 min)
- **Interior Cleaning**: Vacuum, dashboard wipe, window cleaning, air freshener (~45 min)
- **Full Detail**: Basic + Interior + clay bar + hand wax + tire dressing (~2-3 hours)
- **Engine Bay Cleaning**: Degreasing, low-pressure rinse, dressing (~30 min)

## Operating Hours
- Mon–Sat: 9:00 AM – 7:00 PM
- Sunday: 10:00 AM – 5:00 PM
- Public holidays: Closed
`.trim();

// ─────────────────────────────────────────────
// 3. Create the Deep Agent (tools on supervisor for multi-turn)
// ─────────────────────────────────────────────

// NOTE: Deep Agents subagents are fire-and-forget — they complete in one
// shot and return to the supervisor. They cannot hold a multi-turn
// conversation with the user.
//
// For step-by-step customer workflows (ask vehicle → ask services → estimate),
// the tools must live on the main agent so it can ask follow-ups across turns.
// This is the key difference vs your current SkillExecutionTool, which re-invokes
// a sub-LLM on each user message with full history.

const agent = createDeepAgent({
  model: openRouterModel("moonshotai/kimi-k2-thinking"),
  tools: [
    estimateCarWashPrice,
    knowledgeBase,
    gmailSend,
    gmailTriage,
    gmailSearch,
    calendarAgenda,
    calendarCreate,
    driveList,
    driveSearch,
  ],
  systemPrompt: `You are a helpful customer support agent for a car service shop.
You also have access to Google Workspace tools for Gmail, Calendar, and Drive.

## Car Wash Price Estimation
When a customer asks about car wash pricing, follow these steps ONE at a time:
1. Ask what **vehicle type** they have (sedan, SUV, truck, van, motorcycle).
2. Ask which **services** they want (one or more):
   - Basic exterior wash
   - Interior cleaning
   - Full detail (exterior + interior + wax)
   - Engine bay cleaning
3. Once you have BOTH vehicle type AND services, call \`estimate_car_wash_price\`.
4. Present the price breakdown clearly.
5. Ask if they'd like to proceed with booking.

${CAR_WASH_REFERENCE}

## Car Service Booking
When a customer wants to book/schedule, collect in this exact order (ONE at a time):
1. Service type
2. Vehicle details (make, model, year)
3. Preferred date/time (2–3 options). Mon–Sat 9AM–6PM only.
4. Contact phone number
5. Summarize and confirm.

Service menu (reference only — do NOT dump to customer):
- Engine Oil Change, Full Inspection, Tyre Change, Brake Inspection,
  Air-Con Service, Battery Check, Car Wash & Detail, General Repair

## Google Workspace
You can manage Gmail, Calendar, and Drive on behalf of the user:
- **Gmail**: Send emails (\`gmail_send\`), check inbox (\`gmail_triage\`), search messages (\`gmail_search\`)
- **Calendar**: View today's agenda (\`calendar_agenda\`), create events (\`calendar_create_event\`)
- **Drive**: List files (\`drive_list_files\`), search files (\`drive_search_files\`)

## Rules
- Ask ONE question per message. Never ask for two things at once.
- Acknowledge each answer before asking the next question.
- Never re-ask information already provided in conversation history.
- Use \`estimate_car_wash_price\` for pricing — NEVER make up prices.
- Use \`knowledge_base\` to look up domain info when needed.
- Be warm, friendly, and concise.
- Respond in the same language the customer uses.`,
});

// ─────────────────────────────────────────────
// 5. Interactive test harness
// ─────────────────────────────────────────────

async function runConversation() {
  console.log("─".repeat(60));
  console.log("  Deep Agent Prototype — AutoEstate Car Service");
  console.log("  Type your messages. Press Ctrl+C to exit.");
  console.log("─".repeat(60));

  const readline = await import("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const messages: Array<HumanMessage | AIMessage> = [];

  const ask = () => {
    rl.question("\n🧑 You: ", async (input) => {
      if (!input.trim()) return ask();

      messages.push(new HumanMessage(input));

      try {
        console.log("\n⏳ Thinking...\n");
        const result = await agent.invoke({ messages });

        const resultMsgs = result.messages as Array<{
          content: string | unknown;
        }>;
        const lastMsg = resultMsgs[resultMsgs.length - 1];
        const content =
          typeof lastMsg.content === "string"
            ? lastMsg.content
            : JSON.stringify(lastMsg.content);

        console.log(`🤖 Agent: ${content}`);

        messages.push(new AIMessage(content));
      } catch (err: any) {
        console.error(`❌ Error: ${err.message}`);
      }

      ask();
    });
  };

  ask();
}

runConversation().catch(console.error);
