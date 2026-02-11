# SuperDoc Visual Testing

Rendering and behavior snapshot testing for SuperDoc.

- **Rendering** — screenshots every page of a `.docx` file (no interaction)
- **Behavior** — runs scripted user actions ("stories") and captures milestones

## Quick start

```bash
cd devtools/visual-testing
pnpm install

# Set SuperDoc version
pnpm superdoc 1.5.0-next.6        # npm version
pnpm superdoc local                # workspace build

# Create baselines and compare
pnpm baseline 1.4.0
pnpm compare
```

## Common workflows

```bash
# Generate + compare rendering only
pnpm generate:rendering --filter layout
pnpm compare:rendering

# Generate + compare behavior only
pnpm generate:behavior --filter editing
pnpm compare:behavior

# Compare everything
pnpm compare

# Compare two versions
pnpm compare 1.4.0 --target 1.5.0-next.5

# Local mode (no R2)
pnpm compare --local --docs /path/to/docs
```

## Adding a behavior story

1. Copy `tests/behavior/stories/_template.ts` into the right category folder
2. Update `name`, `description`, and `run` steps
3. Test: `pnpm generate:behavior --filter your-story-name`

Story categories: `editing/`, `tables/`, `formatting/`, `comments/`, `track-changes/`, `field-annotations/`, `headers/`, `lists/`, `search/`, `importing/`

## Flags

| Flag | Description |
|------|-------------|
| `--filter <prefix>` | Match by path/story prefix |
| `--match <text>` | Match substring anywhere |
| `--exclude <prefix>` | Skip matching items |
| `--browser <name>` | Chromium (default), firefox, webkit |
| `--local` | No R2, use local files only |
| `--docs <path>` | Local docs root (required with `--local`) |
| `--force` | Regenerate even if exists |

## Reports

After `pnpm compare`, open the HTML report:

```bash
open results/<run>/report.html              # rendering
open results/<run>/behavior-report.html     # behavior
```

## R2 cloud mode

Requires env vars: `SD_TESTING_R2_ACCOUNT_ID`, `SD_TESTING_R2_BUCKET_NAME`, `SD_TESTING_R2_BASELINES_BUCKET_NAME`, `SD_TESTING_R2_ACCESS_KEY_ID`, `SD_TESTING_R2_SECRET_ACCESS_KEY`

See `CLAUDE.md` for architecture details, helpers reference, and selector docs.
