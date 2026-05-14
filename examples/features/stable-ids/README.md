# Stable IDs Demo

This example demonstrates how SuperDoc maintains stable block IDs in the document structure. Stable IDs are useful for:

- **RAG pipelines**: Store references to document chunks alongside semantic embeddings
- **Cross-session referencing**: IDs survive closing and reopening a document
- **DOCX round-trip**: IDs are preserved through export/import cycles

## Run the example

```bash
npm install
npm run dev
```

## What you'll see

The right panel shows a live log of ID changes as you edit the document:

| Event | Description |
|-------|-------------|
| **+ created** | New block with a new ID (e.g., after splitting a paragraph) |
| **- deleted** | Block removed (e.g., after merging paragraphs) |
| **~ modified** | Same ID, but revision incremented (content changed) |

## ID Types

- **paraId**: From OOXML `w14:paraId` attribute (8-char hex). Stable across sessions.
- **sdBlockId**: SuperDoc-generated ID. Stable within a session.
- **UUID**: Session-scoped UUID, regenerated on document reload.

## Try these actions

1. **Type text** → `modified` event (same ID, rev increments)
2. **Press Enter** to split a paragraph → `created` event (new ID for second half)
3. **Press Backspace** at paragraph start → `deleted` event (merged paragraph's ID is gone)
4. **Upload a DOCX** → observe which blocks have `paraId` (from Word) vs `sdBlockId` (generated)

## How it works

The panel hooks into ProseMirror's `update` event and compares the document's block IDs before and after each transaction. When a block is added, removed, or modified (detected via `sdBlockRev`), it logs the change.

See `StableIdPanel.vue` for the implementation.
