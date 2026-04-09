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
- For `find`, set `kind: 'block'` or `kind: 'inline'` on `{ type: 'node' }` selectors when you need only one context.

## Find Result Contract

- `find` always returns `SDFindResult` with `items: SDNodeResult[]`.
- Each item has `{ node, address }`, where `address` is a `NodeAddress`.
- For precise mutation targeting, use `query.match`, which returns a canonical `SelectionTarget`, block addresses, and block/range metadata.
- `insert` accepts text input with an optional `SelectionTarget` or `ref`, or structural content with an optional `BlockNodeAddress` target. Omitting both `target` and `ref` appends text at the end of the document.
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
- `lists.insert` may run in tracked mode; all other `lists.*` mutations are direct-only.

## List Namespace Semantics

- `lists.*` projects paragraph-based numbering into first-class `listItem` addresses.
- `ListItemAddress.nodeId` reuses the underlying paragraph node id directly.
- `lists.list({ within })` is inclusive when `within` itself is a list item.
- `lists.insert` returns `insertionPoint` at the inserted item start (`offset: 0`) even when text is provided.
- `lists.create` supports two modes: `empty` (convert a single paragraph) and `fromParagraphs` (convert a range).
- `lists.attach` adds paragraphs to an existing list by inheriting the `attachTo` item's `numId`.
- `lists.join` merges adjacent sequences sharing the same `abstractNumId`; fails with `INCOMPATIBLE_DEFINITIONS` otherwise.
- `lists.separate` splits a sequence at the target, creating a new `numId` pointing to the same abstract.
- `lists.setValue` on a mid-sequence target atomically separates then sets `startOverride`.
- `lists.continuePrevious` merges the target's sequence into the nearest previous compatible sequence.
- `lists.setLevelRestart` supports `scope: 'definition'` (mutates abstract) or `scope: 'instance'` (uses `lvlOverride`).

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

Locate text in the document and replace the first exact match:

```ts
const match = editor.doc.query.match({
  select: { type: 'text', pattern: 'foo' },
  require: 'first',
});

const target = match.items?.[0]?.target;
if (target) {
  editor.doc.replace({
    target,
    text: 'bar',
  });
}
```

### Workflow: Tracked-Mode Insert

Insert text as a tracked change so reviewers can accept or reject it:

```ts
const receipt = editor.doc.insert(
  { value: 'new content' },
  { changeMode: 'tracked' },
);
// receipt.resolution.target contains the resolved insertion point
// receipt.success tells you whether the tracked insert applied
```

### Workflow: Comment Thread Lifecycle

Add a comment, reply, then resolve the thread:

```ts
const match = editor.doc.query.match({
  select: { type: 'text', pattern: 'Review this section' },
  require: 'first',
});
const firstBlock = match.items?.[0]?.blocks?.[0];
if (!firstBlock) return;

const target = {
  kind: 'text',
  blockId: firstBlock.blockId,
  range: { start: firstBlock.range.start, end: firstBlock.range.end },
};

const createReceipt = editor.doc.comments.create({ target, text: 'Review this section.' });
// Use the comment ID from the receipt to reply
const comments = editor.doc.comments.list();
const thread = comments.items[0];
editor.doc.comments.create({ parentCommentId: thread.id, text: 'Looks good.' });
editor.doc.comments.patch({ commentId: thread.id, status: 'resolved' });
```

### Workflow: List Manipulation

Create a list, insert an item, then indent it:

```ts
// Convert a paragraph into a new ordered list
const paragraphMatch = editor.doc.query.match({
  select: { type: 'node', nodeType: 'paragraph' },
  require: 'first',
});
const target = paragraphMatch.items[0]?.address;
const createResult = editor.doc.lists.create({ mode: 'empty', at: target, kind: 'ordered' });

// Insert a new item after the first
const lists = editor.doc.lists.list();
const firstItem = lists.items[0];
const insertResult = editor.doc.lists.insert({ target: firstItem.address, position: 'after', text: 'New item' });
if (insertResult.success) {
  editor.doc.lists.indent({ target: insertResult.item });
}
```

### Workflow: Capabilities-Aware Branching

Check what the editor supports before attempting mutations:

