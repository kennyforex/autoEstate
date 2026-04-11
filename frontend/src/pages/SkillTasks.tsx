import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import {
  RefreshCw,
  Filter,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  ExternalLink,
  MessageSquare,
  Zap,
} from "lucide-react";
import { PageHeader } from "../components/layout";
import { Button, Select } from "../components/common";
import {
  skillTasksApi,
  type SkillTaskDetail,
  type SkillTaskListItem,
} from "../lib/api";

const PAGE_SIZE = 25;

function contactLabel(task: SkillTaskListItem): string {
  const c = task.contact;
  return (
    c.phoneNumber ||
    c.whatsappId ||
    c.name ||
    "—"
  );
}

export const SkillTasks: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<SkillTaskListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [tokensNote, setTokensNote] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [detailCache, setDetailCache] = useState<
    Record<string, SkillTaskDetail | "loading" | "error">
  >({});
  const [filters, setFilters] = useState({
    status: "",
    search: "",
    skillSlug: "",
  });
  const [page, setPage] = useState(0);

  const rowKey = (task: SkillTaskListItem) =>
    `${task.conversationId}:${task.goalId}`;

  const fetchTasks = useCallback(async () => {
    try {
      setError(null);
      const offset = page * PAGE_SIZE;
      const result = await skillTasksApi.list({
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.search.trim() ? { search: filters.search.trim() } : {}),
        ...(filters.skillSlug.trim()
          ? { skillSlug: filters.skillSlug.trim() }
          : {}),
        limit: PAGE_SIZE,
        offset,
      });
      setTasks(result.tasks);
      setTotal(result.total);
      setTokensNote(result.tokensNote);
    } catch (err: unknown) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : t("skillTasks.loadError"),
      );
    } finally {
      setLoading(false);
    }
  }, [filters.status, filters.search, filters.skillSlug, page, t]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    setPage(0);
  }, [filters.status, filters.search, filters.skillSlug]);

  const loadDetail = async (key: string, task: SkillTaskListItem) => {
    setDetailCache((prev) => {
      if (prev[key] && typeof prev[key] === "object") return prev;
      if (prev[key] === "loading") return prev;
      return { ...prev, [key]: "loading" };
    });
    try {
      const detail = await skillTasksApi.getDetail(
        task.conversationId,
        task.goalId,
      );
      setDetailCache((prev) => ({ ...prev, [key]: detail }));
    } catch {
      setDetailCache((prev) => ({ ...prev, [key]: "error" }));
    }
  };

  const toggleExpand = (task: SkillTaskListItem) => {
    const key = rowKey(task);
    let opened = false;
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        opened = false;
      } else {
        next.add(key);
        opened = true;
      }
      return next;
    });
    if (opened) {
      void loadDetail(key, task);
    }
  };

  const openInbox = (conversationId: string) => {
    navigate("/inbox", { state: { openConversationId: conversationId } });
  };

  const statusClass = (status: string) => {
    switch (status) {
      case "active":
        return "bg-emerald-50 text-emerald-800 border-emerald-200";
      case "suspended":
        return "bg-amber-50 text-amber-900 border-amber-200";
      case "completed":
        return "bg-slate-100 text-slate-700 border-slate-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <PageHeader
          title={t("skillTasks.title")}
          subtitle={t("skillTasks.subtitle")}
          actions={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setLoading(true);
                fetchTasks();
              }}
              disabled={loading}
            >
              <RefreshCw
                className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
              />
              {t("skillTasks.refresh")}
            </Button>
          }
        />

        {tokensNote && (
          <p className="mt-2 text-sm text-gray-500">{tokensNote}</p>
        )}

        <div className="mt-6">
          {loading && tasks.length === 0 && (
            <div className="flex items-center justify-center py-12 text-gray-500">
              <RefreshCw className="w-6 h-6 animate-spin mr-2" />
              {t("skillTasks.loading")}
            </div>
          )}

          {error && !loading && (
            <div className="mb-6 p-4 bg-white border border-gray-200 rounded-xl flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-gray-400 shrink-0" />
              <p className="text-gray-600">{error}</p>
              <Button
                variant="secondary"
                size="sm"
                className="ml-auto"
                onClick={() => {
                  setLoading(true);
                  fetchTasks();
                }}
              >
                {t("skillTasks.retry")}
              </Button>
            </div>
          )}

          {!loading && (
            <div className="flex flex-wrap items-end gap-4 mb-4">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-600">
                  {t("skillTasks.filters")}
                </span>
              </div>
              <div className="w-44">
                <Select
                  value={filters.status}
                  onChange={(value) =>
                    setFilters((p) => ({ ...p, status: value }))
                  }
                  options={[
                    { value: "", label: t("skillTasks.allStatuses") },
                    { value: "active", label: t("skillTasks.status.active") },
                    {
                      value: "suspended",
                      label: t("skillTasks.status.suspended"),
                    },
                    {
                      value: "completed",
                      label: t("skillTasks.status.completed"),
                    },
                  ]}
                />
              </div>
              <input
                type="search"
                placeholder={t("skillTasks.searchPlaceholder")}
                value={filters.search}
                onChange={(e) =>
                  setFilters((p) => ({ ...p, search: e.target.value }))
                }
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm w-56 bg-white"
              />
              <input
                type="text"
                placeholder={t("skillTasks.skillSlugPlaceholder")}
                value={filters.skillSlug}
                onChange={(e) =>
                  setFilters((p) => ({ ...p, skillSlug: e.target.value }))
                }
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm w-44 bg-white"
              />
            </div>
          )}

          {!loading && tasks.length === 0 && !error && (
            <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-500">
              {t("skillTasks.empty")}
            </div>
          )}

          {tasks.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-600">
                      <th className="w-8 p-3" />
                      <th className="p-3">{t("skillTasks.columns.status")}</th>
                      <th className="p-3">{t("skillTasks.columns.skill")}</th>
                      <th className="p-3">{t("skillTasks.columns.contact")}</th>
                      <th className="p-3">
                        {t("skillTasks.columns.assistant")}
                      </th>
                      <th className="p-3">{t("skillTasks.columns.started")}</th>
                      <th className="p-3">{t("skillTasks.columns.ended")}</th>
                      <th className="p-3">{t("skillTasks.columns.steps")}</th>
                      <th className="p-3">{t("skillTasks.columns.tokens")}</th>
                      <th className="p-3">{t("skillTasks.columns.aiMsgs")}</th>
                      <th className="p-3">{t("skillTasks.columns.inbox")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((task) => {
                      const key = rowKey(task);
                      const isOpen = expanded.has(key);
                      const detail = detailCache[key];
                      return (
                        <React.Fragment key={key}>
                          <tr className="border-b border-gray-100 hover:bg-gray-50/80">
                            <td className="p-2">
                              <button
                                type="button"
                                onClick={() => toggleExpand(task)}
                                className="p-1 rounded text-gray-500 hover:bg-gray-200"
                                aria-expanded={isOpen}
                              >
                                {isOpen ? (
                                  <ChevronDown className="w-4 h-4" />
                                ) : (
                                  <ChevronRight className="w-4 h-4" />
                                )}
                              </button>
                            </td>
                            <td className="p-3">
                              <span
                                className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${statusClass(task.status)}`}
                              >
                                {t(`skillTasks.status.${task.status}`)}
                              </span>
                            </td>
                            <td className="p-3">
                              <div className="font-medium text-gray-900">
                                {task.skillDisplayName || task.skillSlug}
                              </div>
                              {task.skillDisplayName && (
                                <div className="text-xs text-gray-500 font-mono">
                                  {task.skillSlug}
                                </div>
                              )}
                            </td>
                            <td className="p-3 text-gray-800">
                              {contactLabel(task)}
                            </td>
                            <td className="p-3 text-gray-800">
                              {task.assistant?.name || "—"}
                            </td>
                            <td className="p-3 text-gray-600 whitespace-nowrap">
                              {new Date(task.createdAt).toLocaleString()}
                            </td>
                            <td className="p-3 text-gray-600 whitespace-nowrap">
                              {task.completedAt
                                ? new Date(task.completedAt).toLocaleString()
                                : "—"}
                            </td>
                            <td className="p-3 text-gray-700">
                              {task.stepsSummary.total > 0
                                ? `${task.stepsSummary.completed}/${task.stepsSummary.total}`
                                : "—"}
                            </td>
                            <td className="p-3 text-gray-700 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1">
                                <Zap className="w-3.5 h-3.5 text-gray-400" />
                                {task.tokensApprox.total > 0
                                  ? task.tokensApprox.total.toLocaleString()
                                  : "—"}
                              </span>
                            </td>
                            <td className="p-3 text-gray-700">
                              <span className="inline-flex items-center gap-1">
                                <MessageSquare className="w-3.5 h-3.5 text-gray-400" />
                                {task.aiMessageCount}
                              </span>
                            </td>
                            <td className="p-3">
                              <button
                                type="button"
                                onClick={() => openInbox(task.conversationId)}
                                className="inline-flex items-center gap-1 text-primary hover:underline text-xs font-medium"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                {t("skillTasks.openInbox")}
                              </button>
                            </td>
                          </tr>
                          {isOpen && (
                            <tr className="bg-gray-50/90 border-b border-gray-100">
                              <td colSpan={11} className="p-4">
                                {detail === "loading" && (
                                  <p className="text-gray-500 text-sm">
                                    {t("skillTasks.detailLoading")}
                                  </p>
                                )}
                                {detail === "error" && (
                                  <p className="text-red-600 text-sm">
                                    {t("skillTasks.detailError")}
                                  </p>
                                )}
                                {detail &&
                                  detail !== "loading" &&
                                  detail !== "error" && (
                                    <div className="space-y-4 text-sm">
                                      <div>
                                        <h4 className="font-semibold text-gray-800 mb-2">
                                          {t("skillTasks.stepsTitle")}
                                        </h4>
                                        <ul className="space-y-1">
                                          {detail.steps.map((s) => (
                                            <li
                                              key={s.id}
                                              className="flex gap-2 text-gray-700"
                                            >
                                              <span className="text-gray-400 shrink-0">
                                                [{s.status}]
                                              </span>
                                              <span>{s.label}</span>
                                              {s.collectedValue && (
                                                <span className="text-gray-500">
                                                  → {s.collectedValue}
                                                </span>
                                              )}
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                      {Object.keys(detail.observations).length >
                                        0 && (
                                        <div>
                                          <h4 className="font-semibold text-gray-800 mb-2">
                                            {t("skillTasks.observationsTitle")}
                                          </h4>
                                          <dl className="grid gap-1 text-gray-700">
                                            {Object.entries(
                                              detail.observations,
                                            ).map(([k, v]) => (
                                              <div
                                                key={k}
                                                className="flex gap-2"
                                              >
                                                <dt className="font-medium text-gray-600 shrink-0">
                                                  {k}
                                                </dt>
                                                <dd>{v}</dd>
                                              </div>
                                            ))}
                                          </dl>
                                        </div>
                                      )}
                                      <div>
                                        <h4 className="font-semibold text-gray-800 mb-2">
                                          {t("skillTasks.aiMessagesTitle")}
                                        </h4>
                                        {detail.messages.length === 0 ? (
                                          <p className="text-gray-500">
                                            {t("skillTasks.noAiMessages")}
                                          </p>
                                        ) : (
                                          <ul className="space-y-3 max-h-80 overflow-y-auto">
                                            {detail.messages.map((m) => (
                                              <li
                                                key={m.id}
                                                className="border border-gray-200 rounded-lg p-3 bg-white"
                                              >
                                                <div className="text-xs text-gray-400 mb-1">
                                                  {new Date(
                                                    m.createdAt,
                                                  ).toLocaleString()}{" "}
                                                  · {m.contentType}
                                                </div>
                                                <div className="text-gray-800 whitespace-pre-wrap break-words">
                                                  {m.content}
                                                </div>
                                              </li>
                                            ))}
                                          </ul>
                                        )}
                                      </div>
                                      <p className="text-xs text-gray-500">
                                        <Link
                                          to="/ai-logs"
                                          className="text-primary hover:underline"
                                        >
                                          {t("skillTasks.viewAiLogs")}
                                        </Link>
                                      </p>
                                    </div>
                                  )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {total > PAGE_SIZE && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 text-sm text-gray-600">
                  <span>
                    {t("skillTasks.pageOf", {
                      from: page * PAGE_SIZE + 1,
                      to: Math.min((page + 1) * PAGE_SIZE, total),
                      total,
                    })}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={page <= 0}
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                    >
                      {t("skillTasks.prev")}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={page >= totalPages - 1}
                      onClick={() =>
                        setPage((p) => Math.min(totalPages - 1, p + 1))
                      }
                    >
                      {t("skillTasks.next")}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
