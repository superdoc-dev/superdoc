# SuperDoc

A document editing and rendering library for the web.

## Architecture: Rendering

SuperDoc uses its own rendering pipeline — **ProseMirror is NOT used for visual output**.

```
PM Doc (hidden) → pm-adapter → FlowBlock[] → layout-engine → Layout[] → DomPainter → DOM
```

- `PresentationEditor` wraps a hidden ProseMirror `Editor` instance for document state and editing commands
- The hidden Editor's contenteditable DOM is never shown to the user
- **DomPainter** (`layout-engine/painters/dom/`) owns all visual rendering
- Style-resolved properties (backgrounds, fonts, borders, etc.) must flow through `pm-adapter` → DomPainter, not through PM decorations

### Where visual changes go

| Change | Where |
|--------|-------|
| How something looks | `pm-adapter/` (data) + `painters/dom/` (rendering) |
| Style resolution | `style-engine/` |
| Editing behavior | `super-editor/src/extensions/` |

**Do NOT** add ProseMirror decoration plugins for visual styling — DomPainter handles rendering.

### State Communication

State flows from super-editor → Layout Engine via:
- `PresentationEditor.ts` listens to editor events (`super-editor/src/core/presentation-editor/`)
- Calls DomPainter methods to update state
- DomPainter re-renders with new state

## Project Structure

```
packages/
  superdoc/          Main entry point (npm: superdoc)
  react/             React wrapper (@superdoc-dev/react)
  super-editor/      ProseMirror editor (@superdoc/super-editor)
  layout-engine/     Layout & pagination pipeline
    contracts/       - Shared type definitions
    pm-adapter/      - ProseMirror → Layout bridge
    layout-engine/   - Pagination algorithms
    layout-bridge/   - Pipeline orchestration
    painters/dom/    - DOM rendering
    style-engine/    - OOXML style resolution
  ai/                AI integration
  collaboration-yjs/ Collaboration server
shared/              Internal utilities
e2e-tests/           Playwright tests
tests/visual/        Visual regression tests (Playwright + R2 baselines)
```

## Where to Look

| Task | Location |
|------|----------|
| React integration | `packages/react/src/SuperDocEditor.tsx` |
| Editing features | `super-editor/src/extensions/` |
| Presentation mode visuals | `layout-engine/painters/dom/src/renderer.ts` |
| DOCX import/export | `super-editor/src/core/super-converter/` |
| Style resolution | `layout-engine/style-engine/` |
| Main entry point (Vue) | `superdoc/src/SuperDoc.vue` |
| Visual regression tests | `tests/visual/` (see its CLAUDE.md) |
| Document API contract | `packages/document-api/src/contract/operation-definitions.ts` |
| Adding a doc-api operation | See `packages/document-api/README.md` § "Adding a new operation" |

## Style Resolution Boundary

**The importer stores raw OOXML properties. The style-engine resolves them at render time.**

- The converter (`super-converter/`) should only parse and store what is explicitly in the XML (inline properties, style references). It must NOT resolve style cascades, conditional formatting, or inherited properties.
- The style-engine (`layout-engine/style-engine/`) is the single source of truth for cascade logic. All style resolution (defaults → table style → conditional formatting → inline overrides) happens here.
- Both rendering systems call the style-engine to compute final visual properties.

**Why**: Resolving styles during import bakes them into node attributes as inline properties. On export, these get written as direct formatting instead of style references, losing the original document intent.

## When to Modify Which System

- **Visual rendering**: Modify `pm-adapter/` (to feed data) and/or `painters/dom/` (to render it)
- **Style resolution**: Modify `style-engine/` — called by pm-adapter during conversion
- **Editing commands/behavior**: Modify `super-editor/src/extensions/`
- **State bridging**: Modify `PresentationEditor.ts`

## Document API Contract

The `packages/document-api/` package uses a contract-first pattern with a single source of truth.

- **`operation-definitions.ts`** — canonical object defining every operation's key, metadata, member path, reference doc path, and group. All downstream maps are projected from this file automatically.
- **`operation-registry.ts`** — type-level registry mapping each operation to its `input`, `options`, and `output` types.
- **`invoke.ts`** — `TypedDispatchTable` validates dispatch wiring against the registry at compile time.

Adding a new operation touches 4 files: `operation-definitions.ts`, `operation-registry.ts`, `invoke.ts` (dispatch table), and the implementation. See `packages/document-api/README.md` for the full guide.

Do NOT hand-edit `COMMAND_CATALOG`, `OPERATION_MEMBER_PATH_MAP`, `OPERATION_REFERENCE_DOC_PATH_MAP`, or `REFERENCE_OPERATION_GROUPS` — they are derived from `OPERATION_DEFINITIONS`.

## JSDoc types

Many packages use `.js` files with JSDoc `@typedef` for type definitions (e.g., `packages/superdoc/src/core/types/index.js`). These typedefs ARE the published type declarations — `vite-plugin-dts` generates `.d.ts` files from them.

- **Keep JSDoc typedefs in sync with code.** If a function destructures `{ a, b, c }`, the `@typedef` must include all three properties. Missing properties become type errors for consumers.
- **Verify types after adding parameters.** When adding a parameter to a function, update its `@typedef` or `@param` JSDoc. Build with `pnpm run --filter superdoc build:es` and check the generated `.d.ts` in `dist/`.
- **Workspace packages don't publish types.** `@superdoc/common`, `@superdoc/contracts`, etc. are private. If a public API references their types, those types must be inlined or resolved through path aliases — consumers can't resolve workspace packages.

## Commands

- `pnpm build` - Build all packages
- `pnpm test` - Run tests
- `pnpm dev` - Start dev server (from examples/)
- `pnpm run generate:all` - Generate all derived artifacts (schemas, SDK clients, tool catalogs, reference docs)

## Generated Artifacts

These directories are produced by `pnpm run generate:all`:

| Directory | In git? | What it contains |
|-----------|---------|-----------------|
| `packages/document-api/generated/` | No (gitignored) | Agent tool schemas, JSON schemas, manifest |
| `apps/cli/generated/` | No (gitignored) | SDK contract JSON exported from CLI metadata |
| `packages/sdk/langs/node/src/generated/` | No (gitignored) | Node SDK generated client code |
| `packages/sdk/langs/python/superdoc/generated/` | No (gitignored) | Python SDK generated client code |
| `packages/sdk/tools/*.json` | No (gitignored) | Tool catalogs for all providers (catalog.json, tools.openai.json, etc.) |
| `apps/docs/document-api/reference/` | Yes (Mintlify deploys from git) | Reference doc pages generated from contract |

After a fresh clone, run `pnpm run generate:all` before working on SDK, CLI, or doc-api code.

Note: `packages/sdk/tools/__init__.py` is a manual file (Python package marker) and stays committed.
