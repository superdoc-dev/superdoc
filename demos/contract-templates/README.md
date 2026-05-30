# Contract templates

Build your own UI for Word content controls (SDT fields) on top of SuperDoc. SuperDoc's built-in field chrome is off (`modules: { contentControls: { chrome: 'none' } }`), so you paint the field and clause look yourself and drive every interaction through the public surface: `editor.doc.*` and `superdoc/ui`. The document stays a real, Word-compatible `.docx` that round-trips. Single page, no backend, no framework.

The model is a locked template you assemble from a component library. A Mutual NDA opens with its fields and clauses already in place. The document is a locked surface: you can't change a control by typing in it. Instead you drag building blocks in from the sidebar and fill values through a form. Every change goes through the public API.

## What it shows

The starting document is `public/nda-template.docx`: inline plain-text fields and six block rich-text clauses, each carrying a `w:tag` with a JSON payload (`{ kind: 'smartField', key }` or `{ kind: 'reusableSection', sectionId }`). Receiving party and Purpose appear twice, in the header sentence and nested inside the Permitted Use clause.

**Locked controls.** On load, every field and clause is set to `contentLocked` (`ui.contentControls.setLockMode`). You can't change a value or a clause by typing in the document. This is the template surface; the custom UI drives all edits.

**Template tab, the building-block library.** Two catalogs, fields and clauses, each styled to match what it inserts:

- Smart-field chips wear the same blue token look as the in-document field (CSS on `.superdoc-structured-content-inline[data-sdt-tag*='smartField']`). Drag a chip onto the document, or click to insert it at the cursor. An unfilled field shows its field-name token (e.g. `DISCLOSING_PARTY`) as a stand-in placeholder. That token is literal text content, not a native SDT placeholder.
- Clause cards wear the same blue block look as the in-document clause and carry metadata (category, jurisdiction, version) and a status. A clause is single-use, like an inclusion checklist: a card already in the contract reads **In contract** and clicking it reveals the existing clause; an available card reads **Add clause** and drags or clicks in. The catalog includes clauses that aren't in the document yet (e.g. Indemnification, Return of Materials).

Inserts resolve the drop point with `ui.viewport.positionAt({ x, y })` and create the control with `editor.doc.create.contentControl({ kind, at, content, tag, lockMode })`. A field inserts inline at the exact caret; a clause snaps to a block boundary so it lands as a clean section instead of splitting a paragraph. Clicking a control in the document highlights its chip or card (`content-control:click`).

A clause is assembled from structured `parts`: prose plus `{ field }` slots. Inserting "Permitted Use" creates the block and then wraps each slot as a nested, locked inline smart field, so the inserted clause carries real Receiving party and Purpose fields, just like the seeded one. Filling those fields in the Values tab updates the clause and the header sentence together.

**Values tab, fill the fields.** Edit a value and it fans to every occurrence of that field, including the ones nested inside a locked clause. Each write briefly unlocks the clauses, sets the value (`selectByTag` + `text.setValue`), then relocks them. A clause's content lock otherwise silently vetoes writes to anything nested in it, so without this the nested occurrence would never update. The form is the only way to change a value.

**Export.** `superdoc.export({ exportedName, isFinalDoc, triggerDownload })`: raw DOCX keeps the controls and tags; clean DOCX flattens them so the filled values are in place.

Every mutation goes through `editor.doc.*`, so the same operations run headless via the Node SDK and CLI.

## Run

```bash
pnpm install
pnpm dev
```

Open the Template tab. Drag a field or clause into the document, or click one to insert it at the cursor. Switch to the Values tab and edit a value; it updates every occurrence, header and nested. Export raw DOCX to keep the controls, or clean DOCX for a final document.

## Honest limits

- An inserted clause is a single paragraph of prose with field slots. Multi-paragraph clauses, lists, tables, or other formatting inside a clause aren't modeled here; the slots become inline text fields. (The block control is a `richText` SDT, so richer bodies are possible; this demo just doesn't author them.)
- A drop snaps to the start of the block under the cursor, so a clause lands at a block boundary rather than at the exact pixel.
- The placeholder shown in an unfilled field is the field-name token, set as content. SuperDoc's native empty-control placeholder text is renderer-hardcoded and not settable through the API.
- Every control is `contentLocked`. The demo doesn't exercise `sdtLocked` or `sdtContentLocked`.
- Clause version review / replace (detect an outdated clause, swap in the library text) is intentionally out of scope. This demo proves template assembly, not the clause lifecycle.

## Related work

If you need a ready-made React component for authoring templates with content controls (`{{` trigger menu, linked field groups, owner/signer field types, DOCX export), see [`@superdoc-dev/template-builder`](https://docs.superdoc.dev/solutions/template-builder/introduction). This demo shows how to build that kind of UI yourself on the public API.

## See also

- [Document API > Content controls](https://docs.superdoc.dev/document-api/features/content-controls)
- [Document API > Reference > Content controls](https://docs.superdoc.dev/document-api/reference/content-controls/index)
- [Solutions > Template Builder](https://docs.superdoc.dev/solutions/template-builder/introduction)
- [Tagged inline text example](../../examples/document-api/content-controls/tagged-inline-text)
