# SuperDoc examples

Minimal, copy-pasteable examples organized to mirror the [docs](https://docs.superdoc.dev): Getting Started, Editor, Document API, Document Engine, AI, and Advanced.

Examples answer: "How do I use this one SuperDoc primitive or integration pattern?"

If you want a composed app, a product workflow, or something polished enough to record as a customer scenario, use [`demos/`](../demos/) instead.

The machine-readable index lives in [`manifest.json`](./manifest.json).

## Examples vs demos

Use `examples/` when the code should be small enough to copy into a new project and adapt. A good example has one lesson, neutral UI, a short README, a manifest entry, and a local build command.

Use `demos/` when the value comes from multiple SuperDoc features working together. Demos can include realistic panels, fake backend data, library state, gallery metadata, and product-specific copy.

Examples may overlap with demos. That is expected when the example is the smallest readable form of a primitive that a demo composes into a larger workflow. The example should still stand on its own as a focused reference.

## Adding an example

- Teach one concept or one integration pattern.
- Keep UI and state management only as large as the lesson requires.
- Name folders by API or pattern, not by a customer scenario, when possible.
- Add a README with what it teaches, how to run it, and related demos or docs.
- Add an entry to [`manifest.json`](./manifest.json) and this README.
- Run the package build for the touched workspace.

## Getting started

Framework starters. Pick one, run `pnpm install && pnpm dev`.

| Example | Description |
|---------|-------------|
| [react](./getting-started/react) | React + TypeScript with Vite |
| [vue](./getting-started/vue) | Vue 3 + TypeScript with Vite |
| [vanilla](./getting-started/vanilla) | Plain JavaScript with Vite |
| [cdn](./getting-started/cdn) | Zero build tools, just an HTML file |
| [angular](./getting-started/angular) | Angular setup |
| [nextjs](./getting-started/nextjs) | Next.js (SSR-safe) |
| [nuxt](./getting-started/nuxt) | Nuxt setup |
| [laravel](./getting-started/laravel) | Laravel + Inertia |

## Editor

Patterns for the browser editor surface.

### Built-in UI

| Example | Docs |
|---------|------|
| [comments](./editor/built-in-ui/comments) | [docs](https://docs.superdoc.dev/editor/built-in-ui/comments) |
| [track-changes](./editor/built-in-ui/track-changes) | [docs](https://docs.superdoc.dev/editor/built-in-ui/track-changes) |
| [toolbar](./editor/built-in-ui/toolbar) | [docs](https://docs.superdoc.dev/editor/built-in-ui/toolbar) |

### Custom UI

| Example | Docs |
|---------|------|
| [selection-capture](./editor/custom-ui/selection-capture) | [docs](https://docs.superdoc.dev/editor/custom-ui/selection-and-viewport) |
| [configurable-toolbar](./editor/custom-ui/configurable-toolbar) | [docs](https://docs.superdoc.dev/editor/custom-ui/toolbar-and-commands) |

### Theming

| Example | Docs |
|---------|------|
| [theming](./editor/theming) | [docs](https://docs.superdoc.dev/editor/theming/overview) |

### Spell check

| Example | Docs |
|---------|------|
| [spell-check](./editor/spell-check) | [docs](https://docs.superdoc.dev/editor/spell-check/overview) |

### Collaboration

Realtime provider examples for the browser editor.

| Example | Description |
|---------|-------------|
| [providers/yhub](./editor/collaboration/providers/yhub) | SuperDoc + YHub client (advanced attribution and revision-history workflows; beta) |
| [providers/liveblocks](./editor/collaboration/providers/liveblocks) | SuperDoc + Liveblocks managed service |
| [providers/hocuspocus](./editor/collaboration/providers/hocuspocus) | SuperDoc + Hocuspocus self-hosted Yjs server |
| [providers/superdoc-yjs](./editor/collaboration/providers/superdoc-yjs) | SuperDoc Yjs minimal reference server (not production infrastructure) |

Backend automation and local infrastructure.

| Example | Description |
|---------|-------------|
| [backends/node-sdk](./editor/collaboration/backends/node-sdk) | Node backend that joins and mutates a live collaboration room |
| [backends/fastapi](./editor/collaboration/backends/fastapi) | FastAPI backend that joins and mutates a live collaboration room |
| [backends/fastapi/yjs-hub](./editor/collaboration/backends/fastapi/yjs-hub) | Local YHub server used by the YHub and backend examples |

## Document API

The operation contract for reading and editing documents. Same shape in the browser, in Node SDKs, in the CLI, and behind AI tool wrappers.

Put operation-level examples here even when the browser editor hosts the example through `editor.doc.*`. Document API is not editor-only and should not be nested under Document Engine just because an operation can run headless.

| Example | Pattern |
|---------|---------|
| [content-controls/tagged-inline-text](./document-api/content-controls/tagged-inline-text) | The smallest content-control workflow: wrap a word, find by tag, update value. |
| [metadata-anchors](./document-api/metadata-anchors) | The smallest metadata-anchor workflow: attach a JSON payload to a span, then list, get, resolve, and remove it. |

## Document Engine

Engine-level workflows that are not a single Document API operation primitive. Keep new Document API examples in `document-api/`; use this folder for workflows such as diffing and engine-driven redlining.

| Example | Docs |
|---------|------|
| [diffing](./document-engine/diffing) | [docs](https://docs.superdoc.dev/document-engine/diffing) |
| [ai-redlining](./document-engine/ai-redlining) | [docs](https://docs.superdoc.dev/getting-started/ai) |

## AI

Document editing through models and agents.

| Example | Description |
|---------|-------------|
| [bedrock](./ai/bedrock) | AWS Bedrock Converse API with tool use |
| [streaming](./ai/streaming) | Stream model output into a visible editor |
| [redlining](./ai/redlining) | LLM-driven tracked-change review (browser) |
| [footnote-tool-agent](./ai/footnote-tool-agent) | Real LLM tool-use loop: model picks `addFootnoteCitation`, browser executes against `editor.doc` |

## Advanced

Edge cases and infrastructure-level patterns. Most consumers won't need these.

| Example | Notes |
|---------|-------|
| [extensions/custom-mark](./advanced/extensions/custom-mark) | Custom mark authoring |
| [extensions/custom-node](./advanced/extensions/custom-node) | Custom node authoring |
| [headless-toolbar](./advanced/headless-toolbar) | Framework-agnostic toolbar substrate |

## Running an example

```bash
cd <path-to-example>
pnpm install
pnpm dev
```

For the CDN example, open `index.html` directly or run `npx serve .`.

## Documentation

- [Quickstart](https://docs.superdoc.dev/getting-started/quickstart)
- [Configuration](https://docs.superdoc.dev/editor/superdoc/configuration)
