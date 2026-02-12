# Visual Testing

Playwright-based visual regression tests for SuperDoc. Everything lives in a single R2 bucket (`superdoc-visual-testing`) with two prefixes: `documents/` for test files and `baselines/` for screenshots.

## Quick Start

```bash
cd tests/visual

# Download test documents from R2 (first time only)
pnpm docs:download

# Run all tests
pnpm test

# Run a specific category
pnpm exec playwright test tests/behavior/formatting/

# Run a single test
pnpm exec playwright test tests/behavior/basic-commands/undo-redo.spec.ts

# Run one browser only
pnpm exec playwright test --project=chromium

# Update local snapshots
pnpm test:update

# View the HTML report
pnpm report
```

## Test Types

**Behavior** (`tests/behavior/`) — Simulate user interactions (typing, formatting, commands) and screenshot the result. Organized by category:

- `basic-commands/` — typing, undo/redo, tables, select-all, toolbar, drag selection
- `formatting/` — bold/italic, hyperlinks, clear format, style inheritance, fonts
- `comments-tcs/` — comments, track changes, nested comments
- `lists/` — list creation, indentation, markers
- `field-annotations/` — field annotation types and formatting
- `headers/` — header/footer editing
- `search/` — search and navigation
- `importing/` — document import edge cases
- `structured-content/` — SDT lock modes

**Rendering** (`tests/rendering/`) — Auto-discovers all `.docx` files in `test-data/rendering/` and screenshots each page. Tagged with `@rendering` for baseline filtering. Drop a file in the folder = new test.

## Adding a Test

### Behavior test (no document needed)

```ts
import { test } from '../../fixtures/superdoc.js';

test('@behavior description of what it tests', async ({ superdoc }) => {
  await superdoc.type('Hello');
  await superdoc.bold();
  await superdoc.type(' world');
  await superdoc.screenshot('my-test-name');
});
```

### Rendering test (no code needed)

Rendering tests are auto-discovered from `test-data/rendering/`. Just upload a document:

```bash
pnpm docs:upload ~/Downloads/my-doc.docx
# Prompts for: Linear issue ID, short description
# → uploads as documents/rendering/sd-1679-anchor-table-overlap.docx

pnpm docs:download        # pull the new file locally
pnpm test                 # verify it loads and renders
```

No spec file needed — `rendering.spec.ts` auto-discovers all `.docx` files. Baselines are generated in CI from the `stable` branch (not locally — macOS font rendering differs from Linux).

## R2 Storage

Everything lives in one bucket. The folder structure mirrors the test structure:

```
superdoc-visual-testing/
  documents/                    Test .docx files
    behavior/
      comments-tcs/             Documents for comments-tcs tests
      formatting/               Documents for formatting tests
      ...
    rendering/                  Documents for rendering tests
  baselines/                    Screenshot baselines (auto-generated)
    behavior/
      basic-commands/
        type-basic-text.spec.ts-snapshots/
          chromium/
          firefox/
          webkit/
      ...
    rendering/
      ...
```

| Command | What it does |
|---------|-------------|
| `pnpm docs:download` | Download all documents from R2 → `test-data/` |
| `pnpm docs:upload <file>` | Upload a rendering test document to R2 (prompts for issue ID and description) |

## Fixture Helpers

| Method | Description |
|--------|-------------|
| `type(text)` | Type text into the editor |
| `press(key)` | Press a key (e.g. `'Enter'`, `'Shift+Tab'`) |
| `newLine()` | Press Enter |
| `shortcut(key)` | Cmd/Ctrl + key |
| `bold()` / `italic()` / `underline()` | Toggle formatting |
| `undo()` / `redo()` | Undo/redo |
| `selectAll()` | Select all content |
| `tripleClickLine(index)` | Select a line by index |
| `executeCommand(name, args?)` | Run an editor command |
| `setDocumentMode(mode)` | Set editing/suggesting/viewing mode |
| `setTextSelection(from, to?)` | Set cursor position |
| `clickOnLine(index, xOffset?)` | Single click on a line |
| `clickOnCommentedText(text)` | Click on comment highlight |
| `pressTimes(key, count)` | Press a key multiple times |
| `waitForStable(ms?)` | Wait for layout to settle (default 1500ms) |
| `screenshot(name)` | Full-page screenshot |
| `loadDocument(path)` | Load a .docx file |
| `assertPageCount(n)` | Assert number of rendered pages |
| `screenshotPages(baseName)` | Screenshot each rendered page |

## Fixture Config

Override defaults with `test.use()`:

```ts
test.use({
  config: {
    layout: true,           // layout engine (default: true)
    toolbar: 'full',        // 'none' | 'minimal' | 'full'
    comments: 'on',         // 'off' | 'on' | 'panel' | 'readonly'
    trackChanges: true,
    hideSelection: false,   // show selection overlay in screenshots
    hideCaret: false,        // show caret in screenshots
  },
});
```

## Baselines & CI

- **Visual tests** (`pnpm test`) — pixel-diff screenshots. Soft gate in CI — failures post a PR comment with a link to the HTML report for review.
- **Baseline update**: `visual-baseline.yml` (manual trigger) builds from `stable` on Linux, generates new baselines, uploads to R2. Never generate baselines locally — macOS font rendering differs from CI (Linux).
- Baselines and test documents are never committed to git

## Local Setup

```bash
# Install deps (auto-installs Playwright browsers via postinstall)
pnpm install

# Authenticate with Cloudflare R2 (one-time)
npx wrangler login

# Download test documents
pnpm docs:download
```

R2 auth is automatic via your Cloudflare account — no `.env` needed for local dev. CI uses S3 API credentials instead (see `.env.example`).
