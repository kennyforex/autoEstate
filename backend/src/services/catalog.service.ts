import {
  ClientGroup,
  Contact,
  Product,
  type IClientGroupDocument,
  type IProductDocument,
} from "../models/index.js";
import {
  calculateProductQuote,
  resolvePriceByClientGroup,
  type PriceByGroup,
} from "../utils/catalogPricing.js";

const DEFAULT_CLIENT_GROUP_NAME = "Basic";
const DEFAULT_CLIENT_GROUP_SLUG = "basic";

function slugifyCatalogValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function priceMapToRecord(value: unknown): PriceByGroup {
  if (value instanceof Map) {
    return Object.fromEntries(value.entries()) as PriceByGroup;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).filter(
        (entry): entry is [string, number] => typeof entry[1] === "number",
      ),
    );
  }

  return {};
}

class CatalogService {
  async ensureDefaultClientGroup(): Promise<IClientGroupDocument> {
    let basicGroup = await ClientGroup.findOne({ slug: DEFAULT_CLIENT_GROUP_SLUG });
    let defaultGroup = await ClientGroup.findOne({ isDefault: true }).sort({ sortOrder: 1, name: 1 });

    if (!basicGroup) {
      basicGroup = await ClientGroup.create({
        name: DEFAULT_CLIENT_GROUP_NAME,
        slug: DEFAULT_CLIENT_GROUP_SLUG,
        isDefault: !defaultGroup,
        isActive: true,
        sortOrder: 0,
      });
    }

    if (!basicGroup.isActive) {
      basicGroup.isActive = true;
      await basicGroup.save();
    }

    if (!defaultGroup) {
      defaultGroup = basicGroup;
      if (!defaultGroup.isDefault) {
        defaultGroup.isDefault = true;
        await defaultGroup.save();
      }
    }

    await ClientGroup.updateMany(
      { _id: { $ne: defaultGroup._id }, isDefault: true },
      { $set: { isDefault: false } },
    );

    if (!defaultGroup.isActive) {
      defaultGroup.isActive = true;
      await defaultGroup.save();
    }

    return defaultGroup;
  }

  async initializeDefaults(): Promise<void> {
    await this.ensureDefaultClientGroup();
  }

  async listClientGroups(): Promise<IClientGroupDocument[]> {
    await this.ensureDefaultClientGroup();
    return ClientGroup.find().sort({ sortOrder: 1, name: 1 });
  }

  async buildUniqueClientGroupSlug(name: string, excludeId?: string): Promise<string> {
    return this.buildUniqueSlug(ClientGroup, name, excludeId);
  }

  async buildUniqueProductSlug(name: string, excludeId?: string): Promise<string> {
    return this.buildUniqueSlug(Product, name, excludeId);
  }

  async setDefaultClientGroup(groupId: string): Promise<void> {
    await ClientGroup.updateMany({}, { $set: { isDefault: false } });
    await ClientGroup.findByIdAndUpdate(groupId, { $set: { isDefault: true, isActive: true } });
  }

  async resolveClientGroupForContact(contactId: string): Promise<{
    group: IClientGroupDocument;
    usedFallback: boolean;
    defaultGroupSlug: string;
  }> {
    const defaultGroup = await this.ensureDefaultClientGroup();
    const contact = await Contact.findById(contactId).select("clientGroupId").lean();

    if (!contact?.clientGroupId) {
      return {
        group: defaultGroup,
        usedFallback: true,
        defaultGroupSlug: defaultGroup.slug,
      };
    }

    const assignedGroup = await ClientGroup.findById(contact.clientGroupId);
    if (!assignedGroup || !assignedGroup.isActive) {
      return {
        group: defaultGroup,
        usedFallback: true,
        defaultGroupSlug: defaultGroup.slug,
      };
    }

    return {
      group: assignedGroup,
      usedFallback: false,
      defaultGroupSlug: defaultGroup.slug,
    };
  }

  async buildProductMenuForContact(input: {
    contactId: string;
    category?: string;
    query?: string;
    productId?: string;
    includeInactive?: boolean;
    selectedOptionValueIds?: string[];
  }) {
    const { group, usedFallback, defaultGroupSlug } = await this.resolveClientGroupForContact(
      input.contactId,
    );
    const products = await this.listProducts({
      category: input.category,
      query: input.query,
      productId: input.productId,
      includeInactive: input.includeInactive,
    });

    const serializedProducts = products.map((product) =>
      this.serializeProductForClientGroup(product, group.slug, defaultGroupSlug, input.includeInactive),
    );

    const selectedProduct = input.productId
      ? serializedProducts.find((product) => product.id === input.productId)
      : undefined;

    const selectedOptionValueIds = input.selectedOptionValueIds ?? [];
    const quoteValidationErrors: string[] = [];
    let quote: {
      currency: string;
      total: number;
      breakdown: Array<{
        valueId: string;
        label: string;
        amount: number;
        pricingMode: "absolute" | "delta";
      }>;
    } | null = null;

    if (selectedProduct) {
      const availableValueIds = new Map<string, { groupName: string }>();
      for (const groupItem of selectedProduct.optionGroups) {
        for (const value of groupItem.values) {
          availableValueIds.set(value.id, { groupName: groupItem.name });
        }
      }

      const invalidSelections = selectedOptionValueIds.filter(
        (valueId) => !availableValueIds.has(valueId),
      );
      if (invalidSelections.length > 0) {
        quoteValidationErrors.push(
          `Unknown option value id(s): ${invalidSelections.join(", ")}`,
        );
      }

      for (const groupItem of selectedProduct.optionGroups) {
        const selectedInGroup = groupItem.values.filter((value) =>
          selectedOptionValueIds.includes(value.id),
        );

        if (groupItem.required && selectedInGroup.length === 0) {
          quoteValidationErrors.push(`Missing required selection for ${groupItem.name}`);
        }

        if (groupItem.selectionType === "single" && selectedInGroup.length > 1) {
          quoteValidationErrors.push(
            `Only one value can be selected for ${groupItem.name}`,
          );
        }
      }

      const canQuoteBaseOnly =
        selectedProduct.optionGroups.length === 0 && selectedOptionValueIds.length === 0;

      if (
        quoteValidationErrors.length === 0 &&
        (selectedOptionValueIds.length > 0 || canQuoteBaseOnly)
      ) {
        quote = {
          currency: selectedProduct.currency,
          ...calculateProductQuote(
            {
              basePriceByGroup: selectedProduct.basePriceByGroup,
              optionGroups: selectedProduct.optionGroups.map((groupItem) => ({
                pricingMode: groupItem.pricingMode,
                values: groupItem.values.map((value) => ({
                  id: value.id,
                  label: value.label,
                  priceByGroup: value.priceByGroup,
                })),
              })),
            },
            selectedOptionValueIds,
            group.slug,
            defaultGroupSlug,
          ),
        };
      }
    }

    return {
      clientGroup: {
        id: group._id.toString(),
        name: group.name,
        slug: group.slug,
        usedFallback,
      },
      products: serializedProducts,
      quote,
      quoteValidationErrors,
    };
  }

