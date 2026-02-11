# Visual Testing Suite

Automated visual regression testing for SuperDoc. Compares screenshots across versions to detect rendering and behavior changes.

## Two Test Types

### Rendering Tests
**"Does the document look right when loaded?"**

Loads `.docx` files into SuperDoc and screenshots every page. No user interaction — pure rendering output.

- Use when: a change affects how documents are visually rendered (layout, styles, fonts, spacing, tables, images)
- Baselines stored in: `baselines-rendering/` (local) or `rendering/` (R2)
- Generate: `pnpm generate:rendering --filter <doc-prefix>`
- Compare: `pnpm compare:rendering`

### Behavior Tests
**"Does the editor respond correctly to user actions?"**

Runs scripted user interactions (typing, clicking, formatting) and captures screenshots at milestones. Each test is a "story" written with `defineStory()`.

- Use when: a change affects editor behavior, commands, UI interactions, or how the editor reacts to user input
- Stories live in: `tests/behavior/stories/<category>/`
- Baselines stored in: `baselines-behavior/` (local) or `behavior/` (R2)
- Generate: `pnpm generate:behavior --filter <story-or-category>`
- Compare: `pnpm compare:behavior`

### When to Add Which Test

| Changed | Add |
|---------|-----|
| Style engine, layout engine, DomPainter, pm-adapter | Rendering test |
| super-converter (import/export) | Rendering test |
| Editor extension, command, or keybinding | Behavior test |
| Comments, track changes, toolbar UI | Behavior test |
| Both rendering + interaction flow | Both |

## Directory Structure

```
tests/behavior/
├── helpers/                    # Shared helper functions
│   ├── index.ts               # Barrel export
│   ├── comment-helpers.ts     # Comment/TC interaction helpers
│   └── editor-helpers.ts      # Selection, focus, document text helpers
└── stories/                   # Story files (one test per file)
    ├── _template.ts           # Copy for new stories (underscore = not a story)
    ├── editing/               # Typing, undo/redo, selection, basic editing ops
    ├── tables/                # Table insertion, row/column operations
    ├── formatting/            # Bold, italic, lists, etc.
    ├── search/                # Find & replace
    ├── comments/              # Comment insertion, editing, nesting
    ├── track-changes/         # Track changes behavior
    ├── field-annotations/     # Field highlighting, carets
    ├── headers/               # Header editing
    ├── lists/                 # List indentation, markers
    └── importing/             # Document import behavior
```

Test documents live in a Cloudflare R2 corpus (not in this repo). Use corpus-relative paths like `basic/simple.docx`.

## Commands

```bash
# Generate screenshots
pnpm generate:rendering [--filter <prefix>] [--local]
pnpm generate:behavior [--filter <story>] [--local]

# Create baselines (upload to R2 unless --local)
pnpm baseline:rendering [version] [--local]
pnpm baseline:behavior [version] [--local]

# Compare current vs baseline
pnpm compare:rendering [--local]
pnpm compare:behavior [--local]
pnpm compare              # both rendering + behavior

# Harness dev server
pnpm dev                  # start at http://localhost:9989

# Version management
pnpm superdoc <version>   # switch SuperDoc version
pnpm superdoc local       # use workspace build
pnpm superdoc:version     # check current version

# Other useful flags
--match <text>     # Match substring anywhere
--exclude <prefix> # Skip matching stories
--force            # Regenerate even if exists
--skip-existing    # Skip if already generated
--fail-on-error    # Exit 1 if any story fails
--browser <name>   # Specify browser (chromium, firefox, webkit)
```

## Key Files

| File | Purpose |
|------|---------|
| `scripts/generate-rendering.ts` | Generates rendering screenshots from .docx files |
| `scripts/generate-behavior.ts` | Discovers and runs behavior stories |
| `scripts/compare-rendering.ts` | Compares rendering screenshots against baselines |
| `scripts/compare-behavior.ts` | Compares behavior screenshots against baselines |
| `scripts/compare-all.ts` | Orchestrates both comparison types |
| `scripts/report.ts` | Generates HTML diff reports |
| `scripts/storage-flags.ts` | Resolves local/R2 paths for baselines |
| `scripts/r2-baselines.ts` | R2 upload/download utilities |
| `tests/behavior/stories/_template.ts` | Template for new behavior stories |
| `tests/behavior/helpers/` | Shared test helpers (comment, editor, selection) |
| `packages/harness/` | Vite dev server hosting SuperDoc for tests |
| `packages/test-helpers/` | `defineStory()` API and story types |

## Architecture

```
                    ┌──────────────┐
                    │   Harness    │  Vite dev server @ localhost:9989
                    │ (packages/)  │  Hosts SuperDoc with .docx loading
                    └──────┬───────┘
                           │
            ┌──────────────┼──────────────┐
            │              │              │
     ┌──────▼──────┐ ┌────▼─────┐  ┌─────▼──────┐
     │  Rendering  │ │ Behavior │  │  Behavior  │
     │  Generator  │ │ Stories  │  │  Generator │
     │  (Playwright │ │ (define  │  │ (discovers │
     │   screenshots│ │  Story)  │  │  + runs)   │
     └──────┬──────┘ └──────────┘  └─────┬──────┘
            │                            │
            ▼                            ▼
     screenshots/{run}/           screenshots/{run}/behavior/
            │                            │
     ┌──────▼──────┐             ┌───────▼───────┐
     │  Compare    │             │   Compare     │
     │  Rendering  │             │   Behavior    │
     │ (pixelmatch)│             │  (pixelmatch) │
     └──────┬──────┘             └───────┬───────┘
            │                            │
            └────────────┬───────────────┘
                         ▼
                   HTML Report
```

