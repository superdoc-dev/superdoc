# SuperDoc in a Next.js app

A minimal Next.js (App Router) starter that renders a SuperDoc editor on the client.

## What this teaches

- Mounting SuperDoc inside a Next.js client component.
- Loading a DOCX from `public/` at runtime (no build-time bundling of the document).
- Keeping the editor SSR-safe: the SuperDoc render path is browser-only, so the component is gated to client-side rendering.

## Run it

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000.

## When to reach for it

- You're starting a new Next.js + SuperDoc project and want the smallest working integration.
- You need a reference for the SSR boundary (where `'use client'` belongs, how to skip server rendering for the editor).

## When not

- You're building a non-Next React app. Use [`getting-started/react`](../react) instead; it's smaller and framework-neutral.
- You need server-side document mutations. SuperDoc's runtime is client-side; the Document Engine SDK/CLI is the server-side path.

## Docs

[Frameworks: Next.js](https://docs.superdoc.dev/getting-started/frameworks/nextjs).
