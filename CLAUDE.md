# SuperDoc

A document editing and rendering library for the web.

## Architecture: Dual Rendering System

SuperDoc has **two separate rendering systems** that work independently:

| Mode | Package | How it works |
|------|---------|--------------|
| **Editing** | `super-editor` | ProseMirror-based, uses decorations for visual styling |
| **Presentation** | `layout-engine` | Virtualized DOM rendering via DomPainter class |

**Key insight**: Visual changes often need to be implemented in BOTH systems.

### State Communication

State flows from super-editor → Layout Engine via:
- `PresentationEditor.ts` listens to editor events (`super-editor/src/core/presentation-editor/`)
- Calls DomPainter methods to update state
- DomPainter re-renders with new state

## Project Structure

```
packages/
  superdoc/          Main entry point (npm: superdoc)
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
```

## Where to Look

| Task | Location |
|------|----------|
| Editing features | `super-editor/src/extensions/` |
| Presentation mode visuals | `layout-engine/painters/dom/src/renderer.ts` |
| DOCX import/export | `super-editor/src/core/super-converter/` |
| Style resolution | `layout-engine/style-engine/` |
| Main entry point | `superdoc/src/SuperDoc.vue` |

## When to Modify Which System

- **Editing-only**: Modify super-editor decorations/plugins
- **Viewing-only**: Modify DomPainter in layout-engine
- **Both modes**: Modify both and bridge via PresentationEditor

## Commands

- `pnpm build` - Build all packages
- `pnpm test` - Run tests
- `pnpm dev` - Start dev server (from examples/)
