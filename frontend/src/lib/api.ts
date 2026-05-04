import axios, { AxiosError } from "axios";
import type { InternalAxiosRequestConfig } from "axios";
import type {
  User,
  Company,
  Assistant,
  Channel,
  Conversation,
  Message,
  Skill,
  DashboardMetrics,
  AIInsights,
  ChannelStats,
  AIPerformanceMetrics,
  InboxCounts,
  Tag,
  OrderTag,
  ShippingMethod,
  ClientGroup,
  Product,
  LoginCredentials,
  RegisterData,
  AuthResponse,
  PaginatedResponse,
  ContactWithStats,
  ScheduledJob,
  ScheduledJobRun,
  ScheduledJobsStats,
  Order,
  OrderListResponse,
} from "./types";

const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:3001/api";

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor to add auth token
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

// Auth API
export const authApi = {
  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    const { data } = await api.post("/auth/login", credentials);
    return data;
  },

  register: async (userData: RegisterData): Promise<AuthResponse> => {
    const { data } = await api.post("/auth/register", userData);
    return data;
  },

  getMe: async (): Promise<User> => {
    const { data } = await api.get("/auth/me");
    // Backend returns { user: {...} }, unwrap it
    return data.user || data;
  },

  updateProfile: async (updates: Partial<User>): Promise<User> => {
    const { data } = await api.put("/auth/profile", updates);
    return data.user || data;
  },

  changePassword: async (
    currentPassword: string,
    newPassword: string,
  ): Promise<void> => {
    await api.put("/auth/password", { currentPassword, newPassword });
  },

  setPassword: async (newPassword: string): Promise<{ user: User }> => {
    const { data } = await api.post("/auth/set-password", { newPassword });
    return data;
  },
};

// Upload API (long timeout for large base64 payloads)
const UPLOAD_TIMEOUT_MS = 60_000;

export const uploadApi = {
  image: async (
    base64: string,
    mimeType: string,
  ): Promise<{ url: string; mimeType: string }> => {
    const { data } = await api.post("/upload/image", { base64, mimeType }, {
      timeout: UPLOAD_TIMEOUT_MS,
    });
    return data;
  },

  file: async (
    base64: string,
    mimeType: string,
    fileName?: string,
  ): Promise<{ url: string; mimeType: string; fileName: string }> => {
    const { data } = await api.post("/upload/file", {
      base64,
      mimeType,
      fileName,
    });
    return data;
  },
};

// Company API
export const companyApi = {
  /** Public branding (logo, name) for login page — no auth required */
  getPublic: async (): Promise<{ logo?: string; name?: string }> => {
    const { data } = await api.get("/company/public");
    return data ?? {};
  },

  get: async (): Promise<Company> => {
    const { data } = await api.get("/company");
    // Backend returns { company: {...} }; ensure all users get full profile including logo
    const company = data?.company ?? data;
    return company ?? ({} as Company);
  },

  update: async (updates: Partial<Company>): Promise<Company> => {
    const { data } = await api.put("/company", updates);
    return data.company || data;
  },

  sendTestEmail: async (to: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data } = await api.post("/company/send-test-email", { to });
      return { success: !!data.success };
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string } } };
      return { success: false, error: ax.response?.data?.error || "Failed to send test email" };
    }
  },
};

// Users API (Team Members)
export const usersApi = {
  list: async (): Promise<User[]> => {
    const { data } = await api.get("/users");
    return data.users || data;
  },

  invite: async (input: {
    email: string;
    name?: string;
    role: "admin" | "agent" | "viewer";
  }): Promise<{ user: User; emailSent: boolean; emailError?: string }> => {
    const { data } = await api.post("/users/invite", input);
    return {
      user: data.user || data,
      emailSent: data.emailSent === true,
      emailError: data.emailError,
    };
  },

  updateRole: async (
    id: string,
    role: "admin" | "agent" | "viewer",
  ): Promise<User> => {
    const { data } = await api.patch(`/users/${id}`, { role });
    return data.user || data;
  },

  updateStatus: async (
    id: string,
    status: "active" | "inactive",
  ): Promise<User> => {
    const { data } = await api.patch(`/users/${id}`, { status });
    return data.user || data;
  },

  resendInvite: async (
    id: string,
  ): Promise<{ emailSent: boolean; emailError?: string }> => {
    const { data } = await api.post(`/users/${id}/resend-invite`);
    return {
      emailSent: data.emailSent === true,
      emailError: data.emailError,
    };
  },

  remove: async (id: string): Promise<void> => {
    await api.delete(`/users/${id}`);
  },
};

