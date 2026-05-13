# Reusable section

The smallest example of a versioned block content control: detect a stale section and swap it.

## What this teaches

The section is wrapped in a block content control whose `tag` encodes `{ kind: 'reusableSection', sectionId, version }`. The app reads the live version from `contentControls.list`, compares against the library's latest version, and offers an in-place update when they diverge. Updating is `replaceContent` (new body) plus `patch` (new tag carrying the new version).

Three Document API operations:

- `doc.create.contentControl({ kind: 'block', controlType: 'text', tag, ... })` — wrap a block as a tagged region
- `doc.contentControls.list({})` — read the current version from the tag on the live SDT
- `doc.contentControls.replaceContent({ target, content })` + `doc.contentControls.patch({ target, tag })` — swap body and bump the version

Every operation goes through `editor.doc.*`. The same operation set runs headless via the Node SDK and CLI.

## Run

```bash
pnpm install
pnpm dev
```

The seed section is v1. The library latest is v2. The **Apply v2** banner appears because they diverge. Click it; the section text swaps to v2; the tag updates; the banner disappears.

## When to use this vs Template Builder

If you need a ready-made React component for template authoring (trigger `{{` to insert fields, linked field groups, reusable block content with `presetContent`, owner/signer field types, export to .docx), use [`@superdoc-dev/template-builder`](https://docs.superdoc.dev/solutions/template-builder/introduction). It wraps these primitives in a polished UI.

Use the patterns in this example directly when you're on vanilla JS, Vue, Angular, server-side, or you want to roll your own clause library.

## See also

- [Contract templates demo](../../../../demos/contract-templates) — reusable sections composed with smart fields
- [Smart fields example](../smart-fields)
- [Document API > Content controls](https://docs.superdoc.dev/document-api/features/content-controls)
