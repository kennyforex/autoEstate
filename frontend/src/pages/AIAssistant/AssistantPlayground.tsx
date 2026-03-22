import React, { useEffect, useState, useRef, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import {
  ArrowLeft,
  FileText,
  Send,
  User,
  Bot,
  Loader2,
  Upload,
  Trash2,
  Pencil,
  ExternalLink,
  Video,
  AlertCircle,
  CheckCircle2,
  Square,
  Folder,
  FolderOpen,
  FolderPlus,
  ChevronRight,
  ChevronDown,
  MoreVertical,
  FolderInput,
  X,
  Paperclip,
  Image as ImageIcon,
  Zap,
  UploadCloud,
  Code,
  BookOpen,
  Plus,
  Eye,
  Save,
} from "lucide-react";
import {
  Button,
  Input,
  Textarea,
  Select,
  Toggle,
  StatusDot,
  Modal,
  ToastContainer,
  useToasts,
} from "../../components/common";
import { assistantsApi, skillsApi } from "../../lib/api";
import type { AgentStreamEvent } from "../../lib/api";
import type {
  Assistant,
  AssistantFile,
  AssistantLanguage,
  AssistantTone,
  Skill,
} from "../../lib/types";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// Max file size for uploads (100MB) - matches backend video limit
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

// Helper to get display name from folder path
const getFolderDisplayName = (folderPath: string): string => {
  const lastSlashIndex = folderPath.lastIndexOf("/");
  return lastSlashIndex === -1
    ? folderPath
    : folderPath.substring(lastSlashIndex + 1);
};

// File item component for rendering individual files
interface FileItemProps {
  file: AssistantFile;
  assistantId: string;
  onFileClick: (fileId: string, file: AssistantFile) => void;
  onDeleteFile: (fileId: string, fileName: string) => void;
  onCancelProcessing: (fileId: string) => void;
  onContextMenu: (e: React.MouseEvent, file: AssistantFile) => void;
  onDragStart?: (e: React.DragEvent, file: AssistantFile) => void;
}

const FileItem: React.FC<FileItemProps> = ({
  file,
  assistantId,
  onFileClick,
  onDeleteFile,
  onCancelProcessing,
  onContextMenu,
  onDragStart,
}) => {
  const isVideo =
    file.isVideo || file.name.match(/\.(mp4|m4v|webm|mov|mpeg|mpg)$/i);
  const isProcessing =
    file.processingStatus &&
    !["completed", "failed"].includes(file.processingStatus);
  const hasFailed = file.processingStatus === "failed";

  return (
    <div
      draggable={!isProcessing}
      onDragStart={(e) => {
        if (!isProcessing && onDragStart) {
          onDragStart(e, file);
        }
      }}
      onDragEnd={() => {
        // This is handled by the parent component's handleDragEnd
      }}
      className={`flex items-center justify-between p-2 bg-surface rounded-lg hover:bg-gray-50 transition-colors ${
        !isProcessing ? "cursor-grab active:cursor-grabbing" : "cursor-wait"
      } ${hasFailed ? "border border-red-200 bg-red-50" : ""}`}
      onContextMenu={(e) => onContextMenu(e, file)}
    >
      <button
        onClick={() => !isProcessing && onFileClick(file.fileId, file)}
        className={`flex items-center gap-2 text-left transition-opacity flex-1 min-w-0 group ${
          isProcessing ? "cursor-wait opacity-75" : "hover:opacity-80"
        }`}
        title={isProcessing ? "Processing..." : "Click to preview/download"}
        disabled={isProcessing}
      >
        {/* File Icon */}
        <div className="flex-shrink-0">
          {isProcessing ? (
            <Loader2 className="w-4 h-4 text-primary animate-spin" />
          ) : isVideo ? (
            <Video
              className={`w-4 h-4 ${hasFailed ? "text-error" : "text-purple-500"}`}
            />
          ) : (
            <FileText className="w-4 h-4 text-text-secondary" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p
            className={`text-sm font-medium truncate flex items-center gap-1 ${
              hasFailed ? "text-error" : "text-primary hover:underline"
            }`}
            title={file.name}
          >
            {file.name}
            {!isProcessing && !hasFailed && (
              <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
            )}
          </p>

          {/* Processing Status */}
          {isProcessing && (
            <p className="text-xs text-primary mt-0.5">
              {file.processingStatus === "analyzing"
                ? "Analyzing by AI..."
                : file.processingStatus === "pending"
                  ? "Uploading..."
                  : "Processing..."}
            </p>
          )}

          {/* Error Message */}
          {hasFailed && file.errorMessage && (
            <div className="flex items-center gap-1 mt-0.5">
              <AlertCircle className="w-3 h-3 text-error" />
              <span
                className="text-xs text-error truncate max-w-[120px]"
                title={file.errorMessage}
              >
                {file.errorMessage}
              </span>
            </div>
          )}

          {/* Success Status */}
          {file.processingStatus === "completed" && isVideo && (
            <div className="flex items-center gap-1 mt-0.5">
              <CheckCircle2 className="w-3 h-3 text-green-500" />
              <span className="text-xs text-green-600">Analyzed</span>
            </div>
          )}

          {/* Regular file date */}
          {!isVideo && !isProcessing && !hasFailed && (
            <p className="text-xs text-text-secondary">
              {format(new Date(file.uploadedAt), "MMM d, yyyy")}
            </p>
          )}

          {/* Video date (when not processing) */}
          {isVideo && !isProcessing && !hasFailed && !file.processingStatus && (
            <p className="text-xs text-text-secondary">
              {format(new Date(file.uploadedAt), "MMM d, yyyy")}
            </p>
          )}
        </div>
      </button>

      {/* Action buttons */}
      <div className="flex items-center gap-0.5 flex-shrink-0">
        {/* More options button */}
        <button
          onClick={(e) => onContextMenu(e, file)}
          className="p-1 text-text-secondary hover:text-text-primary hover:bg-gray-100 rounded opacity-0 group-hover:opacity-100"
          title="More options"
        >
          <MoreVertical className="w-3.5 h-3.5" />
        </button>
        {/* Document button for completed videos - opens analysis */}
        {isVideo && file.processingStatus === "completed" && (
          <button
            onClick={async () => {
              try {
                const { signedUrl } = await assistantsApi.getFileUrl(
                  assistantId,
                  file.fileId,
                );
                window.open(signedUrl, "_blank");
              } catch (error) {
                console.error("Failed to get analysis URL:", error);
              }
            }}
            className="p-1 text-text-secondary hover:text-primary hover:bg-primary/10 rounded"
            title="View analysis document"
          >
            <FileText className="w-3.5 h-3.5" />
          </button>
        )}
        {/* Stop button for analyzing files, Delete button otherwise */}
        {file.processingStatus === "analyzing" ? (
          <button
            onClick={() => onCancelProcessing(file.fileId)}
            className="p-1 text-orange-500 hover:text-orange-700 hover:bg-orange-50 rounded"
            title="Stop analysis"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
          </button>
        ) : (
          <button
            onClick={() => onDeleteFile(file.fileId, file.name)}
            className="p-1 text-text-secondary hover:text-error hover:bg-red-50 rounded"
            disabled={file.processingStatus === "pending"}
            title={
              file.processingStatus === "pending"
                ? "Uploading..."
                : "Delete file"
            }
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};

// Recursive folder tree item component
interface FolderTreeItemProps {
  folderName: string;
  folderStructure: {
    folders: string[];
    topLevelFolders: string[];
    childFoldersMap: Record<string, string[]>;
    rootFiles: AssistantFile[];
    folderFiles: Record<string, AssistantFile[]>;
  };
  expandedFolders: Set<string>;
  selectedFolder: string | null;
  dropTargetFolder: string | null;
  draggedFolder: string | null;
  renamingFolder: string | null;
  renameFolderValue: string;
  renameFolderInputRef: React.RefObject<HTMLInputElement>;
  assistantId: string;
  depth: number;
  onToggleFolder: (folderName: string) => void;
  onSelectFolder: (folderName: string | null) => void;
  onDeleteFolder: (folderName: string) => void;
  onStartRenameFolder: (folderName: string) => void;
  onRenameFolder: () => void;
  onRenameFolderValueChange: (value: string) => void;
  onCancelRename: () => void;
  onFolderDragStart: (e: React.DragEvent, folderName: string) => void;
  onFolderDragOver: (e: React.DragEvent, folderName: string | null) => void;
  onFolderDragLeave: () => void;
  onFolderDrop: (e: React.DragEvent, folderName: string | null) => void;
  onDragEnd: () => void;
  onFileClick: (fileId: string, file: AssistantFile) => void;
  onDeleteFile: (fileId: string, fileName: string) => void;
  onCancelProcessing: (fileId: string) => void;
  onFileContextMenu: (e: React.MouseEvent, file: AssistantFile) => void;
  onFileDragStart: (e: React.DragEvent, file: AssistantFile) => void;
}

const FolderTreeItem: React.FC<FolderTreeItemProps> = ({
  folderName,
  folderStructure,
  expandedFolders,
  selectedFolder,
  dropTargetFolder,
  draggedFolder,
  renamingFolder,
  renameFolderValue,
  renameFolderInputRef,
  assistantId,
  depth,
  onToggleFolder,
  onSelectFolder,
  onDeleteFolder,
  onStartRenameFolder,
  onRenameFolder,
  onRenameFolderValueChange,
  onCancelRename,
  onFolderDragStart,
  onFolderDragOver,
  onFolderDragLeave,
  onFolderDrop,
  onDragEnd,
  onFileClick,
  onDeleteFile,
  onCancelProcessing,
  onFileContextMenu,
  onFileDragStart,
}) => {
  const isExpanded = expandedFolders.has(folderName);
  const filesInFolder = folderStructure.folderFiles?.[folderName] || [];
  const childFolders = folderStructure.childFoldersMap?.[folderName] || [];
  const isSelected = selectedFolder === folderName;
  const isDropTarget = dropTargetFolder === folderName;
  const hasContent = filesInFolder.length > 0 || childFolders.length > 0;
  const displayName = getFolderDisplayName(folderName);

  return (
    <div className="rounded-lg overflow-hidden">
      {/* Folder Header */}
      <div
        draggable
        onDragStart={(e) => onFolderDragStart(e, folderName)}
        onDragEnd={onDragEnd}
        className={`flex items-center justify-between p-2 cursor-grab active:cursor-grabbing rounded-lg group transition-colors ${
          isDropTarget
            ? "bg-green-100 border-2 border-dashed border-green-500"
            : isSelected
              ? "bg-primary/10 border border-primary"
              : "bg-gray-50 hover:bg-gray-100"
        } ${draggedFolder === folderName ? "opacity-50" : ""}`}
        style={{ marginLeft: depth * 16 }}
        onClick={() => {
          if (isSelected) {
            onSelectFolder(null);
          } else {
            onSelectFolder(folderName);
          }
          if (hasContent) {
            onToggleFolder(folderName);
          }
        }}
        onDragOver={(e) => onFolderDragOver(e, folderName)}
        onDragLeave={onFolderDragLeave}
        onDrop={(e) => onFolderDrop(e, folderName)}
      >
        <div className="flex items-center gap-2">
          {hasContent ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleFolder(folderName);
              }}
              className="hover:bg-gray-200 rounded p-0.5"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-text-secondary" />
              ) : (
                <ChevronRight className="w-4 h-4 text-text-secondary" />
              )}
            </button>
          ) : (
            <span className="w-4" />
          )}
          {isExpanded ? (
            <FolderOpen
              className={`w-4 h-4 ${isSelected ? "text-primary" : "text-amber-500"}`}
            />
          ) : (
            <Folder
              className={`w-4 h-4 ${isSelected ? "text-primary" : "text-amber-500"}`}
            />
          )}
          {renamingFolder === folderName ? (
            <input
              ref={renameFolderInputRef}
              type="text"
              value={renameFolderValue}
              onChange={(e) => onRenameFolderValueChange(e.target.value)}
              onBlur={onRenameFolder}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onRenameFolder();
                } else if (e.key === "Escape") {
                  onCancelRename();
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className="text-sm font-medium px-1 py-0.5 border border-primary rounded focus:outline-none focus:ring-1 focus:ring-primary min-w-[80px]"
            />
          ) : (
            <span
              className={`text-sm font-medium truncate ${isSelected ? "text-primary" : "text-text-primary"}`}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onStartRenameFolder(folderName);
              }}
              title={`${displayName} (double-click to rename)`}
            >
              {displayName}
            </span>
          )}
          {filesInFolder.length > 0 ? (
            <span className="text-xs text-text-secondary">
              ({filesInFolder.length})
            </span>
          ) : childFolders.length === 0 ? (
            <span className="text-xs text-text-secondary italic">Empty</span>
          ) : null}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDeleteFolder(folderName);
          }}
          className="p-1 text-text-secondary hover:text-error hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
          title="Delete folder"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Expanded Content: Child Folders and Files */}
      {isExpanded && (
        <div className="mt-1 space-y-1">
          {/* Child Folders */}
          {childFolders.map((childFolder) => (
            <FolderTreeItem
              key={childFolder}
              folderName={childFolder}
              folderStructure={folderStructure}
              expandedFolders={expandedFolders}
              selectedFolder={selectedFolder}
              dropTargetFolder={dropTargetFolder}
              draggedFolder={draggedFolder}
              renamingFolder={renamingFolder}
              renameFolderValue={renameFolderValue}
              renameFolderInputRef={renameFolderInputRef}
              assistantId={assistantId}
              depth={depth + 1}
              onToggleFolder={onToggleFolder}
              onSelectFolder={onSelectFolder}
              onDeleteFolder={onDeleteFolder}
              onStartRenameFolder={onStartRenameFolder}
              onRenameFolder={onRenameFolder}
              onRenameFolderValueChange={onRenameFolderValueChange}
              onCancelRename={onCancelRename}
              onFolderDragStart={onFolderDragStart}
              onFolderDragOver={onFolderDragOver}
              onFolderDragLeave={onFolderDragLeave}
              onFolderDrop={onFolderDrop}
              onDragEnd={onDragEnd}
              onFileClick={onFileClick}
              onDeleteFile={onDeleteFile}
              onCancelProcessing={onCancelProcessing}
              onFileContextMenu={onFileContextMenu}
              onFileDragStart={onFileDragStart}
            />
          ))}
          {/* Files in this folder */}
          {filesInFolder.map((file) => (
            <div key={file.fileId} style={{ marginLeft: (depth + 1) * 16 }}>
              <FileItem
                file={file}
                assistantId={assistantId}
                onFileClick={onFileClick}
                onDeleteFile={onDeleteFile}
                onCancelProcessing={onCancelProcessing}
                onContextMenu={onFileContextMenu}
                onDragStart={onFileDragStart}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const AssistantPlayground: React.FC = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  const [assistant, setAssistant] = useState<Assistant | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"settings" | "files" | "skills">(
    "settings",
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [agentStatus, setAgentStatus] = useState<string | null>(null);
  const [agentSteps, setAgentSteps] = useState<
    Array<{
      number: number;
      tool: string;
      status: "running" | "completed";
    }>
  >([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const { toasts, dismissToast, showSuccess, showError } = useToasts();

  // Chat file upload state
  const [selectedChatFile, setSelectedChatFile] = useState<File | null>(null);
  const chatFileInputRef = useRef<HTMLInputElement>(null);

  // Folder management state
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(),
  );
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null); // Selected folder for uploads
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [draggedFile, setDraggedFile] = useState<AssistantFile | null>(null); // File being dragged
  const [draggedFolder, setDraggedFolder] = useState<string | null>(null); // Folder being dragged
  const [dropTargetFolder, setDropTargetFolder] = useState<string | null>(null); // Folder being hovered over
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null); // Folder being renamed
  const [renameFolderValue, setRenameFolderValue] = useState(""); // New name for folder being renamed
  const renameFolderInputRef = useRef<HTMLInputElement>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    fileId: string;
    fileName: string;
    currentFolder?: string;
  } | null>(null);
  const [moveToFolderModal, setMoveToFolderModal] = useState<{
    fileId: string;
    fileName: string;
    currentFolder?: string;
  } | null>(null);
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [name, setName] = useState("");
  const [primaryLanguage, setPrimaryLanguage] =
    useState<AssistantLanguage>("auto");
  const [tone, setTone] = useState<AssistantTone>("professional");
  const [instructions, setInstructions] = useState("");
  const [model, setModel] = useState("gpt-4o");
  const [isActive, setIsActive] = useState(true);

  // Skills state
  const [allSkills, setAllSkills] = useState<Skill[]>([]);
  const [isLoadingSkills, setIsLoadingSkills] = useState(false);
  const [showCreateSkillModal, setShowCreateSkillModal] = useState(false);
  const [skillFormMode, setSkillFormMode] = useState<"form" | "upload">("form");
  const [isCreatingSkill, setIsCreatingSkill] = useState(false);
  const [skillForm, setSkillForm] = useState({
    name: "",
    description: "",
    instructions: "",
    triggerHints: "",
    requiredTools: "",
  });
  const [skillUploadFile, setSkillUploadFile] = useState<File | null>(null);
  const skillFileInputRef = useRef<HTMLInputElement>(null);
  const zipFileInputRef = useRef<HTMLInputElement>(null);
  const [bindingSkillId, setBindingSkillId] = useState<string | null>(null);
  const [expandedSkills, setExpandedSkills] = useState<Set<string>>(new Set());

  // Edit skill state
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [isUpdatingSkill, setIsUpdatingSkill] = useState(false);

  // Skill assets state (reference & scripts)
  const [managingSkillId, setManagingSkillId] = useState<string | null>(null);
  const [refContent, setRefContent] = useState("");
  const [refLoading, setRefLoading] = useState(false);
  const [refSaving, setRefSaving] = useState(false);
  const [scriptList, setScriptList] = useState<string[]>([]);
  const [viewingScript, setViewingScript] = useState<{ filename: string; content: string } | null>(null);
  const [newScriptName, setNewScriptName] = useState("");
  const [newScriptContent, setNewScriptContent] = useState("");
  const [showNewScriptForm, setShowNewScriptForm] = useState(false);
  const [scriptSaving, setScriptSaving] = useState(false);
  const scriptUploadRef = useRef<HTMLInputElement>(null);
  const refUploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchAssistant = async () => {
      if (!id) return;
      try {
        const data = await assistantsApi.get(id);
        setAssistant(data);
        setName(data.name);
        setPrimaryLanguage(data.primaryLanguage || "auto");
        setTone(data.tone || "professional");
        setInstructions(data.instructions || "");
        setModel(data.model);
        setIsActive(data.status === "active");
      } catch (error) {
        console.error("Failed to fetch assistant:", error);
        navigate("/ai-assistant");
      } finally {
        setIsLoading(false);
      }
    };

    fetchAssistant();
  }, [id, navigate]);

  const fetchSkills = async () => {
    setIsLoadingSkills(true);
    try {
      const skills = await skillsApi.list();
      setAllSkills(skills);
    } catch (error) {
      console.error("Failed to fetch skills:", error);
    } finally {
      setIsLoadingSkills(false);
    }
  };

  useEffect(() => {
    if (activeTab === "skills") {
      fetchSkills();
    }
  }, [activeTab]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, agentSteps]);

  // Poll for file status updates when there are pending/analyzing files
  useEffect(() => {
    if (!id || !assistant) return;

    const pendingFiles = assistant.files.filter(
      (f) =>
        f.processingStatus === "pending" || f.processingStatus === "analyzing",
    );

    if (pendingFiles.length === 0) return;

    const poll = async () => {
      try {
        const updated = await assistantsApi.get(id);
        setAssistant(updated);
      } catch (error) {
        console.error("Failed to poll assistant status:", error);
      }
    };

    // Poll every 3 seconds
    const interval = setInterval(poll, 3000);

    return () => clearInterval(interval);
  }, [id, assistant?.files]);

  // Prevent browser from opening files when dragging over the page (but not over the drop zone)
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      // Only prevent default if we're not over the drop zone
      // The drop zone handlers will handle their own events
      const target = e.target as HTMLElement;
      const dropZone = target.closest("[data-drop-zone]");
      if (!dropZone) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const handleDrop = (e: DragEvent) => {
      // Only prevent default if we're not over the drop zone
      const target = e.target as HTMLElement;
      const dropZone = target.closest("[data-drop-zone]");
      if (!dropZone) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    document.addEventListener("dragover", handleDragOver);
    document.addEventListener("drop", handleDrop);

    return () => {
      document.removeEventListener("dragover", handleDragOver);
      document.removeEventListener("drop", handleDrop);
    };
  }, []);

  // Focus chat input after assistant finishes typing (isTyping becomes false)
  const wasTypingRef = useRef(false);
  useEffect(() => {
    if (wasTypingRef.current && !isTyping) {
      chatInputRef.current?.focus();
    }
    wasTypingRef.current = isTyping;
  }, [isTyping]);

  const handleSendMessage = async () => {
    if ((!inputMessage.trim() && !selectedChatFile) || isTyping || !id) return;

    const content = inputMessage.trim();
    const userMessage: ChatMessage = {
      role: "user",
      content:
        content || (selectedChatFile ? `[File: ${selectedChatFile.name}]` : ""),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputMessage("");
    setIsTyping(true);
    setAgentStatus(null);
    setAgentSteps([]);

    const handleProgress = (event: AgentStreamEvent) => {
      if (event.type === "status") {
        setAgentStatus(event.status);
      } else if (event.type === "agent_step") {
        setAgentStatus("working");
        setAgentSteps((prev) => {
          const toolName = event.step.action?.tool || "thinking";
          const newStep = {
            number: event.step.number,
            tool: toolName,
            status: event.step.observation
              ? ("completed" as const)
              : ("running" as const),
          };
          const existingIndex = prev.findIndex(
            (s) => s.number === event.step.number && s.tool === toolName,
          );
          if (existingIndex >= 0) {
            const updated = [...prev];
            updated[existingIndex] = newStep;
            return updated;
          }
          return [...prev, newStep];
        });
      }
    };

    try {
      let response;
      if (selectedChatFile) {
        response = await assistantsApi.agentChatWithFile(
          id,
          [...messages, userMessage],
          selectedChatFile,
          handleProgress,
        );
        setSelectedChatFile(null);
      } else {
        response = await assistantsApi.agentChat(
          id,
          [...messages, userMessage],
          handleProgress,
        );
      }
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: response.message?.content || "",
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Failed to send message:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
        },
      ]);
    } finally {
      setIsTyping(false);
      setAgentStatus(null);
      setAgentSteps([]);
    }
  };

  const handleChatFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type (images for now)
      const validTypes = [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "audio/mpeg",
        "audio/wav",
        "audio/ogg",
        "audio/mp4",
      ];
      if (
        !validTypes.includes(file.type) &&
        !file.type.startsWith("image/") &&
        !file.type.startsWith("audio/")
      ) {
        showError("Invalid file type", "Please select an image or audio file.");
        return;
      }
      // Max 10MB for chat files
      if (file.size > 10 * 1024 * 1024) {
        showError("File too large", "Maximum file size is 10MB.");
        return;
      }
      setSelectedChatFile(file);
    }
    // Reset input so same file can be selected again
    if (chatFileInputRef.current) {
      chatFileInputRef.current.value = "";
    }
  };

  const handleChatFileButtonClick = () => {
    chatFileInputRef.current?.click();
  };

  const removeSelectedChatFile = () => {
    setSelectedChatFile(null);
  };

  const handleSaveSettings = async () => {
    if (!id) return;

    setIsSaving(true);
    try {
      const updated = await assistantsApi.update(id, {
        name,
        primaryLanguage,
        tone,
        instructions,
        model: model as Assistant["model"],
        status: isActive ? "active" : "inactive",
      });
      setAssistant(updated);
      showSuccess(
        "Settings saved",
        "Assistant settings have been updated successfully.",
      );
    } catch (error) {
      console.error("Failed to save settings:", error);
      showError(
        "Failed to save",
        "An error occurred while saving settings. Please try again.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  // ── Skill handlers ──

  const isSkillBound = (skillId: string): boolean => {
    return assistant?.skills?.includes(skillId) ?? false;
  };

  const toggleSkillExpanded = (skillId: string) => {
    setExpandedSkills((prev) => {
      const next = new Set(prev);
      if (next.has(skillId)) {
        next.delete(skillId);
      } else {
        next.add(skillId);
      }
      return next;
    });
  };

  const openEditModal = (skill: Skill) => {
    setEditingSkill(skill);
    setSkillForm({
      name: skill.name,
      description: skill.description || "",
      instructions: skill.instructions || "",
      triggerHints: (skill.triggerHints || []).join(", "),
      requiredTools: (skill.requiredTools || []).join(", "),
    });
  };

  const handleUpdateSkill = async () => {
    if (!editingSkill || isUpdatingSkill) return;
    setIsUpdatingSkill(true);
    try {
      const updated = await skillsApi.update(editingSkill._id, {
        name: skillForm.name,
        description: skillForm.description,
        instructions: skillForm.instructions || undefined,
        triggerHints: skillForm.triggerHints
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        requiredTools: skillForm.requiredTools
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      setAllSkills((prev) =>
        prev.map((s) => (s._id === updated._id ? updated : s)),
      );
      setEditingSkill(null);
      setSkillForm({ name: "", description: "", instructions: "", triggerHints: "", requiredTools: "" });
      showSuccess("Skill updated", `"${updated.name}" has been updated.`);
    } catch (error: any) {
      const msg = error.response?.data?.error || error.message || "Failed to update skill";
      showError("Failed", msg);
    } finally {
      setIsUpdatingSkill(false);
    }
  };

  const handleToggleSkill = async (skillId: string) => {
    if (!id || bindingSkillId) return;
    setBindingSkillId(skillId);
    try {
      if (isSkillBound(skillId)) {
        await skillsApi.unbind(skillId, id);
        setAssistant((prev) =>
          prev
            ? {
                ...prev,
                skills: (prev.skills || []).filter((s) => s !== skillId),
              }
            : prev,
        );
        showSuccess(
          "Skill removed",
          "Skill has been unbound from this assistant.",
        );
      } else {
        await skillsApi.bind(skillId, id);
        setAssistant((prev) =>
          prev ? { ...prev, skills: [...(prev.skills || []), skillId] } : prev,
        );
        showSuccess("Skill added", "Skill has been bound to this assistant.");
      }
    } catch (error) {
      console.error("Failed to toggle skill:", error);
      showError("Failed", "Could not update skill binding.");
    } finally {
      setBindingSkillId(null);
    }
  };

  const handleCreateSkill = async () => {
    if (isCreatingSkill) return;
    setIsCreatingSkill(true);
    try {
      if (skillFormMode === "upload" && skillUploadFile) {
        const skill = await skillsApi.install(skillUploadFile);
        if (id) {
          await skillsApi.bind(skill._id, id);
          setAssistant((prev) =>
            prev
              ? { ...prev, skills: [...(prev.skills || []), skill._id] }
              : prev,
          );
        }
        showSuccess(
          "Skill installed",
          `"${skill.name}" has been installed and bound.`,
        );
      } else {
        // Create skill from form - build markdown content and use install
        const triggerHintsStr = skillForm.triggerHints
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .join(", ");

        // Build SKILL.md content
        const skillMdContent = `---
name: ${skillForm.name}
description: ${skillForm.description}
triggerHints: ${triggerHintsStr}
---

${skillForm.instructions}
`;

        // Create as markdown file
        const file = new File([skillMdContent], "SKILL.md", { type: "text/markdown" });
        const skill = await skillsApi.install(file);

        if (id) {
          await skillsApi.bind(skill._id, id);
          setAssistant((prev) =>
            prev
              ? { ...prev, skills: [...(prev.skills || []), skill._id] }
              : prev,
          );
        }
        showSuccess(
          "Skill created",
          `"${skill.name}" has been created and bound.`,
        );
      }
      setShowCreateSkillModal(false);
      setSkillForm({
        name: "",
        description: "",
        instructions: "",
        triggerHints: "",
        requiredTools: "",
      });
      setSkillUploadFile(null);
      fetchSkills();
    } catch (error: any) {
      const msg =
        error.response?.data?.error ||
        error.message ||
        "Failed to create skill";
      showError("Failed", msg);
    } finally {
      setIsCreatingSkill(false);
    }
  };

  const handleDeleteSkill = async (skillId: string) => {
    try {
      await skillsApi.delete(skillId);
      setAllSkills((prev) => prev.filter((s) => s._id !== skillId));
      setAssistant((prev) =>
        prev
          ? {
              ...prev,
              skills: (prev.skills || []).filter((s) => s !== skillId),
            }
          : prev,
      );
      showSuccess("Skill deleted", "Skill has been removed.");
    } catch (error) {
      console.error("Failed to delete skill:", error);
      showError("Failed", "Could not delete skill.");
    }
  };

  // ── Skill asset management ──

  const openSkillAssets = async (skillId: string) => {
    if (managingSkillId === skillId) {
      setManagingSkillId(null);
      return;
    }
    setManagingSkillId(skillId);
    setRefLoading(true);
    setShowNewScriptForm(false);
    setViewingScript(null);
    try {
      const [ref, scripts] = await Promise.all([
        skillsApi.getReference(skillId),
        skillsApi.listScripts(skillId),
      ]);
      setRefContent(ref || "");
      setScriptList(scripts);
    } catch {
      setRefContent("");
      setScriptList([]);
    } finally {
      setRefLoading(false);
    }
  };

  const handleSaveReference = async (skillId: string) => {
    setRefSaving(true);
    try {
      const updated = await skillsApi.saveReference(skillId, refContent);
      setAllSkills((prev) => prev.map((s) => (s._id === updated._id ? updated : s)));
      showSuccess("Saved", "Reference document updated.");
    } catch (error: any) {
      showError("Failed", error.response?.data?.error || "Could not save reference.");
    } finally {
      setRefSaving(false);
    }
  };

  const handleDeleteReference = async (skillId: string) => {
    try {
      const updated = await skillsApi.deleteReference(skillId);
      setAllSkills((prev) => prev.map((s) => (s._id === updated._id ? updated : s)));
      setRefContent("");
      showSuccess("Deleted", "Reference document removed.");
    } catch (error: any) {
      showError("Failed", error.response?.data?.error || "Could not delete reference.");
    }
  };

  const handleUploadReference = async (skillId: string, file: File) => {
    setRefSaving(true);
    try {
      const updated = await skillsApi.uploadReference(skillId, file);
      setAllSkills((prev) => prev.map((s) => (s._id === updated._id ? updated : s)));
      const content = await skillsApi.getReference(skillId);
      setRefContent(content || "");
      showSuccess("Uploaded", "Reference file uploaded.");
    } catch (error: any) {
      showError("Failed", error.response?.data?.error || "Could not upload reference.");
    } finally {
      setRefSaving(false);
    }
  };

  const handleCreateScript = async (skillId: string) => {
    if (!newScriptName || !newScriptContent) return;
    setScriptSaving(true);
    try {
      const updated = await skillsApi.createScript(skillId, newScriptName, newScriptContent);
      setAllSkills((prev) => prev.map((s) => (s._id === updated._id ? updated : s)));
      setScriptList(updated.scripts || []);
      setNewScriptName("");
      setNewScriptContent("");
      setShowNewScriptForm(false);
      showSuccess("Created", `Script "${newScriptName}" added.`);
    } catch (error: any) {
      showError("Failed", error.response?.data?.error || "Could not create script.");
    } finally {
      setScriptSaving(false);
    }
  };

  const handleUploadScript = async (skillId: string, file: File) => {
    setScriptSaving(true);
    try {
      const updated = await skillsApi.uploadScript(skillId, file);
      setAllSkills((prev) => prev.map((s) => (s._id === updated._id ? updated : s)));
      setScriptList(updated.scripts || []);
      showSuccess("Uploaded", `Script "${file.name}" added.`);
    } catch (error: any) {
      showError("Failed", error.response?.data?.error || "Could not upload script.");
    } finally {
      setScriptSaving(false);
    }
  };

  const handleDeleteScript = async (skillId: string, filename: string) => {
    try {
      const updated = await skillsApi.deleteScript(skillId, filename);
      setAllSkills((prev) => prev.map((s) => (s._id === updated._id ? updated : s)));
      setScriptList(updated.scripts || []);
      if (viewingScript?.filename === filename) setViewingScript(null);
      showSuccess("Deleted", `Script "${filename}" removed.`);
    } catch (error: any) {
      showError("Failed", error.response?.data?.error || "Could not delete script.");
    }
  };

  const handleViewScript = async (skillId: string, filename: string) => {
    if (viewingScript?.filename === filename) {
      setViewingScript(null);
      return;
    }
    try {
      const data = await skillsApi.getScript(skillId, filename);
      setViewingScript(data);
    } catch {
      showError("Failed", "Could not load script content.");
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!file || !id || isUploading) return;

    // File size validation before upload (100MB limit)
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setUploadError(
        `File exceeds 100MB limit. Please compress or split the file. (${(file.size / (1024 * 1024)).toFixed(1)}MB)`,
      );
      return;
    }

    setUploadError(null);
    setIsUploading(true);
    try {
      // Pass selected folder if any
      const updated = await assistantsApi.uploadFile(
        id,
        file,
        selectedFolder || undefined,
      );
      setAssistant(updated);
    } catch (error: unknown) {
      const message =
        error && typeof error === "object" && "response" in error
          ? (error as { response?: { data?: { error?: string } } }).response
              ?.data?.error
          : (error as Error)?.message;
      setUploadError(message || "Failed to upload file. Please try again.");
      console.error("Failed to upload file:", error);
    } finally {
      setIsUploading(false);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (isUploading) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    if (isUploading) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (isUploading) return;
    e.preventDefault();
    e.stopPropagation();
    // Only set dragging to false if we're leaving the drop zone itself
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (isUploading) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleDeleteFile = async (fileId: string, fileName: string) => {
    if (!id) return;

    // Confirm before deleting
    const confirmed = window.confirm(
      `Are you sure you want to delete "${fileName}"?\n\nThis action cannot be undone.`,
    );
    if (!confirmed) return;

    try {
      await assistantsApi.deleteFile(id, fileId);
      setAssistant((prev) =>
        prev
          ? { ...prev, files: prev.files.filter((f) => f.fileId !== fileId) }
          : prev,
      );
    } catch (error) {
      console.error("Failed to delete file:", error);
    }
  };

  const handleCancelProcessing = async (fileId: string) => {
    if (!id) return;

    try {
      await assistantsApi.cancelFileProcessing(id, fileId);
      // Refresh assistant to get updated file status
      const updated = await assistantsApi.get(id);
      setAssistant(updated);
    } catch (error) {
      console.error("Failed to cancel processing:", error);
    }
  };

  const handleFileClick = async (
    fileId: string,
    file?: (typeof assistant.files)[0],
  ) => {
    if (!id) return;

    // If it's a video with a videoPath, play the video directly
    if (file?.isVideo && file?.videoPath) {
      // Extract filename from the absolute path (e.g., /path/to/uploads/videos/id-123.mp4 -> id-123.mp4)
      const filename = file.videoPath.split("/").pop();
      if (filename) {
        // Construct video URL from backend base (remove /api from API_BASE_URL)
        const apiBaseUrl =
          import.meta.env.VITE_API_URL || "http://localhost:3001/api";
        const backendUrl = apiBaseUrl.replace(/\/api$/, "");
        const videoUrl = `${backendUrl}/uploads/videos/${filename}`;
        window.open(videoUrl, "_blank");
        return;
      }
    }

    // For non-video files or videos without path, open the Pinecone document
    try {
      const { signedUrl } = await assistantsApi.getFileUrl(id, fileId);
      // Open in new tab for preview/download
      window.open(signedUrl, "_blank");
    } catch (error) {
      console.error("Failed to get file URL:", error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Compute folder structure from files
  const folderStructure = useMemo(() => {
    if (!assistant) return { folders: [], rootFiles: [], folderFiles: {} };

    const rootFiles: AssistantFile[] = [];
    const folderFiles: Record<string, AssistantFile[]> = {};

    for (const file of assistant.files) {
      if (file.folder) {
        if (!folderFiles[file.folder]) {
          folderFiles[file.folder] = [];
        }
        folderFiles[file.folder].push(file);
      } else {
        rootFiles.push(file);
      }
    }

    // Use folders from assistant (persisted in database)
    // Build hierarchical structure for nested folders
    const allFolders = assistant.folders || [];

    // Separate top-level folders from child folders
    const topLevelFolders: string[] = [];
    const childFoldersMap: Record<string, string[]> = {}; // parent -> children

    for (const folder of allFolders) {
      const lastSlashIndex = folder.lastIndexOf("/");
      if (lastSlashIndex === -1) {
        // Top-level folder
        topLevelFolders.push(folder);
      } else {
        // Child folder - find parent
        const parentPath = folder.substring(0, lastSlashIndex);
        if (!childFoldersMap[parentPath]) {
          childFoldersMap[parentPath] = [];
        }
        childFoldersMap[parentPath].push(folder);
      }
    }

    return {
      folders: allFolders,
      topLevelFolders: topLevelFolders.sort(),
      childFoldersMap,
      rootFiles,
      folderFiles,
    };
  }, [assistant?.files, assistant?.folders]);

  // Toggle folder expansion
  const toggleFolder = (folderName: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderName)) {
        next.delete(folderName);
      } else {
        next.add(folderName);
      }
      return next;
    });
  };

  // Create a new folder
  const handleCreateFolder = async () => {
    const trimmedName = newFolderName.trim();
    if (!trimmedName || !id) {
      setIsCreatingFolder(false);
      setNewFolderName("");
      return;
    }

    try {
      const updated = await assistantsApi.createFolder(id, trimmedName);
      setAssistant(updated);
      setExpandedFolders((prev) => new Set(prev).add(trimmedName));
    } catch (error) {
      console.error("Failed to create folder:", error);
      showError(
        "Failed to create folder",
        "An error occurred while creating the folder.",
      );
    } finally {
      setNewFolderName("");
      setIsCreatingFolder(false);
    }
  };

  // Move file to folder
  const handleMoveToFolder = async (fileId: string, folder: string | null) => {
    if (!id) return;
    try {
      const updated = await assistantsApi.updateFileFolder(id, fileId, folder);
      setAssistant(updated);
      setMoveToFolderModal(null);
      setContextMenu(null);
    } catch (error) {
      console.error("Failed to move file:", error);
      showError(
        "Failed to move file",
        "An error occurred while moving the file.",
      );
    }
  };

  // Delete folder (move all files to root)
  const handleDeleteFolder = async (folderName: string) => {
    if (!id || !assistant) return;

    const filesInFolder = assistant.files.filter(
      (f) => f.folder === folderName,
    );

    if (filesInFolder.length > 0) {
      const confirmed = window.confirm(
        `Move ${filesInFolder.length} file(s) from "${folderName}" to root and delete the folder?`,
      );
      if (!confirmed) return;
    }

    try {
      // Delete folder via API (which also moves files to root)
      const updated = await assistantsApi.deleteFolder(id, folderName);
      setAssistant(updated);
      setExpandedFolders((prev) => {
        const next = new Set(prev);
        next.delete(folderName);
        return next;
      });
    } catch (error) {
      console.error("Failed to delete folder:", error);
      showError(
        "Failed to delete folder",
        "An error occurred while deleting the folder.",
      );
    }
  };

  // Handle right-click context menu
  const handleFileContextMenu = (e: React.MouseEvent, file: AssistantFile) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      fileId: file.fileId,
      fileName: file.name,
      currentFolder: file.folder,
    });
  };

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener("click", handleClick);
      return () => document.removeEventListener("click", handleClick);
    }
  }, [contextMenu]);

  // Focus new folder input when creating
  useEffect(() => {
    if (isCreatingFolder && newFolderInputRef.current) {
      newFolderInputRef.current.focus();
    }
  }, [isCreatingFolder]);

  // Focus rename folder input when renaming
  useEffect(() => {
    if (renamingFolder && renameFolderInputRef.current) {
      renameFolderInputRef.current.focus();
      renameFolderInputRef.current.select();
    }
  }, [renamingFolder]);

  // Handle folder rename
  const handleStartRenameFolder = (folderName: string) => {
    setRenamingFolder(folderName);
    setRenameFolderValue(folderName);
  };

  const handleRenameFolder = async () => {
    if (!id || !renamingFolder) {
      setRenamingFolder(null);
      setRenameFolderValue("");
      return;
    }

    const trimmedName = renameFolderValue.trim();
    if (!trimmedName || trimmedName === renamingFolder) {
      // No change or empty, just cancel
      setRenamingFolder(null);
      setRenameFolderValue("");
      return;
    }

    try {
      const updated = await assistantsApi.renameFolder(
        id,
        renamingFolder,
        trimmedName,
      );
      setAssistant(updated);
      // Update expanded folders if the renamed folder was expanded
      if (expandedFolders.has(renamingFolder)) {
        setExpandedFolders((prev) => {
          const next = new Set(prev);
          next.delete(renamingFolder);
          next.add(trimmedName);
          return next;
        });
      }
      // Update selected folder if it was selected
      if (selectedFolder === renamingFolder) {
        setSelectedFolder(trimmedName);
      }
    } catch (error) {
      console.error("Failed to rename folder:", error);
      showError(
        "Failed to rename folder",
        "An error occurred while renaming the folder.",
      );
    } finally {
      setRenamingFolder(null);
      setRenameFolderValue("");
    }
  };

  // File drag handlers for moving files between folders
  const handleFileDragStart = (e: React.DragEvent, file: AssistantFile) => {
    setDraggedFile(file);
    setDraggedFolder(null);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", `file:${file.fileId}`);
  };

  // Folder drag handlers for nesting folders
  const handleFolderDragStart = (e: React.DragEvent, folderName: string) => {
    setDraggedFolder(folderName);
    setDraggedFile(null);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", `folder:${folderName}`);
  };

  const handleFolderDragOver = (
    e: React.DragEvent,
    folderName: string | null,
  ) => {
    // Handle file drag
    if (draggedFile) {
      // Don't allow dropping on the same folder
      if (
        draggedFile.folder === folderName ||
        (!draggedFile.folder && folderName === null)
      ) {
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDropTargetFolder(folderName);
      return;
    }

    // Handle folder drag
    if (draggedFolder) {
      // Can't drop folder on itself
      if (draggedFolder === folderName) {
        return;
      }
      // Can't drop on null (root) - folders stay as top-level, just nested name changes
      if (folderName === null) {
        return;
      }
      // Can't drop parent folder into its own child (prevent circular nesting)
      if (folderName.startsWith(draggedFolder + "/")) {
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDropTargetFolder(folderName);
      return;
    }
  };

  const handleFolderDragLeave = () => {
    setDropTargetFolder(null);
  };

  const handleFolderDrop = async (
    e: React.DragEvent,
    targetFolder: string | null,
  ) => {
    e.preventDefault();
    setDropTargetFolder(null);

    // Handle file drop
    if (draggedFile && id) {
      // Don't move if dropping on the same folder
      if (
        draggedFile.folder === targetFolder ||
        (!draggedFile.folder && targetFolder === null)
      ) {
        setDraggedFile(null);
        return;
      }

      try {
        const updated = await assistantsApi.updateFileFolder(
          id,
          draggedFile.fileId,
          targetFolder,
        );
        setAssistant(updated);
      } catch (error) {
        console.error("Failed to move file:", error);
        showError(
          "Failed to move file",
          "An error occurred while moving the file.",
        );
      } finally {
        setDraggedFile(null);
      }
      return;
    }

    // Handle folder drop (nesting)
    if (draggedFolder && targetFolder && id) {
      // Create nested folder name
      const newFolderName = `${targetFolder}/${draggedFolder.split("/").pop()}`;

      try {
        // Rename the folder to create nesting
        const updated = await assistantsApi.renameFolder(
          id,
          draggedFolder,
          newFolderName,
        );
        setAssistant(updated);

        // Update expanded folders
        setExpandedFolders((prev) => {
          const next = new Set(prev);
          next.delete(draggedFolder);
          next.add(newFolderName);
          next.add(targetFolder); // Expand parent folder
          return next;
        });

        // Update selected folder if needed
        if (selectedFolder === draggedFolder) {
          setSelectedFolder(newFolderName);
        }
      } catch (error) {
        console.error("Failed to nest folder:", error);
        showError(
          "Failed to move folder",
          "An error occurred while moving the folder.",
        );
      } finally {
        setDraggedFolder(null);
      }
      return;
    }

    setDraggedFile(null);
    setDraggedFolder(null);
  };

  const handleDragEnd = () => {
    setDraggedFile(null);
    setDraggedFolder(null);
    setDropTargetFolder(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!assistant) {
    return null;
  }

  return (
    <div className="h-screen flex flex-col">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/ai-assistant")}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">
              {t("assistants.playground.title")}
            </h1>
            <p className="text-sm text-gray-500">{assistant.name}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Chat Area */}
        <div className="flex-1 flex flex-col bg-gray-50">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
            {messages.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Bot className="w-8 h-8 text-gray-400" />
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 mb-1">
                    {t("assistants.playground.startConversation")}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {t("assistants.playground.testMessage")}
                  </p>
                </div>
              </div>
            ) : (
              <>
                {messages.map((message, index) => (
                  <div key={index} className="mb-6">
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          message.role === "user"
                            ? "bg-primary text-white"
                            : "bg-dark text-white"
                        }`}
                      >
                        {message.role === "user" ? (
                          <User className="w-4 h-4" />
                        ) : (
                          <Bot className="w-4 h-4" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-medium text-gray-900">
                            {message.role === "user"
                              ? t("assistants.playground.you")
                              : assistant.name}
                          </p>
                          {(() => {
                            const skillMatch = message.content.match(/<!-- skill:(\S+?)(?::complete\s+\{.*?\})? -->/);
                            const isSkillComplete = message.content.includes(':complete');
                            if (skillMatch && message.role === "assistant") {
                              return (
                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded ${
                                  isSkillComplete
                                    ? 'text-green-700 bg-green-50 border border-green-100'
                                    : 'text-purple-700 bg-purple-50 border border-purple-100'
                                }`}>
                                  <Zap className="w-2.5 h-2.5" />
                                  {skillMatch[1]}{isSkillComplete ? ' ✓' : ''}
                                </span>
                              );
                            }
                            return null;
                          })()}
                        </div>
                        {message.role === "assistant" ? (
                          <div
                            className="text-sm text-gray-700 prose prose-sm max-w-none
                            prose-p:my-2 prose-p:leading-relaxed
                            prose-headings:font-semibold prose-headings:text-gray-900 prose-headings:mt-4 prose-headings:mb-1
                            prose-h1:text-base prose-h2:text-sm prose-h3:text-sm
                            prose-strong:text-gray-900 prose-strong:font-semibold
                            prose-a:text-blue-600 prose-a:underline
                            prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono prose-code:text-gray-800
                            prose-pre:bg-gray-100 prose-pre:p-3 prose-pre:rounded-lg prose-pre:text-xs prose-pre:overflow-x-auto
                            prose-ul:my-2 prose-ul:pl-4 prose-ol:my-2 prose-ol:pl-4
                            prose-li:my-1 prose-li:leading-relaxed
                            prose-blockquote:border-l-2 prose-blockquote:border-gray-300 prose-blockquote:pl-3 prose-blockquote:text-gray-600 prose-blockquote:italic
                            prose-hr:my-3 prose-hr:border-gray-200"
                          >
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                p: ({ children }) => (
                                  <p className="my-2 leading-relaxed">
                                    {children}
                                  </p>
                                ),
                                ul: ({ children }) => (
                                  <ul className="my-2 space-y-1 list-disc pl-4">
                                    {children}
                                  </ul>
                                ),
                                ol: ({ children }) => (
                                  <ol className="my-2 space-y-1 list-decimal pl-4">
                                    {children}
                                  </ol>
                                ),
                                li: ({ children }) => (
                                  <li className="leading-relaxed">
                                    {children}
                                  </li>
                                ),
                                strong: ({ children }) => (
                                  <strong className="font-semibold text-gray-900">
                                    {children}
                                  </strong>
                                ),
                                hr: () => (
                                  <hr className="my-4 border-gray-200" />
                                ),
                                code: ({ className, children, ...props }) => {
                                  const isBlock =
                                    className?.includes("language-");
                                  return isBlock ? (
                                    <code
                                      className={`block bg-gray-100 p-3 rounded-lg text-xs font-mono overflow-x-auto ${className}`}
                                      {...props}
                                    >
                                      {children}
                                    </code>
                                  ) : (
                                    <code
                                      className="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono text-gray-800"
                                      {...props}
                                    >
                                      {children}
                                    </code>
                                  );
                                },
                              }}
                            >
                              {message.content.replace(/\n?<!-- skill:\S+?(?::complete\s+\{.*?\})? -->/g, '').trim()}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">
                            {message.content.replace(/\n?<!-- skill:\S+?(?::complete\s+\{.*?\})? -->/g, '').trim()}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {isTyping && (
                  <div className="mb-6">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-dark text-white flex items-center justify-center">
                        <Bot className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                          <span className="text-sm text-gray-500">
                            {agentStatus === "analyzing_image"
                              ? "Analyzing image..."
                              : agentStatus === "analyzing_audio"
                                ? "Analyzing audio..."
                                : agentSteps.length > 0
                                  ? `${assistant.name} is working...`
                                  : `${assistant.name} is thinking...`}
                          </span>
                        </div>
                        {agentSteps.length > 0 && (
                          <div className="ml-6 space-y-1 border-l-2 border-gray-200 pl-3">
                            {agentSteps.slice(-5).map((step, i) => (
                              <div
                                key={`${step.number}-${step.tool}-${i}`}
                                className="flex items-center gap-2 text-xs"
                              >
                                {step.status === "running" ? (
                                  <Loader2 className="w-3 h-3 animate-spin text-blue-500 flex-shrink-0" />
                                ) : (
                                  <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
                                )}
                                <span className="text-gray-500">
                                  {step.tool === "thinking"
                                    ? "Analyzing request..."
                                    : step.status === "running"
                                      ? `Using ${step.tool}...`
                                      : `Used ${step.tool}`}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input */}
          <div className="p-4 bg-white border-t border-gray-200">
            {/* Selected file preview */}
            {selectedChatFile && (
              <div className="mb-3 flex items-center gap-2 p-2 bg-primary/5 border border-primary/20 rounded-lg">
                {selectedChatFile.type.startsWith("image/") ? (
                  <ImageIcon className="w-4 h-4 text-primary" />
                ) : (
                  <FileText className="w-4 h-4 text-primary" />
                )}
                <span className="text-sm text-text-primary flex-1 truncate">
                  {selectedChatFile.name}
                </span>
                <span className="text-xs text-text-secondary">
                  ({(selectedChatFile.size / 1024).toFixed(1)} KB)
                </span>
                <button
                  onClick={removeSelectedChatFile}
                  className="p-1 text-text-secondary hover:text-error hover:bg-red-50 rounded"
                  title="Remove file"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <textarea
                  ref={chatInputRef}
                  placeholder={t("assistants.playground.typePlaceholder")}
                  className="w-full resize-none border border-gray-200 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary"
                  rows={2}
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isTyping}
                />
              </div>
              {/* File attachment button */}
              <input
                ref={chatFileInputRef}
                type="file"
                className="hidden"
                onChange={handleChatFileSelect}
                accept="image/*,audio/*"
              />
              <Button
                variant="secondary"
                onClick={handleChatFileButtonClick}
                disabled={isTyping || !!selectedChatFile}
                title="Attach image or audio"
              >
                <Paperclip className="w-4 h-4" />
              </Button>
              <Button
                onClick={handleSendMessage}
                disabled={
                  (!inputMessage.trim() && !selectedChatFile) || isTyping
                }
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Settings Panel */}
        <div className="w-[520px] bg-white border-l border-gray-200 flex flex-col">
          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab("settings")}
              className={`flex-1 px-4 py-3 text-sm font-medium ${
                activeTab === "settings"
                  ? "text-gray-900 border-b-2 border-gray-900"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t("assistants.playground.settings")}
            </button>
            <button
              onClick={() => setActiveTab("files")}
              className={`flex-1 px-4 py-3 text-sm font-medium ${
                activeTab === "files"
                  ? "text-gray-900 border-b-2 border-gray-900"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t("assistants.playground.files")}
            </button>
            <button
              onClick={() => setActiveTab("skills")}
              className={`flex-1 px-4 py-3 text-sm font-medium ${
                activeTab === "skills"
                  ? "text-gray-900 border-b-2 border-gray-900"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Skills
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
            {activeTab === "settings" ? (
              <div className="space-y-6">
                {/* Status Info */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">
                      {t("assistants.status")}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <StatusDot status={isActive ? "active" : "inactive"} />
                      <span className="text-sm text-gray-900">
                        {isActive
                          ? t("assistants.active")
                          : t("assistants.inactive")}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">
                      {t("assistants.created")}
                    </span>
                    <span className="text-sm text-gray-900">
                      {format(new Date(assistant.createdAt), "MMM d, yyyy")}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">
                      {t("assistants.updated")}
                    </span>
                    <span className="text-sm text-gray-900">
                      {format(new Date(assistant.updatedAt), "MMM d, yyyy")}
                    </span>
                  </div>
                </div>

                <hr className="border-gray-200" />

                {/* Assistant Name */}
                <Input
                  label={t("assistants.assistantName")}
                  placeholder="My AI Assistant"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />

                {/* Primary Language */}
                <Select
                  label={t("assistants.primaryLanguage")}
                  value={primaryLanguage}
                  onChange={(value) =>
                    setPrimaryLanguage(value as AssistantLanguage)
                  }
                  options={[
                    { value: "auto", label: t("assistants.dependsOnInput") },
                    { value: "en", label: t("assistants.english") },
                    {
                      value: "zh-TW",
                      label: t("assistants.traditionalChinese"),
                    },
                    {
                      value: "zh-CN",
                      label: t("assistants.simplifiedChinese"),
                    },
                  ]}
                />

                {/* Tone */}
                <Select
                  label={t("assistants.tone")}
                  value={tone}
                  onChange={(value) => setTone(value as AssistantTone)}
                  options={[
                    {
                      value: "professional",
                      label: t("assistants.professional"),
                    },
                    { value: "friendly", label: t("assistants.friendly") },
                    { value: "casual", label: t("assistants.casual") },
                    { value: "formal", label: t("assistants.formal") },
                    { value: "empathetic", label: t("assistants.empathetic") },
                  ]}
                />

                {/* Instructions */}
                <div>
                  <Textarea
                    label={t("assistants.instructions")}
                    placeholder="Outline the assistant's behavior or any additional context. Applies to every conversation."
                    rows={6}
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                  />
                  <p className="text-xs text-text-secondary mt-1">
                    Applies to every conversation.
                  </p>
                </div>

                {/* Model */}
                <Select
                  label={t("assistants.chatModel")}
                  value={model}
                  onChange={setModel}
                  options={[
                    { value: "gpt-4o", label: "GPT-4o" },
                    { value: "gpt-4.1", label: "GPT-4.1" },
                    { value: "claude-3-7-sonnet", label: "Claude 3.7 Sonnet" },
                  ]}
                />

                {/* Active Toggle */}
                <Toggle
                  checked={isActive}
                  onChange={setIsActive}
                  label={t("assistants.active")}
                  description={t("assistants.enableAssistant")}
                />

                {/* Save Button */}
                <Button
                  className="w-full"
                  onClick={handleSaveSettings}
                  isLoading={isSaving}
                >
                  {t("common.save")}
                </Button>
              </div>
            ) : activeTab === "files" ? (
              <div className="space-y-4">
                {/* Upload Area */}
                <div
                  data-drop-zone
                  onClick={() => !isUploading && fileInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                    isUploading
                      ? "border-primary bg-primary/5 cursor-wait opacity-75"
                      : isDragging
                        ? "border-primary bg-primary/10 cursor-pointer"
                        : "border-border hover:border-primary hover:bg-primary/5 cursor-pointer"
                  }`}
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-8 h-8 text-primary mx-auto mb-2 animate-spin" />
                      <p className="text-sm text-primary font-medium">
                        {t("assistants.playground.uploading")}
                        {selectedFolder
                          ? ` ${t("assistants.playground.uploadingTo")} "${selectedFolder}"`
                          : ""}
                        ...
                      </p>
                      <p className="text-xs text-text-secondary mt-1">
                        {t("assistants.playground.videoProcessing")}
                      </p>
                    </>
                  ) : (
                    <>
                      <Upload className="w-8 h-8 text-text-secondary mx-auto mb-2" />
                      <p className="text-sm text-text-secondary">
                        {t("assistants.playground.dragFiles")}
                      </p>
                      {selectedFolder ? (
                        <p className="text-xs text-primary mt-1 font-medium">
                          {t("assistants.playground.uploadTo")}:{" "}
                          {selectedFolder}
                        </p>
                      ) : (
                        <p className="text-xs text-text-secondary mt-1">
                          {t("assistants.playground.fileSupport")}
                        </p>
                      )}
                    </>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileInputChange}
                  accept=".pdf,.txt,.md,.doc,.docx,.mp4,.m4v,.webm,.mov,.mpeg,.mpg"
                />

                {/* Upload error message */}
                {uploadError && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{uploadError}</span>
                    <button
                      type="button"
                      onClick={() => setUploadError(null)}
                      className="ml-auto text-red-500 hover:text-red-700"
                      aria-label="Dismiss"
                    >
                      ×
                    </button>
                  </div>
                )}

                {/* Folder Actions */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-secondary font-medium uppercase tracking-wider">
                    {t("assistants.playground.filesAndFolders")}
                  </span>
                  {isCreatingFolder ? (
                    <div className="flex items-center gap-1">
                      <input
                        ref={newFolderInputRef}
                        type="text"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleCreateFolder();
                          if (e.key === "Escape") {
                            setIsCreatingFolder(false);
                            setNewFolderName("");
                          }
                        }}
                        onBlur={handleCreateFolder}
                        placeholder="Folder name"
                        className="w-28 px-2 py-1 text-xs border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => setIsCreatingFolder(true)}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:text-primary hover:bg-primary/5 rounded transition-colors"
                      title="Create new folder"
                    >
                      <FolderPlus className="w-3.5 h-3.5" />
                      <span>{t("assistants.playground.newFolder")}</span>
                    </button>
                  )}
                </div>

                {/* File & Folder List */}
                <div className="space-y-1" onDragEnd={handleDragEnd}>
                  {assistant.files.length === 0 &&
                  folderStructure.folders.length === 0 ? (
                    <p className="text-sm text-text-secondary text-center py-4">
                      {t("assistants.playground.noFiles")}
                    </p>
                  ) : (
                    <>
                      {/* Root (no folder) - clickable to deselect folder, also drop target */}
                      <div
                        className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                          dropTargetFolder === null &&
                          draggedFile &&
                          draggedFile.folder
                            ? "bg-green-100 border-2 border-dashed border-green-500"
                            : selectedFolder === null
                              ? "bg-primary/10 border border-primary"
                              : "bg-gray-50 hover:bg-gray-100"
                        }`}
                        onClick={() => setSelectedFolder(null)}
                        onDragOver={(e) => handleFolderDragOver(e, null)}
                        onDragLeave={handleFolderDragLeave}
                        onDrop={(e) => handleFolderDrop(e, null)}
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-4" />
                          <FileText className="w-4 h-4 text-text-secondary" />
                          <span className="text-sm font-medium text-text-primary">
                            {t("assistants.playground.home")}
                          </span>
                          <span className="text-xs text-text-secondary">
                            ({folderStructure.rootFiles.length})
                          </span>
                        </div>
                      </div>

                      {/* Folders - Render recursively */}
                      {folderStructure.topLevelFolders.map((folderName) => (
                        <FolderTreeItem
                          key={folderName}
                          folderName={folderName}
                          folderStructure={folderStructure}
                          expandedFolders={expandedFolders}
                          selectedFolder={selectedFolder}
                          dropTargetFolder={dropTargetFolder}
                          draggedFolder={draggedFolder}
                          renamingFolder={renamingFolder}
                          renameFolderValue={renameFolderValue}
                          renameFolderInputRef={renameFolderInputRef}
                          assistantId={id!}
                          onToggleFolder={toggleFolder}
                          onSelectFolder={setSelectedFolder}
                          onDeleteFolder={handleDeleteFolder}
                          onStartRenameFolder={handleStartRenameFolder}
                          onRenameFolder={handleRenameFolder}
                          onRenameFolderValueChange={setRenameFolderValue}
                          onCancelRename={() => {
                            setRenamingFolder(null);
                            setRenameFolderValue("");
                          }}
                          onFolderDragStart={handleFolderDragStart}
                          onFolderDragOver={handleFolderDragOver}
                          onFolderDragLeave={handleFolderDragLeave}
                          onFolderDrop={handleFolderDrop}
                          onDragEnd={handleDragEnd}
                          onFileClick={handleFileClick}
                          onDeleteFile={handleDeleteFile}
                          onCancelProcessing={handleCancelProcessing}
                          onFileContextMenu={handleFileContextMenu}
                          onFileDragStart={handleFileDragStart}
                          depth={0}
                        />
                      ))}

                      {/* Root Files (no folder) */}
                      {folderStructure.rootFiles.map((file) => (
                        <FileItem
                          key={file.fileId}
                          file={file}
                          assistantId={id!}
                          onFileClick={handleFileClick}
                          onDeleteFile={handleDeleteFile}
                          onCancelProcessing={handleCancelProcessing}
                          onContextMenu={handleFileContextMenu}
                          onDragStart={handleFileDragStart}
                        />
                      ))}
                    </>
                  )}
                </div>

                {/* Context Menu */}
                {contextMenu && (
                  <div
                    className="fixed z-50 bg-white border border-border rounded-lg shadow-lg py-1 min-w-[160px]"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() =>
                        setMoveToFolderModal({
                          fileId: contextMenu.fileId,
                          fileName: contextMenu.fileName,
                          currentFolder: contextMenu.currentFolder,
                        })
                      }
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-gray-50"
                    >
                      <FolderInput className="w-4 h-4" />
                      Move to folder...
                    </button>
                    {contextMenu.currentFolder && (
                      <button
                        onClick={() =>
                          handleMoveToFolder(contextMenu.fileId, null)
                        }
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-gray-50"
                      >
                        <FolderInput className="w-4 h-4" />
                        Move to root
                      </button>
                    )}
                  </div>
                )}

                {/* Move to Folder Modal */}
                {moveToFolderModal && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-white rounded-lg shadow-xl w-80 max-h-[80vh] overflow-hidden">
                      <div className="flex items-center justify-between p-4 border-b border-border">
                        <h3 className="font-medium text-text-primary">
                          Move to folder
                        </h3>
                        <button
                          onClick={() => setMoveToFolderModal(null)}
                          className="p-1 text-text-secondary hover:text-text-primary"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="p-4 space-y-2 max-h-60 overflow-y-auto">
                        <p className="text-xs text-text-secondary mb-2">
                          Moving:{" "}
                          <span className="font-medium">
                            {moveToFolderModal.fileName}
                          </span>
                        </p>
                        {/* Root option */}
                        <button
                          onClick={() =>
                            handleMoveToFolder(moveToFolderModal.fileId, null)
                          }
                          className={`w-full flex items-center gap-2 p-2 rounded-lg text-sm text-left hover:bg-gray-50 ${
                            !moveToFolderModal.currentFolder
                              ? "bg-primary/10 text-primary"
                              : ""
                          }`}
                        >
                          <FileText className="w-4 h-4" />
                          Root (no folder)
                        </button>
                        {/* Existing folders */}
                        {folderStructure.folders.map((folderName) => (
                          <button
                            key={folderName}
                            onClick={() =>
                              handleMoveToFolder(
                                moveToFolderModal.fileId,
                                folderName,
                              )
                            }
                            className={`w-full flex items-center gap-2 p-2 rounded-lg text-sm text-left hover:bg-gray-50 ${
                              moveToFolderModal.currentFolder === folderName
                                ? "bg-primary/10 text-primary"
                                : ""
                            }`}
                          >
                            <Folder className="w-4 h-4 text-amber-500" />
                            {folderName}
                          </button>
                        ))}
                        {/* Create new folder */}
                        <div className="pt-2 border-t border-border">
                          <input
                            type="text"
                            placeholder="Create new folder..."
                            className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                            onKeyDown={async (e) => {
                              if (
                                e.key === "Enter" &&
                                e.currentTarget.value.trim() &&
                                id
                              ) {
                                const newFolder = e.currentTarget.value.trim();
                                try {
                                  // First create the folder
                                  await assistantsApi.createFolder(
                                    id,
                                    newFolder,
                                  );
                                  // Then move the file to it
                                  await handleMoveToFolder(
                                    moveToFolderModal.fileId,
                                    newFolder,
                                  );
                                } catch (error) {
                                  console.error(
                                    "Failed to create folder and move file:",
                                    error,
                                  );
                                  showError(
                                    "Failed",
                                    "Could not create folder and move file.",
                                  );
                                }
                              }
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* ── Skills Tab ── */
              <div className="space-y-5">
                {/* Header */}

                {/* <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-text-primary">
                      Installed Skills
                    </h3>
                    <p className="text-xs text-text-secondary mt-0.5">
                      Toggle skills on to let the AI agent use them at runtime.
                    </p>
                  </div>
                </div> */}
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setSkillFormMode("upload");
                      setShowCreateSkillModal(true);
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-text-secondary border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
                  >
                    Upload .md
                  </button>
                  <button
                    onClick={() => {
                      // Trigger zip file input
                      zipFileInputRef.current?.click();
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-text-secondary border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
                  >
                    Upload Zip
                  </button>
                  <button
                    onClick={() => {
                      setSkillFormMode("form");
                      setShowCreateSkillModal(true);
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 transition-colors"
                  >
                    + Create
                  </button>
                </div>

                {/* Hidden zip file input */}
                <input
                  ref={zipFileInputRef}
                  type="file"
                  accept=".zip"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;

                    setIsCreatingSkill(true);
                    try {
                      const skill = await skillsApi.installZip(file);
                      if (id) {
                        await skillsApi.bind(skill._id, id);
                        setAssistant((prev) =>
                          prev ? { ...prev, skills: [...(prev.skills || []), skill._id] } : prev,
                        );
                      }
                      await fetchSkills();
                      showSuccess("Skill installed", `"${skill.name}" has been installed and bound.`);
                    } catch (error: any) {
                      const msg = error.response?.data?.error || error.message || "Failed to install skill";
                      showError("Failed", msg);
                    } finally {
                      setIsCreatingSkill(false);
                      e.target.value = "";
                    }
                  }}
                />

                {/* Divider */}
                <div className="border-t border-gray-100" />

                {/* Skills List */}
                {isLoadingSkills ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="animate-pulse bg-gray-50 rounded-lg h-14"
                      />
                    ))}
                  </div>
                ) : allSkills.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Zap className="w-6 h-6 text-gray-400" />
                    </div>
                    <p className="text-sm font-medium text-text-primary">
                      No skills yet
                    </p>
                    <p className="text-xs text-text-secondary mt-1 max-w-[280px] mx-auto">
                      Upload a skill directory (zip) with SKILL.md, reference.md, examples/, and scripts/.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {allSkills.map((skill) => {
                      const bound = isSkillBound(skill._id);
                      const isExpanded = expandedSkills.has(skill._id);
                      return (
                        <div
                          key={skill._id}
                          className={`rounded-lg transition-all ${
                            bound
                              ? " ring-1 ring-primary/10"
                              : "bg-white border border-gray-100 hover:border-gray-200"
                          }`}
                        >
                          {/* Header row: expandable */}
                          <button
                            onClick={() => toggleSkillExpanded(skill._id)}
                            className="w-full flex items-center justify-between p-3 text-left"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-sm font-medium text-text-primary truncate">
                                {skill.name}
                              </span>
                              <span className="text-[10px] text-text-secondary bg-gray-100 px-1.5 py-0.5 rounded flex-shrink-0">
                                {skill.slug}
                              </span>
                              {bound && (
                                <span className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded flex-shrink-0">
                                  Active
                                </span>
                              )}
                              {/* Structure badges */}
                              {skill.hasReferences && (
                                <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded flex-shrink-0" title="Has reference documentation">
                                  ref
                                </span>
                              )}
                              {skill.hasExamples && (
                                <span className="text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded flex-shrink-0" title="Has examples">
                                  ex
                                </span>
                              )}
                              {(skill.scripts || []).length > 0 && (
                                <span className="text-[10px] text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded flex-shrink-0" title={`Scripts: ${(skill.scripts || []).join(', ')}`}>
                                  {(skill.scripts || []).length} script{(skill.scripts || []).length > 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                              <Toggle
                                checked={bound}
                                onChange={() => handleToggleSkill(skill._id)}
                                disabled={bindingSkillId === skill._id}
                              />
                              <span className="text-gray-400">
                                {isExpanded ? (
                                  <ChevronDown className="w-4 h-4" />
                                ) : (
                                  <ChevronRight className="w-4 h-4" />
                                )}
                              </span>
                            </div>
                          </button>

                          {/* Expanded content */}
                          {isExpanded && (
                            <div className="px-3 pb-3 pt-0">
                              <div className="pt-2 border-t border-gray-100/60">
                                {/* Description */}
                                <p className="text-xs text-text-secondary leading-relaxed mb-3">
                                  {skill.description}
                                </p>

                                {/* Trigger hints */}
                                {(skill.triggerHints || []).length > 0 && (
                                  <div className="flex flex-wrap gap-1.5 mb-3">
                                    {(skill.triggerHints || []).map((hint, i) => (
                                      <span
                                        key={i}
                                        className="inline-block px-2 py-0.5 text-[11px] text-text-secondary bg-gray-50 rounded-full"
                                      >
                                        {hint}
                                      </span>
                                    ))}
                                  </div>
                                )}

                                {/* Actions */}
                                {!skill.isBuiltIn && (
                                  <div className="flex justify-end gap-3">
                                    <button
                                      onClick={() => openSkillAssets(skill._id)}
                                      className={`text-xs transition-colors flex items-center gap-1 ${
                                        managingSkillId === skill._id
                                          ? "text-primary"
                                          : "text-gray-400 hover:text-primary"
                                      }`}
                                    >
                                      <Folder className="w-3.5 h-3.5" />
                                      Assets
                                    </button>
                                    <button
                                      onClick={() => openEditModal(skill)}
                                      className="text-xs text-gray-400 hover:text-primary transition-colors flex items-center gap-1"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                      Edit
                                    </button>
                                    <button
                                      onClick={() =>
                                        handleDeleteSkill(skill._id)
                                      }
                                      className="text-xs text-gray-400 hover:text-error transition-colors flex items-center gap-1"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                      Delete
                                    </button>
                                  </div>
                                )}

                                {/* Assets panel */}
                                {managingSkillId === skill._id && !skill.isBuiltIn && (
                                  <div className="mt-3 pt-3 border-t border-gray-100 space-y-4">
                                    {refLoading ? (
                                      <div className="flex items-center gap-2 text-xs text-text-secondary">
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        Loading assets...
                                      </div>
                                    ) : (
                                      <>
                                        {/* ── Reference Document ── */}
                                        <div>
                                          <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-1.5">
                                              <BookOpen className="w-3.5 h-3.5 text-blue-500" />
                                              <span className="text-xs font-medium text-text-primary">Reference Document</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                              <button
                                                onClick={() => refUploadRef.current?.click()}
                                                className="text-[10px] text-text-secondary hover:text-primary transition-colors flex items-center gap-0.5"
                                              >
                                                <Upload className="w-3 h-3" />
                                                Upload
                                              </button>
                                              <input
                                                ref={refUploadRef}
                                                type="file"
                                                accept=".md,.txt"
                                                className="hidden"
                                                onChange={(e) => {
                                                  const file = e.target.files?.[0];
                                                  if (file) handleUploadReference(skill._id, file);
                                                  e.target.value = "";
                                                }}
                                              />
                                              {refContent && (
                                                <button
                                                  onClick={() => handleDeleteReference(skill._id)}
                                                  className="text-[10px] text-text-secondary hover:text-error transition-colors flex items-center gap-0.5"
                                                >
                                                  <Trash2 className="w-3 h-3" />
                                                  Remove
                                                </button>
                                              )}
                                            </div>
                                          </div>
                                          <textarea
                                            value={refContent}
                                            onChange={(e) => setRefContent(e.target.value)}
                                            placeholder="Paste reference documentation here (loaded on-demand by the AI when needed)..."
                                            rows={4}
                                            className="w-full text-xs font-mono bg-gray-50 border border-gray-200 rounded-md p-2 resize-y focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40"
                                          />
                                          <div className="flex justify-end mt-1.5">
                                            <button
                                              onClick={() => handleSaveReference(skill._id)}
                                              disabled={refSaving}
                                              className="text-[11px] font-medium text-white bg-gray-900 hover:bg-gray-800 disabled:opacity-50 px-3 py-1 rounded-md transition-colors flex items-center gap-1"
                                            >
                                              {refSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                              Save Reference
                                            </button>
                                          </div>
                                        </div>

                                        {/* ── Scripts ── */}
                                        <div>
                                          <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-1.5">
                                              <Code className="w-3.5 h-3.5 text-purple-500" />
                                              <span className="text-xs font-medium text-text-primary">Scripts</span>
                                              <span className="text-[10px] text-text-secondary">({scriptList.length})</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                              <button
                                                onClick={() => scriptUploadRef.current?.click()}
                                                className="text-[10px] text-text-secondary hover:text-primary transition-colors flex items-center gap-0.5"
                                              >
                                                <Upload className="w-3 h-3" />
                                                Upload
                                              </button>
                                              <input
                                                ref={scriptUploadRef}
                                                type="file"
                                                accept=".js,.ts,.py,.sh,.bash,.rb,.php"
                                                className="hidden"
                                                onChange={(e) => {
                                                  const file = e.target.files?.[0];
                                                  if (file) handleUploadScript(skill._id, file);
                                                  e.target.value = "";
                                                }}
                                              />
                                              <button
                                                onClick={() => setShowNewScriptForm(!showNewScriptForm)}
                                                className="text-[10px] text-text-secondary hover:text-primary transition-colors flex items-center gap-0.5"
                                              >
                                                <Plus className="w-3 h-3" />
                                                New
                                              </button>
                                            </div>
                                          </div>

                                          {scriptList.length > 0 && (
                                            <div className="space-y-1 mb-2">
                                              {scriptList.map((filename) => (
                                                <div
                                                  key={filename}
                                                  className="flex items-center justify-between bg-gray-50 rounded-md px-2.5 py-1.5 group"
                                                >
                                                  <div className="flex items-center gap-1.5">
                                                    <Code className="w-3 h-3 text-purple-400" />
                                                    <span className="text-[11px] font-mono text-text-primary">{filename}</span>
                                                  </div>
                                                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                      onClick={() => handleViewScript(skill._id, filename)}
                                                      className="text-[10px] text-text-secondary hover:text-primary transition-colors p-0.5"
                                                      title="View"
                                                    >
                                                      <Eye className="w-3 h-3" />
                                                    </button>
                                                    <button
                                                      onClick={() => handleDeleteScript(skill._id, filename)}
                                                      className="text-[10px] text-text-secondary hover:text-error transition-colors p-0.5"
                                                      title="Delete"
                                                    >
                                                      <Trash2 className="w-3 h-3" />
                                                    </button>
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          )}

                                          {/* Viewing script content */}
                                          {viewingScript && (
                                            <div className="mb-2">
                                              <div className="flex items-center justify-between mb-1">
                                                <span className="text-[10px] font-medium text-text-secondary">{viewingScript.filename}</span>
                                                <button
                                                  onClick={() => setViewingScript(null)}
                                                  className="text-[10px] text-text-secondary hover:text-text-primary"
                                                >
                                                  <X className="w-3 h-3" />
                                                </button>
                                              </div>
                                              <pre className="text-[11px] font-mono bg-gray-900 text-gray-100 rounded-md p-2.5 overflow-x-auto max-h-48 overflow-y-auto">
                                                {viewingScript.content}
                                              </pre>
                                            </div>
                                          )}

                                          {/* New script form */}
                                          {showNewScriptForm && (
                                            <div className="bg-gray-50 rounded-md p-2.5 space-y-2">
                                              <input
                                                value={newScriptName}
                                                onChange={(e) => setNewScriptName(e.target.value)}
                                                placeholder="filename.py (e.g. check_availability.py)"
                                                className="w-full text-xs bg-white border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/30"
                                              />
                                              <textarea
                                                value={newScriptContent}
                                                onChange={(e) => setNewScriptContent(e.target.value)}
                                                placeholder="Script content..."
                                                rows={5}
                                                className="w-full text-xs font-mono bg-white border border-gray-200 rounded p-2 resize-y focus:outline-none focus:ring-1 focus:ring-primary/30"
                                              />
                                              <div className="flex justify-end gap-2">
                                                <button
                                                  onClick={() => {
                                                    setShowNewScriptForm(false);
                                                    setNewScriptName("");
                                                    setNewScriptContent("");
                                                  }}
                                                  className="text-[11px] text-text-secondary hover:text-text-primary px-2 py-1 rounded transition-colors"
                                                >
                                                  Cancel
                                                </button>
                                                <button
                                                  onClick={() => handleCreateScript(skill._id)}
                                                  disabled={!newScriptName || !newScriptContent || scriptSaving}
                                                  className="text-[11px] font-medium text-white bg-gray-900 hover:bg-gray-800 disabled:opacity-50 px-3 py-1 rounded-md transition-colors flex items-center gap-1"
                                                >
                                                  {scriptSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                                                  Create Script
                                                </button>
                                              </div>
                                            </div>
                                          )}

                                          {scriptList.length === 0 && !showNewScriptForm && (
                                            <p className="text-[11px] text-text-secondary italic">
                                              No scripts yet. Scripts run as subprocesses — code is never sent to the LLM.
                                            </p>
                                          )}
                                        </div>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Create Skill Modal */}
                {showCreateSkillModal && (
                  <Modal
                    isOpen={showCreateSkillModal}
                    onClose={() => {
                      setShowCreateSkillModal(false);
                      setSkillForm({
                        name: "",
                        description: "",
                        instructions: "",
                        triggerHints: "",
                        requiredTools: "",
                      });
                      setSkillUploadFile(null);
                    }}
                    title={
                      skillFormMode === "upload"
                        ? "Install Skill from File"
                        : "Create Skill"
                    }
                    size="lg"
                    footer={
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setShowCreateSkillModal(false);
                            setSkillForm({
                              name: "",
                              description: "",
                              instructions: "",
                              triggerHints: "",
                              requiredTools: "",
                            });
                            setSkillUploadFile(null);
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={handleCreateSkill}
                          isLoading={isCreatingSkill}
                          disabled={
                            skillFormMode === "upload"
                              ? !skillUploadFile
                              : !skillForm.name ||
                                !skillForm.description ||
                                !skillForm.instructions
                          }
                        >
                          {skillFormMode === "upload" ? "Install" : "Create"}
                        </Button>
                      </div>
                    }
                  >
                    {/* Mode Toggle */}
                    <div className="flex gap-2 mb-4">
                      <button
                        onClick={() => setSkillFormMode("form")}
                        className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                          skillFormMode === "form"
                            ? "bg-gray-900 text-white"
                            : "bg-gray-100 text-text-secondary hover:bg-gray-200"
                        }`}
                      >
                        Form
                      </button>
                      <button
                        onClick={() => setSkillFormMode("upload")}
                        className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                          skillFormMode === "upload"
                            ? "bg-gray-900 text-white"
                            : "bg-gray-100 text-text-secondary hover:bg-gray-200"
                        }`}
                      >
                        Upload .md
                      </button>
                    </div>

                    {skillFormMode === "form" ? (
                      <div className="space-y-4">
                        <Input
                          label="Name"
                          value={skillForm.name}
                          onChange={(e) =>
                            setSkillForm({ ...skillForm, name: e.target.value })
                          }
                          placeholder="e.g. Greeting Handler"
                        />
                        <Textarea
                          label="Description"
                          value={skillForm.description}
                          onChange={(e) =>
                            setSkillForm({
                              ...skillForm,
                              description: e.target.value,
                            })
                          }
                          placeholder="When should the AI use this skill?"
                          rows={2}
                        />
                        <Textarea
                          label="Instructions"
                          value={skillForm.instructions}
                          onChange={(e) =>
                            setSkillForm({
                              ...skillForm,
                              instructions: e.target.value,
                            })
                          }
                          placeholder="Step-by-step instructions for the AI to follow..."
                          rows={6}
                        />
                        <Input
                          label="Trigger Hints (comma-separated)"
                          value={skillForm.triggerHints}
                          onChange={(e) =>
                            setSkillForm({
                              ...skillForm,
                              triggerHints: e.target.value,
                            })
                          }
                          placeholder="e.g. hello, greet, welcome, 你好"
                        />
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Tools Access (select tools this skill can use)
                          </label>
                          <div className="flex flex-wrap gap-2">
                            {["knowledge_base", "calendar", "contact_lookup", "conversation_history", "media_analysis"].map((tool) => {
                              const selected = skillForm.requiredTools.split(",").map(s => s.trim()).filter(Boolean).includes(tool);
                              return (
                                <button
                                  key={tool}
                                  type="button"
                                  onClick={() => {
                                    const current = skillForm.requiredTools.split(",").map(s => s.trim()).filter(Boolean);
                                    const next = selected ? current.filter(t => t !== tool) : [...current, tool];
                                    setSkillForm({ ...skillForm, requiredTools: next.join(", ") });
                                  }}
                                  className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                                    selected
                                      ? "bg-blue-50 border-blue-300 text-blue-700"
                                      : "bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300"
                                  }`}
                                >
                                  {tool.replace(/_/g, " ")}
                                </button>
                              );
                            })}
                          </div>
                          <p className="text-xs text-gray-400 mt-1">Optional. These tools will be available inside skill execution.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <p className="text-sm text-text-secondary">
                          Upload a skill markdown file with YAML frontmatter
                          (name, description, triggerHints).
                        </p>
                        <div
                          onClick={() => skillFileInputRef.current?.click()}
                          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                            skillUploadFile
                              ? "border-primary bg-primary/5"
                              : "border-gray-300 hover:border-primary hover:bg-gray-50"
                          }`}
                        >
                          {skillUploadFile ? (
                            <div className="flex items-center justify-center gap-2">
                              <FileText className="w-5 h-5 text-primary" />
                              <span className="text-sm font-medium text-primary">
                                {skillUploadFile.name}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSkillUploadFile(null);
                                }}
                                className="p-0.5 text-gray-400 hover:text-error"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <>
                              <UploadCloud className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                              <p className="text-sm text-text-secondary">
                                Click to select a .md file
                              </p>
                            </>
                          )}
                        </div>
                        <input
                          ref={skillFileInputRef}
                          type="file"
                          accept=".md"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) setSkillUploadFile(file);
                            e.target.value = "";
                          }}
                        />
                      </div>
                    )}
                  </Modal>
                )}

                {/* Edit Skill Modal */}
                {editingSkill && (
                  <Modal
                    isOpen={!!editingSkill}
                    onClose={() => {
                      setEditingSkill(null);
                      setSkillForm({ name: "", description: "", instructions: "", triggerHints: "", requiredTools: "" });
                    }}
                    title="Edit Skill"
                    size="lg"
                    footer={
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setEditingSkill(null);
                            setSkillForm({ name: "", description: "", instructions: "", triggerHints: "", requiredTools: "" });
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={handleUpdateSkill}
                          isLoading={isUpdatingSkill}
                          disabled={!skillForm.name || !skillForm.description}
                        >
                          Save Changes
                        </Button>
                      </div>
                    }
                  >
                    <div className="space-y-4">
                      <Input
                        label="Name"
                        value={skillForm.name}
                        onChange={(e) => setSkillForm({ ...skillForm, name: e.target.value })}
                        placeholder="e.g. Booking Handler"
                      />
                      <Textarea
                        label="Description"
                        value={skillForm.description}
                        onChange={(e) => setSkillForm({ ...skillForm, description: e.target.value })}
                        placeholder="When should the AI use this skill? (e.g. Use when customer says hello)"
                        rows={2}
                      />
                      <Textarea
                        label="Instructions"
                        value={skillForm.instructions}
                        onChange={(e) => setSkillForm({ ...skillForm, instructions: e.target.value })}
                        placeholder="Step-by-step instructions for the AI to follow when this skill runs..."
                        rows={8}
                      />
                      <Input
                        label="Trigger Hints (comma-separated)"
                        value={skillForm.triggerHints}
                        onChange={(e) => setSkillForm({ ...skillForm, triggerHints: e.target.value })}
                        placeholder="e.g. hello, greet, welcome, 你好"
                      />
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Tools Access
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {["knowledge_base", "calendar", "contact_lookup", "conversation_history", "media_analysis"].map((tool) => {
                            const selected = skillForm.requiredTools.split(",").map(s => s.trim()).filter(Boolean).includes(tool);
                            return (
                              <button
                                key={tool}
                                type="button"
                                onClick={() => {
                                  const current = skillForm.requiredTools.split(",").map(s => s.trim()).filter(Boolean);
                                  const next = selected ? current.filter(t => t !== tool) : [...current, tool];
                                  setSkillForm({ ...skillForm, requiredTools: next.join(", ") });
                                }}
                                className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                                  selected
                                    ? "bg-blue-50 border-blue-300 text-blue-700"
                                    : "bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300"
                                }`}
                              >
                                {tool.replace(/_/g, " ")}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </Modal>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
