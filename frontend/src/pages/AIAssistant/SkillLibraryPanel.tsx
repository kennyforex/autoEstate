import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Code,
  Eye,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
  UploadCloud,
  X,
  Zap,
} from "lucide-react";
import {
  Button,
  Input,
  Textarea,
  Modal,
  ConfirmModal,
  Toggle,
} from "../../components/common";
import type { AssistantSkillLibrary } from "./useAssistantSkillLibrary";
import { parseRequiredTools } from "../../lib/skillToolOptions";
import type { Skill } from "../../lib/types";
import { SkillToolsTab } from "./SkillToolsTab";

function formatAssetSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface SkillLibraryPanelProps {
  lib: AssistantSkillLibrary;
}

export const SkillLibraryPanel: React.FC<SkillLibraryPanelProps> = ({ lib }) => {
  const { t } = useTranslation();
  const [assetRename, setAssetRename] = useState<{
    name: string;
    draft: string;
  } | null>(null);
  const [refRename, setRefRename] = useState<{
    name: string;
    draft: string;
  } | null>(null);

  const [skillToDeleteFromList, setSkillToDeleteFromList] =
    useState<Skill | null>(null);
  const [isDeletingListItem, setIsDeletingListItem] = useState(false);

  const {
    allSkills,
    isLoadingSkills,
    showCreateSkillModal,
    setShowCreateSkillModal,
    skillFormMode,
    setSkillFormMode,
    isCreatingSkill,
    skillForm,
    setSkillForm,
    skillUploadFile,
    setSkillUploadFile,
    skillFileInputRef,
    zipFileInputRef,
    handleCreateSkill,
    handleInstallZip,
    editingSkill,
    closeSkillEditorModal,
    openSkillEditorModal,
    isUpdatingSkill,
    handleUpdateSkill,
    skillDeleteConfirmOpen,
    setSkillDeleteConfirmOpen,
    isDeletingSkill,
    setIsDeletingSkill,
    skillEditorTab,
    setSkillEditorTab,
    refFiles,
    refSelectedName,
    refEditorContent,
    setRefEditorContent,
    refLoading,
    refSaving,
    refDocLoading,
    scriptList,
    viewingScript,
    setViewingScript,
    newScriptName,
    setNewScriptName,
    newScriptContent,
    setNewScriptContent,
    showNewScriptForm,
    setShowNewScriptForm,
    scriptSaving,
    scriptUploadRef,
    assetUploadRef,
    assetList,
    assetSaving,
    handleUploadAsset,
    handleDeleteAsset,
    handleRenameAsset,
    refUploadRef,
    handleSelectReferenceFile,
    handleSaveReferenceDocument,
    handleDeleteReference,
    handleUploadReference,
    handleDeleteReferenceFile,
    handleRenameReferenceFile,
    handleCreateScript,
    handleUploadScript,
    handleDeleteScript,
    handleViewScript,
    handleDeleteSkill,
    skillToolOptions,
    skillToolOptionsLoading,
    selectedSkillToolId,
    setSelectedSkillToolId,
  } = lib;

  useEffect(() => {
    if (!editingSkill) {
      setAssetRename(null);
      setRefRename(null);
    }
  }, [editingSkill]);

  return (
    <div className="space-y-5">
      <p className="text-xs leading-relaxed text-text-secondary">
        {t("assistants.skillLibrary.manageHint")}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setSkillFormMode("upload");
            setShowCreateSkillModal(true);
          }}
          className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-gray-50"
        >
          Upload .md
        </button>
        <button
          type="button"
          onClick={() => zipFileInputRef.current?.click()}
          className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-gray-50"
        >
          Upload Zip
        </button>
        <button
          type="button"
          onClick={() => {
            setSkillFormMode("form");
            setShowCreateSkillModal(true);
          }}
          className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-800"
        >
          + Create
        </button>
      </div>

      <input
        ref={zipFileInputRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          await handleInstallZip(file);
          e.target.value = "";
        }}
      />

      <div className="border-t border-gray-100" />

      {isLoadingSkills ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-lg bg-gray-50"
            />
          ))}
        </div>
      ) : allSkills.length === 0 ? (
        <div className="py-12 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
            <Zap className="h-6 w-6 text-gray-400" />
          </div>
          <p className="text-sm font-medium text-text-primary">No skills yet</p>
          <p className="mx-auto mt-1 max-w-[280px] text-xs text-text-secondary">
            Upload a skill directory (zip) with SKILL.md, reference.md,
            examples/, and scripts/.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {allSkills.map((skill) => {
            const initial = (skill.name?.trim() || "?").slice(0, 1).toUpperCase();
            const desc = (skill.description || "").trim() || skill.slug;
            return (
              <div
                key={skill._id}
                className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white transition-all hover:border-gray-300"
              >
                <div className="flex items-stretch gap-3 p-3">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-stretch gap-3 rounded-lg text-left outline-none ring-primary/40 focus-visible:ring-2"
                    onDoubleClick={() => void openSkillEditorModal(skill)}
                    title={t("assistants.playground.skillEditorDoubleClickHint")}
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-sm font-bold text-gray-600">
                      {initial}
                    </div>
                    <div className="min-w-0 flex-1 py-0.5">
                      <p className="truncate text-sm font-semibold leading-tight text-gray-900">
                        {skill.name}
                      </p>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-gray-500">
                        {desc}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-text-secondary">
                          {skill.slug}
                        </span>
                        {skill.hasReferences && (
                          <span
                            className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-600"
                            title="Has reference documentation"
                          >
                            ref
                          </span>
                        )}
                        {skill.hasExamples && (
                          <span
                            className="rounded bg-green-50 px-1.5 py-0.5 text-[10px] text-green-600"
                            title="Has examples"
                          >
                            ex
                          </span>
                        )}
                        {(skill.scripts || []).length > 0 && (
                          <span
                            className="rounded bg-purple-50 px-1.5 py-0.5 text-[10px] text-purple-600"
                            title={`Scripts: ${(skill.scripts || []).join(", ")}`}
                          >
                            {(skill.scripts || []).length} script
                            {(skill.scripts || []).length > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                  <div
                    className="flex shrink-0 flex-col items-end justify-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => void openSkillEditorModal(skill)}
                      className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-primary"
                      aria-label={t("common.edit")}
                      title={t("assistants.playground.skillEditorTitleEdit")}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    {!skill.isBuiltIn && (
                      <button
                        type="button"
                        onClick={() => setSkillToDeleteFromList(skill)}
                        className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-error"
                        aria-label={t("common.delete")}
                        title={t("assistants.skillLibrary.deleteSkillTitle")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreateSkillModal && (
        <Modal
          isOpen={showCreateSkillModal}
          onClose={() => {
            setShowCreateSkillModal(false);
            setSkillForm({
              skillId: "",
              name: "",
              description: "",
              instructions: "",
              triggerHints: "",
              requiredTools: "",
              reminderDelay: 0,
              maxReminders: 0,
              scheduleEnabled: false,
              scheduleCron: "",
              nickname: "",
              argumentHint: "",
              userInvocable: false,
            });
            setSkillUploadFile(null);
          }}
          title={
            skillFormMode === "upload"
              ? "Install Skill from File"
              : "Create Skill"
          }
          size="lg"
          footer={
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCreateSkillModal(false);
                  setSkillForm({
                    skillId: "",
                    name: "",
                    description: "",
                    instructions: "",
                    triggerHints: "",
                    requiredTools: "",
                    reminderDelay: 0,
                    maxReminders: 0,
                    scheduleEnabled: false,
                    scheduleCron: "",
                    nickname: "",
                    argumentHint: "",
                    userInvocable: false,
                  });
                  setSkillUploadFile(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateSkill}
                isLoading={isCreatingSkill}
                disabled={
                  skillFormMode === "upload"
                    ? !skillUploadFile
                    : !skillForm.name ||
                      !skillForm.description ||
                      !skillForm.instructions
                }
              >
                {skillFormMode === "upload" ? "Install" : "Create"}
              </Button>
            </div>
          }
        >
          <div className="mb-4 flex gap-2">
            <button
              type="button"
              onClick={() => setSkillFormMode("form")}
              className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
                skillFormMode === "form"
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-text-secondary hover:bg-gray-200"
              }`}
            >
              Form
            </button>
            <button
              type="button"
              onClick={() => setSkillFormMode("upload")}
              className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
                skillFormMode === "upload"
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-text-secondary hover:bg-gray-200"
              }`}
            >
              Upload .md
            </button>
          </div>

          {skillFormMode === "form" ? (
            <div className="space-y-4">
              <Input
                label={t("assistants.playground.skillIdKebab")}
                value={skillForm.skillId}
                onChange={(e) =>
                  setSkillForm({ ...skillForm, skillId: e.target.value })
                }
                placeholder={t(
                  "assistants.playground.skillIdKebabPlaceholder",
                )}
              />
              <Input
                label={t("assistants.playground.skillDisplayName")}
                value={skillForm.name}
                onChange={(e) =>
                  setSkillForm({ ...skillForm, name: e.target.value })
                }
                placeholder="e.g. Greeting Handler"
              />
              <Textarea
                label="Description"
                value={skillForm.description}
                onChange={(e) =>
                  setSkillForm({
                    ...skillForm,
                    description: e.target.value,
                  })
                }
                placeholder="When should the AI use this skill?"
                rows={2}
              />
              <Textarea
                label="Instructions"
                value={skillForm.instructions}
                onChange={(e) =>
                  setSkillForm({
                    ...skillForm,
                    instructions: e.target.value,
                  })
                }
                placeholder="Step-by-step instructions for the AI to follow..."
                rows={6}
              />
              <Input
                label={t("assistants.playground.skillFieldTriggerHints")}
                value={skillForm.triggerHints}
                onChange={(e) =>
                  setSkillForm({
                    ...skillForm,
                    triggerHints: e.target.value,
                  })
                }
                placeholder="e.g. hello, greet, welcome, 你好"
              />
              <p className="text-xs text-text-secondary">
                {t("assistants.playground.skillCreateToolsHint")}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-text-secondary">
                {t("assistants.playground.skillCreateUploadHint")}
              </p>
              <div
                role="button"
                tabIndex={0}
                onClick={() => skillFileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    skillFileInputRef.current?.click();
                  }
                }}
                className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                  skillUploadFile
                    ? "border-primary bg-primary/5"
                    : "border-gray-300 hover:border-primary hover:bg-gray-50"
                }`}
              >
                {skillUploadFile ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    <span className="text-sm font-medium text-primary">
                      {skillUploadFile.name}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSkillUploadFile(null);
                      }}
                      className="p-0.5 text-gray-400 hover:text-error"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <UploadCloud className="mx-auto mb-2 h-8 w-8 text-gray-400" />
                    <p className="text-sm text-text-secondary">
                      Click to select a .md file
                    </p>
                  </>
                )}
              </div>
              <input
                ref={skillFileInputRef}
                type="file"
                accept=".md"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setSkillUploadFile(file);
                  e.target.value = "";
                }}
              />
            </div>
          )}
        </Modal>
      )}

      {editingSkill && (
        <>
          <Modal
            isOpen={!!editingSkill}
            onClose={closeSkillEditorModal}
            title={
              editingSkill.isBuiltIn
                ? t("assistants.playground.skillEditorTitleView")
                : t("assistants.playground.skillEditorTitleEdit")
            }
            size="xl"
            className="min-h-[65vh] w-[70vw] !max-w-[70vw]"
            bodyScroll
            footer={
              <div className="flex w-full flex-wrap items-center justify-between gap-2">
                <div>
                  {!editingSkill.isBuiltIn && (
                    <Button
                      type="button"
                      variant="outline"
                      className="border-error/40 text-error hover:bg-error/5"
                      onClick={() => setSkillDeleteConfirmOpen(true)}
                    >
                      {t("common.delete")}
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="outline" onClick={closeSkillEditorModal}>
                    {t("common.cancel")}
                  </Button>
                  {!editingSkill.isBuiltIn && (
                    <Button
                      onClick={handleUpdateSkill}
                      isLoading={isUpdatingSkill}
                      disabled={!skillForm.name || !skillForm.description}
                    >
                      {t("common.save")}
                    </Button>
                  )}
                </div>
              </div>
            }
          >
            {(() => {
              const skillRo = editingSkill.isBuiltIn;
              const sid = editingSkill._id;
              const requiredToolsCount = parseRequiredTools(
                skillForm.requiredTools,
              ).length;
              const toolsTabLabel =
                requiredToolsCount > 0
                  ? `${t("assistants.playground.skillEditorTabTools")} (${requiredToolsCount})`
                  : t("assistants.playground.skillEditorTabTools");
              const editorTabs: {
                id: typeof skillEditorTab;
                label: string;
              }[] = [
                {
                  id: "basic",
                  label: t("assistants.playground.skillEditorTabBasic"),
                },
                { id: "tools", label: toolsTabLabel },
                {
                  id: "content",
                  label: t("assistants.playground.skillEditorTabSkillContent"),
                },
                {
                  id: "reference",
                  label: `${t("assistants.playground.skillEditorTabReference")} (${refFiles.length})`,
                },
                {
                  id: "assets",
                  label: `${t("assistants.playground.skillEditorTabAssets")} (${assetList.length})`,
                },
                {
                  id: "scripts",
                  label: `${t("assistants.playground.skillEditorTabScripts")} (${scriptList.length})`,
                },
              ];
              return (
                <div className="flex min-h-0 flex-1 flex-col gap-4">
                  <p className="shrink-0 font-mono text-xs text-text-secondary">
                    {editingSkill.slug}
                  </p>
                  {skillRo && (
                    <p className="shrink-0 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      {t("assistants.playground.skillBuiltInReadOnly")}
                    </p>
                  )}

                  <div
                    className="flex shrink-0 flex-wrap gap-0.5 border-b border-gray-200"
                    role="tablist"
                  >
                    {editorTabs.map(({ id: tabId, label: tabLabel }) => (
                      <button
                        key={tabId}
                        type="button"
                        role="tab"
                        aria-selected={skillEditorTab === tabId}
                        onClick={() => setSkillEditorTab(tabId)}
                        className={`-mb-px rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                          skillEditorTab === tabId
                            ? "border-primary text-primary"
                            : "border-transparent text-text-secondary hover:text-text-primary"
                        }`}
                      >
                        {tabLabel}
                      </button>
                    ))}
                  </div>

                  <div
                    className="flex min-h-0 flex-1 flex-col overflow-hidden pt-1"
                    role="tabpanel"
                  >
                    {skillEditorTab === "basic" && (
                      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                        <div className="space-y-6">
                          <section className="space-y-3">
                            <h3 className="text-sm font-semibold text-gray-900">
                              {t("assistants.playground.skillYamlSectionStandard")}
                            </h3>
                            <p className="text-xs leading-relaxed text-text-secondary">
                              {t("assistants.playground.skillYamlSectionStandardIntro")}
                            </p>
                            <p className="text-xs leading-relaxed text-text-secondary">
                              {t("assistants.playground.skillBasicNameHint")}
                            </p>
                            <div>
                              <label className="mb-1 block text-sm font-medium text-gray-700">
                                {t("assistants.playground.skillYamlFieldKebabName")}
                              </label>
                              <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-sm text-gray-800">
                                {editingSkill.slug}
                              </p>
                            </div>
                            <Textarea
                              label={t("assistants.playground.skillFieldDescription")}
                              value={skillForm.description}
                              disabled={skillRo}
                              onChange={(e) =>
                                setSkillForm({
                                  ...skillForm,
                                  description: e.target.value,
                                })
                              }
                              placeholder="When should the AI use this skill? (e.g. Use when customer says hello)"
                              rows={3}
                              className="resize-y"
                            />
                            <Input
                              label={t("assistants.playground.skillYamlFieldArgumentHint")}
                              value={skillForm.argumentHint}
                              disabled={skillRo}
                              onChange={(e) =>
                                setSkillForm({
                                  ...skillForm,
                                  argumentHint: e.target.value,
                                })
                              }
                              placeholder={t(
                                "assistants.playground.skillYamlFieldArgumentHintPlaceholder",
                              )}
                            />
                            <Toggle
                              checked={skillForm.userInvocable}
                              disabled={skillRo}
                              onChange={(checked) =>
                                setSkillForm({
                                  ...skillForm,
                                  userInvocable: checked,
                                })
                              }
                              label={t(
                                "assistants.playground.skillYamlFieldUserInvocable",
                              )}
                              description={t(
                                "assistants.playground.skillYamlFieldUserInvocableHint",
                              )}
                            />
                          </section>

                          <section className="space-y-3 border-t border-gray-100 pt-4">
                            <h3 className="text-sm font-semibold text-gray-900">
                              {t("assistants.playground.skillYamlSectionMetadata")}
                            </h3>
                            <Input
                              label={t("assistants.playground.skillDisplayName")}
                              value={skillForm.name}
                              disabled={skillRo}
                              onChange={(e) =>
                                setSkillForm({ ...skillForm, name: e.target.value })
                              }
                              placeholder="e.g. Booking Handler"
                            />
                            <Input
                              label={t("assistants.playground.skillFieldTriggerHints")}
                              value={skillForm.triggerHints}
                              disabled={skillRo}
                              onChange={(e) =>
                                setSkillForm({
                                  ...skillForm,
                                  triggerHints: e.target.value,
                                })
                              }
                              placeholder="e.g. hello, greet, welcome, 你好"
                            />
                            <div>
                              <label className="mb-1 block text-sm font-medium text-gray-700">
                                {t("assistants.playground.skillFieldIdleReminder")}
                              </label>
                              <p className="mb-2 text-xs text-gray-400">
                                {t("assistants.playground.skillFieldIdleReminderHint")}
                              </p>
                              <div className="flex gap-3">
                                <div className="flex-1">
                                  <label className="mb-1 block text-xs text-gray-500">
                                    {t("assistants.playground.skillFieldReminderDelay")}{" "}
                                    <span className="font-mono text-[10px] text-gray-400">
                                      (reminder_delay)
                                    </span>
                                  </label>
                                  <input
                                    type="number"
                                    min={0}
                                    disabled={skillRo}
                                    value={skillForm.reminderDelay}
                                    onChange={(e) =>
                                      setSkillForm({
                                        ...skillForm,
                                        reminderDelay:
                                          parseInt(e.target.value, 10) || 0,
                                      })
                                    }
                                    className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                                    placeholder="0 = disabled"
                                  />
                                </div>
                                <div className="flex-1">
                                  <label className="mb-1 block text-xs text-gray-500">
                                    {t("assistants.playground.skillFieldMaxReminders")}{" "}
                                    <span className="font-mono text-[10px] text-gray-400">
                                      (max_reminders)
                                    </span>
                                  </label>
                                  <input
                                    type="number"
                                    min={0}
                                    max={5}
                                    disabled={skillRo}
                                    value={skillForm.maxReminders}
                                    onChange={(e) =>
                                      setSkillForm({
                                        ...skillForm,
                                        maxReminders:
                                          parseInt(e.target.value, 10) || 0,
                                      })
                                    }
                                    className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                                    placeholder="0 = disabled"
                                  />
                                </div>
                              </div>
                            </div>
                            <div className="border-t border-gray-100 pt-4">
                              <Toggle
                                checked={skillForm.scheduleEnabled}
                                disabled={skillRo}
                                onChange={(checked) =>
                                  setSkillForm({
                                    ...skillForm,
                                    scheduleEnabled: checked,
                                  })
                                }
                                label={t(
                                  "assistants.playground.skillScheduleEnabled",
                                )}
                                description={t(
                                  "assistants.playground.skillScheduleHint",
                                )}
                              />
                              {skillForm.scheduleEnabled && (
                                <div className="mt-3">
                                  <label className="mb-1 block text-xs text-gray-500">
                                    {t(
                                      "assistants.playground.skillScheduleCron",
                                    )}{" "}
                                    <span className="font-mono text-[10px] text-gray-400">
                                      (schedule_cron)
                                    </span>
                                  </label>
                                  <input
                                    type="text"
                                    disabled={skillRo}
                                    value={skillForm.scheduleCron}
                                    onChange={(e) =>
                                      setSkillForm({
                                        ...skillForm,
                                        scheduleCron: e.target.value,
                                      })
                                    }
                                    className="w-full rounded-lg border border-gray-200 px-3 py-1.5 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                                    placeholder="0 * * * *"
                                  />
                                </div>
                              )}
                            </div>
                          </section>

                        </div>
                      </div>
                    )}

                    {skillEditorTab === "tools" && (
                      <div className="flex min-h-[280px] min-w-0 flex-1 flex-col overflow-hidden">
                        <SkillToolsTab
                          tools={skillToolOptions}
                          loading={skillToolOptionsLoading}
                          requiredToolsCsv={skillForm.requiredTools}
                          onRequiredToolsChange={(csv) =>
                            setSkillForm({ ...skillForm, requiredTools: csv })
                          }
                          readOnly={skillRo}
                          selectedToolId={selectedSkillToolId}
                          onSelectToolId={setSelectedSkillToolId}
                          t={t}
                        />
                      </div>
                    )}

                    {skillEditorTab === "content" && (
                      <div className="flex min-h-0 flex-1 flex-col">
                        <Textarea
                          label={t(
                            "assistants.playground.skillFieldInstructionsBody",
                          )}
                          value={skillForm.instructions}
                          disabled={skillRo}
                          onChange={(e) =>
                            setSkillForm({
                              ...skillForm,
                              instructions: e.target.value,
                            })
                          }
                          placeholder="Step-by-step instructions for the AI to follow when this skill runs..."
                          containerClassName="flex min-h-0 flex-1 flex-col"
                          className="min-h-0 flex-1 resize-none"
                        />
                      </div>
                    )}

                    {skillEditorTab === "reference" && (
                      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                        {skillRo ? (
                          <p className="text-sm text-text-secondary">
                            {t("assistants.playground.skillBuiltInReadOnly")}
                          </p>
                        ) : refLoading ? (
                          <div className="flex items-center gap-2 text-sm text-text-secondary">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {t("common.loading")}
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <p className="text-xs leading-relaxed text-text-secondary">
                              {t("assistants.playground.skillReferencesHint")}
                            </p>
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => refUploadRef.current?.click()}
                                className="flex items-center gap-1 text-xs text-text-secondary hover:text-primary"
                                disabled={refSaving}
                              >
                                <Upload className="h-3.5 w-3.5" />
                                {t("assistants.playground.skillReferenceUpload")}
                              </button>
                              <input
                                ref={refUploadRef}
                                type="file"
                                accept=".md,.txt"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) void handleUploadReference(sid, file);
                                  e.target.value = "";
                                }}
                              />
                              {refFiles.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteReference(sid)}
                                  className="flex items-center gap-1 text-xs text-text-secondary hover:text-error"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  {t("assistants.playground.skillReferenceRemoveAll")}
                                </button>
                              )}
                            </div>
                            {refFiles.length > 0 ? (
                              <div className="space-y-1">
                                {refFiles.map((f) => (
                                  <div
                                    key={`${f.name}-${f.legacy ? "legacy" : "ref"}`}
                                    className="group flex items-center justify-between rounded-md bg-gray-50 px-2.5 py-1.5"
                                  >
                                    <button
                                      type="button"
                                      className={`flex min-w-0 flex-1 items-center gap-1.5 text-left ${
                                        refSelectedName === f.name
                                          ? "text-primary"
                                          : "text-text-primary"
                                      }`}
                                      onClick={() =>
                                        void handleSelectReferenceFile(sid, f.name)
                                      }
                                      disabled={refDocLoading}
                                    >
                                      <FileText className="h-3.5 w-3.5 shrink-0 text-sky-600" />
                                      <span className="truncate font-mono text-[11px]">
                                        {f.name}
                                      </span>
                                      {f.legacy ? (
                                        <span className="shrink-0 rounded bg-amber-100 px-1 py-0 text-[9px] font-medium uppercase text-amber-800">
                                          {t(
                                            "assistants.playground.skillReferenceLegacyBadge",
                                          )}
                                        </span>
                                      ) : null}
                                      <span className="shrink-0 text-[10px] text-text-secondary">
                                        {formatAssetSize(f.sizeBytes)}
                                      </span>
                                    </button>
                                    <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                      {!f.legacy && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setRefRename({
                                              name: f.name,
                                              draft: f.name,
                                            })
                                          }
                                          className="rounded p-0.5 text-text-secondary hover:text-primary"
                                          title={t(
                                            "assistants.playground.skillReferenceRename",
                                          )}
                                          disabled={refSaving}
                                        >
                                          <Pencil className="h-3.5 w-3.5" />
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() =>
                                          void handleDeleteReferenceFile(sid, f.name)
                                        }
                                        className="rounded p-0.5 text-text-secondary hover:text-error"
                                        title={t("common.delete")}
                                        disabled={refSaving}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-text-secondary">
                                {t("assistants.playground.skillReferencesEmpty")}
                              </p>
                            )}
                            {refSelectedName ? (
                              <div className="space-y-2 pt-1">
                                {refDocLoading ? (
                                  <div className="flex items-center gap-2 text-sm text-text-secondary">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    {t("common.loading")}
                                  </div>
                                ) : (
                                  <>
                                    <textarea
                                      value={refEditorContent}
                                      onChange={(e) =>
                                        setRefEditorContent(e.target.value)
                                      }
                                      placeholder={t(
                                        "assistants.playground.skillReferencePlaceholder",
                                      )}
                                      rows={12}
                                      className="min-h-[200px] w-full resize-y rounded-md border border-gray-200 bg-gray-50 p-3 font-mono text-xs focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
                                    />
                                    <div className="flex justify-end">
                                      <Button
                                        type="button"
                                        size="sm"
                                        onClick={() =>
                                          void handleSaveReferenceDocument(sid)
                                        }
                                        disabled={refSaving}
                                        isLoading={refSaving}
                                      >
                                        {t("assistants.playground.skillSaveReference")}
                                      </Button>
                                    </div>
                                  </>
                                )}
                              </div>
                            ) : refFiles.length > 0 ? (
                              <p className="text-xs text-text-secondary">
                                {t("assistants.playground.skillReferenceSelectFile")}
                              </p>
                            ) : null}
                          </div>
                        )}
                      </div>
                    )}

                    {skillEditorTab === "assets" &&
                      (skillRo ? (
                        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                          <p className="text-sm text-text-secondary">
                            {t("assistants.playground.skillBuiltInReadOnly")}
                          </p>
                        </div>
                      ) : (
                        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                          <p className="mb-3 text-xs leading-relaxed text-text-secondary">
                            {t("assistants.playground.skillAssetsHint")}
                          </p>
                          <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => assetUploadRef.current?.click()}
                              className="flex items-center gap-1 text-xs text-text-secondary hover:text-primary"
                              disabled={assetSaving}
                            >
                              <Upload className="h-3.5 w-3.5" />
                              {t("assistants.playground.skillAssetUpload")}
                            </button>
                            <input
                              ref={assetUploadRef}
                              type="file"
                              accept=".doc,.docx,.xls,.xlsx,.pdf,.csv,.png,.jpg,.jpeg,.gif,.webp,.txt,.md"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) void handleUploadAsset(sid, file);
                                e.target.value = "";
                              }}
                            />
                          </div>
                          {assetList.length > 0 ? (
                            <div className="space-y-1">
                              {assetList.map((a) => (
                                <div
                                  key={a.name}
                                  className="group flex items-center justify-between rounded-md bg-gray-50 px-2.5 py-1.5"
                                >
                                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                                    <FileText className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                                    <span className="truncate font-mono text-[11px] text-text-primary">
                                      {a.name}
                                    </span>
                                    <span className="shrink-0 text-[10px] text-text-secondary">
                                      {formatAssetSize(a.sizeBytes)}
                                    </span>
                                  </div>
                                  <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setAssetRename({
                                          name: a.name,
                                          draft: a.name,
                                        })
                                      }
                                      className="rounded p-0.5 text-text-secondary hover:text-primary"
                                      title={t(
                                        "assistants.playground.skillAssetRename",
                                      )}
                                      disabled={assetSaving}
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void handleDeleteAsset(sid, a.name)
                                      }
                                      className="rounded p-0.5 text-text-secondary hover:text-error"
                                      title={t("common.delete")}
                                      disabled={assetSaving}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-text-secondary">
                              {t("assistants.playground.skillAssetsEmpty")}
                            </p>
                          )}
                        </div>
                      ))}

                    {skillEditorTab === "scripts" &&
                      (skillRo ? (
                        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                          <p className="text-sm text-text-secondary">
                            {t("assistants.playground.skillBuiltInReadOnly")}
                          </p>
                        </div>
                      ) : (
                        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                          <div>
                            <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => scriptUploadRef.current?.click()}
                                className="flex items-center gap-1 text-xs text-text-secondary hover:text-primary"
                              >
                                <Upload className="h-3.5 w-3.5" />
                                {t("assistants.playground.skillScriptUpload")}
                              </button>
                              <input
                                ref={scriptUploadRef}
                                type="file"
                                accept=".js,.ts,.py,.sh,.bash,.rb,.php"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleUploadScript(sid, file);
                                  e.target.value = "";
                                }}
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setShowNewScriptForm(!showNewScriptForm)
                                }
                                className="flex items-center gap-1 text-xs text-text-secondary hover:text-primary"
                              >
                                <Plus className="h-3.5 w-3.5" />
                                {t("assistants.playground.skillScriptNew")}
                              </button>
                            </div>

                            {scriptList.length > 0 && (
                              <div className="mb-3 space-y-1">
                                {scriptList.map((filename) => (
                                  <div
                                    key={filename}
                                    className="group flex items-center justify-between rounded-md bg-gray-50 px-2.5 py-1.5"
                                  >
                                    <div className="flex min-w-0 items-center gap-1.5">
                                      <Code className="h-3.5 w-3.5 shrink-0 text-purple-400" />
                                      <span className="truncate font-mono text-[11px] text-text-primary">
                                        {filename}
                                      </span>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleViewScript(sid, filename)
                                        }
                                        className="rounded p-0.5 text-text-secondary hover:text-primary"
                                        title={t("assistants.playground.viewScript")}
                                      >
                                        <Eye className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleDeleteScript(sid, filename)
                                        }
                                        className="rounded p-0.5 text-text-secondary hover:text-error"
                                        title={t("common.delete")}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {viewingScript && (
                              <div className="mb-3">
                                <div className="mb-1 flex items-center justify-between">
                                  <span className="text-xs font-medium text-text-secondary">
                                    {viewingScript.filename}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setViewingScript(null)}
                                    className="text-text-secondary hover:text-text-primary"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </div>
                                <pre className="max-h-72 overflow-auto rounded-md bg-gray-900 p-3 font-mono text-[11px] text-gray-100">
                                  {viewingScript.content}
                                </pre>
                              </div>
                            )}

                            {showNewScriptForm && (
                              <div className="space-y-2 rounded-md bg-gray-50 p-3">
                                <input
                                  value={newScriptName}
                                  onChange={(e) =>
                                    setNewScriptName(e.target.value)
                                  }
                                  placeholder={t(
                                    "assistants.playground.skillScriptFilenamePlaceholder",
                                  )}
                                  className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
                                />
                                <textarea
                                  value={newScriptContent}
                                  onChange={(e) =>
                                    setNewScriptContent(e.target.value)
                                  }
                                  placeholder={t(
                                    "assistants.playground.skillScriptContentPlaceholder",
                                  )}
                                  rows={8}
                                  className="min-h-[140px] w-full resize-y rounded border border-gray-200 bg-white p-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
                                />
                                <div className="flex justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setShowNewScriptForm(false);
                                      setNewScriptName("");
                                      setNewScriptContent("");
                                    }}
                                    className="rounded px-2 py-1 text-xs text-text-secondary hover:text-text-primary"
                                  >
                                    {t("common.cancel")}
                                  </button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => handleCreateScript(sid)}
                                    disabled={
                                      !newScriptName ||
                                      !newScriptContent ||
                                      scriptSaving
                                    }
                                    isLoading={scriptSaving}
                                  >
                                    {t("assistants.playground.skillScriptCreate")}
                                  </Button>
                                </div>
                              </div>
                            )}

                            {scriptList.length === 0 && !showNewScriptForm && (
                              <p className="text-[11px] italic text-text-secondary">
                                {t("assistants.playground.skillScriptsEmpty")}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              );
            })()}
          </Modal>

          <Modal
            isOpen={!!assetRename && !!editingSkill}
            onClose={() => setAssetRename(null)}
            title={t("assistants.playground.skillAssetRenameTitle")}
            size="sm"
            footer={
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setAssetRename(null)}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    if (!assetRename || !editingSkill) return;
                    void handleRenameAsset(
                      editingSkill._id,
                      assetRename.name,
                      assetRename.draft,
                    );
                    setAssetRename(null);
                  }}
                  disabled={
                    assetSaving ||
                    !assetRename?.draft.trim() ||
                    assetRename.draft.trim() === assetRename.name
                  }
                  isLoading={assetSaving}
                >
                  {t("assistants.playground.skillAssetRenameSave")}
                </Button>
              </div>
            }
          >
            <Input
              label={t("assistants.playground.skillAssetFilenameLabel")}
              value={assetRename?.draft ?? ""}
              onChange={(e) =>
                setAssetRename((r) =>
                  r ? { ...r, draft: e.target.value } : null,
                )
              }
            />
          </Modal>

          <Modal
            isOpen={!!refRename && !!editingSkill}
            onClose={() => setRefRename(null)}
            title={t("assistants.playground.skillReferenceRenameTitle")}
            size="sm"
            footer={
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setRefRename(null)}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    if (!refRename || !editingSkill) return;
                    void handleRenameReferenceFile(
                      editingSkill._id,
                      refRename.name,
                      refRename.draft,
                    );
                    setRefRename(null);
                  }}
                  disabled={
                    refSaving ||
                    !refRename?.draft.trim() ||
                    refRename.draft.trim() === refRename.name
                  }
                  isLoading={refSaving}
                >
                  {t("assistants.playground.skillReferenceRenameSave")}
                </Button>
              </div>
            }
          >
            <Input
              label={t("assistants.playground.skillReferenceFilenameLabel")}
              value={refRename?.draft ?? ""}
              onChange={(e) =>
                setRefRename((r) =>
                  r ? { ...r, draft: e.target.value } : null,
                )
              }
            />
          </Modal>

          <ConfirmModal
            isOpen={skillDeleteConfirmOpen && !!editingSkill}
            onClose={() => setSkillDeleteConfirmOpen(false)}
            onConfirm={async () => {
              if (!editingSkill) return;
              setIsDeletingSkill(true);
              try {
                await handleDeleteSkill(
                  editingSkill._id,
                  closeSkillEditorModal,
                );
              } finally {
                setIsDeletingSkill(false);
              }
            }}
            title={t("common.delete")}
            message={t("assistants.playground.skillDeleteConfirm")}
            confirmText={t("common.delete")}
            cancelText={t("common.cancel")}
            variant="danger"
            isLoading={isDeletingSkill}
          />
        </>
      )}

      <ConfirmModal
        isOpen={!!skillToDeleteFromList}
        onClose={() => setSkillToDeleteFromList(null)}
        onConfirm={async () => {
          if (!skillToDeleteFromList) return;
          setIsDeletingListItem(true);
          try {
            await handleDeleteSkill(skillToDeleteFromList._id, () => {
              setSkillToDeleteFromList(null);
            });
          } finally {
            setIsDeletingListItem(false);
          }
        }}
        title={t("assistants.skillLibrary.deleteFromLibraryTitle")}
        message={t("assistants.skillLibrary.deleteFromLibraryMessage")}
        confirmText={t("common.delete")}
        cancelText={t("common.cancel")}
        variant="danger"
        isLoading={isDeletingListItem}
      />
    </div>
  );
};
