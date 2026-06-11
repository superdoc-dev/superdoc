# Layout Engine

Pagination and rendering pipeline for SuperDoc's presentation/viewing mode.

## Pipeline Overview

```
ProseMirror Doc → v1 layout-adapter (super-editor) → FlowBlock[] → layout-engine → Layout[] → painter-dom → DOM
```

The PM → `FlowBlock[]` adapter is owned by `@superdoc/super-editor`
(`src/editors/v1/core/layout-adapter`), not by this package. The layout-engine
packages consume `FlowBlock[]` and the shared layout contracts only and must
never import the concrete adapter or `@superdoc/super-editor`.

## Sub-packages

| Package | Purpose | Key Entry |
|---------|---------|-----------|
| `contracts/` | Shared types (FlowBlock, Layout, etc.) | `contracts/src/index.ts` |
| v1 layout-adapter (super-editor) | PM document → FlowBlocks conversion | `../super-editor/src/editors/v1/core/layout-adapter/internal.ts` |
| `layout-engine/` | Pagination algorithms | `layout-engine/src/index.ts` |
| `layout-bridge/` | Layout orchestration & bridge utilities | `layout-bridge/src/incrementalLayout.ts` |
| `painters/dom/` | DOM rendering | `painters/dom/src/renderer.ts` |
| `style-engine/` | OOXML style resolution | `style-engine/src/index.ts` |
| `geometry-utils/` | Math utilities for layout | `geometry-utils/src/index.ts` |

## Key Insight: DomPainter Receives Paint-Ready Data

DomPainter receives a single paint-ready input — `ResolvedLayout` — and
renders it to DOM. It does not do layout logic, measurement, or PM → FlowBlock
conversion. Those decisions happen upstream in `layout-engine/`,
`layout-resolved/`, and the v1 layout-adapter (super-editor).

This is enforced as two hard invariants, not aspirational language:

1. **No upstream package imports.** The painter has zero runtime imports
   from the v1 adapter (`@superdoc/super-editor`), `@superdoc/layout-bridge`, or
   `@superdoc/layout-resolved`. Guard D in
   `tests/src/architecture-boundaries.test.ts` enforces this (SD-2836).
2. **No paint-time DOM measurement.** The painter never reads
   `clientHeight`, `offsetWidth`, or `getBoundingClientRect` off rendered
   content. Every size and offset comes pre-computed from the resolved
   layout. If a required field is missing, the painter throws — it does
   not rescue incomplete upstream data by measuring. Scroll/viewport
   plumbing and interactive ruler drag handlers are the only exempt
   consumers. Guard E enforces this (SD-2957).

The painter also does not coalesce resolved-item fields with the legacy
`fragment` back-pointer (no `resolvedItem?.X ?? fragment.X` patterns); the
resolve stage is the unique source of truth for every field the painter
reads.

## Common Tasks

| Task | Where to look |
|------|---------------|
| Change how OOXML element renders | `painters/dom/src/features/feature-registry.ts` → feature module |
| Change rendering orchestration | `painters/dom/src/renderer.ts` |
| Change pagination/layout | `layout-engine/src/index.ts` |
| Add new block type | v1 `core/layout-adapter/converters/` + `painters/dom/` |
| Change style resolution | `style-engine/` |
| Change text measurement | `measuring-dom/` |

AIDEV-NOTE: the v1 layout-adapter must preserve shared `SdtMetadata` object identity for sibling blocks in one id-less SDT container; see `contracts/src/sdt-container.ts` before changing SDT imports.

## Measuring → Layout Ownership (SD-2845)

Boundary between measured block geometry (`Measure[]`) and pagination/placement (`Layout`). See contract tests:
`measuring/dom/src/measuring-layout-contracts.test.ts` (`FlowBlock` → `Measure`) and
`layout-engine/src/measuring-layout-ownership-contracts.test.ts` (`FlowBlock` + `Measure` → `Layout`).
Further work is tracked in Linear (e.g. SD-2837, SD-2845).

### Boundary Contract

| Stage | Owns | Does not own |
| --- | --- | --- |
| pm-adapter | Builds `FlowBlock[]` from document state, preserves raw/source metadata, and resolves style-engine outputs into block attributes needed by measuring and rendering. | Measuring line breaks, table row heights, pagination, fragment placement, or painter-specific DOM decisions. |
| Measuring | Converts each `FlowBlock` into a same-index `Measure` for a known width/height constraint. It owns intrinsic/scaled dimensions, line breaks, line metrics, marker metrics, table cell content measurement, table columns where sizing is measurement-dependent, and zero-dimensional break measures. | Page/column placement, section scheduling, page creation, keep-next decisions, painter DOM structure, or reordering blocks. |
| Layout | Consumes `FlowBlock[]` plus same-index `Measure[]` and creates positioned `Layout` fragments. It owns pagination, section/page/column break effects, anchoring placement, float exclusions, fragment splitting, page metadata, and final page/column coordinates. | Canvas/DOM text measurement, intrinsic media measurement, table cell content measurement, or importing/resolving OOXML style cascades. |
| layout-bridge | Orchestrates conversion, constraint selection, measurement calls, cache reuse/invalidation, header/footer and footnote multi-pass layout, and calls into layout. | Reimplementing measurement or layout decisions except for explicit bridge-only orchestration needed to choose constraints or rerun a pass. |

