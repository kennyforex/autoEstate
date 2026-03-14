import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import {
  MessageCircle,
  ArrowLeft,
  RefreshCw,
  Trash2,
  QrCode,
  Sparkles,
} from "lucide-react";
import {
  Button,
  Input,
  Select,
  Toggle,
  StatusDot,
  Badge,
  ConfirmModal,
  ToastContainer,
  useToasts,
} from "../../components/common";
import { channelsApi, assistantsApi } from "../../lib/api";
import { getSocket } from "../../lib/socket";
import type { Channel, Assistant } from "../../lib/types";

export const WhatsAppConfig: React.FC = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toasts, dismissToast, showSuccess, showError } = useToasts();

  const [channel, setChannel] = useState<Channel | null>(null);
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);
  const [isRefreshingQR, setIsRefreshingQR] = useState(false);

  // Form state
  const [aiEnabled, setAIEnabled] = useState(false);
  const [selectedAssistant, setSelectedAssistant] = useState("");
  const [autoReplyMode, setAutoReplyMode] = useState<
    "all" | "off" | "per_chat"
  >("off");
  const [autoEscalate, setAutoEscalate] = useState(false);
  const [responseDelay, setResponseDelay] = useState(0);
  const [detectBadWording, setDetectBadWording] = useState(true);
  const [badWordingResponse, setBadWordingResponse] = useState(
    "We will help you as best as possible. Please let us know how we can assist you."
  );

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;

      try {
        const [channelData, assistantsData] = await Promise.all([
          channelsApi.get(id),
          assistantsApi.list("active"),
        ]);

        setChannel(channelData);
        setAssistants(assistantsData);

        // Set form values
        setAIEnabled(channelData.aiSettings?.enabled || false);
        setSelectedAssistant(channelData.assistantId || "");
        setAutoReplyMode(channelData.aiSettings?.autoReplyMode || "off");
        setAutoEscalate(
          channelData.aiSettings?.escalateOnNegativeSentiment || false,
        );
        setResponseDelay(channelData.aiSettings?.responseDelay || 0);
        setDetectBadWording(channelData.aiSettings?.detectBadWording !== false);
        setBadWordingResponse(
          channelData.aiSettings?.badWordingResponse ||
            "We will help you as best as possible. Please let us know how we can assist you."
        );
      } catch (error) {
        console.error("Failed to fetch channel:", error);
        navigate("/channels");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [id, navigate]);

  // Listen for channel status updates
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !id) return;

    const handleStatusUpdate = (data: {
      channelId: string;
      status: string;
    }) => {
      if (data.channelId === id) {
        setChannel((prev) =>
          prev ? { ...prev, status: data.status as Channel["status"] } : prev,
        );
      }
    };

    socket.on("channel:status", handleStatusUpdate);

    return () => {
      socket.off("channel:status", handleStatusUpdate);
    };
  }, [id]);

  const handleConnect = async () => {
    if (!id) return;

    try {
      const updated = await channelsApi.connect(id);
      setChannel(updated);
    } catch (error) {
      console.error("Failed to connect channel:", error);
    }
  };

  const handleDisconnect = async () => {
    if (!id) return;

    try {
      const updated = await channelsApi.disconnect(id);
      setChannel(updated);
      setShowDisconnectModal(false);
    } catch (error) {
      console.error("Failed to disconnect channel:", error);
    }
  };

  const handleRefreshQR = async () => {
    if (!id) return;

    setIsRefreshingQR(true);
    try {
      const result = await channelsApi.getQRCode(id);
      if (result.qrCode) {
        setChannel((prev) =>
          prev
            ? {
                ...prev,
                qrCode: result.qrCode,
                status: result.status as Channel["status"],
              }
            : prev,
        );
        showSuccess(
          "QR Code Refreshed",
          "Scan the new QR code with your WhatsApp app",
        );
      } else if (result.status === "connected") {
        setChannel((prev) =>
          prev ? { ...prev, status: "connected", qrCode: undefined } : prev,
        );
        showSuccess(
          "Already Connected",
          "This channel is already connected to WhatsApp",
        );
      } else {
        showError(
          "No QR Code",
          "Could not generate a new QR code. Please try again.",
        );
      }
    } catch (error: any) {
      console.error("Failed to refresh QR code:", error);
      showError(
        "Failed to refresh QR code",
        error?.message || "Please try again",
      );
    } finally {
      setIsRefreshingQR(false);
    }
  };

  const handleSave = async () => {
    if (!id) return;

    setIsSaving(true);
    try {
      // Update channel settings
      const assistantId =
        typeof selectedAssistant === "object" && selectedAssistant !== null
          ? (selectedAssistant as any)._id
          : selectedAssistant;

      await channelsApi.update(id, {
        assistantId: assistantId || undefined,
      });

      // Update AI settings
      const aiSettingsUpdate = {
        enabled: aiEnabled,
        autoReplyMode,
        escalateOnNegativeSentiment: autoEscalate,
        responseDelay,
        detectBadWording,
        badWordingResponse,
      };

      await channelsApi.updateAISettings(id, aiSettingsUpdate);

      // Refresh channel data
      const updated = await channelsApi.get(id);
      setChannel(updated);
    } catch (error: any) {
      console.error("Failed to save settings:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;

    try {
      await channelsApi.delete(id);
      navigate("/channels");
    } catch (error) {
      console.error("Failed to delete channel:", error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="w-8 h-8 border-4 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!channel) {
    return null;
  }

  const isConnected = channel.status === "connected";
  const isConnecting = channel.status === "connecting";

  return (
    <div className="flex h-screen">
      {/* Sidebar - Channel List (simplified) */}
      <div className="w-[280px] h-full bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <button
            onClick={() => navigate("/channels")}
            className="flex items-center gap-2 text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">{t('channels.backToChannels')}</span>
          </button>
        </div>

        <div className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">{channel.name}</p>
              <div className="flex items-center gap-1">
                <StatusDot
                  status={
                    isConnected
                      ? "online"
                      : isConnecting
                        ? "connecting"
                        : "offline"
                  }
                />
                <span className="text-xs text-gray-500 capitalize">
                  {channel.status}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="max-w-2xl mx-auto p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <MessageCircle className="w-6 h-6 text-gray-400" />
              <h1 className="text-xl font-semibold text-gray-900">WhatsApp</h1>
              <Badge
                variant={
                  isConnected ? "success" : isConnecting ? "warning" : "error"
                }
              >
                {channel.status}
              </Badge>
            </div>
            <Toggle
              checked={isConnected}
              onChange={() => {
                if (isConnected) {
                  setShowDisconnectModal(true);
                } else {
                  handleConnect();
                }
              }}
            />
          </div>

          {/* Connection Section */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">{t('channels.connection')}</h2>

            {isConnected ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-green-800">
                      {t('channels.connected')}
                    </p>
                    {channel.phoneNumber && (
                      <p className="text-sm text-green-700">
                        {channel.phoneNumber}
                      </p>
                    )}
                    <p className="text-xs text-green-600">
                      {t('channels.since')}{" "}
                      {format(
                        new Date(channel.updatedAt),
                        "MMM d, yyyy h:mm a",
                      )}
                    </p>
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setShowDisconnectModal(true)}
                  >
                    {t('channels.disconnect')}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-gray-500">
                  {t('channels.scanInstructions')}
                </p>

                <div className="flex flex-col items-center p-8 bg-gray-50 border border-gray-200 rounded-xl">
                  {channel.qrCode ? (
                    <div className="relative">
                      <img
                        src={channel.qrCode}
                        alt="WhatsApp QR Code"
                        className="w-48 h-48"
                      />
                    </div>
                  ) : isConnecting ? (
                    <div className="w-48 h-48 flex items-center justify-center">
                      <div className="text-center">
                        <div className="w-8 h-8 border-4 border-gray-300 border-t-gray-600 rounded-full animate-spin mx-auto mb-2" />
                        <p className="text-sm text-gray-500">
                          {t('channels.connecting')}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="w-48 h-48 bg-gray-100 rounded-lg flex items-center justify-center">
                      <QrCode className="w-16 h-16 text-gray-400" />
                    </div>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={handleRefreshQR}
                    isLoading={isRefreshingQR}
                    leftIcon={<RefreshCw className="w-4 h-4" />}
                  >
                    {t('channels.refreshQR')}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* AI Settings */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-5 h-5 text-gray-400" />
              <h2 className="text-base font-semibold text-gray-900">{t('channels.aiSettings')}</h2>
            </div>

            <div className="space-y-6">
              <Toggle
                checked={aiEnabled}
                onChange={(enabled) => {
                  setAIEnabled(enabled);
                  // If enabling AI and mode is "off", automatically set to "per_chat" for better UX
                  if (enabled && autoReplyMode === "off") {
                    setAutoReplyMode("per_chat");
                  }
                }}
                label={t('channels.enableAiResponses')}
                description={t('channels.enableAiDesc')}
              />

              {aiEnabled && autoReplyMode === "off" && (
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    <strong>{t('channels.note')}:</strong> {t('channels.aiEnabledNoReply')}
                  </p>
                </div>
              )}

              {aiEnabled && (
                <>
                  <Select
                    label={t('channels.aiAssistant')}
                    placeholder={t('channels.selectAssistant')}
                    value={selectedAssistant}
                    onChange={setSelectedAssistant}
                    options={assistants.map((a) => ({
                      value: a._id,
                      label: a.name,
                    }))}
                  />

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      {t('channels.autoReplyMode')} <span className="text-red-500">*</span>
                    </label>
                    <Select
                      value={autoReplyMode}
                      onChange={(value) =>
                        setAutoReplyMode(value as "all" | "off" | "per_chat")
                      }
                      options={[
                        {
                          value: "all",
                          label: t('channels.autoReplyAll'),
                        },
                        {
                          value: "per_chat",
                          label: t('channels.autoReplyPerChat'),
                        },
                        {
                          value: "off",
                          label: t('channels.autoReplyOff'),
                        },
                      ]}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {autoReplyMode === "all" && t('channels.autoReplyAllDesc')}
                      {autoReplyMode === "per_chat" && t('channels.autoReplyPerChatDesc')}
                      {autoReplyMode === "off" && (
                        <span className="text-red-500">
                          {t('channels.autoReplyOffDesc')}
                        </span>
                      )}
                    </p>
                  </div>

                  <Toggle
                    checked={autoEscalate}
                    onChange={setAutoEscalate}
                    label={t('channels.autoEscalate')}
                    description={t('channels.autoEscalateDesc')}
                  />

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      {t('channels.responseDelay')}
                    </label>
                    <Input
                      type="number"
                      min={0}
                      max={30}
                      value={responseDelay}
                      onChange={(e) => setResponseDelay(Number(e.target.value))}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {t('channels.responseDelayDesc')}
                    </p>
                  </div>

                  <div className="border-t border-gray-200 pt-4 mt-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-4">
                      {t('channels.badWordingDetection')}
                    </h3>
                    <Toggle
                      checked={detectBadWording}
                      onChange={setDetectBadWording}
                      label={t('channels.detectBadWording')}
                      description={t('channels.detectBadWordingDesc')}
                    />

                    {detectBadWording && (
                      <div className="mt-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                          {t('channels.badWordingResponse')}
                        </label>
                        <textarea
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                          rows={3}
                          value={badWordingResponse}
                          onChange={(e) => setBadWordingResponse(e.target.value)}
                          placeholder={t('channels.badWordingPlaceholder')}
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          {t('channels.badWordingAutoSent')}
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <Button
              variant="danger"
              leftIcon={<Trash2 className="w-4 h-4" />}
              onClick={() => setShowDeleteModal(true)}
            >
              {t('channels.deleteChannel')}
            </Button>
            <Button onClick={handleSave} isLoading={isSaving}>
              {t('channels.saveChanges')}
            </Button>
          </div>
        </div>
      </div>

      {/* Disconnect Modal */}
      <ConfirmModal
        isOpen={showDisconnectModal}
        onClose={() => setShowDisconnectModal(false)}
        onConfirm={handleDisconnect}
        title={t('channels.disconnectChannel')}
        message={t('channels.disconnectConfirm')}
        confirmText={t('channels.disconnect')}
        variant="danger"
      />

      {/* Delete Modal */}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        title={t('channels.deleteChannel')}
        message={t('channels.deleteConfirm', { name: channel.name })}
        confirmText={t('common.delete')}
        variant="danger"
      />

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
};
