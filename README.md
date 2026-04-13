# Foodflow

AI-powered customer support for **restaurants, food suppliers, and F&B teams**: WhatsApp-first conversations, assistants with a **skills** workflow engine, Pinecone knowledge base, and real-time inbox.

## Overview

Foodflow helps food businesses handle:

- **Guest messaging** — Orders, reservations, menu questions, allergens, hours, and delivery status on WhatsApp.
- **Structured workflows** — Skills capture fields step-by-step, remind customers, and connect to Google Sheets/Drive/Calendar when configured.
- **Documents & media** — Vision tools for photos, menus, invoices, or handwritten notes.
- **Team inbox** — Web dashboard with live updates (Socket.IO), sentiment and SLA cues.

The core agent stack is **not hard-coded to food**: positioning and example skills are F&B-focused; you can adapt skills for any operation.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│    Frontend     │────▶│    Backend      │────▶│   Evolution     │
│  (React/Vite)   │◀────│  (Express/TS)   │◀────│     API         │
│                 │     │                 │     │                 │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
              ┌──────────┐ ┌──────────┐ ┌──────────┐
              │ MongoDB  │ │ Pinecone │ │ OpenRouter│
              │          │ │          │ │  (LLMs)  │
              └──────────┘ └──────────┘ └──────────┘
```

## Project structure

```
foodflow/
├── backend/                 # Express.js backend + agent + skills
├── frontend/                # React (Vite) dashboard
└── docs/
    └── UI_DESIGN.md         # UI notes
```

## Getting started

### Prerequisites

- Node.js 20.19+ or 22.12+
- MongoDB
- Pinecone (knowledge base)
- Evolution API (WhatsApp)
- OpenRouter API key (LLMs)

### Backend

```bash
cd backend
cp .env.example .env
# Edit .env
npm install
npm run dev
```

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

### Environment (examples)

**Backend**

```env
PORT=3001
CORS_ORIGIN=http://localhost:5173
MONGODB_URI=mongodb://localhost:27017/foodflow
JWT_SECRET=your-jwt-secret
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=your-evolution-api-key
PINECONE_API_KEY=your-pinecone-api-key
OPENROUTER_API_KEY=your-openrouter-api-key
WEBHOOK_BASE_URL=https://your-public-url
```

**Frontend**

```env
VITE_API_URL=http://localhost:3001/api
VITE_SOCKET_URL=http://localhost:3001
```

For local WhatsApp webhooks, use a tunnel (e.g. ngrok) and set `WEBHOOK_BASE_URL` accordingly.

## Example skills

- [`backend/skills/cake-booking/SKILL.md`](backend/skills/cake-booking/SKILL.md) — sample booking-style flow you can clone for your menu or catering process.

## Docs for contributors

See [CLAUDE.md](CLAUDE.md) for agent architecture, skill format, and service map.

## License

MIT