### Ownership Matrix

| Area | Measuring should produce | Layout should consume or decide | layout-bridge may orchestrate | Current duplicated or unclear logic |
| --- | --- | --- | --- | --- |
| Paragraphs | `ParagraphMeasure` with line ranges, line widths, line heights, total height, marker metrics, optional drop-cap metrics, tab/segment metadata, and line max widths for the constraint used. | Place paragraph fragments into pages/columns, split by measured lines, apply spacing/keep-next/contextual spacing, apply float exclusions, and set continuation flags. | Select per-section measurement constraints, cache/reuse paragraph measures, invalidate dirty measures, and provide controlled remeasure callbacks when layout must place text in a narrower active region. | Layout still accepts `remeasureParagraph` and can attach fragment-local `lines`, so paragraph wrapping ownership is split between measuring and layout. Keep-next also reads measured heights directly from layout. |
| Lists and list items | `ListMeasure` with per-item marker width, marker text width, indent, nested `ParagraphMeasure`, and total list height. | Place each list item fragment, split item paragraph lines across pages/columns, preserve marker metrics on fragments, and apply continuation flags. | Convert list-style paragraphs into either paragraph blocks with marker attrs or list blocks consistently; measure/remeasure each item under the chosen list item constraint. | Measuring has `ListMeasure`, but `layoutDocument` currently has no `ListBlock` layout branch and an existing list layout test is skipped. Paragraphs may also carry word-layout marker data, creating two list paths. |
| Tables | `TableMeasure` with row/cell measures, total width/height, column widths, cell spacing, table border widths, row heights, and nested cell `Measure[]` for multi-block cells. | Place table fragments, split rows/partial rows, repeat headers, clamp/rescale fragment column widths when needed, position anchored/floating tables, and emit table metadata for resize boundaries. | Measure tables after selecting page/column constraints; remeasure tables in headers/footers/footnotes as needed; cache and invalidate table measures with block identity. | Table sizing logic is spread across measuring (`autofit-columns`, `fixed-table-columns`, nested cell measurement), contracts (`rescaleColumnWidths`), and layout (`layout-table`, frame/clamp logic). Some width decisions are measurement-owned while fragment clamping is layout-owned. |
| Table rows | Per-row height derived from measured cells, including row height rule effects where available, repeat-header metadata passed through block attrs. | Decide which rows fit, whether a row becomes a partial row, repeat header rows on continuation fragments, and continuation metadata. | Ensure table measures are recomputed when row content changes or available measurement width changes. | Row splitting depends on measured row/cell heights but row keep/cantSplit semantics cross table measurement and layout. |
| Table cells and nested cell content | Per-cell width/height, padding-aware content width, `blocks?: Measure[]` for nested paragraphs/images/drawings/tables, legacy `paragraph?: ParagraphMeasure`, spans, and grid column start. | Slice cell content into visible fragments for table pagination, maintain row/column boundaries, and map cell content to fragment geometry. | Recurse into measurement for each nested cell block with the cell content width; choose when nested content must be remeasured. | Nested content is measured recursively, while layout also has table cell slicing logic that interprets nested measures and block shapes. |
| Images | `ImageMeasure` with final width/height after intrinsic fallback, width/height constraints, objectFit/cover handling, and anchored negative-offset height bypass. | Place inline or anchored image fragments, compute x/y from page/column/margin anchors, set metadata and z-index, reserve flow space only when appropriate. | Provide max width/height based on page, header/footer, footnote, or table-cell context; hydrate image blocks before measuring when needed. | Scaling is measurement-owned, but layout computes placement metadata such as maxWidth/maxHeight and also has anchored/page-relative special handling. |
| Drawings | `DrawingMeasure` with drawing kind, final width/height, scale, natural size, normalized geometry, and group transform when present. | Place drawing fragments, compute anchoring and z-index, carry geometry/scale into fragments, and manage float exclusions. | Provide constraints and trigger remeasurement when drawing geometry or context changes. | Measuring handles rotation bounds/full-width shape sizing; layout handles anchored placement and pre-registration. Shape group/text content sizing boundaries need clearer documentation. |
| Section breaks | `SectionBreakMeasure` as a zero-dimensional control measure. | Apply section scheduling, page parity, page size/orientation/margin/column changes, section refs, numbering, vertical alignment, and column regions. | Preserve block order, pass break blocks through, compute per-section constraints for actual measurement, and use global-max constraints only as a compatibility check when deciding whether previous measures can be reused. | Section props are partly precomputed/looked ahead in layout and partly carried on break blocks; bridge computes both per-section constraints and a global-max compatibility constraint set from section blocks. |
| Page breaks | `PageBreakMeasure` as a zero-dimensional control measure. | Start a new page unless redundant, without producing a fragment. | Preserve the break in block/measure alignment and cache invalidation. | Page-break redundancy checks are layout-owned, but empty sectPr marker handling can interact with adjacent paragraph/break blocks. |
| Column breaks | `ColumnBreakMeasure` as a zero-dimensional control measure. | Advance to the next active column or start a new page from the last column, without producing a fragment. | Preserve alignment and recompute measurement constraints when section columns change. | Blocks are measured with per-section constraints, but layout can still trigger narrower active-region paragraph remeasurement, so wrapping ownership is still split. |
| Headers and footers | Measures for header/footer story blocks under header/footer-specific constraints; measured heights for variants, rIds, and section-aware references. | Lay out header/footer fragments per page/variant, apply header/footer heights to body page margins, and normalize fragments for render regions. | Own multi-pass header/footer measurement/layout orchestration, token resolution, variant bucketing, and cache invalidation. | Bridge has substantial header/footer orchestration; layout also consumes per-page/per-rId height maps and section refs. The height ownership boundary is functional but hard to reason about. |
| Footnotes | Measures for footnote story blocks under footnote band constraints, including nested content measures. | Reserve footnote space on body pages, place footnote fragments in footnote bands, and handle overflow across pages/columns. | Own multi-pass footnote measurement/layout, separator spacing, band overflow retries, and cache invalidation. | Footnote layout is bridge-heavy and interacts with body pagination through reserved space; ownership between reserve calculation and final placement should be explicit. |
| Nested measured content | Recursive `Measure[]` for nested blocks using the current container's content width and height rules. | Interpret nested measures only through the container layout algorithm, without remeasuring nested content directly. | Supply container constraints and invalidate nested measures when the parent container changes width or content. | Tables already recurse in measuring; future containers may duplicate this unless the recursion contract is centralized. |

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

