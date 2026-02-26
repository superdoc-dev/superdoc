# Document API

## Ownership boundary (manual vs generated)

- Manual source of truth:
  - `packages/document-api/src/**` (this folder)
  - `packages/document-api/scripts/**`
- Generated (not in git — run `pnpm run generate:all`):
  - `packages/document-api/generated/**`
- Generated (committed — Mintlify deploys from git):
  - `apps/docs/document-api/reference/**`
- Committed mixed-content file:
  - marker block in `apps/docs/document-api/overview.mdx`

Do not hand-edit generated files; regenerate via script.

## Non-Negotiables

- The Document API modules are engine-agnostic and must never parse or depend on ProseMirror directly.
- The Document API must not implement new engine-specific domain logic. It defines types/contracts and delegates to adapters.
- Adapters are engine-specific implementations (for `super-editor`, ProseMirror adapters) and may use engine internals and bridging logic to satisfy the API contract.
- The Document API must receive adapters via dependency injection.
- If a capability is missing, prefer adding an editor command. If a gap remains, put bridge logic in adapters, not in `document-api/*`.

## Packaging Assumptions (Internal Only)

- `@superdoc/document-api` is an internal workspace package (`"private": true`) with no external consumers.
- Package exports intentionally point to source files (no `dist` build output) to match the monorepo's source-resolution setup.
- This is valid only while all consumers resolve workspace source with the same conditions/tooling.
- If this package is ever published or consumed outside this monorepo resolution model, add a build step and export compiled JS + `.d.ts` from `dist`.

## Purpose

This package defines the Document API surface and type contracts. Editor-specific behavior
lives in adapter layers that map engine behavior into discovery envelopes and other API outputs.

## Selector Semantics

- For dual-context types (`sdt`, `image`), selectors without an explicit `kind` may return both block and inline matches.
- Set `kind: 'block'` or `kind: 'inline'` on `{ type: 'node' }` selectors when you need only one context.

## Find Result Contract

- `find` always returns `items` as discovery items.
- For text selectors (`{ type: 'text', ... }`), items include containing block addresses.
- Exact matched spans are returned in `items[*].context.textRanges` as `TextAddress`.
- Mutating operations should target `TextAddress` values from `items[*].context.textRanges`.
- `insert` supports canonical `TextAddress` targeting or default insertion point when target is omitted.
- Structural creation is exposed under `create.*` (for example `create.paragraph`), separate from text mutations.

## Adapter Error Convention

- Return diagnostics for query/content issues (invalid regex input, unknown selector types, unresolved `within` targets).
- Throw errors for engine capability/configuration failures (for example, required editor commands not being available).
- For mutating operations, failure outcomes must be non-applied outcomes.
  - `success: false` means the operation did not apply a durable document mutation.
  - If a mutation is applied, adapters must return success (or a typed partial/warning outcome when explicitly modeled) and must not throw a post-apply not-found error.

## Tracked-Change Semantics

- Tracking is operation-scoped (`changeMode: 'direct' | 'tracked'`), not global editor-mode state.
- `insert`, `replace`, `delete`, `format.apply`, and `create.paragraph`, `create.heading` may run in tracked mode.
- `trackChanges.*` (`list`, `get`, `decide`) is the review lifecycle namespace.
- `lists.insert` may run in tracked mode; `lists.setType|indent|outdent|restart|exit` are direct-only.

## List Namespace Semantics

- `lists.*` projects paragraph-based numbering into first-class `listItem` addresses.
- `ListItemAddress.nodeId` reuses the underlying paragraph node id directly.
- `lists.list({ within })` is inclusive when `within` itself is a list item.
- `lists.setType` normalizes deterministically to canonical defaults (`ordered` decimal / `bullet` default bullet).
- `lists.insert` returns `insertionPoint` at the inserted item start (`offset: 0`) even when text is provided.
- `lists.restart` returns `NO_OP` only when target is already the first item of its contiguous run and effectively starts at `1`.

Deterministic outcomes:
- Unknown tracked-change ids must fail with `TARGET_NOT_FOUND` at adapter level.
- `acceptAll`/`rejectAll` with no applicable changes must return `Receipt.failure.code = 'NO_OP'`.
- Missing tracked-change capabilities must fail with `CAPABILITY_UNAVAILABLE`.
- Text/format targets that cannot be resolved after remote edits must fail deterministically (`TARGET_NOT_FOUND` / `NO_OP`), never silently mutate the wrong range.
- Tracked entity IDs returned by mutation receipts (`insert` / `replace` / `delete`) and `create.paragraph.trackedChangeRefs` must match canonical IDs from `trackChanges.list`.
- `trackChanges.get` / `accept` / `reject` accept canonical IDs only.

