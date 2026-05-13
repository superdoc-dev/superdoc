# Contract templates

A runtime workflow that uses Word content controls to manage smart fields and versioned clauses inside a document. Single-page, no backend, no framework.

This is a demo: it shows a composed contract-template workflow. For the smallest copy-pasteable content-control primitive, see the [tagged inline text example](../../examples/document-api/content-controls/tagged-inline-text).

## What this shows

Two flows of the same primitive, composed into one app:

1. **Smart fields.** Inline content controls share a `tag` value (`{ kind: 'smartField', key: 'customerName' }`) across every occurrence. Select by tag, then push the same value to each matching control with `contentControls.text.setValue`.
2. **Versioned reusable sections.** A block content control carries `{ kind: 'reusableSection', sectionId, version }` in its `tag`. The app reads the live version from `contentControls.list` after every change. When the section in the document falls behind the section library, an "update available" CTA appears. Updating is `replaceContent` + `patch`.

Every mutation goes through `editor.doc.*`. The same operation set runs headless via the Node SDK and CLI.

## Run

```bash
pnpm install
pnpm dev
```

Edit a smart-field value on the right, click **Apply fields**, watch every occurrence update. The seed section ships as v1; the library has v2. The **Apply update** CTA appears because they diverge. Click it, the section swaps, the CTA disappears.

## Related work

If you need a **ready-made React component for authoring templates** with content controls (trigger `{{` to insert fields, linked field groups, owner/signer field types, export to .docx), see [`@superdoc-dev/template-builder`](https://docs.superdoc.dev/solutions/template-builder/introduction). This demo focuses on the *runtime* side: an app filling and updating already-tagged regions. Template Builder focuses on the *authoring* side.

## Honest limits

- The demo uses `lockMode: 'unlocked'` for every content control. The OOXML spec says `sdtLocked` leaves content editable, but the current adapter routes content and attr updates through `editor.commands.updateStructuredContentById`, which rewrites the whole SDT wrapper. The lock plugin reads that as wrapper damage and silently filters the transaction for `sdtLocked` and `sdtContentLocked` SDTs. Result: programmatic `text.setValue`, `replaceContent`, `patch`, and `setLockMode` return success but do not persist on locked SDTs. Tracked as a follow-up engine bug; the demo sidesteps it.
- `contentControls.replaceContent` is plain-text in the current adapter. Rich-content swap (formatting, tables) is not first-class today. Sections in this demo are kept plain.
- `contentControls.setBinding` writes `<w:dataBinding>` and round-trips through DOCX, but SuperDoc does not yet evaluate XPath against `customXml/` parts. The metadata channel works; the live binding engine does not.

## See also

- [Tagged inline text example](../../examples/document-api/content-controls/tagged-inline-text)
- [Document API > Content controls](https://docs.superdoc.dev/document-api/features/content-controls)
- [Document API > Reference > Content controls](https://docs.superdoc.dev/document-api/reference/content-controls/index)
- [Solutions > Template Builder](https://docs.superdoc.dev/solutions/template-builder/introduction)
