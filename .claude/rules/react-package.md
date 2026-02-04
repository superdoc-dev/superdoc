---
paths:
  - "packages/react/**/*"
---

# React Package Guidelines

## Package Identity

- Package name: `@superdoc-dev/react`
- Dependency: `superdoc` is a regular dependency (auto-installed)
- Peer dependencies: `react` and `react-dom` >= 16.8.0

## Type System

Types are extracted from `superdoc` constructor to stay in sync:

```typescript
type SuperDocConstructorConfig = ConstructorParameters<typeof SuperDoc>[0];
export type DocumentMode = NonNullable<SuperDocConstructorConfig['documentMode']>;
```

## Component Design

- Client-only rendering (returns `null` or `renderLoading()` on server)
- Use `CSS.escape()` for selector strings from user input
- Gate initialization on `isClient` state to ensure DOM exists

## Props Categories

1. **Rebuild triggers**: `document`, `user`, `users`, `modules`, `role`, `hideToolbar`
2. **Efficient updates**: `documentMode` (calls `setDocumentMode()`)
3. **Initial-only**: Other props require `getInstance()` for runtime changes

## Release Process

- Tag format: `react-v${version}`
- Branches: `stable` (latest), `main` (next)
- Uses semantic-release with pnpm plugin
