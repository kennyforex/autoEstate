import type { OrderItemSnapshot, Product } from "../lib/types";

export interface ResolvedOrderItem {
  snapshot: OrderItemSnapshot;
  variantId?: string;
}

function normalizeComparable(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function isMongoObjectId(value: string): boolean {
  return /^[a-f\d]{24}$/i.test(value);
}

function findVariantById(product: Product, variantId: string) {
  return (product.variants || []).find((v) => v.id === variantId);
}

function findVariantByLabel(product: Product, variantLabel?: string) {
  if (!variantLabel?.trim()) return undefined;
  const target = normalizeComparable(variantLabel);
  return (product.variants || []).find((v) => normalizeComparable(v.label) === target);
}

function findProductByName(products: Product[], productName: string): Product | undefined {
  const target = normalizeComparable(productName);
  if (!target) return undefined;

  const exact = products.find((p) => normalizeComparable(p.name) === target);
  if (exact) return exact;

  return products.find((p) => {
    const name = normalizeComparable(p.name);
    return name.includes(target) || target.includes(name);
  });
}

function findProductByVariantId(products: Product[], variantId: string) {
  for (const product of products) {
    const variant = findVariantById(product, variantId);
    if (variant) return { product, variant };
  }
  return null;
}

function enrichSnapshot(
  snapshot: OrderItemSnapshot,
  product: Product,
  variant?: { id: string; label: string },
): ResolvedOrderItem {
  return {
    snapshot: {
      ...snapshot,
      productId: product._id,
      productName: product.name,
      variantLabel: variant?.label ?? snapshot.variantLabel,
      imageUrl: snapshot.imageUrl || product.primaryImageUrl || product.images?.[0],
    },
    variantId: variant?.id,
  };
}

/** Hydrate productId / variant selection when loading an order in the UI. */
export function resolveOrderItemSnapshot(
  snapshot: OrderItemSnapshot,
  products: Product[],
): ResolvedOrderItem {
  const candidateId = snapshot.productId?.trim();

  if (candidateId && isMongoObjectId(candidateId)) {
    const product = products.find((p) => p._id === candidateId);
    if (product) {
      const variant = findVariantByLabel(product, snapshot.variantLabel);
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
    const variant = findVariantByLabel(byName, snapshot.variantLabel);
    return enrichSnapshot(snapshot, byName, variant);
  }

  return { snapshot: { ...snapshot } };
}
