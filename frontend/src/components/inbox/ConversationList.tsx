import React from 'react';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import {
  Mail,
  Sparkles,
  AlertTriangle,
  Search,
  Filter,
  MoreHorizontal,
  ChevronDown,
} from 'lucide-react';
import { Avatar } from '../common';
import type { Conversation } from '../../lib/types';

interface ConversationListProps {
  conversations: Conversation[];
  selectedId?: string;
  onSelect: (conversation: Conversation) => void;
  activeFilter: string;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  selectedId,
  onSelect,
  activeFilter,
  searchQuery,
  onSearchChange,
}) => {
  const { t } = useTranslation();

  const filterLabels: Record<string, string> = {
    all: t('inbox.allMessage'),
    aiHandling: t('inbox.aiHandling'),
    manual: t('inbox.manual'),
    attention: t('inbox.attention'),
    assignedToMe: t('inbox.assignedToMe'),
    resolved: t('inbox.resolved'),
    spam: t('inbox.spam'),
    priority: t('inbox.aiPriority'),
    negative: t('inbox.negativeSentiment'),
    slaRisk: t('inbox.slaRisk'),
  };
  const getContactName = (conversation: Conversation): string => {
    if (typeof conversation.contactId === 'object') {
      const contact = conversation.contactId;
      return contact.name || contact.phoneNumber || contact.whatsappId || t('inbox.unknown');
    }
    return t('inbox.unknown');
  };

  const getContactAvatar = (conversation: Conversation): string | undefined => {
    if (typeof conversation.contactId === 'object') {
      return conversation.contactId.avatar;
    }
    return undefined;
  };

  const getLastMessage = (conversation: Conversation): string => {
    // Use lastMessageContent from the conversation (stored in DB)
    if (conversation.lastMessageContent) {
      return conversation.lastMessageContent.substring(0, 50);
    }
    // Fallback to messages array if available
    if (conversation.messages && conversation.messages.length > 0) {
      const lastMsg = conversation.messages[conversation.messages.length - 1];
      return lastMsg.content?.substring(0, 50) || '';
    }
    return '';
  };

  // Group conversations by date
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const groupedConversations = conversations.reduce((groups, conv) => {
    const convDate = new Date(conv.lastMessageAt || conv.createdAt);
    convDate.setHours(0, 0, 0, 0);
    
    const isToday = convDate.getTime() === today.getTime();
    const groupKey = isToday ? t('inbox.today') : t('inbox.earlier');
    
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(conv);
    return groups;
  }, {} as Record<string, Conversation[]>);

  return (
    <div className="w-[320px] h-full bg-white border-r border-border flex flex-col shrink-0">
      {/* Header - aligned with other panel headers */}
      <div className="h-[72px] flex items-center justify-between px-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Mail className="w-5 h-5 text-text-secondary" />
          <h3 className="font-semibold text-text-primary">
            {filterLabels[activeFilter] || t('inbox.allMessage')}
          </h3>
        </div>
        <button className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-gray-100 text-text-secondary">
          <MoreHorizontal className="w-5 h-5" />
        </button>
      </div>

      {/* Search - below header border */}
      <div className="px-4 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
          <input
            type="text"
            placeholder={t('inbox.searchMessage')}
            className="w-full h-10 pl-10 pr-10 bg-gray-50 border-0 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:bg-white"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          <button className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary">
            <Filter className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {Object.entries(groupedConversations).map(([group, convs]) => (
          <div key={group}>
            {/* Group Header */}
            <div className="flex items-center justify-between px-4 py-2 bg-gray-50">
              <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                {group}
              </span>
              <ChevronDown className="w-4 h-4 text-text-secondary" />
            </div>
            
            {/* Conversations */}
            <div>
              {convs.map((conversation) => (
                <button
                  key={conversation._id}
                  onClick={() => onSelect(conversation)}
                  className={`
                    w-full p-4 text-left transition-colors border-l-3
                    ${selectedId === conversation._id
                      ? 'bg-primary/5 border-l-primary'
                      : 'hover:bg-gray-50 border-l-transparent'
                    }
                  `}
                >
                  <div className="flex items-start gap-3">
                    <div className="relative">
                      <Avatar
                        src={getContactAvatar(conversation)}
                        name={getContactName(conversation)}
                        size="md"
                      />
                      {conversation.unreadCount != null && conversation.unreadCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-error rounded-full border-2 border-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm text-text-primary truncate">
                          {getContactName(conversation)}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          {conversation.aiHandling && (
                            <Sparkles className="w-4 h-4 text-primary" />
                          )}
                          {/* Warning indicators - SLA Risk, Negative Sentiment, or High Priority */}
                          {(conversation.aiSignals?.slaRisk || 
                            conversation.aiSignals?.sentiment === 'negative' ||
                            ((conversation.aiSignals?.priority ?? 0) >= 7)) && (
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          )}
                          {/* Unread count indicator removed per user request */}
                          <span className="text-xs text-text-secondary">
                            {conversation.lastMessageAt &&
                              formatDistanceToNow(new Date(conversation.lastMessageAt), {
                                addSuffix: false,
                              })}
                          </span>
                        </div>
                      </div>
                      <p className="text-sm text-text-secondary truncate">
                        {getLastMessage(conversation)}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}

        {conversations.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <Mail className="w-12 h-12 text-gray-300 mb-3" />
            <p className="text-sm text-text-secondary">{t('inbox.noConversations')}</p>
          </div>
        )}
      </div>
    </div>
  );
};
