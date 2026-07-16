# SuperDoc Demos

Source-only demos used by the [SuperDoc demo gallery](https://superdoc.dev).

Demos answer: "What can I build with SuperDoc?"

A demo composes multiple SuperDoc features into a workflow, often with realistic UI, fake backend data, product copy, gallery metadata, or a video-ready scenario. If you want the smallest copy-pasteable path for one primitive, use [`examples/`](../examples/) instead.

The machine-readable index lives in [`manifest.json`](./manifest.json).

## Demos vs examples

Use `demos/` when the point is the workflow: contract templates, grading papers, Slack redlining, browser extensions, Word add-ins, and similar product-shaped experiences.

Use `examples/` when the point is the API call or integration pattern. Examples can overlap with demos, but the example should remove the product story and show the smallest useful code path.

Before marking a demo as homepage-ready, make sure it has been verified locally, has a clear README, and has the gallery metadata or assets the homepage expects. Leave `homepage: false` while a demo is useful for source review but not ready for the gallery.

## Source demos vs live demos

This monorepo's `demos/` folder is the source showcase surface. Demos here run locally from workspace builds and are smoke-tested against the current repository state.

Live demos that run at `demos.superdoc.dev` live in the separate `superdoc-dev/demos` repository. Manifest entries use `sourceRepo`, `sourcePath`, and optional `liveUrl` so the homepage can show both surfaces without hardcoded paths.

## Curated source demos

| Demo | Category | Notes |
|------|----------|-------|
| [contract-templates](./contract-templates) | Editor | Content-controls workflow with smart fields, versioned clauses, and update detection |
| [custom-ui](./custom-ui) | Editor | Full Custom UI reference workspace |
| [grading-papers](./grading-papers) | Editor | Product workflow for paper review |
| [slack-redlining](./slack-redlining) | AI | Slack and AI redlining workflow |
| [chrome-extension](./chrome-extension) | Integrations | Browser extension workflow |
| [word-addin](./word-addin) | Integrations | Microsoft Word add-in sync workflow |

## Security

Demo backend servers (`slack-redlining`, `word-addin`, `nodejs`, `collaborative-agent`) are for **local development only**. They listen on plain HTTP and have no TLS configuration.

**Never expose these servers directly to the internet.** If you need to run a demo in a non-local environment, terminate TLS at a reverse proxy in front of the server.

Risk acceptance: HTTP-only transport is an accepted trade-off for local demo servers. Production deployments must add TLS termination externally.

## Compatibility shims

Some old starter demo paths now point at `examples/getting-started/`. Keep the README shims for one release cycle so existing GitHub links do not 404.

| Old path | New path |
|----------|----------|
| [cdn](./cdn) | [examples/getting-started/cdn](../examples/getting-started/cdn) |
| [react](./react) | [examples/getting-started/react](../examples/getting-started/react) |
| [typescript](./typescript) | [examples/getting-started/react](../examples/getting-started/react) |
| [vanilla](./vanilla) | [examples/getting-started/vanilla](../examples/getting-started/vanilla) |
| [vue](./vue) | [examples/getting-started/vue](../examples/getting-started/vue) |
| [custom-mark](./custom-mark) | [examples/advanced/extensions/custom-mark](../examples/advanced/extensions/custom-mark) |
| [custom-node](./custom-node) | [examples/advanced/extensions/custom-node](../examples/advanced/extensions/custom-node) |
