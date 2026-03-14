import React from "react";
import { useTranslation } from "react-i18next";
import {
  Mail,
  Sparkles,
  AlertTriangle,
  User,
  CheckCircle,
  Shield,
  Archive,
  Star,
  Frown,
  Clock,
  Plus,
  ChevronDown,
  ChevronRight,
  Users,
  Settings2,
  MessageCircle,
  Tag,
} from "lucide-react";
import type { InboxCounts, AIInsights, Channel } from "../../lib/types";
import { Select } from "../../components/common";

export interface InboxSidebarProps {
  counts?: InboxCounts;
  insights?: AIInsights;
  activeFilter: string;
  onFilterChange: (filter: string) => void;
  channels?: Channel[];
  selectedChannelId?: string | null;
  onChannelChange?: (channelId: string | null) => void;
}

export const InboxSidebar: React.FC<InboxSidebarProps> = ({
  counts,
  insights,
  activeFilter,
  onFilterChange,
  channels = [],
  selectedChannelId = null,
  onChannelChange,
}) => {
  const { t } = useTranslation();

  const inboxCategories = [
    { id: "all", labelKey: "inbox.allMessage", icon: Mail },
    { id: "aiHandling", labelKey: "inbox.aiHandling", icon: Sparkles },
    { id: "manual", labelKey: "inbox.manual", icon: User },
    { id: "attention", labelKey: "inbox.attention", icon: AlertTriangle },
    { id: "assignedToMe", labelKey: "inbox.assignedToMe", icon: User },
    { id: "resolved", labelKey: "inbox.resolved", icon: CheckCircle },
    { id: "spam", labelKey: "inbox.spam", icon: Shield },
    { id: "archived", labelKey: "inbox.archived", icon: Archive },
  ];

  const aiInsightCategories = [
    { id: "priority", labelKey: "inbox.aiPriority", icon: Star },
    { id: "negative", labelKey: "inbox.negativeSentiment", icon: Frown },
    { id: "slaRisk", labelKey: "inbox.slaRisk", icon: Clock },
  ];
  const [expandedSections, setExpandedSections] = React.useState({
    inbox: true,
    insights: true,
    tags: true,
    team: false,
    manage: false,
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const getCount = (id: string): number => {
    if (!counts) return 0;
    const countMap: Record<string, number> = {
      all: counts.all,
      aiHandling: counts.aiHandling,
      manual: counts.manual || 0,
      attention: counts.needAttention,
      assignedToMe: counts.assignedToMe,
      resolved: counts.resolvedByAI,
      spam: counts.spam,
      archived: counts.archived || 0,
    };
    return countMap[id] || 0;
  };

  const getInsightCount = (id: string): number => {
    if (!insights) return 0;
    const insightMap: Record<string, number> = {
      priority: insights.aiPriority,
      negative: insights.negativeSentiment,
      slaRisk: insights.slaRisk,
    };
    return insightMap[id] || 0;
  };

  return (
    <div className="w-[220px] h-full bg-white border-r border-border flex flex-col shrink-0">
      {/* Header */}
      <div className="h-[72px] flex items-center justify-between px-4 border-b border-border">
        <h2 className="text-lg font-semibold text-text-primary">
          {t("inbox.conversations")}
        </h2>
        <button className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-text-secondary">
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Categories */}
      <div className="flex-1 overflow-y-auto">
        {/* Channel Selector */}
        {channels.length > 1 && (
          <div className="px-4 py-4 border-b border-border">
            <div className="flex items-center gap-2 mb-2 text-xs font-medium text-text-secondary uppercase tracking-wider">
              <MessageCircle className="w-3.5 h-3.5" />
              <span>{t("inbox.channel")}</span>
            </div>
            <Select
              value={selectedChannelId || ""}
              onChange={(val) => onChannelChange?.(val || null)}
              options={[
                { value: "", label: t("inbox.allChannels") },
                ...channels.map((c) => ({
                  value: c._id,
                  label: c.phoneNumber
                    ? `${c.name} (${c.phoneNumber})`
                    : c.name,
                })),
              ]}
              className="h-9 text-xs"
            />
          </div>
        )}

        {/* Inbox Section */}
        <div className="px-3 py-2">
          <button
            onClick={() => toggleSection("inbox")}
            className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-medium text-text-secondary uppercase tracking-wider hover:text-text-primary"
          >
            <span>{t("nav.inbox")}</span>
            {expandedSections.inbox ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>

          {expandedSections.inbox && (
            <div className="mt-1 space-y-0.5">
              {inboxCategories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => onFilterChange(cat.id)}
                  className={`
                    w-full flex items-center justify-between px-2 py-1.5 rounded text-sm transition-colors
                    ${
                      activeFilter === cat.id
                        ? "bg-primary/10 text-primary font-medium"
                        : "hover:bg-gray-50 text-text-primary"
                    }
                  `}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <cat.icon
                      className={`w-3.5 h-3.5 shrink-0 ${activeFilter === cat.id ? "text-primary" : "text-text-secondary"}`}
                    />
                    <span className="truncate text-xs">{t(cat.labelKey)}</span>
                  </div>
                  {getCount(cat.id) > 0 && (
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded shrink-0 ml-1 ${
                        activeFilter === cat.id
                          ? "bg-primary text-white"
                          : "bg-gray-100 text-text-secondary"
                      }`}
                    >
                      {getCount(cat.id)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* AI Insights Section */}
        <div className="px-3 py-2 border-t border-border">
          <button
            onClick={() => toggleSection("insights")}
            className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-medium text-text-secondary uppercase tracking-wider hover:text-text-primary"
          >
            <span>{t("inbox.aiInsights")}</span>
            {expandedSections.insights ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>

          {expandedSections.insights && (
            <div className="mt-1 space-y-0.5">
              {aiInsightCategories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => onFilterChange(cat.id)}
                  className={`
                    w-full flex items-center justify-between px-2 py-1.5 rounded text-sm transition-colors
                    ${
                      activeFilter === cat.id
                        ? "bg-primary/10 text-primary font-medium"
                        : "hover:bg-gray-50 text-text-primary"
                    }
                  `}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <cat.icon
                      className={`w-3.5 h-3.5 shrink-0 ${activeFilter === cat.id ? "text-primary" : "text-text-secondary"}`}
                    />
                    <span className="truncate text-xs">{t(cat.labelKey)}</span>
                  </div>
                  {getInsightCount(cat.id) > 0 && (
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded shrink-0 ml-1 ${
                        activeFilter === cat.id
                          ? "bg-primary text-white"
                          : "bg-accent text-white"
                      }`}
                    >
                      {getInsightCount(cat.id)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Tags Section */}
        <div className="px-3 py-2 border-t border-border">
          <button
            onClick={() => toggleSection("tags")}
            className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-medium text-text-secondary uppercase tracking-wider hover:text-text-primary"
          >
            <span>{t("inbox.tags")}</span>
            {expandedSections.tags ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>

          {expandedSections.tags && (
            <div className="mt-1 space-y-0.5">
              {counts?.tags
                ?.filter((tag) => tag && tag._id)
                .map((tag) => (
                  <button
                    key={tag._id}
                    onClick={() => onFilterChange(`tag:${tag._id}`)}
                    className={`
                    w-full flex items-center justify-between px-2 py-1.5 rounded text-sm transition-colors
                    ${
                      activeFilter === `tag:${tag._id}`
                        ? "bg-primary/10 text-primary font-medium"
                        : "hover:bg-gray-50 text-text-primary"
                    }
                  `}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Tag
                        className={`w-3.5 h-3.5 shrink-0 ${activeFilter === `tag:${tag._id}` ? "" : "opacity-70"}`}
                        style={{ color: tag.color }}
                      />
                      <span className="truncate text-xs">{tag.label}</span>
                    </div>
                    {tag.count > 0 && (
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded shrink-0 ml-1 ${
                          activeFilter === `tag:${tag._id}`
                            ? "bg-primary text-white"
                            : "bg-gray-100 text-text-secondary"
                        }`}
                      >
                        {tag.count}
                      </span>
                    )}
                  </button>
                ))}
              {(!counts?.tags || counts.tags.length === 0) && (
                <div className="px-2 py-1.5 text-xs text-text-secondary italic">
                  {t("inbox.noTags")}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Team Section */}
        <div className="px-3 py-2 border-t border-border">
          <button
            onClick={() => toggleSection("team")}
            className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-medium text-text-secondary uppercase tracking-wider hover:text-text-primary"
          >
            <span>{t("inbox.team")}</span>
            {expandedSections.team ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>

          {expandedSections.team && (
            <div className="mt-1 p-3 text-sm text-text-secondary text-center">
              <Users className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p>{t("inbox.teamInboxSoon")}</p>
            </div>
          )}
        </div>

        {/* Manage Section */}
        <div className="px-3 py-2 border-t border-border">
          <button
            onClick={() => toggleSection("manage")}
            className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-medium text-text-secondary uppercase tracking-wider hover:text-text-primary"
          >
            <span>{t("inbox.manage")}</span>
            {expandedSections.manage ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>

          {expandedSections.manage && (
            <div className="mt-1 p-3 text-sm text-text-secondary text-center">
              <Settings2 className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p>{t("inbox.managementSoon")}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
