# Visual Testing

Playwright visual regression tests for SuperDoc. Screenshots and test documents are stored in R2.

## When to Add Visual Tests

Add a **behavior test** when you:
- Fix a bug that affects rendering or user interaction
- Add or change an editing feature (formatting, commands, toolbar)
- Modify comments, track changes, or collaboration UI

Add a **rendering test** when you:
- Fix a DOCX import/export rendering issue
- Change the layout engine or style resolution

## Test Structure

```
tests/
  behavior/              Simulate user actions, screenshot result
    basic-commands/      Typing, undo/redo, tables, select-all, toolbar
    formatting/          Bold/italic, hyperlinks, clear format, fonts
    comments-tcs/        Comments, track changes, nested comments
    lists/               List creation, indentation, markers
    field-annotations/   Field annotation types and formatting
    headers/             Header/footer editing
    search/              Search and navigation
    importing/           Document import edge cases
    structured-content/  SDT lock modes
  rendering/             Auto-discovers all .docx in test-data/rendering/
  fixtures/superdoc.ts   Shared fixture with helpers
test-data/               Downloaded from R2 (gitignored), mirrors R2 documents/ prefix
scripts/
  download-test-docs.ts  Auto-discover and download all documents from R2
  upload-test-doc.ts     Upload rendering doc — prompts for issue ID and description
  download-baselines.ts  Download screenshot baselines from R2
  upload-baselines.ts    Upload screenshot baselines to R2
```

## R2 Storage

Single bucket with two prefixes. Local `test-data/` mirrors the `documents/` prefix exactly:

```
superdoc-visual-testing/
  documents/                    → downloads to test-data/
    behavior/
      comments-tcs/doc.docx     → test-data/behavior/comments-tcs/doc.docx
      formatting/doc.docx       → test-data/behavior/formatting/doc.docx
    rendering/doc.docx          → test-data/rendering/doc.docx
  baselines/                    → downloads to tests/ (snapshot dirs)
```

## Adding a Rendering Test

Rendering tests are auto-discovered. Just upload a document:

```bash
pnpm docs:upload ~/Downloads/my-file.docx
# Prompts: Linear issue ID, short description
# → uploads to documents/rendering/sd-1679-anchor-table-overlap.docx

pnpm docs:download        # pull the new file locally
pnpm test                 # verify it loads and renders
```

Baselines are generated in CI from the `stable` branch — never locally (macOS font rendering differs from Linux).

**Naming convention**: `<issue-id>-<description>.docx` for regressions (e.g. `sd-1679-anchor-table-overlap.docx`). General coverage docs can skip the issue ID.

## Writing a Behavior Test

```ts
import { test } from '../../fixtures/superdoc.js';

test('@behavior description of what it tests', async ({ superdoc }) => {
  // 1. Set up state (type, execute commands, load doc)
  await superdoc.type('Hello world');
  await superdoc.bold();

  // 2. Screenshot the result
  await superdoc.screenshot('my-test-name');
});
```

Place the file in the matching category folder. Use `@behavior` tag in the test name.

## Loading Test Documents

Test documents are stored in R2 (`documents/` prefix). Download with `pnpm docs:download`. Upload rendering docs with `pnpm docs:upload <file>`.

```ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.resolve(__dirname, '../../../test-data');
const DOC_PATH = path.join(DOCS_DIR, 'behavior/comments-tcs/tracked-changes.docx');

test.skip(!fs.existsSync(DOC_PATH), 'Test document not available');

test('@behavior my doc test', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.screenshot('my-test');
});
```

Document paths mirror the test folder structure. A test in `tests/behavior/comments-tcs/` uses documents from `test-data/behavior/comments-tcs/`.

## CI Behavior

Visual tests run as a **soft gate** in CI — pixel diff failures post a PR comment with a link to the HTML report artifact but don't block the PR. This allows rendering improvements to land without being blocked by expected pixel changes.

## Fixture Helpers

| Method | What it does |
|--------|-------------|
| `type(text)` | Type text (30ms delay per char) |
| `press(key)` | Press key (`'Enter'`, `'Shift+Tab'`) |
| `newLine()` | Press Enter |
| `shortcut(key)` | Cmd/Ctrl + key |
| `bold()` / `italic()` / `underline()` | Toggle formatting |
| `undo()` / `redo()` | Undo/redo |
| `selectAll()` | Cmd/Ctrl+A |
| `tripleClickLine(index)` | Select line by index (uses `.superdoc-line`) |
| `executeCommand(name, args?)` | Run editor command via `window.editor.commands` |
| `setDocumentMode(mode)` | Set editing/suggesting/viewing mode |
| `setTextSelection(from, to?)` | Set cursor position via ProseMirror position |
| `clickOnLine(index, xOffset?)` | Single click on a line |
| `clickOnCommentedText(text)` | Click on comment highlight containing text |
| `pressTimes(key, count)` | Press a key multiple times |
| `waitForStable(ms?)` | Wait for layout to settle (default 1500ms) |
| `screenshot(name)` | Full-page screenshot with baseline comparison |
| `loadDocument(path)` | Load a .docx file into the editor |
| `assertPageCount(n)` | Assert number of rendered pages |
| `screenshotPages(baseName)` | Screenshot each rendered page |

## Config Overrides

```ts
test.use({
  config: {
    layout: true,           // layout engine (default: true)
    toolbar: 'full',        // 'none' | 'minimal' | 'full'
    comments: 'on',         // 'off' | 'on' | 'panel' | 'readonly'
    trackChanges: true,
    hideSelection: false,   // show selection in screenshots
    hideCaret: false,       // show caret in screenshots
  },
});
```

Defaults: `layout: true`, `hideCaret: true`, `hideSelection: true`. Override before tests that need visible selection/caret.

## Important Notes

- **DOM selectors**: SuperDoc uses DomPainter, not ProseMirror DOM. Use `.superdoc-line`, `.superdoc-page`, not `.ProseMirror p`.
- **Editor commands**: Available via `executeCommand()` — waits for `window.editor.commands` automatically.
- **Document mode**: Use `setDocumentMode('suggesting')` fixture helper or `superdoc.page.evaluate(() => window.superdoc.setDocumentMode('suggesting'))`.
- **Baselines & documents**: Never committed to git. Stored in R2 in a single bucket, generated from the `stable` branch.
- **Running locally**: `cd tests/visual && pnpm docs:download && pnpm test`.
