# Order Tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated order-tag system with inline create/edit management on the order form, fully separated from conversation/chat tags.

**Architecture:** Add a new backend `OrderTag` resource that mirrors the existing tag shape but uses its own model, routes, and controller, then switch order persistence to reference `OrderTag` ids only. On the frontend, add a dedicated `OrderTag` type and API client, then replace the order-form tag selector with an order-tag manager modal that can create, edit, and delete tags in place.

**Tech Stack:** Express, Mongoose, express-validator, React, TypeScript, Vite, existing common `Modal`/`Button`/`Input` components, existing `tsx` script-style backend verification.

---

## File Structure

**Create**

- `backend/src/models/OrderTag.ts` - dedicated Mongoose model for order-only tags
- `backend/src/controllers/orderTag.controller.ts` - CRUD handlers for `/api/order-tags`
- `backend/src/routes/orderTag.routes.ts` - authenticated validation-wrapped order-tag routes
- `backend/src/scripts/test-order-tags.ts` - backend smoke/regression script using `assert`

**Modify**

- `backend/src/models/index.ts` - export `OrderTag`
- `backend/src/models/Order.ts` - change `tagIds` reference from `Tag` to `OrderTag`
- `backend/src/services/order.service.ts` - validate order `tagIds` against `OrderTag`
- `backend/src/routes/index.ts` - register `/order-tags`
- `frontend/src/lib/types.ts` - add `OrderTag` type and switch `Order.tagIds` meaning to order-tag ids
- `frontend/src/lib/api.ts` - add `orderTagsApi`, keep `tagsApi` unchanged
- `frontend/src/pages/OrderForm.tsx` - swap shared tags for order tags and add manage-tag modal
- `frontend/src/i18n/locales/en.json` - add order-tag UI copy
- `frontend/src/i18n/locales/zh-CN.json` - add order-tag UI copy
- `frontend/src/i18n/locales/zh-TW.json` - add order-tag UI copy

## Task 1: Add Backend Order-Tag CRUD Surface

**Files:**
- Create: `backend/src/models/OrderTag.ts`
- Create: `backend/src/controllers/orderTag.controller.ts`
- Create: `backend/src/routes/orderTag.routes.ts`
- Create: `backend/src/scripts/test-order-tags.ts`
- Modify: `backend/src/models/index.ts`
- Modify: `backend/src/routes/index.ts`

- [ ] **Step 1: Write the failing backend smoke script**

Create `backend/src/scripts/test-order-tags.ts` with the expected order-tag API surface and basic CRUD assertions. Before implementation, this should fail because `OrderTag` and its route/controller imports do not exist yet.

```ts
import assert from "node:assert/strict";
import mongoose from "mongoose";

import { OrderTag } from "../models/OrderTag.js";

const MONGODB_URI = process.env.MONGODB_URI;

async function run() {
  assert.ok(MONGODB_URI, "MONGODB_URI is required for test-order-tags");
  await mongoose.connect(MONGODB_URI!);

  await OrderTag.deleteMany({ label: /^spec-order-tag-/i });

  const beta = await OrderTag.create({
    label: "spec-order-tag-beta",
    color: "#10B981",
  });
  const alpha = await OrderTag.create({
    label: "spec-order-tag-alpha",
    color: "#3B82F6",
  });

  const sorted = await OrderTag.find({
    _id: { $in: [alpha._id, beta._id] },
  }).sort({ label: 1 });
  assert.deepEqual(
    sorted.map((tag) => tag.label),
    ["spec-order-tag-alpha", "spec-order-tag-beta"],
  );

  const updated = await OrderTag.findByIdAndUpdate(
    alpha._id,
    { label: "spec-order-tag-alpha-2", color: "#F59E0B" },
    { new: true },
  );
  assert.equal(updated?.label, "spec-order-tag-alpha-2");
  assert.equal(updated?.color, "#F59E0B");

  await OrderTag.deleteMany({
    label: {
      $in: ["spec-order-tag-alpha-2", "spec-order-tag-beta"],
    },
  });

  await mongoose.disconnect();
  console.log("Order tag CRUD smoke checks passed.");
}

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
```

- [ ] **Step 2: Run the smoke script to verify it fails**

Run:

```bash
cd backend && npx tsx src/scripts/test-order-tags.ts
```

