# Archived: loading editor JSON

This demo is no longer recommended and has been removed from the demo gallery.

## Why archived

There is no public `editor.loadJSON()` API. The supported path for providing initial document state from JSON is the `jsonOverride` option passed to `SuperDoc` at construction time. This demo predates that surface and never had a README.

## Use instead

- The `jsonOverride` option on `SuperDoc`, set at init time. Documented under the SuperDoc configuration reference.
- For inserting JSON content into an existing document, `editor.doc.insert` with the structural insert input shape.

The source in this directory is kept for archival reference but is not maintained.
