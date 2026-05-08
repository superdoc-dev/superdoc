# SuperDoc examples

Minimal, copy-pasteable examples organized to mirror the [docs](https://docs.superdoc.dev): Editor, Document Engine, AI.

Examples teach one concept in the smallest useful amount of code. If you want a composed app or product workflow, see [`demos/`](../demos/) instead.

The machine-readable index lives in [`manifest.json`](./manifest.json).

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

Realtime providers and backend setups for Yjs-based collaboration.

| Example | Description |
|---------|-------------|
| [providers/superdoc-yjs](./editor/collaboration/providers/superdoc-yjs) | Self-hosted Yjs server (recommended) |
| [providers/hocuspocus](./editor/collaboration/providers/hocuspocus) | Hocuspocus provider setup |
| [providers/liveblocks](./editor/collaboration/providers/liveblocks) | Liveblocks managed service |
| [backends/node-sdk](./editor/collaboration/backends/node-sdk) | Server-side document operations alongside the realtime layer |
| [backends/fastapi](./editor/collaboration/backends/fastapi) | Python FastAPI backend |

## Document Engine

Programmatic editing without a visible editor.

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
