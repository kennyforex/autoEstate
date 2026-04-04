import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { format, formatDistanceToNow } from "date-fns";
import {
  Copy,
  History,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { PageHeader } from "../../components/layout";
import { Button, ConfirmModal, Modal } from "../../components/common";
import { assistantsApi, scheduledJobsApi } from "../../lib/api";
import type { Assistant, ScheduledJob, ScheduledJobRun } from "../../lib/types";
import { ScheduledJobRunsList } from "./ScheduledJobRunsList";
import { assistantLabel, scheduleSummary } from "./scheduledTasksShared";

const LIST_PATH = "/ai-assistant/scheduled-tasks";

export const ScheduledTasksListPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [stats, setStats] = useState<{
    enabledCount: number;
    total: number;
    nextWakeAt?: string;
  } | null>(null);
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<ScheduledJob | null>(null);
  const [historyJob, setHistoryJob] = useState<ScheduledJob | null>(null);
  const [historyRuns, setHistoryRuns] = useState<ScheduledJobRun[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [jRes, asst] = await Promise.all([
        scheduledJobsApi.list(),
        assistantsApi.list("active"),
      ]);
      setJobs(jRes.jobs);
      setStats(jRes.stats);
      setAssistants(asst);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const displayJobs = useMemo(() => {
    const list = [...jobs];
    list.sort((a, b) => {
      const ta = a.nextRunAt ? new Date(a.nextRunAt).getTime() : Number.MAX_SAFE_INTEGER;
      const tb = b.nextRunAt ? new Date(b.nextRunAt).getTime() : Number.MAX_SAFE_INTEGER;
      return ta - tb;
    });
    return list;
  }, [jobs]);

  const goEdit = (job: ScheduledJob) => {
    navigate(`${LIST_PATH}/${job._id}/edit`);
  };

  const handleRemove = async () => {
    if (!deleteTarget) return;
    try {
      await scheduledJobsApi.remove(deleteTarget._id);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      console.error(e);
    }
  };

  const openHistory = async (job: ScheduledJob) => {
    setHistoryJob(job);
    setHistoryLoading(true);
    try {
      const { runs } = await scheduledJobsApi.listRuns(job._id, { limit: 50 });
      setHistoryRuns(runs);
    } catch (e) {
      console.error(e);
      setHistoryRuns([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <PageHeader
        title={t("assistants.scheduledTasks.title")}
        subtitle={t("assistants.scheduledTasks.subtitle")}
        actions={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
              {t("common.refresh")}
            </Button>
            <Button size="sm" onClick={() => navigate(`${LIST_PATH}/new`)}>
              {t("assistants.scheduledTasks.newJob")}
            </Button>
          </div>
        }
      />

      <p className="text-xs text-text-secondary mb-4">{t("assistants.scheduledTasks.requiredHint")}</p>

      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="text-xs text-text-secondary uppercase tracking-wide">
              {t("assistants.scheduledTasks.statEnabled")}
            </div>
            <div className="text-lg font-semibold text-text-primary">{stats.enabledCount}</div>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="text-xs text-text-secondary uppercase tracking-wide">
              {t("assistants.scheduledTasks.statJobs")}
            </div>
            <div className="text-lg font-semibold text-text-primary">{stats.total}</div>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="text-xs text-text-secondary uppercase tracking-wide">
              {t("assistants.scheduledTasks.statNextWake")}
            </div>
            <div className="text-sm font-medium text-text-primary">
              {stats.nextWakeAt
                ? `${format(new Date(stats.nextWakeAt), "PPpp")} (${formatDistanceToNow(new Date(stats.nextWakeAt), { addSuffix: true })})`
                : "—"}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-12 text-text-secondary">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : displayJobs.length === 0 ? (
          <p className="text-text-secondary py-8">{t("assistants.scheduledTasks.empty")}</p>
        ) : (
          <ul className="space-y-3">
            {displayJobs.map((job) => (
              <li
                key={job._id}
                className="rounded-xl border border-border bg-white p-4 cursor-pointer transition-colors hover:border-border-strong"
                onClick={() => goEdit(job)}
              >
                <div className="flex justify-between gap-2 items-start">
                  <div>
                    <h3 className="font-semibold text-text-primary">{job.name}</h3>
                    <p className="text-xs text-text-secondary mt-1">
                      Cron {scheduleSummary(job)} ({job.timezone || "UTC"})
                    </p>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      job.enabled ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
                    }`}
                  >
                    {job.enabled
                      ? t("assistants.scheduledTasks.badgeActive")
                      : t("assistants.scheduledTasks.badgePaused")}
                  </span>
                </div>
                <p className="text-sm text-text-secondary mt-2 line-clamp-2">{job.taskPrompt}</p>
                <div className="text-xs text-text-secondary mt-2 flex flex-wrap gap-x-3 gap-y-1">
                  <span>
                    {t("assistants.scheduledTasks.next")}:{" "}
                    {job.nextRunAt
                      ? formatDistanceToNow(new Date(job.nextRunAt), { addSuffix: true })
                      : "—"}
                  </span>
                  <span>
                    {t("assistants.scheduledTasks.last")}:{" "}
                    {job.lastRunAt
                      ? formatDistanceToNow(new Date(job.lastRunAt), { addSuffix: true })
                      : "—"}
                  </span>
                  <span>
                    {t("assistants.scheduledTasks.agent")}:{" "}
                    {assistantLabel(assistants, job.assistantId)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" variant="secondary" onClick={() => goEdit(job)}>
                    {t("common.edit")}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      const j = await scheduledJobsApi.clone(job._id);
                      await load();
                      navigate(`${LIST_PATH}/${j._id}/edit`);
                    }}
                  >
                    <Copy className="w-3.5 h-3.5 mr-1" />
                    {t("assistants.scheduledTasks.clone")}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      await scheduledJobsApi.update(job._id, { enabled: !job.enabled });
                      await load();
                    }}
                  >
                    {job.enabled ? (
                      <>
                        <Pause className="w-3.5 h-3.5 mr-1" />
                        {t("assistants.scheduledTasks.pause")}
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 mr-1" />
                        {t("assistants.scheduledTasks.resume")}
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      await scheduledJobsApi.run(job._id);
                      await load();
                    }}
                  >
                    <Play className="w-3.5 h-3.5 mr-1" />
                    {t("assistants.scheduledTasks.run")}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => void openHistory(job)}>
                    <History className="w-3.5 h-3.5 mr-1" />
                    {t("assistants.scheduledTasks.history")}
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setDeleteTarget(job)}>
                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                    {t("common.remove")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmModal
        isOpen={!!deleteTarget}
        title={t("assistants.scheduledTasks.deleteTitle")}
        message={t("assistants.scheduledTasks.deleteBody")}
        confirmText={t("common.remove")}
        variant="danger"
        onConfirm={() => void handleRemove()}
        onClose={() => setDeleteTarget(null)}
      />

      <Modal
        isOpen={!!historyJob}
        onClose={() => setHistoryJob(null)}
        title={t("assistants.scheduledTasks.historyTitle")}
        size="lg"
      >
        <ScheduledJobRunsList runs={historyRuns} loading={historyLoading} />
      </Modal>
    </div>
  );
};
