import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { Plus, Trash2, Edit, ArrowUpDown } from "lucide-react";
import { PageHeader } from "../../components/layout";
import {
  Button,
  StatusDot,
  Modal,
  Input,
  Textarea,
  Select,
  ConfirmModal,
} from "../../components/common";
import { assistantsApi } from "../../lib/api";
import type { Assistant, AssistantLanguage, AssistantTone } from "../../lib/types";

export const AssistantList: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedAssistant, setSelectedAssistant] = useState<Assistant | null>(
    null,
  );
  const [sortColumn, setSortColumn] = useState<"createdAt" | "updatedAt">(
    "createdAt",
  );
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Form state
  const [formData, setFormData] = useState({
    departmentName: "",
    managerName: "",
    primaryLanguage: "auto" as AssistantLanguage,
    tone: "professional" as AssistantTone,
    instructions: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchAssistants = async () => {
    try {
      const assistantsList = await assistantsApi.list();
      setAssistants(assistantsList);
    } catch (error) {
      console.error("Failed to fetch assistants:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAssistants();
  }, []);

  const handleSort = (column: "createdAt" | "updatedAt") => {
    if (sortColumn === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortOrder("desc");
    }
  };

  const sortedAssistants = [...assistants].sort((a, b) => {
    const aValue = new Date(a[sortColumn]).getTime();
    const bValue = new Date(b[sortColumn]).getTime();
    return sortOrder === "asc" ? aValue - bValue : bValue - aValue;
  });

  const handleCreate = async () => {
    const dept = formData.departmentName.trim();
    if (!dept) return;

    setIsSubmitting(true);
    setCreateError(null);
    try {
      const mgr = formData.managerName.trim() || dept;
      await assistantsApi.create({
        name: dept,
        departmentName: dept,
        managerName: mgr,
        primaryLanguage: formData.primaryLanguage,
        tone: formData.tone,
        instructions: formData.instructions,
        model: "gpt-4o",
      });
      setShowCreateModal(false);
      setFormData({
        departmentName: "",
        managerName: "",
        primaryLanguage: "auto",
        tone: "professional",
        instructions: "",
      });
      fetchAssistants();
    } catch (error: unknown) {
      console.error("Failed to create assistant:", error);
      // Extract error message from API response
      const axiosError = error as { response?: { data?: { error?: string } } };
      const errorMessage =
        axiosError.response?.data?.error ||
        "Failed to create assistant. Please try again.";
      setCreateError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedAssistant) return;

    setIsSubmitting(true);
    try {
      await assistantsApi.delete(selectedAssistant._id);
      setShowDeleteModal(false);
      setSelectedAssistant(null);
      fetchAssistants();
    } catch (error) {
      console.error("Failed to delete assistant:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openDeleteModal = (assistant: Assistant, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedAssistant(assistant);
    setShowDeleteModal(true);
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
      <PageHeader
        title={t('assistants.title')}
        actions={
          <Button
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => setShowCreateModal(true)}
          >
            {t('assistants.createAssistant')}
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
        </div>
      ) : assistants.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🤖</span>
          </div>
          <h3 className="text-base font-semibold text-gray-900 mb-2">
            {t('assistants.noAssistants')}
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            {t('assistants.createFirst')}
          </p>
          <Button
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => setShowCreateModal(true)}
          >
            {t('assistants.createAssistant')}
          </Button>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('assistants.departmentName')}
                </th>
                <th
                  className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
                  onClick={() => handleSort("createdAt")}
                >
                  <div className="flex items-center gap-1">
                    {t('assistants.created')}
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
                  onClick={() => handleSort("updatedAt")}
                >
                  <div className="flex items-center gap-1">
                    {t('assistants.updated')}
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('assistants.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedAssistants.map((assistant) => (
                <tr
                  key={assistant._id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/ai-assistant/${assistant._id}`)}
                >
                  <td className="px-4 py-4">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <StatusDot
                          status={
                            assistant.status === "active" ? "active" : "inactive"
                          }
                        />
                        <span className="text-sm font-medium text-gray-900 hover:underline">
                          {assistant.departmentName?.trim() || assistant.name}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500 pl-6">
                        {t("assistants.managerLabel")}:{" "}
                        {assistant.managerName?.trim() || assistant.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-500">
                    {format(new Date(assistant.createdAt), "MMM d, yyyy")}
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-500">
                    {format(new Date(assistant.updatedAt), "MMM d, yyyy")}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/ai-assistant/${assistant._id}`);
                        }}
                        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => openDeleteModal(assistant, e)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setCreateError(null);
        }}
        title={t('assistants.createAssistant')}
        size="md"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setShowCreateModal(false);
                setCreateError(null);
              }}
            >
              {t('channels.cancel')}
            </Button>
            <Button onClick={handleCreate} isLoading={isSubmitting}>
              {t('assistants.create')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {createError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{createError}</p>
            </div>
          )}
          <Input
            label={t('assistants.departmentName')}
            placeholder={t('assistants.departmentNamePlaceholder')}
            value={formData.departmentName}
            onChange={(e) =>
              setFormData({ ...formData, departmentName: e.target.value })
            }
            required
          />
          <Input
            label={t('assistants.managerName')}
            placeholder={t('assistants.managerNamePlaceholder')}
            value={formData.managerName}
            onChange={(e) =>
              setFormData({ ...formData, managerName: e.target.value })
            }
          />
          <Select
            label={t('assistants.primaryLanguage')}
            value={formData.primaryLanguage}
            onChange={(value) => setFormData({ ...formData, primaryLanguage: value as AssistantLanguage })}
            options={[
              { value: "auto", label: t('assistants.dependsOnInput') },
              { value: "en", label: t('assistants.english') },
              { value: "zh-TW", label: t('assistants.traditionalChinese') },
              { value: "zh-CN", label: t('assistants.simplifiedChinese') },
            ]}
          />
          <Select
            label={t('assistants.tone')}
            value={formData.tone}
            onChange={(value) => setFormData({ ...formData, tone: value as AssistantTone })}
            options={[
              { value: "professional", label: t('assistants.professional') },
              { value: "friendly", label: t('assistants.friendly') },
              { value: "casual", label: t('assistants.casual') },
              { value: "formal", label: t('assistants.formal') },
              { value: "empathetic", label: t('assistants.empathetic') },
            ]}
          />
          <Textarea
            label={t('assistants.instructions')}
            placeholder="Outline the assistant's behavior, tone, or any additional context..."
            rows={4}
            value={formData.instructions}
            onChange={(e) =>
              setFormData({ ...formData, instructions: e.target.value })
            }
          />
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        title={t('assistants.deleteAssistant')}
        message={`${t('assistants.deleteConfirm')}`}
        confirmText={t('common.delete')}
        variant="danger"
        isLoading={isSubmitting}
      />
      </div>
    </div>
  );
};
