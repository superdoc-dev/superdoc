# Citations Demo

Customer demo showing clickable citation fields in SuperDoc using field annotations.

## How it works

1. Load a DOCX document containing `[[ bracketed text ]]` patterns
2. On editor ready, `replaceBracketedTextWithCitations()` finds these patterns and replaces them with `fieldAnnotation` nodes
3. Click a citation to see its attributes in the sidebar

## Key files

| File | Purpose |
|------|---------|
| `src/App.vue` | Main app with editor setup, sidebar, and `replaceBracketedTextWithCitations()` |
| `public/example.docx` | Sample document with bracketed citations |

## Technical decisions

### Why fieldAnnotation (not structuredContent)

Both node types export as `w:sdt` (OOXML Structured Document Tags) in DOCX, but they differ:

| Feature | `fieldAnnotation` | `structuredContent` |
|---------|-------------------|---------------------|
| PM node type | Inline, atomic | Block or inline, has content |
| Click events | `fieldAnnotationClicked`, `fieldAnnotationDoubleClicked`, `fieldAnnotationSelected` | None |
| Document API | Not supported (`contentControls.*` works with structuredContent only) | Supported via `editor.doc.contentControls.*` |
| Use case | Simple clickable fields | Complex content controls with editable content |

We use `fieldAnnotation` because:
- It has built-in click event handling (`fieldAnnotationClicked`)
- Citations are atomic (no editable content inside)
- The sidebar needs to react to clicks

### Document API limitations

We investigated using Document API + structuredContent instead of editor commands + fieldAnnotation. Neither requirement works:

| Task | Document API support | Why it fails |
|------|---------------------|--------------|
| Replace bracketed text with citations | No | No "replace text with inline content control" operation. `contentControls.create()` targets existing SDTs, not text ranges. `find()` returns matches but can't replace with nodes. |
| Click handlers on citations | No | `structuredContent` emits no click events. No `structuredContentClicked` equivalent exists. |

**To make Document API work, you'd need to add:**
1. A new operation: "replace text range with inline SDT"
2. Click event emission in `StructuredContentViewBase.js` (similar to `FieldAnnotationView.js:266-277`)

For now, we use editor commands (`replaceWithFieldAnnotation`) and `fieldAnnotation` nodes which have built-in click events.

### Field annotation attrs

```typescript
{
  type: 'text',           // Render type: text, image, signature, checkbox, html, link
  fieldId: string,        // Unique identifier
  fieldType: 'CITATION',  // Custom field type for filtering
  displayLabel: string,   // Displayed text (e.g., "[Smith 2023]")
  fieldColor: '#2563eb',  // Border color
}
```

## Docs note

The field annotation extension docs have a warning that field annotations are "not recommended" in favor of structured content for better table/styling support. However, structured content lacks click events, so for this demo's requirements (clickable citations with event handling), fieldAnnotation is the correct choice.

If click handling is needed for structuredContent in the future, it would require adding custom click handlers or a plugin.

## Running the demo

```bash
pnpm --filter citations dev
```

## Next steps (if resuming)

- Consider adding citation source metadata (author, year, title, URL)
- Add ability to edit citation attributes via the sidebar
- Add ability to insert new citations via toolbar
