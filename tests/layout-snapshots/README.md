# Layout Snapshot Exporter

Exports layout JSON for every `.docx` under:

- `<repo>/test-corpus`

into candidate snapshots at:

- `<repo>/tests/layout-snapshots/candidate`

while preserving subdirectories and source filename identity.

Prerequisites:

- **bun** is required to run these scripts. All `package.json` scripts and examples below use `bun` as the runner.

Important:

- The exporter wipes the output directory at start of every run, then regenerates all snapshots.
- Editor telemetry is disabled by default.
- Default pipeline is `headless` (no `PresentationEditor` painter path, faster for batch generation).
- Use `--jobs N` to process documents in parallel worker processes.
- Each processed doc logs in a 3-line block (`doc`, `pages+took`, `phases`).
- Long log lines wrap at 120 chars instead of being truncated.
- `Complete in ...` is printed as the final line of output.
- End-of-run output includes average time and phase totals.

Candidate output naming:

- `path/to/file.docx` -> `candidate/path/to/file.docx.layout.json`

## Run

```bash
# Sync corpus locally first (shared with tests/visual)
pnpm corpus:pull

bun tests/layout-snapshots/export-layout-snapshots.mjs
```

## Common commands

```bash
# Fast headless generation (default)
bun tests/layout-snapshots/export-layout-snapshots.mjs --jobs 4

# Limit sample size while iterating
bun tests/layout-snapshots/export-layout-snapshots.mjs --limit 10 --jobs 2

# Fallback to PresentationEditor path for comparison
bun tests/layout-snapshots/export-layout-snapshots.mjs --pipeline presentation --jobs 1

# Telemetry controls
bun tests/layout-snapshots/export-layout-snapshots.mjs --telemetry off
bun tests/layout-snapshots/export-layout-snapshots.mjs --enable-telemetry
```

If native `canvas` is unavailable in your runtime, the script falls back to a mock canvas and warns that metrics are approximate.

## Generate from npm version

Use the wrapper script to install any published `superdoc` version/tag from npm, then run snapshot export against it.

```bash
# Install superdoc@1.12.0 in a temp dir and export to reference/v.1.12.0
bun tests/layout-snapshots/export-layout-snapshots-npm.mjs 1.12.0 --jobs 4

# Use npm tag
bun tests/layout-snapshots/export-layout-snapshots-npm.mjs latest --jobs 4

# Fast smoke run
bun tests/layout-snapshots/export-layout-snapshots-npm.mjs 1.12.0 --limit 10 --jobs 2
```

Versioned reference output root:

- `<repo>/tests/layout-snapshots/reference/v.<resolved-version>/...`

Notes:

- Telemetry is forced off in this wrapper.
- The target version folder is wiped and regenerated on each run.
- The script prints the final version folder path at the end.

## Compare candidate vs reference

Generate a diff report between:

- candidate snapshots at `tests/layout-snapshots/candidate`
- reference snapshots at `tests/layout-snapshots/reference/v.<version>`

The compare script regenerates candidate snapshots before every run (full refresh by default), and auto-generates the
reference version when missing. References are only regenerated when missing/incomplete.

When changed docs are detected, compare now automatically runs `devtools/visual-testing` in local mode for only those
changed docs, using the same reference version as the visual baseline.

```bash
# Compare against a reference version (auto-generates reference if missing)
bun tests/layout-snapshots/compare-layout-snapshots.mjs --reference 1.13.0-next.15

# Disable auto visual post-step
bun tests/layout-snapshots/compare-layout-snapshots.mjs --reference 1.13.0-next.15 --no-visual-on-change

# Fail with non-zero exit if any diffs/missing files are found
bun tests/layout-snapshots/compare-layout-snapshots.mjs --reference 1.13.0-next.15 --fail-on-diff
```

Reports are written under:

- `<repo>/tests/layout-snapshots/reports/<timestamp>-v.<reference>-vs-candidate/`
- plus per-document diff files under the report's `docs/` folder

## Using packed `superdoc.tgz`

If you want to run against a packed build:

1. Build package tarball:

```bash
pnpm run pack:es
```

2. Point exporter at your installed module:

```bash
bun tests/layout-snapshots/export-layout-snapshots.mjs --module superdoc/super-editor --jobs 4
```
