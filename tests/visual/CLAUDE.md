# Visual Testing

Playwright visual regression tests for SuperDoc. Screenshots are compared against baselines stored in R2.

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
    formatting/          Bold/italic, hyperlinks, clear format, styles
    comments-tcs/        Comments and track changes
    lists/               List creation, indentation
  rendering/             Load .docx files, screenshot each page
  fixtures/superdoc.ts   Shared fixture with helpers
```

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

## Writing a Rendering Test

```ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from '../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.resolve(__dirname, '../../../../e2e-tests/test-data/basic-documents');

test('@rendering my-doc renders correctly', async ({ superdoc }) => {
  await superdoc.loadDocument(path.join(DOCS_DIR, 'my-doc.docx'));
  await superdoc.screenshotPages('rendering/my-doc');
});
```

Use `@rendering` tag. Place test docs in `e2e-tests/test-data/`.

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
| `waitForStable(ms?)` | Wait for layout to settle (default 500ms) |
| `screenshot(name)` | Full-page screenshot with baseline comparison |
| `loadDocument(path)` | Load a .docx file into the editor |
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
- **Document mode**: Switch to suggesting mode via `superdoc.page.evaluate(() => window.superdoc.setDocumentMode('suggesting'))`.
- **Baselines**: Never committed to git. Stored in R2, generated from the `stable` branch.
- **Running locally**: `cd tests/visual && pnpm test` (or `pnpm test:update` to regenerate snapshots).
