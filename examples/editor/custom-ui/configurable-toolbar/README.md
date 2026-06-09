# Custom UI: configurable toolbar

The smallest example that proves how to build your own toolbar with `superdoc/ui`. Single file, no framework.

## What this teaches

A custom toolbar binds controls to commands. The same surface holds built-ins (`bold`, `italic`, `underline`, `font-family`, ...) and your own (`example.insertClause`). Each button subscribes per-id via `ui.commands.<id>.observe(...)`, so changes to one command don't re-render the rest of the row. Click handlers run `ui.commands.get(id).execute()`.

`ui.commands.register({ id, execute, getState })` puts a custom command on the same surface as built-ins. The example registers one and binds a button to it the same way it binds the bold button.

The font-family picker uses `ui.fonts.observe(...)` for its options and applies the chosen value with `ui.toolbar.execute('font-family', value)`. The options include bundled defaults and fonts used by the active document. The picker uses a button menu so opening it does not move focus away from the editor selection.

This example shows that flow and nothing else. No threading, no resolve / reopen, no comments, no mode toggle. For the full Custom UI sidebar pattern, see [`demos/custom-ui`](../../../../../demos/custom-ui).

## Run

```bash
pnpm install
pnpm dev
```

Click the buttons. Bold, Italic, Underline toggle on the current selection. The font picker changes the selected text's font family. Insert clause inserts a fixed snippet at the cursor.

## See also

- [Custom UI > Toolbar and commands](https://docs.superdoc.dev/editor/custom-ui/toolbar-and-commands)
- [Custom UI > API reference](https://docs.superdoc.dev/editor/custom-ui/api-reference)
- [Custom UI > Custom commands](https://docs.superdoc.dev/editor/custom-ui/custom-commands)
- [Custom UI > Controller setup](https://docs.superdoc.dev/editor/custom-ui/controller-setup)