## Common Workflows

The following examples show typical multi-step patterns using the Document API.

### Workflow: Find + Mutate

Locate text in the document and replace it:

```ts
const result = editor.doc.find({ type: 'text', pattern: 'foo' });
const target = result.items?.[0]?.context?.textRanges?.[0];
if (target) {
  editor.doc.replace({ target, text: 'bar' });
}
```

### Workflow: Tracked-Mode Insert

Insert text as a tracked change so reviewers can accept or reject it:

```ts
const receipt = editor.doc.insert(
  { text: 'new content' },
  { changeMode: 'tracked' },
);
// receipt.resolution.target contains the resolved insertion point
// receipt.inserted contains TrackedChangeAddress entries for the new change
```

### Workflow: Comment Thread Lifecycle

Add a comment, reply, then resolve the thread:

```ts
const target = result.items?.[0]?.context?.textRanges?.[0];
const createReceipt = editor.doc.comments.create({ target, text: 'Review this section.' });
// Use the comment ID from the receipt to reply
const comments = editor.doc.comments.list();
const thread = comments.items[0];
editor.doc.comments.create({ parentCommentId: thread.id, text: 'Looks good.' });
editor.doc.comments.patch({ commentId: thread.id, status: 'resolved' });
```

### Workflow: List Manipulation

Insert a list item, change its type, then indent it:

```ts
const lists = editor.doc.lists.list();
const firstItem = lists.items[0];
const insertResult = editor.doc.lists.insert({ target: firstItem.address, position: 'after', text: 'New item' });
if (insertResult.success) {
  editor.doc.lists.setType({ target: insertResult.item, kind: 'ordered' });
  editor.doc.lists.indent({ target: insertResult.item });
}
```

### Workflow: Capabilities-Aware Branching

Check what the editor supports before attempting mutations:

```ts
const caps = editor.doc.capabilities();
if (caps.operations['format.apply'].available) {
  editor.doc.format.apply({ target, inline: { bold: true } });
}
if (caps.global.trackChanges.enabled) {
  editor.doc.insert({ text: 'tracked' }, { changeMode: 'tracked' });
}
if (caps.operations['create.heading'].dryRun) {
  const preview = editor.doc.create.heading(
    { level: 2, text: 'Preview' },
    { dryRun: true },
  );
}
```

## Operation Reference

Each operation has a dedicated section below. Grouped by namespace.

### Core

### `find`

Search the document for nodes or text matching a selector. Returns discovery items via `items`. Text selectors include `items[*].context.textRanges` for precise span targeting.

- **Input**: `Selector | Query`
- **Output**: `FindOutput`
- **Mutates**: No
- **Idempotency**: idempotent

### `getNode`

Resolve a `NodeAddress` to full `NodeInfo` including typed properties (text content, attributes, node type). Throws `TARGET_NOT_FOUND` when the address is invalid.

- **Input**: `NodeAddress`
- **Output**: `NodeInfo`
- **Mutates**: No
- **Idempotency**: idempotent

### `getNodeById`

Resolve a block node by its unique `nodeId`. Optionally constrain by `nodeType`. Throws `TARGET_NOT_FOUND` when the ID is not found.

- **Input**: `GetNodeByIdInput` (`{ nodeId, nodeType? }`)
- **Output**: `NodeInfo`
- **Mutates**: No
- **Idempotency**: idempotent

### `getText`

Return the full plaintext content of the document.

- **Input**: `GetTextInput` (empty object)
- **Output**: `string`
- **Mutates**: No
- **Idempotency**: idempotent

### `info`

Return document summary metadata (block count, word count, character count).

- **Input**: `InfoInput` (empty object)
- **Output**: `DocumentInfo`
- **Mutates**: No
- **Idempotency**: idempotent

### `insert`

Insert text at a target location. When `target` is provided, inserts at that `TextAddress`. When omitted, the adapter resolves to the default insertion point (first paragraph start).

Supports dry-run and tracked mode.

- **Input**: `InsertInput` (`{ target?, text }`)
- **Options**: `MutationOptions` (`{ changeMode?, dryRun? }`)
- **Output**: `TextMutationReceipt`
- **Mutates**: Yes
- **Idempotency**: non-idempotent
- **Failure codes**: `INVALID_TARGET`, `NO_OP`

### `replace`

Replace text at a `TextAddress` target with new content. The target range must resolve to a valid span. Supports dry-run and tracked mode.

- **Input**: `ReplaceInput` (`{ target, text }`)
- **Options**: `MutationOptions` (`{ changeMode?, dryRun? }`)
- **Output**: `TextMutationReceipt`
- **Mutates**: Yes
- **Idempotency**: conditional
- **Failure codes**: `INVALID_TARGET`, `NO_OP`

