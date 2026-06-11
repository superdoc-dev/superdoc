# Testing Guide

How to verify your changes before pushing.

## Quick Reference

| What to verify | Command | Speed | CI Gate |
|---|---|---|---|
| Logic works? | `pnpm test` | ~30s | Hard |
| Document API smoke? | `pnpm test:document-api-smoke` | ~1 min | Hard |
| Editing works? | `pnpm test:behavior` | ~3 min | Hard |
| Visual pixel diff? | `pnpm --dir tests/visual test` | ~5 min | Soft |

## Unit Tests

Test pure logic — data transformations, algorithms, style resolution, layout math.

```bash
pnpm test                 # all packages
pnpm test:editor          # super-editor only
pnpm --filter <pkg> test  # specific package
```

Tests are co-located with source code as `feature.test.ts` next to `feature.ts`. Framework: Vitest.

## Document API Smoke

SuperDoc keeps only low-detail Document API guardrails in this repo:

```bash
pnpm test:document-api-smoke
```

That smoke suite checks representative namespace/method presence and a
small SDK open/read/mutate/save/reopen workflow.

Additional conformance coverage may exist outside this repo in a separate
checkout.

If you maintain a separate conformance checkout, run it from there:

```bash
cd /path/to/conformance-repo
SUPERDOC_REPO=/path/to/superdoc3 pnpm run test:document-api-conformance:report
SUPERDOC_REPO=/path/to/superdoc3 pnpm run test:document-api-conformance
```

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

## Visual Comparison (Pixel Diff)

Playwright visual regression tests that screenshot rendered documents and compare them pixel-by-pixel against R2-stored baselines. Located in `tests/visual/`.

```bash
cd tests/visual
pnpm docs:download    # sync the shared test corpus from R2 (first time / new docs)
pnpm test             # run the visual suite
pnpm report           # view the HTML report
```

Baselines are generated in CI from the `stable` branch — never locally (macOS font rendering differs from Linux). See `tests/visual/README.md` for setup (R2 env vars, wrangler auth) and `tests/visual/AGENTS.md` for fixture details.

Bulk layout regression comparison across the full corpus is maintainer-internal tooling and no longer lives in this repo.

## Uploading Test Documents

Upload a `.docx` file to the shared test corpus (used by visual and behavior tests):

```bash
pnpm --dir tests/visual docs:upload ./path/to/my-file.docx
# Prompts for: issue ID or short description
# -> uploads as rendering/paragraph-between-borders.docx
```

After uploading, pull it locally with `pnpm --dir tests/visual docs:download` so it's available for all test suites.

## When to Run What

| I changed... | Run |
|---|---|
| A utility function or algorithm | `pnpm test` |
| An editing command or extension | `pnpm test` + `pnpm test:behavior` |
| Layout engine or style resolution | `pnpm test` + `pnpm --dir tests/visual test` |
| DomPainter rendering | `pnpm test` + `pnpm --dir tests/visual test` |
| PM adapter (data conversion) | `pnpm test` + `pnpm --dir tests/visual test` |
| Table rendering or spacing | All three |
| Super-converter (import/export) | `pnpm test` + `pnpm --dir tests/visual test` |

## CI Behavior

| Suite | Runs on PRs | Blocks merge |
|---|---|---|
| Unit tests | Yes | Yes |
| Behavior tests | Yes (sharded across 3 runners) | Yes |
| Visual tests | Yes (on rendering-related paths) | No (soft gate — diffs post a PR comment) |

## Troubleshooting

**Corpus download (`pnpm docs:download` in `tests/visual`) says auth expired or missing:**

```bash
npx wrangler login
```

R2 account ids and bucket names must be set via env vars (see `tests/visual/.env.example`).

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