// Tags API
export const tagsApi = {
  list: async (): Promise<Tag[]> => {
    const { data } = await api.get("/tags");
    return data.tags || data;
  },

  create: async (tag: Partial<Tag>): Promise<Tag> => {
    const { data } = await api.post("/tags", tag);
    return data.tag || data;
  },

  update: async (id: string, updates: Partial<Tag>): Promise<Tag> => {
    const { data } = await api.put(`/tags/${id}`, updates);
    return data.tag || data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/tags/${id}`);
  },
};

export const orderTagsApi = {
  list: async (): Promise<OrderTag[]> => {
    const { data } = await api.get("/order-tags");
    return data.tags || data;
  },

  create: async (tag: Partial<OrderTag>): Promise<OrderTag> => {
    const { data } = await api.post("/order-tags", tag);
    return data.tag || data;
  },

  update: async (id: string, updates: Partial<OrderTag>): Promise<OrderTag> => {
    const { data } = await api.put(`/order-tags/${id}`, updates);
    return data.tag || data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/order-tags/${id}`);
  },
};

export const shippingMethodsApi = {
  list: async (): Promise<ShippingMethod[]> => {
    const { data } = await api.get("/shipping-methods");
    return data.shippingMethods || data;
  },

  create: async (method: Partial<ShippingMethod>): Promise<ShippingMethod> => {
    const { data } = await api.post("/shipping-methods", method);
    return data.shippingMethod || data;
  },

  update: async (id: string, updates: Partial<ShippingMethod>): Promise<ShippingMethod> => {
    const { data } = await api.put(`/shipping-methods/${id}`, updates);
    return data.shippingMethod || data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/shipping-methods/${id}`);
  },
};

// Orders API
export const ordersApi = {
  list: async (params: {
    search?: string;
    status?: string;
    paymentStatus?: string;
    fulfillmentStatus?: string;
    tagId?: string;
    createdFrom?: string;
    createdTo?: string;
    deliveryFrom?: string;
    deliveryTo?: string;
    limit: number;
    offset: number;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }): Promise<OrderListResponse> => {
    const { data } = await api.get("/orders", { params });
    return data;
  },

  get: async (id: string): Promise<Order> => {
    const { data } = await api.get(`/orders/${id}`);
    return data.order || data;
  },

  create: async (
    payload: Pick<
      Order,
      | "clientName"
      | "phoneNumber"
      | "email"
      | "shippingAddress"
      | "shippingMethod"
      | "deliveryDate"
      | "status"
      | "paymentStatus"
      | "fulfillmentStatus"
      | "currency"
      | "discountTotal"
      | "shippingFee"
      | "taxTotal"
      | "tagIds"
    > & {
      contactId?: string;
      items: Array<{
        snapshot: {
          productId?: string;
          productName: string;
          variantLabel?: string;
          optionSummary?: string;
          sku?: string;
          imageUrl?: string;
        };
        quantity: number;
        unitPrice: number;
        notes?: string;
      }>;
    },
  ): Promise<Order> => {
    const { data } = await api.post("/orders", payload);
    return data.order || data;
  },

  update: async (
    id: string,
    payload: Partial<
      Pick<
        Order,
        | "clientName"
        | "phoneNumber"
        | "email"
        | "shippingAddress"
        | "shippingMethod"
        | "deliveryDate"
        | "status"
        | "paymentStatus"
        | "fulfillmentStatus"
        | "currency"
        | "discountTotal"
        | "shippingFee"
        | "taxTotal"
        | "tagIds"
      >
    > & {
      contactId?: string | null;
      items?: Array<{
        snapshot: {
          productId?: string;
          productName: string;
          variantLabel?: string;
          optionSummary?: string;
          sku?: string;
          imageUrl?: string;
        };
        quantity: number;
        unitPrice: number;
        notes?: string;
      }>;
    },
  ): Promise<Order> => {
    const { data } = await api.put(`/orders/${id}`, payload);
    return data.order || data;
  },

  addActivity: async (id: string, message: string): Promise<Order> => {
    const { data } = await api.post(`/orders/${id}/activity`, { message });
    return data.order || data;
  },
};

// Assistants API
// Agent chat SSE types
export interface AgentStepEvent {
  type: 'agent_step';
  step: {
    number: number;
    total: number;
    thought: string;
    action?: { tool: string; args: Record<string, unknown> };
    observation?: string;
  };
}

export interface AgentStatusEvent {
  type: 'status';
  status: 'analyzing_image' | 'analyzing_audio' | 'thinking';
}

export interface AgentWarningEvent {
  type: 'warning';
  code: string;
  message: string;
  detail?: string;
}

export interface AgentDoneEvent {
  type: 'done';
  message: { role: string; content: string };
  resultType: 'final_answer' | 'clarification';
  citations?: unknown[];
  model?: string;
  usage?: unknown;
  steps?: unknown[];
  activeStaffId?: string;
  activeSkillSlug?: string;
}

export type AgentStreamEvent =
  | AgentStepEvent
  | AgentStatusEvent
  | AgentWarningEvent
  | AgentDoneEvent;

export interface AgentChatResult {
  message: { role: string; content: string };
  type: 'final_answer' | 'clarification';
  citations?: unknown[];
  model?: string;
  steps?: unknown[];
  activeStaffId?: string;
  activeSkillSlug?: string;
}

async function streamAgentChat(
  id: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  file?: File,
  onProgress?: (event: AgentStreamEvent) => void,
): Promise<AgentChatResult> {
  const token = localStorage.getItem('token');

  let body: FormData | string;
  const headers: Record<string, string> = {};

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (file) {
    const formData = new FormData();
    formData.append('messages', JSON.stringify(messages));
    formData.append('file', file);
    body = formData;
  } else {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify({ messages });
  }

  const response = await fetch(`${API_BASE_URL}/assistants/${id}/agent-chat`, {
    method: 'POST',
    headers,
    body,
  });

  if (!response.ok) {
    throw new Error(`Agent chat failed: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';
  let finalResult: AgentChatResult | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const event = JSON.parse(line.slice(6)) as AgentStreamEvent;
          if (onProgress) onProgress(event);
          if (event.type === 'done') {
            finalResult = {
              message: event.message,
              type: event.resultType,
              citations: event.citations,
              model: event.model,
              steps: event.steps,
              activeStaffId: event.activeStaffId,
              activeSkillSlug: event.activeSkillSlug,
            };
          }
        } catch {
          // skip malformed events
        }
      }
    }
  }

  if (!finalResult) {
    throw new Error('No final result received from agent');
  }

  return finalResult;
}

