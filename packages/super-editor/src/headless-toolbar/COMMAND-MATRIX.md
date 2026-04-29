# Toolbar Command Matrix (SD-2798)

This matrix is the canonical inventory of every `PublicToolbarItemId` and where its mutation lives.

The rule: `ui.commands.<id>.execute()` must produce the same document state as `editor.doc.<op>(payload)` for any command that has a doc-api equivalent. UI-only operations stay on `superdoc/ui`. There is no third home for *mutation*.

For prep flows (file pickers, link dialogs, image upload, etc.) the UI layer still owns the conversation. Only the final document mutation routes through `editor.doc.*`.

## Buckets and routes

| Bucket | Route | Meaning | Routing rule |
|--|--|--|--|
| **1** | `document-api` | Doc-api operation exists. | `ui.commands.<id>.execute()` calls `editor.doc.*`. Pair test asserts identical post-state. |
| **2** | `legacy-editor-command` | No doc-api operation yet. | Temporary `editor.commands.*` passthrough. Each entry has a doc-api gap ticket. Must move to Bucket 1 once the contract op lands. |
| **3** | `ui-session` | Browser/UI-only operation. | Stays on `superdoc/ui`. Will not exist on `editor.doc.*`. Some move to dedicated `ui.<domain>.*` (SD-2799). |
| **4** | `internal` | Legacy/internal. | No public exposure. Currently empty. Must not grow without a deliberate review. |

The `route` column gives reviewers a stable way to reject accidental `editor.commands.*` re-introductions: if a new command lands on Bucket 1 but its `route` is `legacy-editor-command`, the pair test won't pass. CI catches the drift.

## Bucket 1 — `document-api` (33)

| Command | Doc-api operation | Notes |
|--|--|--|
| `bold` | `format.bold` | |
| `italic` | `format.italic` | |
| `underline` | `format.underline` | |
| `strikethrough` | `format.strike` | |
| `font-size` | `format.fontSize` | |
| `font-family` | `format.fontFamily` | |
| `text-color` | `format.color` | |
| `highlight-color` | `format.highlight` | |
| `link` | `hyperlinks.wrap` / `hyperlinks.remove` | UI layer still owns the link prompt. Only the final mutation routes through doc-api. |
| `text-align` | `format.paragraph.setAlignment` | |
| `line-height` | `format.paragraph.setSpacing` (lineHeight) | |
| `linked-style` | `styles.paragraph.setStyle` | Pair test must be strict — if the toolbar path does anything beyond apply-style (cursor moves, mark cleanup, etc.), the test must surface it. |
| `bullet-list` | `lists.create` / `lists.attach` | |
| `numbered-list` | `lists.create` / `lists.attach` | |
| `indent-increase` | `lists.indent` (in list) / `format.paragraph.setIndentation` | |
| `indent-decrease` | `lists.outdent` (in list) / `format.paragraph.setIndentation` | |
| `undo` | `history.undo` | Editor-session state, but the contract owns it, so `ui.commands` must not bypass it. |
| `redo` | `history.redo` | |
| `clear-formatting` | `format.paragraph.resetDirectFormatting` | |
| `track-changes-accept-selection` | `trackChanges.decide({ decision: 'accept' })` | |
| `track-changes-reject-selection` | `trackChanges.decide({ decision: 'reject' })` | |
| `image` | `create.image` | UI layer owns the file picker / upload dialog. Mutation goes through doc-api. |
| `table-insert` | `create.table` | |
| `table-add-row-before` | `tables.insertRow({ position: 'before' })` | |
| `table-add-row-after` | `tables.insertRow({ position: 'after' })` | |
| `table-delete-row` | `tables.deleteRow` | |
| `table-add-column-before` | `tables.insertColumn({ position: 'before' })` | |
| `table-add-column-after` | `tables.insertColumn({ position: 'after' })` | |
| `table-delete-column` | `tables.deleteColumn` | |
| `table-delete` | `tables.delete` | |
| `table-merge-cells` | `tables.mergeCells` | |
| `table-split-cell` | `tables.splitCell` | |
| `table-remove-borders` | `tables.clearBorder` | |

Each entry above ships a pair test:

```ts
test('ui.commands.<id> matches editor.doc.<op>', async () => {
  const before = await snapshotDoc();
  const a = applyDirect(); // editor.doc.<op>(payload)
  const b = applyViaToolbar(); // ui.commands.<id>.execute(payload)
  expect(b.receipt).toMatchObject(a.receipt);
  expect(snapshotDoc()).toEqual(before.afterDirect);
});
```

If any pair test diverges, CI fails. That is the contract this ticket installs.

## Bucket 2 — `legacy-editor-command` (1)

| Command | Why no doc-api yet | Open question |
|--|--|--|
| `table-fix` | Recovery operation — re-runs ProseMirror's `fixTables` plugin against the document. No request/response shape on `editor.doc.*` today. | First decide whether this should be a public command at all. It sounds more like internal repair than a user-facing operation. The gap ticket should answer that question, not jump to "what doc-api shape does it get?" |

Bucket-2 entries keep their current `editor.commands.*` passthrough, with a `// TODO(SD-XXXX)` comment pointing at the gap ticket. They move to Bucket 1 only if their gap ticket resolves to "yes, public" and the doc-api operation lands.

## Bucket 3 — `ui-session` (4)

| Command | Why it stays UI-only |
|--|--|
| `ruler` | Toggles a UI affordance. No document state changes. |
| `zoom` | Scales the rendered view. No document state changes. |
| `document-mode` | Switches editing/suggesting/viewing mode. Edits the runtime mode flag, not the document. |
| `copy-format` | Clipboard-style UI gesture (capture format, then paint it on next selection). Stateful UI flow, not a mutation. |

Long-term these should move out of `ui.commands.*` to dedicated `ui.<domain>.*` surfaces (SD-2799 — `ui.viewport.setZoom`, `ui.viewport.toggleRuler`, `ui.session.setMode`, etc.). Pretending they are document commands is the bug we are fixing here.

## Bucket 4 — `internal` (0)

No commands in the current public registry use raw PM transactions or `editor.chain()` directly. This bucket exists to receive any future internal-only entries that might leak into the public registry by mistake.

## Tally

- 33 in Bucket 1 (reroute + pair tests)
- 1 in Bucket 2 (gap ticket: `table-fix`)
- 4 in Bucket 3 (UI-only — handled by SD-2799)
- 0 in Bucket 4

Total: 38 entries in `PublicToolbarItemId`.

## PR sequence

This ticket lands in three PRs to keep review surface small:

1. **PR 1**: this matrix + inline marks reroute (8 commands) + pair tests + Bucket-2 gap ticket filed.
2. **PR 2**: paragraph + lists + history + link + image reroute (10 commands) + pair tests.
3. **PR 3**: tables reroute (11 commands) + pair tests.

A separate ticket (SD-2799) covers moving Bucket-3 commands to dedicated `ui.<domain>.*` surfaces.
