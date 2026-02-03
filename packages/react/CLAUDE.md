# @superdoc/react

React wrapper for SuperDoc. Published as `@superdoc/react` on npm.

## Overview

This package provides `<SuperDocEditor>`, a React component that wraps the core `superdoc` library. It handles lifecycle management, SSR safety, and provides a React-idiomatic API.

## Quick Navigation

| Area | Path | Purpose |
|------|------|---------|
| Main component | `src/SuperDocEditor.tsx` | React component with forwardRef |
| Type definitions | `src/types.ts` | Props and ref interfaces |
| Utilities | `src/utils.ts` | `useStableId` hook for SSR-safe IDs |
| Exports | `src/index.ts` | Public API surface |
| Tests | `src/SuperDocEditor.test.tsx` | Component tests |
| Styles | `style.css` | Re-exports superdoc/style.css |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  <SuperDocEditor>                                   │
│  ┌───────────────────────────────────────────────┐  │
│  │  useEffect: Dynamic import of superdoc        │  │
│  │  → Creates SuperDoc instance                  │  │
│  │  → Attaches to container ref                  │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │  useImperativeHandle: Expose ref methods      │  │
│  │  → setDocumentMode, export, getHTML, etc.     │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │  Render:                                      │  │
│  │  → Loading state (renderLoading prop)         │  │
│  │  → Container div (superdoc mounts here)       │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

## Key Implementation Details

### SSR Safety

The component uses dynamic `import()` to load superdoc only on the client:

```typescript
useEffect(() => {
  let destroyed = false;

  import('superdoc').then(({ SuperDoc }) => {
    if (destroyed) return;
    // Create instance...
  });

  return () => { destroyed = true; };
}, []);
```

### Stable ID Generation

Uses `useRef` instead of `useId` for React 16.8+ compatibility:

```typescript
// src/utils.ts
let counter = 0;
export function useStableId(prefix = 'superdoc') {
  const idRef = useRef<string | null>(null);
  if (idRef.current === null) {
    idRef.current = `${prefix}-${counter++}`;
  }
  return idRef.current;
}
```

### Document Change Detection

The component rebuilds when `document` prop changes by including it in the useEffect dependency array. This is intentional - changing documents requires a full rebuild.

### Mode Changes

Mode can be changed two ways:

1. **Via prop** (causes rebuild): `<SuperDocEditor documentMode="viewing" />`
2. **Via ref** (no rebuild): `ref.current?.setDocumentMode('viewing')`

The ref method is preferred for runtime mode switching.

## Props → SuperDoc Config Mapping

| React Prop | SuperDoc Config |
|------------|-----------------|
| `document` | `document` |
| `documentMode` | `documentMode` |
| `role` | `role` |
| `user` | `user` |
| `users` | `users` |
| `toolbar` | `toolbar` |
| `rulers` | `rulers` |
| `pagination` | `pagination` |
| `modules` | `modules` |
| `config` | Spread into config |

## Ref Methods

All ref methods delegate to the underlying SuperDoc instance:

```typescript
useImperativeHandle(ref, () => ({
  getInstance: () => instanceRef.current,
  setDocumentMode: (mode) => instanceRef.current?.setDocumentMode(mode),
  export: (opts) => instanceRef.current?.export(opts),
  // ... etc
}));
```

Methods return `undefined` or empty arrays before initialization for safety.

## Event Callbacks

Props like `onReady`, `onEditorCreate`, etc. are passed directly to SuperDoc's event handlers:

```typescript
const superdoc = new SuperDoc({
  // ... other config
  onReady: (event) => props.onReady?.(event),
  onEditorCreate: (event) => props.onEditorCreate?.(event),
});
```

## Common Tasks

| Task | How |
|------|-----|
| Add new prop | Add to `SuperDocEditorProps` in `types.ts`, pass to SuperDoc config |
| Add new ref method | Add to `SuperDocRef` interface, implement in `useImperativeHandle` |
| Change container structure | Modify JSX in `SuperDocEditor.tsx` |
| Add new event callback | Add to props type, pass to SuperDoc constructor |

## Testing

Tests use the real superdoc library (no mocks) for integration testing:

```bash
pnpm --filter @superdoc/react test
```

Test file: `src/SuperDocEditor.test.tsx`

## Build

Uses tsup for bundling:

```bash
pnpm --filter @superdoc/react build
```

Outputs:
- `dist/index.js` (ESM)
- `dist/index.cjs` (CommonJS)
- `dist/index.d.ts` (TypeScript declarations)

## Example App

See `examples/react-wrapper/` for a full demo with:
- File upload
- Mode switching
- Events logging
- HTML export
- Search functionality
- Responsive layout

Run: `pnpm --filter react-wrapper-example dev`
