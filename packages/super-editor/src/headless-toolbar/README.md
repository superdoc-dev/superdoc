# Headless Toolbar

## Overview

`headless-toolbar` lets consumers build a fully custom toolbar UI for SuperDoc without using built-in toolbar components.

It provides:

- toolbar state via `ToolbarSnapshot`
- normalized active editing context
- direct access to editor commands and document primitives
- optional built-in `execute()` for built-in toolbar semantics
- helper utilities for linked styles and image upload flows

## Quick start

```ts
import { createHeadlessToolbar } from 'superdoc/headless-toolbar';

const toolbar = createHeadlessToolbar({
  superdoc,
  commands: ['bold', 'italic', 'underline', 'font-size', 'link', 'undo', 'redo'],
});

const unsubscribe = toolbar.subscribe(({ snapshot }) => {
  renderToolbar(snapshot);
});

toolbar.execute?.('bold');

toolbar.destroy();
unsubscribe();
```

`snapshot` contains:

- `context` for the current active editing target
- `commands` for built-in command UI state

## How actions are executed

- Use `snapshot.commands` for UI state such as `active`, `disabled`, and `value`
- Use `snapshot.context?.target.commands.*` for direct command execution
- Use `toolbar.execute(id, payload?)` for built-in toolbar semantics

Example:

```ts
toolbar.execute?.('bold');
snapshot.context?.target.commands?.setTextAlign?.('center');
```

## Helpers

`headlessToolbarConstants` provides default option lists for common controls such as:

- font family
- font size
- text align
- line height
- zoom
- document mode

`headlessToolbarHelpers` provides utilities for richer consumer-owned flows:

- linked styles:
  - `getQuickFormatList(editor)`
  - `generateLinkedStyleString(...)`
- image flow:
  - `getFileOpener()`
  - `processAndInsertImageFile(...)`

## Reference

See `examples/advanced/headless-toolbar` for a complete integration example.
