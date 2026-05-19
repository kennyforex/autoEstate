import React, { useMemo, useState } from "react";
import { Check, Loader2, Search } from "lucide-react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Toggle } from "../../components/common";
import { getLocalizedSkillToolCatalogEntry } from "../../lib/skillToolCatalogLocales";
import {
  hasParameterProperties,
  isRequiredToolSelected,
  resolveToolExample,
  toggleRequiredTool,
  type SkillToolOption,
} from "../../lib/skillToolOptions";

export interface SkillToolsTabProps {
  tools: SkillToolOption[];
  loading: boolean;
  requiredToolsCsv: string;
  onRequiredToolsChange: (csv: string) => void;
  readOnly: boolean;
  selectedToolId: string | null;
  onSelectToolId: (id: string) => void;
  t: TFunction;
}

function formatParameters(parameters?: Record<string, unknown>): string {
  if (!parameters) return "{}";
  const props = parameters.properties;
  if (!props || typeof props !== "object" || Array.isArray(props)) {
    return JSON.stringify(parameters, null, 2);
  }
  const required = Array.isArray(parameters.required)
    ? new Set(parameters.required as string[])
    : new Set<string>();
  const lines: string[] = [];
  for (const [name, schema] of Object.entries(
    props as Record<string, unknown>,
  )) {
    const s =
      schema && typeof schema === "object" && !Array.isArray(schema)
        ? (schema as Record<string, unknown>)
        : {};
    const type = String(s.type ?? "any");
    const desc =
      typeof s.description === "string" ? ` — ${s.description}` : "";
    const req = required.has(name) ? " (required)" : "";
    lines.push(`• ${name}: ${type}${req}${desc}`);
  }
  return lines.length > 0 ? lines.join("\n") : JSON.stringify(parameters, null, 2);
}

