# Coding Standards

## TypeScript

- Use explicit types for function parameters and return values
- Prefer `interface` over `type` for object shapes
- Use `type` for unions, intersections, and utility types
- Extract types from source packages using `ConstructorParameters`, `NonNullable`, etc. to stay in sync

## React Components

- Use functional components with hooks
- Use `forwardRef` when exposing ref methods
- Store callbacks in refs to avoid unnecessary re-renders
- Prefer `getInstance()` escape hatch over wrapping every method

## Testing

- Use `waitFor` with predicates instead of fixed delays
- Test both happy path and error cases
- Mock external dependencies appropriately

## Documentation

- Document which props trigger rebuilds vs are initial-only
- Keep README focused and practical with code examples
- Update CLAUDE.md files when adding new packages or patterns
