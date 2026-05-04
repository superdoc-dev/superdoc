# Custom UI: vanilla toolbar

A custom SuperDoc toolbar in plain TypeScript. Single file, no framework, copy-paste into your own app.

## What this teaches

- `createSuperDocUI({ superdoc })` for the controller surface.
- `ui.createScope()` for lifecycle, with auto-cascade on `ui.destroy()`.
- Per-command `observe(state => ...)` so each button only re-renders when its own command changes.
- `ui.commands.has(id)` and `ui.commands.require(id)` to validate a config-driven button list.
- One custom command registered via `scope.register(...)`, auto-unregistered on tear-down.

## Run

```bash
pnpm install
pnpm dev
```

The `predev` script builds the local `superdoc` workspace package so type imports resolve from `dist/`. From a published `npm` install this step is unnecessary.

## See also

- Docs: [Custom UI overview](https://docs.superdoc.dev/editor/custom-ui/overview)
- React equivalent: [`demos/custom-ui`](../../../../demos/custom-ui) (composed end-to-end app)
- Headless Toolbar (lower-level alternative): [`examples/advanced/headless-toolbar`](../../../advanced/headless-toolbar)