Expected:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '../models/OrderTag.js'
```

- [ ] **Step 3: Write the minimal backend CRUD implementation**

Create `backend/src/models/OrderTag.ts`:

```ts
import mongoose, { Document, Schema } from "mongoose";

export interface IOrderTagDocument extends Document {
  _id: mongoose.Types.ObjectId;
  label: string;
  color: string;
  createdAt: Date;
  updatedAt: Date;
}

const orderTagSchema = new Schema<IOrderTagDocument>(
  {
    label: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    color: {
      type: String,
      required: true,
      default: "#3B82F6",
    },
  },
  { timestamps: true },
);

orderTagSchema.index({ label: 1 });

export const OrderTag =
  (mongoose.models.OrderTag as mongoose.Model<IOrderTagDocument> | undefined) ??
  mongoose.model<IOrderTagDocument>("OrderTag", orderTagSchema);
```

Create `backend/src/controllers/orderTag.controller.ts`:

```ts
import { NextFunction, Request, Response } from "express";
import { Order } from "../models/Order.js";
import { OrderTag } from "../models/OrderTag.js";

export async function listOrderTags(req: Request, res: Response, next: NextFunction) {
  try {
    const tags = await OrderTag.find().sort({ label: 1 });
    res.json({ tags });
  } catch (error) {
    next(error);
  }
}

export async function createOrderTag(req: Request, res: Response, next: NextFunction) {
  try {
    const label = String(req.body.label ?? "").trim();
    const color = String(req.body.color ?? "#3B82F6");

    const existing = await OrderTag.findOne({ label });
    if (existing) {
      res.status(400).json({ error: "Order tag with this label already exists" });
      return;
    }

    const tag = await OrderTag.create({ label, color });
    res.status(201).json({ tag });
  } catch (error) {
    next(error);
  }
}

export async function updateOrderTag(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const label = typeof req.body.label === "string" ? req.body.label.trim() : undefined;
    const color = typeof req.body.color === "string" ? req.body.color : undefined;

    if (label) {
      const duplicate = await OrderTag.findOne({ label, _id: { $ne: id } });
      if (duplicate) {
        res.status(400).json({ error: "Order tag with this label already exists" });
        return;
      }
    }

    const tag = await OrderTag.findByIdAndUpdate(
      id,
      {
        ...(label ? { label } : {}),
        ...(color ? { color } : {}),
      },
      { new: true },
    );

    if (!tag) {
      res.status(404).json({ error: "Order tag not found" });
      return;
    }

    res.json({ tag });
  } catch (error) {
    next(error);
  }
}

export async function deleteOrderTag(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;

    const inUse = await Order.exists({ tagIds: id });
    if (inUse) {
      res.status(400).json({ error: "Order tag is still used by existing orders" });
      return;
    }

    const tag = await OrderTag.findByIdAndDelete(id);
    if (!tag) {
      res.status(404).json({ error: "Order tag not found" });
      return;
    }

    res.json({ message: "Order tag deleted successfully" });
  } catch (error) {
    next(error);
  }
}
```

Create `backend/src/routes/orderTag.routes.ts`:

```ts
import { Router } from "express";
import { body, param } from "express-validator";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validation.middleware.js";
import * as orderTagController from "../controllers/orderTag.controller.js";

const router = Router();

router.use(authMiddleware);

router.get("/", orderTagController.listOrderTags);

router.post(
  "/",
  validate([
    body("label").trim().notEmpty().withMessage("Label is required"),
    body("color").optional().isHexColor().withMessage("Invalid color format"),
  ]),
  orderTagController.createOrderTag,
);

router.put(
  "/:id",
  validate([
    param("id").isMongoId().withMessage("Invalid order tag ID"),
    body("label").optional().trim().notEmpty().withMessage("Label cannot be empty"),
    body("color").optional().isHexColor().withMessage("Invalid color format"),
  ]),
  orderTagController.updateOrderTag,
);

router.delete(
  "/:id",
  validate([param("id").isMongoId().withMessage("Invalid order tag ID")]),
  orderTagController.deleteOrderTag,
);

export default router;
```

Update `backend/src/models/index.ts`:

```ts
export { OrderTag, type IOrderTagDocument } from "./OrderTag.js";
```

Update `backend/src/routes/index.ts`:

```ts
import orderTagRoutes from "./orderTag.routes.js";

