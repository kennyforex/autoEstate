import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { assistantsApi, skillsApi } from "../../lib/api";
import type { Assistant, Skill } from "../../lib/types";

export type SkillEditorTabId =
  | "basic"
  | "content"
  | "frontmatter"
  | "reference"
  | "assets"
  | "scripts"
  | "other";

export function useAssistantSkillLibrary(
  assistantId: string | undefined,
  assistant: Assistant | null,
  setAssistant: React.Dispatch<React.SetStateAction<Assistant | null>>,
  {
    showSuccess,
    showError,
    /** When false, new installs are not auto-bound to the manager (skill library = definitions only). */
    bindNewSkillsToManager = false,
  }: {
    showSuccess: (title: string, message?: string) => void;
    showError: (title: string, message?: string) => void;
    bindNewSkillsToManager?: boolean;
  },
) {

  const [allSkills, setAllSkills] = useState<Skill[]>([]);
  const [isLoadingSkills, setIsLoadingSkills] = useState(false);
  const [showCreateSkillModal, setShowCreateSkillModal] = useState(false);
  const [skillFormMode, setSkillFormMode] = useState<"form" | "upload">("form");
  const [isCreatingSkill, setIsCreatingSkill] = useState(false);
  const [skillForm, setSkillForm] = useState({
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
  });
  const [skillUploadFile, setSkillUploadFile] = useState<File | null>(null);
  const skillFileInputRef = useRef<HTMLInputElement>(null);
  const zipFileInputRef = useRef<HTMLInputElement>(null);
  const [bindingSkillId, setBindingSkillId] = useState<string | null>(null);

  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [isUpdatingSkill, setIsUpdatingSkill] = useState(false);
  const [skillDeleteConfirmOpen, setSkillDeleteConfirmOpen] = useState(false);
  const [isDeletingSkill, setIsDeletingSkill] = useState(false);
  const [skillEditorTab, setSkillEditorTab] = useState<SkillEditorTabId>("basic");
  /** YAML between --- delimiters in SKILL.md (not including --- lines). */
  const [skillFrontmatterYaml, setSkillFrontmatterYaml] = useState("");

  const [refContent, setRefContent] = useState("");
  const [refLoading, setRefLoading] = useState(false);
  const [refSaving, setRefSaving] = useState(false);
  const [scriptList, setScriptList] = useState<string[]>([]);
  const [assetList, setAssetList] = useState<{ name: string; sizeBytes: number }[]>([]);
  const [assetSaving, setAssetSaving] = useState(false);
  const [viewingScript, setViewingScript] = useState<{
    filename: string;
    content: string;
  } | null>(null);
  const [newScriptName, setNewScriptName] = useState("");
  const [newScriptContent, setNewScriptContent] = useState("");
  const [showNewScriptForm, setShowNewScriptForm] = useState(false);
  const [scriptSaving, setScriptSaving] = useState(false);
  const scriptUploadRef = useRef<HTMLInputElement>(null);
  const assetUploadRef = useRef<HTMLInputElement>(null);
  const refUploadRef = useRef<HTMLInputElement>(null);

  const [skillToolOptions, setSkillToolOptions] = useState<
    { id: string; label: string }[]
  >([]);
  const [skillToolOptionsLoading, setSkillToolOptionsLoading] = useState(false);

  const managerStaffId = useMemo(
    () => assistant?.staff?.find((s) => s.isManager)?._id,
    [assistant?.staff],
  );

  const refreshAssistant = useCallback(async () => {
    if (!assistantId) return;
    try {
      const data = await assistantsApi.get(assistantId);
      setAssistant(data);
    } catch (e) {
      console.error(e);
    }
  }, [assistantId, setAssistant]);

  const fetchSkills = useCallback(async () => {
    setIsLoadingSkills(true);
    try {
      const skills = await skillsApi.list();
      setAllSkills(skills);
    } catch (error) {
      console.error("Failed to fetch skills:", error);
    } finally {
      setIsLoadingSkills(false);
    }
  }, []);

  useEffect(() => {
    if (assistantId) fetchSkills();
  }, [assistantId, fetchSkills]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSkillToolOptionsLoading(true);
      try {
        const tools = await assistantsApi.getSkillToolOptions();
        if (!cancelled) setSkillToolOptions(tools);
      } catch (e) {
        console.error("Failed to fetch skill tool options:", e);
      } finally {
        if (!cancelled) setSkillToolOptionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isSkillBoundToStaff = (
    skillId: string,
    staffId: string | undefined,
  ): boolean => {
    if (!staffId) return assistant?.skills?.includes(skillId) ?? false;
    const st = assistant?.staff?.find((s) => s._id === staffId);
    return st?.skillIds?.includes(skillId) ?? false;
  };

  const closeSkillEditorModal = () => {
    setEditingSkill(null);
    setSkillForm({
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
    });
    setRefContent("");
    setScriptList([]);
    setAssetList([]);
    setViewingScript(null);
    setShowNewScriptForm(false);
    setSkillDeleteConfirmOpen(false);
    setSkillEditorTab("basic");
    setSkillFrontmatterYaml("");
  };

  const openSkillEditorModal = async (skill: Skill) => {
    setSkillEditorTab("basic");
    setEditingSkill(skill);
    setShowNewScriptForm(false);
    setViewingScript(null);
    setRefLoading(true);
    try {
      const full = await skillsApi.get(skill._id);
      setSkillForm({
        name: full.name,
        description: full.description || "",
        instructions: full.instructions || "",
        triggerHints: (full.triggerHints || []).join(", "),
        requiredTools: (full.requiredTools || []).join(", "),
        reminderDelay: full.reminderDelay || 0,
        maxReminders: full.maxReminders || 0,
        scheduleEnabled: Boolean(full.scheduleEnabled),
        scheduleCron: full.scheduleCron || "",
        nickname: full.nickname || "",
      });
      setSkillFrontmatterYaml(full.frontmatterYaml ?? "");
      const [ref, scripts, assets] = await Promise.all([
        skillsApi.getReference(skill._id),
        skillsApi.listScripts(skill._id),
        skillsApi.listAssets(skill._id),
      ]);
      setRefContent(ref || "");
      setScriptList(scripts);
      setAssetList(assets);
    } catch {
      setSkillForm({
        name: skill.name,
        description: skill.description || "",
        instructions: skill.instructions || "",
        triggerHints: (skill.triggerHints || []).join(", "),
        requiredTools: (skill.requiredTools || []).join(", "),
        reminderDelay: skill.reminderDelay || 0,
        maxReminders: skill.maxReminders || 0,
        scheduleEnabled: Boolean(skill.scheduleEnabled),
        scheduleCron: skill.scheduleCron || "",
        nickname: skill.nickname || "",
      });
      setSkillFrontmatterYaml(skill.frontmatterYaml ?? "");
      setRefContent("");
      setScriptList([]);
      setAssetList([]);
    } finally {
      setRefLoading(false);
    }
  };

  const handleUpdateSkill = async () => {
    if (!editingSkill || isUpdatingSkill) return;
    setIsUpdatingSkill(true);
    try {
      const updated = await skillsApi.update(editingSkill._id, {
        name: skillForm.name,
        description: skillForm.description,
        instructions: skillForm.instructions || undefined,
        frontmatterYaml: skillFrontmatterYaml,
        requiredTools: skillForm.requiredTools
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        reminderDelay: skillForm.reminderDelay,
        maxReminders: skillForm.maxReminders,
        scheduleEnabled: skillForm.scheduleEnabled,
        scheduleCron: skillForm.scheduleCron.trim() || undefined,
      });
      setAllSkills((prev) =>
        prev.map((s) => (s._id === updated._id ? updated : s)),
      );
      closeSkillEditorModal();
      showSuccess("Skill updated", `"${updated.name}" has been updated.`);
    } catch (error: unknown) {
      const msg =
        (error as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ||
        (error as Error)?.message ||
        "Failed to update skill";
      showError("Failed", msg);
    } finally {
      setIsUpdatingSkill(false);
    }
  };

  const handleToggleSkill = async (
    skillId: string,
    staffId: string | undefined,
  ) => {
    if (!assistantId || bindingSkillId) return;
    setBindingSkillId(skillId);
    try {
      const targetStaff = staffId || managerStaffId;
      if (isSkillBoundToStaff(skillId, targetStaff)) {
        await skillsApi.unbind(skillId, assistantId, targetStaff);
        await refreshAssistant();
        showSuccess(
          "Skill removed",
          "Skill has been unbound from this team member.",
        );
      } else {
        await skillsApi.bind(skillId, assistantId, targetStaff);
        await refreshAssistant();
        showSuccess("Skill added", "Skill has been bound.");
      }
    } catch (error: unknown) {
      console.error("Failed to toggle skill:", error);
      const msg =
        (error as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Could not update skill binding.";
      showError("Failed", msg);
    } finally {
      setBindingSkillId(null);
    }
  };

  const handleCreateSkill = async () => {
    if (isCreatingSkill) return;
    setIsCreatingSkill(true);
    try {
      if (skillFormMode === "upload" && skillUploadFile) {
        const skill = await skillsApi.install(skillUploadFile);
        if (assistantId) {
          if (bindNewSkillsToManager && managerStaffId) {
            await skillsApi.bind(skill._id, assistantId, managerStaffId);
          }
          const tools = skillForm.requiredTools
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          if (tools.length) {
            await skillsApi.update(skill._id, { requiredTools: tools });
          }
          if (bindNewSkillsToManager) {
            await refreshAssistant();
          }
        }
        showSuccess(
          "Skill installed",
          bindNewSkillsToManager
            ? `"${skill.name}" has been installed and bound.`
            : `"${skill.name}" has been added to the skill library.`,
        );
      } else {
        const triggerHintsStr = skillForm.triggerHints
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .join(", ");

        const skillMdContent = `---
name: ${skillForm.name}
description: ${skillForm.description}
triggerHints: ${triggerHintsStr}
---

${skillForm.instructions}
`;

        const file = new File([skillMdContent], "SKILL.md", {
          type: "text/markdown",
        });
        const skill = await skillsApi.install(file);

        if (assistantId) {
          if (bindNewSkillsToManager && managerStaffId) {
            await skillsApi.bind(skill._id, assistantId, managerStaffId);
          }
          const tools = skillForm.requiredTools
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          if (tools.length) {
            await skillsApi.update(skill._id, { requiredTools: tools });
          }
          if (bindNewSkillsToManager) {
            await refreshAssistant();
          }
        }
        showSuccess(
          "Skill created",
          bindNewSkillsToManager
            ? `"${skill.name}" has been created and bound.`
            : `"${skill.name}" has been added to the skill library.`,
        );
      }
      setShowCreateSkillModal(false);
      setSkillForm({
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
      });
      setSkillUploadFile(null);
      fetchSkills();
    } catch (error: unknown) {
      const msg =
        (error as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ||
        (error as Error)?.message ||
        "Failed to create skill";
      showError("Failed", msg);
    } finally {
      setIsCreatingSkill(false);
    }
  };

  const handleInstallZip = async (file: File) => {
    setIsCreatingSkill(true);
    try {
      const skill = await skillsApi.installZip(file);
      if (assistantId && bindNewSkillsToManager && managerStaffId) {
        await skillsApi.bind(skill._id, assistantId, managerStaffId);
        await refreshAssistant();
      }
      await fetchSkills();
      showSuccess(
        "Skill installed",
        bindNewSkillsToManager
          ? `"${skill.name}" has been installed and bound.`
          : `"${skill.name}" has been added to the skill library.`,
      );
    } catch (error: unknown) {
      const msg =
        (error as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ||
        (error as Error)?.message ||
        "Failed to install skill";
      showError("Failed", msg);
    } finally {
      setIsCreatingSkill(false);
    }
  };

  const handleDeleteSkill = async (
    skillId: string,
    onSuccess?: () => void,
  ) => {
    try {
      await skillsApi.delete(skillId);
      setAllSkills((prev) => prev.filter((s) => s._id !== skillId));
      await refreshAssistant();
      showSuccess("Skill deleted", "Skill has been removed.");
      onSuccess?.();
    } catch (error) {
      console.error("Failed to delete skill:", error);
      showError("Failed", "Could not delete skill.");
    }
  };

  const handleSaveReference = async (skillId: string) => {
    setRefSaving(true);
    try {
      const updated = await skillsApi.saveReference(skillId, refContent);
      setAllSkills((prev) => prev.map((s) => (s._id === updated._id ? updated : s)));
      showSuccess("Saved", "Reference document updated.");
    } catch (error: unknown) {
      showError(
        "Failed",
        (error as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Could not save reference.",
      );
    } finally {
      setRefSaving(false);
    }
  };

  const handleDeleteReference = async (skillId: string) => {
    try {
      const updated = await skillsApi.deleteReference(skillId);
      setAllSkills((prev) => prev.map((s) => (s._id === updated._id ? updated : s)));
      setRefContent("");
      showSuccess("Deleted", "Reference document removed.");
    } catch (error: unknown) {
      showError(
        "Failed",
        (error as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Could not delete reference.",
      );
    }
  };

  const handleUploadReference = async (skillId: string, file: File) => {
    setRefSaving(true);
    try {
      const updated = await skillsApi.uploadReference(skillId, file);
      setAllSkills((prev) => prev.map((s) => (s._id === updated._id ? updated : s)));
      const content = await skillsApi.getReference(skillId);
      setRefContent(content || "");
      showSuccess("Uploaded", "Reference file uploaded.");
    } catch (error: unknown) {
      showError(
        "Failed",
        (error as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Could not upload reference.",
      );
    } finally {
      setRefSaving(false);
    }
  };

  const handleCreateScript = async (skillId: string) => {
    if (!newScriptName || !newScriptContent) return;
    setScriptSaving(true);
    try {
      const updated = await skillsApi.createScript(
        skillId,
        newScriptName,
        newScriptContent,
      );
      setAllSkills((prev) => prev.map((s) => (s._id === updated._id ? updated : s)));
      setScriptList(updated.scripts || []);
      setNewScriptName("");
      setNewScriptContent("");
      setShowNewScriptForm(false);
      showSuccess("Created", `Script "${newScriptName}" added.`);
    } catch (error: unknown) {
      showError(
        "Failed",
        (error as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Could not create script.",
      );
    } finally {
      setScriptSaving(false);
    }
  };

  const handleUploadScript = async (skillId: string, file: File) => {
    setScriptSaving(true);
    try {
      const updated = await skillsApi.uploadScript(skillId, file);
      setAllSkills((prev) => prev.map((s) => (s._id === updated._id ? updated : s)));
      setScriptList(updated.scripts || []);
      showSuccess("Uploaded", `Script "${file.name}" added.`);
    } catch (error: unknown) {
      showError(
        "Failed",
        (error as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Could not upload script.",
      );
    } finally {
      setScriptSaving(false);
    }
  };

  const handleUploadAsset = async (skillId: string, file: File) => {
    setAssetSaving(true);
    try {
      const files = await skillsApi.uploadAsset(skillId, file);
      setAssetList(files);
      showSuccess("Uploaded", `"${file.name}" added to assets.`);
    } catch (error: unknown) {
      showError(
        "Failed",
        (error as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Could not upload asset.",
      );
    } finally {
      setAssetSaving(false);
    }
  };

  const handleDeleteAsset = async (skillId: string, filename: string) => {
    try {
      const files = await skillsApi.deleteAsset(skillId, filename);
      setAssetList(files);
      showSuccess("Deleted", `"${filename}" removed.`);
    } catch (error: unknown) {
      showError(
        "Failed",
        (error as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Could not delete asset.",
      );
    }
  };

  const handleRenameAsset = async (
    skillId: string,
    filename: string,
    newName: string,
  ) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === filename) return;
    setAssetSaving(true);
    try {
      const files = await skillsApi.renameAsset(skillId, filename, trimmed);
      setAssetList(files);
      showSuccess("Renamed", "Asset renamed.");
    } catch (error: unknown) {
      showError(
        "Failed",
        (error as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Could not rename asset.",
      );
    } finally {
      setAssetSaving(false);
    }
  };

  const handleDeleteScript = async (skillId: string, filename: string) => {
    try {
      const updated = await skillsApi.deleteScript(skillId, filename);
      setAllSkills((prev) => prev.map((s) => (s._id === updated._id ? updated : s)));
      setScriptList(updated.scripts || []);
      if (viewingScript?.filename === filename) setViewingScript(null);
      showSuccess("Deleted", `Script "${filename}" removed.`);
    } catch (error: unknown) {
      showError(
        "Failed",
        (error as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Could not delete script.",
      );
    }
  };

  const handleViewScript = async (skillId: string, filename: string) => {
    if (viewingScript?.filename === filename) {
      setViewingScript(null);
      return;
    }
    try {
      const data = await skillsApi.getScript(skillId, filename);
      setViewingScript(data);
    } catch {
      showError("Failed", "Could not load script content.");
    }
  };

  return {
    allSkills,
    isLoadingSkills,
    fetchSkills,
    managerStaffId,
    isSkillBoundToStaff,
    bindingSkillId,
    handleToggleSkill,
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
    skillFrontmatterYaml,
    setSkillFrontmatterYaml,
    refContent,
    setRefContent,
    refLoading,
    refSaving,
    scriptList,
    assetList,
    assetSaving,
    assetUploadRef,
    handleUploadAsset,
    handleDeleteAsset,
    handleRenameAsset,
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
    refUploadRef,
    handleSaveReference,
    handleDeleteReference,
    handleUploadReference,
    handleCreateScript,
    handleUploadScript,
    handleDeleteScript,
    handleViewScript,
    handleDeleteSkill,
    skillToolOptions,
    skillToolOptionsLoading,
  };
}

export type AssistantSkillLibrary = ReturnType<typeof useAssistantSkillLibrary>;
