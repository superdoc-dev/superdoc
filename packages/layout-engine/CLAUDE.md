# Layout Engine

Pagination and rendering pipeline for SuperDoc's presentation/viewing mode.

## Pipeline Overview

```
ProseMirror Doc → pm-adapter → FlowBlock[] → layout-engine → Layout[] → painter-dom → DOM
```

## Sub-packages

| Package | Purpose | Key Entry |
|---------|---------|-----------|
| `contracts/` | Shared types (FlowBlock, Layout, etc.) | `src/index.ts` |
| `pm-adapter/` | PM document → FlowBlocks conversion | `src/internal.ts` |
| `layout-engine/` | Pagination algorithms | `src/index.ts` |
| `layout-bridge/` | Pipeline orchestration | `src/layout-pipeline.ts` |
| `painters/dom/` | DOM rendering | `src/renderer.ts` |
| `style-engine/` | OOXML style resolution | `src/index.ts` |
| `geometry-utils/` | Math utilities for layout | `src/index.ts` |

## Key Insight: DomPainter is "Dumb"

DomPainter receives pre-computed `Layout` with positioned fragments and renders them.
It does NOT do layout logic - that's in `layout-engine/`.

## Common Tasks

| Task | Where to look |
|------|---------------|
| Change how OOXML element renders | `painters/dom/src/features/feature-registry.ts` → feature module |
| Change rendering orchestration | `painters/dom/src/renderer.ts` |
| Change pagination/layout | `layout-engine/src/index.ts` |
| Add new block type | `pm-adapter/src/converters/` + `painters/dom/` |
| Change style resolution | `style-engine/` |
| Change text measurement | `measuring-dom/` |

## Style Engine (`style-engine/`)

Single source of truth for OOXML style cascade resolution. All property resolution flows through here.

**Existing cascade functions:**
- `resolveRunProperties()` / `resolveParagraphProperties()` - Full cascade for run/paragraph properties
- `resolveTableCellProperties()` - Full cascade for table cell properties (shading, borders, margins)
- `resolveCellStyles()` - Collects conditional table style properties per cell position
- `determineCellStyleTypes()` - Computes which conditional styles apply (firstRow, band1Horz, etc.) based on cell position and `tblLook` flags

**Extending the cascade:**
When adding style resolution for a new property type (e.g., `tableCellProperties`), follow the existing pattern:
1. Use `determineCellStyleTypes()` to get applicable style types
2. Collect properties from each matching `tableStyleProperties` entry
3. Cascade using `combineProperties()` (low → high priority)
4. Inline properties always win last

See root CLAUDE.md "Style Resolution Boundary" for why this must NOT be done in the importer.

## Important Patterns

### Virtualization (`painters/dom/src/renderer.ts`)

Page virtualization in vertical mode - sliding window of mounted pages.
Only visible pages are in DOM.

### Active State (comments, track changes)

State changes trigger layout version bump → full DOM rebuild:
```javascript
setActiveComment(commentId) → increments layoutVersion → clears pageIndexToState
```

### Block Lookup

Maps block IDs to entries for change detection. Only changed pages re-render.
See `blockIdToEntry` in `painters/dom/src/renderer.ts`.

## DomPainter Feature Modules (`painters/dom/src/features/`)

Rendering logic for specific OOXML features is extracted into **feature modules** under `painters/dom/src/features/<feature-name>/`. This keeps `renderer.ts` focused on orchestration while feature-specific logic lives in discoverable, self-contained modules.

### How to find where an OOXML element renders

1. **Search `features/feature-registry.ts`** — maps OOXML element names (e.g., `w:pBdr`, `w:shd`) to their feature module
2. Each entry has: `feature` (folder name), `module` (import path), `handles` (OOXML elements), `spec` (ECMA-376 section)
3. Open the feature's `index.ts` for its public API and `@ooxml`/`@spec` annotations

### Adding a new rendering feature

1. **Add a registry entry** in `features/feature-registry.ts` first — this is the source of truth
2. **Create the feature folder** at `features/<feature-name>/`:
   - `index.ts` — barrel exports with `@ooxml` and `@spec` JSDoc annotations
   - Split logic into focused files (e.g., `group-analysis.ts`, `border-layer.ts`)
   - `types.ts` — shared types if needed
3. **Import from the feature module** in `renderer.ts` — renderer calls feature functions, features don't import from renderer
4. **Remove extracted code** from `renderer.ts` — don't leave dead copies
5. **Update imports** in any other files that used the old renderer exports (e.g., `table/renderTableCell.ts`)

### Feature module conventions

- **Folder name** = human-readable feature name, matches the `feature` field in the registry
- **`@ooxml` annotations** on `index.ts` list every OOXML element the module handles
- **`@spec` annotations** reference the ECMA-376 section numbers
- **No circular imports** — features import from `@superdoc/contracts`, not from `renderer.ts`
- **Co-locate tests** as `<feature-name>.test.ts` next to the source

### Existing feature modules

| Feature | OOXML elements | Folder |
|---------|---------------|--------|
| Paragraph borders & shading | `w:pBdr`, `w:shd` | `features/paragraph-borders/` |

## Entry Points

- `painters/dom/src/renderer.ts` - Main DOM rendering orchestrator (large file — feature logic is being extracted to `features/`)
- `painters/dom/src/features/feature-registry.ts` - OOXML element → feature module lookup
- `painters/dom/src/styles.ts` - CSS class definitions
- `layout-bridge/src/layout-pipeline.ts` - Pipeline orchestration
- `pm-adapter/src/internal.ts` - PM → FlowBlock conversion

## Rendering Ownership

**DomPainter owns ALL visual rendering.** ProseMirror is hidden — its DOM is never shown to the user.

- Style-resolved properties flow through: `style-engine` → `pm-adapter` (sets attrs on FlowBlocks) → `DomPainter` (renders to DOM)
- Do NOT add ProseMirror decoration plugins for visual styling — that bypasses the rendering pipeline
- Editing behavior (commands, keybindings) stays in `super-editor/src/extensions/`

See root CLAUDE.md for full architecture.
