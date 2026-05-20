# Archived: Docxtemplater integration

This demo is no longer recommended and has been removed from the demo gallery.

## Why archived

This was a third-party-library integration demo (SuperDoc + Docxtemplater) that pulled a heavy dependency stack (FontAwesome, jQuery, etc.) and was not actively maintained as a supported integration story.

## Use instead

For template merge workflows on top of SuperDoc, prefer:

- [Document API](https://docs.superdoc.dev/document-api/overview) (`editor.doc.text.rewrite`, `editor.doc.insert`, `editor.doc.contentControls.*`) for programmatic content replacement.
- [Template Builder](https://docs.superdoc.dev/solutions/template-builder/introduction) for an authoring component on top of content controls.
- [`demos/contract-templates`](../contract-templates) for the worked content-controls workflow demo.

The source in this directory is kept for archival reference but is not maintained.