### `delete`

Delete the text span covered by a `TextAddress` target. Supports dry-run and tracked mode.

- **Input**: `DeleteInput` (`{ target }`)
- **Options**: `MutationOptions` (`{ changeMode?, dryRun? }`)
- **Output**: `TextMutationReceipt`
- **Mutates**: Yes
- **Idempotency**: conditional
- **Failure codes**: `NO_OP`

### `blocks.delete`

Delete an entire block node (paragraph, heading, listItem, table, image, sdt) by its `BlockNodeAddress`. Throws pre-apply errors for missing, ambiguous, or unsupported targets. Direct-only. Supports dry-run.

- **Input**: `BlocksDeleteInput` (`{ target: BlockNodeAddress }`)
- **Options**: `MutationOptions` (`{ dryRun? }`)
- **Output**: `BlocksDeleteResult` (`{ success: true, deleted: BlockNodeAddress }`)
- **Mutates**: Yes
- **Idempotency**: conditional
- **Throws**: `TARGET_NOT_FOUND`, `AMBIGUOUS_TARGET`, `CAPABILITY_UNAVAILABLE`, `INVALID_TARGET`, `INTERNAL_ERROR`

### Capabilities

### `capabilities.get`

Return a runtime capability snapshot describing which operations, namespaces, tracked mode, and dry-run support are available in the current editor configuration.

- **Input**: `undefined`
- **Output**: `DocumentApiCapabilities`
- **Mutates**: No
- **Idempotency**: idempotent

### Create

### `create.paragraph`

Insert a new paragraph node at a specified location (document start/end, before/after a block). Returns the new paragraph's `BlockNodeAddress` and `insertionPoint`. Supports dry-run and tracked mode.

- **Input**: `CreateParagraphInput` (`{ at?, text? }`)
- **Options**: `MutationOptions` (`{ changeMode?, dryRun? }`)
- **Output**: `CreateParagraphResult`
- **Mutates**: Yes
- **Idempotency**: non-idempotent
- **Failure codes**: `INVALID_TARGET`

### `create.heading`

Insert a new heading node at a specified location with a given level (1-6). Returns the new heading's `BlockNodeAddress` and `insertionPoint`. Supports dry-run and tracked mode.

- **Input**: `CreateHeadingInput` (`{ level, at?, text? }`)
- **Options**: `MutationOptions` (`{ changeMode?, dryRun? }`)
- **Output**: `CreateHeadingResult`
- **Mutates**: Yes
- **Idempotency**: non-idempotent
- **Failure codes**: `INVALID_TARGET`

### Format

### `format.apply`

Apply explicit inline style changes (bold, italic, underline, strike) to a `TextAddress` range using boolean patch semantics. Supports dry-run and tracked mode. Availability depends on the corresponding marks being registered in the editor schema.

- **Input**: `StyleApplyInput` (`{ target, inline: { bold?, italic?, underline?, strike? } }`)
- **Options**: `MutationOptions` (`{ changeMode?, dryRun? }`)
- **Output**: `TextMutationReceipt`
- **Mutates**: Yes
- **Idempotency**: conditional
- **Failure codes**: `INVALID_TARGET`

### Lists

### `lists.list`

List all list items in the document, optionally filtered by `within`, `kind`, `level`, or `ordinal`. Supports pagination via `limit` and `offset`.

- **Input**: `ListsListQuery | undefined`
- **Output**: `ListsListResult` (`{ items, total }`)
- **Mutates**: No
- **Idempotency**: idempotent

### `lists.get`

Retrieve full information for a single list item by its `ListItemAddress`. Throws `TARGET_NOT_FOUND` when the address is invalid.

- **Input**: `ListsGetInput` (`{ address }`)
- **Output**: `ListItemInfo`
- **Mutates**: No
- **Idempotency**: idempotent

### `lists.insert`

Insert a new list item before or after a target item. Returns the new item's `ListItemAddress` and `insertionPoint`. Supports dry-run and tracked mode.

- **Input**: `ListInsertInput` (`{ target, position, text? }`)
- **Options**: `MutationOptions` (`{ changeMode?, dryRun? }`)
- **Output**: `ListsInsertResult`
- **Mutates**: Yes
- **Idempotency**: non-idempotent
- **Failure codes**: `INVALID_TARGET`

### `lists.setType`

Change a list item's kind (`ordered` or `bullet`). Returns `NO_OP` when the item already has the requested kind. Direct-only. Supports dry-run.

- **Input**: `ListSetTypeInput` (`{ target, kind }`)
- **Options**: `MutationOptions` (`{ dryRun? }`)
- **Output**: `ListsMutateItemResult`
- **Mutates**: Yes
- **Idempotency**: conditional
- **Failure codes**: `NO_OP`, `INVALID_TARGET`

