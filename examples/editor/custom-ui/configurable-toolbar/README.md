# Custom UI: configurable toolbar

The smallest example that proves how to build your own toolbar with `superdoc/ui`. Single file, no framework.

## What this teaches

A custom toolbar binds buttons to commands. The same surface holds built-ins (`bold`, `italic`, `underline`, ...) and your own (`example.insertClause`). Each button subscribes per-id via `ui.commands.<id>.observe(...)`, so changes to one command don't re-render the rest of the row. Click handlers run `ui.commands.get(id).execute()`.

`ui.commands.register({ id, execute, getState })` puts a custom command on the same surface as built-ins. The example registers one and binds a button to it the same way it binds the bold button.

This example shows that flow and nothing else. No threading, no resolve / reopen, no comments, no mode toggle. For the full Custom UI sidebar pattern, see [`demos/custom-ui`](../../../../../demos/custom-ui).

## Run

```bash
pnpm install
pnpm dev
```

Click the buttons. Bold, Italic, Underline toggle on the current selection. Insert clause inserts a fixed snippet at the cursor.

## See also

- [Custom UI > Toolbar and commands](https://docs.superdoc.dev/editor/custom-ui/toolbar-and-commands)
- [Custom UI > Custom commands](https://docs.superdoc.dev/editor/custom-ui/custom-commands)
- [Custom UI > Controller setup](https://docs.superdoc.dev/editor/custom-ui/controller-setup)