export const SkillToolsTab: React.FC<SkillToolsTabProps> = ({
  tools,
  loading,
  requiredToolsCsv,
  onRequiredToolsChange,
  readOnly,
  selectedToolId,
  onSelectToolId,
  t,
}) => {
  const { i18n } = useTranslation();
  const [search, setSearch] = useState("");

  const filteredTools = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tools;
    return tools.filter((tool) => {
      const localized = getLocalizedSkillToolCatalogEntry(
        tool.id,
        i18n.language,
      );
      const haystack = [
        tool.id,
        tool.label ?? "",
        localized?.description ?? tool.description ?? "",
        localized?.usage ?? tool.usage ?? "",
        localized?.parametersHelp ?? tool.parametersHelp ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [tools, search, i18n.language]);

  const selectedTool =
    tools.find((tool) => tool.id === selectedToolId) ??
    filteredTools[0] ??
    null;

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-sm text-text-secondary">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("common.loading")}
      </div>
    );
  }

  if (tools.length === 0) {
    return (
      <p className="text-sm text-amber-600">
        {t("assistants.playground.skillToolOptionsLoadFailed")}
      </p>
    );
  }

  const enabled = selectedTool
    ? isRequiredToolSelected(requiredToolsCsv, selectedTool.id)
    : false;

  const localizedTool = selectedTool
    ? getLocalizedSkillToolCatalogEntry(selectedTool.id, i18n.language)
    : undefined;
  const displayDescription =
    localizedTool?.description ?? selectedTool?.description ?? "";
  const displayUsage = localizedTool?.usage ?? selectedTool?.usage ?? "";
  const displayParametersHelp =
    localizedTool?.parametersHelp ?? selectedTool?.parametersHelp ?? "";
  const exampleText =
    localizedTool?.example ?? (selectedTool ? resolveToolExample(selectedTool) : "");
  const showExample =
    exampleText.trim().length > 0 && exampleText.trim() !== "{}";
  const showSchema = hasParameterProperties(selectedTool?.parameters);
  const hasAnyDetail = Boolean(
    displayDescription.trim() ||
      displayUsage.trim() ||
      displayParametersHelp.trim() ||
      showSchema ||
      showExample,
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col gap-3">
      <p className="shrink-0 text-xs leading-relaxed text-text-secondary">
        {t("assistants.playground.skillToolsTabHint")}
      </p>
      <div className="relative shrink-0">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("assistants.playground.skillToolsSearchPlaceholder")}
          className="w-full rounded-lg border border-gray-200 py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border border-gray-200">
        <nav
          className="w-[220px] shrink-0 overflow-y-auto border-r border-gray-200 bg-gray-50/80 p-1"
          aria-label={t("assistants.playground.skillEditorTabTools")}
        >
          {filteredTools.length === 0 ? (
            <p className="px-2 py-3 text-xs text-text-secondary">
              {t("assistants.playground.skillToolsNoSearchResults")}
            </p>
          ) : (
            filteredTools.map((tool) => {
              const isActive = tool.id === selectedTool?.id;
              const isOn = isRequiredToolSelected(requiredToolsCsv, tool.id);
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => onSelectToolId(tool.id)}
                  className={`mb-0.5 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                    isActive
                      ? "bg-white font-medium text-gray-900 shadow-sm"
                      : "text-gray-600 hover:bg-white/70 hover:text-gray-900"
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate capitalize">
                    {tool.label}
                  </span>
                  {isOn ? (
                    <Check
                      className="h-3.5 w-3.5 shrink-0 text-primary"
                      aria-hidden
                    />
                  ) : null}
                </button>
              );
            })
          )}
        </nav>
        <div className="min-w-0 flex-1 overflow-y-auto p-4">
          {selectedTool ? (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold capitalize text-gray-900">
                  {selectedTool.label}
                </h3>
                <p className="mt-0.5 font-mono text-xs text-text-secondary">
                  {selectedTool.id}
                </p>
              </div>
              {!hasAnyDetail ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {t("assistants.playground.skillToolsMissingMetadata")}
                </p>
              ) : null}
              {displayDescription.trim() ? (
                <section>
                  <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {t("assistants.playground.skillToolsDetailDescription")}
                  </h4>
                  <p className="text-sm leading-relaxed text-gray-700">
                    {displayDescription}
                  </p>
                </section>
              ) : null}
              {displayUsage.trim() ? (
                <section>
                  <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {t("assistants.playground.skillToolsDetailUsage")}
                  </h4>
                  <p className="text-sm leading-relaxed text-gray-700">
                    {displayUsage}
                  </p>
                </section>
              ) : null}
              {displayParametersHelp.trim() ? (
                <section>
                  <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {t("assistants.playground.skillToolsDetailParameters")}
                  </h4>
                  <pre className="whitespace-pre-wrap rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs leading-relaxed text-gray-800">
                    {displayParametersHelp}
                  </pre>
                </section>
              ) : null}
              {showSchema ? (
                <details className="rounded-lg border border-gray-100 bg-gray-50/80">
                  <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-gray-600">
                    {t("assistants.playground.skillToolsDetailSchema")}
                  </summary>
                  <pre className="whitespace-pre-wrap border-t border-gray-100 px-3 py-2 font-mono text-[11px] text-gray-700">
                    {formatParameters(selectedTool.parameters)}
                  </pre>
                </details>
              ) : null}
              {showExample ? (
                <section>
                  <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {t("assistants.playground.skillToolsDetailExample")}
                  </h4>
                  <pre className="overflow-x-auto rounded-lg border border-gray-100 bg-gray-50 p-3 font-mono text-xs text-gray-800">
                    {exampleText}
                  </pre>
                </section>
              ) : null}
              <Toggle
                checked={enabled}
                disabled={readOnly}
                onChange={(checked) => {
                  onRequiredToolsChange(
                    toggleRequiredTool(
                      requiredToolsCsv,
                      selectedTool.id,
                      checked,
                    ),
                  );
                }}
                label={t("assistants.playground.skillToolsEnableForSkill")}
                description={t(
                  "assistants.playground.skillYamlRequiredToolsHint",
                )}
              />
            </div>
          ) : (
            <p className="text-sm text-text-secondary">
              {t("assistants.playground.skillToolsSelectTool")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
