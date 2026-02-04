# Visual Testing - LLM Agent Context

This file provides everything an LLM agent needs to understand and write interaction stories for SuperDoc visual testing.

## Overview

This repo runs **interaction tests** that simulate user actions in SuperDoc (a document editor), capture screenshots at key points (**milestones**), and compare them against baselines to detect visual regressions.

**Key concepts:**
- **Story** - A single test file that performs user interactions and captures milestones
- **Milestone** - A screenshot captured at a specific point during the story
- **Baseline** - A set of milestone screenshots from a known-good version
- **Harness** - A Vite dev server that hosts SuperDoc for testing

---

## Directory Structure

```
tests/interactions/
├── helpers/                    # Shared helper functions
│   ├── index.ts               # Barrel export
│   ├── comment-helpers.ts     # Comment/TC interaction helpers
│   └── editor-helpers.ts      # Selection, focus, document text helpers
└── stories/                   # Story files (one test per file)
    ├── _template.ts           # Copy for new stories (underscore = not a story)
    ├── basic-commands/        # Typing, undo/redo, basic ops
    ├── formatting/            # Bold, italic, lists, etc.
    ├── search/                # Find & replace
    ├── comments-tcs/          # Comments and track changes
    ├── field-annotations/     # Field highlighting, carets
    ├── headers/               # Header editing
    ├── lists/                 # List indentation, markers
    └── [your-feature]/        # Add new categories as needed
```

Test documents live in a Cloudflare R2 corpus (not in this repo). Use corpus-relative paths like `basic/simple.docx`.
Legacy `test-docs/...` prefixes still resolve to the same corpus path.

---

## Story Structure

Stories are TypeScript files in `tests/interactions/stories/`. Use `defineStory()`:

```typescript
import { defineStory } from '@superdoc-testing/helpers';

export default defineStory({
  // REQUIRED
  name: 'my-story-name',           // Unique identifier (kebab-case)
  description: 'What this tests',  // One sentence

  // DOCUMENT
  startDocument: null,             // null = blank doc, or 'basic/file.docx' (legacy 'test-docs/...' also works)

  // TRACEABILITY
  tickets: ['SD-1234'],            // Related ticket/issue numbers (optional)

  // LAYOUT & VIEW
  layout: true,                    // Use layout engine (paginated view)
  viewport: { width: 1600, height: 1200 },

  // FEATURES
  comments: 'off',                 // 'off' | 'on' | 'panel' | 'readonly'
  toolbar: 'none',                 // 'none' | 'minimal' | 'full'
  trackChanges: false,             // Enable track changes mode
  extensions: [],                  // Additional editor extensions to load

  // SCREENSHOT OPTIONS
  hideCaret: false,                // Hide cursor in screenshots
  hideSelection: false,            // Hide selection highlighting
  caretBlink: false,               // Control caret blinking animation
  waitForFonts: false,             // Wait for all fonts to load

  // LEGACY (prefer new options above)
  // useLayoutEngine: true,        // Use `layout` instead
  // includeComments: false,       // Use `comments: 'on'` instead

  async run(page, helpers): Promise<void> {
    const { type, milestone, waitForStable } = helpers;

    await type('Hello world');
    await waitForStable(300);
    await milestone('typed', 'After typing text');
  }
});
```

---

## Available Helpers

All helpers are destructured from the second parameter of `run()`:

### Text Input
| Helper | Description |
|--------|-------------|
| `type(text, options?)` | Type text into editor. Options: `{ delay?: number }` |
| `press(key)` | Press single key (e.g., `'Enter'`, `'Backspace'`, `'ArrowLeft'`) |
| `pressShortcut(key)` | Press with Cmd/Ctrl (e.g., `pressShortcut('a')` = Select All) |
| `pressTimes(key, count)` | Press key N times |
| `newLine()` | Press Enter |
| `softBreak()` | Press Shift+Enter |

### Formatting
| Helper | Description |
|--------|-------------|
| `bold()` | Toggle bold (Cmd/Ctrl+B) |
| `italic()` | Toggle italic (Cmd/Ctrl+I) |
| `underline()` | Toggle underline (Cmd/Ctrl+U) |

### Editing
| Helper | Description |
|--------|-------------|
| `undo()` | Undo last action |
| `redo()` | Redo last undone action |
| `selectAll()` | Select all content |
| `clear()` | Delete all content |
| `getTextContent()` | Get current document text |

### Selection & Mouse
| Helper | Description |
|--------|-------------|
| `clickAt(x, y)` | Click at coordinates relative to editor |
| `tripleClickAt(x, y)` | Triple-click (select paragraph) |
| `tripleClickLine(lineIndex)` | Triple-click line by 0-based index |
| `drag(from, to)` | Drag from `{x, y}` to `{x, y}` |

