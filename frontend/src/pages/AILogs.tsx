import React, { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  RefreshCw,
  Trash2,
  Filter,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle,
  Info,
  Zap,
  Clock,
  MessageSquare,
  Image,
  Brain,
  Wrench,
  XCircle,
  ChevronLeft,
} from "lucide-react";
import { PageHeader } from "../components/layout";
import { Button, Select } from "../components/common";
import { aiLogsApi } from "../lib/api";

interface AILogEntry {
  id: string;
  timestamp: string;
  type:
    | "classification"
    | "simple_reply"
    | "complex_reply"
    | "media_analysis"
    | "decision"
    | "tool_calling"
    | "error"
    | "info";
  conversationId?: string;
  messageId?: string;
  channelId?: string;
  assistantId?: string;
  model?: string;
  modelSource?: "D" | "O";
  input?: string;
  output?: string;
  duration?: number;
  tokens?: {
    input?: number;
    output?: number;
    total?: number;
  };
  metadata?: Record<string, any>;
  level: "info" | "warn" | "error";
}

interface AILogStats {
  total: number;
  byType: Record<string, number>;
  byLevel: Record<string, number>;
  avgDuration: number;
  errorRate: number;
}

const typeIcons: Record<string, React.ReactNode> = {
  classification: <Brain className="w-4 h-4" />,
  simple_reply: <MessageSquare className="w-4 h-4" />,
  complex_reply: <Zap className="w-4 h-4" />,
  media_analysis: <Image className="w-4 h-4" />,
  decision: <CheckCircle className="w-4 h-4" />,
  tool_calling: <Wrench className="w-4 h-4" />,
  error: <XCircle className="w-4 h-4" />,
  info: <Info className="w-4 h-4" />,
};

