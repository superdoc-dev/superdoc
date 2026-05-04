# Custom UI: vanilla tracked changes

A custom SuperDoc tracked-changes review panel in plain TypeScript. Single file, no framework, copy-paste into your own app.

## What this teaches

- `ui.trackChanges.observe(snapshot => ...)` to render the review list from a single subscription.
- `ui.trackChanges.accept(id)` / `.reject(id)` for per-change decisions.
- `ui.trackChanges.acceptAll()` / `.rejectAll()` for bulk decisions.
- `ui.trackChanges.next()` / `.previous()` / `.scrollTo(id)` for navigation, plus the live `activeId` so the panel highlights the change under the cursor.
- `ui.document.observe` + `setMode('editing' | 'suggesting')` so the user can toggle between editing normally and recording tracked changes.
- `ui.createScope()` for lifecycle, plus `ui.destroy()` cascading on tear-down.

## Run

```bash
pnpm install
pnpm dev
```

Switch to **Suggest** mode and edit the document. Each insertion or deletion becomes a tracked change in the right-hand panel. Accept and reject decisions round-trip through Word.

The `predev` script builds the local `superdoc` workspace package so type imports resolve from `dist/`. From a published `npm` install this step is unnecessary.

## See also

- Docs: [Custom UI > Track changes](https://docs.superdoc.dev/editor/custom-ui/track-changes)
- Sibling examples: [`toolbar/vanilla`](../../toolbar/vanilla), [`comments/vanilla`](../../comments/vanilla)
