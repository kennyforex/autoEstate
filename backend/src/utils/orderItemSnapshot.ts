import { isValidObjectId } from "mongoose";
import type { IProductDocument } from "../models/Product.js";

export interface OrderSnapshotInput {
  productId?: string;
  variantId?: string;
  productName: string;
  variantLabel?: string;
  optionSummary?: string;
  sku?: string;
  imageUrl?: string;
}

export interface ResolvedOrderItem {
  snapshot: OrderSnapshotInput;
  /** Matched catalog variant id (not persisted on order snapshot). */
  variantId?: string;
}

function normalizeComparable(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeVariantComparable(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[（(][^）)]*[）)]/g, " ")
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, " ")
    .replace(/[^\p{Letter}\p{Number}/]+/gu, " ")
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\s+/g, " ")
    .trim();
}

function variantFlavorPart(text: string): string {
  const normalized = normalizeVariantComparable(text);
  const parts = normalized.split("/").map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : normalized;
}

function primaryImageForProduct(product: IProductDocument): string | undefined {
  const images = Array.isArray(product.images) ? product.images : [];
  const storedPrimary =
    typeof product.primaryImageUrl === "string" ? product.primaryImageUrl.trim() : "";
  if (storedPrimary && images.includes(storedPrimary)) return storedPrimary;
  return images[0];
}

function findVariantById(
  product: IProductDocument,
  variantId: string,
): IProductDocument["variants"][number] | undefined {
  return (product.variants || []).find((v) => v.id === variantId);
}

function findVariantByLabel(
  product: IProductDocument,
  variantLabel?: string,
): IProductDocument["variants"][number] | undefined {
  if (!variantLabel?.trim()) return undefined;
  const target = normalizeComparable(variantLabel);
  const variants = product.variants || [];
  const exact = variants.find((v) => normalizeComparable(v.label) === target);
  if (exact) return exact;

  const normalizedTarget = normalizeVariantComparable(variantLabel);
  const normalized = variants
    .map((variant) => ({
      variant,
      label: normalizeVariantComparable(variant.label),
    }))
    .filter((entry) => entry.label);

  const normalizedExact = normalized.filter((entry) => entry.label === normalizedTarget);
  if (normalizedExact.length === 1) return normalizedExact[0].variant;

  const targetFlavor = variantFlavorPart(variantLabel);
  if (targetFlavor) {
    const flavorMatches = normalized.filter((entry) => {
      const flavor = variantFlavorPart(entry.variant.label);
      return flavor === targetFlavor || flavor.includes(targetFlavor) || targetFlavor.includes(flavor);
    });
    if (flavorMatches.length === 1) return flavorMatches[0].variant;
  }

  const containsMatches = normalized.filter(
    (entry) => entry.label.includes(normalizedTarget) || normalizedTarget.includes(entry.label),
  );
  if (containsMatches.length === 1) return containsMatches[0].variant;

  return undefined;
}

function findProductByName(
  products: IProductDocument[],
  productName: string,
): IProductDocument | undefined {
  const target = normalizeComparable(productName);
  if (!target) return undefined;

  const exact = products.find((p) => normalizeComparable(p.name) === target);
  if (exact) return exact;

  return products.find((p) => {
    const name = normalizeComparable(p.name);
    return name.includes(target) || target.includes(name);
  });
}

function findProductByVariantId(
  products: IProductDocument[],
  variantId: string,
): { product: IProductDocument; variant: IProductDocument["variants"][number] } | null {
  for (const product of products) {
    const variant = findVariantById(product, variantId);
    if (variant) return { product, variant };
  }
  return null;
}

function enrichSnapshot(
  snapshot: OrderSnapshotInput,
  product: IProductDocument,
  variant?: IProductDocument["variants"][number],
): ResolvedOrderItem {
  return {
    snapshot: {
      ...snapshot,
      productId: product._id.toString(),
      variantId: variant?.id ?? snapshot.variantId,
      productName: product.name,
      variantLabel: variant?.label ?? snapshot.variantLabel,
      imageUrl: snapshot.imageUrl || primaryImageForProduct(product),
    },
    variantId: variant?.id,
  };
}

/**
 * Link an order line snapshot to catalog products.
 * Handles agent mistakes such as passing variant.id as productId, or omitting productId entirely.
 */
export function resolveOrderItemSnapshot(
  snapshot: OrderSnapshotInput,
  products: IProductDocument[],
): ResolvedOrderItem {
  const candidateId = snapshot.productId?.trim();

  if (candidateId && isValidObjectId(candidateId)) {
    const product = products.find((p) => p._id.toString() === candidateId);
    if (product) {
      const variant =
        snapshot.variantId?.trim()
          ? findVariantById(product, snapshot.variantId.trim())
          : findVariantByLabel(product, snapshot.variantLabel);
      return enrichSnapshot(snapshot, product, variant);
    }
  }

  if (candidateId) {
    const byVariant = findProductByVariantId(products, candidateId);
    if (byVariant) {
      return enrichSnapshot(snapshot, byVariant.product, byVariant.variant);
    }
  }

  const byName = findProductByName(products, snapshot.productName);
  if (byName) {
    const variant =
      snapshot.variantId?.trim()
        ? findVariantById(byName, snapshot.variantId.trim())
        : findVariantByLabel(byName, snapshot.variantLabel);
    return enrichSnapshot(snapshot, byName, variant);
  }

  return { snapshot: { ...snapshot } };
}

export async function loadProductsForSnapshotResolution(): Promise<IProductDocument[]> {
  const { Product } = await import("../models/index.js");
  return Product.find({}).select("name images primaryImageUrl variants").sort({ displayOrder: 1, name: 1 });
}

export function resolveOrderItemSnapshots<T extends { snapshot: OrderSnapshotInput }>(
  items: T[],
  products: IProductDocument[],
): Array<T & { variantId?: string }> {
  return items.map((item) => {
    const resolved = resolveOrderItemSnapshot(item.snapshot, products);
    return { ...item, snapshot: resolved.snapshot, variantId: resolved.variantId };
  });
}