### `lists.indent`

Increase the indent level of a list item. Returns `NO_OP` when already at maximum depth. Direct-only. Supports dry-run.

- **Input**: `ListTargetInput` (`{ target }`)
- **Options**: `MutationOptions` (`{ dryRun? }`)
- **Output**: `ListsMutateItemResult`
- **Mutates**: Yes
- **Idempotency**: conditional
- **Failure codes**: `NO_OP`, `INVALID_TARGET`

### `lists.outdent`

Decrease the indent level of a list item. Returns `NO_OP` when already at top level. Direct-only. Supports dry-run.

- **Input**: `ListTargetInput` (`{ target }`)
- **Options**: `MutationOptions` (`{ dryRun? }`)
- **Output**: `ListsMutateItemResult`
- **Mutates**: Yes
- **Idempotency**: conditional
- **Failure codes**: `NO_OP`, `INVALID_TARGET`

### `lists.restart`

Restart numbering for an ordered list item. Returns `NO_OP` when the item already starts a new numbering sequence. Direct-only. Supports dry-run.

- **Input**: `ListTargetInput` (`{ target }`)
- **Options**: `MutationOptions` (`{ dryRun? }`)
- **Output**: `ListsMutateItemResult`
- **Mutates**: Yes
- **Idempotency**: conditional
- **Failure codes**: `NO_OP`, `INVALID_TARGET`

### `lists.exit`

Convert a list item back into a plain paragraph, exiting the list. Supports dry-run. Direct-only.

- **Input**: `ListTargetInput` (`{ target }`)
- **Options**: `MutationOptions` (`{ dryRun? }`)
- **Output**: `ListsExitResult`
- **Mutates**: Yes
- **Idempotency**: conditional
- **Failure codes**: `INVALID_TARGET`

### Comments

### `comments.create`

Create a new comment thread or reply. When `parentCommentId` is provided, creates a reply. Otherwise creates a root comment anchored to the given text range.

- **Input**: `CommentsCreateInput` (`{ text, target?, parentCommentId? }`)
- **Output**: `Receipt`
- **Mutates**: Yes
- **Idempotency**: non-idempotent
- **Failure codes**: `INVALID_TARGET`

### `comments.patch`

Field-level patch on an existing comment. Exactly one mutation field must be provided per call.

- **Input**: `CommentsPatchInput` (`{ commentId, text?, target?, status?, isInternal? }`)
- **Output**: `Receipt`
- **Mutates**: Yes
- **Idempotency**: conditional
- **Failure codes**: `INVALID_INPUT`, `INVALID_TARGET`, `NO_OP`

### `comments.delete`

Remove a comment from the document.

- **Input**: `CommentsDeleteInput` (`{ commentId }`)
- **Output**: `Receipt`
- **Mutates**: Yes
- **Idempotency**: conditional
- **Failure codes**: `NO_OP`

### `comments.get`

Retrieve full information for a single comment by ID. Throws `TARGET_NOT_FOUND` when the comment is not found.

- **Input**: `GetCommentInput` (`{ commentId }`)
- **Output**: `CommentInfo`
- **Mutates**: No
- **Idempotency**: idempotent

### `comments.list`

List all comments in the document. Optionally include resolved comments.

- **Input**: `CommentsListQuery | undefined` (`{ includeResolved? }`)
- **Output**: `CommentsListResult` (`{ items, total }`)
- **Mutates**: No
- **Idempotency**: idempotent

### Track Changes

### `trackChanges.list`

List tracked changes in the document. Supports filtering by `type` and pagination via `limit`/`offset`.

- **Input**: `TrackChangesListInput | undefined` (`{ limit?, offset?, type? }`)
- **Output**: `TrackChangesListResult` (`{ items, total }`)
- **Mutates**: No
- **Idempotency**: idempotent

### `trackChanges.get`

Retrieve full information for a single tracked change by its canonical ID. Throws `TARGET_NOT_FOUND` when the ID is invalid.

- **Input**: `TrackChangesGetInput` (`{ id }`)
- **Output**: `TrackChangeInfo`
- **Mutates**: No
- **Idempotency**: idempotent

### `trackChanges.decide`

Accept or reject a tracked change by ID, or accept/reject all changes with `{ scope: 'all' }`.

- **Input**: `ReviewDecideInput` (`{ decision: 'accept' | 'reject', target: { id } | { scope: 'all' } }`)
- **Output**: `Receipt`
- **Mutates**: Yes
- **Idempotency**: conditional
- **Failure codes**: `NO_OP`, `TARGET_NOT_FOUND`