```ts
const caps = editor.doc.capabilities();
if (caps.operations['format.apply'].available) {
  editor.doc.format.apply({ target, inline: { bold: 'on' } });
}
if (caps.global.trackChanges.enabled) {
  editor.doc.insert({ value: 'tracked' }, { changeMode: 'tracked' });
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

Search the document for nodes or text matching an SDM/1 selector. Returns paginated `items` where each item is an `SDNodeResult` (`{ node, address }`).

- **Input**: `SDFindInput`
- **Output**: `SDFindResult`
- **Mutates**: No
- **Idempotency**: idempotent

### `getNode`

Resolve a `NodeAddress` to an `SDNodeResult` envelope with projected SDM/1 node and canonical address. Throws `TARGET_NOT_FOUND` when the address is invalid.

- **Input**: `NodeAddress`
- **Output**: `SDNodeResult`
- **Mutates**: No
- **Idempotency**: idempotent

### `getNodeById`

Resolve a block node by its unique `nodeId`. Optionally constrain by `nodeType`. Throws `TARGET_NOT_FOUND` when the ID is not found.

- **Input**: `GetNodeByIdInput` (`{ nodeId, nodeType? }`)
- **Output**: `SDNodeResult`
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

Insert content into the document. Text input inserts at an optional `SelectionTarget` or `ref`, or appends at the end of the document when both are omitted. Structural content inserts relative to an optional `BlockNodeAddress` using `placement`.

Supports dry-run and tracked mode.

- **Input**: `InsertInput` (`{ value, type?, target: SelectionTarget } | { value, type?, ref: string } | { value, type? } | { content, target?: BlockNodeAddress, placement?, nestingPolicy? }`)
- **Options**: `MutationOptions` (`{ changeMode?, dryRun? }`)
- **Output**: `SDMutationReceipt`
- **Mutates**: Yes
- **Idempotency**: non-idempotent
- **Failure codes**: see the generated reference docs for the full text vs. structural failure surface

### `replace`

Replace content at a contiguous selection. Text replacement accepts `SelectionTarget` or `ref`. Structural replacement accepts `BlockNodeAddress`, `SelectionTarget`, or `ref` with `content`. Supports dry-run and tracked mode.

- **Input**: `ReplaceInput` (`{ target: SelectionTarget, text } | { ref: string, text } | { target: BlockNodeAddress | SelectionTarget, content, nestingPolicy? } | { ref: string, content, nestingPolicy? }`)
- **Options**: `MutationOptions` (`{ changeMode?, dryRun? }`)
- **Output**: `SDMutationReceipt`
- **Mutates**: Yes
- **Idempotency**: conditional
- **Failure codes**: see the generated reference docs for the full text vs. structural failure surface

### `delete`

Delete content at a contiguous selection. Accepts either an explicit `SelectionTarget` or a mutation-ready `ref`. Supports dry-run and tracked mode.

- **Input**: `DeleteInput` (`{ target: SelectionTarget, behavior?: 'selection' | 'exact' } | { ref: string, behavior?: 'selection' | 'exact' }`)
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

Apply explicit inline style changes (bold, italic, underline, strike) to a contiguous selection using directive semantics (`'on'`, `'off'`, `'clear'`). Accepts a `SelectionTarget` or `ref`. Supports dry-run and tracked mode. Availability depends on the corresponding marks being registered in the editor schema.

- **Input**: `StyleApplyInput` (`{ target: SelectionTarget, inline: { bold?, italic?, underline?, strike? } } | { ref: string, inline: { bold?, italic?, underline?, strike? } }`)
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

### `lists.create`

Create a new list from one or more paragraphs. Two modes: `empty` (convert a single paragraph at `at`) or `fromParagraphs` (convert a `BlockAddress` or `BlockRange`). Creates a new `numId` + `abstractNum` definition for the requested `kind`. Direct-only. Supports dry-run.

- **Input**: `ListsCreateInput` (`{ mode: 'empty', at, kind, level? } | { mode: 'fromParagraphs', target, kind, level? }`)
- **Options**: `MutationOptions` (`{ dryRun? }`)
- **Output**: `ListsCreateResult`
- **Mutates**: Yes
- **Idempotency**: non-idempotent
- **Failure codes**: `INVALID_TARGET`

### `lists.attach`

Attach non-list paragraphs to an existing list. Target paragraphs inherit the `attachTo` item's `numId`. Direct-only. Supports dry-run.

- **Input**: `ListsAttachInput` (`{ target, attachTo, level? }`)
- **Options**: `MutationOptions` (`{ dryRun? }`)
- **Output**: `ListsMutateItemResult`
- **Mutates**: Yes
- **Idempotency**: non-idempotent
- **Failure codes**: `INVALID_TARGET`, `NO_OP`

### `lists.detach`

Remove numbering properties from targeted list items, converting them back to plain paragraphs. Preserves text and non-list formatting. Direct-only. Supports dry-run.

- **Input**: `ListsDetachInput` (`{ target }`)
- **Options**: `MutationOptions` (`{ dryRun? }`)
- **Output**: `ListsDetachResult`
- **Mutates**: Yes
- **Idempotency**: conditional (re-detach is no-op)
- **Failure codes**: `INVALID_TARGET`

### `lists.join`

Merge two adjacent list sequences. `withPrevious` merges the target's sequence into the preceding one; `withNext` merges the following sequence into the target's. Requires both sequences to share the same `abstractNumId`. Direct-only. Supports dry-run.

- **Input**: `ListsJoinInput` (`{ target, direction: 'withPrevious' | 'withNext' }`)
- **Options**: `MutationOptions` (`{ dryRun? }`)
- **Output**: `ListsJoinResult`
- **Mutates**: Yes
- **Idempotency**: non-idempotent
- **Failure codes**: `INVALID_TARGET`, `NO_ADJACENT_SEQUENCE`, `INCOMPATIBLE_DEFINITIONS`, `ALREADY_SAME_SEQUENCE`

### `lists.canJoin`

Read-only preflight check for `lists.join`. Returns whether two adjacent sequences can be joined.

- **Input**: `ListsCanJoinInput` (`{ target, direction: 'withPrevious' | 'withNext' }`)
- **Output**: `ListsCanJoinResult` (`{ canJoin, reason?, adjacentListId? }`)
- **Mutates**: No
- **Idempotency**: idempotent

### `lists.separate`

Split a list sequence at the target item. Creates a new `numId` pointing to the same `abstractNumId`. Items from target through end of sequence are reassigned to the new `numId`. Direct-only. Supports dry-run.

- **Input**: `ListsSeparateInput` (`{ target, copyOverrides? }`)
- **Options**: `MutationOptions` (`{ dryRun? }`)
- **Output**: `ListsSeparateResult`
- **Mutates**: Yes
- **Idempotency**: non-idempotent
- **Failure codes**: `INVALID_TARGET`, `NO_OP`

### `lists.setLevel`

Set the absolute indent level (0–8) of a list item. Direct-only. Supports dry-run.

- **Input**: `ListsSetLevelInput` (`{ target, level }`)
- **Options**: `MutationOptions` (`{ dryRun? }`)
- **Output**: `ListsMutateItemResult`
- **Mutates**: Yes
- **Idempotency**: conditional
- **Failure codes**: `INVALID_TARGET`, `LEVEL_OUT_OF_RANGE`, `NO_OP`

### `lists.indent`

Increase the indent level of a list item by one. Convenience wrapper for `setLevel(current + 1)`. Direct-only. Supports dry-run.

- **Input**: `ListTargetInput` (`{ target }`)
- **Options**: `MutationOptions` (`{ dryRun? }`)
- **Output**: `ListsMutateItemResult`
- **Mutates**: Yes
- **Idempotency**: conditional
- **Failure codes**: `NO_OP`, `INVALID_TARGET`, `LEVEL_OUT_OF_RANGE`

### `lists.outdent`

Decrease the indent level of a list item by one. Convenience wrapper for `setLevel(current - 1)`. Direct-only. Supports dry-run.

- **Input**: `ListTargetInput` (`{ target }`)
- **Options**: `MutationOptions` (`{ dryRun? }`)
- **Output**: `ListsMutateItemResult`
- **Mutates**: Yes
- **Idempotency**: conditional
- **Failure codes**: `NO_OP`, `INVALID_TARGET`, `LEVEL_OUT_OF_RANGE`

### `lists.setValue`

Set the numbering start value at the target item's position. Pass `value: null` to remove a previously set override. Mid-sequence targets atomically separate then set `startOverride`. Direct-only. Supports dry-run.

- **Input**: `ListsSetValueInput` (`{ target, value: number | null }`)
- **Options**: `MutationOptions` (`{ dryRun? }`)
- **Output**: `ListsMutateItemResult`
- **Mutates**: Yes
- **Idempotency**: conditional
- **Failure codes**: `INVALID_TARGET`, `NO_OP`

### `lists.continuePrevious`

Continue numbering from the nearest previous compatible list sequence (same `abstractNumId`). Merges the target's sequence into that previous sequence's `numId`. Direct-only. Supports dry-run.

- **Input**: `ListsContinuePreviousInput` (`{ target }`)
- **Options**: `MutationOptions` (`{ dryRun? }`)
- **Output**: `ListsMutateItemResult`
- **Mutates**: Yes
- **Idempotency**: conditional
- **Failure codes**: `INVALID_TARGET`, `NO_COMPATIBLE_PREVIOUS`, `ALREADY_CONTINUOUS`

### `lists.canContinuePrevious`

Read-only preflight check for `lists.continuePrevious`. Returns whether a compatible previous sequence exists.

- **Input**: `ListsCanContinuePreviousInput` (`{ target }`)
- **Output**: `ListsCanContinuePreviousResult` (`{ canContinue, reason?, previousListId? }`)
- **Mutates**: No
- **Idempotency**: idempotent

### `lists.setLevelRestart`

Set the `lvlRestart` behavior for a specified level. Controls when the level's counter resets. `scope: 'definition'` mutates the abstract (affects all instances); `scope: 'instance'` uses `lvlOverride` (affects only this `numId`). Direct-only. Supports dry-run.

- **Input**: `ListsSetLevelRestartInput` (`{ target, level, restartAfterLevel: number | null, scope? }`)
- **Options**: `MutationOptions` (`{ dryRun? }`)
- **Output**: `ListsMutateItemResult`
- **Mutates**: Yes
- **Idempotency**: conditional
- **Failure codes**: `INVALID_TARGET`, `LEVEL_OUT_OF_RANGE`

### `lists.convertToText`

Convert list items to plain paragraphs. When `includeMarker` is true, prepends the rendered marker text to paragraph content before clearing numbering properties. Direct-only. Supports dry-run.

- **Input**: `ListsConvertToTextInput` (`{ target, includeMarker? }`)
- **Options**: `MutationOptions` (`{ dryRun? }`)
- **Output**: `ListsConvertToTextResult`
- **Mutates**: Yes
- **Idempotency**: conditional
- **Failure codes**: `INVALID_TARGET`

### `lists.applyTemplate`

Apply a captured `ListTemplate` to the target list's abstract definition, optionally filtered to specific levels. Direct-only. Supports dry-run.

- **Input**: `ListsApplyTemplateInput` (`{ target, template, levels? }`)
- **Options**: `MutationOptions` (`{ dryRun? }`)
- **Output**: `ListsMutateItemResult`
- **Mutates**: Yes
- **Idempotency**: conditional
- **Failure codes**: `NO_OP`, `INVALID_TARGET`, `LEVEL_OUT_OF_RANGE`, `INVALID_INPUT`

### `lists.applyPreset`

Apply a built-in list formatting preset (e.g. `decimal`, `disc`, `upperRoman`) to the target list. Direct-only. Supports dry-run.

- **Input**: `ListsApplyPresetInput` (`{ target, preset, levels? }`)
- **Options**: `MutationOptions` (`{ dryRun? }`)
- **Output**: `ListsMutateItemResult`
- **Mutates**: Yes
- **Idempotency**: conditional
- **Failure codes**: `NO_OP`, `INVALID_TARGET`, `LEVEL_OUT_OF_RANGE`, `INVALID_INPUT`

### `lists.captureTemplate`

Capture the formatting of a list as a reusable `ListTemplate`. Read-only operation.

- **Input**: `ListsCaptureTemplateInput` (`{ target, levels? }`)
- **Output**: `ListsCaptureTemplateResult` (`{ success, template }` | `{ success: false, failure }`)
- **Mutates**: No
- **Idempotency**: idempotent
- **Failure codes**: `INVALID_TARGET`, `INVALID_INPUT`

### `lists.setLevelNumbering`

Set the numbering format (`numFmt`), pattern (`lvlText`), and optional start value for a specific list level. Direct-only. Supports dry-run.

- **Input**: `ListsSetLevelNumberingInput` (`{ target, level, numFmt, lvlText, start? }`)
- **Options**: `MutationOptions` (`{ dryRun? }`)
- **Output**: `ListsMutateItemResult`
- **Mutates**: Yes
- **Idempotency**: conditional
- **Failure codes**: `NO_OP`, `INVALID_TARGET`, `LEVEL_OUT_OF_RANGE`, `LEVEL_NOT_FOUND`

### `lists.setLevelBullet`

Set the bullet marker text for a specific list level. Direct-only. Supports dry-run.

- **Input**: `ListsSetLevelBulletInput` (`{ target, level, markerText }`)
- **Options**: `MutationOptions` (`{ dryRun? }`)
- **Output**: `ListsMutateItemResult`
- **Mutates**: Yes
- **Idempotency**: conditional
- **Failure codes**: `NO_OP`, `INVALID_TARGET`, `LEVEL_OUT_OF_RANGE`, `LEVEL_NOT_FOUND`

### `lists.setLevelPictureBullet`

Set a picture bullet for a specific list level by its OOXML `lvlPicBulletId`. Requires picture bullet pipeline support. Direct-only. Supports dry-run.

- **Input**: `ListsSetLevelPictureBulletInput` (`{ target, level, pictureBulletId }`)
- **Options**: `MutationOptions` (`{ dryRun? }`)
- **Output**: `ListsMutateItemResult`
- **Mutates**: Yes
- **Idempotency**: conditional
- **Failure codes**: `NO_OP`, `INVALID_TARGET`, `LEVEL_OUT_OF_RANGE`, `LEVEL_NOT_FOUND`, `INVALID_INPUT`, `CAPABILITY_UNAVAILABLE`

### `lists.setLevelAlignment`

Set the marker alignment (`left`, `center`, `right`) for a specific list level. Direct-only. Supports dry-run.

- **Input**: `ListsSetLevelAlignmentInput` (`{ target, level, alignment }`)
- **Options**: `MutationOptions` (`{ dryRun? }`)
- **Output**: `ListsMutateItemResult`
- **Mutates**: Yes
- **Idempotency**: conditional
- **Failure codes**: `NO_OP`, `INVALID_TARGET`, `LEVEL_OUT_OF_RANGE`, `LEVEL_NOT_FOUND`

### `lists.setLevelIndents`

Set the paragraph indentation values (`left`, `hanging`, `firstLine`) for a specific list level. At least one property required; `hanging` and `firstLine` are mutually exclusive. Direct-only. Supports dry-run.

- **Input**: `ListsSetLevelIndentsInput` (`{ target, level, left?, hanging?, firstLine? }`)
- **Options**: `MutationOptions` (`{ dryRun? }`)
- **Output**: `ListsMutateItemResult`
- **Mutates**: Yes
- **Idempotency**: conditional
- **Failure codes**: `NO_OP`, `INVALID_TARGET`, `LEVEL_OUT_OF_RANGE`, `LEVEL_NOT_FOUND`, `INVALID_INPUT`

### `lists.setLevelTrailingCharacter`

Set the trailing character (`tab`, `space`, `nothing`) after the marker for a specific list level. Direct-only. Supports dry-run.

- **Input**: `ListsSetLevelTrailingCharacterInput` (`{ target, level, trailingCharacter }`)
- **Options**: `MutationOptions` (`{ dryRun? }`)
- **Output**: `ListsMutateItemResult`
- **Mutates**: Yes
- **Idempotency**: conditional
- **Failure codes**: `NO_OP`, `INVALID_TARGET`, `LEVEL_OUT_OF_RANGE`, `LEVEL_NOT_FOUND`

### `lists.setLevelMarkerFont`

Set the font family used for the marker character at a specific list level. Direct-only. Supports dry-run.

- **Input**: `ListsSetLevelMarkerFontInput` (`{ target, level, fontFamily }`)
- **Options**: `MutationOptions` (`{ dryRun? }`)
- **Output**: `ListsMutateItemResult`
- **Mutates**: Yes
- **Idempotency**: conditional
- **Failure codes**: `NO_OP`, `INVALID_TARGET`, `LEVEL_OUT_OF_RANGE`, `LEVEL_NOT_FOUND`

### `lists.clearLevelOverrides`

Remove instance-level overrides (`lvlOverride`) for a specific list level, restoring abstract definition values. Direct-only. Supports dry-run.

- **Input**: `ListsClearLevelOverridesInput` (`{ target, level }`)
- **Options**: `MutationOptions` (`{ dryRun? }`)
- **Output**: `ListsMutateItemResult`
- **Mutates**: Yes
- **Idempotency**: conditional
- **Failure codes**: `NO_OP`, `INVALID_TARGET`, `LEVEL_OUT_OF_RANGE`

### `lists.setType`

Compound operation that converts a list to ordered/bullet and merges adjacent compatible sequences to preserve continuous numbering (SD-2052).

- **Input**: `ListsSetTypeInput` — `{ target, kind: 'ordered' | 'bullet', continuity?: 'preserve' | 'none' }`
- **Options**: `MutationOptions` (`{ dryRun? }`)
- **Output**: `ListsMutateItemResult`
- **Mutates**: Yes
- **Idempotency**: conditional
- **Failure codes**: `NO_OP`, `INVALID_TARGET`, `INVALID_INPUT`

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
- **Output**: `TrackChangeInfo` (includes `wordRevisionIds` with raw imported Word OOXML `w:id` values when available)
- **Mutates**: No
- **Idempotency**: idempotent

### `trackChanges.decide`

Accept or reject a tracked change by ID, or accept/reject all changes with `{ scope: 'all' }`.

- **Input**: `ReviewDecideInput` (`{ decision: 'accept' | 'reject', target: { id } | { scope: 'all' } }`)
- **Output**: `Receipt`
- **Mutates**: Yes
- **Idempotency**: conditional
- **Failure codes**: `NO_OP`, `TARGET_NOT_FOUND`
