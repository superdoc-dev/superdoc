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
| Change how element renders | `painters/dom/src/renderer.ts` |
| Change pagination/layout | `layout-engine/src/index.ts` |
| Add new block type | `pm-adapter/src/converters/` + `painters/dom/` |
| Change style resolution | `style-engine/` |
| Change text measurement | `measuring-dom/` |

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

## Entry Points

- `painters/dom/src/renderer.ts` - Main DOM rendering (large file)
- `painters/dom/src/styles.ts` - CSS class definitions
- `layout-bridge/src/layout-pipeline.ts` - Pipeline orchestration
- `pm-adapter/src/internal.ts` - PM → FlowBlock conversion

## Cross-References

Visual changes in **editing mode** → modify super-editor decorations
Visual changes in **viewing mode** → modify renderer.ts
Changes to **both modes** → modify both and bridge via PresentationEditor (`super-editor/src/core/presentation-editor/`)

See root CLAUDE.md for dual rendering system explanation.
