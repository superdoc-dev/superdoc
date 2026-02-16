# Layout Snapshot Exporter

Exports layout JSON for every `.docx` under:

- `<repo>/test-corpus`

into candidate snapshots at:

- `<repo>/tests/layout-snapshots/candidate`

while preserving subdirectories and source filename identity.

Prerequisites:

- Run commands from the repo root with `pnpm`.
- Pull the corpus before running any snapshot command: `pnpm corpus:pull`.

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
# One-time setup (repeat whenever corpus contents change)
pnpm corpus:pull

pnpm layout:snapshots
```

## Common commands

```bash
# Fast headless generation (default via package script)
pnpm layout:snapshots

# Limit sample size while iterating
pnpm layout:snapshots -- --limit 10 --jobs 2

# Fallback to PresentationEditor path for comparison
pnpm layout:snapshots -- --pipeline presentation --jobs 1

# Telemetry controls
pnpm layout:snapshots -- --telemetry off
pnpm layout:snapshots -- --enable-telemetry
```

If native `canvas` is unavailable in your runtime, the script falls back to a mock canvas and warns that metrics are approximate.

## Generate from npm version

Use the wrapper script to install any published `superdoc` version/tag from npm, then run snapshot export against it.

```bash
# Install superdoc@1.12.0 in a temp dir and export to reference/v.1.12.0
pnpm layout:snapshots:npm -- 1.12.0

# Use npm tag
pnpm layout:snapshots:npm -- latest

# Fast smoke run
pnpm layout:snapshots:npm -- 1.12.0 --limit 10 --jobs 2
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
# Compare against npm superdoc@next (default when --reference is omitted)
pnpm layout:compare

# Compare against a specific reference version (auto-generates reference if missing)
pnpm layout:compare -- --reference 1.13.0-next.15

# Disable auto visual post-step
pnpm layout:compare -- --reference 1.13.0-next.15 --no-visual-on-change

# Fail with non-zero exit if any diffs/missing files are found
pnpm layout:compare -- --reference 1.13.0-next.15 --fail-on-diff
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
pnpm layout:snapshots -- --module superdoc/super-editor --jobs 4
```
