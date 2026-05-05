# @superdoc/painter-dom

Read-only DOM renderer for the SuperDoc layout engine.

## Responsibilities

- Render pages and fragments produced by `@superdoc/layout-engine`.
- Display static, paginated previews suitable for inspection in the browser.
- Handle rerenders when new layouts are provided.
- Annotate DOM elements with SDT (Structured Document Tag) metadata via `data-sdt-*` attributes for downstream consumers.
- Sanitize hyperlinks and expose link metrics for observability.

## API (read-only)

DomPainter consumes a single paint-ready input, `ResolvedLayout`, produced
upstream by `@superdoc/layout-resolved`. It does not run layout, measurement,
or pm-adapter logic itself.

```ts
import { createDomPainter } from '@superdoc/painter-dom';
import { resolveLayout } from '@superdoc/layout-resolved';

const painter = createDomPainter({
  layoutMode: 'vertical' | 'horizontal' | 'book',
  pageStyles,                                                // optional style overrides
  headerProvider,                                            // optional per-page header decorations
  footerProvider,                                            // optional per-page footer decorations
  virtualization: { enabled: true, window: 5, overscan: 1 }, // vertical mode only
});

const resolvedLayout = resolveLayout({ layout, flowMode, blocks, measures });
painter.paint({ resolvedLayout }, mountElement);
painter.setProviders(newHeader, newFooter); // optional helper for provider changes
```

Notes:
- `paint()` takes only `{ resolvedLayout }` — no raw `Layout`, `blocks`, or `measures`.
- Header/footer providers must return a `PageDecorationPayload` whose `items` are
  aligned 1:1 with `fragments` (same length, same order).
- Virtualization is opt-in and only supported in vertical mode (windowed pages with spacers).
- Renderer is read-only: no editing/input handling is included here.
