# Testing Guide

How to verify your changes before pushing.

## Quick Reference

| What to verify | Command | Speed | CI Gate |
|---|---|---|---|
| Logic works? | `pnpm test` | ~30s | Hard |
| Editing works? | `pnpm test:behavior` | ~3 min | Hard |
| Layout regressed? | `pnpm test:layout` | ~10 min | Manual |
| Visual pixel diff? | `pnpm test:visual` | ~5 min | Manual |

## Unit Tests

Test pure logic — data transformations, algorithms, style resolution, layout math.

```bash
pnpm test                 # all packages
pnpm test:editor          # super-editor only
pnpm --filter <pkg> test  # specific package
```

Tests are co-located with source code as `feature.test.ts` next to `feature.ts`. Framework: Vitest.

## Behavior Tests

Test editing interactions through a real browser — typing, formatting, tables, comments, tracked changes, clipboard, toolbar.

```bash
pnpm test:behavior                        # all browsers, headless
pnpm test:behavior -- --project=chromium  # single browser
pnpm test:behavior:headed                 # watch the browser
pnpm test:behavior:ui                     # Playwright UI mode
```

These assert on **document state**, not pixels. Located in `tests/behavior/`. See `tests/behavior/README.md` for writing tests.

**First-time setup:**

```bash
pnpm --filter @superdoc-testing/behavior setup   # install browser binaries
```

## Layout Comparison

Compare layout engine output (JSON structure) across ~382 real-world documents against a published npm version. This is the primary tool for catching rendering regressions.

```bash
pnpm test:layout                                    # interactive
pnpm test:layout -- --reference 1.16.0              # specific version
pnpm test:layout -- --match tables --limit 5        # filtered, faster
```

The command handles everything: corpus download, build, snapshot generation, comparison.

**First-time setup:**

```bash
npx wrangler login    # Cloudflare auth for downloading test documents
pnpm test:layout      # downloads corpus automatically on first run
```

After the first run, the corpus is cached locally — no auth needed for subsequent runs.

**Reports** are written to `tests/layout/reports/`. Each report includes:

- `summary.md` — overview with widespread changes and per-doc details
- `summary.json` — machine-readable version of the summary
- `docs/` — per-document `.diff.json` files with detailed diffs

### Reading the Report

The summary separates **unique changes** (diffs specific to a few docs) from **widespread-only** docs (every diff in the doc is a pattern that appears in 50%+ of all changed docs):

```
- Changed docs: 382
  - Unique changes: 2
  - Widespread-only: 380
```

**Widespread changes** are diff patterns appearing in 50%+ of changed docs. These typically represent schema evolution (e.g., a new `margins` field), not regressions. They're listed separately so you can focus on what matters.

### Triage workflow

1. Open `summary.md` — check the changed docs count
2. Skip **Widespread-Only Docs** — these are schema evolution
3. Focus on **Docs With Unique Changes** — open their `.diff.json` files
4. Each diff has `path` (JSONPath), `kind`, `reference`/`candidate` values, and a `widespread` flag
5. Decide if the change is intentional (your PR) or a regression

**Advanced:** For lower-level access, use `pnpm layout:compare` directly. See `tests/layout/README.md`.

## Visual Comparison (Pixel Diff)

After `pnpm test:layout` finds changes, it prints a hint to run pixel comparison. This generates an HTML before/after report showing exactly what changed visually.

```bash
pnpm test:visual    # reads latest layout report, compares changed docs
```

The command automatically:
- Reads the latest layout comparison report
- Extracts documents with unique changes
- Runs pixel-level comparison against the same reference version
- Generates an interactive HTML report in `devtools/visual-testing/results/`

## Uploading Test Documents

Upload a `.docx` file to the shared test corpus (used by layout, visual, and behavior tests):

```bash
pnpm corpus:upload ~/Downloads/my-file.docx
# Prompts for: Linear issue ID, short description
# → uploads as rendering/sd-1741-paragraph-between-borders.docx
```

After uploading, pull it locally with `pnpm corpus:pull` so it's available for all test suites.

## When to Run What

| I changed... | Run |
|---|---|
| A utility function or algorithm | `pnpm test` |
| An editing command or extension | `pnpm test` + `pnpm test:behavior` |
| Layout engine or style resolution | `pnpm test` + `pnpm test:layout` |
| DomPainter rendering | `pnpm test` + `pnpm test:layout` |
| PM adapter (data conversion) | `pnpm test` + `pnpm test:layout` |
| Table rendering or spacing | All three |
| Super-converter (import/export) | `pnpm test` + `pnpm test:layout` |

## CI Behavior

| Suite | Runs on PRs | Blocks merge |
|---|---|---|
| Unit tests | Yes | Yes |
| Behavior tests | Yes (sharded across 3 runners) | Yes |
| Layout comparison | No (run manually) | No |

## Troubleshooting

**`pnpm test:layout` says auth expired:**

```bash
npx wrangler login
```

**Behavior tests fail with port conflict:**

```bash
node scripts/free-port.mjs 9990
pnpm test:behavior
```

**Want to debug a behavior test visually:**

```bash
pnpm test:behavior:headed                          # see the browser
pnpm test:behavior:ui                              # Playwright inspector
pnpm test:behavior:trace                           # record traces
```

**Layout comparison shows many diffs but none are from your PR:**

You're probably comparing against an old npm version. The diffs include all changes on `main` since that release. Use `npm@next` (the default) for the closest baseline to current `main`.
