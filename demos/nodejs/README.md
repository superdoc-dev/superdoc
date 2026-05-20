# Archived: headless Node.js Editor

This demo is no longer recommended and has been removed from the demo gallery.

## Why archived

This demo wrapped SuperDoc's `Editor` class directly behind an Express server, which predates the supported server-side path. Headless Document API operations now run through the Node SDK and the CLI, which keep the same `editor.doc.*` surface as the browser editor.

## Use instead

- [`examples/editor/collaboration/backends/node-sdk`](../../examples/editor/collaboration/backends/node-sdk) for a headless Node client that mutates documents through the Document API.
- [`examples/document-engine/ai-redlining`](../../examples/document-engine/ai-redlining) for a server-side AI-driven flow with the same engine.
- [Document Engine SDKs](https://docs.superdoc.dev/document-engine/sdks) for the full surface.

The source in this directory is kept for archival reference but is not maintained.
