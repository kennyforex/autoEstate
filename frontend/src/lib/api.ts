import axios, { AxiosError } from "axios";
import type { InternalAxiosRequestConfig } from "axios";
import type {
  User,
  Company,
  Assistant,
  Channel,
  Conversation,
  Message,
  DashboardMetrics,
  AIInsights,
  ChannelStats,
  AIPerformanceMetrics,
  InboxCounts,
  Tag,
  LoginCredentials,
  RegisterData,
  AuthResponse,
  PaginatedResponse,
  ContactWithStats,
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

// Assistants API
export const assistantsApi = {
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
    updates: Partial<Conversation>,
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

// AI Logs API
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

export default api;
