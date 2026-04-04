import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { assistantsApi } from "../../lib/api";
import { ToastContainer, useToasts } from "../../components/common";
import type { Assistant } from "../../lib/types";
import { useAssistantSkillLibrary } from "./useAssistantSkillLibrary";
import { SkillLibraryPanel } from "./SkillLibraryPanel";

export const AssistantSkillLibrary: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [assistant, setAssistant] = useState<Assistant | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toasts, dismissToast, showSuccess, showError } = useToasts();

  const skillLib = useAssistantSkillLibrary(id, assistant, setAssistant, {
    showSuccess,
    showError,
  });

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      try {
        const data = await assistantsApi.get(id);
        setAssistant(data);
      } catch {
        navigate("/ai-assistant");
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, [id, navigate]);

  const teamLabel =
    assistant?.departmentName?.trim() ||
    assistant?.name?.trim() ||
    "";

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!assistant || !id) {
    return null;
  }

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <header className="shrink-0 border-b border-gray-200 bg-white px-6 py-4">
        <nav
          className="mb-3 flex flex-wrap items-center gap-1.5 text-sm text-gray-500"
          aria-label="Breadcrumb"
        >
          <Link
            to={`/ai-assistant/${id}`}
            className="hover:text-gray-900"
          >
            {t("assistants.orgChart.department")}
            {teamLabel ? ` (${teamLabel})` : ""}
          </Link>
          <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
          <span className="font-medium text-gray-900">
            {t("assistants.playground.skillLibrary")}
          </span>
        </nav>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate(`/ai-assistant/${id}`)}
            className="rounded-lg p-2 hover:bg-gray-100"
            aria-label={t("assistants.skillLibrary.backToAiTeam")}
          >
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">
              {t("assistants.playground.skillLibrary")}
            </h1>
            {teamLabel ? (
              <p className="text-sm text-gray-500">{teamLabel}</p>
            ) : null}
          </div>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto p-6 scrollbar-thin">
        <div className="mx-auto max-w-5xl">
          <SkillLibraryPanel lib={skillLib} />
        </div>
      </main>
    </div>
  );
};
