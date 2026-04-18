# SuperDoc Package

Main library entry point. Published as `superdoc` on npm.

## Overview

This package provides the `SuperDoc` Vue component that combines:
- `super-editor` for editing mode
- `layout-engine` for presentation/viewing mode

## Quick Navigation

| Area | Path | Purpose |
|------|------|---------|
| Main component | `src/SuperDoc.vue` | Primary Vue component |
| Core setup | `src/core/SuperDoc.js` | Instance creation and configuration |
| Stores | `src/stores/` | Vue stores for state management |
| Composables | `src/composables/` | Vue composition utilities |
| Helpers | `src/helpers/` | Utility functions |

## Entry Points

- `src/SuperDoc.vue` - Main Vue component
- `src/index.js` - Public API exports
- `src/core/SuperDoc.js` - Core instance logic

## Public API

```javascript
import { SuperDoc } from 'superdoc';

// Create instance
const superdoc = new SuperDoc({
  selector: '#editor',
  document: docxArrayBuffer,
  mode: 'edit', // or 'view'
  // ... options
});

// Key methods
superdoc.setMode('view');
superdoc.getDocument();
superdoc.destroy();
```

## Integration Patterns

### Edit Mode
Uses `super-editor` for full document editing with ProseMirror.

### View/Presentation Mode
Uses `layout-engine` for virtualized rendering with pagination.

### Mode Switching
`PresentationEditor.ts` bridges state between modes.
See `super-editor/src/editors/v1/core/presentation-editor/` for implementation.

### Fixed-height container embedding
By default SuperDoc expands to the document's full height. To embed it inside a fixed-height container (panel, sidebar, modal, dashboard widget), pass `contained: true`. The parent element must have a definite height.

```javascript
new SuperDoc({
  selector: '#editor',
  document: file,
  contained: true,
});
```

## Theming

SuperDoc UI is themed via `--sd-*` CSS variables. Use `createTheme()` for JS-based theming or set variables directly in CSS.

```javascript
import { createTheme } from 'superdoc';

const theme = createTheme({
  colors: { action: '#6366f1', bg: '#ffffff', text: '#1e293b', border: '#e2e8f0' },
  font: 'Inter, sans-serif',
  vars: { '--sd-ui-toolbar-bg': '#f8fafc' }, // escape hatch for any --sd-* variable
});

document.documentElement.classList.add(theme);
```

- `createTheme()` / `buildTheme()` — `src/core/theme/create-theme.js`
- CSS variable defaults — `src/assets/styles/helpers/variables.css`
- Preset themes — `src/assets/styles/helpers/themes.css`
- Backward-compat aliases — `src/assets/styles/helpers/compat.css`
- Consumer-facing agent guide — `AGENTS.md` (ships with npm package)
## Testing

- Unit tests: `src/SuperDoc.test.js`
- Integration tests: `src/tests/`

Run: `pnpm test` from package root