router.use("/order-tags", orderTagRoutes);
```

- [ ] **Step 4: Run the smoke script and backend build**

Run:

```bash
cd backend && npx tsx src/scripts/test-order-tags.ts && npm run build
```

Expected:

```text
Order tag CRUD smoke checks passed.
...
Found 0 errors.
```

- [ ] **Step 5: Checkpoint**

Do **not** commit unless the user explicitly asks for one. Record that Task 1 leaves chat tags untouched and adds only a new order-tag resource.

## Task 2: Switch Orders to `OrderTag` and Add In-Use Delete Protection

**Files:**
- Modify: `backend/src/models/Order.ts`
- Modify: `backend/src/services/order.service.ts`
- Modify: `backend/src/scripts/test-order-tags.ts`

- [ ] **Step 1: Extend the smoke script with failing order-integration assertions**

Append these assertions to `backend/src/scripts/test-order-tags.ts` after the CRUD checks, before cleanup:

```ts
import { orderService } from "../services/order.service.js";
import { Tag } from "../models/Tag.js";

const sharedChatTag = await Tag.create({
  label: "spec-chat-tag-do-not-use",
  color: "#EF4444",
});

const orderTag = await OrderTag.create({
  label: "spec-order-tag-in-use",
  color: "#8B5CF6",
});

const order = await orderService.create({
  source: "manual",
  clientName: "Spec Customer",
  items: [
    {
      snapshot: { productName: "Spec Product" },
      quantity: 1,
      unitPrice: 88,
    },
  ],
  tagIds: [String(orderTag._id), String(sharedChatTag._id)],
});

assert.deepEqual(order.tagIds.map(String), [String(orderTag._id)]);

const inUse = await mongoose.connection
  .collection("orders")
  .findOne({ _id: order._id });
assert.ok(inUse, "Expected order record to exist");

const orderTagDeleteCheck = await mongoose.connection
  .collection("orders")
  .countDocuments({ tagIds: orderTag._id });
assert.equal(orderTagDeleteCheck, 1);
```

- [ ] **Step 2: Run the smoke script to verify it fails for the right reason**

Run:

```bash
cd backend && npx tsx src/scripts/test-order-tags.ts
```

Expected:

```text
AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal
```

The failure should show that order creation still accepts shared chat-tag ids or that orders still reference the wrong model.

- [ ] **Step 3: Update order persistence to use `OrderTag` only**

Update `backend/src/models/Order.ts`:

```ts
tagIds: { type: [Schema.Types.ObjectId], ref: "OrderTag", default: [] },
```

Update `backend/src/services/order.service.ts` imports:

```ts
import { Order, Contact, OrderTag, type IOrderDocument } from "../models/index.js";
```

Update create-path validation:

```ts
const tagIds = Array.isArray(input.tagIds)
  ? input.tagIds.filter((id) => isValidObjectId(id))
  : [];

const existingTags = tagIds.length
  ? await OrderTag.find({ _id: { $in: tagIds } }).select("_id")
  : [];
const existingTagIds = existingTags.map((t) => t._id);
```

Update update-path validation:

```ts
if (Array.isArray(input.tagIds)) {
  const tagIds = input.tagIds.filter((tid) => isValidObjectId(tid));
  const existingTags = tagIds.length
    ? await OrderTag.find({ _id: { $in: tagIds } }).select("_id")
    : [];
  order.tagIds = existingTags.map((t) => t._id) as unknown as never;
}
```

Finish the smoke script cleanup:

```ts
await mongoose.connection.collection("orders").deleteMany({
  clientName: "Spec Customer",
});
await Tag.deleteMany({ label: "spec-chat-tag-do-not-use" });
await OrderTag.deleteMany({
  label: { $in: ["spec-order-tag-in-use", "spec-order-tag-alpha-2", "spec-order-tag-beta"] },
});
```

- [ ] **Step 4: Run the smoke script, backend build, and lints**

Run:

```bash
cd backend && npx tsx src/scripts/test-order-tags.ts && npm run build && npm run lint
```

Expected:

```text
Order tag CRUD smoke checks passed.
...
Found 0 errors.
...
0 problems
```

- [ ] **Step 5: Checkpoint**

Do **not** commit unless the user explicitly asks for one. Confirm the backend boundary is now: conversations -> `Tag`, orders -> `OrderTag`.

## Task 3: Add Frontend Order-Tag Types, API, and Copy

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/i18n/locales/en.json`
- Modify: `frontend/src/i18n/locales/zh-CN.json`
- Modify: `frontend/src/i18n/locales/zh-TW.json`