## R2 Storage

Baselines are stored in Cloudflare R2 (`superdoc-baselines` bucket):

- `rendering/{version}/{browser}/...` — rendering baselines
- `behavior/{version}/{browser}/...` — behavior baselines

Required env vars: `SD_TESTING_R2_ACCOUNT_ID`, `SD_TESTING_R2_BASELINES_BUCKET_NAME`, `SD_TESTING_R2_ACCESS_KEY_ID`, `SD_TESTING_R2_SECRET_ACCESS_KEY`

Use `--local` flag to skip R2 and work with local directories only.

---

## Writing Behavior Stories

### Rules

- Read this file and skim existing stories in the relevant category before creating a new story.
- Prefer helpers from `tests/behavior/helpers` and the built-in story helpers over raw Playwright `page` access.
- Do not guess selectors. If a selector is not documented here or visible in existing stories/helpers, verify it with the harness + Playwright or ask for guidance.
- Keep stories focused on one behavior. Always `waitForStable()` before `milestone()` and include `tickets` when known.

### Story Structure

```typescript
import { defineStory } from '@superdoc-testing/helpers';

export default defineStory({
  // REQUIRED
  name: 'my-story-name',           // Unique identifier (kebab-case)
  description: 'What this tests',  // One sentence

  // DOCUMENT
  startDocument: null,             // null = blank doc, or 'basic/file.docx'

  // TRACEABILITY
  tickets: ['SD-1234'],            // Related ticket/issue numbers (optional)
  category: 'editing',             // Category for organizing (auto-detected from folder if omitted)

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

  async run(page, helpers): Promise<void> {
    const { type, milestone, waitForStable } = helpers;

    await type('Hello world');
    await waitForStable(300);
    await milestone('typed', 'After typing text');
  }
});
```

### Creating a New Story

1. Pick a category folder in `tests/behavior/stories/`
2. Copy `_template.ts` into that folder
3. Update `name`, `description`, and `run` steps
4. Add `milestone()` calls where you want screenshots
5. Test: `pnpm generate:behavior --filter your-story-name`

### Available Helpers

All helpers are destructured from the second parameter of `run()`:

**Text Input:**
| Helper | Description |
|--------|-------------|
| `type(text, options?)` | Type text into **main editor**. Options: `{ delay?: number }` |
| `press(key)` | Press single key (e.g., `'Enter'`, `'Backspace'`, `'ArrowLeft'`) |
| `pressShortcut(key)` | Press with Cmd/Ctrl (e.g., `pressShortcut('a')` = Select All) |
| `pressTimes(key, count)` | Press key N times |
| `newLine()` | Press Enter |
| `softBreak()` | Press Shift+Enter |

**Note:** For typing into non-editor inputs (comment inputs, dialogs), use `page.keyboard.type()` directly.

**Formatting:**
| Helper | Description |
|--------|-------------|
| `bold()` | Toggle bold (Cmd/Ctrl+B) |
| `italic()` | Toggle italic (Cmd/Ctrl+I) |
| `underline()` | Toggle underline (Cmd/Ctrl+U) |

**Editing:**
| Helper | Description |
|--------|-------------|
| `undo()` | Undo last action |
| `redo()` | Redo last undone action |
| `selectAll()` | Select all content |
| `clear()` | Delete all content |
| `getTextContent()` | Get current document text |

**Selection & Mouse:**
| Helper | Description |
|--------|-------------|
| `clickAt(x, y)` | Click at coordinates relative to editor |
| `tripleClickAt(x, y)` | Triple-click (select paragraph) |
| `tripleClickLine(lineIndex)` | Triple-click line by 0-based index |
| `drag(from, to)` | Drag from `{x, y}` to `{x, y}` |

**Commands:**
| Helper | Description |
|--------|-------------|
| `executeCommand(name, args?)` | Run editor command |
| `executeFirstCommand(names[], args?)` | Try commands in order, run first available |
| `setDocumentMode(mode)` | Set mode: `'editing'`, `'suggesting'`, `'viewing'` |
| `focus()` | Focus the editor |

**Waiting & Snapshots:**
| Helper | Description |
|--------|-------------|
| `waitForStable(ms?)` | Wait for layout stability (default 500ms) |
| `milestone(suffix?, description?)` | Capture numbered screenshot |
| `snapshot(suffix?, description?)` | Alias for `milestone` |
| `step(label, fn)` | Label a group of actions for logging |

**Properties:**
| Property | Description |
|----------|-------------|
| `page` | Raw Playwright Page for advanced operations |
| `modifierKey` | Platform modifier: `'Meta'` (Mac) or `'Control'` (Win) |

