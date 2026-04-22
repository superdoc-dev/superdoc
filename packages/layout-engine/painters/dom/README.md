# @superdoc/painter-dom

Read-only DOM renderer for the SuperDoc layout engine.

## Responsibilities

- Render pages and fragments produced by `@superdoc/layout-engine`.
- Display static, paginated previews suitable for inspection in the browser.
- Handle rerenders when new layouts are provided.
- Annotate DOM elements with SDT (Structured Document Tag) metadata via `data-sdt-*` attributes for downstream consumers.
- Sanitize hyperlinks and expose link metrics for observability.

## API (read-only)

```ts
import { createDomPainter } from '@superdoc/painter-dom';
import { resolveLayout } from '@superdoc/layout-resolved';

const painter = createDomPainter({
  layoutMode: 'vertical' | 'horizontal' | 'book',
  pageStyles,  // optional style overrides
  headerProvider, // optional per-page header decorations
  footerProvider, // optional per-page footer decorations
  virtualization: { enabled: true, window: 5, overscan: 1 }, // vertical mode only
});

const resolvedLayout = resolveLayout({
  layout,      // from @superdoc/layout-engine
  flowMode: 'paginated',
  blocks,      // FlowBlocks that produced the layout
  measures,    // Measures (parallel to blocks)
});

painter.paint({ resolvedLayout, sourceLayout: layout }, mountElement);
painter.setProviders(newHeader, newFooter); // optional helper for provider changes
```

Notes:
- The painter takes a pre-computed `DomPainterInput` (`{ resolvedLayout, sourceLayout }`). Callers run `resolveLayout` (from `@superdoc/layout-resolved`) to convert a raw `Layout` + blocks/measures into the resolved form before painting.
- Virtualization is opt-in and only supported in vertical mode (windowed pages with spacers).
- Renderer is read-only: no editing/input handling is included here.
