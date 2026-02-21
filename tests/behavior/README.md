# Behavior Tests

Playwright tests that run against a real SuperDoc instance in the browser (Chromium, Firefox, WebKit).

## Setup

```sh
pnpm install
pnpm --filter @superdoc-testing/behavior setup   # install browser binaries
```

## Running

```sh
pnpm test:behavior                        # all browsers, headless
pnpm test:behavior:ui                     # Playwright UI mode
pnpm test:behavior:html                   # run + open HTML report
pnpm test:behavior:headed                 # watch the browser
pnpm test:behavior -- --project=chromium  # single browser
```

### Debugging flags

Traces and screenshots are **off** by default for speed:

```sh
pnpm test:behavior:trace                  # enable Playwright traces
pnpm test:behavior:screenshots            # enable auto-screenshots + snapshot() captures
```

### CI sharding

Split across runners with `--shard`:

```sh
playwright test --shard=1/3
playwright test --shard=2/3
playwright test --shard=3/3
```

## Writing a test

### 1. Create a spec file

```
tests/
  toolbar/
    my-feature.spec.ts    <-- group by feature area
```

### 2. Use the `superdoc` fixture

```ts
import { test, expect } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full', showSelection: true } });

test('my feature works', async ({ superdoc }) => {
  await superdoc.type('Hello world');
  await superdoc.waitForStable();

  const pos = await superdoc.findTextPos('Hello');
  await superdoc.setTextSelection(pos, pos + 5);
  await superdoc.bold();
  await superdoc.waitForStable();

  await superdoc.assertTextHasMarks('Hello', ['bold']);
  await superdoc.snapshot('bold applied');  // only captured when SCREENSHOTS=1
});
```

The fixture navigates to the harness, boots SuperDoc, and focuses the editor for you.

### 3. Fixture config options

Pass via `test.use({ config: { ... } })`:

| Option | Default | Description |
|--------|---------|-------------|
| `layout` | `true` | Enable layout engine |
| `toolbar` | none | `'none'` \| `'full'` |
| `comments` | `'off'` | `'off'` \| `'on'` \| `'panel'` \| `'readonly'` |
| `trackChanges` | `false` | Show tracked changes |
| `showCaret` | `false` | Show caret (hidden by default to reduce flakiness) |
| `showSelection` | `false` | Show selection overlays |

### 4. Key fixture methods

**Interact:**
`type()`, `press()`, `newLine()`, `shortcut()`, `bold()`, `italic()`, `underline()`, `undo()`, `redo()`, `selectAll()`, `tripleClickLine()`, `clickOnLine()`, `setTextSelection()`, `executeCommand()`, `setDocumentMode()`, `loadDocument()`, `waitForStable()`

**Assert:**
`assertTextContent()`, `assertTextContains()`, `assertLineText()`, `assertLineCount()`, `assertPageCount()`, `assertTextHasMarks()`, `assertTextLacksMarks()`, `assertTextMarkAttrs()`, `assertTextAlignment()`, `assertMarksAtPos()`, `assertMarkActive()`, `assertMarkAttrsAtPos()`, `assertTableExists()`, `assertElementExists()`, `assertElementVisible()`, `assertElementHidden()`, `assertElementCount()`, `assertSelection()`, `assertLinkExists()`, `assertTrackedChangeExists()`, `assertDocumentMode()`

**Get (for custom assertions):**
`getTextContent()`, `getSelection()`, `getMarksAtPos()`, `getMarkAttrsAtPos()`, `findTextPos()`

### 5. Loading .docx files

Place fixtures in `test-data/` (gitignored) and use `loadDocument`:

```ts
test('renders imported doc', async ({ superdoc }) => {
  await superdoc.loadDocument('test-data/my-fixture.docx');
  await superdoc.assertTextContains('Expected content');
});
```

### 6. Tips

- Call `waitForStable()` after interactions that mutate the DOM before making assertions.
- Use `findTextPos()` + `setTextSelection()` instead of clicking to select text — it's deterministic.
- Prefer text-based assertions (`assertTextHasMarks`, `assertTextMarkAttrs`, `assertTextAlignment`) to avoid PM position coupling.
- Use `executeCommand()` to call ProseMirror commands directly (e.g. `insertTable`).
- Access `superdoc.page` for any raw Playwright API when the fixture methods aren't enough.
