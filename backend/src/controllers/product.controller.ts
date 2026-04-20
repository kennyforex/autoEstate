import { NextFunction, Response } from "express";
import { Product } from "../models/index.js";
import { catalogService } from "../services/catalog.service.js";
import type { AuthRequest } from "../types/index.js";

function slugifyLocal(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

function normalizeProductPayload(body: Record<string, unknown>) {
  const optionGroupsInput = Array.isArray(body.optionGroups) ? body.optionGroups : [];
  const groupIds = ensureUniqueIds(
    optionGroupsInput.map((group) => ({
      id: typeof group === "object" && group && "id" in group ? String(group.id || "") : "",
      label: typeof group === "object" && group && "name" in group ? String(group.name || "") : "",
    })),
  );

  const optionGroups = optionGroupsInput.map((group, groupIndex) => {
    const groupRecord = (group ?? {}) as Record<string, unknown>;
    const valuesInput = Array.isArray(groupRecord.values) ? groupRecord.values : [];
    const valueIds = ensureUniqueIds(
      valuesInput.map((value) => ({
        id: typeof value === "object" && value && "id" in value ? String(value.id || "") : "",
        label: typeof value === "object" && value && "label" in value ? String(value.label || "") : "",
      })),
    );

    return {
      id: groupIds[groupIndex],
      name: String(groupRecord.name || "").trim(),
      selectionType:
        groupRecord.selectionType === "multiple" ? "multiple" : "single",
      pricingMode:
        groupRecord.pricingMode === "absolute" ? "absolute" : "delta",
      required: groupRecord.required === true,
      displayOrder:
        typeof groupRecord.displayOrder === "number" ? groupRecord.displayOrder : groupIndex,
      values: valuesInput.map((value, valueIndex) => {
        const valueRecord = (value ?? {}) as Record<string, unknown>;
        return {
          id: valueIds[valueIndex],
          label: String(valueRecord.label || "").trim(),
          description: String(valueRecord.description || "").trim(),
          isDefault: valueRecord.isDefault === true,
          isActive: valueRecord.isActive !== false,
          displayOrder:
            typeof valueRecord.displayOrder === "number"
              ? valueRecord.displayOrder
              : valueIndex,
          priceByGroup: normalizePriceByGroup(valueRecord.priceByGroup),
        };
      }),
    };
  });

  return {
    name: String(body.name || "").trim(),
    category: String(body.category || "").trim(),
    description: String(body.description || "").trim(),
    currency: String(body.currency || "HKD").trim().toUpperCase(),
    isActive: body.isActive !== false,
    displayOrder:
      typeof body.displayOrder === "number" ? body.displayOrder : 0,
    basePriceByGroup: normalizePriceByGroup(body.basePriceByGroup),
    optionGroups,
  };
}

export async function listProducts(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const includeInactive = req.query.includeInactive === "true";
    const query: Record<string, unknown> = {};

    if (!includeInactive) {
      query.isActive = true;
    }

    if (typeof req.query.category === "string" && req.query.category.trim()) {
      query.category = req.query.category.trim();
    }

    const products = await Product.find(query).sort({ displayOrder: 1, name: 1 });
    res.json({ products });
  } catch (error) {
    next(error);
  }
}

export async function getProduct(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    res.json({ product });
  } catch (error) {
    next(error);
  }
}

export async function createProduct(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const payload = normalizeProductPayload(req.body);
    const slug = await catalogService.buildUniqueProductSlug(payload.name);
    const product = await Product.create({ ...payload, slug });
    res.status(201).json({ product });
  } catch (error) {
    next(error);
  }
}

export async function updateProduct(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);

    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    const payload = normalizeProductPayload(req.body);
    const nextName = payload.name || product.name;

    Object.assign(product, payload, {
      slug: await catalogService.buildUniqueProductSlug(nextName, product._id.toString()),
    });

    await product.save();
    res.json({ product });
  } catch (error) {
    next(error);
  }
}

export async function deleteProduct(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);

    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    res.json({ message: "Product deleted successfully" });
  } catch (error) {
    next(error);
  }
}
