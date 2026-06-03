# Tagged inline text

The smallest content-control workflow: wrap one word in an inline text content control, find it by tag, update its value.

## What this teaches

- **Setup** (not the lesson, but needed so the lesson has something to act on):
  - `doc.insert(...)` seeds a paragraph.
  - `doc.create.contentControl({ kind: 'inline', controlType: 'text', tag: 'customer', ... })` wraps the word `Acme` as a tagged content control.

- **Teaching surface** (the actual lesson):
  - `doc.contentControls.selectByTag({ tag: 'customer' })` finds the control.
  - `doc.contentControls.text.setValue({ target, value })` pushes a new value.

Every operation goes through `editor.doc.*`. The same operation set runs headless via the Node SDK and CLI.

This example uses `lockMode: 'unlocked'` deliberately. Locked content-control mutation is a known engine follow-up, so lock behavior is left out of this minimal path.

## Run

```bash
pnpm install
pnpm dev
```

Edit the value, click **Apply**, watch the word in the paragraph update.

## See also

- [Contract templates demo](../../../../demos/contract-templates) — composed runtime workflow with smart fields, versioned sections, and update detection.
- [`@superdoc-dev/template-builder`](https://docs.superdoc.dev/solutions/template-builder/introduction) — packaged React authoring component on top of these primitives (`{{` trigger, linked field groups, owner/signer types, DOCX export).
- [Document API > Content controls](https://docs.superdoc.dev/document-api/features/content-controls) — full conceptual guide and operation reference.
