# Writing Behavior Tests — Agent Guide

## Explicit: Run and Debug with Playwright CLI

While creating tests, agents are encouraged to run the harness and tests directly with Playwright CLI to iterate quickly, inspect behavior, and debug issues in real time. Use modes like headed/UI/trace as needed (`playwright test --headed`, `playwright test --ui`, `TRACE=1 playwright test`).

## Core Rule

SuperDoc uses a custom rendering pipeline (DomPainter), NOT ProseMirror's DOM output.
**Prefer Document API assertions (`editor.doc.*`) for content, structure, and formatting.**
Use ProseMirror state only when the behavior under test is selection-specific or not yet exposed by document-api.

## Imports

Always import `test` and `expect` from the fixture, never from `@playwright/test`:

```ts
import { test, expect } from '../../fixtures/superdoc.js';
```

Import `SuperDocFixture` as a type when writing shared helpers:

```ts
import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';
```

## Test Configuration

Set harness options at the file level with `test.use()`. Every toolbar test needs this:

```ts
test.use({ config: { toolbar: 'full', showSelection: true } });
```

Only set what you need. Defaults are: `layout: true`, `showCaret: false`, `showSelection: false`, no toolbar.

## waitForStable() — and when it's not enough

Call `waitForStable()` after any interaction that mutates the DOM. This includes:
- `type()`, `newLine()`, `press()`, `bold()`, `italic()`, `underline()`
- `executeCommand()`
- Toolbar button clicks
- `setTextSelection()`
- `setDocumentMode()`

```ts
await superdoc.type('Hello');
await superdoc.waitForStable();  // always before assertions or next interaction
```

Do NOT write your own settle/wait helpers. Use `superdoc.waitForStable()` everywhere.

### When waitForStable() is NOT enough

`waitForStable()` uses a MutationObserver that resolves after 50ms of DOM silence. This
works for most interactions, but **UI components with animations (dropdowns, modals, popups)
can have brief pauses between mutation bursts** that cause `waitForStable()` to return too
early — before the animation finishes.

For these cases, **wait for the specific element state change** instead of (or in addition
to) `waitForStable()`:

```ts
// Bad — waitForStable() may return while the dropdown is still closing
await page.locator('[data-item="btn-link-apply"]').click();
await superdoc.waitForStable();
// dropdown may still be visible here!

// Good — wait for the specific UI element to disappear
await page.locator('[data-item="btn-link-apply"]').click();
await page.locator('.link-input-ctn').waitFor({ state: 'hidden', timeout: 5000 });
await superdoc.waitForStable();
```

This applies to any component that animates open/closed: link dropdowns, color pickers,
table action menus, document mode dropdowns, etc.

### Stale positions after mark changes

ProseMirror may re-index node positions after marks are applied or removed. Always
re-find text positions after applying marks — never reuse a position from before the change:

```ts
const pos = await superdoc.findTextPos('website');
await superdoc.setTextSelection(pos, pos + 'website'.length);
await applyLink(superdoc, 'https://example.com');

// Bad — reusing stale positions for another selection can target the wrong span
await superdoc.setTextSelection(pos, pos + 'website'.length);

// Good — re-find after the mark was applied
const freshPos = await superdoc.findTextPos('website');
await superdoc.setTextSelection(freshPos, freshPos + 'website'.length);

// Prefer text-based assertions so no position refresh is needed for assertions
await superdoc.assertTextHasMarks('website', ['link']);
```

This is mainly relevant for selection workflows. For formatting assertions, prefer text-based fixture helpers
(`assertTextHasMarks`, `assertTextMarkAttrs`) so tests do not depend on PM positions.

## Selecting Text

Use `findTextPos()` + `setTextSelection()` for deterministic selection. Never rely on click
coordinates to select text — click positions are fragile across browsers and viewport sizes.

```ts
const pos = await superdoc.findTextPos('target text');
await superdoc.setTextSelection(pos, pos + 'target text'.length);
await superdoc.waitForStable();
```

## Asserting Marks and Styles

Use document-api-backed text assertions from the fixture, not DOM inspection:

```ts
// Good — text-targeted assertions (document-api only)
await superdoc.assertTextHasMarks('target text', ['bold', 'italic']);
await superdoc.assertTextMarkAttrs('target text', 'textStyle', { fontFamily: 'Georgia' });
await superdoc.assertTextMarkAttrs('target text', 'link', { href: 'https://example.com' });

// Bad — fragile, depends on DomPainter's rendering implementation
const el = superdoc.page.locator('.some-rendered-span');
await expect(el).toHaveCSS('font-weight', '700');
```

Exception: toolbar button state, element visibility, and CSS properties that ARE the
thing being tested (hover states, border styles) should use DOM assertions.

## Toolbar Buttons

