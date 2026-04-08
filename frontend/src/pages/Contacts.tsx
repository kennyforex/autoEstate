import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { formatDistanceToNow, format } from "date-fns";
import { Users, Search, MessageSquare, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "../components/layout";
import { Avatar, Input, Select, Button } from "../components/common";
import { contactsApi, channelsApi } from "../lib/api";
import type { ContactWithStats, Channel } from "../lib/types";

type SortColumn = "name" | "messageCount" | "lastChatDate" | "createdAt";

const PAGE_SIZE = 25;

/**
 * Convert ISO 3166-1 alpha-2 country code to flag emoji
 * Each letter is converted to its regional indicator symbol
 */
const countryCodeToFlag = (countryCode: string | undefined): string => {
  if (!countryCode || countryCode.length !== 2) return "";
  const codePoints = countryCode
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
};

export const Contacts: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<ContactWithStats[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedChannel, setSelectedChannel] = useState<string>("");
  const [sortColumn, setSortColumn] = useState<SortColumn>("lastChatDate");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const fetchContacts = useCallback(async () => {
    setIsLoading(true);
    try {
      const params: {
        channelId?: string;
        search?: string;
        limit: number;
        offset: number;
        sortBy: SortColumn;
        sortOrder: "asc" | "desc";
      } = {
        limit: PAGE_SIZE,
        offset: (currentPage - 1) * PAGE_SIZE,
        sortBy: sortColumn,
        sortOrder: sortOrder,
      };
      if (selectedChannel) {
        params.channelId = selectedChannel;
      }
      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }
      const result = await contactsApi.list(params);
      setContacts(result.contacts);
      setTotal(result.total);
    } catch (error) {
      console.error("Failed to fetch contacts:", error);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, sortColumn, sortOrder, selectedChannel, searchQuery]);

  const fetchChannels = async () => {
    try {
      const channelsList = await channelsApi.list();
      setChannels(channelsList);
    } catch (error) {
      console.error("Failed to fetch channels:", error);
    }
  };

  useEffect(() => {
    fetchChannels();
  }, []);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedChannel, sortColumn, sortOrder]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchContacts();
    }, 300);
    return () => clearTimeout(debounce);
  }, [fetchContacts]);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortOrder("desc");
    }
  };

  const getDisplayName = (contact: ContactWithStats) => {
    return contact.name || contact.phoneNumber || contact.whatsappId || t("contacts.unknown");
  };

  const getPhoneWithFlag = (contact: ContactWithStats) => {
    if (!contact.phoneNumber) return null;
    const flag = countryCodeToFlag(contact.country);
    return (
      <span className="inline-flex items-center gap-1.5">
        {flag && <span className="text-base" title={contact.country}>{flag}</span>}
        <span>{contact.phoneNumber}</span>
      </span>
    );
  };

  const getContactInfo = (contact: ContactWithStats) => {
    const parts: React.ReactNode[] = [];
    if (contact.phoneNumber) {
      parts.push(getPhoneWithFlag(contact));
    }
    if (contact.email) {
      parts.push(<span key="email">{contact.email}</span>);
    }
    if (parts.length === 0) return "-";
    return (
      <span className="inline-flex items-center gap-2">
        {parts.map((part, idx) => (
          <React.Fragment key={idx}>
            {idx > 0 && <span className="text-gray-300">•</span>}
            {part}
          </React.Fragment>
        ))}
      </span>
    );
  };

  const isRecentlyActive = (lastChatDate?: string) => {
    if (!lastChatDate) return false;
    const daysSinceLastChat =
      (Date.now() - new Date(lastChatDate).getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceLastChat <= 7;
  };

  const handleRowClick = (_contact: ContactWithStats) => {
    // Navigate to inbox filtered by this contact
    // For now, just navigate to inbox - can be enhanced later
    navigate("/inbox");
  };

  const SortableHeader: React.FC<{
    column: SortColumn;
    label: string;
    className?: string;
  }> = ({ column, label, className = "" }) => (
    <th
      className={`text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 ${className}`}
      onClick={() => handleSort(column)}
    >
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown
          className={`w-3 h-3 ${sortColumn === column ? "text-gray-700" : ""}`}
        />
      </div>
    </th>
  );

  const Pagination: React.FC = () => {
    if (total === 0) return null;

    const startItem = (currentPage - 1) * PAGE_SIZE + 1;
    const endItem = Math.min(currentPage * PAGE_SIZE, total);

    // Calculate visible page numbers
    const getPageNumbers = () => {
      const pages: (number | string)[] = [];
      const maxVisible = 5;
      
      if (totalPages <= maxVisible) {
        for (let i = 1; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        
        if (currentPage > 3) pages.push("...");
        
        const start = Math.max(2, currentPage - 1);
        const end = Math.min(totalPages - 1, currentPage + 1);
        
        for (let i = start; i <= end; i++) pages.push(i);
        
        if (currentPage < totalPages - 2) pages.push("...");
        
        pages.push(totalPages);
      }
      
      return pages;
    };

    return (
      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
        <div className="text-sm text-gray-500">
          {t("contacts.showing")} {startItem} {t("contacts.to")} {endItem} {t("contacts.of")} {total.toLocaleString()} {t("contacts.totalContacts")}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          
          {getPageNumbers().map((page, idx) => (
            typeof page === "number" ? (
              <button
                key={idx}
                onClick={() => setCurrentPage(page)}
                className={`
                  min-w-[32px] h-8 px-2 text-sm rounded
                  ${currentPage === page
                    ? "bg-primary text-white"
                    : "text-gray-600 hover:bg-gray-100"
                  }
                `}
              >
                {page}
              </button>
            ) : (
              <span key={idx} className="px-1 text-gray-400">...</span>
            )
          ))}
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <PageHeader
          title={t("contacts.title")}
          subtitle={`${total.toLocaleString()} ${t("contacts.totalContacts")}`}
        />

        {/* Filters */}
        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder={t("contacts.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="w-48">
            <Select
              value={selectedChannel}
              onChange={(value) => setSelectedChannel(value)}
              options={[
                { value: "", label: t("contacts.allChannels") },
                ...channels.map((ch) => ({ value: ch._id, label: ch.name })),
              ]}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-4 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          </div>
        ) : contacts.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-base font-semibold text-gray-900 mb-2">
              {searchQuery || selectedChannel ? t("contacts.noContactsFound") : t("contacts.noContactsYet")}
            </h3>
            <p className="text-sm text-gray-500">
              {searchQuery || selectedChannel
                ? t("contacts.adjustFilters")
                : t("contacts.contactsWillAppear")}
            </p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <SortableHeader column="name" label={t("contacts.contact")} />
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("contacts.contactInfo")}
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("contacts.channel")}
                  </th>
                  <SortableHeader column="messageCount" label={t("contacts.messages")} />
                  <SortableHeader column="lastChatDate" label={t("contacts.lastChat")} />
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("contacts.status")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {contacts.map((contact) => (
                  <tr
                    key={contact._id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => handleRowClick(contact)}
                  >
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar
                          name={getDisplayName(contact)}
                          src={contact.avatar}
                          size="sm"
                        />
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {getDisplayName(contact)}
                          </div>
                          {contact.company && (
                            <div className="text-xs text-gray-500">
                              {contact.company}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-500">
                      {getContactInfo(contact)}
                    </td>
                    <td className="px-4 py-4">
                      {contact.channelName ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-md bg-gray-100 text-xs font-medium text-gray-700">
                          {contact.channelName}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1.5 text-sm text-gray-600">
                        <MessageSquare className="w-4 h-4 text-gray-400" />
                        {contact.messageCount.toLocaleString()}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-500">
                      {contact.lastChatDate ? (
                        <span title={format(new Date(contact.lastChatDate), "PPpp")}>
                          {formatDistanceToNow(new Date(contact.lastChatDate), {
                            addSuffix: true,
                          })}
                        </span>
                      ) : (
                        <span className="text-gray-400">{t("contacts.never")}</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {isRecentlyActive(contact.lastChatDate) ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full bg-green-50 text-xs font-medium text-green-700">
                          {t("contacts.active")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-full bg-gray-100 text-xs font-medium text-gray-500">
                          {t("contacts.inactive")}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination />
          </div>
        )}
      </div>
    </div>
  );
};

export default Contacts;
