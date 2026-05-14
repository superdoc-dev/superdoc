# Contract templates

Runtime contract template management built on Word content controls. A Mutual NDA opens with tagged smart fields and six versioned clauses. The app detects stale clauses against a library, updates them in place, and exports either a raw template DOCX or a clean final DOCX. Single-page, no backend, no framework.

This is a demo: it composes multiple content-control patterns into a product workflow. For the smallest copy-pasteable primitive, see the [tagged inline text example](../../examples/document-api/content-controls/tagged-inline-text).

## What this shows

The starting document is a Mutual NDA at `public/nda-template.docx` with thirteen content controls already in place: seven inline plain-text controls (smart fields) and six block rich-text controls (reusable clauses). Receiving party and Purpose each appear twice — once in the header sentence and once nested inside the Permitted Use clause. Each control carries a `w:tag` with a JSON payload. On boot, SuperDoc imports the DOCX, parses the SDTs, and the demo reads field values and clause versions straight from the parsed controls.

Three flows of the same primitive, composed into one app:

1. **Smart fields.** Seven inline plain-text content controls across five field keys share a `tag` shape (`{ kind: 'smartField', key: 'disclosingParty' }`) per occurrence. They were authored as Word "Plain Text Content Controls" (`ContentControls.Add(1, range)`), so SuperDoc resolves them as `controlType: 'text'`. Edit a value in the Fields tab; every occurrence of that field updates live via `selectByTag` + per-occurrence `text.setValue`. Receiving party and Purpose appear twice (header sentence and nested inside the Permitted Use clause), so a single edit fans across both locations.
2. **Versioned reusable clauses.** Six block rich-text content controls carry `{ kind: 'reusableSection', sectionId, version }` in their tags. They were authored as Word "Rich Text Content Controls" (`ContentControls.Add(0, range)`), which produces typeless sdtPr; SuperDoc resolves them as `controlType: 'richText'` per ECMA-376 §17.5.2.26. The app reads each live version from `contentControls.list`, compares against the clause library, and surfaces a Review CTA when they diverge. Review expands a card with the current clause text alongside the library clause text plus a Replace with library clause action that calls `replaceContent` + `patch`.
3. **Export.** `superdoc.export({ exportedName, isFinalDoc, triggerDownload })` has two buttons: **Export raw DOCX** uses `isFinalDoc: false` to preserve content controls and tags for future template/library updates; **Export clean DOCX** uses `isFinalDoc: true` to flatten controls so the filled values are in place.

Every mutation goes through `editor.doc.*`. The same operation set runs headless via the Node SDK and CLI.

## Run

```bash
pnpm install
pnpm dev
```

The seeded NDA ships with three clauses behind their latest versions (Confidentiality, Governing Law, Limitation of Liability). The Clauses tab shows a Review CTA on each; expanding a card lets you compare the in-document clause with the library version and replace it in place. Edit a value in the Fields tab and watch it fan to every occurrence in the document (header and nested locations). Export raw DOCX when you want to keep the template controls, or export clean DOCX when you want a final document with the values in place.

## Related work

If you need a **ready-made React component for authoring templates** with content controls (`{{` trigger menu, linked field groups, owner/signer field types, DOCX export), see [`@superdoc-dev/template-builder`](https://docs.superdoc.dev/solutions/template-builder/introduction). This demo focuses on the *runtime* side: an app filling and updating already-tagged regions. Template Builder focuses on the *authoring* side.

## Honest limits

- All content controls in the fixture are `unlocked`. Locked controls (`sdtLocked`, `sdtContentLocked`) are not driven programmatically here.
- Smart field values are pushed through `text.setValue` (the typed API for plain-text controls). Clause bodies are pushed through `replaceContent` because rich-text controls don't have a typed setter.
- Clause bodies in the seeded fixture are single-paragraph plain prose; the rich-text wrapper supports formatting/lists/tables when authored that way, but the demo doesn't exercise those.

## See also

- [Document API > Content controls](https://docs.superdoc.dev/document-api/features/content-controls)
- [Document API > Reference > Content controls](https://docs.superdoc.dev/document-api/reference/content-controls/index)
- [Solutions > Template Builder](https://docs.superdoc.dev/solutions/template-builder/introduction)
- [Tagged inline text example](../../examples/document-api/content-controls/tagged-inline-text)
