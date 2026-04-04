import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ChevronRight, Loader2, Play } from "lucide-react";
import { Button, Input, Select, Textarea } from "../../components/common";
import { assistantsApi, channelsApi, scheduledJobsApi } from "../../lib/api";
import type { Assistant, Channel, ScheduledJob, ScheduledJobRun } from "../../lib/types";
import { ScheduledJobRunsList } from "./ScheduledJobRunsList";
import {
  assistantIdOfChannel,
  defaultScheduledTaskForm,
  jobToForm,
  type ScheduledTaskFormState,
} from "./scheduledTasksShared";

const LIST_PATH = "/ai-assistant/scheduled-tasks";

export const ScheduledTaskFormPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { jobId } = useParams<{ jobId: string }>();
  const isCreate = location.pathname === `${LIST_PATH}/new`;

  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [form, setForm] = useState<ScheduledTaskFormState>(defaultScheduledTaskForm);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pageLoading, setPageLoading] = useState(!isCreate);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [runs, setRuns] = useState<ScheduledJobRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);

  const editingId = isCreate ? null : jobId ?? null;

  const channelsForAssistant = useMemo(() => {
    const aid = form.assistantId;
    if (!aid) return [];
    return channels.filter((c) => assistantIdOfChannel(c) === aid);
  }, [channels, form.assistantId]);

  const loadRuns = useCallback(async (id: string) => {
    setRunsLoading(true);
    try {
      const { runs: list } = await scheduledJobsApi.listRuns(id, { limit: 50 });
      setRuns(list);
    } catch (e) {
      console.error(e);
      setRuns([]);
    } finally {
      setRunsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [asst, chList] = await Promise.all([
          assistantsApi.list("active"),
          channelsApi.list(),
        ]);
        if (cancelled) return;
        setAssistants(asst);
        setChannels(chList);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isCreate || !jobId) {
      setPageLoading(false);
      setForm(defaultScheduledTaskForm());
      setLoadError(null);
      return;
    }

    let cancelled = false;
    setPageLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const job = await scheduledJobsApi.get(jobId);
        if (cancelled) return;
        setForm(jobToForm(job));
      } catch (e: unknown) {
        if (cancelled) return;
        const err = e as { response?: { data?: { error?: string } } };
        setLoadError(err.response?.data?.error || String(e));
        setForm(defaultScheduledTaskForm());
      } finally {
        if (!cancelled) setPageLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isCreate, jobId]);

  useEffect(() => {
    if (!editingId) {
      setRuns([]);
      return;
    }
    void loadRuns(editingId);
  }, [editingId, loadRuns]);

  const handleSave = async () => {
    if (!form.name?.trim() || !form.taskPrompt?.trim() || !form.assistantId) {
      setFormError(t("assistants.scheduledTasks.validationRequired"));
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        description: (form.description || "").trim(),
        enabled: form.enabled !== false,
        assistantId: form.assistantId,
        scheduleKind: form.scheduleKind,
        intervalMinutes: form.scheduleKind === "interval" ? Number(form.intervalMinutes) || 30 : undefined,
        cronExpression:
          form.scheduleKind === "cron" ? (form.cronExpression || "").trim() : "",
        timezone: form.timezone || "Asia/Hong_Kong",
        sessionMode: form.sessionMode,
        wakeMode: form.wakeMode,
        taskPrompt: form.taskPrompt.trim(),
        timeoutSeconds: form.timeoutSeconds ? Number(form.timeoutSeconds) : undefined,
        resultDelivery: form.resultDelivery,
        channelSelection: form.channelSelection,
        channelId:
          form.channelSelection === "specific" && form.channelId ? form.channelId : undefined,
        recipientOverride: (form.recipientOverride || "").trim() || undefined,
      };
      if (editingId) {
        const updated = await scheduledJobsApi.update(editingId, body);
        setForm(jobToForm(updated));
        void loadRuns(editingId);
      } else {
        const created = await scheduledJobsApi.create(
          body as Parameters<typeof scheduledJobsApi.create>[0],
        );
        navigate(`${LIST_PATH}/${created._id}/edit`, { replace: true });
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setFormError(err.response?.data?.error || String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleRunNow = async () => {
    if (!editingId) return;
    try {
      await scheduledJobsApi.run(editingId);
      void loadRuns(editingId);
    } catch (e) {
      console.error(e);
    }
  };

  if (!isCreate && !jobId) {
    navigate(LIST_PATH, { replace: true });
    return null;
  }

  if (pageLoading) {
    return (
      <div className="p-6 max-w-3xl mx-auto flex justify-center py-24 text-text-secondary">
        <Loader2 className="w-10 h-10 animate-spin" />
      </div>
    );
  }

  if (!isCreate && loadError) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(LIST_PATH)}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          {t("assistants.scheduledTasks.backToList")}
        </Button>
        <p className="text-error">{loadError}</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate(LIST_PATH)} className="-ml-2 mb-2">
          <ArrowLeft className="w-4 h-4 mr-1" />
          {t("assistants.scheduledTasks.backToList")}
        </Button>
        <h1 className="text-2xl font-semibold text-text-primary">
          {editingId ? t("assistants.scheduledTasks.editJob") : t("assistants.scheduledTasks.newJob")}
        </h1>
        <p className="text-sm text-text-secondary mt-1">{t("assistants.scheduledTasks.formSubtitle")}</p>
      </div>

      <div className="rounded-xl border border-border bg-white p-6 space-y-6">
        {formError && <p className="text-sm text-error">{formError}</p>}

        <section className="space-y-3 border-b border-border pb-6">
          <h3 className="text-sm font-medium text-text-primary">
            {t("assistants.scheduledTasks.sectionBasics")}
          </h3>
          <p className="text-xs text-text-secondary">{t("assistants.scheduledTasks.sectionBasicsHint")}</p>
          <Input
            label={t("assistants.scheduledTasks.name")}
            value={form.name || ""}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <Input
            label={t("assistants.scheduledTasks.description")}
            value={form.description || ""}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder={t("assistants.scheduledTasks.descriptionPh")}
          />
          <Select
            label={t("assistants.scheduledTasks.assistant")}
            value={form.assistantId || ""}
            onChange={(v) => setForm((f) => ({ ...f, assistantId: v, channelId: undefined }))}
            placeholder={t("assistants.scheduledTasks.assistantPh")}
            options={assistants.map((a) => ({
              value: a._id,
              label: a.departmentName || a.name,
            }))}
          />
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              className="rounded border-border accent-primary"
              checked={form.enabled !== false}
              onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
            />
            <span>{t("assistants.scheduledTasks.scheduleActive")}</span>
          </label>
          <p className="text-xs text-text-secondary -mt-1">
            {t("assistants.scheduledTasks.scheduleActiveHint")}
          </p>
        </section>

        <section className="space-y-3 border-b border-border pb-6">
          <h3 className="text-sm font-medium text-text-primary">
            {t("assistants.scheduledTasks.sectionSchedule")}
          </h3>
          <p className="text-xs text-text-secondary">{t("assistants.scheduledTasks.sectionScheduleHint")}</p>
          <Select
            label={t("assistants.scheduledTasks.scheduleKind")}
            value={form.scheduleKind || "interval"}
            onChange={(v) =>
              setForm((f) => ({ ...f, scheduleKind: v as ScheduledJob["scheduleKind"] }))
            }
            options={[
              { value: "interval", label: t("assistants.scheduledTasks.everyN") },
              { value: "cron", label: t("assistants.scheduledTasks.cronExpr") },
            ]}
          />
          {form.scheduleKind === "interval" ? (
            <Input
              label={t("assistants.scheduledTasks.intervalMinutes")}
              type="number"
              min={1}
              max={59}
              value={String(form.intervalMinutes ?? 30)}
              onChange={(e) =>
                setForm((f) => ({ ...f, intervalMinutes: parseInt(e.target.value, 10) || 30 }))
              }
            />
          ) : (
            <Input
              label={t("assistants.scheduledTasks.cronExpression")}
              value={form.cronExpression || ""}
              onChange={(e) => setForm((f) => ({ ...f, cronExpression: e.target.value }))}
              placeholder="30 8 * * *"
            />
          )}
          <Input
            label={t("assistants.scheduledTasks.timezone")}
            value={form.timezone || ""}
            onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
          />
        </section>

        <section className="space-y-3 border-b border-border pb-6">
          <h3 className="text-sm font-medium text-text-primary">
            {t("assistants.scheduledTasks.sectionExecution")}
          </h3>
          <p className="text-xs text-text-secondary">{t("assistants.scheduledTasks.sectionExecutionHint")}</p>
          <Select
            label={t("assistants.scheduledTasks.sessionMode")}
            value={form.sessionMode || "isolated"}
            onChange={(v) =>
              setForm((f) => ({ ...f, sessionMode: v as ScheduledJob["sessionMode"] }))
            }
            options={[
              { value: "isolated", label: t("assistants.scheduledTasks.sessionIsolated") },
              { value: "main", label: t("assistants.scheduledTasks.sessionMain") },
            ]}
          />
          <Select
            label={t("assistants.scheduledTasks.wakeMode")}
            value={form.wakeMode || "next_heartbeat"}
            onChange={(v) =>
              setForm((f) => ({ ...f, wakeMode: v as ScheduledJob["wakeMode"] }))
            }
            options={[
              { value: "now", label: t("assistants.scheduledTasks.wakeNow") },
              { value: "next_heartbeat", label: t("assistants.scheduledTasks.wakeNext") },
            ]}
          />
          <Input
            label={t("assistants.scheduledTasks.timeout")}
            type="number"
            min={1}
            value={form.timeoutSeconds != null ? String(form.timeoutSeconds) : ""}
            onChange={(e) => {
              const v = e.target.value;
              setForm((f) => ({
                ...f,
                timeoutSeconds: v === "" ? undefined : parseInt(v, 10),
              }));
            }}
            placeholder={t("assistants.scheduledTasks.timeoutPh")}
          />
          <Textarea
            label={t("assistants.scheduledTasks.taskPrompt")}
            value={form.taskPrompt || ""}
            onChange={(e) => setForm((f) => ({ ...f, taskPrompt: e.target.value }))}
            rows={5}
            required
          />
        </section>

        <section className="space-y-3 border-b border-border pb-6">
          <h3 className="text-sm font-medium text-text-primary">
            {t("assistants.scheduledTasks.sectionDelivery")}
          </h3>
          <p className="text-xs text-text-secondary">{t("assistants.scheduledTasks.sectionDeliveryHint")}</p>
          <Select
            label={t("assistants.scheduledTasks.resultDelivery")}
            value={form.resultDelivery || "announce"}
            onChange={(v) =>
              setForm((f) => ({
                ...f,
                resultDelivery: v as ScheduledJob["resultDelivery"],
              }))
            }
            options={[
              { value: "announce", label: t("assistants.scheduledTasks.deliveryAnnounce") },
              { value: "none", label: t("assistants.scheduledTasks.deliveryNone") },
            ]}
          />
          <Select
            label={t("assistants.scheduledTasks.channel")}
            value={form.channelSelection || "last"}
            onChange={(v) =>
              setForm((f) => ({
                ...f,
                channelSelection: v as ScheduledJob["channelSelection"],
                channelId: v === "specific" ? f.channelId : undefined,
              }))
            }
            options={[
              { value: "last", label: t("assistants.scheduledTasks.channelLast") },
              { value: "specific", label: t("assistants.scheduledTasks.channelSpecific") },
              { value: "playground", label: t("assistants.scheduledTasks.channelPlayground") },
            ]}
          />
          {form.channelSelection === "playground" && (
            <p className="text-xs text-text-secondary">
              {t("assistants.scheduledTasks.channelPlaygroundHint")}
            </p>
          )}
          {form.channelSelection === "specific" && (
            <Select
              label={t("assistants.scheduledTasks.channelPick")}
              value={form.channelId || ""}
              onChange={(v) => setForm((f) => ({ ...f, channelId: v || undefined }))}
              placeholder={t("assistants.scheduledTasks.channelPickPh")}
              options={channelsForAssistant.map((c) => ({
                value: c._id,
                label: `${c.name} (${c.status})`,
              }))}
            />
          )}
          {form.channelSelection !== "playground" && (
            <Input
              label={t("assistants.scheduledTasks.recipient")}
              value={form.recipientOverride || ""}
              onChange={(e) => setForm((f) => ({ ...f, recipientOverride: e.target.value }))}
              placeholder={t("assistants.scheduledTasks.recipientPh")}
            />
          )}
        </section>

        <button
          type="button"
          className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
          onClick={() => setAdvancedOpen((o) => !o)}
        >
          <ChevronRight className={`w-4 h-4 transition-transform ${advancedOpen ? "rotate-90" : ""}`} />
          {t("assistants.scheduledTasks.advanced")}
        </button>
        {advancedOpen && editingId && (
          <p className="text-xs text-text-secondary font-mono break-all">ID: {editingId}</p>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            {editingId ? t("common.save") : t("assistants.scheduledTasks.create")}
          </Button>
          {editingId && (
            <Button variant="secondary" onClick={() => void handleRunNow()}>
              <Play className="w-4 h-4 mr-1" />
              {t("assistants.scheduledTasks.run")}
            </Button>
          )}
        </div>
      </div>

      {editingId && (
        <section className="mt-8 rounded-xl border border-border bg-white p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-1">
            {t("assistants.scheduledTasks.sectionRunHistory")}
          </h2>
          <p className="text-xs text-text-secondary mb-4">
            {t("assistants.scheduledTasks.sectionRunHistoryHint")}
          </p>
          <ScheduledJobRunsList runs={runs} loading={runsLoading} maxHeightClass="max-h-96" />
        </section>
      )}
    </div>
  );
};