export const assistantsApi = {
  /** Tool ids allowed for skill `requiredTools` — from backend registry (excludes execute_skill, ask_clarification). */
  getSkillToolOptions: async (): Promise<{ id: string; label: string }[]> => {
    const { data } = await api.get<{ tools: { id: string; label: string }[] }>(
      "/assistants/skill-tool-options",
    );
    return data.tools ?? [];
  },

  list: async (status?: "active" | "inactive"): Promise<Assistant[]> => {
    const params = status ? { status } : {};
    const { data } = await api.get("/assistants", { params });
    // Backend returns { assistants: [...] }, unwrap and map aiModel to model
    const assistants = data.assistants || data;
    return assistants.map((a: Assistant & { aiModel?: string }) => ({
      ...a,
      model: a.aiModel || a.model,
    }));
  },

  get: async (id: string): Promise<Assistant> => {
    const { data } = await api.get(`/assistants/${id}`);
    // Backend returns { assistant: {...} }, unwrap it
    const assistant = data.assistant || data;
    // Map aiModel to model for frontend compatibility
    return { ...assistant, model: assistant.aiModel || assistant.model };
  },

  create: async (assistant: Partial<Assistant>): Promise<Assistant> => {
    // Map model to aiModel for backend compatibility
    const backendData = { ...assistant, aiModel: assistant.model };
    const { data } = await api.post("/assistants", backendData);
    // Backend returns { assistant: {...} }, unwrap and map back
    const created = data.assistant || data;
    return { ...created, model: created.aiModel || created.model };
  },

  update: async (
    id: string,
    updates: Partial<Assistant>,
  ): Promise<Assistant> => {
    // Map model to aiModel for backend compatibility
    const backendUpdates = { ...updates, aiModel: updates.model };
    const { data } = await api.put(`/assistants/${id}`, backendUpdates);
    // Backend returns { assistant: {...} }, unwrap and map back
    const assistant = data.assistant || data;
    return { ...assistant, model: assistant.aiModel || assistant.model };
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/assistants/${id}`);
  },

  addStaff: async (
    assistantId: string,
    body: { displayName: string; roleTitle?: string; responsibilities?: string },
  ): Promise<Assistant> => {
    const { data } = await api.post(`/assistants/${assistantId}/staff`, body);
    const assistant = data.assistant || data;
    return { ...assistant, model: assistant.aiModel || assistant.model };
  },

  updateStaff: async (
    assistantId: string,
    staffId: string,
    body: {
      displayName?: string;
      roleTitle?: string;
      responsibilities?: string;
      nickname?: string;
      avatarPreset?: string;
      avatarUrl?: string;
    },
  ): Promise<Assistant> => {
    const { data } = await api.patch(`/assistants/${assistantId}/staff/${staffId}`, body);
    const assistant = data.assistant || data;
    return { ...assistant, model: assistant.aiModel || assistant.model };
  },

  removeStaff: async (assistantId: string, staffId: string): Promise<Assistant> => {
    const { data } = await api.delete(`/assistants/${assistantId}/staff/${staffId}`);
    const assistant = data.assistant || data;
    return { ...assistant, model: assistant.aiModel || assistant.model };
  },

  uploadFile: async (id: string, file: File, folder?: string): Promise<Assistant> => {
    const formData = new FormData();
    // IMPORTANT: filename must come BEFORE file for multer to parse it in req.body
    formData.append("filename", file.name);
    if (folder) {
      formData.append("folder", folder);
    }
    formData.append("file", file);
    const { data } = await api.post(`/assistants/${id}/files`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  },

  deleteFile: async (id: string, fileId: string): Promise<void> => {
    await api.delete(`/assistants/${id}/files/${fileId}`);
  },

  getFileUrl: async (
    id: string,
    fileId: string,
  ): Promise<{ signedUrl: string; name: string }> => {
    const { data } = await api.get(`/assistants/${id}/files/${fileId}`);
    return data;
  },

  getFileStatus: async (
    id: string,
    fileId: string,
  ): Promise<{ status: string | null; errorMessage?: string }> => {
    const { data } = await api.get(`/assistants/${id}/files/${fileId}/status`);
    return data;
  },

  cancelFileProcessing: async (id: string, fileId: string): Promise<void> => {
    await api.post(`/assistants/${id}/files/${fileId}/cancel`);
  },

  updateFileFolder: async (
    id: string,
    fileId: string,
    folder: string | null,
  ): Promise<Assistant> => {
    const { data } = await api.patch(`/assistants/${id}/files/${fileId}`, { folder });
    const assistant = data.assistant || data;
    return { ...assistant, model: assistant.aiModel || assistant.model };
  },

  batchUpdateFileFolders: async (
    id: string,
    updates: Array<{ fileId: string; folder: string | null }>,
  ): Promise<Assistant> => {
    const { data } = await api.patch(`/assistants/${id}/files`, { updates });
    const assistant = data.assistant || data;
    return { ...assistant, model: assistant.aiModel || assistant.model };
  },

  createFolder: async (id: string, name: string): Promise<Assistant> => {
    const { data } = await api.post(`/assistants/${id}/folders`, { name });
    const assistant = data.assistant || data;
    return { ...assistant, model: assistant.aiModel || assistant.model };
  },

  deleteFolder: async (id: string, folderName: string): Promise<Assistant> => {
    const { data } = await api.delete(
      `/assistants/${id}/folders/${encodeURIComponent(folderName)}`
    );
    const assistant = data.assistant || data;
    return { ...assistant, model: assistant.aiModel || assistant.model };
  },

  renameFolder: async (
    id: string,
    folderName: string,
    newName: string
  ): Promise<Assistant> => {
    const { data } = await api.patch(
      `/assistants/${id}/folders/${encodeURIComponent(folderName)}`,
      { newName }
    );
    const assistant = data.assistant || data;
    return { ...assistant, model: assistant.aiModel || assistant.model };
  },

  chat: async (
    id: string,
    messages: { role: "user" | "assistant"; content: string }[],
  ): Promise<{
    message: { role: string; content: string };
    citations?: unknown[];
    model?: string;
  }> => {
    const { data } = await api.post(`/assistants/${id}/chat`, { messages });
    return data;
  },

  agentChat: async (
    id: string,
    messages: { role: "user" | "assistant"; content: string }[],
    onProgress?: (event: AgentStreamEvent) => void,
  ): Promise<AgentChatResult> => {
    return streamAgentChat(id, messages, undefined, onProgress);
  },

  agentChatWithFile: async (
    id: string,
    messages: { role: "user" | "assistant"; content: string }[],
    file: File,
    onProgress?: (event: AgentStreamEvent) => void,
  ): Promise<AgentChatResult> => {
    return streamAgentChat(id, messages, file, onProgress);
  },
};

// Channels API
export const channelsApi = {
  list: async (): Promise<Channel[]> => {
    const { data } = await api.get("/channels");
    // Backend returns { channels: [...] }, unwrap it
    return data.channels || data;
  },

  get: async (id: string): Promise<Channel> => {
    const { data } = await api.get(`/channels/${id}`);
    // Backend returns { channel: {...} }, unwrap it
    return data.channel || data;
  },

  create: async (
    channel: Partial<Channel> & { phoneNumber?: string },
  ): Promise<Channel> => {
    const { data } = await api.post("/channels", channel);
    // Backend returns { channel: {...} }, unwrap it
    return data.channel || data;
  },

  update: async (id: string, updates: Partial<Channel>): Promise<Channel> => {
    const { data } = await api.put(`/channels/${id}`, updates);
    // Backend returns { channel: {...} }, unwrap it
    return data.channel || data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/channels/${id}`);
  },

  getQRCode: async (
    id: string,
  ): Promise<{ qrCode: string; status: string }> => {
    const { data } = await api.get(`/channels/${id}/qr`);
    return data;
  },

  connect: async (id: string): Promise<{ qrCode?: string; status: string }> => {
    const { data } = await api.post(`/channels/${id}/connect`);
    return data;
  },

  checkStatus: async (
    id: string,
  ): Promise<{ status: string; phoneNumber?: string }> => {
    const { data } = await api.get(`/channels/${id}/status`);
    return data;
  },

  disconnect: async (id: string): Promise<Channel> => {
    const { data } = await api.post(`/channels/${id}/disconnect`);
    // Backend returns { message: ... }, refresh channel after
    return data.channel || data;
  },

  updateAISettings: async (
    id: string,
    settings: Partial<Channel["aiSettings"]>,
  ): Promise<Channel> => {
    const { data } = await api.put(`/channels/${id}/ai-settings`, settings);
    // Backend returns { channel: {...} }, unwrap it
    return data.channel || data;
  },
};

