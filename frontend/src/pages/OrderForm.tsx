import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "../components/layout";
import { Button, Input, Modal, Select, Textarea, Badge } from "../components/common";
import { clientGroupsApi, orderTagsApi, ordersApi, productsApi, shippingMethodsApi } from "../lib/api";
import { buildOrderPayload } from "../utils/orderFormPayload";
import type {
  ClientGroup,
  Order,
  OrderActivityEntry,
  OrderFulfillmentStatus,
  OrderItem,
  OrderPaymentStatus,
  OrderTag,
  Product,
  ShippingMethod,
} from "../lib/types";

function pickApiError(e: unknown): string {
  if (typeof e === "object" && e !== null && "response" in e) {
    const data = (e as {
      response?: {
        data?: {
          error?: string;
          details?: Array<{ field?: string; message?: string }>;
        };
      };
    }).response?.data;
    if (Array.isArray(data?.details) && data.details.length > 0) {
      const detailText = data.details
        .map((detail) => [detail.field, detail.message].filter(Boolean).join(": "))
        .filter(Boolean)
        .join("; ");
      if (detailText) return `${data.error || "Validation failed"}: ${detailText}`;
    }
    if (data && typeof data.error === "string" && data.error) return data.error;
  }
  return e instanceof Error ? e.message : String(e);
}

const SHIPPING_CUSTOM = "__custom__";

function shippingDisplayLabel(m: ShippingMethod, lang: string): string {
  if (lang.startsWith("zh")) return m.labelZh || m.labelEn;
  return (m.labelEn || m.labelZh).trim() || m.labelZh;
}

function findShippingMethodId(
  methods: ShippingMethod[],
  saved: string | undefined,
  savedId?: string,
): string {
  if (savedId && methods.some((m) => m._id === savedId)) return savedId;
  if (!saved?.trim()) return "";
  const s = saved.trim();
  for (const m of methods) {
    if (m.labelZh?.trim() === s) return m._id;
    if (m.labelEn?.trim() === s) return m._id;
  }
  return "";
}

function paymentBadgeVariant(status: OrderPaymentStatus | undefined): "success" | "warning" | "default" {
  if (status === "paid") return "success";
  if (status === "verifying") return "warning";
  return "default";
}