### Custom Helpers (tests/behavior/helpers/)

Import from `../../helpers/index.js` in your stories:

```typescript
import { clickOnCommentedText, clickOnLine } from '../../helpers/index.js';
```

**Comment Helpers (`comment-helpers.ts`):**
| Helper | Description |
|--------|-------------|
| `clickOnCommentedText(page, textMatch)` | Click smallest highlight containing text (handles nested) |
| `clickOnCommentBubble(page, commentId)` | Click comment in sidebar panel by ID |
| `clickOnLine(page, lineIndex, xOffset?)` | Click on a specific line (0-indexed) |
| `clickOnText(page, text)` | Click on any text in the document |
| `getActiveCommentId(page)` | Get currently selected comment ID |
| `getCommentIdsAtPoint(page, x, y)` | Get comment IDs at coordinates |
| `waitForCommentPanelStable(page, ms?)` | Wait after comment selection changes |

**Editor Helpers (`editor-helpers.ts`):**
| Helper | Description |
|--------|-------------|
| `setTextSelection(page, from, to?)` | Set cursor/selection position (ProseMirror doc positions) |
| `focusEditor(page)` | Focus the editor element |
| `getSelection(page)` | Get current selection `{ from, to }` or null |
| `getDocumentText(page)` | Get current document text content |

### DOM Selectors Reference

**IMPORTANT:** Always scope selectors under `.harness-main` to avoid matching hidden/duplicate elements:

```typescript
// GOOD - scoped to harness-main
page.locator('.harness-main .overflow-icon')

// BAD - may match hidden duplicates
page.locator('.overflow-icon')
```

**Exception:** Dropdowns/modals rendered via Vue teleport are outside `.harness-main` — use selectors directly.

**Hidden duplicates:** Use `.last()` when there are off-screen duplicates (x: -9999):

```typescript
page.locator('.harness-main .overflow-icon').last()
```

| Selector | Description |
|----------|-------------|
| `.harness-main` | Root container - always use as ancestor |
| `.superdoc-page` | Page container (one per page) |
| `.superdoc-line` | Text line element |
| `.superdoc-comment-highlight` | Comment highlight span |
| `[data-comment-ids]` | Attribute with comma-separated comment IDs |
| `.sd-comment-box` | Comment bubble in sidebar |
| `.sd-comment-box[data-id="..."]` | Specific comment by ID |
| `[contenteditable="true"]` | The editable area |
| `.super-editor .ProseMirror` | The ProseMirror editor element |

### Milestone Naming

```typescript
await milestone('initial');      // -> 01-initial.png
await milestone('typed');        // -> 02-typed.png
await milestone('formatted');    // -> 03-formatted.png
await milestone();               // -> 04-snapshot.png (default suffix)
```

### Common Patterns

**Always wait before milestone:**
```typescript
await type('Some text');
await waitForStable(300);
await milestone('after-typing');
```

**Loading existing documents:**
```typescript
export default defineStory({
  name: 'test-existing-doc',
  startDocument: 'comments/nested-comments-word.docx',
  comments: 'panel',

  async run(page, helpers) {
    await page.waitForSelector('.superdoc-comment-highlight', { timeout: 30_000 });
    await helpers.waitForStable(400);
    await helpers.milestone('loaded');
  }
});
```

**Programmatic editor commands:**
```typescript
await executeCommand('insertTable', { rows: 2, cols: 2 });

const usedCommand = await executeFirstCommand(
  ['addComment', 'insertComment', 'createComment'],
  { text: 'My comment' }
);
if (!usedCommand) throw new Error('No comment command available');
```

### Selector Verification

If you need to verify a selector, start the harness and probe with Playwright:

```bash
pnpm --filter @superdoc-testing/harness dev -- --strictPort
```

```typescript
const count = await page.locator(SELECTOR).count();
```

### Reference Examples

| Example | File |
|---------|------|
| Simplest story | `editing/type-basic-text.ts` |
| Multiple milestones | `editing/undo-redo.ts` |
| Text formatting | `formatting/bold-italic-formatting.ts` |
| Command execution | `tables/insert-table-2x2.ts` |
| Loading existing doc | `track-changes/basic-tracked-change-existing-doc.ts` |
| Complex interactions | `track-changes/programmatic-tracked-change.ts` |
| Nested comments | `comments/nested-comments-word.ts` |
| Comments on TC | `comments/comment-on-tracked-change.ts` |
| List formatting | `lists/indent-list-items.ts` |
| Field annotations | `field-annotations/insert-all-types.ts` |
| Header editing | `headers/double-click-edit-header.ts` |
| Search & navigation | `search/search-and-navigate.ts` |

### Debugging Tips

1. **Story fails to find element:** Increase timeout or add explicit waits
2. **Flaky screenshots:** Increase `waitForStable()` time before milestones
3. **Wrong element clicked:** Use more specific selectors or `clickOnLine()`
4. **View harness manually:** `pnpm dev` and open http://localhost:9989
5. **Inspect rendered state:** Add `page.pause()` (requires `--headed` mode)
6. **Element not visible:** Check if `layout: true` is set and document is fully loaded
