# Layout Engine Tests

Integration/regression tests for the layout engine + painters pipeline.

## Overview

Coverage areas (non-exhaustive):
- SDT metadata propagation (`sdt-metadata.test.ts`)
- Section breaks/page/column layout (basic/edge-case/orientation/regressions)
- Header/footer integration
- Editor parity/toolbar/comment flows
- Collaboration/memory/perf smoke tests (vertical, no DOM)
- Page counts and multi-section scenarios

## Test Structure

Fixtures live in `fixtures/` (DOCX and JSON) and are shared across suites.

## Running Tests

```bash
cd packages/layout-engine/tests
npm test
```

From repo root (workspace):
```bash
npm run test --workspace=@superdoc/layout-tests
```

Memory profiling lane (GC-enabled, isolated):
```bash
npm run test:memory --workspace=@superdoc/layout-tests
```

## Configuration

- **Test Runner**: Vitest (configured via `vitest.config.mjs`)
- **Default Environment**: `happy-dom` (set `VITEST_DOM=node` for Node-only runs)
- **Imports**: Uses JSON fixtures via `assert { type: 'json' }`

### vitest.config.mjs

Key settings:
- Includes `src/**/*.test.ts` files
- No coverage collection (integration tests focus on correctness, not coverage)
- Memory-sensitive leak assertions are intended for `NODE_OPTIONS=--expose-gc` runs

## Adding New Tests

1) Add/extend fixtures in `fixtures/` (DOCX or JSON).  
2) Add test files under `src/` (use `.test.ts`).  
3) Run the suite locally.

## Dependencies

- Relies on `@superdoc/pm-adapter`, `@superdoc/style-engine`, `@superdoc/layout-engine`, `@superdoc/painter-dom`.
- Runner: Vitest (`happy-dom` by default).

## Debugging

If tests fail after SDT schema changes:

1. **Check contracts** (`@superdoc/contracts`) - ensure `SdtMetadata` union types are up to date
2. **Check style-engine** (`@superdoc/style-engine/src/index.ts`) - verify normalization helpers match new attrs
3. **Check PM adapter** (`@superdoc/pm-adapter/src/index.ts`) - confirm SDT unwrapping assigns metadata to blocks/runs
4. **Inspect snapshot diffs** - Vitest will show what changed in the summarized output

## Related Documentation

- Layout engine contracts: `packages/layout-engine/contracts/src/index.ts`
- Style engine SDT parsing: `packages/layout-engine/style-engine/src/index.ts`
- PM adapter SDT handling: `packages/layout-engine/pm-adapter/src/index.ts` (search for `resolveNodeSdtMetadata`)
- Planning docs: `packages/layout-engine/plan/fields-annotations-*.md`