Toolbar elements use `data-item` attributes:

```ts
// Buttons
superdoc.page.locator('[data-item="btn-bold"]')
superdoc.page.locator('[data-item="btn-italic"]')
superdoc.page.locator('[data-item="btn-fontFamily"]')
superdoc.page.locator('[data-item="btn-color"]')
superdoc.page.locator('[data-item="btn-textAlign"]')
superdoc.page.locator('[data-item="btn-table"]')
superdoc.page.locator('[data-item="btn-link"]')
superdoc.page.locator('[data-item="btn-tableActions"]')
superdoc.page.locator('[data-item="btn-documentMode"]')

// Dropdown options: append "-option" to the button's data-item
superdoc.page.locator('[data-item="btn-fontFamily-option"]').filter({ hasText: 'Georgia' })
superdoc.page.locator('[data-item="btn-fontSize-option"]').filter({ hasText: '18' })

// Color swatches
superdoc.page.locator('.option[aria-label="red"]').first()

// Active state
await expect(superdoc.page.locator('[data-item="btn-bold"]')).toHaveClass(/active/);
```

Dropdown workflow: click the button to open, then click the option, with `waitForStable()` after each.

## Tables

DomPainter renders tables as flat divs, not `<table>/<tr>/<td>`. Use fixture assertions for
table structure (document-api only):

```ts
// Insert via command, not toolbar (faster, more reliable)
await superdoc.executeCommand('insertTable', { rows: 2, cols: 2, withHeaderRow: false });
await superdoc.waitForStable();

// Assert structure
await superdoc.assertTableExists(2, 2);

// Navigate between cells
await superdoc.press('Tab');       // next cell
await superdoc.press('Shift+Tab'); // previous cell
```

`assertTableExists()` requires `window.editor.doc` in the behavior harness.

## Using page.evaluate()

For anything the fixture doesn't cover, use `superdoc.page.evaluate()` to run code in the
browser. The editor is on `window.editor` and the SuperDoc instance on `window.superdoc`.
If exposed, document-api is on `window.editor.doc`.

```ts
const result = await superdoc.page.evaluate(() => {
  const { state } = (window as any).editor;
  // ... inspect PM state
  return something;
});
```

For commands:

```ts
await superdoc.page.evaluate(() => {
  (window as any).editor.commands.someCommand({ arg: 'value' });
});
```

Prefer `superdoc.executeCommand()` when possible — it includes a wait for `editor.commands`
to be available.

## Snapshots

`snapshot()` is a debug aid, not an assertion. It only captures when `SCREENSHOTS=1` is set.
Use it to mark key visual states in a test for the HTML report:

```ts
await superdoc.snapshot('before bold');   // label describes the state
// ... apply bold ...
await superdoc.snapshot('after bold');
```

## File Structure

Group tests by feature area:

```
tests/
  toolbar/          toolbar button interactions
  tables/           table-specific behavior (resize, structure)
  sdt/              structured content (content controls)
  helpers/          unit tests for shared helper functions
```

## Shared Setup Patterns

Extract repeated setup into a helper function at the top of the file:

```ts
async function typeAndSelect(superdoc: SuperDocFixture): Promise<number> {
  await superdoc.type('This is a sentence');
  await superdoc.waitForStable();
  const pos = await superdoc.findTextPos('is a sentence');
  await superdoc.setTextSelection(pos, pos + 'is a sentence'.length);
  await superdoc.waitForStable();
  return pos;
}
```

Use `test.describe()` + `test.beforeEach()` when a group of tests shares identical setup.

## Common Mistakes

1. **Missing `waitForStable()`** — flaky assertions that sometimes pass, sometimes fail.
2. **Relying on `waitForStable()` for animated UI** — dropdowns, modals, and popups animate
   open/closed. `waitForStable()` may return mid-animation. Wait for the specific element
   state (e.g. `waitFor({ state: 'hidden' })`) instead.
3. **Using stale positions after mark changes** — PM re-indexes after marks are applied.
   Always call `findTextPos()` again after applying/removing marks.
4. **Asserting DOM for content** — DomPainter's output differs from the editor model.
   Prefer document-api fixture helpers for content/format assertions.
5. **Clicking to select text** — fragile across browsers. Use `findTextPos()` + `setTextSelection()`.
6. **Writing custom settle helpers** — use the fixture's `waitForStable()`.
7. **Importing from `@playwright/test`** — the fixture re-exports `test` and `expect` with
   the `superdoc` fixture pre-wired. Only import types from `@playwright/test`.
8. **Forgetting `toolbar: 'full'`** — toolbar buttons won't exist without this config.
9. **Forgetting `showSelection: true`** — selection overlays are hidden by default;
   tests that need to verify or interact with selection rects must opt in.
