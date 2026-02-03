# Coding Standards

## TypeScript

- Use strict TypeScript with explicit types for public APIs
- Prefer interfaces over types for object shapes
- Export types alongside implementations
- Use `readonly` for immutable properties

## React Components

- Use functional components with hooks
- Use `forwardRef` when exposing ref methods
- Prefer named exports over default exports
- Co-locate tests: `Component.test.tsx` next to `Component.tsx`

## CSS

- Use flexbox for layouts
- Implement responsive breakpoints:
  - `< 600px`: Mobile
  - `< 900px`: Tablet
  - `> 900px`: Desktop
- Use CSS custom properties (variables) for theming
- Namespace classes with component/package prefix (e.g., `superdoc-*`)

## Testing

- Tests are co-located with source files
- Prefer integration tests over mocks
- Use descriptive test names: `it('should handle X when Y')`
- Run tests before committing: `pnpm test`

## Build Tools

| Package Type | Build Tool |
|--------------|------------|
| Libraries | tsup |
| Applications | Vite |

## Monorepo Commands

```bash
# All packages
pnpm build
pnpm test

# Specific package
pnpm --filter @superdoc/react build
pnpm --filter @superdoc/react test

# Dev server (from examples/)
pnpm dev
```