// Conversations API
export const conversationsApi = {
  list: async (params?: {
    status?: "open" | "resolved" | "spam";
    channelId?: string;
    assignedTo?: string;
    aiHandling?: boolean;
    sentiment?: "positive" | "neutral" | "negative";
    slaRisk?: boolean;
    limit?: number;
    offset?: number;
    sortBy?: "lastMessageAt" | "createdAt" | "priority";
    sortOrder?: "asc" | "desc";
    tagId?: string;
  }): Promise<PaginatedResponse<Conversation>> => {
    const { data } = await api.get("/conversations", { params });
    return data;
  },

  get: async (
    id: string,
    includeMessages = true,
  ): Promise<Conversation & { messages?: Message[] }> => {
    const { data } = await api.get(`/conversations/${id}`, {
      params: { messages: includeMessages },
    });
    // Backend returns { conversation: {...}, messages: [...] }
    // Merge them into one object for easier use
    const conversation = data.conversation || data;
    if (data.messages) {
      conversation.messages = data.messages;
    }
    return conversation;
  },

  update: async (
    id: string,
    updates: Partial<Omit<Conversation, "tags">> & { tags?: string[] | Tag[] },
  ): Promise<Conversation> => {
    const { data } = await api.put(`/conversations/${id}`, updates);
    // Backend returns { conversation: {...} }, unwrap it
    return data.conversation || data;
  },

  toggleAI: async (id: string, enabled: boolean): Promise<Conversation> => {
    const { data } = await api.put(`/conversations/${id}/ai-toggle`, {
      enabled,
    });
    // Backend returns { conversation: {...} }, unwrap it
    return data.conversation || data;
  },

  sendMessage: async (
    id: string,
    content: string,
    contentType: Message["contentType"] = "text",
    mediaUrl?: string,
    fileName?: string,
  ): Promise<Message> => {
    const { data } = await api.post(`/conversations/${id}/messages`, {
      content,
      contentType,
      mediaUrl,
      fileName,
    });
    // Backend returns { message: {...} }, unwrap it
    return data.message || data;
  },

  markAsRead: async (id: string): Promise<void> => {
    await api.post(`/conversations/${id}/read`);
  },

  remove: async (id: string): Promise<void> => {
    await api.delete(`/conversations/${id}`);
  },

  getAIDiagnostic: async (id: string): Promise<any> => {
    const { data } = await api.get(`/conversations/${id}/ai-diagnostic`);
    return data.diagnostic || data;
  },

  getCounts: async (channelId?: string | null): Promise<InboxCounts> => {
    const params = channelId ? { channelId } : {};
    const { data } = await api.get("/conversations/counts", { params });
    // Backend returns { counts: {...} }, unwrap it
    return data.counts || data;
  },

  getInsights: async (channelId?: string | null): Promise<AIInsights> => {
    const params = channelId ? { channelId } : {};
    const { data } = await api.get("/conversations/insights", { params });
    // Backend returns { insights: {...} }, unwrap it
    return data.insights || data;
  },

  // Convenience methods for status operations
  // Note: resolvedBy is auto-detected by backend based on lastMessageSender
  markResolved: async (id: string): Promise<Conversation> => {
    const { data } = await api.put(`/conversations/${id}`, {
      status: "resolved",
    });
    return data.conversation || data;
  },

  markSpam: async (id: string): Promise<Conversation> => {
    const { data } = await api.put(`/conversations/${id}`, {
      status: "spam",
    });
    return data.conversation || data;
  },

  reopen: async (id: string): Promise<Conversation> => {
    const { data } = await api.put(`/conversations/${id}`, {
      status: "open",
    });
    return data.conversation || data;
  },

  toggleAttention: async (
    id: string,
    needsAttention: boolean,
  ): Promise<Conversation> => {
    const { data } = await api.put(`/conversations/${id}`, {
      needsAttention,
    });
    return data.conversation || data;
  },

  toggleArchive: async (
    id: string,
    isArchived: boolean,
  ): Promise<Conversation> => {
    const { data } = await api.put(`/conversations/${id}`, {
      isArchived,
    });
    return data.conversation || data;
  },

  dismissInsight: async (
    id: string,
    insightType: "negativeSentiment" | "slaRisk" | "priority",
  ): Promise<Conversation> => {
    const { data } = await api.post(`/conversations/${id}/dismiss-insight`, {
      insightType,
    });
    return data.conversation || data;
  },
};

