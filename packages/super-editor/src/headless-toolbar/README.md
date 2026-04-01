# Headless Toolbar

## Overview

`headless-toolbar` lets consumers build a fully custom toolbar UI for SuperDoc without using built-in toolbar components.

It provides:

- toolbar state via `ToolbarSnapshot`
- normalized active editing context
- `execute()` for running toolbar commands with built-in semantics
- helper utilities for linked styles and image upload flows

## Quick start

```ts
import { SuperDoc } from 'superdoc';
import { createHeadlessToolbar } from 'superdoc/headless-toolbar';

const superdoc = new SuperDoc({
  selector: '#editor',
  document: '/my-document.docx',
});

const toolbar = createHeadlessToolbar({
  superdoc,
  commands: ['bold', 'italic', 'underline', 'font-size', 'link', 'undo', 'redo'],
});

const unsubscribe = toolbar.subscribe(({ snapshot }) => {
  renderToolbar(snapshot);
});

toolbar.execute('bold');

toolbar.destroy();
unsubscribe();
```

> Don't pass `toolbar` to the SuperDoc constructor. The headless toolbar replaces the built-in UI entirely.

`snapshot` contains:

- `context` for the current active editing target
- `commands` for built-in command UI state (`active`, `disabled`, `value`)

## Executing commands

Use `toolbar.execute(id, payload?)` for all toolbar actions:

```ts
toolbar.execute('bold');
toolbar.execute('font-size', '14pt');
toolbar.execute('text-color', '#ff0000');
toolbar.execute('zoom', 125);
```

For commands not covered by `execute()`, you can use `snapshot.context?.target.commands.*` as an escape hatch for direct access to the editor command surface.

## Command reference

| Command | Payload | `value` in snapshot |
|---------|---------|---------------------|
| `bold` | none | — |
| `italic` | none | — |
| `underline` | none | — |
| `strikethrough` | none | — |
| `font-size` | size string, e.g. `'12pt'` | size string with unit, e.g. `'12pt'` |
| `font-family` | CSS font family, e.g. `'Arial, sans-serif'` | full CSS font family, e.g. `'Arial, sans-serif'` |
| `text-color` | hex string, e.g. `'#ff0000'`, or `'none'` | lowercase hex string, e.g. `'#ff0000'` |
| `highlight-color` | hex string or `'none'` | lowercase hex string, e.g. `'#ffff00'` |
| `link` | `{ href: string \| null }` | href string or `null` |
| `text-align` | `'left'` \| `'center'` \| `'right'` \| `'justify'` | current alignment string |
| `line-height` | number, e.g. `1.5` | current line height number |
| `linked-style` | style object from `getQuickFormatList()` | style ID string |
| `bullet-list` | none | — |
| `numbered-list` | none | — |
| `indent-increase` | none | — |
| `indent-decrease` | none | — |
| `undo` | none | — |
| `redo` | none | — |
| `ruler` | none | — |
| `zoom` | number, e.g. `125` | current zoom number |
| `document-mode` | `'editing'` \| `'suggesting'` \| `'viewing'` | current mode string |
| `clear-formatting` | none | — |
| `copy-format` | none | — |
| `track-changes-accept-selection` | none | — |
| `track-changes-reject-selection` | none | — |
| `image` | none (opens file picker) | — |
| `table-insert` | `{ rows: number, cols: number }` | — |
| `table-add-row-before` | none | — |
| `table-add-row-after` | none | — |
| `table-delete-row` | none | — |
| `table-add-column-before` | none | — |
| `table-add-column-after` | none | — |
| `table-delete-column` | none | — |
| `table-delete` | none | — |
| `table-merge-cells` | none | — |
| `table-split-cell` | none | — |
| `table-remove-borders` | none | — |
| `table-fix` | none | — |

## Constants

`headlessToolbarConstants` provides default option lists for common controls:

- `DEFAULT_FONT_FAMILY_OPTIONS`
- `DEFAULT_FONT_SIZE_OPTIONS`
- `DEFAULT_TEXT_ALIGN_OPTIONS`
- `DEFAULT_LINE_HEIGHT_OPTIONS`
- `DEFAULT_ZOOM_OPTIONS`
- `DEFAULT_DOCUMENT_MODE_OPTIONS`
- `DEFAULT_TEXT_COLOR_OPTIONS`
- `DEFAULT_HIGHLIGHT_COLOR_OPTIONS`

Each option has `{ label: string, value: string | number }`. Use `value` when calling `execute()`.

## Helpers

`headlessToolbarHelpers` provides utilities for richer consumer-owned flows:

- linked styles:
  - `getQuickFormatList(editor)` — returns available paragraph styles
  - `generateLinkedStyleString(...)` — returns inline CSS for style preview
- image flow:
  - `getFileOpener()` — returns a function that opens a file picker
  - `processAndInsertImageFile(...)` — processes and inserts an image file

## Reference

See `examples/advanced/headless-toolbar` for a complete integration example.
