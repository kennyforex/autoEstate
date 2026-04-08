# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AutoEstate is a full-stack AI-powered customer support platform with WhatsApp integration. It features a custom ReAct agent engine with multi-skill, multi-goal support, allowing AI assistants to handle business workflows via structured skills.

## Development Commands

### Backend
```bash
cd backend
npm run dev          # Start with tsx watch (hot reload)
npm run build        # Compile TypeScript to dist/
npm run start        # Run compiled dist/app.js
npm run lint         # ESLint TypeScript files
```

### Frontend
```bash
cd frontend
npm run dev          # Vite dev server (port 5173)
npm run build        # tsc + vite build
npm run lint         # ESLint
```

### Backend Test/Migration Scripts
```bash
npm run test:document-capture   # Test document data capture tool
npm run migrate:department      # Backfill department info
npm run migrate:staff           # Backfill manager info
npm run cleanup:videos          # Remove orphaned video files
```

There is no automated test suite (Jest/Vitest). Testing is done via ad-hoc scripts in `backend/src/scripts/`.

## Architecture

### Backend Agent System (`backend/src/agent/`)

The core of the platform is a **ReAct agent** that processes incoming WhatsApp messages:

- **`engine.ts`** — Main orchestration loop (max 10 iterations). Calls tools iteratively until a final response or iteration limit.
- **`router.ts`** — Intent classifier. Uses a fast LLM (Gemini Flash) to decide: resume a suspended goal, continue an active skill, or classify fresh intent.
- **`prompt.ts`** — Builds the dynamic system prompt with assistant persona, language, department context, and team roster.
- **`types.ts`** — All TypeScript interfaces for AgentContext, Tool, Skill, Goal, etc.

### Skill System

Skills are the primary workflow unit. Each skill is a markdown file (`SKILL.md`) with YAML frontmatter that defines steps, collected fields, trigger hints, and reminder config. Skills are stored under `backend/skills/<skill-name>/`.

**Skill execution** (`backend/src/agent/tools/skill.tool.ts`):
- Skills run in their own sub-agent loop (up to 24 iterations, configurable via `SKILL_MAX_ITERATIONS`)
- The goal stack is persisted to MongoDB (`ConversationState` model) so conversations can be suspended and resumed across messages
- Goal statuses: `active`, `suspended`, `completed`

### Tool Registry (`backend/src/agent/tools/`)

Tools available to the agent:
- `skill.tool.ts` — Execute installed skills (manages the goal stack)
- `knowledgeBase.tool.ts` — Query Pinecone vector DB
- `documentDataCapture.tool.ts` — Structured extraction from images/PDFs (vision model)
- `mediaAnalysis.tool.ts` — Analyze images/videos via OpenRouter
- `googleCalendar.tool.ts`, `googleGmail.tool.ts`, `googleDrive.tool.ts`, `googleSheets.tool.ts` — Google Workspace tools
- `contactLookup.tool.ts`, `conversationHistory.tool.ts`, `clarification.tool.ts`, `webSearch.tool.ts`

### LLM Models (via OpenRouter)

| Role | Default Model |
|------|--------------|
| Agent (reasoning) | `deepseek/deepseek-v3.2` |
| Router/classification | `deepseek/deepseek-chat` |
| Vision/document capture | `qwen/qwen2.5-vl-72b-instruct` |
| Video analysis | `z-ai/glm-4.6v` |
| Audio | `google/gemini-2.0-flash-001` |

All models are configurable via environment variables (`OPENROUTER_*_MODEL`).

### Message Flow

1. WhatsApp message arrives at Evolution API webhook → `webhook.service.ts`
2. `ai.service.ts` queues processing per conversation (prevents race conditions)
3. Router classifies intent → engine selects tools → tools execute → response sent back via Evolution API
4. Real-time updates emitted to frontend via Socket.IO

### Frontend (`frontend/src/`)

- **`lib/api.ts`** — Axios instance with JWT auth; auto-redirects on 401
- **`lib/socket.ts`** — Socket.IO client for real-time message/conversation updates
- **`pages/AIAssistant/`** — Assistant management, skill builder, playground
- **`pages/Inbox/`** — Conversation inbox with real-time WebSocket updates
- **i18n**: English, Simplified Chinese, Traditional Chinese (`src/i18n/locales/`)

### Key Services (`backend/src/services/`)

- **`ai.service.ts`** — Orchestrates agent execution, manages per-conversation message queues
- **`skill.service.ts`** — Skill CRUD, file management, trigger hint parsing
- **`conversationState.service.ts`** — Goal stack persistence (MongoDB)
- **`reminder.service.ts`** — Scheduled follow-up reminders for skills
- **`googleWorkspace.service.ts`** — Google OAuth token management and API calls
- **`channel.service.ts`** — WhatsApp channel management via Evolution API

## Environment Setup

Copy `.env.example` to `.env` in both `backend/` and `frontend/`.

**Required backend variables:**
```
MONGODB_URI          # MongoDB connection string
JWT_SECRET           # JWT signing key
OPENROUTER_API_KEY   # LLM provider
PINECONE_API_KEY     # Vector DB
EVOLUTION_API_URL    # WhatsApp gateway
EVOLUTION_API_KEY    # WhatsApp gateway key
WEBHOOK_BASE_URL     # Public URL for Evolution API webhooks (use ngrok in dev)
```

**Frontend variables:**
```
VITE_API_URL=http://localhost:3001/api
VITE_SOCKET_URL=http://localhost:3001
```

For local development with WhatsApp webhooks, use `ngrok` and set `BACKEND_PUBLIC_URL` + `WEBHOOK_BASE_URL` to the ngrok tunnel URL.

## Skill File Format

Skills are markdown files with YAML frontmatter (parsed with real YAML — see `parseSkillFrontmatter` in `backend/src/services/skill.service.ts` and `backend/src/utils/skillFrontmatterParse.ts`).

**Required**

- `name`: kebab-case identifier (`a-z`, `0-9`, hyphens), max 64 characters — also the default install slug.
- `description`: what the skill does and when to use it (≤1024 characters).

**Common optional (portable)**

- `argument-hint`, `allowed-tools` (list; non–AutoEstate names are ignored for DB `requiredTools`), `user-invocable`, `disable-model-invocation`, `model`, `context`, `agent`.

**AutoEstate-specific — use `metadata`**

- `display_name`: human title (stored as MongoDB `name` / Skill Library label).
- `trigger_hints` (YAML list), `reminder_delay`, `max_reminders`, `schedule_enabled`, `schedule_cron`.
- `order_sheet_id`, `order_sheet_tab`, `sheet_fields`, `payment_pending_folder_id` (Google Sheets/Drive).
- `required_tools`: registry tool ids for the skill sub-agent; merged with matching entries from top-level `allowed-tools`.
- `steps`: workflow for the goal stack (same shape as before). Can live at top level or under `metadata.steps`.

```markdown
---
name: my-skill-id
description: >-
  What it does. Use when the user asks for ...
argument-hint: "[optional]"
user-invocable: true
metadata:
  display_name: My Skill
  trigger_hints:
    - keyword1
    - keyword2
  reminder_delay: 5
  max_reminders: 2
  required_tools:
    - google_sheets
steps:
  - id: step_id
    label: Human-readable label
    collects: field_name
---

# Skill instructions in markdown...
```

Installed skills are bound to assistants and stored under `uploads/skills/...`; repo examples live in `backend/skills/<skill-name>/SKILL.md`. `skill.service.ts` installs from zip or single `SKILL.md` and syncs parsed fields into MongoDB when the file is written.