// Dashboard API
export const dashboardApi = {
  getMetrics: async (params?: {
    startDate?: string;
    endDate?: string;
    channelId?: string;
  }): Promise<DashboardMetrics> => {
    const { data } = await api.get("/dashboard/metrics", { params });
    // Backend returns { metrics: {...} }, unwrap it
    return data.metrics || data;
  },

  getInsights: async (): Promise<AIInsights> => {
    const { data } = await api.get("/dashboard/insights");
    // Backend returns { insights: {...} }, unwrap it
    return data.insights || data;
  },

  getChannelStats: async (): Promise<ChannelStats[]> => {
    const { data } = await api.get("/dashboard/channels");
    // Backend returns { stats: [...] }, unwrap it
    return data.stats || data;
  },

  getAIPerformance: async (params?: {
    startDate?: string;
    endDate?: string;
    channelId?: string;
  }): Promise<AIPerformanceMetrics> => {
    const { data } = await api.get("/dashboard/ai-performance", { params });
    // Backend returns { performance: {...} }, unwrap it
    return data.performance || data;
  },
};

// Contacts API
export const contactsApi = {
  list: async (params?: {
    channelId?: string;
    search?: string;
    limit?: number;
    offset?: number;
    sortBy?: "name" | "createdAt" | "lastChatDate" | "messageCount";
    sortOrder?: "asc" | "desc";
  }): Promise<{
    contacts: ContactWithStats[];
    total: number;
    limit: number;
    offset: number;
  }> => {
    const { data } = await api.get("/contacts", { params });
    return data;
  },

  update: async (
    contactId: string,
    updates: Omit<Partial<ContactWithStats>, "clientGroupId"> & { clientGroupId?: string | null },
  ): Promise<ContactWithStats> => {
    const { data } = await api.patch(`/contacts/${contactId}`, updates);
    return data;
  },

  refreshProfilePicture: async (
    contactId: string,
  ): Promise<{
    success: boolean;
    profilePictureUrl: string | null;
    contact: any;
  }> => {
    const { data } = await api.post(
      `/contacts/${contactId}/refresh-profile-picture`,
    );
    return data;
  },

  getProfilePicture: async (
    contactId: string,
    refresh = false,
  ): Promise<{ profilePictureUrl: string | null; cached: boolean }> => {
    const { data } = await api.get(`/contacts/${contactId}/profile-picture`, {
      params: { refresh: refresh ? "true" : undefined },
    });
    return data;
  },
};

