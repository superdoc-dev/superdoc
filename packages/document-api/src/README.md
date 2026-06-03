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
- `trackChanges.get` / `trackChanges.decide` accept canonical tracked-change IDs. Include `story` when targeting a non-body change.

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

## Operation reference

Per-operation reference docs (summary, member path, mutation/idempotency flags, expected result, input / output field tables, raw schemas) are generated from the contract and live under [`apps/docs/document-api/reference/`](../../../apps/docs/document-api/reference/). The generator is unconditional: every `OPERATION_ID` produces a page.

To regenerate after changing the contract:

```
pnpm run docapi:sync
```

`docapi:check` (`check-contract-outputs`) gates that the generated reference matches the contract; do not hand-edit the generated `.mdx` files.

The previous catalog-style "Operation Reference" section was removed because it could only ever cover a small subset of the 403 operations and duplicated the generated docs. The generated reference is the source of truth.