### Commands
| Helper | Description |
|--------|-------------|
| `executeCommand(name, args?)` | Run editor command |
| `executeFirstCommand(names[], args?)` | Try commands in order, run first available |
| `setDocumentMode(mode)` | Set mode: `'editing'`, `'suggesting'`, `'viewing'` |
| `focus()` | Focus the editor |

### Waiting & Snapshots
| Helper | Description |
|--------|-------------|
| `waitForStable(ms?)` | Wait for layout stability (default 500ms) |
| `milestone(suffix?, description?)` | Capture numbered screenshot |
| `snapshot(suffix?, description?)` | Alias for `milestone` |
| `step(label, fn)` | Label a group of actions for logging |

### Properties
| Property | Description |
|----------|-------------|
| `page` | Raw Playwright Page for advanced operations |
| `modifierKey` | Platform modifier: `'Meta'` (Mac) or `'Control'` (Win) |

---

## Custom Helpers (tests/interactions/helpers/)

Import from `../../helpers/index.js` in your stories:

```typescript
import { clickOnCommentedText, clickOnLine } from '../../helpers/index.js';
```

### Comment Helpers (`comment-helpers.ts`)

| Helper | Description |
|--------|-------------|
| `clickOnCommentedText(page, textMatch)` | Click smallest highlight containing text (handles nested) |
| `clickOnCommentBubble(page, commentId)` | Click comment in sidebar panel by ID |
| `clickOnLine(page, lineIndex, xOffset?)` | Click on a specific line (0-indexed) |
| `clickOnText(page, text)` | Click on any text in the document |
| `getActiveCommentId(page)` | Get currently selected comment ID |
| `getCommentIdsAtPoint(page, x, y)` | Get comment IDs at coordinates |
| `waitForCommentPanelStable(page, ms?)` | Wait after comment selection changes |

**Note:** `clickOnCommentedText` automatically selects the **innermost** (smallest bounding box) when multiple highlights match. This handles nested/overlapping comments correctly.

### Editor Helpers (`editor-helpers.ts`)

| Helper | Description |
|--------|-------------|
| `setTextSelection(page, from, to?)` | Set cursor/selection position (ProseMirror doc positions) |
| `focusEditor(page)` | Focus the editor element |
| `getSelection(page)` | Get current selection `{ from, to }` or null |
| `getDocumentText(page)` | Get current document text content |

---

## DOM Selectors Reference

For advanced Playwright operations via `page`:

| Selector | Description |
|----------|-------------|
| `.superdoc-page` | Page container (one per page) |
| `.superdoc-line` | Text line element |
| `.superdoc-comment-highlight` | Comment highlight span |
| `[data-comment-ids]` | Attribute with comma-separated comment IDs |
| `.sd-comment-box` | Comment bubble in sidebar |
| `.sd-comment-box[data-id="..."]` | Specific comment by ID |
| `[contenteditable="true"]` | The editable area |
| `.super-editor .ProseMirror` | The ProseMirror editor element |

---

## Milestone Naming

Milestones create sequentially numbered screenshots:

```typescript
await milestone('initial');      // → 01-initial.png
await milestone('typed');        // → 02-typed.png
await milestone('formatted');    // → 03-formatted.png
await milestone();               // → 04-snapshot.png (default suffix)
```

The second parameter is an optional description for the report:
```typescript
await milestone('after-edit', 'Document state after applying bold formatting');
```

---

## Common Patterns

### Always Wait Before Milestone
```typescript
await type('Some text');
await waitForStable(300);  // Let layout settle
await milestone('after-typing');
```

### Step Grouping for Organization
```typescript
await step('Setup initial state', async () => {
  await type('Initial content');
  await waitForStable(300);
  await milestone('initial');
});

await step('Apply formatting', async () => {
  await selectAll();
  await bold();
  await waitForStable(300);
  await milestone('formatted');
});
```

### Wait Time Constants
```typescript
const WAIT_SHORT = 200;
const WAIT_MEDIUM = 300;
const WAIT_LONG = 500;
```

### Loading Existing Documents
```typescript
export default defineStory({
  name: 'test-existing-doc',
  startDocument: 'comments-tcs/nested-comments-word.docx',
  comments: 'panel',  // Show comment sidebar

  async run(page, helpers) {
    // Wait for document to fully load
    await page.waitForSelector('.superdoc-comment-highlight', { timeout: 30_000 });
    await helpers.waitForStable(400);
    await helpers.milestone('loaded');
  }
});
```

