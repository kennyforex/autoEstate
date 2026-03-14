import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  InboxSidebar,
  ConversationList,
  ConversationView,
  DetailsPanel,
} from "../components/inbox";
import { ToastContainer, useToasts } from "../components/common";
import { conversationsApi, channelsApi } from "../lib/api";
import {
  getSocket,
  subscribeToConversation,
  unsubscribeFromConversation,
} from "../lib/socket";
import type {
  Conversation,
  InboxCounts,
  AIInsights,
  Message,
  Channel,
} from "../lib/types";

/**
 * Check if a conversation matches the current filter criteria
 * Used to remove conversations from the list when they no longer match
 */
const conversationMatchesFilter = (
  conversation: Conversation,
  filter: string,
): boolean => {
  switch (filter) {
    case "all":
      // 'all' shows open, non-archived conversations
      return conversation.status === "open" && !conversation.isArchived;
    case "aiHandling":
      return (
        conversation.aiAutoReply === true &&
        conversation.status === "open" &&
        !conversation.isArchived
      );
    case "manual":
      return (
        conversation.aiAutoReply === false &&
        conversation.status === "open" &&
        !conversation.isArchived
      );
    case "attention":
      return (
        conversation.needsAttention === true &&
        conversation.status === "open" &&
        !conversation.isArchived
      );
    case "resolved":
      return conversation.status === "resolved" && !conversation.isArchived;
    case "spam":
      return conversation.status === "spam" && !conversation.isArchived;
    case "archived":
      return conversation.isArchived === true;
    case "priority":
      return (
        (conversation.aiSignals?.priority ?? 0) >= 7 &&
        conversation.status === "open"
      );
    case "negative":
      return (
        conversation.aiSignals?.sentiment === "negative" &&
        conversation.status === "open"
      );
    case "slaRisk":
      return (
        conversation.aiSignals?.slaRisk === true &&
        conversation.status === "open"
      );
    case "assignedToMe":
      // Can't check this client-side without knowing the current user ID
      // Keep the conversation and let the server filter handle it on next fetch
      return true;
    default:
      if (filter && filter.startsWith("tag:")) {
        const tagId = filter.split(":")[1];
        return (
          conversation.tags?.some((tag) => tag && tag._id === tagId) ?? false
        );
      }
      return true;
  }
};