export const clientGroupsApi = {
  list: async (): Promise<ClientGroup[]> => {
    const { data } = await api.get("/client-groups");
    return data.clientGroups || data;
  },

  create: async (clientGroup: Partial<ClientGroup>): Promise<ClientGroup> => {
    const { data } = await api.post("/client-groups", clientGroup);
    return data.clientGroup || data;
  },

  update: async (id: string, updates: Partial<ClientGroup>): Promise<ClientGroup> => {
    const { data } = await api.put(`/client-groups/${id}`, updates);
    return data.clientGroup || data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/client-groups/${id}`);
  },
};

export const productsApi = {
  list: async (includeInactive = true): Promise<Product[]> => {
    const { data } = await api.get("/products", {
      params: includeInactive ? { includeInactive: "true" } : undefined,
    });
    return data.products || data;
  },

  get: async (id: string): Promise<Product> => {
    const { data } = await api.get(`/products/${id}`);
    return data.product || data;
  },

  create: async (product: Partial<Product>): Promise<Product> => {
    const { data } = await api.post("/products", product);
    return data.product || data;
  },

  update: async (id: string, updates: Partial<Product>): Promise<Product> => {
    const { data } = await api.put(`/products/${id}`, updates);
    return data.product || data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/products/${id}`);
  },
};

// AI Logs API
export interface SkillTaskListItem {
  conversationId: string;
  goalId: string;
  skillSlug: string;
  skillDisplayName?: string;
  status: "active" | "suspended" | "completed";
  createdAt: string;
  suspendedAt?: string;
  completedAt?: string;
  steps: Array<{
    id: string;
    label: string;
    status: string;
    collects?: string;
    collectedValue?: string;
  }>;
  stepsSummary: { completed: number; total: number };
  observations: Record<string, string>;
  tokensApprox: { input: number; output: number; total: number };
  aiMessageCount: number;
  tokensNote?: string;
  contact: {
    name?: string;
    phoneNumber?: string;
    whatsappId?: string;
  };
  assistant: { id?: string; name?: string };
  channel: { id?: string; name?: string };
}

export interface SkillTaskDetail extends SkillTaskListItem {
  messages: Array<{
    id: string;
    content: string;
    contentType: string;
    createdAt: string;
    aiGenerated: boolean;
  }>;
}

