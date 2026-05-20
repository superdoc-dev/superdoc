# Metadata anchors

The smallest anchored-payload workflow: attach a JSON payload to a span of text, then list, get, resolve, and remove it.

## What this teaches

- **Setup** (not the lesson, but needed so the lesson has something to act on):
  - `doc.clearContent({})` clears the seeded document.
  - `doc.insert({ value })` seeds one paragraph that contains the anchor phrase.
  - `doc.extract({})` is used to find the anchor block id so the example can build a stable `SelectionTarget` for the click handlers.

- **Teaching surface** (the actual lesson, in click order):
  - `doc.metadata.attach({ target, namespace, id, payload })` anchors the payload to the span.
  - `doc.metadata.list({ namespace })` lists every entry in the namespace.
  - `doc.metadata.get({ id })` returns one entry's payload.
  - `doc.metadata.resolve({ id })` returns the `SelectionTarget` the anchor currently covers.
  - `doc.metadata.remove({ id })` strips the anchor wrapper and the payload entry.

Every operation goes through `editor.doc.*`. The same operation set runs headless via the Node SDK and CLI.

## Why this primitive exists

A metadata anchor is a hidden inline content control whose `w:tag` carries a stable id, paired with a JSON payload in a namespaced custom XML data part. The customer-facing use case people most often build on this is **source-grounded citations** (see [`demos/custom-ui`](../../../demos/custom-ui) for the composed workflow), but the primitive is generic: any span-bound payload (citations, suggestion provenance, review markers, structured annotations) uses the same five operations.

For the conceptual guide and the storage model, see [Document API > Anchored metadata](https://docs.superdoc.dev/document-api/features/anchored-metadata).

## Run

```bash
pnpm install
pnpm dev
```

Click **Attach**, then **List** / **Get** / **Resolve** to inspect the entry, then **Remove** to strip it. Each click prints the operation's return value in the **Last operation** panel.

## See also

- [`demos/custom-ui`](../../../demos/custom-ui): composed reference workspace that uses these primitives behind a source-grounded citation flow with highlights, hover popovers, and a sources panel.
- [Document API > Anchored metadata](https://docs.superdoc.dev/document-api/features/anchored-metadata): feature guide.
- [Document API reference: metadata.*](https://docs.superdoc.dev/document-api/reference/metadata): per-operation inputs, outputs, and failure codes.
