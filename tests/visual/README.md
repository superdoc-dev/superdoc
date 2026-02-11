# Visual Testing

Playwright-based visual regression tests for SuperDoc. Baselines are stored in R2 and generated from the `stable` branch.

## Quick Start

```bash
cd tests/visual

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

- `basic-commands/` — typing, undo/redo, tables, select-all, toolbar
- `formatting/` — bold/italic, hyperlinks, clear format, style inheritance
- `comments-tcs/` — comments and track changes
- `lists/` — list creation, indentation

**Rendering** (`tests/rendering/`) — Load `.docx` documents and screenshot each page. Tagged with `@rendering` for baseline filtering.

## Adding a Test

### Behavior test

```ts
import { test } from '../../fixtures/superdoc.js';

test('@behavior description of what it tests', async ({ superdoc }) => {
  await superdoc.type('Hello');
  await superdoc.bold();
  await superdoc.type(' world');
  await superdoc.screenshot('my-test-name');
});
```

### Rendering test

```ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from '../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.resolve(__dirname, '../../../../e2e-tests/test-data/basic-documents');

test('@rendering loads and renders correctly', async ({ superdoc }) => {
  await superdoc.loadDocument(path.join(DOCS_DIR, 'my-doc.docx'));
  await superdoc.screenshotPages('rendering/my-doc');
});
```

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
| `waitForStable(ms?)` | Wait for layout to settle |
| `screenshot(name)` | Full-page screenshot |
| `loadDocument(path)` | Load a .docx file |
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

- **PR validation**: `visual-test.yml` downloads baselines from R2, runs tests against `stable`
- **Baseline update**: `visual-baseline.yml` (manual trigger) builds from `stable`, generates new baselines, uploads to R2
- **R2 scripts**: `pnpm baseline:upload` / `pnpm baseline:download`

Baselines are never committed to git (customer documents in screenshots).

## Local Setup

```bash
# Install deps (auto-installs Playwright browsers via postinstall)
pnpm install

# Copy .env for R2 access (optional, only needed for baseline upload/download)
cp .env.example .env
```
