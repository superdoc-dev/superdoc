# Smart fields

The smallest example of a tagged inline content control: one value, every occurrence.

## What this teaches

Every occurrence of "Acme" in the seed paragraph is wrapped in an inline content control sharing the same `tag` (`customer`). A single `contentControls.selectByTag` + `contentControls.text.setValue` pass updates every match in one transaction.

Three Document API operations:

- `doc.create.contentControl({ kind: 'inline', controlType: 'text', tag, ... })` — wrap a range as a tagged region
- `doc.contentControls.selectByTag({ tag })` — find every occurrence of a tag
- `doc.contentControls.text.setValue({ target, value })` — push a value into a text control

Every operation goes through `editor.doc.*`. The same operation set runs headless via the Node SDK and CLI.

## Run

```bash
pnpm install
pnpm dev
```

Edit the value, click **Apply**, watch both occurrences of "Acme" update.

## When to use this vs Template Builder

If you need a ready-made React component for template authoring (trigger `{{` to insert fields, linked field groups, owner/signer field types, export to .docx), use [`@superdoc-dev/template-builder`](https://docs.superdoc.dev/solutions/template-builder/introduction). It wraps these primitives in a polished UI.

Use the patterns in this example directly when you're on vanilla JS, Vue, Angular, server-side, or you want to roll your own templating UI.

## See also

- [Contract templates demo](../../../../demos/contract-templates) — smart fields composed with versioned sections
- [Reusable section example](../reusable-section)
- [Document API > Content controls](https://docs.superdoc.dev/document-api/features/content-controls)
