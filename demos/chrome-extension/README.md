# Chrome extension demo

A Chrome extension that opens DOCX files from the user's drive in a SuperDoc-powered tab. The wrapper directory holds the gallery metadata (`demo-config.json`, thumbnail, video); the actual extension package lives at [`chrome-extension/`](./chrome-extension/) one level down.

## What this shows

- A SuperDoc-driven editor mounted inside a browser extension surface.
- File ingestion through the extension's file-picker, opened as a regular DOCX.
- A self-contained extension manifest that you can adapt to your own deployment.

## Run it

Build and load the extension package, then open a DOCX from the extension's popup. Full setup steps live in the extension package's own README:

- [`chrome-extension/README.md`](./chrome-extension/README.md)

## When to reach for it

- You're shipping document editing as a browser extension and want a starting point for the install flow + tab handoff.
- You're prototyping a "open in editor" entry point from another web surface.

## When not

- You want to embed SuperDoc on a normal web page. Use [`examples/getting-started/`](../../examples/getting-started/) instead; an extension shell is the wrong substrate.

## Docs

[SuperDoc overview](https://docs.superdoc.dev/getting-started/introduction).
