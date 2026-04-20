function slugifyLocal(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeImages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const isAllowed = (raw: string) => {
    const s = raw.trim();
    if (!s) return false;
    if (s.startsWith("/uploads/")) return true;
    if (s.startsWith("https://") || s.startsWith("http://")) return true;
    return false;
  };

  return value
    .filter((item): item is string => typeof item === "string")
    .map((s) => s.trim())
    .filter(isAllowed);
}

function normalizePrimaryImageUrl(images: string[], raw: unknown): string | undefined {
  if (images.length === 0) return undefined;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (t && images.includes(t)) return t;
  }
  return images[0];
}

function normalizePriceByGroup(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, raw]) => {
      if (typeof raw === "number" && Number.isFinite(raw)) return [[key, raw]];
      if (typeof raw === "string" && raw.trim() !== "") {
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) return [[key, parsed]];
      }
      return [];
    }),
  );
}

function ensureUniqueIds(values: Array<{ id?: string; label: string }>) {
  const seen = new Set<string>();

  return values.map((value, index) => {
    const raw = (value.id?.trim() || value.label || "").trim();
    const base = slugifyLocal(raw) || `item-${index + 1}`;
    let candidate = base;
    let suffix = 2;

    while (seen.has(candidate)) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }

    seen.add(candidate);
    return candidate;
  });
}

function normalizeVariantRows(value: unknown): Array<{
  id: string;
  optionValueIds: string[];
  label: string;
  isActive: boolean;
  displayOrder: number;
  priceByGroup: Record<string, number>;
  onHand?: number;
}> {
  if (!Array.isArray(value)) return [];

  const rows = value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((row, index) => {
      const optionValueIds = Array.isArray(row.optionValueIds)
        ? row.optionValueIds
            .filter((v): v is string => typeof v === "string")
            .map((v) => v.trim())
            .filter(Boolean)
        : [];
      const rawLabel = typeof row.label === "string" ? row.label.trim() : "";
      const label = rawLabel || optionValueIds.join(" / ") || `Variant ${index + 1}`;

      const rawId = typeof row.id === "string" ? row.id.trim() : "";
      const idSource = rawId || optionValueIds.join("__") || label;
      const id = slugifyLocal(idSource) || `variant-${index + 1}`;

      const onHandRaw = row.onHand;
      const onHand =
        typeof onHandRaw === "number" && Number.isFinite(onHandRaw) ? onHandRaw : undefined;

      return {
        id,
        optionValueIds,
        label,
        isActive: row.isActive !== false,
        displayOrder: typeof row.displayOrder === "number" ? row.displayOrder : index,
        priceByGroup: normalizePriceByGroup(row.priceByGroup),
        onHand,
      };
    });

  const uniqueIds = ensureUniqueIds(
    rows.map((row) => ({
      id: row.id,
      label: row.label,
    })),
  );

  return rows.map((row, idx) => ({ ...row, id: uniqueIds[idx] }));
}

export function normalizeProductPayload(body: Record<string, unknown>) {
  const optionGroupsInput = Array.isArray(body.optionGroups) ? body.optionGroups : [];

  const normalizedOptionGroups = optionGroupsInput
    .map((group, groupIndex) => {
      const groupRecord = (group ?? {}) as Record<string, unknown>;
      const name = String(groupRecord.name || "").trim();
      const valuesInput = Array.isArray(groupRecord.values) ? groupRecord.values : [];

      const normalizedValues = valuesInput
        .map((value, valueIndex) => {
          const valueRecord = (value ?? {}) as Record<string, unknown>;
          const label = String(valueRecord.label || "").trim();

          return {
            id: typeof valueRecord.id === "string" ? valueRecord.id : "",
            label,
            description: String(valueRecord.description || "").trim(),
            isDefault: valueRecord.isDefault === true,
            isActive: valueRecord.isActive !== false,
            displayOrder:
              typeof valueRecord.displayOrder === "number"
                ? valueRecord.displayOrder
                : valueIndex,
            priceByGroup: normalizePriceByGroup(valueRecord.priceByGroup),
          };
        })
        .filter((value) => value.label.length > 0);

      const valueIds = ensureUniqueIds(
        normalizedValues.map((value) => ({
          id: value.id,
          label: value.label,
        })),
      );

      return {
        id: typeof groupRecord.id === "string" ? groupRecord.id : "",
        name,
        selectionType:
          groupRecord.selectionType === "multiple" ? "multiple" : "single",
        pricingMode:
          groupRecord.pricingMode === "absolute" ? "absolute" : "delta",
        required: groupRecord.required === true,
        displayOrder:
          typeof groupRecord.displayOrder === "number" ? groupRecord.displayOrder : groupIndex,
        values: normalizedValues.map((value, valueIndex) => ({
          ...value,
          id: valueIds[valueIndex],
        })),
      };
    })
    .filter((group) => group.name.length > 0 && group.values.length > 0);

  const groupIds = ensureUniqueIds(
    normalizedOptionGroups.map((group) => ({
      id: group.id,
      label: group.name,
    })),
  );

  const optionGroups = normalizedOptionGroups.map((group, groupIndex) => ({
    ...group,
    id: groupIds[groupIndex],
  }));

  const images = normalizeImages(body.images);

  return {
    name: String(body.name || "").trim(),
    category: String(body.category || "").trim(),
    description: String(body.description || "").trim(),
    currency: String(body.currency || "HKD").trim().toUpperCase(),
    isActive: body.isActive !== false,
    displayOrder:
      typeof body.displayOrder === "number" ? body.displayOrder : 0,
    images,
    primaryImageUrl: normalizePrimaryImageUrl(images, body.primaryImageUrl),
    variants: normalizeVariantRows(body.variants),
    basePriceByGroup: normalizePriceByGroup(body.basePriceByGroup),
    optionGroups,
  };
}
