# FFCS Backend

AI-powered Customer Support Platform Backend built with Node.js, TypeScript, and MongoDB.

## Tech Stack

- **Runtime:** Node.js 20+ with TypeScript
- **Framework:** Express.js
- **Database:** MongoDB with Mongoose ODM
- **Real-time:** Socket.IO for WebSocket
- **Authentication:** JWT with bcrypt
- **AI:** Pinecone Assistant API
- **WhatsApp:** Evolution API

## Getting Started

### Prerequisites

- Node.js 20+
- MongoDB (local or Atlas)
- Pinecone API key
- Evolution API instance

### Installation

1. Install dependencies:

```bash
npm install
```

2. Create environment file:

```bash
cp .env.example .env
```

3. Configure your `.env` file with your credentials.

4. Start development server:

```bash
npm run dev
```

The server will start on `http://localhost:3001`.

## API Endpoints

### Authentication

| Method | Endpoint             | Description        |
| ------ | -------------------- | ------------------ |
| POST   | `/api/auth/register` | Register new user  |
| POST   | `/api/auth/login`    | Login, returns JWT |
| GET    | `/api/auth/me`       | Get current user   |

### Assistants (Pinecone)

| Method | Endpoint                            | Description                          |
| ------ | ----------------------------------- | ------------------------------------ |
| GET    | `/api/assistants`                   | List all assistants                  |
| POST   | `/api/assistants`                   | Create assistant (syncs to Pinecone) |
| GET    | `/api/assistants/:id`               | Get assistant details                |
| PUT    | `/api/assistants/:id`               | Update assistant                     |
| DELETE | `/api/assistants/:id`               | Delete assistant                     |
| POST   | `/api/assistants/:id/files`         | Upload file to assistant             |
| DELETE | `/api/assistants/:id/files/:fileId` | Delete file                          |
| POST   | `/api/assistants/:id/chat`          | Chat with assistant (playground)     |

### Channels (WhatsApp via Evolution)

| Method | Endpoint                        | Description                |
| ------ | ------------------------------- | -------------------------- |
| GET    | `/api/channels`                 | List all channels          |
| POST   | `/api/channels`                 | Create new channel         |
| GET    | `/api/channels/:id`             | Get channel details        |
| PUT    | `/api/channels/:id`             | Update channel settings    |
| DELETE | `/api/channels/:id`             | Delete channel             |
| GET    | `/api/channels/:id/qr`          | Get QR code for connection |
| POST   | `/api/channels/:id/connect`     | Trigger connection         |
| POST   | `/api/channels/:id/disconnect`  | Disconnect instance        |
| PUT    | `/api/channels/:id/ai-settings` | Update AI settings         |

### Conversations (Inbox)

| Method | Endpoint                           | Description                       |
| ------ | ---------------------------------- | --------------------------------- |
| GET    | `/api/conversations`               | List conversations (with filters) |
| GET    | `/api/conversations/counts`        | Get inbox counts                  |
| GET    | `/api/conversations/insights`      | Get AI insights counts            |
| GET    | `/api/conversations/:id`           | Get conversation with messages    |
| PUT    | `/api/conversations/:id`           | Update conversation               |
| PUT    | `/api/conversations/:id/ai-toggle` | Toggle AI auto-reply              |
| POST   | `/api/conversations/:id/messages`  | Send message                      |
| POST   | `/api/conversations/:id/read`      | Mark as read                      |

### Dashboard

| Method | Endpoint                        | Description            |
| ------ | ------------------------------- | ---------------------- |
| GET    | `/api/dashboard/metrics`        | Get dashboard metrics  |
| GET    | `/api/dashboard/insights`       | Get AI insights        |
| GET    | `/api/dashboard/channels`       | Get channel statistics |
| GET    | `/api/dashboard/ai-performance` | Get AI performance     |

### Webhooks

| Method | Endpoint                                | Description              |
| ------ | --------------------------------------- | ------------------------ |
| POST   | `/api/webhooks/evolution/:instanceName` | Receive Evolution events |

## WebSocket Events

### Server to Client

- `message:new` - New message received
- `message:update` - Message updated (read status)
- `conversation:update` - Conversation status change
- `channel:status` - Channel connection status change
- `ai:typing` - AI is generating response

### Client to Server

- `conversation:subscribe` - Subscribe to conversation updates
- `conversation:unsubscribe` - Unsubscribe
- `message:read` - Mark message as read

## AI Auto-Reply Logic

The AI auto-reply system has three levels of control:

1. **Channel Level:** Master toggle (`aiSettings.enabled`)
2. **Channel Mode:** `all` | `off` | `per_chat`
3. **Conversation Level:** Individual toggle (`aiAutoReply`)

```typescript
// AI reply decision logic
function shouldAutoReply(channel, conversation) {
  if (!channel.aiSettings.enabled) return false;
  if (!channel.assistantId) return false;

  switch (channel.aiSettings.autoReplyMode) {
    case "off":
      return false;
    case "all":
      return true;
    case "per_chat":
      return conversation.aiAutoReply;
  }
}
```

## Project Structure

```
backend/
├── src/
│   ├── config/          # Database, Pinecone, Evolution configs
│   ├── models/          # Mongoose models
│   ├── services/        # Business logic
│   ├── controllers/     # Request handlers
│   ├── routes/          # API routes
│   ├── middleware/      # Auth, validation, error handling
│   ├── utils/           # Helper functions
│   ├── types/           # TypeScript types
│   ├── socket/          # WebSocket handlers
│   └── app.ts           # Application entry point
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

## Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint

## License

ISC
