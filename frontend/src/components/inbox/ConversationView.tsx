import React, { useEffect, useRef, useState } from "react";
import { format, isSameDay } from "date-fns";
import {
  Star,
  Archive,
  MoreHorizontal,
  Sparkles,
  Send,
  Paperclip,
  Loader2,
  X,
  Image as ImageIcon,
  FileText,
  Film,
  File,
  CheckCircle,
  Shield,
  RotateCcw,
  Tag,
  Plus,
  Check,
} from "lucide-react";
import { Avatar, Button } from "../common";
import type {
  Conversation,
  Message,
  Contact,
  Tag as TagType,
  Channel,
  Assistant,
} from "../../lib/types";
import { conversationsApi, uploadApi, tagsApi } from "../../lib/api";
import { getSocket } from "../../lib/socket";

interface ConversationViewProps {
  conversation: Conversation;
  onMessageSent?: () => void;
  onAvatarClick?: () => void;
  onUpdate?: (conversation: Conversation) => void;
  onCountsChange?: () => void;
}

const formatDateSeparator = (date: Date): string => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (isSameDay(date, today)) return "Today";
  if (isSameDay(date, yesterday)) return "Yesterday";
  return format(date, "MMMM d, yyyy");
};

/** Strip Markdown to plain text so AI replies display as normal text, not formatted. */
function plainTextFromMarkdown(text: string): string {
  if (!text || typeof text !== "string") return text;
  return text
    .replace(/^#{1,6}\s+/gm, "") // headings
    .replace(/\*\*(.+?)\*\*/g, "$1") // bold
    .replace(/\*(.+?)\*/g, "$1") // italic
    .replace(/__(.+?)__/g, "$1") // bold
    .replace(/_(.+?)_/g, "$1") // italic
    .replace(/`([^`]+)`/g, "$1") // inline code
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/^```\w*\n?|```$/g, "").trim()) // fenced code
    .replace(/^[-*]\s+/gm, "• ") // list items -> simple bullet
    .replace(/^\d+\.\s+/gm, "") // numbered list prefix
    .trim();
}

interface MessageBubbleProps {
  message: Message;
  onImageDoubleClick?: (imageUrl: string) => void;
  assistantName?: string;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  onImageDoubleClick,
  assistantName,
}) => {
  const isCustomer = message.sender === "customer";
  const isAI = message.sender === "ai";

  // Get media URL through our backend proxy (Evolution API decrypts WhatsApp media)
  const getMediaUrl = (): string | undefined => {
    const { contentType, mediaUrl, _id, evolutionMessageId } = message;
    const isMediaType = ["image", "video", "audio", "document", "gif", "sticker"].includes(contentType);
    // For media messages, use our backend proxy if we have an evolutionMessageId or mediaUrl
    if (isMediaType && (evolutionMessageId || mediaUrl)) {
      // VITE_API_URL already includes /api (e.g. https://ffcs.hkfinch.com/api)
      return `${import.meta.env.VITE_API_URL || "http://localhost:3001/api"}/media/${_id}`;
    }
    return undefined;
  };

  const renderMediaContent = () => {
    const { contentType, content } = message;
    const proxiedUrl = getMediaUrl();

    // Check if there's a meaningful caption (not just the placeholder)
    const hasCaption =
      content &&
      content !== "[Image]" &&
      content !== "[Video]" &&
      content !== "[Audio]";

    // Render media based on content type
    if (
      proxiedUrl &&
      (contentType === "image" ||
        contentType === "gif" ||
        contentType === "sticker")
    ) {
      return (
        <div className="mb-2">
          <img
            src={proxiedUrl}
            alt={content || "Media"}
            className="max-w-full rounded-lg max-h-64 object-contain cursor-pointer"
            onDoubleClick={() => onImageDoubleClick?.(proxiedUrl)}
            onError={(e) => {
              // Fallback if image fails to load
              const target = e.target as HTMLImageElement;
              target.style.display = "none";
              target.nextElementSibling?.classList.remove("hidden");
            }}
          />
          <p className="text-sm text-text-secondary italic hidden">{content}</p>
          {hasCaption && (
            <p className="text-sm mt-2 whitespace-pre-wrap">
              {isAI ? plainTextFromMarkdown(content) : content}
            </p>
          )}
        </div>
      );
    }

    if (proxiedUrl && contentType === "video") {
      return (
        <div className="mb-2">
          <video
            src={proxiedUrl}
            controls
            className="max-w-full rounded-lg max-h-64"
            onError={(e) => {
              const target = e.target as HTMLVideoElement;
              target.style.display = "none";
            }}
          >
            <p className="text-sm text-text-secondary italic">[Video]</p>
          </video>
        </div>
      );
    }

    if (proxiedUrl && contentType === "audio") {
      return (
        <div className="mb-2">
          <audio src={proxiedUrl} controls className="max-w-full" />
        </div>
      );
    }

    if (proxiedUrl && contentType === "document") {
      return (
        <div className="mb-2">
          <a
            href={proxiedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-primary hover:underline"
          >
            <Paperclip className="w-4 h-4" />
            <span className="text-sm">{content || "Document"}</span>
          </a>
        </div>
      );
    }

    // Default: render text content (AI replies as plain text, no Markdown)
    const displayContent = isAI ? plainTextFromMarkdown(content || "") : (content || "");
    return <p className="text-sm whitespace-pre-wrap">{displayContent}</p>;
  };

  return (
    <div
      className={`flex ${isCustomer ? "justify-start" : "justify-end"} mb-4`}
    >
      <div
        className={`flex flex-col max-w-[70%] ${isCustomer ? "items-start" : "items-end"}`}
      >
        {/* Sender label above bubble */}
        {!isCustomer && (
          <div className="flex items-center gap-1.5 mb-1">
            {isAI && <Sparkles className="w-3 h-3 text-text-secondary" />}
            <span className="text-xs text-text-secondary">
              {isAI ? assistantName || "AI Agent" : "You"}
            </span>
          </div>
        )}
        <div
          className={`
            rounded-lg p-4
            ${
              isCustomer
                ? "bg-gray-100 text-text-primary"
                : "bg-dark-surface text-white"
            }
          `}
        >
          {renderMediaContent()}
        </div>
        <p className="text-xs text-text-secondary mt-1">
          {format(new Date(message.createdAt), "h:mm a")}
        </p>
      </div>
    </div>
  );
};

export const ConversationView: React.FC<ConversationViewProps> = ({
  conversation,
  onMessageSent,
  onAvatarClick,
  onUpdate,
  onCountsChange,
}) => {
  const [messages, setMessages] = useState<Message[]>(
    conversation.messages || [],
  );
  const [newMessage, setNewMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isAITyping, setIsAITyping] = useState(false);
  const [aiStatus, setAiStatus] = useState<{
    status: "analyzing_image" | "analyzing_audio" | "image_analyzed" | "thinking" | "done" | null;
    result?: string;
  }>({ status: null });
  const [pendingFile, setPendingFile] = useState<{
    preview: string;
    base64: string;
    mimeType: string;
    fileName: string;
    fileType: "image" | "video" | "document";
  } | null>(null);
  const [popupImageUrl, setPopupImageUrl] = useState<string | null>(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showTagMenu, setShowTagMenu] = useState(false);
  const [availableTags, setAvailableTags] = useState<TagType[]>([]);
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [newTagLabel, setNewTagLabel] = useState("");
  const [newTagColor, setNewTagColor] = useState("#3B82F6");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const tagMenuRef = useRef<HTMLDivElement>(null);
  const newTagInputRef = useRef<HTMLInputElement>(null);

  const TAG_COLORS = [
    "#3B82F6",
    "#10B981",
    "#F59E0B",
    "#EF4444",
    "#8B5CF6",
    "#EC4899",
    "#06B6D4",
    "#F97316",
  ];

  const contact = conversation.contactId as Contact;
  const contactName =
    contact?.name || contact?.phoneNumber || contact?.whatsappId || "Unknown";

  // Extract assistant name from channelId
  const channel = conversation.channelId as Channel;
  const assistant =
    typeof channel?.assistantId === "object" ? channel.assistantId : undefined;
  const assistantName = assistant?.name;

  useEffect(() => {
    setMessages(conversation.messages || []);
  }, [conversation]);

  // Scroll to bottom immediately when switching conversations
  useEffect(() => {
    // Use setTimeout to ensure DOM has rendered with new messages
    const timeoutId = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "instant" });
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [conversation._id]);

  // Listen for AI typing indicator and status
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleAITyping = (data: {
      conversationId: string;
      isTyping: boolean;
    }) => {
      if (data.conversationId === conversation._id) {
        setIsAITyping(data.isTyping);
      }
    };

    const handleAIStatus = (data: {
      conversationId: string;
      status: "analyzing_image" | "analyzing_audio" | "image_analyzed" | "thinking" | "done";
      result?: string;
    }) => {
      if (data.conversationId === conversation._id) {
        console.log("[AI Status]", data.status);
        if (data.status === "done") {
          setAiStatus({ status: null });
        } else {
          setAiStatus({ status: data.status, result: data.result });
        }
      }
    };

    socket.on("ai:typing", handleAITyping);
    socket.on("ai:status", handleAIStatus);

    // Reset typing indicator and status when conversation changes
    setIsAITyping(false);
    setAiStatus({ status: null });

    return () => {
      socket.off("ai:typing", handleAITyping);
      socket.off("ai:status", handleAIStatus);
    };
  }, [conversation._id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isAITyping, aiStatus]);

  // Click outside handler for dropdown menus
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        moreMenuRef.current &&
        !moreMenuRef.current.contains(event.target as Node)
      ) {
        setShowMoreMenu(false);
      }
      if (
        tagMenuRef.current &&
        !tagMenuRef.current.contains(event.target as Node)
      ) {
        setShowTagMenu(false);
        resetTagForm();
      }
    };

    if (showMoreMenu || showTagMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [showMoreMenu, showTagMenu]);

  // Fetch available tags when tag menu opens
  useEffect(() => {
    if (showTagMenu) {
      fetchTags();
    }
  }, [showTagMenu]);

  // Focus input when creating new tag
  useEffect(() => {
    if (isCreatingTag && newTagInputRef.current) {
      newTagInputRef.current.focus();
    }
  }, [isCreatingTag]);

  const fetchTags = async () => {
    try {
      const tags = await tagsApi.list();
      // Sort alphabetically
      setAvailableTags(tags.sort((a, b) => a.label.localeCompare(b.label)));
    } catch (error) {
      console.error("Failed to fetch tags:", error);
    }
  };

  const handleToggleTag = async (tagId: string) => {
    try {
      const currentTags = conversation.tags || [];
      const hasTag = currentTags.some((t) => t && t._id === tagId);

      let updatedTags: string[];
      if (hasTag) {
        updatedTags = currentTags
          .filter((t) => t && t._id !== tagId)
          .map((t) => t._id);
      } else {
        updatedTags = [...currentTags.map((t) => t._id), tagId];
      }

      const updated = await conversationsApi.update(conversation._id, {
        tags: updatedTags,
      });
      onUpdate?.(updated);
      onCountsChange?.();
    } catch (error) {
      console.error("Failed to toggle tag:", error);
    }
  };

  const handleCreateTag = async () => {
    if (!newTagLabel.trim()) return;
    try {
      const newTag = await tagsApi.create({
        label: newTagLabel.trim(),
        color: newTagColor,
      });
      if (newTag && newTag._id) {
        await handleToggleTag(newTag._id);
        resetTagForm();
        fetchTags();
      }
    } catch (error) {
      console.error("Failed to create tag:", error);
    }
  };

  const handleEditTag = async () => {
    if (!newTagLabel.trim() || !editingTagId) return;
    try {
      await tagsApi.update(editingTagId, {
        label: newTagLabel.trim(),
        color: newTagColor,
      });
      resetTagForm();
      fetchTags();
      onCountsChange?.();
    } catch (error) {
      console.error("Failed to update tag:", error);
    }
  };

  const handleDeleteTag = async (tagId: string) => {
    if (!confirm("Delete this tag? It will be removed from all conversations."))
      return;
    try {
      await tagsApi.delete(tagId);
      fetchTags();
      onCountsChange?.();
      // Refresh conversation to update tags
      const updated = await conversationsApi.get(conversation._id, false);
      onUpdate?.(updated);
    } catch (error) {
      console.error("Failed to delete tag:", error);
    }
  };

  const startEditTag = (tag: TagType) => {
    setEditingTagId(tag._id);
    setNewTagLabel(tag.label);
    setNewTagColor(tag.color || "#3B82F6");
    setIsCreatingTag(false);
  };

  const resetTagForm = () => {
    setNewTagLabel("");
    setNewTagColor("#3B82F6");
    setIsCreatingTag(false);
    setEditingTagId(null);
  };

  // Action handlers
  const handleToggleAttention = async () => {
    try {
      const updated = await conversationsApi.update(conversation._id, {
        needsAttention: !conversation.needsAttention,
      });
      onUpdate?.(updated);
      onCountsChange?.();
    } catch (error) {
      console.error("Failed to toggle attention:", error);
    }
  };

  const handleToggleArchive = async () => {
    try {
      const updated = await conversationsApi.update(conversation._id, {
        isArchived: !conversation.isArchived,
      });
      onUpdate?.(updated);
      onCountsChange?.();
    } catch (error) {
      console.error("Failed to toggle archive:", error);
    }
  };

  const handleMarkResolved = async () => {
    try {
      // resolvedBy is auto-detected by backend based on lastMessageSender
      const updated = await conversationsApi.update(conversation._id, {
        status: "resolved",
      });
      onUpdate?.(updated);
      onCountsChange?.();
      setShowMoreMenu(false);
    } catch (error) {
      console.error("Failed to mark as resolved:", error);
    }
  };

  const handleMarkSpam = async () => {
    try {
      const updated = await conversationsApi.update(conversation._id, {
        status: "spam",
      });
      onUpdate?.(updated);
      onCountsChange?.();
      setShowMoreMenu(false);
    } catch (error) {
      console.error("Failed to mark as spam:", error);
    }
  };

  const handleReopen = async () => {
    try {
      const updated = await conversationsApi.update(conversation._id, {
        status: "open",
      });
      onUpdate?.(updated);
      onCountsChange?.();
      setShowMoreMenu(false);
    } catch (error) {
      console.error("Failed to reopen:", error);
    }
  };

  // Determine file type category from mime type
  const getFileType = (mimeType: string): "image" | "video" | "document" => {
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("video/")) return "video";
    return "document";
  };

  // Handle file selection from file picker
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size - different limits for different types
    // Videos/large media: WhatsApp API has ~10MB limit for base64
    // Documents: can be larger
    const isVideo = file.type.startsWith("video/");
    const maxSize = isVideo ? 10 * 1024 * 1024 : 25 * 1024 * 1024;

    if (file.size > maxSize) {
      if (isVideo) {
        alert(
          "Video files must be less than 10MB due to WhatsApp limitations. Please compress or shorten the video.",
        );
      } else {
        alert("File size must be less than 25MB");
      }
      return;
    }

    // Convert to base64
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1]; // Remove data:...;base64, prefix
      setPendingFile({
        preview: result,
        base64,
        mimeType: file.type,
        fileName: file.name,
        fileType: getFileType(file.type),
      });
    };
    reader.readAsDataURL(file);

    // Reset the input so the same file can be selected again
    e.target.value = "";
  };

  // Handle paste event for images
  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;

    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;

        // Convert to base64
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(",")[1]; // Remove data:image/...;base64, prefix
          setPendingFile({
            preview: result,
            base64,
            mimeType: file.type,
            fileName: file.name || "pasted-image.png",
            fileType: "image",
          });
        };
        reader.readAsDataURL(file);
        break;
      }
    }
  };

  const handleSend = async () => {
    if ((!newMessage.trim() && !pendingFile) || isSending) return;

    setIsSending(true);
    try {
      let message: Message;

      if (pendingFile) {
        // Upload file and send
        const { url } = await uploadApi.uploadFile(
          pendingFile.base64,
          pendingFile.mimeType,
          pendingFile.fileName,
        );
        const contentTypeMap: Record<string, string> = {
          image: "image",
          video: "video",
          document: "document",
        };
        const defaultCaption =
          pendingFile.fileType === "image"
            ? "[Image]"
            : pendingFile.fileType === "video"
              ? "[Video]"
              : `[${pendingFile.fileName}]`;
        message = await conversationsApi.sendMessage(
          conversation._id,
          newMessage.trim() || defaultCaption,
          contentTypeMap[pendingFile.fileType],
          url,
          pendingFile.fileName,
        );
        setPendingFile(null);
      } else {
        // Send text message
        message = await conversationsApi.sendMessage(
          conversation._id,
          newMessage.trim(),
        );
      }

      setMessages((prev) => [...prev, message]);
      setNewMessage("");
      onMessageSent?.();
    } catch (error) {
      console.error("Failed to send message:", error);
      // Show error to user for debugging
      alert(
        `Failed to send: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setIsSending(false);
      // Refocus the textarea after sending
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 0);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-white">
      {/* Header */}
      <div className="h-[72px] flex items-center justify-between px-6 border-b border-border">
        <div className="flex items-center gap-3">
          <button
            onClick={onAvatarClick}
            className="cursor-pointer hover:opacity-80 transition-opacity"
            title="View details"
          >
            <Avatar src={contact?.avatar} name={contactName} size="md" />
          </button>
          <div>
            <h3 className="font-semibold text-text-primary">{contactName}</h3>
            <p className="text-sm text-text-secondary">
              {contact?.email ||
                contact?.phoneNumber ||
                contact?.whatsappId ||
                ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={
              conversation.status === "resolved"
                ? handleReopen
                : handleMarkResolved
            }
            title={
              conversation.status === "resolved"
                ? "Reopen conversation"
                : "Mark as resolved"
            }
          >
            {conversation.status === "resolved" ? (
              <RotateCcw className="w-4 h-4 text-primary" />
            ) : (
              <CheckCircle className="w-4 h-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggleAttention}
            title={
              conversation.needsAttention
                ? "Remove attention"
                : "Mark as attention"
            }
          >
            <Star
              className={`w-4 h-4 ${conversation.needsAttention ? "fill-amber-400 text-amber-400" : ""}`}
            />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggleArchive}
            title={conversation.isArchived ? "Unarchive" : "Archive"}
          >
            <Archive
              className={`w-4 h-4 ${conversation.isArchived ? "text-primary" : ""}`}
            />
          </Button>

          {/* Tag Dropdown */}
          <div className="relative" ref={tagMenuRef}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowTagMenu(!showTagMenu)}
              title="Manage tags"
            >
              <Tag className="w-4 h-4" />
            </Button>
            {showTagMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-border rounded-xl shadow-xl z-50 w-[320px] overflow-hidden">
                {/* Header */}
                <div className="px-4 py-2.5 border-b border-border bg-gray-50">
                  <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    Tags
                  </span>
                </div>

                {/* New Tag Button / Edit Form */}
                {!isCreatingTag && !editingTagId ? (
                  <button
                    onClick={() => setIsCreatingTag(true)}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-primary hover:bg-primary/5 transition-colors border-b border-border"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="font-medium">New Tag</span>
                  </button>
                ) : (
                  <div className="p-3 border-b border-border bg-gray-50/50">
                    <input
                      ref={newTagInputRef}
                      type="text"
                      value={newTagLabel}
                      onChange={(e) => setNewTagLabel(e.target.value)}
                      placeholder="Tag name..."
                      className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none mb-2"
                      onKeyDown={(e) => {
                        if (e.key === "Enter")
                          editingTagId ? handleEditTag() : handleCreateTag();
                        if (e.key === "Escape") resetTagForm();
                      }}
                    />
                    <div className="flex items-center justify-between">
                      <div className="flex gap-1">
                        {TAG_COLORS.map((color) => (
                          <button
                            key={color}
                            onClick={() => setNewTagColor(color)}
                            className={`w-5 h-5 rounded-full transition-all ${
                              newTagColor === color
                                ? "ring-2 ring-offset-1 ring-gray-400 scale-110"
                                : "hover:scale-110"
                            }`}
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={resetTagForm}
                          className="text-xs px-2 py-1 text-text-secondary hover:bg-gray-200 rounded"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={
                            editingTagId ? handleEditTag : handleCreateTag
                          }
                          disabled={!newTagLabel.trim()}
                          className="text-xs px-2 py-1 bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50"
                        >
                          {editingTagId ? "Save" : "Create"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tag List */}
                <div className="max-h-[280px] overflow-y-auto">
                  {availableTags.length === 0 ? (
                    <div className="px-4 py-4 text-center text-sm text-text-secondary">
                      No tags yet
                    </div>
                  ) : (
                    availableTags.map((tag) => {
                      const isApplied = conversation.tags?.some(
                        (t) => t && t._id === tag._id,
                      );
                      return (
                        <div
                          key={tag._id}
                          className="group flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors"
                        >
                          <button
                            onClick={() => handleToggleTag(tag._id)}
                            className="flex-1 flex items-center gap-2.5 text-left"
                          >
                            <span
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{
                                backgroundColor: tag.color || "#3B82F6",
                              }}
                            />
                            <span className="text-sm text-text-primary truncate">
                              {tag.label}
                            </span>
                          </button>
                          <div className="flex items-center gap-1">
                            {isApplied && (
                              <Check className="w-4 h-4 text-primary" />
                            )}
                            <button
                              onClick={() => startEditTag(tag)}
                              className="p-1 text-text-secondary hover:text-text-primary hover:bg-gray-200 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Edit tag"
                            >
                              <svg
                                className="w-3.5 h-3.5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                                />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDeleteTag(tag._id)}
                              className="p-1 text-text-secondary hover:text-red-500 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Delete tag"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="relative" ref={moreMenuRef}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              title="More options"
            >
              <MoreHorizontal className="w-4 h-4" />
            </Button>
            {showMoreMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-border rounded-lg shadow-lg py-1 z-50 min-w-[180px]">
                {conversation.status === "open" && (
                  <>
                    <button
                      onClick={handleMarkResolved}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-text-primary hover:bg-gray-50 transition-colors"
                    >
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span>Mark as Resolved</span>
                    </button>
                    <button
                      onClick={handleMarkSpam}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-text-primary hover:bg-gray-50 transition-colors"
                    >
                      <Shield className="w-4 h-4 text-red-500" />
                      <span>Mark as Spam</span>
                    </button>
                  </>
                )}
                {(conversation.status === "resolved" ||
                  conversation.status === "spam") && (
                  <button
                    onClick={handleReopen}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-text-primary hover:bg-gray-50 transition-colors"
                  >
                    <RotateCcw className="w-4 h-4 text-primary" />
                    <span>Reopen</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-text-secondary">
            No messages yet
          </div>
        ) : (
          <>
            {messages.map((message, index) => {
              const showDateSeparator =
                index === 0 ||
                !isSameDay(
                  new Date(messages[index - 1].createdAt),
                  new Date(message.createdAt),
                );

              return (
                <React.Fragment key={message._id}>
                  {showDateSeparator && (
                    <div className="flex justify-center my-4">
                      <span className="bg-gray-100 text-text-secondary text-xs px-3 py-1 rounded-full">
                        {formatDateSeparator(new Date(message.createdAt))}
                      </span>
                    </div>
                  )}
                  <MessageBubble
                    message={message}
                    onImageDoubleClick={setPopupImageUrl}
                    assistantName={assistantName}
                  />
                </React.Fragment>
              );
            })}
            {/* AI Status Indicator - Single dark bubble with changing text */}
            {(isAITyping ||
              aiStatus.status === "analyzing_image" ||
              aiStatus.status === "analyzing_audio" ||
              aiStatus.status === "thinking") && (
              <div className="flex justify-end mb-4">
                <div className="flex flex-col items-end">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Sparkles className="w-3 h-3 text-text-secondary" />
                    <span className="text-xs text-text-secondary">
                      {assistantName || "AI Agent"}
                    </span>
                  </div>
                  <div className="bg-dark-surface text-white rounded-lg p-4 flex items-center gap-2">
                    <span className="text-sm">
                      {aiStatus.status === "analyzing_image"
                        ? "Analyzing image"
                        : aiStatus.status === "analyzing_audio"
                          ? "Analyzing audio"
                          : "Thinking"}
                    </span>
                    <div className="flex gap-1">
                      <span
                        className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: "0ms" }}
                      />
                      <span
                        className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: "150ms" }}
                      />
                      <span
                        className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: "300ms" }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Message Input */}
      <div className="p-4 border-t border-border">
        {/* File Preview */}
        {pendingFile && (
          <div className="mb-3 relative inline-block">
            {pendingFile.fileType === "image" ? (
              <img
                src={pendingFile.preview}
                alt="Pending upload"
                className="max-h-32 rounded-lg border border-border"
              />
            ) : pendingFile.fileType === "video" ? (
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-border">
                <Film className="w-8 h-8 text-primary" />
                <div>
                  <p className="text-sm font-medium text-text-primary truncate max-w-[200px]">
                    {pendingFile.fileName}
                  </p>
                  <p className="text-xs text-text-secondary">Video</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-border">
                <FileText className="w-8 h-8 text-primary" />
                <div>
                  <p className="text-sm font-medium text-text-primary truncate max-w-[200px]">
                    {pendingFile.fileName}
                  </p>
                  <p className="text-xs text-text-secondary">Document</p>
                </div>
              </div>
            )}
            <button
              onClick={() => setPendingFile(null)}
              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-3">
          {/* Hidden file input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-text-secondary hover:text-text-primary hover:bg-gray-100 rounded-md"
            title="Attach file"
          >
            <Paperclip className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <textarea
              ref={textareaRef}
              placeholder={
                pendingFile
                  ? "Add a caption (optional)..."
                  : "Type a message or paste an image..."
              }
              className="w-full resize-none border border-border rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary"
              rows={2}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              disabled={isSending}
            />
          </div>
          <Button
            onClick={handleSend}
            disabled={(!newMessage.trim() && !pendingFile) || isSending}
            size="md"
          >
            {isSending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : pendingFile ? (
              pendingFile.fileType === "image" ? (
                <ImageIcon className="w-4 h-4" />
              ) : pendingFile.fileType === "video" ? (
                <Film className="w-4 h-4" />
              ) : (
                <File className="w-4 h-4" />
              )
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Image Popup Modal */}
      {popupImageUrl && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setPopupImageUrl(null)}
        >
          <button
            onClick={() => setPopupImageUrl(null)}
            className="absolute top-4 right-4 text-white hover:text-gray-300 z-10"
          >
            <X className="w-8 h-8" />
          </button>
          <img
            src={popupImageUrl}
            alt="Full size"
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};