### Programmatic Editor Commands
```typescript
// Execute a known command
await executeCommand('insertTable', { rows: 2, cols: 2 });

// Try multiple command names (APIs vary between versions)
const usedCommand = await executeFirstCommand(
  ['addComment', 'insertComment', 'createComment'],
  { text: 'My comment' }
);
if (!usedCommand) throw new Error('No comment command available');
```

### Using Raw Playwright Page
```typescript
async run(page, helpers) {
  // Access window objects
  const docText = await page.evaluate(() => {
    return window.editor?.state?.doc?.textContent ?? '';
  });

  // Wait for specific elements
  await page.waitForSelector('.my-element', { timeout: 10_000 });

  // Click specific elements
  await page.locator('.superdoc-comment-highlight').first().click();
}
```

---

## Creating a New Story

1. **Decide category:** Find or create a folder in `tests/interactions/stories/`

2. **Create file:**
   ```bash
   tests/interactions/stories/[category]/[feature-name].ts
   ```

3. **Copy template structure** from `_template.ts` or an existing story

4. **Implement interactions and milestones**

5. **Test locally:**
   ```bash
   pnpm generate:interactions --filter feature-name
   ```

---

## Creating Shared Helpers

1. **Add to existing file** or create new file in `tests/interactions/helpers/`

2. **Export from `index.ts`:**
   ```typescript
   export * from './your-helpers.js';
   ```

3. **Import in stories:**
   ```typescript
   import { yourHelper } from '../../helpers/index.js';
   ```

**Naming convention:** Files starting with `_` (underscore) are not treated as stories.

---

## Commands Reference

```bash
# Start the harness dev server (for manual testing)
pnpm dev

# Generate snapshots for specific story
pnpm generate:interactions --filter story-name
pnpm generate:interactions --filter comments-tcs  # All in folder

# Generate visual snapshots (document rendering tests)
pnpm generate:visual --filter basic

# Create baseline from current SuperDoc version
pnpm baseline:interactions --filter story-name
pnpm baseline:visual --filter basic

# Compare against baseline
pnpm compare:interactions --filter story-name
pnpm compare:visual --filter basic

# Compare all (visual + interactions)
pnpm compare

# View report
open results/<run>/interactions-report.html

# List available filter prefixes
pnpm filters

# Switch SuperDoc version
pnpm superdoc 1.11.0              # npm version
pnpm superdoc 1.11.0-next.8       # pre-release version
pnpm superdoc local               # workspace superdoc
pnpm superdoc ../path/to/superdoc # local path (already built/packed)

# Check current SuperDoc version
pnpm superdoc:version

# Other useful flags
--match <text>     # Match substring anywhere
--exclude <prefix> # Skip matching stories
--force            # Regenerate even if exists
--skip-existing    # Skip if already generated
--fail-on-error    # Exit 1 if any story fails
--browser <name>   # Specify browser (chromium, firefox, webkit)
```

---

## Multi-Browser Support

Tests can run against Chromium, Firefox, and WebKit. Baselines and screenshots are stored separately per browser.

```bash
# Run with specific browser
pnpm generate:interactions --browser chromium
pnpm generate:visual --browser firefox

# Environment variable
SUPERDOC_TEST_BROWSER=webkit pnpm compare

# Default is chromium
```

Baseline paths include the browser: `baselines/v.1.10.0/chromium/...`

---

## Debugging Tips

1. **Story fails to find element:** Increase timeout or add explicit waits
   ```typescript
   await page.waitForSelector('.my-element', { timeout: 30_000 });
   ```

2. **Flaky screenshots:** Increase `waitForStable()` time before milestones

3. **Wrong element clicked:** Use more specific selectors or `clickOnLine()`

4. **View harness manually:** Run `pnpm --filter @superdoc-testing/harness dev` and open http://localhost:9989

5. **Check what's rendered:** Add a `page.pause()` call to stop and inspect (requires `--headed` mode)

6. **Element not visible:** Check if `layout: true` is set and document is fully loaded

---

## Reference Examples

| Example | File |
|---------|------|
| Simplest story | `basic-commands/type-basic-text.ts` |
| Multiple milestones | `basic-commands/undo-redo.ts` |
| Text formatting | `formatting/bold-italic-formatting.ts` |
| Command execution | `basic-commands/insert-table-2x2.ts` |
| Loading existing doc | `comments-tcs/basic-tracked-change-existing-doc.ts` |
| Complex interactions | `comments-tcs/programmatic-tracked-change.ts` |
| Nested comments | `comments-tcs/nested-comments-word.ts` |
| Comments on TC | `comments-tcs/comment-on-tracked-change.ts` |
| List formatting | `lists/indent-list-items.ts` |
| Field annotations | `field-annotations/insert-all-types.ts` |
| Header editing | `headers/double-click-edit-header.ts` |
| Search & navigation | `search/search-and-navigate.ts` |
