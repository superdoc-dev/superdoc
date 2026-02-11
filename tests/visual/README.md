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

**Rendering** (`tests/rendering/`) — Load `.docx` documents and screenshot each page. Tagged with `@rendering` for baseline filtering.

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

### Behavior test with a document

```bash
# 1. Upload your document to R2 (path mirrors the test folder)
pnpm docs:upload ~/Downloads/my-bug-repro.docx behavior/comments-tcs
```

```ts
// 2. Reference it in your test — path matches the category
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.resolve(__dirname, '../../../test-data');
const DOC_PATH = path.join(DOCS_DIR, 'behavior/comments-tcs/my-bug-repro.docx');

test.skip(!fs.existsSync(DOC_PATH), 'Test document not available');

test('@behavior my document test', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.screenshot('my-test');
});
```

### Rendering test

```bash
# 1. Upload your document
pnpm docs:upload ~/Downloads/my-doc.docx rendering
```

```ts
// 2. Write the test
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from '../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.resolve(__dirname, '../../test-data/rendering');

test('@rendering my-doc renders correctly', async ({ superdoc }) => {
  await superdoc.loadDocument(path.join(DOCS_DIR, 'my-doc.docx'));
  await superdoc.screenshotPages('rendering/my-doc');
});
```

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
| `pnpm docs:upload <file> <category>` | Upload a document to R2 |
| `pnpm baseline:download` | Download baselines from R2 |
| `pnpm baseline:upload` | Upload baselines to R2 |

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

- **PR validation**: `visual-test.yml` downloads baselines + documents from R2, runs tests
- **Baseline update**: `visual-baseline.yml` (manual trigger) builds from `stable`, generates new baselines, uploads to R2
- Baselines and test documents are never committed to git

## Local Setup

```bash
# Install deps (auto-installs Playwright browsers via postinstall)
pnpm install

# Copy .env for R2 access
cp .env.example .env
# Fill in: SD_VISUAL_TESTING_R2_ACCOUNT_ID, SD_VISUAL_TESTING_R2_ACCESS_KEY_ID,
# SD_VISUAL_TESTING_R2_SECRET_ACCESS_KEY, SD_VISUAL_TESTING_R2_BUCKET

# Download test documents
pnpm docs:download
```
