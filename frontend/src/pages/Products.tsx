import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../components/layout";
import { Button, Input, Modal, Select, Textarea } from "../components/common";
import { clientGroupsApi, productsApi, uploadApi } from "../lib/api";
import { resolveLogoUrl } from "../lib/resolveLogoUrl";
import type {
  ClientGroup,
  Product,
  ProductOptionGroup,
  ProductOptionValue,
  ProductVariant,
  ProductPriceByGroup,
} from "../lib/types";

type ProductDraft = Omit<Product, "_id" | "createdAt" | "updatedAt" | "slug"> & {
  _id?: string;
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const buildPriceMap = (clientGroups: ClientGroup[], source?: ProductPriceByGroup) =>
  Object.fromEntries(
    clientGroups.map((group) => [group.slug, source?.[group.slug] ?? 0]),
  );

const createEmptyValue = (clientGroups: ClientGroup[]): ProductOptionValue => ({
  id: "",
  label: "",
  description: "",
  isDefault: false,
  isActive: true,
  displayOrder: 0,
  priceByGroup: buildPriceMap(clientGroups),
});

const createEmptyGroup = (clientGroups: ClientGroup[]): ProductOptionGroup => ({
  id: "",
  name: "",
  selectionType: "single",
  pricingMode: "delta",
  required: false,
  displayOrder: 0,
  values: [createEmptyValue(clientGroups)],
});

function syncPrimaryWithImages(
  images: string[],
  primary: string | undefined,
): string | undefined {
  if (images.length === 0) return undefined;
  if (primary && images.includes(primary)) return primary;
  return images[0];
}

const createEmptyProduct = (clientGroups: ClientGroup[]): ProductDraft => ({
  name: "",
  category: "",
  description: "",
  currency: "HKD",
  isActive: true,
  displayOrder: 0,
  images: [],
  primaryImageUrl: undefined,
  variants: [],
  basePriceByGroup: buildPriceMap(clientGroups),
  optionGroups: [],
});

function buildVariantPriceMap(
  clientGroups: ClientGroup[],
  source?: Record<string, number>,
): Record<string, number> {
  return Object.fromEntries(
    clientGroups.map((group) => [group.slug, source?.[group.slug] ?? 0]),
  );
}

function hydrateProduct(product: Product, clientGroups: ClientGroup[]): ProductDraft {
  const images = product.images?.length ? [...product.images] : [];
  return {
    _id: product._id,
    name: product.name,
    category: product.category || "",
    description: product.description || "",
    currency: product.currency || "HKD",
    isActive: product.isActive,
    displayOrder: product.displayOrder,
    images,
    primaryImageUrl: syncPrimaryWithImages(images, product.primaryImageUrl),
    variants: (product.variants || []).map((variant, index) => ({
      ...variant,
      displayOrder: variant.displayOrder ?? index,
      optionValueIds: Array.isArray(variant.optionValueIds) ? variant.optionValueIds : [],
      priceByGroup: buildVariantPriceMap(clientGroups, variant.priceByGroup),
      isActive: variant.isActive !== false,
    })),
    basePriceByGroup: buildPriceMap(clientGroups, product.basePriceByGroup),
    optionGroups: product.optionGroups.map((group, groupIndex) => ({
      ...group,
      displayOrder: group.displayOrder ?? groupIndex,
      values: group.values.map((value, valueIndex) => ({
        ...value,
        displayOrder: value.displayOrder ?? valueIndex,
        priceByGroup: buildPriceMap(clientGroups, value.priceByGroup),
      })),
    })),
  };
}

function FormSection({
  title,
  hint,
  children,
  plain,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  /** No card border or white panel — content sits on the page background */
  plain?: boolean;
}) {
  if (plain) {
    return (
      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {hint ? <p className="mt-1 text-xs text-gray-500">{hint}</p> : null}
        </div>
        <div className="space-y-4">{children}</div>
      </section>
    );
  }
  return (
    <section className="rounded-xl border border-gray-200 overflow-hidden">
      <div className="border-b border-gray-200 bg-gray-50/90 px-5 py-3">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {hint ? <p className="mt-1 text-xs text-gray-500">{hint}</p> : null}
      </div>
      <div className="p-5 space-y-4 bg-white">{children}</div>
    </section>
  );
}

export const Products: React.FC = () => {
  const { t } = useTranslation();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const imageMenuRef = useRef<HTMLDivElement | null>(null);
  const imagePickerSlotIndexRef = useRef<number | null>(null);
  const dragImageIndexRef = useRef<number | null>(null);
  const imageDropDepthRef = useRef(0);
  const [imageDropActive, setImageDropActive] = useState(false);
  const [openImageMenuIndex, setOpenImageMenuIndex] = useState<number | null>(null);
  const [clientGroups, setClientGroups] = useState<ClientGroup[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const [editingOptionGroupIndex, setEditingOptionGroupIndex] = useState<number | null>(
    null,
  );
  const [editingOptionGroupDraft, setEditingOptionGroupDraft] =
    useState<ProductOptionGroup | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedNumberCell, setFocusedNumberCell] = useState<string | null>(null);
  const [numberCellText, setNumberCellText] = useState<Record<string, string>>({});

  const selectedProduct = useMemo(
    () => products.find((product) => product._id === draft?._id),
    [products, draft?._id],
  );

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [groupResult, productResult] = await Promise.all([
        clientGroupsApi.list(),
        productsApi.list(true),
      ]);
      setClientGroups(groupResult);
      setProducts(productResult);
      setDraft((current) => {
        if (current) return current;
        if (productResult.length > 0) return hydrateProduct(productResult[0], groupResult);
        return createEmptyProduct(groupResult);
      });
    } catch (err) {
      console.error("Failed to load products:", err);
      setError(t("productsPage.loadError"));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (openImageMenuIndex == null) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (imageMenuRef.current && !imageMenuRef.current.contains(event.target as Node)) {
        setOpenImageMenuIndex(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenImageMenuIndex(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openImageMenuIndex]);

  const resetDraft = () => {
    setDraft(createEmptyProduct(clientGroups));
    setError(null);
  };

  const startEdit = (product: Product) => {
    const hydrated = hydrateProduct(product, clientGroups);
    setDraft(hydrated);
    setError(null);
  };

  const updateDraft = (updater: (current: ProductDraft) => ProductDraft) => {
    setDraft((current) => (current ? updater(current) : current));
  };

  const updateBasePrice = (slug: string, nextValue: string) => {
    const parsed = parseNumberOrNull(nextValue);
    updateDraft((current) => {
      const nextMap = { ...current.basePriceByGroup };
      if (parsed == null) {
        delete nextMap[slug];
      } else {
        nextMap[slug] = parsed;
      }
      return {
        ...current,
        basePriceByGroup: nextMap,
      };
    });
  };

  const addGroup = () => {
    updateDraftVariants((current) => ({
      ...current,
      optionGroups: [
        ...current.optionGroups,
        {
          ...createEmptyGroup(clientGroups),
          displayOrder: current.optionGroups.length,
        },
      ],
    }));
  };

  const removeGroup = (groupIndex: number) => {
    updateDraftVariants((current) => ({
      ...current,
      optionGroups: current.optionGroups.filter((_, index) => index !== groupIndex),
    }));
  };

  const removeImageAt = (index: number) => {
    updateDraft((current) => {
      const imgs = (current.images || []).filter((_, i) => i !== index);
      return {
        ...current,
        images: imgs,
        primaryImageUrl: syncPrimaryWithImages(imgs, current.primaryImageUrl),
      };
    });
  };

  const setPrimaryImageUrl = (url: string) => {
    updateDraft((current) => {
      const imgs = current.images || [];
      const idx = imgs.indexOf(url);
      if (idx <= 0) {
        return {
          ...current,
          primaryImageUrl: syncPrimaryWithImages(imgs, url),
        };
      }
      const nextImages = [imgs[idx], ...imgs.slice(0, idx), ...imgs.slice(idx + 1)];
      return {
        ...current,
        images: nextImages,
        primaryImageUrl: syncPrimaryWithImages(nextImages, url),
      };
    });
  };

  const defaultClientGroupSlug = useMemo(() => {
    const def = clientGroups.find((g) => g.isDefault) || clientGroups[0];
    return def?.slug || "";
  }, [clientGroups]);

  const formatNumber = (value: number | undefined | null) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return "";
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
  };

  const stripFormatting = (raw: string) => raw.replace(/,/g, "").trim();

  const parseNumberOrNull = (raw: string) => {
    const cleaned = stripFormatting(raw);
    if (cleaned === "") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  };

  const computeVariantCombos = (groups: ProductOptionGroup[]) => {
    const activeSingleGroups = groups
      .filter((g) => g.selectionType === "single")
      .map((g) => ({
        groupId: g.id,
        groupName: g.name,
        values: g.values.filter((v) => v.isActive).sort((a, b) => a.displayOrder - b.displayOrder),
      }))
      .filter((g) => g.values.length > 0);

    if (activeSingleGroups.length === 0) return [];

    const combos: Array<{
      optionValueIds: string[];
      label: string;
      id: string;
      displayOrder: number;
    }> = [];

    const walk = (idx: number, picked: ProductOptionValue[]) => {
      if (idx >= activeSingleGroups.length) {
        const optionValueIds = picked.map((p) => p.id);
        const label = picked.map((p) => p.label).join(" / ");
        const id = optionValueIds.join("__") || label;
        combos.push({
          optionValueIds,
          label,
          id,
          displayOrder: combos.length,
        });
        return;
      }
      for (const value of activeSingleGroups[idx].values) {
        walk(idx + 1, [...picked, value]);
      }
    };

    walk(0, []);
    return combos;
  };

  const syncVariantsFromOptions = (current: ProductDraft): ProductDraft => {
    const combos = computeVariantCombos(current.optionGroups);
    const existingByKey = new Map<string, ProductVariant>();
    for (const v of current.variants || []) {
      const key =
        Array.isArray(v.optionValueIds) && v.optionValueIds.length > 0
          ? v.optionValueIds.join("__")
          : v.id;
      existingByKey.set(key, v);
    }

    const nextVariants: ProductVariant[] = combos.map((combo, index) => {
      const key = combo.optionValueIds.join("__") || combo.id;
      const prev = existingByKey.get(key);
      const priceByGroup = buildVariantPriceMap(
        clientGroups,
        prev?.priceByGroup || undefined,
      );
      return {
        id: prev?.id || combo.id,
        optionValueIds: combo.optionValueIds,
        label: combo.label,
        isActive: prev?.isActive !== false,
        displayOrder: prev?.displayOrder ?? index,
        onHand: prev?.onHand,
        priceByGroup,
      };
    });

    return {
      ...current,
      variants: nextVariants,
    };
  };

  const updateDraftVariants = (updater: (current: ProductDraft) => ProductDraft) => {
    updateDraft((current) => syncVariantsFromOptions(updater(current)));
  };

  const closeOptionGroupEditor = () => {
    setEditingOptionGroupIndex(null);
    setEditingOptionGroupDraft(null);
  };

  const openOptionGroupEditor = (groupIndex: number) => {
    if (!draft) return;
    const group = draft.optionGroups[groupIndex];
    if (!group) return;
    setEditingOptionGroupIndex(groupIndex);
    // Deep clone so Cancel doesn't mutate the real draft.
    setEditingOptionGroupDraft(JSON.parse(JSON.stringify(group)) as ProductOptionGroup);
  };

  const saveOptionGroupEditor = () => {
    if (editingOptionGroupIndex == null || !editingOptionGroupDraft) return;
    updateDraftVariants((current) => ({
      ...current,
      optionGroups: current.optionGroups.map((g, idx) =>
        idx === editingOptionGroupIndex ? editingOptionGroupDraft : g,
      ),
    }));
    closeOptionGroupEditor();
  };

  const uploadImageFiles = async (fileList: File[]) => {
    const newUrls: string[] = [];
    for (const file of fileList) {
      if (!file.type.startsWith("image/")) continue;
      const dataUrl = await readFileAsDataUrl(file);
      const comma = dataUrl.indexOf(",");
      const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
      const { url } = await uploadApi.image(base64, file.type);
      newUrls.push(url);
    }
    return newUrls;
  };

  const MAX_IMAGE_SLOTS = 10;

  const openImagePickerForSlot = (slotIndex: number) => {
    setOpenImageMenuIndex(null);
    imagePickerSlotIndexRef.current = slotIndex;
    imageInputRef.current?.click();
  };

  const applyUploadedUrlsToSlots = (slotIndex: number, newUrls: string[]) => {
    updateDraft((current) => {
      const existing = current.images || [];
      const next = [...existing];
      let writeAt = Math.max(0, slotIndex);

      for (const url of newUrls) {
        if (writeAt >= MAX_IMAGE_SLOTS) break;
        if (writeAt < next.length) next[writeAt] = url;
        else next.push(url);
        writeAt += 1;
      }

      const trimmed = next.slice(0, MAX_IMAGE_SLOTS);
      return {
        ...current,
        images: trimmed,
        primaryImageUrl: syncPrimaryWithImages(trimmed, current.primaryImageUrl),
      };
    });
  };

  const moveImage = (fromIndex: number, toIndex: number) => {
    updateDraft((current) => {
      const imgs = current.images || [];
      if (fromIndex < 0 || fromIndex >= imgs.length) return current;
      const clampedTo = Math.max(0, Math.min(toIndex, imgs.length - 1));
      if (fromIndex === clampedTo) return current;
      const next = [...imgs];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(clampedTo, 0, moved);
      return {
        ...current,
        images: next,
        primaryImageUrl: syncPrimaryWithImages(next, current.primaryImageUrl),
      };
    });
  };

  const uploadIntoSlot = async (slotIndex: number, files: FileList | File[] | null) => {
    const list = files ? Array.from(files) : [];
    if (!list.length) return;
    setImageUploading(true);
    setError(null);
    try {
      const newUrls = await uploadImageFiles(list);
      if (newUrls.length > 0) {
        applyUploadedUrlsToSlots(slotIndex, newUrls);
      }
    } catch (err) {
      console.error("Image upload failed:", err);
      setError(t("productsPage.imageUploadError"));
    } finally {
      setImageUploading(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  const handleImageInputChange = async (files: FileList | null) => {
    const slot = imagePickerSlotIndexRef.current;
    imagePickerSlotIndexRef.current = null;
    await uploadIntoSlot(slot ?? images.length, files);
  };

  const handleSave = async () => {
    if (!draft) return;
    setIsSaving(true);
    setError(null);
    try {
      if (draft._id) {
        const updated = await productsApi.update(draft._id, draft);
        // Keep form on the saved product (server-normalized payload).
        setDraft(hydrateProduct(updated, clientGroups));
      } else {
        const created = await productsApi.create(draft);
        // Keep form on the newly created product (no forced clear/reset).
        setDraft(hydrateProduct(created, clientGroups));
      }
      await loadData();
    } catch (err: unknown) {
      console.error("Failed to save product:", err);
      const ax = err as { response?: { data?: { error?: string } } };
      setError(ax?.response?.data?.error || t("productsPage.saveError"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!draft?._id) return;
    const confirmed = window.confirm(t("productsPage.deleteConfirm", { name: draft.name }));
    if (!confirmed) return;

    setError(null);
    try {
      await productsApi.delete(draft._id);
      setDraft(createEmptyProduct(clientGroups));
      await loadData();
    } catch (err: unknown) {
      console.error("Failed to delete product:", err);
      const ax = err as { response?: { data?: { error?: string } } };
      setError(ax?.response?.data?.error || t("productsPage.deleteError"));
    }
  };

  const images = draft?.images || [];

  const imageDropHandlers = {
    onDragEnter: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      e.stopPropagation();
      imageDropDepthRef.current += 1;
      setImageDropActive(true);
    },
    onDragLeave: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      imageDropDepthRef.current -= 1;
      if (imageDropDepthRef.current <= 0) {
        imageDropDepthRef.current = 0;
        setImageDropActive(false);
      }
    },
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "copy";
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      imageDropDepthRef.current = 0;
      setImageDropActive(false);
      if (e.dataTransfer.files?.length) void uploadIntoSlot(images.length, e.dataTransfer.files);
    },
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <PageHeader
          title={t("productsPage.title")}
          subtitle={t("productsPage.subtitle")}
          actions={
            <>
              {draft && (
                <>
                  <Button
                    isLoading={isSaving}
                    onClick={handleSave}
                    disabled={!draft.name.trim() || clientGroups.length === 0}
                  >
                    {t("productsPage.saveProduct")}
                  </Button>
                  {selectedProduct && (
                    <Button
                      variant="danger"
                      onClick={handleDelete}
                    >
                      {t("productsPage.delete")}
                    </Button>
                  )}
                </>
              )}
              <Link to="/client-groups">
                <Button variant="outline">{t("productsPage.manageClientGroups")}</Button>
              </Link>
              <Button variant="outline" onClick={resetDraft}>
                {t("productsPage.newProduct")}
              </Button>
            </>
          }
        />

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="border-b border-gray-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-gray-900">{t("productsPage.catalog")}</h2>
            </div>
            {isLoading ? (
              <div className="px-4 py-10 text-sm text-gray-500">
                {t("productsPage.loadingProducts")}
              </div>
            ) : products.length === 0 ? (
              <div className="px-4 py-10 text-sm text-gray-500">{t("productsPage.emptyCatalog")}</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {products.map((product) => (
                  <button
                    key={product._id}
                    type="button"
                    className={`w-full px-4 py-4 text-left hover:bg-gray-50 ${
                      draft?._id === product._id ? "bg-primary-50/50" : ""
                    }`}
                    onClick={() => startEdit(product)}
                  >
                    <div className="text-sm font-medium text-gray-900">{product.name}</div>
                    <div className="mt-1 text-xs text-gray-500">
                      {product.category || t("productsPage.uncategorized")}
                      {product.isActive
                        ? ` • ${t("productsPage.active")}`
                        : ` • ${t("productsPage.inactive")}`}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {draft && (
            <div className="bg-gray-50/50 space-y-6">
              <FormSection title={t("productsPage.sectionBasicInfo")}>
                <div className="grid gap-4 md:grid-cols-2">
                  <Input
                    label={t("productsPage.productName")}
                    value={draft.name}
                    onChange={(e) =>
                      updateDraft((current) => ({ ...current, name: e.target.value }))
                    }
                    placeholder={t("productsPage.productNamePlaceholder")}
                  />
                  <Input
                    label={t("productsPage.category")}
                    value={draft.category}
                    onChange={(e) =>
                      updateDraft((current) => ({ ...current, category: e.target.value }))
                    }
                    placeholder={t("productsPage.categoryPlaceholder")}
                  />
                  <Input
                    label={t("productsPage.currency")}
                    value={draft.currency}
                    onChange={(e) =>
                      updateDraft((current) => ({
                        ...current,
                        currency: e.target.value.toUpperCase(),
                      }))
                    }
                  />
                  <Input
                    label={t("productsPage.displayOrder")}
                    type="text"
                    inputMode="numeric"
                    value={
                      focusedNumberCell === "basic:displayOrder"
                        ? numberCellText["basic:displayOrder"] ?? String(draft.displayOrder ?? 0)
                        : formatNumber(draft.displayOrder)
                    }
                    onFocus={(e) => {
                      setFocusedNumberCell("basic:displayOrder");
                      setNumberCellText((m) => ({
                        ...m,
                        "basic:displayOrder": String(draft.displayOrder ?? 0),
                      }));
                      e.target.select();
                    }}
                    onChange={(e) =>
                      setNumberCellText((m) => ({
                        ...m,
                        "basic:displayOrder": e.target.value,
                      }))
                    }
                    onBlur={() => {
                      setFocusedNumberCell((cur) =>
                        cur === "basic:displayOrder" ? null : cur,
                      );
                      const next = parseNumberOrNull(numberCellText["basic:displayOrder"] ?? "");
                      updateDraft((current) => ({
                        ...current,
                        displayOrder: next ?? 0,
                      }));
                      setNumberCellText((m) => {
                        const nextMap = { ...m };
                        delete nextMap["basic:displayOrder"];
                        return nextMap;
                      });
                    }}
                  />
                </div>

                <Textarea
                  label={t("productsPage.description")}
                  rows={3}
                  value={draft.description}
                  onChange={(e) =>
                    updateDraft((current) => ({ ...current, description: e.target.value }))
                  }
                  placeholder={t("productsPage.descriptionPlaceholder")}
                />

                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={draft.isActive}
                    onChange={(e) =>
                      updateDraft((current) => ({ ...current, isActive: e.target.checked }))
                    }
                  />
                  {t("productsPage.isActive")}
                </label>

                <div>
                  <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <h4 className="text-sm font-medium text-gray-800">
                      {t("productsPage.basePriceByGroup")}
                    </h4>
                    <p className="text-xs text-gray-500">{t("productsPage.hintBasePrice")}</p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    {clientGroups.map((group) => (
                      <Input
                        key={group._id}
                        label={group.name}
                        type="text"
                        inputMode="decimal"
                        value={
                          focusedNumberCell === `base:${group.slug}`
                            ? numberCellText[`base:${group.slug}`] ??
                              String(draft.basePriceByGroup[group.slug] ?? "")
                            : formatNumber(draft.basePriceByGroup[group.slug])
                        }
                        onFocus={(e) => {
                          setFocusedNumberCell(`base:${group.slug}`);
                          setNumberCellText((m) => ({
                            ...m,
                            [`base:${group.slug}`]:
                              draft.basePriceByGroup[group.slug] != null
                                ? String(draft.basePriceByGroup[group.slug])
                                : "",
                          }));
                          e.target.select();
                        }}
                        onChange={(e) =>
                          setNumberCellText((m) => ({
                            ...m,
                            [`base:${group.slug}`]: e.target.value,
                          }))
                        }
                        onBlur={() => {
                          setFocusedNumberCell((cur) =>
                            cur === `base:${group.slug}` ? null : cur,
                          );
                          updateBasePrice(
                            group.slug,
                            numberCellText[`base:${group.slug}`] ?? "",
                          );
                          setNumberCellText((m) => {
                            const nextMap = { ...m };
                            delete nextMap[`base:${group.slug}`];
                            return nextMap;
                          });
                        }}
                      />
                    ))}
                  </div>
                </div>
              </FormSection>

              <FormSection title={t("productsPage.sectionImages")} hint={t("productsPage.hintImages")}>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  multiple
                  className="hidden"
                  onChange={(e) => void handleImageInputChange(e.target.files)}
                />
                <div
                  {...imageDropHandlers}
                  className={`rounded-xl border border-gray-200 bg-white p-4 transition-colors ${
                    imageDropActive
                      ? "ring-2 ring-primary-400"
                      : ""
                  }`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <div className="text-sm font-medium text-gray-900">
                        {t("productsPage.photosTitle")}
                      </div>
                      <div className="text-xs text-gray-500">
                        {t("productsPage.photosSubtitle", {
                          count: images.length,
                          max: MAX_IMAGE_SLOTS,
                        })}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={imageUploading || images.length >= MAX_IMAGE_SLOTS}
                      onClick={() => openImagePickerForSlot(images.length)}
                      className="shrink-0"
                    >
                      {imageUploading ? t("productsPage.uploadingImages") : t("productsPage.addPhoto")}
                    </Button>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
                    {Array.from({ length: MAX_IMAGE_SLOTS }).map((_, slotIndex) => {
                      const url = images[slotIndex];
                      const isCover = slotIndex === 0 && !!url;
                      const src = url ? resolveLogoUrl(url) || url : undefined;

                      return (
                        <div
                          key={`slot-${slotIndex}`}
                          className={`relative overflow-hidden rounded-lg border bg-gray-50 ${
                            url ? "border-gray-200" : "border-dashed border-gray-300"
                          }`}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = url ? "move" : "copy";
                          }}
                          onDrop={async (e) => {
                            setOpenImageMenuIndex(null);
                            // Files dropped onto a slot replace/fill from that slot.
                            if (e.dataTransfer.files?.length) {
                              imagePickerSlotIndexRef.current = slotIndex;
                              await uploadIntoSlot(slotIndex, e.dataTransfer.files);
                              return;
                            }
                            // Reorder drop.
                            const from = dragImageIndexRef.current;
                            dragImageIndexRef.current = null;
                            if (from != null) moveImage(from, slotIndex);
                          }}
                        >
                          {url ? (
                            <>
                              <img
                                src={src}
                                alt=""
                                className="aspect-square w-full object-cover"
                                draggable
                                onDragStart={(e) => {
                                  dragImageIndexRef.current = slotIndex;
                                  e.dataTransfer.effectAllowed = "move";
                                }}
                                onDragEnd={() => {
                                  dragImageIndexRef.current = null;
                                }}
                              />
                              {isCover ? (
                                <span className="absolute left-1 top-1 rounded bg-primary-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                                  {t("productsPage.coverBadge")}
                                </span>
                              ) : null}
                              <div
                                className="absolute right-2 top-2 z-10"
                                ref={openImageMenuIndex === slotIndex ? imageMenuRef : null}
                              >
                                <button
                                  type="button"
                                  className="rounded-full bg-white/95 p-1.5 text-gray-700 shadow-sm transition hover:bg-white"
                                  aria-label={t("productsPage.moreOptions")}
                                  onClick={() =>
                                    setOpenImageMenuIndex((current) =>
                                      current === slotIndex ? null : slotIndex,
                                    )
                                  }
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </button>
                                {openImageMenuIndex === slotIndex ? (
                                  <div className="absolute right-0 top-full mt-2 min-w-[150px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                                    <button
                                      type="button"
                                      disabled={isCover}
                                      className="block w-full px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50 disabled:cursor-default disabled:text-gray-400 disabled:hover:bg-white"
                                      onClick={() => {
                                        setPrimaryImageUrl(url);
                                        setOpenImageMenuIndex(null);
                                      }}
                                    >
                                      {t("productsPage.setCover")}
                                    </button>
                                    <button
                                      type="button"
                                      className="block w-full px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50"
                                      onClick={() => openImagePickerForSlot(slotIndex)}
                                    >
                                      {t("productsPage.replacePhoto")}
                                    </button>
                                    <button
                                      type="button"
                                      className="block w-full px-3 py-2 text-left text-sm text-red-700 transition hover:bg-red-50"
                                      onClick={() => {
                                        removeImageAt(slotIndex);
                                        setOpenImageMenuIndex(null);
                                      }}
                                    >
                                      {t("productsPage.removeImage")}
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="flex aspect-square w-full flex-col items-center justify-center gap-1 text-sm text-gray-600 hover:bg-gray-100"
                              onClick={() => openImagePickerForSlot(slotIndex)}
                            >
                              <span className="text-xs font-medium text-gray-700">
                                {t("productsPage.addPhoto")}
                              </span>
                              <span className="text-[11px] text-gray-500">
                                {slotIndex === 0
                                  ? t("productsPage.coverSlotHint")
                                  : t("productsPage.secondarySlotHint")}
                              </span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <p className="mt-3 text-xs text-gray-500">{t("productsPage.photosDragHint")}</p>
                </div>
              </FormSection>

              <section className="space-y-4">
                <Modal
                  isOpen={editingOptionGroupIndex != null}
                  onClose={closeOptionGroupEditor}
                  title={t("productsPage.editOptionGroupTitle")}
                  size="lg"
                  bodyScroll
                  footer={
                    <>
                      <Button variant="ghost" onClick={closeOptionGroupEditor}>
                        {t("productsPage.cancel")}
                      </Button>
                      <Button
                        onClick={saveOptionGroupEditor}
                        disabled={!editingOptionGroupDraft?.name?.trim()}
                      >
                        {t("productsPage.saveChanges")}
                      </Button>
                    </>
                  }
                >
                  {editingOptionGroupDraft ? (
                    <div className="space-y-5">
                      <div className="grid gap-4 md:grid-cols-2">
                        <Input
                          label={t("productsPage.groupName")}
                          value={editingOptionGroupDraft.name}
                          onChange={(e) =>
                            setEditingOptionGroupDraft((cur) =>
                              cur ? { ...cur, name: e.target.value } : cur,
                            )
                          }
                          placeholder={t("productsPage.groupNamePlaceholder")}
                        />
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <div className="mb-1 text-xs font-medium text-gray-700">
                              {t("productsPage.selectionType")}
                            </div>
                            <Select
                              value={editingOptionGroupDraft.selectionType}
                              onChange={(value) =>
                                setEditingOptionGroupDraft((cur) =>
                                  cur
                                    ? {
                                        ...cur,
                                        selectionType:
                                          value as ProductOptionGroup["selectionType"],
                                      }
                                    : cur,
                                )
                              }
                              options={[
                                { value: "single", label: t("productsPage.selectionSingle") },
                                { value: "multiple", label: t("productsPage.selectionMultiple") },
                              ]}
                            />
                          </div>
                          <div>
                            <div className="mb-1 text-xs font-medium text-gray-700">
                              {t("productsPage.pricingMode")}
                            </div>
                            <Select
                              value={editingOptionGroupDraft.pricingMode}
                              onChange={(value) =>
                                setEditingOptionGroupDraft((cur) =>
                                  cur
                                    ? {
                                        ...cur,
                                        pricingMode:
                                          value as ProductOptionGroup["pricingMode"],
                                      }
                                    : cur,
                                )
                              }
                              options={[
                                { value: "delta", label: t("productsPage.pricingDelta") },
                                { value: "absolute", label: t("productsPage.pricingAbsolute") },
                              ]}
                            />
                          </div>
                          <label className="sm:col-span-2 inline-flex items-center gap-2 text-sm text-gray-700">
                            <input
                              type="checkbox"
                              checked={editingOptionGroupDraft.required}
                              onChange={(e) =>
                                setEditingOptionGroupDraft((cur) =>
                                  cur ? { ...cur, required: e.target.checked } : cur,
                                )
                              }
                            />
                            {t("productsPage.required")}
                          </label>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {t("productsPage.optionValues")}
                            </div>
                            <div className="mt-0.5 text-xs text-gray-500">
                              {t("productsPage.optionValuesHint")}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            type="button"
                            onClick={() =>
                              setEditingOptionGroupDraft((cur) =>
                                cur
                                  ? {
                                      ...cur,
                                      values: [
                                        ...cur.values,
                                        {
                                          ...createEmptyValue(clientGroups),
                                          displayOrder: cur.values.length,
                                        },
                                      ],
                                    }
                                  : cur,
                              )
                            }
                          >
                            {t("productsPage.addValue")}
                          </Button>
                        </div>

                        <div className="space-y-2">
                          {editingOptionGroupDraft.values.length === 0 ? (
                            <p className="text-sm text-gray-500">
                              {t("productsPage.valuesEmptyHint")}
                            </p>
                          ) : null}
                          {editingOptionGroupDraft.values.map((value, valueIndex) => (
                            <div
                              key={`${value.id || "value"}-${valueIndex}`}
                              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2"
                            >
                              <Input
                                value={value.label}
                                onChange={(e) =>
                                  setEditingOptionGroupDraft((cur) =>
                                    cur
                                      ? {
                                          ...cur,
                                          values: cur.values.map((v, vi) =>
                                            vi === valueIndex
                                              ? { ...v, label: e.target.value }
                                              : v,
                                          ),
                                        }
                                      : cur,
                                  )
                                }
                                placeholder={t("productsPage.valueLabelPlaceholder")}
                                className="h-9"
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                type="button"
                                className="text-red-600 hover:bg-red-50"
                                onClick={() =>
                                  setEditingOptionGroupDraft((cur) =>
                                    cur
                                      ? {
                                          ...cur,
                                          values: cur.values.filter((_, i) => i !== valueIndex),
                                        }
                                      : cur,
                                  )
                                }
                              >
                                {t("productsPage.remove")}
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </Modal>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-gray-800">
                    {t("productsPage.optionGroups")}
                  </span>
                  <Button size="sm" variant="outline" type="button" onClick={addGroup}>
                    {t("productsPage.addGroup")}
                  </Button>
                </div>
                <div className="space-y-3">
                  {draft.optionGroups.length === 0 ? (
                    <p className="text-sm text-gray-500">{t("productsPage.optionsEmptyHint")}</p>
                  ) : null}

                  {draft.optionGroups.map((group, groupIndex) => (
                    <div
                      key={`${group.id || "group"}-${groupIndex}`}
                      className="rounded-xl border border-gray-200 bg-white overflow-hidden"
                    >
                      <div className="flex items-center justify-between gap-3 border-b border-gray-100 bg-gray-50/60 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-gray-900 truncate">
                                {group.name?.trim() || t("productsPage.untitledGroup")}
                              </div>
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                {(group.values || [])
                                  .filter((v) => (v.label || "").trim())
                                  .slice(0, 6)
                                  .map((v, idx) => (
                                    <span
                                      key={`${v.id || "value"}-${idx}`}
                                      className="inline-flex items-center rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-xs text-gray-700"
                                    >
                                      {v.label}
                                    </span>
                                  ))}
                                {(group.values || []).filter((v) => (v.label || "").trim()).length >
                                6 ? (
                                  <span className="inline-flex items-center rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-xs text-gray-500">
                                    {t("productsPage.moreValues", {
                                      count:
                                        (group.values || []).filter((v) =>
                                          (v.label || "").trim(),
                                        ).length - 6,
                                    })}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            type="button"
                            onClick={() => openOptionGroupEditor(groupIndex)}
                          >
                            {t("productsPage.edit")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            type="button"
                            className="text-red-600 hover:bg-red-50"
                            onClick={() => removeGroup(groupIndex)}
                          >
                            {t("productsPage.removeGroup")}
                          </Button>
                        </div>
                      </div>

                      <div className="px-4 py-3">
                        <div className="text-xs text-gray-500">
                          {group.selectionType === "single"
                            ? t("productsPage.selectionSingle")
                            : t("productsPage.selectionMultiple")}
                          {" • "}
                          {group.pricingMode === "delta"
                            ? t("productsPage.pricingDelta")
                            : t("productsPage.pricingAbsolute")}
                          {group.required ? ` • ${t("productsPage.required")}` : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-2 overflow-x-auto rounded-xl border border-gray-200 bg-white">
                  <table className="min-w-[720px] w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                        <th className="px-4 py-3">{t("productsPage.variant")}</th>
                        <th className="px-4 py-3 w-[160px]">{t("productsPage.price")}</th>
                        <th className="px-4 py-3 w-[140px]">{t("productsPage.onHand")}</th>
                        <th className="px-4 py-3 w-[140px]">{t("productsPage.available")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(draft.variants || []).length === 0 ? (
                        <tr>
                          <td className="px-4 py-6 text-gray-500" colSpan={4}>
                            {t("productsPage.variantsEmptyHint")}
                          </td>
                        </tr>
                      ) : (
                        (draft.variants || [])
                          .slice()
                          .sort((a, b) => a.displayOrder - b.displayOrder)
                          .map((variant, variantIndex) => (
                            <tr key={`${variant.id}-${variantIndex}`} className="hover:bg-gray-50/50">
                              <td className="px-4 py-3 font-medium text-gray-900">
                                {variant.label}
                              </td>
                              <td className="px-4 py-3">
                                {(() => {
                                  const key = `v:${variantIndex}:price`;
                                  const stored = numberCellText[key];
                                  const isFocused = focusedNumberCell === key;
                                  const rawValue = variant.priceByGroup?.[defaultClientGroupSlug];
                                  const display = isFocused
                                    ? stored ?? (rawValue != null ? String(rawValue) : "")
                                    : formatNumber(rawValue);
                                  return (
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  value={display}
                                  onFocus={(e) => {
                                    setFocusedNumberCell(key);
                                    setNumberCellText((m) => ({
                                      ...m,
                                      [key]: rawValue != null ? String(rawValue) : "",
                                    }));
                                    e.target.select();
                                  }}
                                  onChange={(e) =>
                                    setNumberCellText((m) => ({ ...m, [key]: e.target.value }))
                                  }
                                  onBlur={() => {
                                    setFocusedNumberCell((cur) => (cur === key ? null : cur));
                                    const next = parseNumberOrNull(numberCellText[key] ?? "");
                                    updateDraft((current) => ({
                                      ...current,
                                      variants: (current.variants || []).map((v, i) =>
                                        i === variantIndex
                                          ? {
                                              ...v,
                                              priceByGroup: (() => {
                                                const nextPriceMap = { ...(v.priceByGroup || {}) };
                                                if (next == null) {
                                                  delete nextPriceMap[defaultClientGroupSlug];
                                                } else {
                                                  nextPriceMap[defaultClientGroupSlug] = next;
                                                }
                                                return nextPriceMap;
                                              })(),
                                            }
                                          : v,
                                      ),
                                    }));
                                    setNumberCellText((m) => {
                                      const nextMap = { ...m };
                                      delete nextMap[key];
                                      return nextMap;
                                    });
                                  }}
                                />
                                  );
                                })()}
                              </td>
                              <td className="px-4 py-3">
                                {(() => {
                                  const key = `v:${variantIndex}:onHand`;
                                  const stored = numberCellText[key];
                                  const isFocused = focusedNumberCell === key;
                                  const rawValue = variant.onHand;
                                  const display = isFocused
                                    ? stored ?? (rawValue != null ? String(rawValue) : "")
                                    : formatNumber(rawValue);
                                  return (
                                <Input
                                  type="text"
                                  inputMode="numeric"
                                  value={display}
                                  onFocus={(e) => {
                                    setFocusedNumberCell(key);
                                    setNumberCellText((m) => ({
                                      ...m,
                                      [key]: rawValue != null ? String(rawValue) : "",
                                    }));
                                    e.target.select();
                                  }}
                                  onChange={(e) =>
                                    setNumberCellText((m) => ({ ...m, [key]: e.target.value }))
                                  }
                                  onBlur={() => {
                                    setFocusedNumberCell((cur) => (cur === key ? null : cur));
                                    const next = parseNumberOrNull(numberCellText[key] ?? "");
                                    updateDraft((current) => ({
                                      ...current,
                                      variants: (current.variants || []).map((v, i) =>
                                        i === variantIndex ? { ...v, onHand: next ?? undefined } : v,
                                      ),
                                    }));
                                    setNumberCellText((m) => {
                                      const nextMap = { ...m };
                                      delete nextMap[key];
                                      return nextMap;
                                    });
                                  }}
                                />
                                  );
                                })()}
                              </td>
                              <td className="px-4 py-3">
                                <label className="inline-flex items-center gap-2 text-gray-700">
                                  <input
                                    type="checkbox"
                                    checked={variant.isActive !== false}
                                    onChange={(e) =>
                                      updateDraft((current) => ({
                                        ...current,
                                        variants: (current.variants || []).map((v, i) =>
                                          i === variantIndex ? { ...v, isActive: e.target.checked } : v,
                                        ),
                                      }))
                                    }
                                  />
                                  {variant.isActive !== false
                                    ? t("productsPage.active")
                                    : t("productsPage.inactive")}
                                </label>
                              </td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Products;
