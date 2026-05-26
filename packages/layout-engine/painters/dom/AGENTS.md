# DOM Painter

Renderer for paint-ready `ResolvedLayout` input. Keep this package organized by
rendering concern so `src/renderer.ts` stays focused on orchestration.

## Renderer Boundary

`src/renderer.ts` owns page-level coordination:

- mount lifecycle and paint entrypoints
- page containers, spreads, headers, footers, and virtualization
- incremental page state, active state, snapshots, and provider wiring
- dispatching resolved paint items to focused renderers

Do not add substantial feature or content rendering logic to `renderer.ts`.
If a change is about how paragraphs, runs, tables, images, drawings, SDT,
notes, textboxes, math, or ruler UI render, put that logic in the matching
concern directory under `src/` and call it from the renderer.

## Concern Directories

Use the existing directories before creating new ones:

| Concern | Location |
| --- | --- |
| Paragraph frame, lines, borders, markers, indentation | `src/paragraph/` |
| Runs, fields, links, track changes, formatting marks | `src/runs/` |
| Tables and table-cell rendering | `src/table/` |
| Image fragments, image elements, image selection | `src/images/` |
| Drawings, shapes, charts, drawing wrappers | `src/drawings/` |
| Structured document tag chrome and datasets | `src/sdt/` |
| Footnote/endnote story handling | `src/notes/` |
| Textbox and shape text helpers | `src/textbox/` |
| Ruler UI and ruler measurement helpers | `src/ruler/` |
| Cross-cutting renderer utilities | `src/utils/` |
| OOXML feature lookup modules | `src/features/` |

Create a new concern directory only when none of the existing boundaries fit.
Keep public entrypoints narrow and export only the helpers the renderer or
neighboring concern modules need.

## Adding Rendering Code

- Keep container placement separate from content rendering. Body pages,
  table cells, headers/footers, notes, and textboxes can place content
  differently, but should reuse the same content renderers where possible.
- Do not duplicate renderer paths for the same document content. Paragraphs,
  markers, images, drawings, SDT chrome, and nested tables should have shared
  helpers instead of body-only and table-cell-only implementations.
- Feature modules may import contracts and local utilities, but should not
  import from `src/renderer.ts`.
- If a patch would add a large private method, nested branch, or helper block
  to `renderer.ts`, extract it first and leave the renderer as the caller.

## Hard Invariants

- DomPainter consumes `ResolvedLayout`; it does not run layout, measurement,
  PM-adapter conversion, or style cascade resolution.
- The painter does not perform paint-time DOM measurement of rendered content.
  Required size and offset data must come from the resolved layout.
- The resolved item is the source of truth for painter-read fields. Do not add
  fallback reads from legacy fragment back-pointers.
