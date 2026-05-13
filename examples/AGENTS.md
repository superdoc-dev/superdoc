# Examples

Examples are minimal, copy-pasteable references. They teach one SuperDoc primitive or one integration pattern in the smallest useful amount of code.

If the work becomes a product workflow, a fake backend, a polished sidebar, or a composed scenario with several SuperDoc features, put it in `demos/` instead.

## What belongs here

- One feature primitive or one integration pattern.
- Neutral naming by API or pattern when possible.
- UI only large enough to exercise the concept.
- A README that explains what the example teaches, how to run it, and related demos or docs.
- An entry in `examples/manifest.json` and `examples/README.md`.

Examples may overlap with demos when the example is the smallest readable form of a primitive that a demo composes into a larger workflow.

## Document API examples

- Put operation-level examples under `examples/document-api/`.
- Frame Document API as a cross-surface contract. Browser examples may use `editor.doc.*`, but avoid implying that Document API is editor-only.
- If the example uses setup mutations to seed a document, separate setup from the teaching surface in the README and source comments.
- Do not publish examples for known-bug or unverified paths unless the README states the limitation and the behavior has been verified in that exact workspace.

## UI baseline

- Import `superdoc/style.css` before local CSS when the example renders SuperDoc.
- Use the SuperDoc token contract (`--sd-*`) or local aliases that resolve to those tokens. Avoid Vite starter purple, one-off palettes, and hardcoded brand colors unless the example is explicitly about theming.
- Keep product UI quiet and functional: canvas background, white control surfaces, 1px borders, 4-6px radii, SuperDoc blue for the primary action, 12-14px control text.
- Examples should not use marketing gradients, hero sections, decorative illustrations, or product-story chrome.
- Prefer the standard editor-left/sidebar-right shell for browser editor examples unless the feature requires a different layout.

## Verification

- Run the package build for each touched example workspace.
- Do not commit generated `dist/` output or `node_modules/`.
- Treat stale README, AGENTS, and CLAUDE instructions as bugs; see `../comment-policy.md`.