function clampMoney(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function resolvePriceByClientGroup(
  priceByGroup: Record<string, number | undefined> | undefined,
  clientGroupSlug: string,
  defaultGroupSlug: string,
): number {
  if (!priceByGroup) return 0;
  const direct = priceByGroup[clientGroupSlug];
  if (typeof direct === "number") return direct;
  const fallback = priceByGroup[defaultGroupSlug];
  if (typeof fallback === "number") return fallback;
  return 0;
}

function computeOptionSummary(
  product: Product,
  selectedValueIds: string[],
): string | undefined {
  if (!Array.isArray(product.optionGroups) || product.optionGroups.length === 0) return undefined;
  const picked = new Set(selectedValueIds);
  const parts: string[] = [];
  for (const group of product.optionGroups) {
    const labels = (group.values || [])
      .filter((v) => v.isActive && picked.has(v.id))
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
      .map((v) => v.label)
      .filter(Boolean);
    if (labels.length === 0) continue;
    parts.push(`${group.name}: ${labels.join(", ")}`);
  }
  return parts.length > 0 ? parts.join(" | ") : undefined;
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

function formatHongKongDateInputValue(value: string | undefined): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function Section({
  title,
  hint,
  headerContent,
  headerContentAlign = "right",
  children,
}: {
  title: string;
  hint?: string;
  headerContent?: React.ReactNode;
  headerContentAlign?: "left" | "right";
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 overflow-hidden bg-white">
      <div className="border-b border-gray-200 bg-gray-50/90 px-5 py-3">
        {headerContentAlign === "left" ? (
          <div>
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
              {headerContent ? <div className="shrink-0">{headerContent}</div> : null}
            </div>
            {hint ? <p className="mt-1 text-xs text-gray-500">{hint}</p> : null}
          </div>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
              {hint ? <p className="mt-1 text-xs text-gray-500">{hint}</p> : null}
            </div>
            {headerContent ? <div className="shrink-0">{headerContent}</div> : null}
          </div>
        )}
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </section>
  );
}

type DraftItem = Omit<OrderItem, "lineTotal"> & {
  lineTotal?: number;
  selectedVariantId?: string;
  selectedOptionValueIds?: string[];
  /** When true, unitPrice is user-entered and should not be auto-overwritten. */
  isManualUnitPrice?: boolean;
};

export const OrderForm: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const isNew = !id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [orderTags, setOrderTags] = useState<OrderTag[]>([]);
  const [clientGroups, setClientGroups] = useState<ClientGroup[]>([]);
  const [shippingMethods, setShippingMethods] = useState<ShippingMethod[]>([]);
  const [shippingSelectValue, setShippingSelectValue] = useState<string>("");
  const [selectedClientGroupId, setSelectedClientGroupId] = useState<string>("");

  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<OrderTag | null>(null);
  const [tagLabelInput, setTagLabelInput] = useState("");
  const [tagColorInput, setTagColorInput] = useState("#3B82F6");
  const [tagSaving, setTagSaving] = useState(false);
  const [tagDeleting, setTagDeleting] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);

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
      selectedOptionValueIds: [],
      isManualUnitPrice: false,
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
      const [p, tg, groups, shipMethods] = await Promise.all([
        productsApi.list(true),
        orderTagsApi.list(),
        clientGroupsApi.list(),
        shippingMethodsApi.list(),
      ]);
      setProducts(p);
      setOrderTags(tg);
      setClientGroups(groups);
      setShippingMethods(shipMethods);
      const defaultGroup = groups.find((g) => g.isDefault) || groups[0];
      if (defaultGroup?._id) {
        setSelectedClientGroupId((cur) => cur || defaultGroup._id);
      }

      if (!isNew && id) {
        const order = await ordersApi.get(id);
        setDraft(order);
        setItems(
          (order.items || []).map((it) => ({
            ...it,
            quantity: it.quantity || 1,
            unitPrice: it.unitPrice || 0,
            selectedVariantId: undefined,
            selectedOptionValueIds: [],
            isManualUnitPrice: false,
          })),
        );
        const mid = findShippingMethodId(shipMethods, order.shippingMethod, order.shippingMethodId);
        if (mid) setShippingSelectValue(mid);
        else if (order.shippingMethod?.trim()) setShippingSelectValue(SHIPPING_CUSTOM);
        else setShippingSelectValue("");
      } else {
        setShippingSelectValue("");
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

  const selectedGroupSlug = useMemo(() => {
    const g = clientGroups.find((cg) => cg._id === selectedClientGroupId);
    return g?.slug || clientGroups.find((cg) => cg.isDefault)?.slug || "basic";
  }, [clientGroups, selectedClientGroupId]);

  const defaultGroupSlug = useMemo(() => {
    return clientGroups.find((cg) => cg.isDefault)?.slug || clientGroups[0]?.slug || "basic";
  }, [clientGroups]);

  const methodsForSelect = useMemo(() => {
    const selectedId = findShippingMethodId(shippingMethods, draft.shippingMethod, draft.shippingMethodId);
    return shippingMethods.filter((m) => m.isActive || m._id === selectedId);
  }, [shippingMethods, draft.shippingMethod, draft.shippingMethodId]);

  const shippingOptions = useMemo(
    () => [
      { value: "", label: t("ordersPage.orderInfo.shippingMethodNone") },
      ...methodsForSelect.map((m) => ({
        value: m._id,
        label: shippingDisplayLabel(m, i18n.language),
      })),
      { value: SHIPPING_CUSTOM, label: t("ordersPage.orderInfo.shippingMethodCustom") },
    ],
    [methodsForSelect, i18n.language, t],
  );

  const onShippingSelectChange = useCallback(
    (value: string) => {
      setShippingSelectValue(value);
      if (value === "") {
        setDraft((cur) => ({ ...cur, shippingMethodId: "", shippingMethod: "", shippingFee: 0 }));
      } else if (value === SHIPPING_CUSTOM) {
        setDraft((cur) => ({ ...cur, shippingMethodId: "", shippingMethod: cur.shippingMethod || "" }));
      } else {
        const m = shippingMethods.find((x) => x._id === value);
        if (m) {
          setDraft((cur) => ({
            ...cur,
            shippingMethodId: m._id,
            shippingMethod: shippingDisplayLabel(m, i18n.language),
            shippingFee: m.fee,
          }));
        }
      }
    },
    [i18n.language, shippingMethods],
  );

  useEffect(() => {
    if (!shippingSelectValue || shippingSelectValue === SHIPPING_CUSTOM) return;
    const m = shippingMethods.find((x) => x._id === shippingSelectValue);
    if (m) {
      setDraft((cur) => ({
        ...cur,
        shippingMethodId: m._id,
        shippingMethod: shippingDisplayLabel(m, i18n.language),
      }));
    }
  }, [i18n.language, shippingSelectValue, shippingMethods]);

  const resolveAutoUnitPrice = useCallback(
    (args: {
      productId?: string;
      selectedVariantId?: string;
      selectedOptionValueIds?: string[];
    }): { unitPrice: number; optionSummary?: string; variantLabel?: string } => {
      if (!args.productId) return { unitPrice: 0 };
      const product = products.find((p) => p._id === args.productId);
      if (!product) return { unitPrice: 0 };

      const variants = (product.variants || []).filter((v) => v.isActive !== false);
      if (variants.length > 0) {
        const chosen = variants.find((v) => v.id === args.selectedVariantId) || variants[0];
        const price = resolvePriceByClientGroup(
          chosen?.priceByGroup,
          selectedGroupSlug,
          defaultGroupSlug,
        );
        return { unitPrice: price, variantLabel: chosen?.label };
      }

      const selectedValueIds = Array.isArray(args.selectedOptionValueIds)
        ? args.selectedOptionValueIds
        : [];
      const basePrice = resolvePriceByClientGroup(
        product.basePriceByGroup,
        selectedGroupSlug,
        defaultGroupSlug,
      );

      let deltaTotal = 0;
      let absoluteTotal = 0;
      let hasAbsoluteSelection = false;

      const picked = new Set(selectedValueIds);
      for (const group of product.optionGroups || []) {
        for (const value of group.values || []) {
          if (!value.isActive) continue;
          if (!picked.has(value.id)) continue;
          const amount = resolvePriceByClientGroup(
            value.priceByGroup,
            selectedGroupSlug,
            defaultGroupSlug,
          );
          const pricingMode = group.pricingMode || "delta";
          if (pricingMode === "absolute") {
            absoluteTotal += amount;
            hasAbsoluteSelection = true;
          } else {
            deltaTotal += amount;
          }
        }
      }

      const optionSummary = computeOptionSummary(product, selectedValueIds);
      return {
        unitPrice: (hasAbsoluteSelection ? absoluteTotal : basePrice) + deltaTotal,
        optionSummary,
      };
    },
    [defaultGroupSlug, products, selectedGroupSlug],
  );

  const deriveDefaultOptionSelections = useCallback((product: Product): string[] => {
    const selected: string[] = [];
    for (const group of product.optionGroups || []) {
      const activeValues = (group.values || [])
        .filter((v) => v.isActive)
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
      if (activeValues.length === 0) continue;
      if (group.selectionType === "multiple") {
        selected.push(...activeValues.filter((v) => v.isDefault).map((v) => v.id));
      } else {
        const chosen = activeValues.find((v) => v.isDefault) || activeValues[0];
        if (chosen?.id) selected.push(chosen.id);
      }
    }
    return selected;
  }, []);

  const setOptionSelectionForGroup = useCallback(
    (args: {
      product: Product;
      currentSelectedValueIds: string[];
      groupId: string;
      nextSelectedForGroup: string[];
    }) => {
      const group = (args.product.optionGroups || []).find((g) => g.id === args.groupId);
      if (!group) return args.currentSelectedValueIds;

      const allowedValueIds = new Set((group.values || []).filter((v) => v.isActive).map((v) => v.id));
      const nextGroupSelected = args.nextSelectedForGroup.filter((id) => allowedValueIds.has(id));

      const otherGroupValueIds = new Set<string>();
      for (const g of args.product.optionGroups || []) {
        if (g.id === group.id) continue;
        for (const v of g.values || []) otherGroupValueIds.add(v.id);
      }
      const keep = args.currentSelectedValueIds.filter((id) => otherGroupValueIds.has(id));
      return [...keep, ...nextGroupSelected];
    },
    [],
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

  useEffect(() => {
    setItems((cur) =>
      cur.map((it) => {
        const productId = it.snapshot.productId;
        if (!productId) return it;
        if (it.isManualUnitPrice) return it;
        const resolved = resolveAutoUnitPrice({
          productId,
          selectedVariantId: it.selectedVariantId,
          selectedOptionValueIds: it.selectedOptionValueIds,
        });
        const unitPrice = clampMoney(resolved.unitPrice);
        const quantity = Math.max(1, Math.floor(Number(it.quantity || 1)));
        return {
          ...it,
          unitPrice,
          snapshot: {
            ...it.snapshot,
            optionSummary: resolved.optionSummary ?? it.snapshot.optionSummary,
            variantLabel: resolved.variantLabel ?? it.snapshot.variantLabel,
          },
          lineTotal: clampMoney(quantity * unitPrice),
        };
      }),
    );
  }, [resolveAutoUnitPrice]);

  const addItem = () => {
    setItems((cur) => [
      ...cur,
      {
        snapshot: { productName: "" },
        quantity: 1,
        unitPrice: 0,
        notes: "",
        selectedOptionValueIds: [],
        isManualUnitPrice: false,
      },
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

  const resetTagForm = () => {
    setEditingTag(null);
    setTagLabelInput("");
    setTagColorInput("#3B82F6");
    setTagError(null);
    setTagSaving(false);
    setTagDeleting(false);
  };

  const openCreateTagModal = () => {
    resetTagForm();
    setTagModalOpen(true);
  };

  const openEditTagModal = (tag: OrderTag) => {
    setEditingTag(tag);
    setTagLabelInput(tag.label);
    setTagColorInput(tag.color || "#3B82F6");
    setTagError(null);
    setTagModalOpen(true);
  };

  const closeTagModal = () => {
    setTagModalOpen(false);
    resetTagForm();
  };

  const saveTag = async () => {
    const label = tagLabelInput.trim();
    if (!label) {
      setTagError(t("ordersPage.tagManager.labelRequired"));
      return;
    }

    setTagSaving(true);
    setTagError(null);
    try {
      if (editingTag) {
        const updated = await orderTagsApi.update(editingTag._id, {
          label,
          color: tagColorInput,
        });
        setOrderTags((current) =>
          current.map((tag) => (tag._id === updated._id ? updated : tag)),
        );
      } else {
        const created = await orderTagsApi.create({
          label,
          color: tagColorInput,
        });
        setOrderTags((current) =>
          [...current, created].sort((a, b) => a.label.localeCompare(b.label)),
        );
        setDraft((current) => ({
          ...current,
          tagIds: [...new Set([...(current.tagIds || []), created._id])],
        }));
      }
      closeTagModal();
    } catch (e: unknown) {
      setTagError(pickApiError(e));
    } finally {
      setTagSaving(false);
    }
  };

  const deleteTag = async () => {
    if (!editingTag) return;
    setTagDeleting(true);
    setTagError(null);
    try {
      await orderTagsApi.delete(editingTag._id);
      setOrderTags((current) => current.filter((tag) => tag._id !== editingTag._id));
      setDraft((current) => ({
        ...current,
        tagIds: (current.tagIds || []).filter((id) => id !== editingTag._id),
      }));
      closeTagModal();
    } catch (e: unknown) {
      setTagError(pickApiError(e));
    } finally {
      setTagDeleting(false);
    }
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
      const payload = buildOrderPayload({ draft, items, mode: isNew ? "create" : "update" });

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
      setError(pickApiError(e) || t("ordersPage.saveError"));
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
                    <div className="grid gap-3 md:grid-cols-[1fr_1fr_120px_120px_40px] items-end">
                      <div>
                        <Select
                          label={t("ordersPage.item.productName")}
                          value={item.snapshot.productId || ""}
                          onChange={(value) => {
                            const p = products.find((pp) => pp._id === value);
                            const activeVariants = (p?.variants || []).filter(
                              (v) => v.isActive !== false,
                            );
                            const nextVariantId =
                              activeVariants.length > 0 ? activeVariants[0].id : undefined;
                            const defaultOptionValueIds =
                              p && activeVariants.length === 0
                                ? deriveDefaultOptionSelections(p)
                                : [];
                            const resolved = resolveAutoUnitPrice({
                              productId: value || undefined,
                              selectedVariantId: nextVariantId,
                              selectedOptionValueIds: defaultOptionValueIds,
                            });
                            updateItem(idx, {
                              snapshot: {
                                ...item.snapshot,
                                productId: value,
                                productName: p?.name || item.snapshot.productName || "",
                                imageUrl: p?.primaryImageUrl || p?.images?.[0] || item.snapshot.imageUrl,
                                variantLabel: resolved.variantLabel,
                                optionSummary: resolved.optionSummary,
                              },
                              selectedVariantId: nextVariantId,
                              selectedOptionValueIds: defaultOptionValueIds,
                              unitPrice: resolved.unitPrice,
                              isManualUnitPrice: false,
                            });
                          }}
                          options={[
                            { value: "", label: t("ordersPage.item.productSelectPlaceholder") },
                            ...productOptions,
                          ]}
                        />
                      </div>
                      <div>
                        {(() => {
                          const p = products.find((pp) => pp._id === item.snapshot.productId);
                          const variants = (p?.variants || []).filter((v) => v.isActive !== false);
                          const activeOptionGroups = (p?.optionGroups || [])
                            .map((g) => ({
                              ...g,
                              values: (g.values || [])
                                .filter((v) => v.isActive)
                                .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)),
                            }))
                            .filter((g) => (g.values || []).length > 0)
                            .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));

                          if (!p || (variants.length === 0 && activeOptionGroups.length === 0)) {
                            return (
                              <Input
                                label={t("ordersPage.item.productName")}
                                value={item.snapshot.productName}
                                onChange={(e) =>
                                  updateItem(idx, {
                                    snapshot: { ...item.snapshot, productName: e.target.value },
                                  })
                                }
                              />
                            );
                          }

                          if (variants.length > 0) {
                            return (
                              <Select
                                label={t("ordersPage.item.variant")}
                                value={item.selectedVariantId || variants[0].id}
                                onChange={(variantId) => {
                                  const chosen =
                                    variants.find((v) => v.id === variantId) || variants[0];
                                  const resolved = resolveAutoUnitPrice({
                                    productId: p._id,
                                    selectedVariantId: chosen.id,
                                  });
                                  updateItem(idx, {
                                    selectedVariantId: chosen.id,
                                    selectedOptionValueIds: [],
                                    unitPrice: resolved.unitPrice,
                                    isManualUnitPrice: false,
                                    snapshot: {
                                      ...item.snapshot,
                                      productId: p._id,
                                      productName: p.name,
                                      variantLabel: resolved.variantLabel ?? chosen.label,
                                      optionSummary: undefined,
                                    },
                                  });
                                }}
                                options={variants.map((v) => ({
                                  value: v.id,
                                  label: v.label,
                                }))}
                              />
                            );
                          }

                          return (
                            <div className="space-y-3">
                              {activeOptionGroups.map((group) => {
                                const currentSelected = item.selectedOptionValueIds || [];
                                const currentGroupSelected = new Set(
                                  currentSelected.filter((valueId) =>
                                    group.values.some((v) => v.id === valueId),
                                  ),
                                );

                                if (group.selectionType === "multiple") {
                                  return (
                                    <div key={group.id} className="space-y-2">
                                      <div className="text-sm font-medium text-gray-700">
                                        {group.name}
                                        {group.required ? (
                                          <span className="ml-1 text-xs text-gray-400">
                                            ({t("ordersPage.item.required")})
                                          </span>
                                        ) : null}
                                      </div>
                                      <div className="grid gap-2 sm:grid-cols-2">
                                        {group.values.map((v) => {
                                          const checked = currentGroupSelected.has(v.id);
                                          return (
                                            <label
                                              key={v.id}
                                              className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 cursor-pointer hover:bg-gray-50"
                                            >
                                              <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => {
                                                  const nextForGroup = checked
                                                    ? Array.from(currentGroupSelected).filter((id) => id !== v.id)
                                                    : [...Array.from(currentGroupSelected), v.id];
                                                  const nextSelected = setOptionSelectionForGroup({
                                                    product: p,
                                                    currentSelectedValueIds: currentSelected,
                                                    groupId: group.id,
                                                    nextSelectedForGroup: nextForGroup,
                                                  });
                                                  const resolved = resolveAutoUnitPrice({
                                                    productId: p._id,
                                                    selectedOptionValueIds: nextSelected,
                                                  });
                                                  updateItem(idx, {
                                                    selectedVariantId: undefined,
                                                    selectedOptionValueIds: nextSelected,
                                                    unitPrice: resolved.unitPrice,
                                                    isManualUnitPrice: false,
                                                    snapshot: {
                                                      ...item.snapshot,
                                                      productId: p._id,
                                                      productName: p.name,
                                                      variantLabel: undefined,
                                                      optionSummary: resolved.optionSummary,
                                                    },
                                                  });
                                                }}
                                              />
                                              <span>{v.label}</span>
                                            </label>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                }

                                const currentValue =
                                  Array.from(currentGroupSelected)[0] ||
                                  group.values.find((v) => v.isDefault)?.id ||
                                  group.values[0]?.id ||
                                  "";

                                return (
                                  <Select
                                    key={group.id}
                                    label={`${group.name}${group.required ? ` (${t("ordersPage.item.required")})` : ""}`}
                                    value={currentValue}
                                    onChange={(valueId) => {
                                      const nextSelected = setOptionSelectionForGroup({
                                        product: p,
                                        currentSelectedValueIds: currentSelected,
                                        groupId: group.id,
                                        nextSelectedForGroup: valueId ? [valueId] : [],
                                      });
                                      const resolved = resolveAutoUnitPrice({
                                        productId: p._id,
                                        selectedOptionValueIds: nextSelected,
                                      });
                                      updateItem(idx, {
                                        selectedVariantId: undefined,
                                        selectedOptionValueIds: nextSelected,
                                        unitPrice: resolved.unitPrice,
                                        isManualUnitPrice: false,
                                        snapshot: {
                                          ...item.snapshot,
                                          productId: p._id,
                                          productName: p.name,
                                          variantLabel: undefined,
                                          optionSummary: resolved.optionSummary,
                                        },
                                      });
                                    }}
                                    options={group.values.map((v) => ({ value: v.id, label: v.label }))}
                                  />
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
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
                        onChange={(e) =>
                          updateItem(idx, {
                            unitPrice: Number(e.target.value),
                            isManualUnitPrice: true,
                          })
                        }
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

            <Section
              title={t("ordersPage.sections.paymentInfo")}
              headerContentAlign="left"
              headerContent={
                !isNew && draft.paymentStatus ? (
                  <Badge variant={paymentBadgeVariant(draft.paymentStatus)}>
                    {t(`ordersPage.payment.${draft.paymentStatus}`)}
                  </Badge>
                ) : null
              }
            >
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
                      { value: "verifying", label: t("ordersPage.payment.verifying") },
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

              {draft.paymentProof?.receiptUrl ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">
                        {t("ordersPage.payment.receiptProof")}
                      </div>
                      {draft.paymentProof.checkedAt ? (
                        <div className="text-xs text-gray-500 mt-1">
                          {t("ordersPage.payment.receiptCheckedAt")}:{" "}
                          {new Date(draft.paymentProof.checkedAt).toLocaleString()}
                        </div>
                      ) : null}
                    </div>
                    <a
                      href={draft.paymentProof.receiptUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium text-blue-600 hover:text-blue-700"
                    >
                      {t("ordersPage.payment.openReceipt")}
                    </a>
                  </div>
                  {/\.(png|jpe?g|webp|gif)(?:$|\?)/i.test(draft.paymentProof.receiptUrl) ? (
                    <img
                      src={draft.paymentProof.receiptUrl}
                      alt={t("ordersPage.payment.receiptProof")}
                      className="max-h-64 rounded-lg border border-gray-200 bg-white object-contain"
                    />
                  ) : null}
                  {draft.paymentProof.reviewNotes ? (
                    <div className="text-sm text-gray-700">
                      {t("ordersPage.payment.reviewNotes")}: {draft.paymentProof.reviewNotes}
                    </div>
                  ) : null}
                  {draft.paymentProof.extracted ? (
                    <pre className="max-h-56 overflow-auto rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-700">
                      {JSON.stringify(draft.paymentProof.extracted, null, 2)}
                    </pre>
                  ) : null}
                </div>
              ) : null}
            </Section>

            <Section
              title={t("ordersPage.sections.activity")}
              hint={isNew ? t("ordersPage.activityHintNew") : undefined}
            >
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
                    <div
                      key={idx}
                      className="text-sm text-gray-700 flex items-center justify-between"
                    >
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

              {!isNew && Array.isArray(draft.activity) && draft.activity.length > 0 ? (
                <div className="space-y-2">
                  {(draft.activity as OrderActivityEntry[])
                    .slice()
                    .sort(
                      (a, b) =>
                        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
                    )
                    .map((a, idx) => (
                      <div
                        key={idx}
                        className="rounded-lg border border-gray-200 px-4 py-3 text-sm"
                      >
                        <div className="flex items-center justify-between text-gray-500">
                          <span>
                            {a.kind === "note"
                              ? t("ordersPage.activity.note")
                              : t("ordersPage.activity.system")}
                          </span>
                          <span>{new Date(a.createdAt).toLocaleString()}</span>
                        </div>
                        <div className="mt-1 text-gray-800">{a.message}</div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="text-sm text-gray-500">{t("ordersPage.activityEmpty")}</div>
              )}
            </Section>
          </div>

          <div className="space-y-6">
            <Section title={t("ordersPage.sections.orderInfo")}>
              <Select
                label={t("ordersPage.orderInfo.clientGroup")}
                value={selectedClientGroupId}
                onChange={(value) => setSelectedClientGroupId(value)}
                options={clientGroups.map((g) => ({
                  value: g._id,
                  label: g.isDefault ? `${g.name} (default)` : g.name,
                }))}
              />
              <Input
                label={t("ordersPage.orderInfo.clientName")}
                value={draft.clientName || ""}
                onChange={(e) => setDraft((cur) => ({ ...cur, clientName: e.target.value }))}
              />
              <Input
                label={t("ordersPage.orderInfo.phone")}
                value={draft.phoneNumber || ""}
                onChange={(e) =>
                  setDraft((cur) => ({ ...cur, phoneNumber: e.target.value }))
                }
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
                onChange={(e) =>
                  setDraft((cur) => ({ ...cur, shippingAddress: e.target.value }))
                }
              />
              <Select
                label={t("ordersPage.orderInfo.shippingMethod")}
                value={shippingSelectValue}
                onChange={onShippingSelectChange}
                options={shippingOptions}
              />
              {shippingSelectValue === SHIPPING_CUSTOM && (
                <Input
                  label={t("ordersPage.orderInfo.shippingMethodCustomDetail")}
                  value={draft.shippingMethod || ""}
                  onChange={(e) =>
                    setDraft((cur) => ({ ...cur, shippingMethod: e.target.value }))
                  }
                />
              )}
              <Input
                type="date"
                label={t("ordersPage.orderInfo.deliveryDate")}
                value={formatHongKongDateInputValue(draft.deliveryDate)}
                onChange={(e) =>
                  setDraft((cur) => ({
                    ...cur,
                    deliveryDate: e.target.value,
                  }))
                }
              />
            </Section>

            <Section
              title={t("ordersPage.sections.tags")}
              headerContent={
                <Button variant="secondary" size="sm" onClick={openCreateTagModal}>
                  <Plus className="w-4 h-4" />
                  {t("ordersPage.tagManager.create")}
                </Button>
              }
            >
              {orderTags.length === 0 ? (
                <div className="text-sm text-gray-500">{t("ordersPage.tagsEmpty")}</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {orderTags.map((tag) => {
                    const selected = (draft.tagIds || []).includes(tag._id);
                    return (
                      <div
                        key={tag._id}
                        className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition ${
                          selected
                            ? "border-gray-900 text-gray-900 bg-white"
                            : "border-gray-200 text-gray-600 bg-white hover:border-gray-300"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleTag(tag._id)}
                          className="inline-flex items-center"
                        >
                          <span
                            className="inline-block w-2 h-2 rounded-full mr-2"
                            style={{ backgroundColor: tag.color }}
                          />
                          {tag.label}
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditTagModal(tag)}
                          className="rounded-full p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                          title={t("ordersPage.tagManager.edit")}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>
          </div>
        </div>

        <Modal
          isOpen={tagModalOpen}
          onClose={closeTagModal}
          title={
            editingTag ? t("ordersPage.tagManager.editTitle") : t("ordersPage.tagManager.newTitle")
          }
          size="sm"
          footer={
            <div className="flex w-full flex-wrap items-center justify-between gap-3">
              <div>
                {editingTag ? (
                  <Button variant="danger" onClick={deleteTag} isLoading={tagDeleting}>
                    {t("ordersPage.tagManager.delete")}
                  </Button>
                ) : null}
              </div>
              <div className="flex items-center gap-3">
                <Button variant="ghost" onClick={closeTagModal}>
                  {t("common.cancel")}
                </Button>
                <Button onClick={saveTag} isLoading={tagSaving}>
                  {t("ordersPage.tagManager.save")}
                </Button>
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            <Input
              label={t("ordersPage.tagManager.label")}
              value={tagLabelInput}
              onChange={(e) => setTagLabelInput(e.target.value)}
            />
            <Input
              type="color"
              label={t("ordersPage.tagManager.color")}
              value={tagColorInput}
              onChange={(e) => setTagColorInput(e.target.value)}
              className="h-11 cursor-pointer py-1"
            />
            {tagError ? <div className="text-sm text-red-600">{tagError}</div> : null}
          </div>
        </Modal>
      </div>
    </div>
  );
};

