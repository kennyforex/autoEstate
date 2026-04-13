# Foodflow frontend

AI-powered customer support platform frontend built with React, TypeScript, and Tailwind CSS.

## Tech Stack

- **React 19** with TypeScript
- **Vite** for fast development and building
- **Tailwind CSS** for styling
- **React Router** for navigation
- **Axios** for API calls
- **Socket.IO Client** for real-time updates
- **Lucide React** for icons
- **Recharts** for dashboard charts
- **date-fns** for date formatting

## Getting Started

### Prerequisites

- Node.js 20.19+ or 22.12+
- Backend server running on port 3001

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Production Build

```bash
npm run build
npm run preview
```

## Environment Variables

Create a `.env` file (or copy from `.env.example`):

```env
VITE_API_URL=http://localhost:3001/api
VITE_SOCKET_URL=http://localhost:3001
```

## Project Structure

```
src/
├── components/
│   ├── common/         # Reusable UI components (Button, Input, Modal, etc.)
│   ├── layout/         # Layout components (AppShell, Sidebar)
│   ├── inbox/          # Inbox-specific components
│   └── chat/           # Chat-related components
├── context/            # React contexts (AuthContext)
├── hooks/              # Custom React hooks
├── lib/                # Utilities (API client, socket, types)
├── pages/              # Page components
│   ├── AIAssistant/    # AI Assistant list and playground
│   ├── Channels/       # Channel management
│   └── Settings/       # Settings pages
└── App.tsx             # Main app with routing
```

## Features

- **Login/Authentication** - Email/password and OAuth providers
- **Dashboard** - Metrics, charts, and AI insights
- **Inbox** - Conversation list with real-time messaging
- **AI Assistant** - Create and manage AI assistants with playground
- **Channels** - WhatsApp channel configuration with QR code connection
- **Settings** - Profile, team management, API keys, and more

## Design System

The UI follows a consistent design language defined in `UI_DESIGN.md`:

- **Colors**: Dark sidebar (#1A1A1A), light content areas, primary blue (#2563EB)
- **Typography**: Inter font family
- **Spacing**: Consistent 4px base scale
- **Components**: Buttons, inputs, badges, modals, tables with defined variants

## API Integration

The frontend connects to the backend at `VITE_API_URL` with the following endpoints:

- `/auth` - Authentication (login, register, profile)
- `/assistants` - AI assistant management
- `/channels` - Channel management
- `/conversations` - Conversation and messaging
- `/dashboard` - Dashboard metrics and insights

WebSocket connection is established for real-time updates on:
- New messages
- Conversation updates
- Channel status changes
- AI typing indicators