export const skillTasksApi = {
  list: async (params?: {
    status?: string;
    skillSlug?: string;
    conversationId?: string;
    channelId?: string;
    createdFrom?: string;
    createdTo?: string;
    completedFrom?: string;
    completedTo?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    tasks: SkillTaskListItem[];
    total: number;
    tokensNote?: string;
  }> => {
    const { data } = await api.get("/skill-tasks", { params });
    return data;
  },

  getDetail: async (
    conversationId: string,
    goalId: string,
  ): Promise<SkillTaskDetail> => {
    const { data } = await api.get(
      `/skill-tasks/${conversationId}/${encodeURIComponent(goalId)}`,
    );
    return data;
  },
};

export const aiLogsApi = {
  getLogs: async (params?: {
    type?: string;
    level?: string;
    conversationId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: any[]; total: number }> => {
    const { data } = await api.get("/ai-logs", { params });
    return data;
  },

  getStats: async (): Promise<{
    total: number;
    byType: Record<string, number>;
    byLevel: Record<string, number>;
    avgDuration: number;
    errorRate: number;
  }> => {
    const { data } = await api.get("/ai-logs/stats");
    return data;
  },

  clearLogs: async (): Promise<void> => {
    await api.delete("/ai-logs");
  },
};

// Skills API
export const skillsApi = {
  list: async (status?: string): Promise<Skill[]> => {
    const params = status ? { status } : {};
    const { data } = await api.get("/skills", { params });
    return data.skills || data;
  },

  get: async (id: string): Promise<Skill> => {
    const { data } = await api.get(`/skills/${id}`);
    return data.skill || data;
  },

  create: async (skill: {
    name: string;
    slug: string;
    description: string;
    triggerHints?: string[];
    storagePath: string;
    hasReferences?: boolean;
    hasExamples?: boolean;
    scripts?: string[];
  }): Promise<Skill> => {
    const { data } = await api.post("/skills", skill);
    return data.skill || data;
  },

  update: async (
    id: string,
    updates: Partial<
      Pick<
        Skill,
        | "name"
        | "description"
        | "triggerHints"
        | "status"
        | "requiredTools"
        | "reminderDelay"
        | "maxReminders"
        | "scheduleEnabled"
        | "scheduleCron"
        | "nickname"
        | "staffRole"
        | "avatarPreset"
        | "customAvatarUrl"
      >
    > & {
      instructions?: string;
      frontmatterYaml?: string;
      argumentHint?: string;
      userInvocable?: boolean;
    },
  ): Promise<Skill> => {
    const { data } = await api.put(`/skills/${id}`, updates);
    return data.skill || data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/skills/${id}`);
  },

  // Legacy: single file upload
  install: async (file: File): Promise<Skill> => {
    const formData = new FormData();
    formData.append("file", file);
    const { data } = await api.post("/skills/install", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data.skill || data;
  },

  // New: zip directory upload
  installZip: async (zipFile: File): Promise<Skill> => {
    const formData = new FormData();
    formData.append("file", zipFile);
    const { data } = await api.post("/skills/install-zip", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data.skill || data;
  },

  bind: async (
    skillId: string,
    assistantId: string,
    staffId?: string,
  ): Promise<void> => {
    await api.post("/skills/bind", {
      skillId,
      assistantId,
      ...(staffId ? { staffId } : {}),
    });
  },

  unbind: async (
    skillId: string,
    assistantId: string,
    staffId?: string,
  ): Promise<void> => {
    await api.post("/skills/unbind", {
      skillId,
      assistantId,
      ...(staffId ? { staffId } : {}),
    });
  },

  // ── Reference management (legacy single-file API) ──
  getReference: async (skillId: string): Promise<string | null> => {
    try {
      const { data } = await api.get(`/skills/${skillId}/reference`);
      return data.content;
    } catch {
      return null;
    }
  },

  saveReference: async (skillId: string, content: string): Promise<Skill> => {
    const { data } = await api.put(`/skills/${skillId}/reference`, { content });
    return data.skill || data;
  },

  uploadReference: async (skillId: string, file: File): Promise<Skill> => {
    const formData = new FormData();
    formData.append("file", file);
    const { data } = await api.post(`/skills/${skillId}/reference/upload`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data.skill || data;
  },

  deleteReference: async (skillId: string): Promise<Skill> => {
    const { data } = await api.delete(`/skills/${skillId}/reference`);
    return data.skill || data;
  },

  // ── references/ folder (multiple .md / .txt) ──
  listReferences: async (
    skillId: string,
  ): Promise<{
    files: { name: string; sizeBytes: number; legacy?: boolean }[];
    legacyRootReference: boolean;
  }> => {
    const { data } = await api.get(`/skills/${skillId}/references`);
    return {
      files: data.files || [],
      legacyRootReference: Boolean(data.legacyRootReference),
    };
  },

  getReferenceDocument: async (
    skillId: string,
    filename: string,
  ): Promise<{ filename: string; content: string }> => {
    const { data } = await api.get(
      `/skills/${skillId}/references/${encodeURIComponent(filename)}`,
    );
    return data;
  },

  saveReferenceDocument: async (
    skillId: string,
    filename: string,
    content: string,
  ): Promise<Skill> => {
    const { data } = await api.put(
      `/skills/${skillId}/references/${encodeURIComponent(filename)}`,
      { content },
    );
    return data.skill || data;
  },

  uploadReferenceDocument: async (skillId: string, file: File): Promise<Skill> => {
    const formData = new FormData();
    formData.append("file", file);
    const { data } = await api.post(`/skills/${skillId}/references/upload`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data.skill || data;
  },

  deleteReferenceDocument: async (skillId: string, filename: string): Promise<Skill> => {
    const { data } = await api.delete(
      `/skills/${skillId}/references/${encodeURIComponent(filename)}`,
    );
    return data.skill || data;
  },

  renameReferenceDocument: async (
    skillId: string,
    filename: string,
    newName: string,
  ): Promise<Skill> => {
    const { data } = await api.patch(
      `/skills/${skillId}/references/${encodeURIComponent(filename)}`,
      { newName },
    );
    return data.skill || data;
  },

  // ── Skill assets (templates, documents under assets/) ──
  listAssets: async (skillId: string): Promise<{ name: string; sizeBytes: number }[]> => {
    const { data } = await api.get(`/skills/${skillId}/assets`);
    return data.files || [];
  },

  uploadAsset: async (
    skillId: string,
    file: File,
    filenameOverride?: string,
  ): Promise<{ name: string; sizeBytes: number }[]> => {
    const formData = new FormData();
    formData.append("file", file);
    if (filenameOverride?.trim()) {
      formData.append("filename", filenameOverride.trim());
    }
    const { data } = await api.post(`/skills/${skillId}/assets/upload`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data.files || [];
  },

  deleteAsset: async (
    skillId: string,
    filename: string,
  ): Promise<{ name: string; sizeBytes: number }[]> => {
    const { data } = await api.delete(
      `/skills/${skillId}/assets/${encodeURIComponent(filename)}`,
    );
    return data.files || [];
  },

  renameAsset: async (
    skillId: string,
    filename: string,
    newName: string,
  ): Promise<{ name: string; sizeBytes: number }[]> => {
    const { data } = await api.put(`/skills/${skillId}/assets/${encodeURIComponent(filename)}`, {
      newName,
    });
    return data.files || [];
  },

  // ── Script management ──
  listScripts: async (skillId: string): Promise<string[]> => {
    const { data } = await api.get(`/skills/${skillId}/scripts`);
    return data.scripts || [];
  },

  getScript: async (skillId: string, filename: string): Promise<{ filename: string; content: string }> => {
    const { data } = await api.get(`/skills/${skillId}/scripts/${filename}`);
    return data;
  },

  createScript: async (skillId: string, filename: string, content: string): Promise<Skill> => {
    const { data } = await api.post(`/skills/${skillId}/scripts`, { filename, content });
    return data.skill || data;
  },

  uploadScript: async (skillId: string, file: File): Promise<Skill> => {
    const formData = new FormData();
    formData.append("file", file);
    const { data } = await api.post(`/skills/${skillId}/scripts/upload`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data.skill || data;
  },

  deleteScript: async (skillId: string, filename: string): Promise<Skill> => {
    const { data } = await api.delete(`/skills/${skillId}/scripts/${filename}`);
    return data.skill || data;
  },
};

export const scheduledJobsApi = {
  list: async (params?: {
    assistantId?: string;
    enabled?: boolean;
    search?: string;
  }): Promise<{ jobs: ScheduledJob[]; stats: ScheduledJobsStats }> => {
    const { data } = await api.get("/scheduled-jobs", { params });
    return data;
  },

  get: async (id: string): Promise<ScheduledJob> => {
    const { data } = await api.get(`/scheduled-jobs/${id}`);
    return data.job;
  },

  create: async (
    body: Partial<ScheduledJob> & { name: string; assistantId: string; taskPrompt: string },
  ): Promise<ScheduledJob> => {
    const { data } = await api.post("/scheduled-jobs", body);
    return data.job;
  },

  update: async (
    id: string,
    body: Partial<ScheduledJob>,
  ): Promise<ScheduledJob> => {
    const { data } = await api.patch(`/scheduled-jobs/${id}`, body);
    return data.job;
  },

  remove: async (id: string): Promise<void> => {
    await api.delete(`/scheduled-jobs/${id}`);
  },

  clone: async (id: string): Promise<ScheduledJob> => {
    const { data } = await api.post(`/scheduled-jobs/${id}/clone`);
    return data.job;
  },

  run: async (
    id: string,
    options?: { ifDue?: boolean },
  ): Promise<{ ok: boolean; runId?: string; error?: string; skipped?: boolean }> => {
    const { data } = await api.post(`/scheduled-jobs/${id}/run`, options ?? {});
    return data;
  },

  listRuns: async (
    id: string,
    params?: { limit?: number; offset?: number },
  ): Promise<{ runs: ScheduledJobRun[]; total: number }> => {
    const { data } = await api.get(`/scheduled-jobs/${id}/runs`, { params });
    return data;
  },
};

// Google OAuth API
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

export const googleApi = {
  getStatus: async (): Promise<{
    connected: boolean;
    email?: string;
    scopes?: string[];
    connectedAt?: string;
  }> => {
    const { data } = await api.get("/google/status");
    return data;
  },

  disconnect: async (): Promise<void> => {
    await api.delete("/google/disconnect");
  },

  getConnectUrl: (): string => {
    const token = localStorage.getItem("token");
    return `${API_BASE}/google/connect?token=${token}`;
  },
};

export default api;
