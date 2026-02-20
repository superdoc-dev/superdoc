# SuperDoc Visual Testing

Visual snapshot testing for SuperDoc, with HTML reports.

**In cloud mode, baselines are not stored in this repo.** Generate baselines for the SuperDoc versions you want to compare against, then run a comparison. (Local mode stores baselines in `./baselines`.)

## Quick start

Install dependencies from this folder (separate workspace):

```bash
cd devtools/visual-testing
pnpm install
```

1. Set the SuperDoc version (or local path). Default is the version in `packages/harness/package.json`.
   - `pnpm superdoc 1.5.0-next.6`
   - `pnpm superdoc /path/to/superdoc` (must already be built/packed)
   - `pnpm superdoc local` (pack local repo superdoc; only works when this folder lives inside the repo)
2. Create baselines:
   - `pnpm baseline` (uses current installed version)
   - `pnpm baseline 1.4.0` (switches to that version first)
3. Run a comparison:
   - `pnpm compare`

## Cloud mode (R2)

This repo can load documents from Cloudflare R2. Configure via env vars (no secrets stored in this repo).

Required env vars:
- `SD_TESTING_R2_ACCOUNT_ID`
- `SD_TESTING_R2_BUCKET_NAME`
- `SD_TESTING_R2_BASELINES_BUCKET_NAME`
- `SD_TESTING_R2_ACCESS_KEY_ID`
- `SD_TESTING_R2_SECRET_ACCESS_KEY`

Baselines are uploaded to the `SD_TESTING_R2_BASELINES_BUCKET_NAME` bucket when you run `pnpm baseline`.
Local baselines are written to a temporary directory and removed after upload.
Comparisons download baselines from R2 into a local cache (default: `/tmp/superdoc-baselines-cache`).
Override the temp root with `R2_BASELINES_TMP_DIR` and the cache root with `R2_BASELINES_CACHE_DIR` if needed.

## Local mode (no R2)

Use local docs and store baselines/results on disk with:

- `--local` enable local mode (no cloud access)
- `--docs <path>` required in local mode; points to a folder containing `.docx` files (nested folders OK)

Behavior in local mode:
- Baselines are stored in `./baselines`
- Screenshots/results are stored in `./screenshots` and `./results`
- No R2 env vars required
- If a baseline is missing, `pnpm compare` will generate it automatically

Examples:
- `pnpm baseline --local --docs /path/to/docs`
- `pnpm compare --local --docs /path/to/docs`
- `pnpm generate:visual --local --docs /path/to/docs --filter layout`

## Commands

- `pnpm superdoc <version|path>` set the SuperDoc version used by the harness.
- `pnpm superdoc /path/to/superdoc` use a local repo build (monorepo root or packages/superdoc).
- `pnpm superdoc local` pack and install the local repo superdoc tarball (requires repo checkout).
- `pnpm superdoc:version` show the current installed SuperDoc version.
- `pnpm generate` generate visual snapshots.
- `pnpm generate:visual` generate visual snapshots.
- `pnpm baseline` generate visual baselines.
- `pnpm baseline:visual` generate visual baselines.
- `pnpm compare` compare visual snapshots.
- `pnpm compare:visual` compare visual snapshots.
- `pnpm upload --folder <name> <file.docx>` upload a single docx via the shared repo corpus CLI and update `registry.json`.
- `pnpm get-corpus [dest] --filter <name>` download corpus docs via the shared repo corpus CLI (default: `./test-docs`).
- `pnpm get-docx <path>` download a single docx into a temp folder (prints the local path).
- `pnpm filters` list filterable folders for `--filter`.
- `pnpm clear:all` remove all baselines, screenshots, and results.
- `pnpm test` run tests.

## Compare targets

- `pnpm compare 1.4.0 --target 1.5.0-next.5`
- `pnpm compare --target /path/to/superdoc` (uses the latest baseline)
- `pnpm compare 1.7.0 --target 1.8.0-next.5 --compare-baselines` (compare two existing baselines without generating new screenshots)

Notes:
- `--target` compares two versions (or a version vs a local path). It uses existing baselines in R2 and generates fresh results.
- `--target` cannot be used with `--folder`.
- `--target` is supported on compare commands (not on generate).
- If `packages/superdoc/superdoc.tgz` exists, compare will auto-switch to it when no `--target` or `--folder` is provided.

## Common flags

- `--filter <prefix>` match by path prefix (e.g. `layout`, `sd-1401`).
- `--match <text>` match by substring anywhere in path.
- `--exclude <prefix>` skip by path prefix.
- `--doc <relative.docx>` target specific corpus docs on visual commands (repeatable), e.g. `comments-tcs/basic-comments.docx`.
- Repeat `--filter`, `--match`, or `--exclude` to combine multiple values.
- `--force` regenerate baselines even if they already exist.
- `--skip-existing` skip docs/stories that already have outputs.
- `--threshold <n>` set diff threshold (compare).
- `--browser <chromium|firefox|webkit>[,...]` run tests for a specific browser (or comma-separated subset).
- Default is **all browsers** when `--browser` is omitted. Use `--browser chromium` to run just one.
- `SUPERDOC_TEST_BROWSER=<list>` env var can be used instead of `--browser`.
- Running all browsers requires Playwright browsers installed: `pnpm exec playwright install`
- `--refresh-baselines` re-download baseline files from R2 for the current filters (or full baseline if no filters).
- `--local` use local docs and local baselines/results (no R2).
- `--docs <path>` local docs root (required when using `--local`).
- `--ci` or `--silent` hide per-doc logs and show progress only (CI-friendly).

## Multi-browser baselines

- Baselines and results are stored per browser.
  - `baselines/v.X.Y/<browser>/...`, `screenshots/<run>/<browser>/...`
- Legacy baselines without a browser folder are treated as `chromium` during compare.
- If multiple browsers run, reports/diffs are written under `results/<run>/<browser>/...`.

## Reports

- Single browser: `results/<run>/report.html`
- Multiple browsers: `results/<run>/<browser>/report.html`

Open the HTML file in your browser.

Word comparisons are opt-in. Use `--include-word` and install `superdoc-benchmark` globally.

## Word Overlay In Report (Visual Only)

Visual reports now include a per-document `Show Word Overlay` button next to `Open in Word`.

What it does:
- captures a fresh Word reference for that document through the local sidecar
- overlays the Word page on top of both `Baseline` and `Actual` images
- exposes overlay controls (opacity + blend mode) in the report

Requirements:
- `superdoc-benchmark` installed globally (`npm i -g @superdoc-dev/visual-benchmarks`)
- sidecar running from repo root: `pnpm word-benchmark-sidecar`

Notes:
- the report calls `http://127.0.0.1:9185` by default; override with `?wordOverlayService=http://host:port`
