# SuperDoc

A document editing and rendering library for the web.

## Architecture: Rendering

SuperDoc uses its own rendering pipeline. ProseMirror stores document state; it is not the visual renderer.

```
.docx
  → super-converter parses OOXML into the hidden PM doc
  → pm-adapter reads PM state and resolved styles
  → FlowBlock[]
  → layout-engine paginates
  → ResolvedLayout
  → DomPainter paints DOM
```

- `PresentationEditor` wraps a hidden ProseMirror `Editor`. Its contenteditable DOM is never shown. PresentationEditor bridges editor events into layout/paint state; do not resolve OOXML semantics there.
- **DomPainter** (`layout-engine/painters/dom/`) owns all visual rendering.
- Style-resolved properties flow `pm-adapter` → DomPainter. Do not style document content with PM decorations.

### Where To Put Your Change

| Concern | Where | Rule |
|---|---|---|
| DOCX import/export | `super-editor/src/editors/v1/core/super-converter/` | Parse and preserve OOXML, style refs, inline properties. Do not bake resolved formatting into direct attrs. |
| Style cascade | `layout-engine/style-engine/` | Single source of truth for defaults, styles, conditional formatting, inline overrides. |
| Static document visuals | `pm-adapter/` data + `layout-engine/painters/dom/` rendering | Feed typed data into DomPainter. Do not style static content with PM decorations. |
| Direction-aware properties | `layout-engine/painters/dom/` | DomPainter mirrors at paint time for `w:bidiVisual`. pm-adapter stores logical sides LTR-default. Pre-mirroring upstream is a double-swap. See `packages/layout-engine/pm-adapter/src/direction/README.md`. |
| Editing behavior | `super-editor/src/editors/v1/extensions/` | Commands, keybindings, editor plugins. Do not duplicate cascade or render document visuals here. |
| Final DOM rendering | `layout-engine/painters/dom/` | Render `ResolvedLayout`. Paint-time transforms (e.g. RTL mirror) live here. |
| New doc-api operation | `packages/document-api/src/contract/operation-definitions.ts` | Contract-first; touches 4 files. See `packages/document-api/README.md`. |

For specialized boundaries (interaction mapping, geometry/pagination, ephemeral overlays, presentation state bridge, consumer SDK surface), see `packages/layout-engine/AGENTS.md` and the relevant package AGENTS.md.

### Boundary check

Before adding a visual or direction-aware path, run:

```bash
# Painter must not import upstream packages.
rg "@superdoc/(pm-adapter|style-engine|layout-bridge|layout-resolved)" packages/layout-engine/painters/dom/src
```

More checks in `packages/layout-engine/AGENTS.md`.

## Style Resolution Boundary

The importer stores raw OOXML. The style-engine resolves at render time.

- Converter (`super-converter/`) parses and stores only what is explicitly in the XML.
- Style-engine (`layout-engine/style-engine/`) owns cascade logic.

**Why**: resolving during import bakes inline properties into nodes; export then writes direct formatting instead of style references and loses document intent.

## Document API Contract

`packages/document-api/` uses a contract-first pattern.

- **`operation-definitions.ts`** is the canonical object. All downstream maps project from it.
- **`operation-registry.ts`** is the type-level registry (`input`, `options`, `output`).
- **`invoke.ts`** is the dispatch table, validated against the registry at compile time.

Adding an operation touches 4 files: `operation-definitions.ts`, `operation-registry.ts`, `invoke.ts`, and the implementation. Run `pnpm run generate:all` after. See `packages/document-api/README.md`.

Do not hand-edit `COMMAND_CATALOG`, `OPERATION_MEMBER_PATH_MAP`, `OPERATION_REFERENCE_DOC_PATH_MAP`, or `REFERENCE_OPERATION_GROUPS`. They are derived from `OPERATION_DEFINITIONS`.

## Commands

- `pnpm build` - build all packages
- `pnpm test` - unit tests
- `pnpm dev` - dev server from `examples/`
- `pnpm run generate:all` - regenerate schemas, SDK clients, tool catalogs, reference docs

## Testing

| What to verify | Command | Speed |
|---|---|---|
| Logic works? | `pnpm test` | seconds |
| Editing works? | `pnpm test:behavior` | minutes |
| Layout regressed? | `pnpm test:layout` | ~10 min |
| Pixel diff? | `pnpm test:visual` | ~5 min |

Per-package detail: `tests/behavior/AGENTS.md`, `tests/visual/AGENTS.md`. Eval suite: `evals/AGENTS.md`.