export const AILogs: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [logs, setLogs] = useState<AILogEntry[]>([]);
  const [stats, setStats] = useState<AILogStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState({
    type: "",
    level: "",
  });
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Dynamic type labels using translation
  const getTypeLabel = (type: string): string => {
    const typeMap: Record<string, string> = {
      classification: t('aiLogs.types.classification'),
      simple_reply: t('aiLogs.types.simpleReply'),
      complex_reply: t('aiLogs.types.complexReply'),
      media_analysis: t('aiLogs.types.mediaAnalysis'),
      decision: t('aiLogs.types.decision'),
      tool_calling: t('aiLogs.types.toolCalling'),
      error: t('aiLogs.types.error'),
      info: t('aiLogs.types.info'),
    };
    return typeMap[type] || type;
  };

  const getLevelLabel = (level: AILogEntry["level"]): string => {
    return t(`aiLogs.levels.${level}`);
  };

  const fetchLogs = useCallback(async () => {
    try {
      setError(null);
      const [logsResult, statsResult] = await Promise.all([
        aiLogsApi.getLogs({
          type: filters.type || undefined,
          level: filters.level || undefined,
          limit: 200,
        }),
        aiLogsApi.getStats(),
      ]);
      setLogs(logsResult.logs);
      setStats(statsResult);
    } catch (err: any) {
      console.error("Failed to fetch AI logs:", err);
      setError(err?.message || "Failed to fetch AI logs");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs]);

  const handleClearLogs = async () => {
    if (!confirm(t('aiLogs.clearConfirm'))) return;

    try {
      await aiLogsApi.clearLogs();
      setLogs([]);
      setStats(null);
    } catch (error) {
      console.error("Failed to clear logs:", error);
    }
  };

  const toggleExpanded = (logId: string) => {
    setExpandedLogs((prev) => {
      const next = new Set(prev);
      if (next.has(logId)) {
        next.delete(logId);
      } else {
        next.add(logId);
      }
      return next;
    });
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString(i18n.language, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  };

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString(i18n.language, {
      month: "short",
      day: "numeric",
    });
  };

  // Calculate pagination
  const totalPages = Math.max(1, Math.ceil(logs.length / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedLogs = logs.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
      <PageHeader
        title={t('aiLogs.title')}
        subtitle={t('aiLogs.subtitle')}
        actions={
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-gray-500">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-gray-300"
              />
              {t('aiLogs.autoRefresh')}
            </label>
            <Button
              variant="secondary"
              size="sm"
              onClick={fetchLogs}
              disabled={loading}
            >
              <RefreshCw
                className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
              />
              {t('aiLogs.refresh')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleClearLogs}
              className="text-error hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" />
              {t('aiLogs.clear')}
            </Button>
          </div>
        }
      />

      <div className="mt-6">
        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 animate-spin text-gray-400 mr-2" />
            <span className="text-gray-500">{t('aiLogs.loading')}</span>
          </div>
        )}

        {/* Error Message */}
        {error && !loading && (
          <div className="mb-6 p-4 bg-white border border-gray-200 rounded-xl flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-gray-400" />
            <p className="text-gray-600">{error}</p>
            <Button
              variant="secondary"
              size="sm"
              onClick={fetchLogs}
              className="ml-auto"
            >
              {t('aiLogs.retry')}
            </Button>
          </div>
        )}

        {/* Stats Cards */}
        {!loading && stats && (
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-500">{t('aiLogs.totalLogs')}</span>
                <MessageSquare className="w-5 h-5 text-gray-400" />
              </div>
              <p className="text-2xl font-semibold text-gray-900">{stats.total}</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-500">{t('aiLogs.avgDuration')}</span>
                <Clock className="w-5 h-5 text-gray-400" />
              </div>
              <p className="text-2xl font-semibold text-gray-900">{stats.avgDuration}ms</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-500">{t('aiLogs.errorRate')}</span>
                <AlertCircle className="w-5 h-5 text-gray-400" />
              </div>
              <p className="text-2xl font-semibold text-gray-900">{stats.errorRate}%</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-500">{t('aiLogs.byType')}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {Object.entries(stats.byType).map(([type, count]) => (
                  <span
                    key={type}
                    className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600"
                  >
                    {getTypeLabel(type)}: {count}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Filters and Logs Table */}
        {!loading && (
          <>
            <div className="flex items-center gap-4 mb-4">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-600">{t('aiLogs.filters')}:</span>
              </div>
              <div className="w-40">
                <Select
                  value={filters.type}
                  onChange={(value) =>
                    setFilters((prev) => ({ ...prev, type: value }))
                  }
                  options={[
                    { value: "", label: t('aiLogs.allTypes') },
                    { value: "classification", label: t('aiLogs.types.classification') },
                    { value: "simple_reply", label: t('aiLogs.types.simpleReply') },
                    { value: "complex_reply", label: t('aiLogs.types.complexReply') },
                    { value: "media_analysis", label: t('aiLogs.types.mediaAnalysis') },
                    { value: "decision", label: t('aiLogs.types.decision') },
                    { value: "tool_calling", label: t('aiLogs.types.toolCalling') },
                    { value: "error", label: t('aiLogs.types.error') },
                    { value: "info", label: t('aiLogs.types.info') },
                  ]}
                />
              </div>
              <div className="w-32">
                <Select
                  value={filters.level}
                  onChange={(value) =>
                    setFilters((prev) => ({ ...prev, level: value }))
                  }
                  options={[
                    { value: "", label: t('aiLogs.allLevels') },
                    { value: "info", label: t('aiLogs.levels.info') },
                    { value: "warn", label: t('aiLogs.levels.warn') },
                    { value: "error", label: t('aiLogs.levels.error') },
                  ]}
                />
              </div>
            </div>

            {/* Logs Table */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-8"></th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                      {t('aiLogs.time')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                      {t('aiLogs.type')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                      {t('aiLogs.level')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('aiLogs.output')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                      {t('aiLogs.duration')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-12 text-center text-gray-500"
                      >
                        {loading
                          ? t('aiLogs.loading')
                          : t('aiLogs.noLogs')}
                      </td>
                    </tr>
                  ) : (
                    paginatedLogs.map((log) => (
                      <React.Fragment key={log.id}>
                        <tr
                          className={`hover:bg-gray-50 cursor-pointer ${
                            log.level === "error" ? "bg-gray-50" : ""
                          }`}
                          onClick={() => toggleExpanded(log.id)}
                        >
                          <td className="px-4 py-3">
                            {expandedLogs.has(log.id) ? (
                              <ChevronDown className="w-4 h-4 text-gray-400" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-gray-400" />
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                            <div>{formatTimestamp(log.timestamp)}</div>
                            <div className="text-xs">
                              {formatDate(log.timestamp)}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-600">
                              {typeIcons[log.type]}
                              {getTypeLabel(log.type)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                              {getLevelLabel(log.level)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 max-w-md truncate">
                            {log.output || log.input || "-"}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {log.duration ? `${log.duration}ms` : "-"}
                          </td>
                        </tr>
                        {expandedLogs.has(log.id) && (
                          <tr className="bg-gray-50">
                            <td colSpan={6} className="px-6 py-4">
                              <div className="grid grid-cols-2 gap-6 text-sm">
                                <div>
                                  <h4 className="font-medium text-gray-900 mb-2">
                                    {t('aiLogs.input')}
                                  </h4>
                                  <pre className="bg-white p-3 rounded-lg border border-gray-200 text-xs overflow-x-auto whitespace-pre-wrap">
                                    {log.input || t('aiLogs.notAvailable')}
                                  </pre>
                                </div>
                                <div>
                                  <h4 className="font-medium text-gray-900 mb-2">
                                    {t('aiLogs.output')}
                                  </h4>
                                  <pre className="bg-white p-3 rounded-lg border border-gray-200 text-xs overflow-x-auto whitespace-pre-wrap">
                                    {log.output || t('aiLogs.notAvailable')}
                                  </pre>
                                </div>
                                {log.messageId && (
                                  <div>
                                    <h4 className="font-medium text-gray-900 mb-1">
                                      {t('aiLogs.messageId')}
                                    </h4>
                                    <code className="text-xs bg-gray-100 px-2 py-1 rounded break-all">
                                      {log.messageId}
                                    </code>
                                  </div>
                                )}
                                {log.conversationId && (
                                  <div>
                                    <h4 className="font-medium text-gray-900 mb-1">
                                      {t('aiLogs.conversationId')}
                                    </h4>
                                    <code className="text-xs bg-gray-100 px-2 py-1 rounded break-all">
                                      {log.conversationId}
                                    </code>
                                  </div>
                                )}
                                {log.channelId && (
                                  <div>
                                    <h4 className="font-medium text-gray-900 mb-1">
                                      {t('aiLogs.channelId')}
                                    </h4>
                                    <code className="text-xs bg-gray-100 px-2 py-1 rounded break-all">
                                      {log.channelId}
                                    </code>
                                  </div>
                                )}
                                {log.assistantId && (
                                  <div>
                                    <h4 className="font-medium text-gray-900 mb-1">
                                      {t('aiLogs.assistantId')}
                                    </h4>
                                    <code className="text-xs bg-gray-100 px-2 py-1 rounded break-all">
                                      {log.assistantId}
                                    </code>
                                  </div>
                                )}
                                {log.model && (
                                  <div>
                                    <h4 className="font-medium text-gray-900 mb-1">
                                      {t('aiLogs.model')}
                                    </h4>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                                        {log.model}
                                      </code>
                                      {log.modelSource && (
                                        <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">
                                          {t('aiLogs.modelSource')}: {log.modelSource}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )}
                                {log.tokens && (
                                  <div>
                                    <h4 className="font-medium text-gray-900 mb-1">
                                      {t('aiLogs.tokens')}
                                    </h4>
                                    <span className="text-xs text-gray-600">
                                      {t('aiLogs.tokenInput')}: {log.tokens.input || 0} | {t('aiLogs.tokenOutput')}:{" "}
                                      {log.tokens.output || 0} | {t('aiLogs.tokenTotal')}:{" "}
                                      {log.tokens.total || 0}
                                    </span>
                                  </div>
                                )}
                                {log.metadata &&
                                  Object.keys(log.metadata).length > 0 && (
                                    <div className="col-span-2">
                                      <h4 className="font-medium text-gray-900 mb-2">
                                        {t('aiLogs.metadata')}
                                      </h4>
                                      <pre className="bg-white p-3 rounded-lg border border-gray-200 text-xs overflow-x-auto">
                                        {JSON.stringify(log.metadata, null, 2)}
                                      </pre>
                                    </div>
                                  )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))
                  )}
                </tbody>
              </table>

              {/* Pagination Controls */}
              {logs.length > 0 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
                  <div className="text-sm text-gray-500">
                    {t('aiLogs.showing')} {startIndex + 1} {t('aiLogs.to')} {Math.min(endIndex, logs.length)} {t('aiLogs.of')} {logs.length.toLocaleString()} {t('aiLogs.logsUnit')}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>

                    {(() => {
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

                      return pages.map((page, idx) =>
                        typeof page === "number" ? (
                          <button
                            key={idx}
                            onClick={() => setCurrentPage(page)}
                            className={`
                              min-w-[32px] h-8 px-2 text-sm rounded
                              ${
                                currentPage === page
                                  ? "bg-primary text-white"
                                  : "text-gray-600 hover:bg-gray-100"
                              }
                            `}
                          >
                            {page}
                          </button>
                        ) : (
                          <span key={idx} className="px-1 text-gray-400">
                            ...
                          </span>
                        )
                      );
                    })()}

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
      </div>
    </div>
  );
};