- [ ] **Step 1: Write the failing type/API changes**

Update `frontend/src/lib/types.ts` with the intended new type:

```ts
export interface OrderTag {
  _id: string;
  label: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}
```

Update `frontend/src/lib/api.ts` imports:

```ts
import type {
  Tag,
  OrderTag,
  ClientGroup,
  Product,
  LoginCredentials,
  RegisterData,
  AuthResponse,
  PaginatedResponse,
  ContactWithStats,
  ScheduledJob,
  ScheduledJobRun,
  ScheduledJobsStats,
  Order,
  OrderListResponse,
} from "./types";
```

Add the intended client:

```ts
export const orderTagsApi = {
  list: async (): Promise<OrderTag[]> => {
    const { data } = await api.get("/order-tags");
    return data.tags || data;
  },
  create: async (tag: Partial<OrderTag>): Promise<OrderTag> => {
    const { data } = await api.post("/order-tags", tag);
    return data.tag || data;
  },
  update: async (id: string, updates: Partial<OrderTag>): Promise<OrderTag> => {
    const { data } = await api.put(`/order-tags/${id}`, updates);
    return data.tag || data;
  },
  delete: async (id: string): Promise<void> => {
    await api.delete(`/order-tags/${id}`);
  },
};
```

Add English keys under `ordersPage`, then mirror them in `zh-CN` and `zh-TW`:

```json
"tagManager": {
  "create": "Create tag",
  "edit": "Edit tag",
  "newTitle": "Create order tag",
  "editTitle": "Edit order tag",
  "label": "Tag name",
  "color": "Color",
  "save": "Save tag",
  "delete": "Delete tag",
  "deleteBlocked": "This tag is still used by existing orders.",
  "empty": "No order tags yet.",
  "autoSelected": "New tags are automatically selected for this order."
}
```

- [ ] **Step 2: Run the frontend build to verify it fails before `OrderForm` is updated**

Run:

```bash
cd frontend && npm run build
```

Expected:

```text
TS6133 / TS2304 / TS2322
```

Any failure is acceptable here as long as it comes from `OrderForm` still using `Tag`/`tagsApi` for order tags.

- [ ] **Step 3: Keep the API layer isolated from chat tags**

Make sure `tagsApi` remains unchanged and conversation/inbox files are not touched in this task. The final frontend type boundary should be:

```ts
import type { Tag, OrderTag } from "./types";
// Tag -> conversation/inbox
// OrderTag -> orders
```

- [ ] **Step 4: Run the frontend build again after type/API changes settle**

Run:

```bash
cd frontend && npm run build
```

Expected:

```text
Type errors now point only to `OrderForm.tsx` until Task 4 is complete.
```

- [ ] **Step 5: Checkpoint**

Do **not** commit unless the user explicitly asks for one. Confirm the frontend now has a dedicated `orderTagsApi` and translatable order-tag copy.

## Task 4: Replace the Order Form Tag Section with an Order-Tag Manager Modal

**Files:**
- Modify: `frontend/src/pages/OrderForm.tsx`
- Test/verify: `backend/src/scripts/test-order-tags.ts`

- [ ] **Step 1: Add the failing order-form state and event skeleton**

At the top of `frontend/src/pages/OrderForm.tsx`, switch imports:

```ts
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button, Input, Modal, Select, Textarea, Badge } from "../components/common";
import { clientGroupsApi, orderTagsApi, ordersApi, productsApi } from "../lib/api";
import type {
  ClientGroup,
  Order,
  OrderActivityEntry,
  OrderFulfillmentStatus,
  OrderItem,
  OrderPaymentStatus,
  OrderStatus,
  OrderTag,
  Product,
} from "../lib/types";
```

Add local state near the other hooks:

```ts
const [tags, setTags] = useState<OrderTag[]>([]);
const [tagModalOpen, setTagModalOpen] = useState(false);
const [editingTag, setEditingTag] = useState<OrderTag | null>(null);
const [tagLabelInput, setTagLabelInput] = useState("");
const [tagColorInput, setTagColorInput] = useState("#3B82F6");
const [tagSaving, setTagSaving] = useState(false);
const [tagDeleting, setTagDeleting] = useState(false);
const [tagError, setTagError] = useState<string | null>(null);
```

Extend the main loader:

```ts
const [p, tg, groups] = await Promise.all([
  productsApi.list(true),
  orderTagsApi.list(),
  clientGroupsApi.list(),
]);
```

