import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, AlertTriangle, Check } from "lucide-react";
import { Button, Input, Select, Toggle } from "../../components/common";
import { companyApi } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import type {
  BadWordingCategory,
  ModerationInboxFolder,
  ModerationSettings,
} from "../../lib/types";

const FOLDER_OPTIONS: ModerationInboxFolder[] = [
  "attention",
  "negative",
  "priority",
  "slaRisk",
  "spam",
];

function splitCommaSeparated(value: string): string[] {
  return value
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function joinCommaSeparated(items: string[]): string {
  return items.join(", ");
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function newCategory(): BadWordingCategory {
  return {
    id: `cat-${crypto.randomUUID().slice(0, 8)}`,
    name: "",
    enabled: true,
    phrases: [],
    inboxFolder: "attention",
  };
}

export const AIBehaviorSettings: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [settings, setSettings] = useState<ModerationSettings>({
    enabled: true,
    notifyEnabled: false,
    notifyPhoneNumbers: [],
    notifyEmails: [],
    categories: [],
  });
  const [notifyPhoneNumbersText, setNotifyPhoneNumbersText] = useState("");
  const [notifyEmailsText, setNotifyEmailsText] = useState("");

  const loadSettings = useCallback(async () => {
    try {
      const company = await companyApi.get();
      const ms = company.moderationSettings;
      if (ms) {
        setSettings({
          enabled: ms.enabled !== false,
          notifyEnabled: Boolean(ms.notifyEnabled),
          notifyPhoneNumbers: ms.notifyPhoneNumbers ?? [],
          notifyEmails: ms.notifyEmails ?? [],
          categories: (ms.categories ?? []).map((c) => ({
            ...c,
            phrases: [...(c.phrases ?? [])],
          })),
        });
        setNotifyPhoneNumbersText(
          joinCommaSeparated(ms.notifyPhoneNumbers ?? []),
        );
        setNotifyEmailsText(joinCommaSeparated(ms.notifyEmails ?? []));
      }
    } catch (error) {
      console.error("Failed to load moderation settings:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const updateCategory = (
    index: number,
    patch: Partial<BadWordingCategory>,
  ) => {
    setSettings((prev) => ({
      ...prev,
      categories: prev.categories.map((cat, i) =>
        i === index ? { ...cat, ...patch } : cat,
      ),
    }));
  };

  const handleSave = async () => {
    const phones = splitCommaSeparated(notifyPhoneNumbersText);
    const emails = splitCommaSeparated(notifyEmailsText);
    if (settings.notifyEnabled && phones.length === 0 && emails.length === 0) {
      alert(t("settings.aiBehavior.notifyRecipientsRequired"));
      return;
    }
    if (emails.some((email) => !isValidEmail(email))) {
      alert(t("settings.aiBehavior.notifyEmailInvalid"));
      return;
    }

    setIsSaving(true);
    try {
      await companyApi.update({
        moderationSettings: {
          enabled: settings.enabled,
          notifyEnabled: settings.notifyEnabled,
          notifyPhoneNumbers: phones,
          notifyEmails: emails,
          categories: settings.categories.map((c) => ({
            ...c,
            name: c.name.trim() || t("settings.aiBehavior.unnamedCategory"),
            phrases: c.phrases.map((p) => p.trim()).filter(Boolean),
          })),
        },
      });
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
      await loadSettings();
    } catch (error: unknown) {
      console.error("Failed to save moderation settings:", error);
      const err = error as {
        response?: { data?: { error?: string; details?: { msg: string }[] } };
      };
      const msg =
        err.response?.data?.details?.[0]?.msg ??
        err.response?.data?.error ??
        t("settings.aiBehavior.saveFailed");
      alert(msg);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="animate-pulse h-8 bg-gray-200 rounded w-1/3 mb-8" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">
          {t("settings.aiBehavior.title")}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {t("settings.aiBehavior.subtitle")}
        </p>
        <p className="text-sm text-gray-500 mt-2">
          {t("settings.aiBehavior.dualGateHint")}{" "}
          <Link to="/channels" className="text-primary hover:underline">
            {t("settings.aiBehavior.channelLink")}
          </Link>
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6 space-y-6">
        <Toggle
          checked={settings.enabled}
          onChange={(enabled) => setSettings((s) => ({ ...s, enabled }))}
          label={t("settings.aiBehavior.masterEnable")}
          description={t("settings.aiBehavior.masterEnableDesc")}
          disabled={!isAdmin}
        />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">
            {t("settings.aiBehavior.categoriesTitle")}
          </h2>
          {isAdmin && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                setSettings((s) => ({
                  ...s,
                  categories: [...s.categories, newCategory()],
                }))
              }
            >
              <Plus className="w-4 h-4 mr-1" />
              {t("settings.aiBehavior.addCategory")}
            </Button>
          )}
        </div>

        <div className="space-y-6">
          {settings.categories.map((category, index) => (
            <div
              key={category.id}
              className="border border-gray-200 rounded-lg p-4 space-y-4"
            >
              <div className="flex items-start justify-between gap-4">
                <Toggle
                  checked={category.enabled}
                  onChange={(enabled) => updateCategory(index, { enabled })}
                  label={t("settings.aiBehavior.categoryEnabled")}
                  disabled={!isAdmin}
                />
                {isAdmin && settings.categories.length > 1 && (
                  <button
                    type="button"
                    className="p-2 text-gray-400 hover:text-red-600"
                    onClick={() =>
                      setSettings((s) => ({
                        ...s,
                        categories: s.categories.filter((_, i) => i !== index),
                      }))
                    }
                    aria-label={t("settings.aiBehavior.removeCategory")}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              <Input
                label={t("settings.aiBehavior.categoryName")}
                value={category.name}
                onChange={(e) => updateCategory(index, { name: e.target.value })}
                disabled={!isAdmin}
              />

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t("settings.aiBehavior.phrasesLabel")}
                </label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-y min-h-[100px] font-mono"
                  value={category.phrases.join("\n")}
                  onChange={(e) =>
                    updateCategory(index, {
                      phrases: e.target.value.split("\n"),
                    })
                  }
                  placeholder={t("settings.aiBehavior.phrasesPlaceholder")}
                  disabled={!isAdmin}
                />
                <p className="text-xs text-gray-500 mt-1">
                  {t("settings.aiBehavior.phrasesHint")}
                </p>
              </div>

              <Select
                label={t("settings.aiBehavior.inboxFolder")}
                value={category.inboxFolder}
                onChange={(value) =>
                  updateCategory(index, {
                    inboxFolder: value as ModerationInboxFolder,
                  })
                }
                options={FOLDER_OPTIONS.map((folder) => ({
                  value: folder,
                  label: t(`settings.aiBehavior.folders.${folder}`),
                }))}
                disabled={!isAdmin}
              />

              {category.inboxFolder === "spam" && (
                <div className="flex items-start gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{t("settings.aiBehavior.spamWarning")}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">
          {t("settings.aiBehavior.notifyTitle")}
        </h2>
        <p className="text-sm text-gray-500">
          {t("settings.aiBehavior.notifyDesc")}
        </p>
        <Toggle
          checked={settings.notifyEnabled}
          onChange={(notifyEnabled) =>
            setSettings((s) => ({ ...s, notifyEnabled }))
          }
          label={t("settings.aiBehavior.notifyEnabled")}
          description={t("settings.aiBehavior.notifyEnabledDesc")}
          disabled={!isAdmin}
        />
        {settings.notifyEnabled && (
          <>
            <Input
              label={t("settings.aiBehavior.notifyPhone")}
              value={notifyPhoneNumbersText}
              onChange={(e) => setNotifyPhoneNumbersText(e.target.value)}
              placeholder="85261218051, 85266881111"
              disabled={!isAdmin}
            />
            <p className="text-xs text-gray-500 -mt-2">
              {t("settings.aiBehavior.notifyPhoneHint")}
            </p>
            <Input
              label={t("settings.aiBehavior.notifyEmails")}
              value={notifyEmailsText}
              onChange={(e) => setNotifyEmailsText(e.target.value)}
              placeholder="manager@example.com, ops@example.com"
              disabled={!isAdmin}
            />
            <p className="text-xs text-gray-500 -mt-2">
              {t("settings.aiBehavior.notifyEmailsHint")}
            </p>
          </>
        )}
        <p className="text-xs text-amber-700">
          {t("settings.aiBehavior.notifyPrivacy")}
        </p>
      </div>

      {isAdmin && (
        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? t("settings.aiBehavior.saving") : t("common.save")}
          </Button>
          {isSaved && (
            <span className="flex items-center text-sm text-green-600 gap-1">
              <Check className="w-4 h-4" />
              {t("common.saved")}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
