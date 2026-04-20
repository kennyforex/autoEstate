import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/layout";
import { Button, Input, Select, Textarea } from "../components/common";
import { clientGroupsApi, productsApi } from "../lib/api";
import type {
  ClientGroup,
  Product,
  ProductOptionGroup,
  ProductOptionValue,
  ProductPriceByGroup,
} from "../lib/types";

type ProductDraft = Omit<Product, "_id" | "createdAt" | "updatedAt" | "slug"> & {
  _id?: string;
};

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

const createEmptyProduct = (clientGroups: ClientGroup[]): ProductDraft => ({
  name: "",
  category: "",
  description: "",
  currency: "HKD",
  isActive: true,
  displayOrder: 0,
  basePriceByGroup: buildPriceMap(clientGroups),
  optionGroups: [createEmptyGroup(clientGroups)],
});

function hydrateProduct(product: Product, clientGroups: ClientGroup[]): ProductDraft {
  return {
    _id: product._id,
    name: product.name,
    category: product.category || "",
    description: product.description || "",
    currency: product.currency || "HKD",
    isActive: product.isActive,
    displayOrder: product.displayOrder,
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

export const Products: React.FC = () => {
  const [clientGroups, setClientGroups] = useState<ClientGroup[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedProduct = useMemo(
    () => products.find((product) => product._id === draft?._id),
    [products, draft?._id],
  );

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [groupResult, productResult] = await Promise.all([
        clientGroupsApi.list(),
        productsApi.list(true),
      ]);
      setClientGroups(groupResult);
      setProducts(productResult);

      if (!draft) {
        if (productResult.length > 0) {
          setDraft(hydrateProduct(productResult[0], groupResult));
        } else {
          setDraft(createEmptyProduct(groupResult));
        }
      }
    } catch (err) {
      console.error("Failed to load products:", err);
      setError("Failed to load product catalog.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const resetDraft = () => {
    setDraft(createEmptyProduct(clientGroups));
    setError(null);
  };

  const startEdit = (product: Product) => {
    setDraft(hydrateProduct(product, clientGroups));
    setError(null);
  };

  const updateDraft = (updater: (current: ProductDraft) => ProductDraft) => {
    setDraft((current) => (current ? updater(current) : current));
  };

  const updateBasePrice = (slug: string, nextValue: string) => {
    updateDraft((current) => ({
      ...current,
      basePriceByGroup: {
        ...current.basePriceByGroup,
        [slug]: Number(nextValue || 0),
      },
    }));
  };

  const addGroup = () => {
    updateDraft((current) => ({
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

  const addValue = (groupIndex: number) => {
    updateDraft((current) => ({
      ...current,
      optionGroups: current.optionGroups.map((group, index) =>
        index === groupIndex
          ? {
              ...group,
              values: [
                ...group.values,
                {
                  ...createEmptyValue(clientGroups),
                  displayOrder: group.values.length,
                },
              ],
            }
          : group,
      ),
    }));
  };

  const removeGroup = (groupIndex: number) => {
    updateDraft((current) => ({
      ...current,
      optionGroups: current.optionGroups.filter((_, index) => index !== groupIndex),
    }));
  };

  const removeValue = (groupIndex: number, valueIndex: number) => {
    updateDraft((current) => ({
      ...current,
      optionGroups: current.optionGroups.map((group, index) =>
        index === groupIndex
          ? {
              ...group,
              values: group.values.filter((_, itemIndex) => itemIndex !== valueIndex),
            }
          : group,
      ),
    }));
  };

  const handleSave = async () => {
    if (!draft) return;
    setIsSaving(true);
    setError(null);
    try {
      if (draft._id) {
        await productsApi.update(draft._id, draft);
      } else {
        await productsApi.create(draft);
      }
      await loadData();
      if (!draft._id) {
        resetDraft();
      }
    } catch (err: any) {
      console.error("Failed to save product:", err);
      setError(err?.response?.data?.error || "Failed to save product.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!draft?._id) return;
    const confirmed = window.confirm(`Delete product "${draft.name}"?`);
    if (!confirmed) return;

    setError(null);
    try {
      await productsApi.delete(draft._id);
      setDraft(createEmptyProduct(clientGroups));
      await loadData();
    } catch (err: any) {
      console.error("Failed to delete product:", err);
      setError(err?.response?.data?.error || "Failed to delete product.");
    }
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <PageHeader
          title="Products"
          subtitle="Build the menu once, then let skills fetch it with group-specific pricing."
          actions={
            <>
              <Link to="/client-groups">
                <Button variant="outline">Manage Client Groups</Button>
              </Link>
              <Button variant="outline" onClick={resetDraft}>
                New Product
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
              <h2 className="text-sm font-semibold text-gray-900">Catalog</h2>
            </div>
            {isLoading ? (
              <div className="px-4 py-10 text-sm text-gray-500">Loading products...</div>
            ) : products.length === 0 ? (
              <div className="px-4 py-10 text-sm text-gray-500">No products yet.</div>
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
                      {product.category || "Uncategorized"}
                      {product.isActive ? " • Active" : " • Inactive"}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {draft && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  label="Product name"
                  value={draft.name}
                  onChange={(e) =>
                    updateDraft((current) => ({ ...current, name: e.target.value }))
                  }
                  placeholder="Signature Mille Crepe"
                />
                <Input
                  label="Category"
                  value={draft.category}
                  onChange={(e) =>
                    updateDraft((current) => ({ ...current, category: e.target.value }))
                  }
                  placeholder="Cake"
                />
                <Input
                  label="Currency"
                  value={draft.currency}
                  onChange={(e) =>
                    updateDraft((current) => ({
                      ...current,
                      currency: e.target.value.toUpperCase(),
                    }))
                  }
                />
                <Input
                  label="Display order"
                  type="number"
                  value={draft.displayOrder}
                  onChange={(e) =>
                    updateDraft((current) => ({
                      ...current,
                      displayOrder: Number(e.target.value || 0),
                    }))
                  }
                />
              </div>

              <Textarea
                label="Description"
                rows={3}
                value={draft.description}
                onChange={(e) =>
                  updateDraft((current) => ({ ...current, description: e.target.value }))
                }
                placeholder="Shown to tools and admin users."
              />

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={draft.isActive}
                  onChange={(e) =>
                    updateDraft((current) => ({ ...current, isActive: e.target.checked }))
                  }
                />
                Product is active
              </label>

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">Base price by client group</h3>
                  <p className="text-xs text-gray-500">
                    Use base price when the product itself has a starting price.
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  {clientGroups.map((group) => (
                    <Input
                      key={group._id}
                      label={group.name}
                      type="number"
                      value={draft.basePriceByGroup[group.slug] ?? 0}
                      onChange={(e) => updateBasePrice(group.slug, e.target.value)}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Option groups</h3>
                    <p className="text-xs text-gray-500">
                      Set `absolute` for size-based prices and `delta` for add-ons.
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={addGroup}>
                    Add Group
                  </Button>
                </div>

                {draft.optionGroups.map((group, groupIndex) => (
                  <div key={`${group.id || "group"}-${groupIndex}`} className="rounded-xl border border-gray-200 p-4 space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="grid flex-1 gap-4 md:grid-cols-2">
                        <Input
                          label="Group name"
                          value={group.name}
                          onChange={(e) =>
                            updateDraft((current) => ({
                              ...current,
                              optionGroups: current.optionGroups.map((item, index) =>
                                index === groupIndex ? { ...item, name: e.target.value } : item,
                              ),
                            }))
                          }
                          placeholder="Flavour"
                        />
                        <Input
                          label="Display order"
                          type="number"
                          value={group.displayOrder}
                          onChange={(e) =>
                            updateDraft((current) => ({
                              ...current,
                              optionGroups: current.optionGroups.map((item, index) =>
                                index === groupIndex
                                  ? { ...item, displayOrder: Number(e.target.value || 0) }
                                  : item,
                              ),
                            }))
                          }
                        />
                        <Select
                          label="Selection type"
                          value={group.selectionType}
                          onChange={(value) =>
                            updateDraft((current) => ({
                              ...current,
                              optionGroups: current.optionGroups.map((item, index) =>
                                index === groupIndex
                                  ? {
                                      ...item,
                                      selectionType: value as ProductOptionGroup["selectionType"],
                                    }
                                  : item,
                              ),
                            }))
                          }
                          options={[
                            { value: "single", label: "Single" },
                            { value: "multiple", label: "Multiple" },
                          ]}
                        />
                        <Select
                          label="Pricing mode"
                          value={group.pricingMode}
                          onChange={(value) =>
                            updateDraft((current) => ({
                              ...current,
                              optionGroups: current.optionGroups.map((item, index) =>
                                index === groupIndex
                                  ? {
                                      ...item,
                                      pricingMode: value as ProductOptionGroup["pricingMode"],
                                    }
                                  : item,
                              ),
                            }))
                          }
                          options={[
                            { value: "delta", label: "Delta (+)" },
                            { value: "absolute", label: "Absolute price" },
                          ]}
                        />
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => removeGroup(groupIndex)}>
                        Remove Group
                      </Button>
                    </div>

                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={group.required}
                        onChange={(e) =>
                          updateDraft((current) => ({
                            ...current,
                            optionGroups: current.optionGroups.map((item, index) =>
                              index === groupIndex
                                ? { ...item, required: e.target.checked }
                                : item,
                            ),
                          }))
                        }
                      />
                      Required
                    </label>

                    <div className="space-y-3">
                      {group.values.map((value, valueIndex) => (
                        <div
                          key={`${value.id || "value"}-${valueIndex}`}
                          className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3"
                        >
                          <div className="grid gap-4 lg:grid-cols-[1.2fr_1.2fr_120px_120px]">
                            <Input
                              label="Value label"
                              value={value.label}
                              onChange={(e) =>
                                updateDraft((current) => ({
                                  ...current,
                                  optionGroups: current.optionGroups.map((item, index) =>
                                    index === groupIndex
                                      ? {
                                          ...item,
                                          values: item.values.map((entry, entryIndex) =>
                                            entryIndex === valueIndex
                                              ? { ...entry, label: e.target.value }
                                              : entry,
                                          ),
                                        }
                                      : item,
                                  ),
                                }))
                              }
                              placeholder="Matcha"
                            />
                            <Input
                              label="Description"
                              value={value.description || ""}
                              onChange={(e) =>
                                updateDraft((current) => ({
                                  ...current,
                                  optionGroups: current.optionGroups.map((item, index) =>
                                    index === groupIndex
                                      ? {
                                          ...item,
                                          values: item.values.map((entry, entryIndex) =>
                                            entryIndex === valueIndex
                                              ? { ...entry, description: e.target.value }
                                              : entry,
                                          ),
                                        }
                                      : item,
                                  ),
                                }))
                              }
                            />
                            <Input
                              label="Order"
                              type="number"
                              value={value.displayOrder}
                              onChange={(e) =>
                                updateDraft((current) => ({
                                  ...current,
                                  optionGroups: current.optionGroups.map((item, index) =>
                                    index === groupIndex
                                      ? {
                                          ...item,
                                          values: item.values.map((entry, entryIndex) =>
                                            entryIndex === valueIndex
                                              ? {
                                                  ...entry,
                                                  displayOrder: Number(e.target.value || 0),
                                                }
                                              : entry,
                                          ),
                                        }
                                      : item,
                                  ),
                                }))
                              }
                            />
                            <div className="flex items-end">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:bg-red-50"
                                onClick={() => removeValue(groupIndex, valueIndex)}
                              >
                                Remove
                              </Button>
                            </div>
                          </div>

                          <div className="grid gap-4 md:grid-cols-3">
                            {clientGroups.map((clientGroup) => (
                              <Input
                                key={clientGroup._id}
                                label={clientGroup.name}
                                type="number"
                                value={value.priceByGroup[clientGroup.slug] ?? 0}
                                onChange={(e) =>
                                  updateDraft((current) => ({
                                    ...current,
                                    optionGroups: current.optionGroups.map((item, index) =>
                                      index === groupIndex
                                        ? {
                                            ...item,
                                            values: item.values.map((entry, entryIndex) =>
                                              entryIndex === valueIndex
                                                ? {
                                                    ...entry,
                                                    priceByGroup: {
                                                      ...entry.priceByGroup,
                                                      [clientGroup.slug]: Number(
                                                        e.target.value || 0,
                                                      ),
                                                    },
                                                  }
                                                : entry,
                                            ),
                                          }
                                        : item,
                                    ),
                                  }))
                                }
                              />
                            ))}
                          </div>

                          <div className="flex gap-4 text-sm text-gray-700">
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={value.isDefault}
                                onChange={(e) =>
                                  updateDraft((current) => ({
                                    ...current,
                                    optionGroups: current.optionGroups.map((item, index) =>
                                      index === groupIndex
                                        ? {
                                            ...item,
                                            values: item.values.map((entry, entryIndex) =>
                                              entryIndex === valueIndex
                                                ? { ...entry, isDefault: e.target.checked }
                                                : entry,
                                            ),
                                          }
                                        : item,
                                    ),
                                  }))
                                }
                              />
                              Default
                            </label>
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={value.isActive}
                                onChange={(e) =>
                                  updateDraft((current) => ({
                                    ...current,
                                    optionGroups: current.optionGroups.map((item, index) =>
                                      index === groupIndex
                                        ? {
                                            ...item,
                                            values: item.values.map((entry, entryIndex) =>
                                              entryIndex === valueIndex
                                                ? { ...entry, isActive: e.target.checked }
                                                : entry,
                                            ),
                                          }
                                        : item,
                                    ),
                                  }))
                                }
                              />
                              Active
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>

                    <Button size="sm" variant="outline" onClick={() => addValue(groupIndex)}>
                      Add Value
                    </Button>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  isLoading={isSaving}
                  onClick={handleSave}
                  disabled={!draft.name.trim() || clientGroups.length === 0}
                >
                  Save Product
                </Button>
                <Button variant="ghost" onClick={resetDraft}>
                  Clear
                </Button>
                {selectedProduct && (
                  <Button variant="ghost" className="text-red-600 hover:bg-red-50" onClick={handleDelete}>
                    Delete
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Products;
