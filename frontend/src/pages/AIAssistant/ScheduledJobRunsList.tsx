import React from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import type { ScheduledJobRun } from "../../lib/types";

type Props = {
  runs: ScheduledJobRun[];
  loading: boolean;
  maxHeightClass?: string;
};

export const ScheduledJobRunsList: React.FC<Props> = ({
  runs,
  loading,
  maxHeightClass = "max-h-[60vh]",
}) => {
  const { t } = useTranslation();

  if (loading) {
    return <Loader2 className="w-8 h-8 animate-spin mx-auto" />;
  }

  return (
    <ul className={`space-y-2 ${maxHeightClass} overflow-y-auto text-sm`}>
      {runs.length === 0 ? (
        <li className="text-text-secondary">{t("assistants.scheduledTasks.noRuns")}</li>
      ) : (
        runs.map((r) => (
          <li key={r._id} className="border border-border rounded p-3">
            <div className="flex justify-between gap-2">
              <span className="font-medium">{r.status}</span>
              <span className="text-text-secondary text-xs">
                {format(new Date(r.startedAt), "PPpp")}
              </span>
            </div>
            {r.summarySnippet && (
              <p className="mt-1 text-text-secondary line-clamp-3">{r.summarySnippet}</p>
            )}
            {r.error && <p className="mt-1 text-error text-xs">{r.error}</p>}
            {r.deliveryStatus && (
              <p className="mt-1 text-xs text-text-secondary">
                {t("assistants.scheduledTasks.delivery")}: {r.deliveryStatus}{" "}
                {r.deliveryDetail ? `— ${r.deliveryDetail}` : ""}
              </p>
            )}
          </li>
        ))
      )}
    </ul>
  );
};
