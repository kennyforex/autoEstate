import { io, Socket } from 'socket.io-client';
import type { Message, Conversation } from './types';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

interface ServerToClientEvents {
  'message:new': (message: Message) => void;
  'message:update': (message: Partial<Message> & { _id: string }) => void;
  'conversation:update': (conversation: Partial<Conversation> & { _id: string }) => void;
  'channel:status': (data: { channelId: string; status: string }) => void;
  'ai:typing': (data: { conversationId: string; isTyping: boolean }) => void;
  'ai:status': (data: {
    conversationId: string;
    status: 'analyzing_image' | 'analyzing_audio' | 'image_analyzed' | 'thinking' | 'agent_step' | 'done';
    result?: string;
    step?: {
      number: number;
      total: number;
      thought: string;
      action?: {
        tool: string;
        args: Record<string, unknown>;
      };
      observation?: string;
    };
  }) => void;
  'playground:message': (data: {
    assistantId: string;
    content: string;
    skillSlug?: string;
    kind?: 'scheduled_test';
    ts?: number;
  }) => void;
}

interface ClientToServerEvents {
  'conversation:subscribe': (conversationId: string) => void;
  'conversation:unsubscribe': (conversationId: string) => void;
  'message:read': (messageId: string) => void;
  'playground:subscribe': (assistantId: string) => void;
  'playground:unsubscribe': (assistantId: string) => void;
}

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
let currentSubscribedConversation: string | null = null;

export const initializeSocket = (token: string): Socket<ServerToClientEvents, ClientToServerEvents> => {
  if (socket) {
    socket.disconnect();
  }

  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => {
    console.log('Socket connected');
    // Re-subscribe to conversation on reconnection
    if (currentSubscribedConversation) {
      console.log(`Socket reconnected, re-subscribing to conversation ${currentSubscribedConversation}`);
      socket?.emit('conversation:subscribe', currentSubscribedConversation);
    }
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected');
  });

  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
  });

  return socket;
};

export const getSocket = (): Socket<ServerToClientEvents, ClientToServerEvents> | null => {
  return socket;
};

export const disconnectSocket = (): void => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export const subscribeToConversation = (conversationId: string): void => {
  if (socket) {
    currentSubscribedConversation = conversationId;
    socket.emit('conversation:subscribe', conversationId);
    console.log(`Subscribed to conversation ${conversationId}`);
  }
};

export const unsubscribeFromConversation = (conversationId: string): void => {
  if (socket) {
    if (currentSubscribedConversation === conversationId) {
      currentSubscribedConversation = null;
    }
    socket.emit('conversation:unsubscribe', conversationId);
    console.log(`Unsubscribed from conversation ${conversationId}`);
  }
};

export const markMessageAsRead = (messageId: string): void => {
  if (socket) {
    socket.emit('message:read', messageId);
  }
};
