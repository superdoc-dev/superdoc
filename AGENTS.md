# SuperDoc

A document editing and rendering library for the web.

## Architecture: Rendering

SuperDoc uses its own rendering pipeline. ProseMirror stores document state; it is not the visual renderer.

```
.docx
  → super-converter parses OOXML into the hidden PM doc
  → v1 layout-adapter (super-editor: src/editors/v1/core/layout-adapter)
    reads PM state and resolved styles
  → FlowBlock[]
  → layout-engine paginates
  → ResolvedLayout
  → DomPainter paints DOM
```

- The v1 ProseMirror → `FlowBlock[]` adapter is owned by `@superdoc/super-editor`
  (`src/editors/v1/core/layout-adapter`). It is v1 SuperEditor's projection from
  hidden ProseMirror state into layout data. v2 owns its own projection adapter.
  `layout-engine` runtime packages consume `FlowBlock[]` and layout contracts
  only; they must never import either concrete adapter.
- `PresentationEditor` wraps a hidden ProseMirror `Editor`. Its contenteditable DOM is never shown. PresentationEditor bridges editor events into layout/paint state; do not resolve OOXML semantics there.
- **DomPainter** (`layout-engine/painters/dom/`) owns all visual rendering.
- Style-resolved properties flow `layout-adapter` → DomPainter. Do not style document content with PM decorations.

### Where To Put Your Change

| Concern | Where | Rule |
|---|---|---|
| DOCX import/export | `super-editor/src/editors/v1/core/super-converter/` | Parse and preserve OOXML, style refs, inline properties. Do not bake resolved formatting into direct attrs. |
| Style cascade | `layout-engine/style-engine/` | Single source of truth for defaults, styles, conditional formatting, inline overrides. |
| Static document visuals | v1 `core/layout-adapter/` data + `layout-engine/painters/dom/` rendering | Feed typed data into DomPainter. Do not style static content with PM decorations. |
| Direction-aware properties | `layout-engine/painters/dom/` | DomPainter mirrors at paint time for `w:bidiVisual`. The v1 layout-adapter stores logical sides LTR-default. Pre-mirroring upstream is a double-swap. See `packages/super-editor/src/editors/v1/core/layout-adapter/direction/README.md`. |
| Editing behavior | `super-editor/src/editors/v1/extensions/` | Commands, keybindings, editor plugins. Do not duplicate cascade or render document visuals here. |
| Final DOM rendering | `layout-engine/painters/dom/` | Render `ResolvedLayout`. Paint-time transforms (e.g. RTL mirror) live here. |
| New doc-api operation | `packages/document-api/src/contract/operation-definitions.ts` | Contract-first; touches 4 files. See `packages/document-api/README.md`. |

For specialized boundaries (interaction mapping, geometry/pagination, ephemeral overlays, presentation state bridge, consumer SDK surface), see `packages/layout-engine/AGENTS.md` and the relevant package AGENTS.md.

### Boundary check

Before adding a visual or direction-aware path, run:

```bash
# Painter must not import upstream packages or the concrete v1 adapter.
rg "@superdoc/(super-editor|style-engine|layout-bridge|layout-resolved)" packages/layout-engine/painters/dom/src
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
- `pnpm check:types` - raw TS compile across all referenced projects (`tsc -b tsconfig.references.json`). Does NOT run the public-interface chain. Legacy alias: `pnpm run type-check`.
- `pnpm check:public` - **canonical pre-merge command for typed public surfaces.** Validates both `superdoc` (tier discipline + jsdoc ratchet + ts-jsdoc hygiene + public-method fixture coverage + bundled font license gate + vite build + postbuild chain + consumer typecheck matrix + deep-type audit + package-shape + snapshots + classification closure + docs snippet typecheck) and Document API (contract parity + output staleness + examples + overview). ~5 min. Non-mutating. Combines `check:public:superdoc` + `check:public:docapi`.
- `pnpm check:public:superdoc` - SuperDoc public package surface only. Wraps fourteen stages in cheap-to-expensive order: `contract-tiers-test`, `contract-tiers`, `jsdoc-ratchet`, `jsdoc-hygiene-ts-test`, `jsdoc-hygiene-ts`, `public-method-coverage`, `font-license-gate`, `build`, `consumer-typecheck-matrix`, `deep-type-audit-supported-root`, `package-shape`, `export-snapshots`, `root-classification-closure`, `docs-snippet-typecheck`. Legacy alias: `pnpm run check:public-contract`.
- `pnpm check:public:docapi` - Document API public surface only. Wraps four stages: `contract-parity`, `contract-outputs`, `examples`, `overview-alignment`. Clean-checkout safe: gitignored generated artifacts are built in memory; tracked outputs (reference docs, overview block) are compared byte-for-byte. No mutation. Legacy alias: `pnpm run docapi:check`.
- `pnpm check:font-licenses` - validate bundled font legal metadata: every `shared/font-system/assets/*.woff2` has a manifest row, stable hash, matching runtime bundled-manifest entry, and required notices. Also runs inside `check:public:superdoc`.
- `pnpm generate:docapi` - regenerate Document API outputs after editing the contract (alias of `docapi:sync`). Writes gitignored Document API generated artifacts. Run only when you need the artifacts materialized locally (SDK builds, publishing); `check:public:docapi` does not require it.
- `pnpm generate:all` - regenerate schemas, SDK clients, tool catalogs, reference docs.
- `pnpm report:public:superdoc` - print public-contract tier metadata (supported / legacy / legacy-raw / asset / deprecated). Read-only, not a gate. Use `check:public:superdoc` (or its `contract-tiers` stage) to enforce. Source of truth: `packages/superdoc/scripts/type-surface.config.cjs`.

Full system reference (script catalog, dataflow, CI vs local): `packages/superdoc/scripts/README.md`.

Naming convention: `check:*` = non-mutating, safe in CI. `generate:*` = mutates files. `report:*` = read-only information, not a gate. Older command names (`check:public-contract`, `docapi:sync`, `report:public-contract`, etc.) remain as aliases.

## Testing

| What to verify | Command | Speed |
|---|---|---|
| Logic works? | `pnpm test` | seconds |
| Editing works? | `pnpm test:behavior` | minutes |
| Pixel diff? | `pnpm --dir tests/visual test` | ~5 min |

Per-package detail: `tests/behavior/AGENTS.md`, `tests/visual/AGENTS.md`. Eval suite: `evals/AGENTS.md`.
