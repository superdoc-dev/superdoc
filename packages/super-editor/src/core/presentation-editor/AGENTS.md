# PresentationEditor

Wraps a hidden ProseMirror `Editor` and renders via the layout-engine pipeline (`DomPainter`).

## DOM Hierarchy

```
host app scroll container (e.g. .dev-app__main, overflow: auto)  ← actual scroll viewport
  └── #visibleHost (.presentation-editor, overflow: visible)       ← options.element, NOT scrollable
       └── #viewportHost
            └── #painterHost (.presentation-editor__pages)         ← has overflow CSS but NOT the scroller
                 └── page elements (data-page-index)
```

- `#visibleHost` is the element passed as `options.element` — it is **not** the scroll container.
- `#scrollContainer` is computed at setup via `#findScrollableAncestor(#visibleHost)` — it walks up the DOM to find the first ancestor with `overflow: auto/scroll`. This is the element that actually scrolls.
- When implementing scroll-related features, always use `#scrollContainer` (not `#visibleHost`) for scroll position reads/writes.
- `#scrollPageIntoView` sets `#visibleHost.scrollTop` which only works if `#visibleHost` happens to be scrollable — this is a known inconsistency; prefer using `#scrollContainer`.

## Key Files

| File | Purpose |
|------|---------|
| `PresentationEditor.ts` | Main class — lifecycle, layout orchestration, scroll, zoom |
| `pointer-events/EditorInputManager.ts` | Click/drag handling, link clicks, selection |
| `utils/AnchorNavigation.ts` | TOC / bookmark navigation logic |
| `dom/PageDom.ts` | DOM queries for page elements |
| `tests/` | Unit tests for PresentationEditor features |
