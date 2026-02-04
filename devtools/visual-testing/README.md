# SuperDoc Visual Testing

Visual and interaction snapshot testing for SuperDoc, with HTML reports.

**In cloud mode, baselines are not stored in this repo.** Generate baselines for the SuperDoc versions you want to compare against, then run a comparison. (Local mode stores baselines in `./baselines`.)

## Quick start

1. Set the SuperDoc version (or local path). Default is the workspace package.
   - `pnpm superdoc 1.5.0-next.6`
   - `pnpm superdoc /path/to/superdoc` (must already be built/packed)
   - `pnpm superdoc local` (use workspace superdoc)
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
- Baselines are stored in `./baselines` and `./baselines-interactions`
- Screenshots/results are stored in `./screenshots` and `./results`
- No R2 env vars required
- If a baseline is missing, `pnpm compare` will generate it automatically

Examples:
- `pnpm baseline --local --docs /path/to/docs`
- `pnpm compare --local --docs /path/to/docs`
- `pnpm generate:visual --local --docs /path/to/docs --filter layout`

## Commands

- `pnpm superdoc <version|path>` set the SuperDoc version used by the harness.
- `pnpm superdoc local` use the workspace superdoc package.
- `pnpm superdoc:version` show the current installed SuperDoc version.
- `pnpm generate` generate visual + interaction snapshots.
- `pnpm generate:visual` generate visual snapshots only.
- `pnpm generate:interactions` generate interaction snapshots only.
- `pnpm baseline` generate visual + interaction baselines.
- `pnpm baseline:visual` generate visual baselines only.
- `pnpm baseline:interactions` generate interaction baselines only.
- `pnpm compare` compare visual + interaction snapshots.
- `pnpm compare:visual` compare visual snapshots only.
- `pnpm compare:interactions` compare interaction snapshots only.
- `pnpm upload --folder <name> <file.docx>` upload a single docx into the corpus and update `registry.json`.
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

## Common flags

- `--filter <prefix>` match by path/story prefix (e.g. `layout`, `sd-1401`).
- `--match <text>` match by substring anywhere in path/story.
- `--exclude <prefix>` skip by path/story prefix.
- Repeat `--filter`, `--match`, or `--exclude` to combine multiple values.
- `--force` regenerate baselines even if they already exist.
- `--skip-existing` skip docs/stories that already have outputs.
- `--threshold <n>` set diff threshold (compare).
- `--browser <chromium|firefox|webkit>[,...]` run tests for a specific browser (or comma-separated subset).
- Default is **all browsers** when `--browser` is omitted. Use `--browser chromium` to run just one.
- `SUPERDOC_TEST_BROWSER=<list>` env var can be used instead of `--browser`.
- Running all browsers requires Playwright browsers installed: `pnpm exec playwright install`
- `--local` use local docs and local baselines/results (no R2).
- `--docs <path>` local docs root (required when using `--local`).

## Multi-browser baselines

- Baselines and results are stored per browser.
  - Visual: `baselines/v.X.Y/<browser>/...`, `screenshots/<run>/<browser>/...`
  - Interactions: `baselines-interactions/v.X.Y/<browser>/...`, `screenshots/<run>/interactions/<browser>/...`
- Legacy baselines without a browser folder are treated as `chromium` during compare.
- If multiple browsers run, reports/diffs are written under `results/<run>/<browser>/...`.

## Reports

- Single browser:
  - Visual report: `results/<run>/report.html`
  - Interaction report: `results/<run>/interactions-report.html`
- Multiple browsers:
  - Visual report: `results/<run>/<browser>/report.html`
  - Interaction report: `results/<run>/<browser>/interactions-report.html`

Open the HTML file in your browser.

Word comparisons are opt-in. Use `--include-word` and install `superdoc-benchmark` globally.

## Interaction stories

Stories live in `tests/interactions/stories`.

How to add a story:

1. Copy `tests/interactions/stories/_template.ts`.
2. Rename the file to your story name.
3. Update the `name`, `description`, and `run` steps.
4. Add `milestone()` calls where you want screenshots.

Run a single story:

- `pnpm generate:interactions --filter your-story-name`
- `pnpm baseline:interactions --filter your-story-name`
- `pnpm compare:interactions --filter your-story-name`
