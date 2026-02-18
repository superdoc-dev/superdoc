# Document API

## Ownership boundary (manual vs generated)

- Manual source of truth:
  - `packages/document-api/src/**` (this folder)
  - `packages/document-api/scripts/**`
- Generated and committed:
  - `packages/document-api/generated/**`
  - `apps/docs/document-api/reference/**`
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
lives in adapter layers that map engine behavior into `QueryResult` and other API outputs.

## Selector Semantics

- For dual-context types (`sdt`, `image`), selectors without an explicit `kind` may return both block and inline matches.
- Set `kind: 'block'` or `kind: 'inline'` on `{ type: 'node' }` selectors when you need only one context.

## Find Result Contract

- `find` always returns `matches` as `NodeAddress[]`.
- For text selectors (`{ type: 'text', ... }`), `matches` are containing block addresses.
- Exact matched spans are returned in `context[*].textRanges` as `TextAddress`.
- Mutating operations should target `TextAddress` values from `context[*].textRanges`.
- `insert` also supports omitting `target`; adapters resolve a deterministic default insertion point (first paragraph start when available).
- Structural creation is exposed under `create.*` (for example `create.paragraph`), separate from text mutations.

## Adapter Error Convention

- Return diagnostics for query/content issues (invalid regex input, unknown selector types, unresolved `within` targets).
- Throw errors for engine capability/configuration failures (for example, required editor commands not being available).
- For mutating operations, failure outcomes must be non-applied outcomes.
  - `success: false` means the operation did not apply a durable document mutation.
  - If a mutation is applied, adapters must return success (or a typed partial/warning outcome when explicitly modeled) and must not throw a post-apply not-found error.

## Tracked-Change Semantics

