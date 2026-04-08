import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import {
  User,
  Mail,
  Building,
  Globe,
  Tag,
  MessageCircle,
  Calendar,
  Clock,
  AlertTriangle,
  X,
  Info,
  RefreshCw,
} from "lucide-react";
import { Avatar, Badge, Toggle } from "../common";
import type {
  Conversation,
  Contact,
  Channel,
} from "../../lib/types";
import { conversationsApi, contactsApi } from "../../lib/api";

interface DetailsPanelProps {
  conversation: Conversation;
  onClose?: () => void;
  onUpdate?: (conversation: Conversation) => void;
  onCountsChange?: () => void;
}

const DetailSection: React.FC<{
  title: string;
  children: React.ReactNode;
}> = ({ title, children }) => (
  <div className="py-4 border-b border-border">
    <h4 className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-3">
      {title}
    </h4>
    <div className="space-y-2">{children}</div>
  </div>
);

const DetailRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}> = ({ icon, label, value }) => (
  <div className="flex items-start gap-3">
    <div className="text-text-secondary">{icon}</div>
    <div className="flex-1">
      <p className="text-xs text-text-secondary">{label}</p>
      <p className="text-sm text-text-primary">{value}</p>
    </div>
  </div>
);

export const DetailsPanel: React.FC<DetailsPanelProps> = ({
  conversation,
  onClose,
  onUpdate,
  onCountsChange,
}) => {
  const { t } = useTranslation();
  const contact = conversation.contactId as Contact;
  const channel = conversation.channelId as Channel;
  const [aiDiagnostic, setAiDiagnostic] = useState<any>(null);
  const [loadingDiagnostic, setLoadingDiagnostic] = useState(false);
  const [refreshingPhoto, setRefreshingPhoto] = useState(false);
  const [contactAvatar, setContactAvatar] = useState<string | undefined>(
    contact?.avatar,
  );

  // Update avatar when contact changes
  useEffect(() => {
    setContactAvatar(contact?.avatar);
  }, [contact?.avatar]);

  const handleRefreshPhoto = async () => {
    if (!contact?._id) return;
    setRefreshingPhoto(true);
    try {
      const result = await contactsApi.refreshProfilePicture(contact._id);
      if (result.profilePictureUrl) {
        setContactAvatar(result.profilePictureUrl);
        // Update the conversation's contact avatar
        if (onUpdate) {
          onUpdate({
            ...conversation,
            contactId: { ...contact, avatar: result.profilePictureUrl },
          });
        }
      } else {
        alert(
          "No profile picture available for this contact. They may have privacy settings enabled.",
        );
      }
    } catch (error) {
      console.error("Failed to refresh profile picture:", error);
      alert("Failed to refresh profile picture");
    } finally {
      setRefreshingPhoto(false);
    }
  };

  const handleAIToggle = async (enabled: boolean) => {
    try {
      const updated = await conversationsApi.toggleAI(
        conversation._id,
        enabled,
      );
      onUpdate?.(updated);
      // Refresh sidebar counts since AI Handling/Manual counts change
      onCountsChange?.();
      // Refresh diagnostic after toggle
      fetchAIDiagnostic();
    } catch (error) {
      console.error("Failed to toggle AI:", error);
    }
  };

  const handleDismissInsight = async (
    insightType: "negativeSentiment" | "slaRisk" | "priority",
  ) => {
    try {
      const updated = await conversationsApi.dismissInsight(
        conversation._id,
        insightType,
      );
      onUpdate?.(updated);
      onCountsChange?.();
    } catch (error) {
      console.error("Failed to dismiss insight:", error);
    }
  };

  const fetchAIDiagnostic = async () => {
    try {
      setLoadingDiagnostic(true);
      const diagnostic = await conversationsApi.getAIDiagnostic(
        conversation._id,
      );
      setAiDiagnostic(diagnostic);
    } catch (error) {
      console.error("Failed to fetch AI diagnostic:", error);
    } finally {
      setLoadingDiagnostic(false);
    }
  };

  useEffect(() => {
    fetchAIDiagnostic();
  }, [conversation._id]);

  const getSentimentBadge = () => {
    const sentiment = conversation.aiSignals.sentiment;
    if (!sentiment) return null;

    const variants: Record<string, "success" | "warning" | "error"> = {
      positive: "success",
      neutral: "warning",
      negative: "error",
    };

    return (
      <Badge variant={variants[sentiment] || "default"}>
        {t(`inbox.${sentiment}` as any)}
      </Badge>
    );
  };

  return (
    <div className="w-[280px] h-full bg-white border-l border-border flex flex-col">
      {/* Header */}
      <div className="h-[72px] flex items-center justify-between px-4 border-b border-border">
        <h3 className="font-semibold text-text-primary">{t('inbox.details')}</h3>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 text-text-secondary hover:text-text-primary hover:bg-gray-100 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 scrollbar-thin">
        {/* Contact Avatar */}
        <div className="py-6 flex flex-col items-center border-b border-border">
          <div className="relative group">
            <Avatar
              src={contactAvatar}
              name={contact?.name || contact?.phoneNumber || "Unknown"}
              size="lg"
            />
            <button
              onClick={handleRefreshPhoto}
              disabled={refreshingPhoto}
              className="absolute -bottom-1 -right-1 p-1.5 bg-white border border-border rounded-full shadow-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
              title="Refresh profile picture"
            >
              <RefreshCw
                className={`w-3 h-3 text-text-secondary ${refreshingPhoto ? "animate-spin" : ""}`}
              />
            </button>
          </div>
          <h4 className="mt-3 font-semibold text-text-primary">
            {contact?.name || t('inbox.unknown')}
          </h4>
          <p className="text-sm text-text-secondary">
            {contact?.phoneNumber || contact?.whatsappId || ""}
          </p>
        </div>

        {/* Contact Info */}
        <DetailSection title={t('inbox.contactInfo')}>
          {contact?.email && (
            <DetailRow
              icon={<Mail className="w-4 h-4" />}
              label="Email"
              value={contact.email}
            />
          )}
          {contact?.company && (
            <DetailRow
              icon={<Building className="w-4 h-4" />}
              label="Company"
              value={contact.company}
            />
          )}
          <DetailRow
            icon={<Globe className="w-4 h-4" />}
            label={t('inbox.timezone')}
            value="UTC"
          />
        </DetailSection>

        {/* Case Info */}
        <DetailSection title={t('inbox.caseInfo')}>
          <DetailRow
            icon={<Tag className="w-4 h-4" />}
            label={t('inbox.caseId')}
            value={conversation._id.slice(-8).toUpperCase()}
          />

          {conversation.category && (
            <DetailRow
              icon={<Tag className="w-4 h-4" />}
              label="Category"
              value={conversation.category}
            />
          )}
          <DetailRow
            icon={<MessageCircle className="w-4 h-4" />}
            label={t('inbox.channelLabel')}
            value={
              <Badge variant="info">
                {channel?.name || "WhatsApp"}
              </Badge>
            }
          />
          <DetailRow
            icon={<Calendar className="w-4 h-4" />}
            label={t('inbox.created')}
            value={format(new Date(conversation.createdAt), "MMM d, yyyy")}
          />
          {conversation.lastMessageAt && (
            <DetailRow
              icon={<Clock className="w-4 h-4" />}
              label={t('inbox.lastReply')}
              value={format(
                new Date(conversation.lastMessageAt),
                "MMM d, h:mm a",
              )}
            />
          )}
        </DetailSection>

        {/* AI Signals */}
        <DetailSection title={t('inbox.aiSignals')}>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">{t('inbox.confidence')}</span>
              <div className="flex items-center gap-2">
                <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{
                      width: `${(conversation.aiSignals.confidence || 0) * 100}%`,
                    }}
                  />
                </div>
                <span className="text-sm font-medium">
                  {((conversation.aiSignals.confidence || 0) * 100).toFixed(1)}%
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">{t('inbox.sentiment')}</span>
              <div className="flex items-center gap-2">
                {getSentimentBadge()}
                {conversation.aiSignals.sentiment === "negative" &&
                  !conversation.dismissedInsights?.negativeSentiment && (
                    <button
                      onClick={() => handleDismissInsight("negativeSentiment")}
                      className="text-xs text-text-secondary hover:text-text-primary"
                      title="Dismiss (I'm aware)"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">{t('inbox.slaRisk')}</span>
              <div className="flex items-center gap-2">
                {conversation.aiSignals.slaRisk ? (
                  <>
                    <Badge variant="error">
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      {t('inbox.atRisk')}
                    </Badge>
                    {!conversation.dismissedInsights?.slaRisk && (
                      <button
                        onClick={() => handleDismissInsight("slaRisk")}
                        className="text-xs text-text-secondary hover:text-text-primary"
                        title="Dismiss (I'm aware)"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </>
                ) : (
                  <Badge variant="success">On Track</Badge>
                )}
              </div>
            </div>

            {conversation.aiSignals.priority >= 7 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">Priority</span>
                <div className="flex items-center gap-2">
                  <Badge variant="warning">
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    High ({conversation.aiSignals.priority})
                  </Badge>
                  {!conversation.dismissedInsights?.priority && (
                    <button
                      onClick={() => handleDismissInsight("priority")}
                      className="text-xs text-text-secondary hover:text-text-primary"
                      title="Dismiss (I'm aware)"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </DetailSection>

        {/* AI Settings */}
        <DetailSection title={t('inbox.aiSettings')}>
          <Toggle
            checked={conversation.aiAutoReply}
            onChange={handleAIToggle}
            label={t('inbox.aiAutoReply')}
            description={t('inbox.aiAutoReplyDesc')}
          />

          {/* AI Diagnostic Info */}
          {aiDiagnostic && (
            <div className="mt-4 p-3 bg-surface-secondary rounded-lg border border-border">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-text-secondary" />
                  <span className="text-xs font-medium text-text-secondary">
                    {t('inbox.aiStatus')}
                  </span>
                </div>
                <button
                  onClick={fetchAIDiagnostic}
                  disabled={loadingDiagnostic}
                  className="p-1 hover:bg-surface rounded transition-colors"
                  title="Refresh diagnostic"
                >
                  <RefreshCw
                    className={`w-3 h-3 text-text-secondary ${loadingDiagnostic ? "animate-spin" : ""}`}
                  />
                </button>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">{t('inbox.willAiRespond')}</span>
                  <Badge
                    variant={aiDiagnostic.shouldAutoReply ? "success" : "error"}
                  >
                    {aiDiagnostic.shouldAutoReply ? t('inbox.yes') : t('inbox.no')}
                  </Badge>
                </div>

                <div className="pt-2 border-t border-border space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">
                      {t('inbox.channelAiEnabled')}
                    </span>
                    <span
                      className={
                        aiDiagnostic.channel.aiSettings.enabled
                          ? "text-green-500"
                          : "text-red-500"
                      }
                    >
                      {aiDiagnostic.channel.aiSettings.enabled ? "✓" : "✗"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">
                      {t('inbox.assistantConfigured')}
                    </span>
                    <span
                      className={
                        aiDiagnostic.channel.hasAssistant
                          ? "text-green-500"
                          : "text-red-500"
                      }
                    >
                      {aiDiagnostic.channel.hasAssistant ? "✓" : "✗"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">{t('inbox.autoReplyMode')}</span>
                    <span className="text-text-primary font-medium">
                      {aiDiagnostic.channel.aiSettings.autoReplyMode}
                    </span>
                  </div>

                  {aiDiagnostic.channel.aiSettings.autoReplyMode ===
                    "per_chat" && (
                    <div className="flex items-center justify-between">
                      <span className="text-text-secondary">
                        {t('inbox.conversationAiToggle')}
                      </span>
                      <span
                        className={
                          aiDiagnostic.conversation.aiAutoReply
                            ? "text-green-500"
                            : "text-red-500"
                        }
                      >
                        {aiDiagnostic.conversation.aiAutoReply ? t('inbox.on') : t('inbox.off')}
                      </span>
                    </div>
                  )}

                  {!aiDiagnostic.shouldAutoReply && (
                    <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded text-amber-700 dark:text-amber-400">
                      <p className="font-medium mb-1">Why AI won't respond:</p>
                      <ul className="list-disc list-inside space-y-0.5 text-xs">
                        {!aiDiagnostic.channel.aiSettings.enabled && (
                          <li>Channel AI is disabled</li>
                        )}
                        {!aiDiagnostic.channel.hasAssistant && (
                          <li>No assistant configured for this channel</li>
                        )}
                        {aiDiagnostic.channel.aiSettings.autoReplyMode ===
                          "off" && <li>Auto-reply mode is set to "off"</li>}
                        {aiDiagnostic.channel.aiSettings.autoReplyMode ===
                          "per_chat" &&
                          !aiDiagnostic.conversation.aiAutoReply && (
                            <li>Conversation AI toggle is OFF</li>
                          )}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DetailSection>

        {/* Assignment */}
        <DetailSection title={t('inbox.assignment')}>
          <DetailRow
            icon={<User className="w-4 h-4" />}
            label={t('inbox.assignedTo')}
            value={
              conversation.assignedTo
                ? typeof conversation.assignedTo === "object"
                  ? conversation.assignedTo.name
                  : "Agent"
                : t('inbox.unassigned')
            }
          />
        </DetailSection>
      </div>
    </div>
  );
};
