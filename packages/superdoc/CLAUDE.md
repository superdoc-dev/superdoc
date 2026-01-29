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
See `super-editor/src/core/presentation-editor/` for implementation.

## Testing

- Unit tests: `src/SuperDoc.test.js`
- Integration tests: `src/tests/`

Run: `pnpm test` from package root
