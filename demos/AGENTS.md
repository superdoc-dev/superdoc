# Demos

Demos are composed product workflows and showcase surfaces. They answer what someone can build with SuperDoc, not just how one API call works.

If the work only teaches one primitive or one integration pattern, put it in `examples/` instead.

## What belongs here

- Multiple SuperDoc features working together in a realistic workflow.
- Product-shaped UI, fake backend state, library data, or scenario copy when it helps the workflow make sense.
- A README that explains the scenario, the features being composed, how to run it, and related examples or docs.
- An entry in `demos/manifest.json`.

Set `homepage: true` only when the demo is gallery-ready: verified locally, clear enough for users, and backed by the metadata or assets the homepage expects. Use `homepage: false` for source demos that are useful but not ready for the gallery.

## UI baseline

- Import `superdoc/style.css` before local CSS when the demo renders SuperDoc.
- Use the SuperDoc token contract (`--sd-*`) or local aliases that resolve to those tokens. Avoid Vite starter purple and one-off palettes unless the demo is intentionally showing theming.
- Product demos should feel precise and functional: flat surfaces, clear hierarchy, restrained whitespace, 1px borders, 4-8px radii, SuperDoc blue for primary actions.
- Do not use marketing gradients in product UI. `brand.md` reserves gradients for marketing heroes and landing pages.
- Show the working product surface first. Avoid landing-page heroes unless the demo is specifically a marketing page.

## Source demos vs live demos

This monorepo owns source demos. Some live demos at `demos.superdoc.dev` live in the separate `superdoc-dev/demos` repository. Do not assume every source demo has a `liveUrl`, thumbnail, or deployed counterpart.

## Verification

- Run the package build for each touched demo workspace.
- Browser-smoke workflows when the change affects UI, document state, import/export, or a customer-recordable flow.
- Do not commit generated `dist/` output or `node_modules/`.
- Treat stale README, AGENTS, and CLAUDE instructions as bugs; see `../comment-policy.md`.
