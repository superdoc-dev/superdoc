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
- `insert`, `replace`, `delete`, `format.bold`, and `create.paragraph` may run in tracked mode.
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
