# FFCS - Full-Featured Customer Support

An AI-powered customer support platform with WhatsApp integration, AI assistants powered by Pinecone, and real-time messaging.

## Overview

FFCS provides a complete customer support solution with:

- **AI-Powered Responses**: Automatically respond to customer queries using AI assistants
- **WhatsApp Integration**: Connect via Evolution API for WhatsApp Business
- **Real-time Messaging**: WebSocket-based real-time message updates
- **Sentiment Analysis**: AI-powered sentiment detection and SLA monitoring
- **Knowledge Base**: Upload documents to train AI assistants via Pinecone

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
              │ MongoDB  │ │ Pinecone │ │  OpenAI  │
              │          │ │          │ │  Claude  │
              └──────────┘ └──────────┘ └──────────┘
```

## Project Structure

```
FFCS/
├── backend/                 # Express.js backend
│   ├── src/
│   │   ├── controllers/     # Route handlers
│   │   ├── models/          # Mongoose models
│   │   ├── routes/          # API routes
│   │   ├── services/        # Business logic
│   │   ├── socket/          # WebSocket handlers
│   │   └── config/          # Configuration
│   └── package.json
├── frontend/                # React frontend
│   ├── src/
│   │   ├── components/      # UI components
│   │   ├── pages/           # Page components
│   │   ├── context/         # React contexts
│   │   └── lib/             # Utilities
│   └── package.json
└── docs/
    └── UI_DESIGN.md         # UI specifications
```

## Getting Started

### Prerequisites

- Node.js 20.19+ or 22.12+
- MongoDB instance
- Pinecone account and API key
- Evolution API instance (for WhatsApp)
- OpenAI or Anthropic API key

### Backend Setup

```bash
cd backend
cp .env.example .env
# Edit .env with your configuration
npm install
npm run dev
```

### Frontend Setup

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

### Environment Variables

#### Backend (.env)
```env
# Server
PORT=3001
CORS_ORIGIN=http://localhost:5173

# Database
MONGODB_URI=mongodb://localhost:27017/ffcs

# JWT
JWT_SECRET=your-jwt-secret

# Evolution API
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=your-evolution-api-key

# Pinecone
PINECONE_API_KEY=your-pinecone-api-key

# AI
OPENAI_API_KEY=your-openai-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key
```

#### Frontend (.env)
```env
VITE_API_URL=http://localhost:3001/api
VITE_SOCKET_URL=http://localhost:3001
```

## Features

### Dashboard
- Conversation metrics and trends
- AI resolution rates
- Response time analytics
- Customer satisfaction scores
- AI insights (priority, sentiment, SLA risk)

### Inbox
- 4-panel layout with conversation list, chat view, and details
- Real-time message updates via WebSocket
- AI-handled conversation indicators
- Sentiment and SLA risk badges
- Message filtering and search

### AI Assistants
- Create and manage AI assistants
- Playground for testing conversations
- Document upload for knowledge base
- Multiple model support (GPT-4o, GPT-4.1, Claude)

### Channels
- WhatsApp connection via QR code
- AI settings per channel
- Business profile configuration
- Auto-escalation on negative sentiment

### Settings
- Profile management
- Team member invitations
- API key management
- Role-based permissions

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/profile` - Update profile

### Assistants
- `GET /api/assistants` - List assistants
- `POST /api/assistants` - Create assistant
- `GET /api/assistants/:id` - Get assistant
- `PUT /api/assistants/:id` - Update assistant
- `DELETE /api/assistants/:id` - Delete assistant
- `POST /api/assistants/:id/files` - Upload file
- `POST /api/assistants/:id/chat` - Chat with assistant

### Channels
- `GET /api/channels` - List channels
- `POST /api/channels` - Create channel
- `GET /api/channels/:id` - Get channel
- `PUT /api/channels/:id` - Update channel
- `POST /api/channels/:id/connect` - Connect (get QR)
- `POST /api/channels/:id/disconnect` - Disconnect

### Conversations
- `GET /api/conversations` - List conversations
- `GET /api/conversations/:id` - Get conversation with messages
- `PUT /api/conversations/:id` - Update conversation
- `POST /api/conversations/:id/messages` - Send message
- `GET /api/conversations/counts` - Get inbox counts
- `GET /api/conversations/insights` - Get AI insights

### Dashboard
- `GET /api/dashboard/metrics` - Get metrics
- `GET /api/dashboard/insights` - Get AI insights
- `GET /api/dashboard/channels` - Get channel stats
- `GET /api/dashboard/ai-performance` - Get AI performance

## WebSocket Events

### Server to Client
- `message:new` - New message received
- `message:update` - Message updated
- `conversation:update` - Conversation updated
- `channel:status` - Channel status changed
- `ai:typing` - AI typing indicator

### Client to Server
- `conversation:subscribe` - Subscribe to conversation updates
- `conversation:unsubscribe` - Unsubscribe from conversation
- `message:read` - Mark message as read

## License

MIT