This should still fail build because the UI and handlers are not yet wired.

- [ ] **Step 2: Run the frontend build to verify the order form is now the only failing area**

Run:

```bash
cd frontend && npm run build
```

Expected:

```text
Type errors centered on missing modal handlers or `Pencil` / `orderTagsApi` usage inside `OrderForm.tsx`
```

- [ ] **Step 3: Implement the order-tag manager modal and chip actions**

Add helpers in `OrderForm.tsx`:

```ts
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
    setTagError(t("ordersPage.tagManager.label"));
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
      setTags((current) =>
        current.map((tag) => (tag._id === updated._id ? updated : tag)),
      );
    } else {
      const created = await orderTagsApi.create({
        label,
        color: tagColorInput,
      });
      setTags((current) =>
        [...current, created].sort((a, b) => a.label.localeCompare(b.label)),
      );
      setDraft((current) => ({
        ...current,
        tagIds: [...new Set([...(current.tagIds || []), created._id])],
      }));
    }
    closeTagModal();
  } catch (e) {
    setTagError(e instanceof Error ? e.message : t("ordersPage.saveError"));
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
    setTags((current) => current.filter((tag) => tag._id !== editingTag._id));
    setDraft((current) => ({
      ...current,
      tagIds: (current.tagIds || []).filter((id) => id !== editingTag._id),
    }));
    closeTagModal();
  } catch (e) {
    setTagError(e instanceof Error ? e.message : t("ordersPage.tagManager.deleteBlocked"));
  } finally {
    setTagDeleting(false);
  }
};
```

Update the `Tags` section header so it exposes create affordance:

```tsx
<Section
  title={t("ordersPage.sections.tags")}
  headerContent={
    <Button variant="secondary" size="sm" onClick={openCreateTagModal}>
      <Plus className="w-4 h-4" />
      {t("ordersPage.tagManager.create")}
    </Button>
  }
>
```

Render chips with edit buttons:

```tsx
<div className="flex flex-wrap gap-2">
  {tags.map((tag) => {
    const selected = (draft.tagIds || []).includes(tag._id);
    return (
      <div
        key={tag._id}
        className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 ${
          selected
            ? "border-gray-900 text-gray-900 bg-white"
            : "border-gray-200 text-gray-600 bg-white"
        }`}
      >
        <button type="button" onClick={() => toggleTag(tag._id)} className="inline-flex items-center">
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
```

Render the modal near the bottom of the component:

```tsx
<Modal
  isOpen={tagModalOpen}
  onClose={closeTagModal}
  title={
    editingTag
      ? t("ordersPage.tagManager.editTitle")
      : t("ordersPage.tagManager.newTitle")
  }
  size="sm"
  footer={
    <>
      {editingTag ? (
        <Button variant="danger" onClick={deleteTag} isLoading={tagDeleting}>
          {t("ordersPage.tagManager.delete")}
        </Button>
      ) : null}
      <Button variant="ghost" onClick={closeTagModal}>
        {t("common.cancel")}
      </Button>
      <Button onClick={saveTag} isLoading={tagSaving}>
        {t("ordersPage.tagManager.save")}
      </Button>
    </>
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
      className="h-11 w-full"
    />
    {tagError ? <div className="text-sm text-red-600">{tagError}</div> : null}
  </div>
</Modal>
```

- [ ] **Step 4: Run full verification**

Run:

```bash
cd backend && npx tsx src/scripts/test-order-tags.ts && npm run build && npm run lint
```

Then run:

```bash
cd frontend && npm run build && npm run lint
```

Expected:

```text
Order tag CRUD smoke checks passed.
...
backend build passes
backend lint passes
frontend build passes
frontend lint passes
```

Manual verification checklist:

```text
1. Open /orders/new.
2. In Tags, create a new order tag.
3. Confirm the new tag appears immediately and is auto-selected.
4. Edit the tag label/color and confirm the chip updates immediately.
5. Save the order and reload it; confirm the selected order tag persists.
6. Open Inbox and confirm conversation tag management still behaves exactly as before.
7. Try deleting an order tag that is already used by a saved order; confirm the UI shows the backend error.
```

- [ ] **Step 5: Final checkpoint**

Do **not** commit unless the user explicitly asks for one. Summarize changed files, verification evidence, and any remaining migration follow-up if existing orders need historical tag migration.