- Tracking is operation-scoped (`changeMode: 'direct' | 'tracked'`), not global editor-mode state.
- `insert`, `replace`, `delete`, `format.bold`, `format.italic`, `format.underline`, `format.strikethrough`, and `create.paragraph`, `create.heading` may run in tracked mode.
- `trackChanges.*` (`list`, `get`, `accept`, `reject`, `acceptAll`, `rejectAll`) is the review lifecycle namespace.
- `lists.insert` may run in tracked mode; `lists.setType|indent|outdent|restart|exit` are direct-only in v1.

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
const result = editor.doc.find({ type: 'text', text: 'foo' });
const target = result.context?.[0]?.textRanges?.[0];
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
const target = result.context?.[0]?.textRanges?.[0];
const addReceipt = editor.doc.comments.add({ target, text: 'Review this section.' });
// Use the comment ID from the receipt to reply
const comments = editor.doc.comments.list();
const thread = comments.matches[0];
editor.doc.comments.reply({ parentCommentId: thread.commentId, text: 'Looks good.' });
editor.doc.comments.resolve({ commentId: thread.commentId });
```

### Workflow: List Manipulation

Insert a list item, change its type, then indent it:

```ts
const lists = editor.doc.lists.list();
const firstItem = lists.matches[0];
const insertResult = editor.doc.lists.insert({ target: firstItem, position: 'after', text: 'New item' });
if (insertResult.success) {
  editor.doc.lists.setType({ target: insertResult.item, kind: 'ordered' });
  editor.doc.lists.indent({ target: insertResult.item });
}
```

### Workflow: Capabilities-Aware Branching

Check what the editor supports before attempting mutations:

```ts
const caps = editor.doc.capabilities();
if (caps.operations['format.bold'].available) {
  editor.doc.format.bold({ target });
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

Search the document for nodes or text matching a selector. Returns `QueryResult` with `matches` as `NodeAddress[]`. Text selectors include `context[*].textRanges` for precise span targeting.

- **Input**: `Selector | Query`
- **Output**: `QueryResult`
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

Insert text at an optional `TextAddress` target. When `target` is omitted, the adapter resolves a deterministic default insertion point. Supports dry-run and tracked mode.

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

### `format.bold`

Toggle bold formatting on a `TextAddress` range. Supports dry-run and tracked mode. Availability depends on the `bold` mark being registered in the editor schema.

- **Input**: `FormatBoldInput` (`{ target }`)
- **Options**: `MutationOptions` (`{ changeMode?, dryRun? }`)
- **Output**: `TextMutationReceipt`
- **Mutates**: Yes
- **Idempotency**: conditional
- **Failure codes**: `INVALID_TARGET`

### `format.italic`

Toggle italic formatting on a `TextAddress` range. Supports dry-run and tracked mode. Availability depends on the `italic` mark being registered in the editor schema.

- **Input**: `FormatItalicInput` (`{ target }`)
- **Options**: `MutationOptions` (`{ changeMode?, dryRun? }`)
- **Output**: `TextMutationReceipt`
- **Mutates**: Yes
- **Idempotency**: conditional
- **Failure codes**: `INVALID_TARGET`

### `format.underline`

Toggle underline formatting on a `TextAddress` range. Supports dry-run and tracked mode. Availability depends on the `underline` mark being registered in the editor schema.

- **Input**: `FormatUnderlineInput` (`{ target }`)
- **Options**: `MutationOptions` (`{ changeMode?, dryRun? }`)
- **Output**: `TextMutationReceipt`
- **Mutates**: Yes
- **Idempotency**: conditional
- **Failure codes**: `INVALID_TARGET`

### `format.strikethrough`

Toggle strikethrough formatting on a `TextAddress` range. Supports dry-run and tracked mode. Availability depends on the `strike` mark being registered in the editor schema.

- **Input**: `FormatStrikethroughInput` (`{ target }`)
- **Options**: `MutationOptions` (`{ changeMode?, dryRun? }`)
- **Output**: `TextMutationReceipt`
- **Mutates**: Yes
- **Idempotency**: conditional
- **Failure codes**: `INVALID_TARGET`

### Lists

### `lists.list`

List all list items in the document, optionally filtered by `within`, `kind`, `level`, or `ordinal`. Supports pagination via `limit` and `offset`.

- **Input**: `ListsListQuery | undefined`
- **Output**: `ListsListResult` (`{ matches, total, items }`)
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

Change a list item's kind (`ordered` or `bullet`). Returns `NO_OP` when the item already has the requested kind. Direct-only (no tracked mode in v1). Supports dry-run.

- **Input**: `ListSetTypeInput` (`{ target, kind }`)
- **Options**: `MutationOptions` (`{ dryRun? }`)
- **Output**: `ListsMutateItemResult`
- **Mutates**: Yes
- **Idempotency**: conditional
- **Failure codes**: `NO_OP`, `INVALID_TARGET`

### `lists.indent`

Increase the indent level of a list item. Returns `NO_OP` when already at maximum depth. Direct-only (no tracked mode in v1). Supports dry-run.

- **Input**: `ListTargetInput` (`{ target }`)
- **Options**: `MutationOptions` (`{ dryRun? }`)
- **Output**: `ListsMutateItemResult`
- **Mutates**: Yes
- **Idempotency**: conditional
- **Failure codes**: `NO_OP`, `INVALID_TARGET`

### `lists.outdent`

Decrease the indent level of a list item. Returns `NO_OP` when already at top level. Direct-only (no tracked mode in v1). Supports dry-run.

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

### `comments.add`

Attach a new comment to a text range.

- **Input**: `AddCommentInput` (`{ target, text }`)
- **Output**: `Receipt`
- **Mutates**: Yes
- **Idempotency**: non-idempotent
- **Failure codes**: `INVALID_TARGET`, `NO_OP`

### `comments.edit`

Update the body text of an existing comment.

- **Input**: `EditCommentInput` (`{ commentId, text }`)
- **Output**: `Receipt`
- **Mutates**: Yes
- **Idempotency**: conditional
- **Failure codes**: `NO_OP`

### `comments.reply`

Add a reply to an existing comment thread.

- **Input**: `ReplyToCommentInput` (`{ parentCommentId, text }`)
- **Output**: `Receipt`
- **Mutates**: Yes
- **Idempotency**: non-idempotent
- **Failure codes**: `INVALID_TARGET`

### `comments.move`

Move a comment to a different text range.

- **Input**: `MoveCommentInput` (`{ commentId, target }`)
- **Output**: `Receipt`
- **Mutates**: Yes
- **Idempotency**: conditional
- **Failure codes**: `INVALID_TARGET`, `NO_OP`

### `comments.resolve`

Resolve an open comment, marking it as addressed.

- **Input**: `ResolveCommentInput` (`{ commentId }`)
- **Output**: `Receipt`
- **Mutates**: Yes
- **Idempotency**: conditional
- **Failure codes**: `NO_OP`

### `comments.remove`

Remove a comment from the document.

- **Input**: `RemoveCommentInput` (`{ commentId }`)
- **Output**: `Receipt`
- **Mutates**: Yes
- **Idempotency**: conditional
- **Failure codes**: `NO_OP`

### `comments.setInternal`

Set or clear the internal/private flag on a comment.

- **Input**: `SetCommentInternalInput` (`{ commentId, isInternal }`)
- **Output**: `Receipt`
- **Mutates**: Yes
- **Idempotency**: conditional
- **Failure codes**: `NO_OP`, `INVALID_TARGET`

### `comments.setActive`

Set which comment is currently active/focused. Pass `null` to clear.

- **Input**: `SetCommentActiveInput` (`{ commentId }`)
- **Output**: `Receipt`
- **Mutates**: Yes
- **Idempotency**: conditional
- **Failure codes**: `INVALID_TARGET`

### `comments.goTo`

Scroll to and focus a comment in the document.

- **Input**: `GoToCommentInput` (`{ commentId }`)
- **Output**: `Receipt`
- **Mutates**: No
- **Idempotency**: conditional

### `comments.get`

Retrieve full information for a single comment by ID. Throws `TARGET_NOT_FOUND` when the comment is not found.

- **Input**: `GetCommentInput` (`{ commentId }`)
- **Output**: `CommentInfo`
- **Mutates**: No
- **Idempotency**: idempotent

### `comments.list`

List all comments in the document. Optionally include resolved comments.

- **Input**: `CommentsListQuery | undefined` (`{ includeResolved? }`)
- **Output**: `CommentsListResult` (`{ matches, total }`)
- **Mutates**: No
- **Idempotency**: idempotent

### Track Changes

### `trackChanges.list`

List tracked changes in the document. Supports filtering by `type` and pagination via `limit`/`offset`.

- **Input**: `TrackChangesListInput | undefined` (`{ limit?, offset?, type? }`)
- **Output**: `TrackChangesListResult` (`{ matches, total, changes? }`)
- **Mutates**: No
- **Idempotency**: idempotent

### `trackChanges.get`

Retrieve full information for a single tracked change by its canonical ID. Throws `TARGET_NOT_FOUND` when the ID is invalid.

- **Input**: `TrackChangesGetInput` (`{ id }`)
- **Output**: `TrackChangeInfo`
- **Mutates**: No
- **Idempotency**: idempotent

### `trackChanges.accept`

Accept a tracked change, applying it permanently to the document. Returns `NO_OP` when the change has already been accepted.

- **Input**: `TrackChangesAcceptInput` (`{ id }`)
- **Output**: `Receipt`
- **Mutates**: Yes
- **Idempotency**: conditional
- **Failure codes**: `NO_OP`

### `trackChanges.reject`

Reject a tracked change, reverting it from the document. Returns `NO_OP` when the change has already been rejected.

- **Input**: `TrackChangesRejectInput` (`{ id }`)
- **Output**: `Receipt`
- **Mutates**: Yes
- **Idempotency**: conditional
- **Failure codes**: `NO_OP`

### `trackChanges.acceptAll`

Accept all tracked changes in the document. Returns `NO_OP` when there are no pending changes.

- **Input**: `TrackChangesAcceptAllInput` (empty object)
- **Output**: `Receipt`
- **Mutates**: Yes
- **Idempotency**: conditional
- **Failure codes**: `NO_OP`

### `trackChanges.rejectAll`

Reject all tracked changes in the document. Returns `NO_OP` when there are no pending changes.

- **Input**: `TrackChangesRejectAllInput` (empty object)
- **Output**: `Receipt`
- **Mutates**: Yes
- **Idempotency**: conditional
- **Failure codes**: `NO_OP`
