# SuperDoc Demos

Source-only demos used by the [SuperDoc demo gallery](https://superdoc.dev). A demo composes multiple SuperDoc features into a workflow. If you want the smallest copy-pasteable path for one feature, use [`examples/`](../examples/) instead.

The machine-readable index lives in [`manifest.json`](./manifest.json).

## Source demos vs live demos

This monorepo's `demos/` folder is the source showcase surface. Demos here run locally from workspace builds and are smoke-tested against the current repository state.

Live demos that run at `demos.superdoc.dev` live in the separate `superdoc-dev/demos` repository. Manifest entries use `sourceRepo`, `sourcePath`, and optional `liveUrl` so the homepage can show both surfaces without hardcoded paths.

## Curated source demos

| Demo | Category | Notes |
|------|----------|-------|
| [custom-ui](./custom-ui) | Editor | Full Custom UI reference workspace |
| [grading-papers](./grading-papers) | Editor | Product workflow for paper review |
| [slack-redlining](./slack-redlining) | AI | Slack and AI redlining workflow |
| [chrome-extension](./chrome-extension) | Integrations | Browser extension workflow |
| [word-addin](./word-addin) | Integrations | Microsoft Word add-in sync workflow |

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
