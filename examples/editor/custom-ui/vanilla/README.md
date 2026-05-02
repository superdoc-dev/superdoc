# Custom UI: vanilla TypeScript

Build a custom toolbar, comments sidebar, and tracked-changes review panel on top of SuperDoc with no framework, using just `createSuperDocUI` and plain DOM.

This example mirrors `demos/custom-ui/` (React) feature-for-feature. The two are meant to be read side-by-side: every React hook (`useSuperDocCommand`, `useSuperDocComments`, `useSuperDocTrackChanges`, `useSuperDocSelection`, `useSuperDocDocument`) corresponds to a controller call here (`ui.commands.<id>.observe`, `ui.comments.subscribe`, etc.). The React wrappers are sugar over the same surface this example uses directly.

## Run

```bash
pnpm install
pnpm dev
```

Then open the printed local URL.

## What it covers

- Mount SuperDoc with the built-in toolbar and comments UI disabled
- Custom toolbar with built-in commands (bold / italic / underline / undo / redo / bullet / numbered list)
- Custom command registered through `ui.commands.register(...)`
- Comments sidebar with composer using `ui.selection.capture()` so the anchor survives focus changes
- Tracked-changes review panel (accept, reject, accept all, reject all, prev, next)
- Edit / Suggest mode toggle, Import (`replaceFile`), Export (`export`), dirty indicator
- Clean teardown: every subscription torn down on Vite HMR and on tab close

## File layout

```
src/
  main.ts           bootstrap: SuperDoc + createSuperDocUI + tear-down
  bind.ts           Disposer + bind helpers (the boilerplate React hides)
  toolbar.ts        built-in commands + custom Insert-clause command
  comments.ts       comments sidebar + capture composer
  track-changes.ts  review panel
  document.ts       Edit/Suggest toggle, Import, Export
  style.css         minimal CSS: borrows the same vars as the React demo
```

## Related package work

This example was the first non-React surface built on `superdoc/ui`. The DX gaps surfaced while porting are tracked under SD-2874: SD-2917 (cast on `createSuperDocUI`), SD-2918 (`ui.createScope()` lifecycle helper), SD-2919 (value-shaped observers), SD-2920 (command discovery helpers), SD-2921 (stale JSDoc example).
