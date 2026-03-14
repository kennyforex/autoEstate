import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Check, Mail } from "lucide-react";
import { Button, Input } from "../../components/common";
import { companyApi } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import type { Company } from "../../lib/types";

/** Shown in password field when a password is already set (never sent to server) */
const PASSWORD_PLACEHOLDER = "••••••••";

export const SMTPSettings: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [company, setCompany] = useState<Company | null>(null);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [emailFrom, setEmailFrom] = useState("");
  const [appUrl, setAppUrl] = useState("");
  const [testEmailTo, setTestEmailTo] = useState("");
  const [testEmailSending, setTestEmailSending] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState<
    "success" | "error" | null
  >(null);
  const [testEmailError, setTestEmailError] = useState("");

  const isAdmin = user?.role === "admin";

  useEffect(() => {
    loadCompany();
  }, []);

  const loadCompany = async () => {
    try {
      const data = await companyApi.get();
      setCompany(data);
      setSmtpHost(data.smtpHost || "");
      setSmtpPort(data.smtpPort != null ? String(data.smtpPort) : "587");
      setSmtpUser(data.smtpUser || "");
      setSmtpPass(data.smtpPasswordSet ? PASSWORD_PLACEHOLDER : "");
      setEmailFrom(data.emailFrom || "");
      setAppUrl(data.appUrl || "");
    } catch (error) {
      console.error("Failed to load SMTP settings:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendTestEmail = async () => {
    if (!testEmailTo.trim()) return;
    setTestEmailSending(true);
    setTestEmailResult(null);
    setTestEmailError("");
    try {
      const { success, error } = await companyApi.sendTestEmail(
        testEmailTo.trim(),
      );
      setTestEmailResult(success ? "success" : "error");
      if (error) setTestEmailError(error);
    } catch {
      setTestEmailResult("error");
      setTestEmailError("Failed to send test email");
    } finally {
      setTestEmailSending(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload: Parameters<typeof companyApi.update>[0] = {
        smtpHost: smtpHost?.trim() || undefined,
        smtpPort: smtpPort ? parseInt(smtpPort, 10) : undefined,
        smtpUser: smtpUser?.trim() || undefined,
        emailFrom: emailFrom?.trim() || undefined,
        appUrl: appUrl?.trim() || undefined,
      };
      // Only send password if user entered a new one (not placeholder or empty)
      if (smtpPass.trim() && smtpPass !== PASSWORD_PLACEHOLDER)
        payload.smtpPass = smtpPass;
      const updated = await companyApi.update(payload);
      setCompany(updated);
      setSmtpPass(updated.smtpPasswordSet ? PASSWORD_PLACEHOLDER : "");
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
    } catch (error: unknown) {
      console.error("Failed to save SMTP settings:", error);
      const err = error as {
        response?: {
          data?: { error?: string; details?: { message: string }[] };
        };
      };
      const msg =
        err.response?.data?.details?.[0]?.message ??
        err.response?.data?.error ??
        (typeof (err as Error)?.message === "string"
          ? (err as Error).message
          : null);
      alert(msg || "Failed to save changes. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-8"></div>
          <div className="card p-6">
            <div className="space-y-4">
              <div className="h-10 bg-gray-200 rounded"></div>
              <div className="h-10 bg-gray-200 rounded"></div>
              <div className="h-10 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
          <Mail className="w-7 h-7 text-gray-400" />
          {t("settings.smtp.title")}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {t("settings.smtp.subtitle")}
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <div className="space-y-4">
          <Input
            label={t("general.email.smtpHost")}
            value={smtpHost}
            onChange={(e) => setSmtpHost(e.target.value)}
            placeholder={t("general.email.smtpHostPlaceholder")}
            disabled={!isAdmin}
          />
          <Input
            label={t("general.email.smtpPort")}
            type="number"
            value={smtpPort}
            onChange={(e) => setSmtpPort(e.target.value)}
            placeholder="587"
            disabled={!isAdmin}
          />
          <Input
            label={t("general.email.smtpUser")}
            value={smtpUser}
            onChange={(e) => setSmtpUser(e.target.value)}
            placeholder={t("general.email.smtpUserPlaceholder")}
            disabled={!isAdmin}
          />
          <Input
            label={t("general.email.smtpPass")}
            type="password"
            value={smtpPass}
            onChange={(e) => setSmtpPass(e.target.value)}
            onFocus={() => smtpPass === PASSWORD_PLACEHOLDER && setSmtpPass("")}
            onBlur={() =>
              !smtpPass.trim() &&
              company?.smtpPasswordSet &&
              setSmtpPass(PASSWORD_PLACEHOLDER)
            }
            placeholder={t("general.email.smtpPassPlaceholder")}
            disabled={!isAdmin}
            autoComplete="new-password"
          />
          <Input
            label={t("general.email.emailFrom")}
            type="email"
            value={emailFrom}
            onChange={(e) => setEmailFrom(e.target.value)}
            placeholder={t("general.email.emailFromPlaceholder")}
            disabled={!isAdmin}
          />
          <Input
            label={t("general.email.appUrl")}
            type="url"
            value={appUrl}
            onChange={(e) => setAppUrl(e.target.value)}
            placeholder={t("general.email.appUrlPlaceholder")}
            disabled={!isAdmin}
          />
          <p className="text-xs text-gray-500">
            {t("general.email.appUrlHint")}
          </p>
        </div>
      </div>

      {/* Send test email */}
      {isAdmin && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
          <h2 className="text-base font-semibold text-gray-900 mb-2">
            {t("settings.smtp.testTitle")}
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            {t("settings.smtp.testSubtitle")}
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <Input
              label={t("settings.smtp.testTo")}
              type="email"
              value={testEmailTo}
              onChange={(e) => {
                setTestEmailTo(e.target.value);
                setTestEmailResult(null);
              }}
              placeholder="you@example.com"
              className="flex-1 min-w-[200px]"
            />
            <Button
              variant="outline"
              onClick={handleSendTestEmail}
              isLoading={testEmailSending}
              disabled={!testEmailTo.trim()}
            >
              {t("settings.smtp.sendTest")}
            </Button>
          </div>
          {testEmailResult === "success" && (
            <p className="mt-3 text-sm text-green-600">
              {t("settings.smtp.testSuccess")}
            </p>
          )}
          {testEmailResult === "error" && (
            <p className="mt-3 text-sm text-amber-600">
              {testEmailError || t("settings.smtp.testError")}
            </p>
          )}
        </div>
      )}

      {isAdmin && (
        <div className="flex justify-end">
          <Button onClick={handleSave} isLoading={isSaving}>
            {isSaved ? (
              <>
                <Check className="w-4 h-4 mr-2" />
                {t("common.saved")}
              </>
            ) : (
              t("common.save")
            )}
          </Button>
        </div>
      )}

      {!isAdmin && (
        <div className="p-4 bg-white border border-gray-200 rounded-xl">
          <p className="text-sm text-gray-500">
            {t("general.adminOnly")}
          </p>
        </div>
      )}
    </div>
  );
};
