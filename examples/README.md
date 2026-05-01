# SuperDoc examples

Minimal, copy-pasteable examples organized to mirror the [docs](https://docs.superdoc.dev): Editor, Document Engine, AI.

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

### Theming

| Example | Docs |
|---------|------|
| [theming](./editor/theming) | [docs](https://docs.superdoc.dev/editor/theming/overview) |

### Proofing

| Example | Docs |
|---------|------|
| [proofing](./editor/proofing) | [docs](https://docs.superdoc.dev/editor/proofing/overview) |

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

## AI

Document editing through models and agents.

| Example | Description |
|---------|-------------|
| [bedrock](./ai/bedrock) | AWS Bedrock Converse API with tool use |
| [streaming](./ai/streaming) | Stream model output into a visible editor |
| [redlining](./ai/redlining) | LLM-driven tracked-change review |
| [collaborative-agent](./ai/collaborative-agent) | AI agent operating on a collaborative doc |

## Advanced

Edge cases and infrastructure-level patterns. Most consumers won't need these.

| Example | Notes |
|---------|-------|
| [grading-papers-comments-annotations](./advanced/grading-papers-comments-annotations) | Full-stack annotation use case |
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
