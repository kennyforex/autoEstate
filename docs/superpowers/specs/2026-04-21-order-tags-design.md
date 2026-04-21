# Order Tags Design

## Summary

Add a dedicated order-tag system that is fully independent from chat/conversation tags.
Users should be able to create and edit order tags directly from the `Tags` section of the order form, then immediately assign them to the current order.

## Goals

- Keep order tags separate from chat tags at both the API and data-model levels.
- Allow users to create and edit order tags without leaving the order form.
- Preserve the existing chip-based selection UI for assigning tags to an order.
- Ensure inbox/chat tag behavior is unchanged.

## Non-Goals

- Refactoring the existing chat tag system.
- Building a separate order-tag management page outside the order form.
- Changing overall order creation or editing flow beyond the tags section.

## Current State

- `OrderForm` loads tags through the shared `tagsApi`.
- Orders store `tagIds`, and backend validation resolves those ids against the chat `Tag` model.
- Conversation and inbox UI also use the same tag resource.

This causes order tags and chat tags to be coupled, which does not match the intended product behavior.

## Proposed Design

### Backend

Add a dedicated `OrderTag` domain with its own model, controller, routes, and validation flow.

#### Data Model

Create a new `OrderTag` model with:

- `label: string`
- `color: string`
- timestamps

The shape should intentionally mirror the current tag structure where useful, but it must be a distinct collection and model from chat `Tag`.

#### API

Add dedicated endpoints under `/order-tags`:

- `GET /order-tags`
- `POST /order-tags`
- `PUT /order-tags/:id`
- `DELETE /order-tags/:id`

Behavior:

- List returns all order tags sorted by label.
- Create requires a non-empty trimmed label and color.
- Create rejects duplicate labels within order tags.
- Update supports label and color changes, with duplicate-label protection.
- Delete should be blocked when the tag is referenced by any existing order, returning a clear error response.

#### Orders Integration

Update order persistence and validation to reference `OrderTag` instead of chat `Tag`.

- `Order.tagIds` should reference the `OrderTag` model.
- Order create/update validation should resolve ids against `OrderTag`.
- Invalid or unrelated chat tag ids must not be accepted for orders.

This keeps the model boundary explicit and prevents accidental cross-use.

### Frontend

Add a dedicated order-tag client API and local order-form management flow.

#### Types and API

- Add a frontend `OrderTag` type.
- Add `orderTagsApi` with `list`, `create`, `update`, and `delete`.
- Keep existing `tagsApi` unchanged for inbox/chat usage.

#### Order Form UI

Keep the existing tag chip selector in the order form, but change it to use order tags only.

Within the order form `Tags` section:

- Show selectable order-tag chips for assignment to the current order.
- Add a `Create tag` action in the section.
- Add an edit affordance for each tag.
- Use a compact modal for create/edit instead of inline editing.

Recommended modal fields:

- `label`
- `color`

Behavior:

- Creating a tag updates the local tag list immediately.
- Newly created tags are auto-selected on the current order.
- Editing a tag updates the rendered chips immediately.
- Errors from create/edit/delete should be surfaced inline in the modal or section.

#### Delete Behavior

Deletion may be offered from the same modal or a per-tag menu, but the backend remains the source of truth.

Recommended behavior:

- Allow delete only as an explicit management action.
- If deletion is blocked because the tag is in use by orders, show the returned backend error clearly.

### UX Notes

- The create/edit affordance should be visible but secondary to tag assignment.
- The chip layout should remain quick to scan and tap.
- The form should not navigate away or force a full-page refresh after tag CRUD.

## Data Flow

1. `OrderForm` loads order tags from `/order-tags`.
2. User selects one or more order-tag chips, updating local `draft.tagIds`.
3. User creates a new tag from the tags section.
4. On success, the new tag is inserted into local state and auto-selected.
5. User edits an existing tag.
6. On success, local tag state updates and selected chips re-render immediately.
7. On order save, the form submits `tagIds` that correspond only to `OrderTag` records.

## Error Handling

- Empty tag label: reject client-side and server-side.
- Duplicate order-tag label: return a clear validation error.
- Invalid tag id on order save: reject server-side.
- Delete while tag is referenced by orders: reject with a clear message.
- Order-tag API failure: keep current form state intact and show an actionable error.

## Testing and Verification

### Backend

Add focused tests for:

- order-tag CRUD success paths
- duplicate-label rejection
- delete rejection when tag is in use
- order create/update validation against `OrderTag`

### Frontend

Verify:

- order form loads order tags from the dedicated API
- create tag updates the local list and auto-selects it
- edit tag updates the visible chip label/color
- selecting tags still updates the order payload correctly
- inbox/chat flows still use the existing `tagsApi`

## Risks

- Partial separation, where some order code still imports chat `Tag`, would reintroduce coupling.
- Deleting in-use tags without safeguards could leave inconsistent historical orders.
- Reusing too much generic naming in the frontend may make future maintenance confusing.

## Implementation Notes

- Prefer minimal, explicit duplication over a premature shared abstraction between chat tags and order tags.
- Preserve current order form layout and interaction patterns wherever possible.
- Keep this change scoped to the order-tag domain and order form UI.

## Open Decisions Resolved

- Order tags are a separate CRUD system: yes.
- Create/edit happens directly in the order form: yes.
- Create/edit uses a compact modal: yes.
- Newly created tags auto-select on the current order: yes.
- Delete should be blocked when the tag is in use: yes.

## Git Note

This spec is intentionally not committed automatically. Any commit should only happen if explicitly requested.