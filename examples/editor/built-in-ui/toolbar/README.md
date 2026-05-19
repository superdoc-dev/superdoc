# Built-in toolbar UI

The smallest setup that mounts SuperDoc's built-in toolbar above the editor canvas, with the default set of formatting actions and no custom command registration.

## What this teaches

- Enabling the `toolbar` module on `SuperDoc` and binding it to a sibling DOM container.
- The default toolbar surface: text formatting, lists, undo/redo, alignment, and so on.
- How the toolbar reads and writes editor state through the same engine the editor uses.

## Run it

```bash
pnpm install
pnpm dev
```

Open the local URL Vite prints.

## When to reach for it

- You want a working toolbar without writing one.
- You're evaluating whether the default toolbar covers your needs before deciding to build a custom one.

## When not

- You need a custom toolbar (your own buttons, your own design system, command grouping, dropdowns). Use the headless toolbar or `ui.commands.*` instead. See [`examples/editor/custom-ui/configurable-toolbar`](../../custom-ui/configurable-toolbar) and [`examples/advanced/headless-toolbar`](../../../advanced/headless-toolbar).

## Docs

[Built-in UI: toolbar](https://docs.superdoc.dev/editor/built-in-ui/toolbar).
