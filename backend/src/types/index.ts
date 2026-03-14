import { Request } from "express";
import { Types } from "mongoose";

// User types
export interface IUser {
  _id: Types.ObjectId;
  email: string;
  passwordHash: string;
  name: string;
  avatar?: string;
  role: "admin" | "agent" | "viewer";
  timezone?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserPayload {
  userId: string;
  email: string;
  name?: string;
  role: string;
}

export interface AuthRequest extends Request {
  user?: IUserPayload;
}

// Assistant types
export interface IAssistant {
  _id: Types.ObjectId;
  name: string;
  pineconeAssistantName: string;
  instructions?: string;
  model: "gpt-4o" | "gpt-4.1" | "claude-3-7-sonnet";
  status: "active" | "inactive";
  metadata?: Record<string, unknown>;
  files: IAssistantFile[];
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAssistantFile {
  fileId: string;
  name: string;
  uploadedAt: Date;
}

// Channel types
export interface IChannel {
  _id: Types.ObjectId;
  name: string;
  type: "whatsapp";
  evolutionInstanceName: string;
  phoneNumber?: string;
  status: "connected" | "disconnected" | "connecting";
  qrCode?: string;
  assistantId?: Types.ObjectId;
  aiSettings: IAISettings;
  businessProfile: IBusinessProfile;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAISettings {
  enabled: boolean;
  autoReplyMode: "all" | "off" | "per_chat";
  responseDelay: number;
  escalateOnNegativeSentiment: boolean;
  detectBadWording?: boolean;
  badWordingResponse?: string;
}

export interface IBusinessProfile {
  name?: string;
  description?: string;
  profilePicture?: string;
}

// Contact types
export interface IContact {
  _id: Types.ObjectId;
  phoneNumber?: string;
  whatsappId?: string;
  name?: string;
  email?: string;
  company?: string;
  avatar?: string;
  channelId: Types.ObjectId;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// Conversation types
export interface IConversation {
  _id: Types.ObjectId;
  contactId: Types.ObjectId;
  channelId: Types.ObjectId;
  subject?: string;
  status: "open" | "resolved" | "spam";
  category?: string;
  assignedTo?: Types.ObjectId;
  aiAutoReply: boolean;
  aiHandling: boolean;
  aiSignals: IAISignals;
  dismissedInsights?: IDismissedInsights;
  lastMessageAt?: Date;
  lastMessageContent?: string;
  lastMessageSender?: "customer" | "agent" | "ai";
  resolvedAt?: Date;
  resolvedBy?: "ai" | "human" | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAISignals {
  confidence?: number;
  sentiment?: "positive" | "neutral" | "negative";
  slaRisk: boolean;
  priority: number;
}

export interface IDismissedInsights {
  negativeSentiment?: boolean;
  slaRisk?: boolean;
  priority?: boolean;
}

// Message types
export interface IMessage {
  _id: Types.ObjectId;
  conversationId: Types.ObjectId;
  channelId: Types.ObjectId;
  sender: "customer" | "agent" | "ai";
  senderUserId?: Types.ObjectId;
  content: string;
  contentType: "text" | "image" | "audio" | "document" | "location";
  mediaUrl?: string;
  mediaDescription?: string;
  evolutionMessageId?: string;
  aiGenerated: boolean;
  citations?: ICitation[];
  readAt?: Date;
  createdAt: Date;
}

export interface ICitation {
  position: number;
  references: ICitationReference[];
}

export interface ICitationReference {
  file: {
    id: string;
    name: string;
  };
  pages: number[];
}

// WebSocket events
export interface ServerToClientEvents {
  "message:new": (message: IMessage) => void;
  "message:update": (message: Partial<IMessage> & { _id: string }) => void;
  "conversation:update": (
    conversation: Partial<IConversation> & { _id: string },
  ) => void;
  "channel:status": (data: { channelId: string; status: string; phoneNumber?: string }) => void;
  "ai:typing": (data: { conversationId: string; isTyping: boolean }) => void;
  "ai:status": (data: {
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
}

export interface ClientToServerEvents {
  "conversation:subscribe": (conversationId: string) => void;
  "conversation:unsubscribe": (conversationId: string) => void;
  "message:read": (messageId: string) => void;
}

// Evolution API webhook types
export interface EvolutionWebhookPayload {
  event: string;
  instance: string;
  data: EvolutionMessageData | EvolutionConnectionData;
}

export interface EvolutionMessageData {
  key: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
    senderPn?: string; // Real phone number for Android users (e.g., "17786809983@s.whatsapp.net")
  };
  pushName?: string;
  message?: {
    conversation?: string;
    extendedTextMessage?: {
      text: string;
    };
    imageMessage?: {
      url: string;
      caption?: string;
    };
    audioMessage?: {
      url: string;
    };
    documentMessage?: {
      url: string;
      fileName?: string;
    };
  };
  messageTimestamp: number;
}

export interface EvolutionConnectionData {
  state: "open" | "close" | "connecting";
  statusReason?: number;
  instance?: {
    instanceName?: string;
    owner?: string; // Phone number in JID format like "85291234567@s.whatsapp.net"
  };
}

// Dashboard types
export interface DashboardMetrics {
  totalConversations: number;
  aiResolved: number;
  avgResponseTime: number;
  customerSatisfaction: number;
  conversationsByStatus: Record<string, number>;
  conversationsTrend: { date: string; count: number }[];
}

export interface AIInsights {
  aiPriority: number;
  negativeSentiment: number;
  slaRisk: number;
}