See root CLAUDE.md "Style Resolution Boundary" for why this must not be done in the importer.

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

1. **Search `painters/dom/src/features/feature-registry.ts`** — maps OOXML element names (e.g., `w:pBdr`, `w:shd`) to their feature module
2. Each entry has: `feature` (folder name), `module` (import path), `handles` (OOXML elements), `spec` (ECMA-376 section)
3. Open the feature's `index.ts` for its public API and `@ooxml`/`@spec` annotations

### Adding a new rendering feature

1. **Add a registry entry** in `painters/dom/src/features/feature-registry.ts` first — this is the source of truth
2. **Create the feature folder** at `painters/dom/src/features/<feature-name>/`:
   - `index.ts` — barrel exports with `@ooxml` and `@spec` JSDoc annotations
   - Split logic into focused files (e.g., `group-analysis.ts`, `border-layer.ts`)
   - `types.ts` — shared types if needed
3. **Import from the feature module** in `renderer.ts` — renderer calls feature functions, features don't import from renderer
4. **Remove extracted code** from `renderer.ts` — don't leave dead copies
5. **Update imports** in any other files that used the old renderer exports (e.g., `painters/dom/src/table/renderTableCell.ts`)

### Feature module conventions

- **Folder name** = human-readable feature name, matches the `feature` field in the registry
- **`@ooxml` annotations** on `index.ts` list every OOXML element the module handles
- **`@spec` annotations** reference the ECMA-376 section numbers
- **No circular imports** — features import from `@superdoc/contracts`, not from `renderer.ts`
- **Co-locate tests** as `<feature-name>.test.ts` next to the source

### Existing feature modules

| Feature | OOXML elements | Folder |
|---------|---------------|--------|
| Paragraph borders & shading | `w:pBdr`, `w:shd` | `painters/dom/src/paragraph/borders/` |

## Entry Points

- `painters/dom/src/renderer.ts` - Main DOM rendering orchestrator (large file — feature logic is being extracted to `features/`)
- `painters/dom/src/features/feature-registry.ts` - OOXML element → feature module lookup
- `painters/dom/src/styles.ts` - CSS class definitions
- `layout-bridge/src/incrementalLayout.ts` - Layout orchestration (called by PresentationEditor)
- `../super-editor/src/editors/v1/core/layout-adapter/internal.ts` - PM → FlowBlock conversion (super-editor-owned)

## Layer Ownership

See root `CLAUDE.md` for the full placement map. This package owns the
layout and rendering pipeline.

- Style-resolved properties flow through `style-engine` → v1 layout-adapter →
  DomPainter.
- Static document visuals belong in layout data plus DomPainter rendering, not
  ProseMirror decorations.
- Editing behavior, including commands and keybindings, stays in
  `super-editor/src/editors/v1/extensions/`.
- `PresentationEditor` bridges editor state into layout and paint state. It
  should not resolve OOXML semantics.
- Direction work keeps OOXML axes separate. `style-engine` resolves cascades,
  the v1 layout-adapter writes typed direction/table attrs, and DomPainter owns
  paint-time visual mirroring. For `w:bidiVisual`, upstream layers keep table
  sides in LTR-default form and DomPainter mirrors once.

For the full direction taxonomy, see
`../super-editor/src/editors/v1/core/layout-adapter/direction/README.md`.
