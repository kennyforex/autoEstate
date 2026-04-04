// Tag types
export interface Tag {
  _id: string;
  label: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

// User status: pending (invited, not yet set password), active, inactive
export type UserStatus = "pending" | "active" | "inactive";

// User types
export interface User {
  _id: string;
  email: string;
  name: string;
  avatar?: string;
  role: "admin" | "agent" | "viewer";
  status?: UserStatus;
  lastLoginAt?: string;
  timezone?: string;
  language?: string;
  createdAt: string;
  updatedAt: string;
}

// Company types
export interface Company {
  _id: string;
  name: string;
  logo?: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
  timezone?: string;
  /** SMTP for team invite emails (stored in Settings > General > Email) */
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  emailFrom?: string;
  appUrl?: string;
  /** True when SMTP password is set (password never sent to client) */
  smtpPasswordSet?: boolean;
  /** Only sent when updating; never returned by API */
  smtpPass?: string;
  createdAt: string;
  updatedAt: string;
}

// Assistant types
export type VideoProcessingStatus =
  | "pending"
  | "analyzing"
  | "completed"
  | "failed";

export interface VideoMetadata {
  originalSize?: number;
  format?: string;
  filename?: string;
}

export interface AssistantFile {
  fileId: string;
  name: string;
  size?: number;
  uploadedAt: string;
  // Folder path for organization (FFCS only, not synced to Pinecone)
  folder?: string;
  // Video-specific fields
  isVideo?: boolean;
  videoPath?: string;
  processedAt?: string;
  processingStatus?: VideoProcessingStatus;
  videoMetadata?: VideoMetadata;
  errorMessage?: string;
}

export type AssistantLanguage = "zh-TW" | "zh-CN" | "en" | "auto";
export type AssistantTone =
  | "professional"
  | "friendly"
  | "casual"
  | "formal"
  | "empathetic";

/** Department roster member (manager or employee). */
export interface StaffMember {
  _id: string;
  displayName: string;
  roleTitle: string;
  responsibilities: string;
  skillIds: string[];
  isManager: boolean;
  nickname?: string;
  avatarPreset?: string;
  avatarUrl?: string;
}

export interface Assistant {
  _id: string;
  name: string;
  /** 部門名 — list primary label; falls back to `name` */
  departmentName?: string;
  /** 經理名 */
  managerName?: string;
  managerNickname?: string;
  managerAvatarPreset?: string;
  managerAvatarUrl?: string;
  pineconeAssistantName: string;
  primaryLanguage: AssistantLanguage;
  tone: AssistantTone;
  instructions?: string;
  model: "gpt-4o" | "gpt-4.1" | "claude-3-7-sonnet";
  status: "active" | "inactive";
  metadata?: Record<string, unknown>;
  files: AssistantFile[];
  folders: string[];
  /** Denormalized union of all staff skill assignments */
  skills?: string[];
  staff?: StaffMember[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// Skill types
export interface Skill {
  _id: string;
  name: string;
  slug: string;
  description: string;
  instructions?: string; // stored in DB for easy editing; also saved to SKILL.md
  triggerHints: string[];
  isBuiltIn: boolean;
  status: "active" | "inactive";

  // Directory structure flags
  hasReferences: boolean;
  hasExamples: boolean;
  scripts: string[];
  requiredTools: string[];
  reminderDelay: number;
  maxReminders: number;

  /** When true, backend may emit scheduled Playground messages per scheduleCron */
  scheduleEnabled?: boolean;
  /** Cron (5-field or 6-field with seconds); ignored when env test interval is set */
  scheduleCron?: string;

  nickname?: string;
  /** Job / role label (e.g. 訂單客服), separate from nickname */
  staffRole?: string;
  avatarPreset?: string;
  customAvatarUrl?: string;

  /** YAML inside SKILL.md frontmatter (between ---), from file when present. */
  frontmatterYaml?: string;

  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// Channel types
export interface AISettings {
  enabled: boolean;
  autoReplyMode: "all" | "off" | "per_chat";
  responseDelay: number;
  escalateOnNegativeSentiment: boolean;
  detectBadWording?: boolean;
  badWordingResponse?: string;
}

export interface BusinessProfile {
  name?: string;
  description?: string;
  profilePicture?: string;
}

export interface Channel {
  _id: string;
  name: string;
  type: "whatsapp";
  evolutionInstanceName: string;
  phoneNumber?: string;
  status: "connected" | "disconnected" | "connecting";
  qrCode?: string;
  assistantId?: string | Assistant;
  aiSettings: AISettings;
  businessProfile: BusinessProfile;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// Contact types
export interface Contact {
  _id: string;
  phoneNumber?: string;
  whatsappId?: string;
  name?: string;
  email?: string;
  company?: string;
  avatar?: string;
  country?: string; // ISO 3166-1 alpha-2 country code (e.g., "US", "TW", "CN")
  channelId: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ContactWithStats extends Contact {
  messageCount: number;
  conversationCount: number;
  lastChatDate?: string;
  channelName?: string;
  totalUnread?: number;
}

// Conversation types
export interface AISignals {
  confidence?: number;
  sentiment?: "positive" | "neutral" | "negative";
  slaRisk: boolean;
  priority: number;
}

export interface DismissedInsights {
  negativeSentiment?: boolean;
  slaRisk?: boolean;
  priority?: boolean;
}

export interface Conversation {
  _id: string;
  contactId: string | Contact;
  channelId: string | Channel;
  subject?: string;
  status: "open" | "resolved" | "spam";
  category?: string;
  assignedTo?: string | User;
  aiAutoReply: boolean;
  aiHandling: boolean;
  aiSignals: AISignals;
  dismissedInsights?: DismissedInsights;
  needsAttention: boolean;
  isArchived: boolean;
  tags?: Tag[];
  lastMessageAt?: string;
  lastMessageContent?: string;
  lastMessageSender?: "customer" | "agent" | "ai";
  resolvedAt?: string;
  resolvedBy?: "ai" | "human" | null;
  createdAt: string;
  updatedAt: string;
  messages?: Message[];
  unreadCount?: number;
}

// Message types
export interface CitationReference {
  file: {
    id: string;
    name: string;
  };
  pages: number[];
}

export interface Citation {
  position: number;
  references: CitationReference[];
}

export interface Message {
  _id: string;
  conversationId: string;
  channelId: string;
  sender: "customer" | "agent" | "ai";
  senderUserId?: string;
  content: string;
  contentType:
    | "text"
    | "image"
    | "audio"
    | "document"
    | "location"
    | "video"
    | "gif"
    | "sticker"
    | "contact"
    | "reaction";
  mediaUrl?: string;
  evolutionMessageId?: string;
  aiGenerated: boolean;
  citations?: Citation[];
  readAt?: string;
  createdAt: string;
}

// Dashboard types
export interface DashboardMetrics {
  totalConversations: number;
  aiResolved: number;
  avgResponseTime: number;
  customerSatisfaction: number;
  conversationsByStatus: Record<string, number>;
  conversationsTrend: { date: string; count: number }[];
  comparisonPeriod?: {
    totalConversations: number;
    aiResolved: number;
    avgResponseTime: number;
  };
}

export interface AIInsights {
  aiPriority: number;
  negativeSentiment: number;
  slaRisk: number;
}

export interface ChannelStats {
  channelId: string;
  channelName: string;
  totalConversations: number;
  aiHandled: number;
  avgResponseTime: number;
}

export interface AIPerformanceMetrics {
  totalResponses: number;
  avgConfidence: number;
  resolutionRate: number;
  escalationRate: number;
}

export interface InboxCounts {
  all: number;
  aiHandling: number;
  manual: number;
  needAttention: number;
  assignedToMe: number;
  resolvedByAI: number;
  spam: number;
  archived: number;
  tags?: Array<Tag & { count: number }>;
}

// API response types
export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

// Auth types
export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData extends LoginCredentials {
  name: string;
  role?: "admin" | "agent" | "viewer";
}

export interface AuthResponse {
  user: User;
  token: string;
  /** Set when user is pending (invited); must set password on first login */
  requiresPasswordSet?: boolean;
}

/** Scheduled cron / agent jobs (backend `/api/scheduled-jobs`) */
export type ScheduledJobScheduleKind = "interval" | "cron";
export type ScheduledJobSessionMode = "isolated" | "main";
export type ScheduledJobWakeMode = "now" | "next_heartbeat";
export type ScheduledJobResultDelivery = "announce" | "none";
export type ScheduledJobChannelSelection = "last" | "specific" | "playground";

export interface ScheduledJob {
  _id: string;
  name: string;
  description?: string;
  enabled: boolean;
  assistantId: string;
  scheduleKind: ScheduledJobScheduleKind;
  intervalMinutes?: number;
  cronExpression?: string;
  timezone: string;
  sessionMode: ScheduledJobSessionMode;
  wakeMode: ScheduledJobWakeMode;
  taskPrompt: string;
  timeoutSeconds?: number;
  resultDelivery: ScheduledJobResultDelivery;
  channelSelection: ScheduledJobChannelSelection;
  channelId?: string;
  recipientOverride?: string;
  lastRunAt?: string;
  nextRunAt?: string;
  lastStatus?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledJobRun {
  _id: string;
  jobId: string;
  trigger: "manual" | "schedule" | "wake_on_save";
  startedAt: string;
  finishedAt?: string;
  status: "running" | "success" | "failed" | "skipped";
  error?: string;
  summarySnippet?: string;
  deliveryStatus?: "sent" | "skipped" | "failed";
  deliveryDetail?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledJobsStats {
  enabledCount: number;
  total: number;
  nextWakeAt?: string;
}
