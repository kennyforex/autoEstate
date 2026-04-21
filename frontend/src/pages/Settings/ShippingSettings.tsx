import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../../components/layout";
import { Button, Input } from "../../components/common";
import { shippingMethodsApi } from "../../lib/api";
import type { ShippingMethod } from "../../lib/types";

type MethodDraft = {
  _id?: string;
  labelZh: string;
  labelEn: string;
  fee: number;
  sortOrder: number;
  isActive: boolean;
};

const emptyDraft = (): MethodDraft => ({
  labelZh: "",
  labelEn: "",
  fee: 0,
  sortOrder: 0,
  isActive: true,
});

export const ShippingSettings: React.FC = () => {
  const { t } = useTranslation();
  const [methods, setMethods] = useState<ShippingMethod[]>([]);
  const [draft, setDraft] = useState<MethodDraft>(emptyDraft);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => methods.find((m) => m._id === draft._id),
    [methods, draft._id],
  );

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const list = await shippingMethodsApi.list();
      setMethods(list);
    } catch (err) {
      console.error(err);
      setError(t("settings.shippingPage.loadError"));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const resetDraft = () => {
    setDraft(emptyDraft());
    setError(null);
  };

  const startEdit = (m: ShippingMethod) => {
    setDraft({
      _id: m._id,
      labelZh: m.labelZh,
      labelEn: m.labelEn,
      fee: m.fee,
      sortOrder: m.sortOrder,
      isActive: m.isActive,
    });
    setError(null);
  };

  const handleSave = async () => {
    if (!draft.labelZh.trim()) {
      setError(t("settings.shippingPage.labelZhRequired"));
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      if (draft._id) {
        await shippingMethodsApi.update(draft._id, draft);
      } else {
        await shippingMethodsApi.create(draft);
      }
      await load();
      resetDraft();
    } catch (err: unknown) {
      const msg =
        typeof err === "object" && err !== null && "response" in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      setError(msg || t("settings.shippingPage.saveError"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (m: ShippingMethod) => {
    const confirmed = window.confirm(
      t("settings.shippingPage.deleteConfirm", { name: m.labelZh || m.labelEn }),
    );
    if (!confirmed) return;
    setError(null);
    try {
      await shippingMethodsApi.delete(m._id);
      await load();
      if (draft._id === m._id) resetDraft();
    } catch (err: unknown) {
      const msg =
        typeof err === "object" && err !== null && "response" in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      setError(msg || t("settings.shippingPage.deleteError"));
    }
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <PageHeader
          title={t("settings.shippingPage.title")}
          subtitle={t("settings.shippingPage.subtitle")}
          actions={
            <Button variant="outline" onClick={resetDraft}>
              {t("settings.shippingPage.newMethod")}
            </Button>
          }
        />

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    {t("settings.shippingPage.colLabelZh")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    {t("settings.shippingPage.colLabelEn")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    {t("settings.shippingPage.colFee")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    {t("settings.shippingPage.colStatus")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    {t("settings.shippingPage.colActions")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-500">
                      {t("settings.shippingPage.loading")}
                    </td>
                  </tr>
                ) : methods.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-500">
                      {t("settings.shippingPage.empty")}
                    </td>
                  </tr>
                ) : (
                  methods.map((m) => (
                    <tr
                      key={m._id}
                      className={draft._id === m._id ? "bg-primary-50/40" : ""}
                    >
                      <td className="px-4 py-4">
                        <div className="text-sm font-medium text-gray-900">{m.labelZh}</div>
                        <div className="text-xs text-gray-500">
                          {t("settings.shippingPage.sortShort")}: {m.sortOrder}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-700">{m.labelEn || "—"}</td>
                      <td className="px-4 py-4 text-sm text-gray-900">{m.fee}</td>
                      <td className="px-4 py-4 text-sm">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                            m.isActive
                              ? "bg-green-50 text-green-700"
                              : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {m.isActive
                            ? t("settings.shippingPage.active")
                            : t("settings.shippingPage.inactive")}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex gap-2">
                          <Button size="sm" variant="ghost" onClick={() => startEdit(m)}>
                            {t("settings.shippingPage.edit")}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:bg-red-50"
                            onClick={() => handleDelete(m)}
                          >
                            {t("settings.shippingPage.delete")}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {draft._id
                  ? t("settings.shippingPage.formEditTitle")
                  : t("settings.shippingPage.formCreateTitle")}
              </h2>
              <p className="mt-1 text-sm text-gray-500">{t("settings.shippingPage.formHint")}</p>
            </div>

            <Input
              label={t("settings.shippingPage.labelZh")}
              value={draft.labelZh}
              onChange={(e) => setDraft((c) => ({ ...c, labelZh: e.target.value }))}
              placeholder={t("settings.shippingPage.labelZhPlaceholder")}
            />
            <Input
              label={t("settings.shippingPage.labelEn")}
              value={draft.labelEn}
              onChange={(e) => setDraft((c) => ({ ...c, labelEn: e.target.value }))}
              placeholder={t("settings.shippingPage.labelEnPlaceholder")}
            />
            <Input
              label={t("settings.shippingPage.fee")}
              type="number"
              min={0}
              step={0.01}
              value={draft.fee}
              onChange={(e) =>
                setDraft((c) => ({ ...c, fee: Number(e.target.value || 0) }))
              }
            />
            <Input
              label={t("settings.shippingPage.sortOrder")}
              type="number"
              value={draft.sortOrder}
              onChange={(e) =>
                setDraft((c) => ({ ...c, sortOrder: Number(e.target.value || 0) }))
              }
            />
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(e) => setDraft((c) => ({ ...c, isActive: e.target.checked }))}
              />
              {t("settings.shippingPage.isActive")}
            </label>

            <div className="flex gap-3">
              <Button
                isLoading={isSaving}
                onClick={handleSave}
                disabled={!draft.labelZh.trim()}
              >
                {t("settings.shippingPage.save")}
              </Button>
              <Button variant="ghost" onClick={resetDraft}>
                {t("settings.shippingPage.clear")}
              </Button>
            </div>

            {selected && (
              <p className="text-xs text-gray-500">
                {t("settings.shippingPage.editingHint", {
                  name: selected.labelZh || selected.labelEn,
                })}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
