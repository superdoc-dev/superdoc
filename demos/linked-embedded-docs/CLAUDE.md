# Linked Embedded Documents Demo

Demo for editing exhibits in a sidebar before inserting them into the main document.

## Tickets

- **IT-1020** (intake): [Fieldguide: Linked embedded documents for audit workflow](https://linear.app/superdocworkspace/issue/IT-1020/fieldguide-linked-embedded-documents-for-audit-workflow)
- **SD-2983** (technical): [Linked embedded documents with bidirectional sync](https://linear.app/superdocworkspace/issue/SD-2983/linked-embedded-documents-with-bidirectional-sync)

## What This Demo Shows

1. Main document editor on the left
2. Exhibits panel on the right with uploadable DOCX files
3. Click an exhibit to open it in an **editable sidebar editor**
4. Edit the exhibit content, then insert it into the main document
5. Three insertion modes: as content, as suggestion, or as structured content (SDT)

## Key Feature

Unlike the basic exhibit-insertion demo, this one lets you **edit the exhibit before inserting it**. The sidebar shows a full SuperDoc editor where you can modify the exhibit content, and when you insert, it captures your edits.

## Running

```bash
cd demos/linked-embedded-docs
npm install
npm run dev
```

## Technical Notes

- Uses two SuperDoc instances: one for main document, one for exhibit editing
- Exhibit editor content is extracted via `editor.getJSON()` at insert time
- Supports SDT insertion with `structuredContentBlock` wrapper for content controls
