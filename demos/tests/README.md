# Demo gallery visual tests

Playwright visual regression tests for the examples listed in `test-config.js`.

## One-time setup

```bash
pnpm --dir examples/tests run bootstrap
# If Playwright browsers are missing:
pnpm --dir examples/tests exec playwright install chromium
```

> `pnpm test` and `pnpm run update-snapshots` automatically run `pnpm run bootstrap` first.

## Run the suite

```bash
pnpm --dir examples/tests test
```

Quick filters:

```bash
# Single project + test name match
pnpm --dir examples/tests test --project=chromium --grep dynamic-content
```

## Update snapshots

```bash
pnpm --dir examples/tests run update-snapshots --project=chromium --grep dynamic-content
```

Or call Playwright directly:

```bash
pnpm --dir examples/tests exec playwright test --update-snapshots --project=chromium --grep dynamic-content
```

Docker (matches CI):

```bash
cd examples/tests
pnpm run docker:update-screenshots
```
