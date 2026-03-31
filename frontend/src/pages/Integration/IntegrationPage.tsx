import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  CheckCircle,
  XCircle,
  Loader2,
  Mail,
  Calendar,
  HardDrive,
  FileSpreadsheet,
  ExternalLink,
} from "lucide-react";
import { googleApi } from "../../lib/api";

interface GoogleStatus {
  connected: boolean;
  email?: string;
  scopes?: string[];
  connectedAt?: string;
}

export function IntegrationPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [googleStatus, setGoogleStatus] = useState<GoogleStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    loadStatus();

    const googleParam = searchParams.get("google");
    if (googleParam === "connected") {
      setToast({
        type: "success",
        message: t("integration.toast.googleConnected"),
      });
      searchParams.delete("google");
      setSearchParams(searchParams, { replace: true });
    } else if (googleParam === "error") {
      const reason = searchParams.get("reason") || "Unknown error";
      setToast({
        type: "error",
        message: t("integration.toast.googleConnectFailed", { reason }),
      });
      searchParams.delete("google");
      searchParams.delete("reason");
      setSearchParams(searchParams, { replace: true });
    }
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  async function loadStatus() {
    try {
      const status = await googleApi.getStatus();
      setGoogleStatus(status);
    } catch {
      setGoogleStatus({ connected: false });
    } finally {
      setLoading(false);
    }
  }

  function handleConnect() {
    const url = googleApi.getConnectUrl();
    window.location.href = url;
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      await googleApi.disconnect();
      setGoogleStatus({ connected: false });
      setToast({
        type: "success",
        message: t("integration.toast.googleDisconnected"),
      });
    } catch {
      setToast({
        type: "error",
        message: t("integration.toast.googleDisconnectFailed"),
      });
    } finally {
      setDisconnecting(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-8"></div>
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gray-200 rounded-xl"></div>
              <div className="flex-1">
                <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-1/3"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">
          {t("integration.title")}
        </h1>
        <p className="text-sm text-gray-500 mt-1">{t("integration.subtitle")}</p>
      </div>

      {toast && (
        <div
          className={`mb-6 p-4 rounded-lg border ${
            toast.type === "success"
              ? "bg-green-50 border-green-200 text-green-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          <div className="flex items-center gap-2 text-sm">
            {toast.type === "success" ? (
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 flex-shrink-0" />
            )}
            {toast.message}
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="mt-2 text-sm underline hover:no-underline"
          >
            {t("integration.dismiss")}
          </button>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  {t("integration.googleWorkspace.title")}
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {t("integration.googleWorkspace.description")}
                </p>
                {googleStatus?.connected && (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-2 text-sm text-green-600">
                      <CheckCircle className="w-4 h-4" />
                      {t("integration.googleWorkspace.connectedAs")}{" "}
                      <span className="font-medium">{googleStatus.email}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-blue-50 text-blue-700">
                        <Mail className="w-3 h-3" />{" "}
                        {t("integration.googleWorkspace.gmail")}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-green-50 text-green-700">
                        <Calendar className="w-3 h-3" />{" "}
                        {t("integration.googleWorkspace.calendar")}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-yellow-50 text-yellow-700">
                        <HardDrive className="w-3 h-3" />{" "}
                        {t("integration.googleWorkspace.drive")}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-violet-50 text-violet-700">
                        <FileSpreadsheet className="w-3 h-3" />{" "}
                        {t("integration.googleWorkspace.sheets")}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex-shrink-0 ml-4">
              {googleStatus?.connected ? (
                <button
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50"
                >
                  {disconnecting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    t("integration.googleWorkspace.disconnect")
                  )}
                </button>
              ) : (
                <button
                  onClick={handleConnect}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90"
                >
                  <ExternalLink className="w-4 h-4" />
                  {t("integration.googleWorkspace.connectGoogle")}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