export const Inbox: React.FC = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(
    null,
  );
  const [selectedConversation, setSelectedConversation] =
    useState<Conversation | null>(null);
  const [counts, setCounts] = useState<InboxCounts | null>(null);
  const [insights, setInsights] = useState<AIInsights | null>(null);
  const [activeFilter, setActiveFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [showDetails, setShowDetails] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toasts, dismissToast, showError, showInfo } = useToasts();

  // Use refs to avoid useCallback dependency issues
  const showErrorRef = useRef(showError);
  const showInfoRef = useRef(showInfo);
  useEffect(() => {
    showErrorRef.current = showError;
    showInfoRef.current = showInfo;
  }, [showError, showInfo]);

  const fetchConversations = useCallback(async () => {
    try {
      setError(null);
      const params: Record<string, string | boolean | number> = {
        limit: 50,
        sortBy: "lastMessageAt",
        sortOrder: "desc",
      };

      // Add channel filter if selected
      if (selectedChannelId) {
        params.channelId = selectedChannelId;
      }

      // Apply filters
      switch (activeFilter) {
        case "all":
          // Show open, non-archived conversations
          params.status = "open";
          params.isArchived = false;
          break;
        case "aiHandling":
          params.aiAutoReply = true;
          params.status = "open";
          params.isArchived = false;
          break;
        case "manual":
          params.aiAutoReply = false;
          params.status = "open";
          params.isArchived = false;
          break;
        case "attention":
          // Use manual needsAttention flag instead of AI-derived slaRisk
          params.needsAttention = true;
          params.status = "open";
          params.isArchived = false;
          break;
        case "assignedToMe":
          // Will be handled by backend with current user
          params.assignedToMe = true;
          params.status = "open";
          params.isArchived = false;
          break;
        case "resolved":
          params.status = "resolved";
          params.isArchived = false;
          break;
        case "spam":
          params.status = "spam";
          params.isArchived = false;
          break;
        case "archived":
          params.isArchived = true;
          break;
        // AI Insights filters
        case "priority":
          params.priority = true;
          params.status = "open";
          params.isArchived = false;
          break;
        case "negative":
          params.sentiment = "negative";
          params.status = "open";
          params.isArchived = false;
          break;
        case "slaRisk":
          params.slaRisk = true;
          params.status = "open";
          params.isArchived = false;
          break;
        default:
          if (activeFilter && activeFilter.startsWith("tag:")) {
            params.tagId = activeFilter.split(":")[1];
            params.status = "open";
            params.isArchived = false;
          } else {
            // Default to open, non-archived
            params.status = "open";
            params.isArchived = false;
          }
          break;
      }

      console.log("Fetching conversations with params:", params);
      const response = await conversationsApi.list(params);
      console.log("API response:", response);
      // Backend returns {conversations: [...]} not {data: [...]}
      const conversationsData =
        (response as any).conversations || response.data || [];
      console.log("Conversations data:", conversationsData);
      // #region agent log
      conversationsData.forEach((conv: Conversation) => {
        fetch('http://127.0.0.1:7243/ingest/bb48ccbd-de00-4a6c-bf66-33f85d0c4c54',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Inbox.tsx:204',message:'fetchConversations - unreadCount from backend',data:{conversationId:conv._id,unreadCount:conv.unreadCount,contactName:typeof conv.contactId === 'object' ? conv.contactId.name : 'unknown'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      });
      // #endregion
      setConversations(conversationsData);
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.error || err?.message || "Unknown error";
      console.error("Failed to fetch conversations:", err);
      setError(`Failed to load conversations: ${errorMessage}`);
      showErrorRef.current("Failed to load conversations", errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [activeFilter, selectedChannelId]);

  const fetchCounts = useCallback(async () => {
    try {
      const [countsData, insightsData] = await Promise.all([
        conversationsApi.getCounts(selectedChannelId),
        conversationsApi.getInsights(selectedChannelId),
      ]);
      setCounts(countsData);
      setInsights(insightsData);
    } catch (error) {
      console.error("Failed to fetch counts:", error);
    }
  }, [selectedChannelId]);

  const fetchChannels = useCallback(async () => {
    try {
      const data = await channelsApi.list();
      setChannels(data);
    } catch (error) {
      console.error("Failed to fetch channels:", error);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
    fetchCounts();
  }, [fetchConversations, fetchCounts]);

  // Clear selected conversation when channel changes
  useEffect(() => {
    setSelectedConversation(null);
  }, [selectedChannelId]);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  // Set up socket listeners
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleNewMessage = (message: Message) => {
      console.log('[Socket] Received message:new event', { 
        messageId: message._id, 
        conversationId: message.conversationId,
        sender: message.sender,
        selectedConversationId: selectedConversation?._id 
      });
      // Update conversation in list
      setConversations((prev) => {
        const exists = prev.some((conv) => conv._id === message.conversationId);

        if (exists) {
          return prev.map((conv) => {
            if (conv._id === message.conversationId) {
              const oldUnreadCount = conv.unreadCount || 0;
              const newUnreadCount = oldUnreadCount + 1;
              // #region agent log
              fetch('http://127.0.0.1:7243/ingest/bb48ccbd-de00-4a6c-bf66-33f85d0c4c54',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Inbox.tsx:274',message:'handleNewMessage - incrementing unreadCount',data:{conversationId:conv._id,oldUnreadCount,newUnreadCount,messageSender:message.sender,selectedConversationId:selectedConversation?._id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
              // #endregion
              return {
                ...conv,
                lastMessageAt: message.createdAt,
                unreadCount: newUnreadCount,
                messages: [...(conv.messages || []), message],
              };
            }
            return conv;
          });
        } else {
          // New conversation - refresh the list
          fetchConversations();
          return prev;
        }
      });

      // Update selected conversation if it's the same
      if (selectedConversation?._id === message.conversationId) {
        setSelectedConversation((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            messages: [...(prev.messages || []), message],
          };
        });
      } else {
        // Show notification for new message in other conversations
        showInfoRef.current(
          "New message received",
          `From: ${message.sender === "customer" ? "Customer" : "Agent"}`,
        );
      }
    };

    const handleConversationUpdate = (
      update: Partial<Conversation> & { _id: string },
    ) => {
      // Check if status is being updated - if so, refresh counts
      const statusUpdated = update.status !== undefined;
      
      setConversations((prev) => {
        const existsInList = prev.some((conv) => conv._id === update._id);

        if (existsInList) {
          // Update existing conversation and filter out if it no longer matches
          return prev
            .map((conv) => {
              if (conv._id === update._id) {
                const oldUnreadCount = conv.unreadCount;
                const newUnreadCount = update.unreadCount;
                // #region agent log
                fetch('http://127.0.0.1:7243/ingest/bb48ccbd-de00-4a6c-bf66-33f85d0c4c54',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Inbox.tsx:318',message:'handleConversationUpdate - updating unreadCount',data:{conversationId:conv._id,oldUnreadCount,newUnreadCount,updateHasUnreadCount:update.unreadCount !== undefined},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                // #endregion
                return { ...conv, ...update };
              }
              return conv;
            })
            .filter((conv) => conversationMatchesFilter(conv, activeFilter));
        } else {
          // Conversation not in list - check if update would make it match current filter
          // Create a partial conversation object to check filter match
          const partialConv = {
            status: "open",
            isArchived: false,
            aiAutoReply: true,
            needsAttention: false,
            aiSignals: { priority: 0, sentiment: "neutral", slaRisk: false },
            ...update,
          } as Conversation;

          if (conversationMatchesFilter(partialConv, activeFilter)) {
            // Conversation would now match the filter - refetch the list to include it
            fetchConversations();
          }
          return prev;
        }
      });

      if (selectedConversation?._id === update._id) {
        setSelectedConversation((prev) =>
          prev ? { ...prev, ...update } : prev,
        );
      }

      // Refresh counts if status was updated
      if (statusUpdated) {
        fetchCounts();
      }
    };

    socket.on("message:new", handleNewMessage);
    socket.on("conversation:update", handleConversationUpdate);

    return () => {
      socket.off("message:new", handleNewMessage);
      socket.off("conversation:update", handleConversationUpdate);
    };
  }, [selectedConversation?._id, fetchConversations, activeFilter, fetchCounts]);

  // Subscribe to selected conversation
  useEffect(() => {
    if (selectedConversation) {
      subscribeToConversation(selectedConversation._id);
      return () => {
        unsubscribeFromConversation(selectedConversation._id);
      };
    }
  }, [selectedConversation?._id]);

  const handleSelectConversation = async (conversation: Conversation) => {
    try {
      // Fetch full conversation with messages
      const fullConversation = await conversationsApi.get(
        conversation._id,
        true,
      );
      setSelectedConversation(fullConversation);

      // Mark as read
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/bb48ccbd-de00-4a6c-bf66-33f85d0c4c54',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Inbox.tsx:382',message:'handleSelectConversation - calling markAsRead',data:{conversationId:conversation._id,unreadCountBeforeMark:conversation.unreadCount},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      await conversationsApi.markAsRead(conversation._id);
    } catch (error) {
      console.error("Failed to load conversation:", error);
    }
  };

  const handleConversationUpdate = (updated: Conversation) => {
    // Merge the update with existing conversation to preserve messages
    setSelectedConversation((prev) => {
      if (!prev) return updated;
      // Keep existing messages if the update doesn't have them
      return {
        ...prev,
        ...updated,
        messages: updated.messages || prev.messages,
      };
    });
    // Update conversations list and handle filter matching
    setConversations((prev) => {
      const existsInList = prev.some((conv) => conv._id === updated._id);
      const matchesFilter = conversationMatchesFilter(updated, activeFilter);

      if (existsInList) {
        if (matchesFilter) {
          // Update the conversation in the list
          return prev.map((conv) =>
            conv._id === updated._id ? { ...conv, ...updated } : conv,
          );
        } else {
          // Remove from list as it no longer matches
          return prev.filter((conv) => conv._id !== updated._id);
        }
      } else {
        if (matchesFilter) {
          // Add to list as it now matches the filter
          return [updated, ...prev];
        } else {
          // Not in list and doesn't match - no change needed
          return prev;
        }
      }
    });
  };

  const filteredConversations = searchQuery
    ? (conversations || []).filter((conv) => {
        const contact =
          typeof conv.contactId === "object" ? conv.contactId : null;
        const searchLower = searchQuery.toLowerCase();
        return (
          contact?.name?.toLowerCase().includes(searchLower) ||
          contact?.phoneNumber?.toLowerCase().includes(searchLower) ||
          contact?.whatsappId?.toLowerCase().includes(searchLower) ||
          conv.subject?.toLowerCase().includes(searchLower)
        );
      })
    : conversations || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      <div className="flex h-screen overflow-hidden">
        {/* Inbox Sidebar - Categories & Filters */}
        <InboxSidebar
          counts={counts || undefined}
          insights={insights || undefined}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          channels={channels}
          selectedChannelId={selectedChannelId}
          onChannelChange={setSelectedChannelId}
        />

        {/* Conversation List Panel */}
        <ConversationList
          conversations={filteredConversations}
          selectedId={selectedConversation?._id}
          onSelect={handleSelectConversation}
          activeFilter={activeFilter}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        {/* Conversation View */}
        {error ? (
          <div className="flex-1 flex items-center justify-center bg-surface">
            <div className="text-center max-w-md">
              <div className="w-16 h-16 bg-error/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">⚠️</span>
              </div>
              <h3 className="text-lg font-medium text-text-primary mb-1">
                Error Loading Inbox
              </h3>
              <p className="text-text-secondary mb-4">{error}</p>
              <button
                onClick={() => {
                  setError(null);
                  setIsLoading(true);
                  fetchConversations();
                }}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        ) : selectedConversation ? (
          <>
            <ConversationView
              conversation={selectedConversation}
              onMessageSent={fetchConversations}
              onAvatarClick={() => setShowDetails(true)}
              onUpdate={handleConversationUpdate}
              onCountsChange={fetchCounts}
            />

            {/* Details Panel */}
            {showDetails && (
              <DetailsPanel
                conversation={selectedConversation}
                onClose={() => setShowDetails(false)}
                onUpdate={handleConversationUpdate}
                onCountsChange={fetchCounts}
              />
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-surface">
            <div className="text-center">
              <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">💬</span>
              </div>
              <h3 className="text-lg font-medium text-text-primary mb-1">
                {filteredConversations.length === 0
                  ? "No conversations yet"
                  : "Select a conversation"}
              </h3>
              <p className="text-text-secondary">
                {filteredConversations.length === 0
                  ? "Waiting for incoming WhatsApp messages..."
                  : "Choose a conversation from the list to view messages"}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
};
