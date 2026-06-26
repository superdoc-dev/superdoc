# Flatten SDT Export Demo

Export documents with SDTs (Content Controls) flattened to plain text, then restore the original document with SDTs intact.

## Use Case

When exporting documents for external review or processing, you may want to flatten SDTs to plain text while preserving the ability to restore the original document structure afterward. This demo shows how to:

1. Save the current document state to a buffer
2. Flatten all SDTs using the Document API
3. Export the flattened document
4. Restore the original document from the buffer

## Run

Prerequisites: Node 20+, pnpm 9+, run from inside the SuperDoc monorepo.

```bash
pnpm install
pnpm --filter superdoc run build
pnpm --filter @superdoc-dev/react run build
pnpm --filter flatten-sdt-export run dev
```

Open http://localhost:5190.

## What you can do here

- Click **+ Insert SDT** to add test content controls at the cursor position
- Click **Flatten & Export** to:
  1. Save the document to a buffer (preserving SDTs)
  2. Flatten all SDTs to plain text
  3. Download the flattened document
  4. Automatically restore the original document with SDTs

## Key APIs Used

### Flattening SDTs

```typescript
function flattenContentControls(docApi) {
  const { items } = docApi.contentControls.list();

  for (const item of items) {
    docApi.contentControls.unwrap(
      { target: item.target },
      { skipTrackChanges: true }
    );
  }
}
```

### Export to Buffer (No Download)

```typescript
const buffer = await ui.document.export({
  exportType: ['docx'],
  triggerDownload: false,
});
```

### Restore from Buffer

```typescript
const file = new File([buffer], 'restored.docx', {
  type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
});
await ui.document.replaceFile(file);
```

## Related Documentation

- [Content Controls API](https://docs.superdoc.dev/document-api/reference/content-controls)
- [Document Export](https://docs.superdoc.dev/editor/export)