  async countContactsInClientGroup(groupId: string): Promise<number> {
    return Contact.countDocuments({ clientGroupId: groupId });
  }

  private async listProducts(filters: {
    category?: string;
    query?: string;
    productId?: string;
    includeInactive?: boolean;
  }) {
    const query: Record<string, unknown> = {};

    if (!filters.includeInactive) {
      query.isActive = true;
    }

    if (filters.productId) {
      query._id = filters.productId;
    }

    if (filters.category?.trim()) {
      query.category = filters.category.trim();
    }

    if (filters.query?.trim()) {
      const regex = new RegExp(filters.query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      query.$or = [{ name: regex }, { category: regex }, { description: regex }];
    }

    return Product.find(query).sort({ displayOrder: 1, name: 1 });
  }

  private serializeProductForClientGroup(
    product: IProductDocument,
    clientGroupSlug: string,
    defaultGroupSlug: string,
    includeInactive = false,
  ) {
    const basePriceByGroup = priceMapToRecord(product.basePriceByGroup);

    const images = Array.isArray(product.images) ? product.images : [];
    const storedPrimary =
      typeof product.primaryImageUrl === "string" ? product.primaryImageUrl.trim() : "";
    const primaryImageUrl =
      storedPrimary && images.includes(storedPrimary) ? storedPrimary : images[0];

    return {
      id: product._id.toString(),
      name: product.name,
      slug: product.slug,
      category: product.category || "",
      description: product.description || "",
      currency: product.currency,
      isActive: product.isActive,
      displayOrder: product.displayOrder,
      images,
      primaryImageUrl,
      variants: Array.isArray(product.variants)
        ? product.variants.map((variant) => ({
            id: variant.id,
            optionValueIds: Array.isArray(variant.optionValueIds) ? variant.optionValueIds : [],
            label: variant.label,
            isActive: variant.isActive,
            displayOrder: variant.displayOrder,
            onHand: variant.onHand,
            priceByGroup: priceMapToRecord(variant.priceByGroup),
            effectivePrice: resolvePriceByClientGroup(
              priceMapToRecord(variant.priceByGroup),
              clientGroupSlug,
              defaultGroupSlug,
            ),
          }))
        : [],
      basePriceByGroup,
      effectiveBasePrice: resolvePriceByClientGroup(
        basePriceByGroup,
        clientGroupSlug,
        defaultGroupSlug,
      ),
      optionGroups: product.optionGroups
        .filter((group) => includeInactive || group.values.some((value) => value.isActive))
        .map((group) => ({
          id: group.id,
          name: group.name,
          selectionType: group.selectionType,
          pricingMode: group.pricingMode,
          required: group.required,
          displayOrder: group.displayOrder,
          values: group.values
            .filter((value) => includeInactive || value.isActive)
            .map((value) => {
              const priceByGroup = priceMapToRecord(value.priceByGroup);
              return {
                id: value.id,
                label: value.label,
                description: value.description || "",
                isDefault: value.isDefault,
                isActive: value.isActive,
                displayOrder: value.displayOrder,
                priceByGroup,
                effectivePrice: resolvePriceByClientGroup(
                  priceByGroup,
                  clientGroupSlug,
                  defaultGroupSlug,
                ),
              };
            }),
        })),
    };
  }

  private async buildUniqueSlug(
    model: {
      findOne: (query: Record<string, unknown>) => {
        lean: () => Promise<unknown>;
      };
    },
    rawValue: string,
    excludeId?: string,
  ): Promise<string> {
    const baseSlug = slugifyCatalogValue(rawValue) || "item";
    let candidate = baseSlug;
    let suffix = 2;

    while (true) {
      const existing = await model.findOne({
        slug: candidate,
        ...(excludeId ? { _id: { $ne: excludeId } } : {}),
      }).lean();

      if (!existing) return candidate;

      candidate = `${baseSlug}-${suffix}`;
      suffix += 1;
    }
  }
}

export const catalogService = new CatalogService();
