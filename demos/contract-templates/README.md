# Contract templates

Runtime contract template management built on Word content controls. A Mutual NDA opens with tagged smart fields and six versioned clauses. The app detects stale clauses against a library, updates them in place, and exports the result as `.docx`. Single-page, no backend, no framework.

This is a demo: it composes multiple content-control patterns into a product workflow. For the smallest copy-pasteable primitive, see the [tagged inline text example](../../examples/document-api/content-controls/tagged-inline-text).

## What this shows

The starting document is a Mutual NDA at `public/nda-template.docx` with thirteen plain-text content controls already in place: seven inline smart fields across five field keys (Receiving party and Purpose each appear twice — once in the header sentence and once nested inside the Permitted Use clause) plus six block clauses, each with a `w:tag` carrying a JSON payload. On boot, SuperDoc imports the DOCX, parses the SDTs, and the demo reads field values and clause versions straight from the parsed controls.

Three flows of the same primitive, composed into one app:

1. **Smart fields.** Seven inline content controls across five field keys share a `tag` shape (`{ kind: 'smartField', key: 'disclosingParty' }`) per occurrence. Edit a value in the Fields tab; every occurrence of that field updates live via `selectByTag` + `replaceContent`. Receiving party and Purpose appear twice (header sentence and nested inside the Permitted Use clause), so a single edit fans across both locations.
2. **Versioned reusable clauses with tracked-change review.** Six block content controls carry `{ kind: 'reusableSection', sectionId, version }` in their tags. The app reads each live version from `contentControls.list` and surfaces "Library update available" when the document version trails the library. Clicking **Suggest library update** runs `doc.replace` with `changeMode: 'tracked'` against the clause body, so the document shows the proposed swap as redlines. The card moves to "Pending review" with Accept / Reject. **The SDT tag stays at v1 until the reviewer accepts** — on Accept, the demo calls `doc.trackChanges.decide` to resolve the tracked change, then patches the tag to v2 via `contentControls.patch`. On Reject, the body reverts and the tag stays v1. No lying documents.
3. **Export.** `superdoc.export({ exportedName, isFinalDoc, triggerDownload })` produces a `.docx` blob with content controls preserved.

Every mutation goes through `editor.doc.*`. The same operation set runs headless via the Node SDK and CLI.

## Run

```bash
pnpm install
pnpm dev
```

The seeded NDA ships with three clauses behind their latest versions (Confidentiality, Governing Law, Limitation of Liability). Click **Suggest library update** on any stale clause to inject the proposed body as a tracked change, then **Accept library clause** or **Reject** in the sidebar. Edit a value in the Fields tab and watch it fan live to every occurrence in the document (header and nested locations). Click Export to download the resulting `.docx`.

## Related work

If you need a **ready-made React component for authoring templates** with content controls (`{{` trigger menu, linked field groups, owner/signer field types, DOCX export), see [`@superdoc-dev/template-builder`](https://docs.superdoc.dev/solutions/template-builder/introduction). This demo focuses on the *runtime* side: an app filling and updating already-tagged regions. Template Builder focuses on the *authoring* side.

## Honest limits

- All content controls in the fixture are `unlocked`. Locked controls (`sdtLocked`, `sdtContentLocked`) are not driven programmatically here.
- Field values are updated through `contentControls.replaceContent` rather than `text.setValue`. `replaceContent` works regardless of how the control's type is detected on import.
- `contentControls.replaceContent` does not yet accept `changeMode: 'tracked'`, so the clause-update tracked replacement is done at the generic Document API layer (`doc.replace` against a `query.match` target inside the SDT). The demo's accept/reject are wired through the sidebar to ensure the SDT tag patch is deferred until acceptance. Using SuperDoc's built-in track-changes UI to accept the same change externally would leave the tag at v1 — the proper end-state requires content-control-aware tracked replacement.
- Clause bodies are plain text. Rich-content clauses (formatting, tables, lists) need a different path: use `doc.insert` with the fragment, then `create.contentControl({ at: range })` to wrap the inserted range with a tag.

## See also

- [Document API > Content controls](https://docs.superdoc.dev/document-api/features/content-controls)
- [Document API > Reference > Content controls](https://docs.superdoc.dev/document-api/reference/content-controls/index)
- [Solutions > Template Builder](https://docs.superdoc.dev/solutions/template-builder/introduction)
- [Tagged inline text example](../../examples/document-api/content-controls/tagged-inline-text)
