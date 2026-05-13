# Contract templates

Runtime contract template management built on Word content controls. A Mutual NDA opens with tagged smart fields and six versioned clauses. The app detects stale clauses against a library, updates them in place, and exports the result as `.docx`. Single-page, no backend, no framework.

This is a demo: it composes multiple content-control patterns into a product workflow. For the smallest copy-pasteable primitive, see the [tagged inline text example](../../examples/document-api/content-controls/tagged-inline-text).

## What this shows

The starting document is a **Word-authored Mutual NDA** at `public/nda-template.docx` with eleven plain-text content controls already in place (five inline smart fields and six block clauses, each with a `w:tag` carrying a JSON payload). On boot, SuperDoc imports the DOCX, parses the SDTs, and the demo reads field values and clause versions straight from the parsed controls.

Three flows of the same primitive, composed into one app:

1. **Smart fields.** Five inline content controls share a `tag` shape (`{ kind: 'smartField', key: 'disclosingParty' }`) per occurrence. Edit one input, click Apply, every match updates in one pass via `selectByTag` + `replaceContent`.
2. **Versioned reusable clauses.** Six block content controls carry `{ kind: 'reusableSection', sectionId, version }` in their tags. The app reads each live version from `contentControls.list`, compares against the clause library, and surfaces a per-clause Update CTA when they diverge. Updating is `replaceContent` + `patch`.
3. **Export.** `superdoc.export({ exportedName, isFinalDoc, triggerDownload })` produces a `.docx` blob with content controls preserved.

Every mutation goes through `editor.doc.*`. The same operation set runs headless via the Node SDK and CLI.

## Run

```bash
pnpm install
pnpm dev
```

The seeded NDA ships with three clauses behind their latest versions (Confidentiality, Governing Law, Limitation of Liability). The Clauses tab shows an Update CTA on each. Apply them, watch the document text swap. Edit a value in the Fields tab and click Apply to fan it to every occurrence. Click Export to download the resulting `.docx`.

## Related work

If you need a **ready-made React component for authoring templates** with content controls (`{{` trigger menu, linked field groups, owner/signer field types, DOCX export), see [`@superdoc-dev/template-builder`](https://docs.superdoc.dev/solutions/template-builder/introduction). This demo focuses on the *runtime* side: an app filling and updating already-tagged regions. Template Builder focuses on the *authoring* side.

## Honest limits

- All content controls in the fixture are `unlocked`. Locked controls (`sdtLocked`, `sdtContentLocked`) are not driven programmatically here.
- Field values are updated through `contentControls.replaceContent` rather than `text.setValue`. The typed `text.setValue` op requires `controlType === 'text'`, and Word-authored plain-text SDTs currently come through with `controlType: 'unknown'`. `replaceContent` works for both Word-authored and runtime-created controls.
- Clause bodies are plain text. Rich-content clauses (formatting, tables, lists) need a different path: use `doc.insert` with the fragment, then `create.contentControl({ at: range })` to wrap the inserted range with a tag.

## See also

- [Document API > Content controls](https://docs.superdoc.dev/document-api/features/content-controls)
- [Document API > Reference > Content controls](https://docs.superdoc.dev/document-api/reference/content-controls/index)
- [Solutions > Template Builder](https://docs.superdoc.dev/solutions/template-builder/introduction)
- [Tagged inline text example](../../examples/document-api/content-controls/tagged-inline-text)
