import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import { PageHeader } from "../components/layout";
import { Button, Input, Select, Textarea, Badge } from "../components/common";
import { ordersApi, productsApi, tagsApi } from "../lib/api";
import type {
  Order,
  OrderActivityEntry,
  OrderFulfillmentStatus,
  OrderItem,
  OrderPaymentStatus,
  OrderStatus,
  Product,
  Tag,
} from "../lib/types";

function clampMoney(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function computeTotals(args: {
  items: Array<{ quantity: number; unitPrice: number }>;
  discountTotal: number;
  shippingFee: number;
  taxTotal: number;
}) {
  const subtotal = clampMoney(
    args.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0),
  );
  const total = clampMoney(subtotal - args.discountTotal + args.shippingFee + args.taxTotal);
  return { subtotal, total };
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 overflow-hidden bg-white">
      <div className="border-b border-gray-200 bg-gray-50/90 px-5 py-3">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {hint ? <p className="mt-1 text-xs text-gray-500">{hint}</p> : null}
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </section>
  );
}

type DraftItem = Omit<OrderItem, "lineTotal"> & { lineTotal?: number };

export const OrderForm: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const isNew = !id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);

  const [draft, setDraft] = useState<Partial<Order>>({
    status: "open",
    paymentStatus: "unpaid",
    fulfillmentStatus: "unfulfilled",
    currency: "HKD",
    discountTotal: 0,
    shippingFee: 0,
    taxTotal: 0,
    tagIds: [],
  });

  const [items, setItems] = useState<DraftItem[]>([
    {
      snapshot: { productName: "" },
      quantity: 1,
      unitPrice: 0,
      notes: "",
    },
  ]);

  const [newNotes, setNewNotes] = useState<string[]>([]);
  const [noteInput, setNoteInput] = useState("");

  const totals = useMemo(() => {
    return computeTotals({
      items: items.map((i) => ({ quantity: i.quantity, unitPrice: i.unitPrice })),
      discountTotal: Number(draft.discountTotal || 0),
      shippingFee: Number(draft.shippingFee || 0),
      taxTotal: Number(draft.taxTotal || 0),
    });
  }, [items, draft.discountTotal, draft.shippingFee, draft.taxTotal]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, tg] = await Promise.all([productsApi.list(true), tagsApi.list()]);
      setProducts(p);
      setTags(tg);

      if (!isNew && id) {
        const order = await ordersApi.get(id);
        setDraft(order);
        setItems(
          (order.items || []).map((it) => ({
            ...it,
            quantity: it.quantity || 1,
            unitPrice: it.unitPrice || 0,
          })),
        );
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("ordersPage.loadError"));
    } finally {
      setLoading(false);
    }
  }, [id, isNew, t]);

  useEffect(() => {
    load();
  }, [load]);

  const productOptions = useMemo(
    () =>
      products.map((p) => ({
        value: p._id,
        label: p.name,
      })),
    [products],
  );

  const updateItem = (idx: number, patch: Partial<DraftItem>) => {
    setItems((cur) =>
      cur.map((it, i) => {
        if (i !== idx) return it;
        const next = { ...it, ...patch };
        const unitPrice = clampMoney(Number(next.unitPrice || 0));
        const quantity = Math.max(1, Math.floor(Number(next.quantity || 1)));
        return {
          ...next,
          unitPrice,
          quantity,
          lineTotal: clampMoney(quantity * unitPrice),
        };
      }),
    );
  };

  const addItem = () => {
    setItems((cur) => [
      ...cur,
      { snapshot: { productName: "" }, quantity: 1, unitPrice: 0, notes: "" },
    ]);
  };

  const removeItem = (idx: number) => {
    setItems((cur) => cur.filter((_, i) => i !== idx));
  };

  const toggleTag = (tagId: string) => {
    setDraft((cur) => {
      const current = new Set(cur.tagIds || []);
      if (current.has(tagId)) current.delete(tagId);
      else current.add(tagId);
      return { ...cur, tagIds: Array.from(current) };
    });
  };

  const addNote = () => {
    const msg = noteInput.trim();
    if (!msg) return;
    setNewNotes((cur) => [...cur, msg]);
    setNoteInput("");
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload: Parameters<typeof ordersApi.create>[0] = {
        clientName: draft.clientName || "",
        phoneNumber: draft.phoneNumber || "",
        email: draft.email || "",
        shippingAddress: draft.shippingAddress || "",
        shippingMethod: draft.shippingMethod || "",
        deliveryDate: draft.deliveryDate,
        status: (draft.status || "open") as OrderStatus,
        paymentStatus: (draft.paymentStatus || "unpaid") as OrderPaymentStatus,
        fulfillmentStatus: (draft.fulfillmentStatus || "unfulfilled") as OrderFulfillmentStatus,
        currency: String(draft.currency || "HKD"),
        items: items.map((it) => ({
          snapshot: it.snapshot,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          notes: it.notes || undefined,
        })),
        discountTotal: Number(draft.discountTotal || 0),
        shippingFee: Number(draft.shippingFee || 0),
        taxTotal: Number(draft.taxTotal || 0),
        tagIds: (draft.tagIds || []) as string[],
      };

      let order: Order;
      if (isNew) {
        order = await ordersApi.create(payload);
        for (const msg of newNotes) {
          await ordersApi.addActivity(order._id, msg);
        }
        navigate(`/orders/${order._id}`, { replace: true });
      } else {
        // For updates we can reuse the same shape; backend ignores unknown fields.
        order = await ordersApi.update(id!, payload);
      }
      setDraft(order);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("ordersPage.saveError"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 bg-gray-50 min-h-screen">
        <div className="max-w-6xl mx-auto">
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-500">
            {t("ordersPage.loading")}
          </div>
        </div>
      </div>
    );
  }

  const orderTitle = isNew
    ? t("ordersPage.newOrderTitle")
    : draft.orderNumber || t("ordersPage.orderTitleFallback");

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <PageHeader
          title={orderTitle}
          subtitle={t("ordersPage.formSubtitle")}
          actions={
            <div className="flex items-center gap-2">
              {!isNew && draft.paymentStatus ? (
                <Badge variant={draft.paymentStatus === "paid" ? "success" : "default"}>
                  {draft.paymentStatus === "paid"
                    ? t("ordersPage.payment.paid")
                    : t("ordersPage.payment.unpaid")}
                </Badge>
              ) : null}
              <Button variant="secondary" onClick={() => navigate("/orders")}>
                {t("ordersPage.backToList")}
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving ? t("ordersPage.saving") : t("ordersPage.save")}
              </Button>
            </div>
          }
        />

        {error ? (
          <div className="mt-4 bg-white border border-red-200 rounded-xl p-4 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <Section title={t("ordersPage.sections.items")}>
              <div className="space-y-4">
                {items.map((item, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-gray-200 p-4 space-y-3"
                  >
                    <div className="grid gap-3 md:grid-cols-[1fr_160px_120px_120px_40px] items-end">
                      <div>
                        <Select
                          value={item.snapshot.productId || ""}
                          onChange={(value) => {
                            const p = products.find((pp) => pp._id === value);
                            updateItem(idx, {
                              snapshot: {
                                ...item.snapshot,
                                productId: value || undefined,
                                productName: p?.name || item.snapshot.productName || "",
                                imageUrl: p?.primaryImageUrl || p?.images?.[0] || item.snapshot.imageUrl,
                              },
                            });
                          }}
                          options={[
                            { value: "", label: t("ordersPage.item.productSelectPlaceholder") },
                            ...productOptions,
                          ]}
                        />
                      </div>
                      <Input
                        label={t("ordersPage.item.productName")}
                        value={item.snapshot.productName}
                        onChange={(e) =>
                          updateItem(idx, {
                            snapshot: { ...item.snapshot, productName: e.target.value },
                          })
                        }
                      />
                      <Input
                        label={t("ordersPage.item.qty")}
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
                      />
                      <Input
                        label={t("ordersPage.item.unitPrice")}
                        type="number"
                        min={0}
                        value={item.unitPrice}
                        onChange={(e) => updateItem(idx, { unitPrice: Number(e.target.value) })}
                      />
                      <button
                        type="button"
                        className="h-10 w-10 inline-flex items-center justify-center rounded-md border border-gray-200 hover:bg-gray-50"
                        onClick={() => removeItem(idx)}
                        disabled={items.length <= 1}
                        title={t("ordersPage.item.remove")}
                      >
                        <Trash2 className="w-4 h-4 text-gray-500" />
                      </button>
                    </div>
                    <Textarea
                      label={t("ordersPage.item.notes")}
                      rows={2}
                      value={item.notes || ""}
                      onChange={(e) => updateItem(idx, { notes: e.target.value })}
                    />
                    <div className="text-sm text-gray-600 flex justify-end">
                      <span className="font-medium text-gray-900">
                        {draft.currency} {clampMoney(item.quantity * item.unitPrice).toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <Button variant="secondary" onClick={addItem}>
                <Plus className="w-4 h-4" />
                {t("ordersPage.item.add")}
              </Button>
            </Section>

            <Section title={t("ordersPage.sections.paymentInfo")}>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Select
                    value={String(draft.paymentStatus || "unpaid")}
                    onChange={(value) =>
                      setDraft((cur) => ({
                        ...cur,
                        paymentStatus: value as OrderPaymentStatus,
                      }))
                    }
                    options={[
                      { value: "unpaid", label: t("ordersPage.payment.unpaid") },
                      { value: "paid", label: t("ordersPage.payment.paid") },
                    ]}
                  />
                </div>
                <div>
                  <Select
                    value={String(draft.fulfillmentStatus || "unfulfilled")}
                    onChange={(value) =>
                      setDraft((cur) => ({
                        ...cur,
                        fulfillmentStatus: value as OrderFulfillmentStatus,
                      }))
                    }
                    options={[
                      { value: "unfulfilled", label: t("ordersPage.fulfillment.unfulfilled") },
                      { value: "fulfilled", label: t("ordersPage.fulfillment.fulfilled") },
                    ]}
                  />
                </div>
                <Input
                  label={t("ordersPage.payment.discount")}
                  type="number"
                  min={0}
                  value={Number(draft.discountTotal || 0)}
                  onChange={(e) =>
                    setDraft((cur) => ({ ...cur, discountTotal: Number(e.target.value) }))
                  }
                />
                <Input
                  label={t("ordersPage.payment.shipping")}
                  type="number"
                  min={0}
                  value={Number(draft.shippingFee || 0)}
                  onChange={(e) =>
                    setDraft((cur) => ({ ...cur, shippingFee: Number(e.target.value) }))
                  }
                />
                <Input
                  label={t("ordersPage.payment.tax")}
                  type="number"
                  min={0}
                  value={Number(draft.taxTotal || 0)}
                  onChange={(e) =>
                    setDraft((cur) => ({ ...cur, taxTotal: Number(e.target.value) }))
                  }
                />
                <Input
                  label={t("ordersPage.payment.currency")}
                  value={String(draft.currency || "HKD")}
                  onChange={(e) => setDraft((cur) => ({ ...cur, currency: e.target.value }))}
                />
              </div>

              <div className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <span>{t("ordersPage.payment.subtotal")}</span>
                  <span className="font-medium text-gray-900">
                    {draft.currency} {totals.subtotal.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm text-gray-600 mt-2">
                  <span>{t("ordersPage.payment.total")}</span>
                  <span className="font-semibold text-gray-900">
                    {draft.currency} {totals.total.toFixed(2)}
                  </span>
                </div>
              </div>
            </Section>

            <Section
              title={t("ordersPage.sections.activity")}
              hint={isNew ? t("ordersPage.activityHintNew") : undefined}
            >
              {!isNew && Array.isArray(draft.activity) && draft.activity.length > 0 ? (
                <div className="space-y-2">
                  {(draft.activity as OrderActivityEntry[])
                    .slice()
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .map((a, idx) => (
                      <div
                        key={idx}
                        className="rounded-lg border border-gray-200 px-4 py-3 text-sm"
                      >
                        <div className="flex items-center justify-between text-gray-500">
                          <span>{a.kind === "note" ? t("ordersPage.activity.note") : t("ordersPage.activity.system")}</span>
                          <span>{new Date(a.createdAt).toLocaleString()}</span>
                        </div>
                        <div className="mt-1 text-gray-800">{a.message}</div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="text-sm text-gray-500">
                  {t("ordersPage.activityEmpty")}
                </div>
              )}

              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <Textarea
                    label={t("ordersPage.activity.addLabel")}
                    rows={2}
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                  />
                </div>
                <Button variant="secondary" onClick={addNote}>
                  {t("ordersPage.activity.add")}
                </Button>
              </div>

              {newNotes.length > 0 ? (
                <div className="rounded-lg border border-gray-200 p-4 space-y-2">
                  <div className="text-sm font-medium text-gray-700">
                    {t("ordersPage.activity.pendingNotes")}
                  </div>
                  {newNotes.map((n, idx) => (
                    <div key={idx} className="text-sm text-gray-700 flex items-center justify-between">
                      <span>{n}</span>
                      <button
                        type="button"
                        className="text-gray-400 hover:text-gray-600"
                        onClick={() => setNewNotes((cur) => cur.filter((_, i) => i !== idx))}
                        title={t("ordersPage.item.remove")}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <div className="text-xs text-gray-500">
                    {t("ordersPage.activity.pendingNotesHint")}
                  </div>
                </div>
              ) : null}
            </Section>
          </div>

          <div className="space-y-6">
            <Section title={t("ordersPage.sections.orderInfo")}>
              <Input
                label={t("ordersPage.orderInfo.clientName")}
                value={draft.clientName || ""}
                onChange={(e) => setDraft((cur) => ({ ...cur, clientName: e.target.value }))}
              />
              <Input
                label={t("ordersPage.orderInfo.phone")}
                value={draft.phoneNumber || ""}
                onChange={(e) => setDraft((cur) => ({ ...cur, phoneNumber: e.target.value }))}
              />
              <Input
                label={t("ordersPage.orderInfo.email")}
                value={draft.email || ""}
                onChange={(e) => setDraft((cur) => ({ ...cur, email: e.target.value }))}
              />
              <Textarea
                label={t("ordersPage.orderInfo.shippingAddress")}
                rows={3}
                value={draft.shippingAddress || ""}
                onChange={(e) => setDraft((cur) => ({ ...cur, shippingAddress: e.target.value }))}
              />
              <Input
                label={t("ordersPage.orderInfo.shippingMethod")}
                value={draft.shippingMethod || ""}
                onChange={(e) => setDraft((cur) => ({ ...cur, shippingMethod: e.target.value }))}
              />
              <Input
                type="date"
                label={t("ordersPage.orderInfo.deliveryDate")}
                value={(draft.deliveryDate || "").slice(0, 10)}
                onChange={(e) =>
                  setDraft((cur) => ({
                    ...cur,
                    deliveryDate: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                  }))
                }
              />
            </Section>

            <Section title={t("ordersPage.sections.tags")}>
              {tags.length === 0 ? (
                <div className="text-sm text-gray-500">{t("ordersPage.tagsEmpty")}</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => {
                    const selected = (draft.tagIds || []).includes(tag._id);
                    return (
                      <button
                        key={tag._id}
                        type="button"
                        onClick={() => toggleTag(tag._id)}
                        className={`px-3 py-1.5 rounded-full text-sm border transition ${
                          selected
                            ? "border-gray-900 text-gray-900 bg-white"
                            : "border-gray-200 text-gray-600 bg-white hover:border-gray-300"
                        }`}
                      >
                        <span
                          className="inline-block w-2 h-2 rounded-full mr-2"
                          style={{ backgroundColor: tag.color }}
                        />
                        {tag.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
};

