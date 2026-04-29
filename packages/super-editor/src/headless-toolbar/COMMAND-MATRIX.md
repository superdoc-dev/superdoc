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

## Layering rule (path B)

Toggle is a UI gesture, not a document operation. The Document API stays deterministic — "set bold true", "set bold false", "set color X", "clear color" — and toggle behavior lives in the executor. So `ui.commands.bold.execute()` reads the current selection state, decides the intended outcome, and calls the appropriate doc-api operation sequence.

This means each Bucket-1 entry has an `execution` shape that says *how* the toolbar gets to the doc-api operation:

| Execution | Meaning |
|--|--|
| `single-doc-op` | One doc-api call, deterministic from payload. |
| `composed-doc-ops` | Toolbar reads selection state, picks one or more doc-api calls (toggle, conditional clear, etc.). |
| `ui-session` | UI/session state — no doc-api call. (Bucket 3.) |
| `legacy-gap` | Falls back to `editor.commands.*` until the doc-api gap is filled. (Bucket 2.) |

Pair tests assert that `ui.commands.<id>.execute()` produces the same final document state as the explicit doc-api sequence for a given starting state. For `composed-doc-ops` entries the "explicit sequence" varies by start state — the test exercises both branches (e.g. apply path *and* clear path for bold) so drift can't hide in either one.

We will *not* add `format.toggleBold` (or similar UI-gesture ops) to the Document API. If the test exposes a missing deterministic operation — say there's no clean way to clear bold via doc-api — the gap is "set/clear inline formatting", not "toggle bold".

## Bucket 1 — `document-api` (33)

| Command | Execution | Doc-api operation(s) | Notes |
|--|--|--|--|
| `bold` | `composed-doc-ops` | `format.bold` (apply) / `format.apply({inline:{bold:false}})` (clear) | Toggle: read state → apply or clear. |
| `italic` | `composed-doc-ops` | `format.italic` / `format.apply({inline:{italic:false}})` | Toggle. |
| `underline` | `composed-doc-ops` | `format.underline` / `format.apply({inline:{underline:null}})` | Toggle. Underline is an object patch, not a boolean — clear via null. |
| `strikethrough` | `composed-doc-ops` | `format.strike` / `format.apply({inline:{strike:false}})` | Toggle. |
| `font-size` | `single-doc-op` | `format.fontSize` (or `format.apply` with null to clear) | Set-to-value. Empty/null payload clears. |
| `font-family` | `single-doc-op` | `format.fontFamily` (or null to clear) | Set-to-value. |
| `text-color` | `single-doc-op` | `format.color` (or null to clear) | Set-to-value. |
| `highlight-color` | `single-doc-op` | `format.highlight` (or null to clear) | Set-to-value. |
| `link` | `composed-doc-ops` | `hyperlinks.wrap` (set) / `hyperlinks.remove` (unset) | UI layer owns the link prompt. Mutation routes through doc-api once payload has `{href}`. |
| `text-align` | `single-doc-op` | `format.paragraph.setAlignment` | |
| `line-height` | `single-doc-op` | `format.paragraph.setSpacing` (lineHeight) | |
| `linked-style` | `single-doc-op` | `styles.paragraph.setStyle` | Pair test must be strict — if the toolbar path does anything beyond apply-style (cursor moves, mark cleanup, etc.), the test must surface it. |
| `bullet-list` | `composed-doc-ops` | `lists.create` / `lists.attach` / `lists.detach` (toggle) | Toggle into/out of list. |
| `numbered-list` | `composed-doc-ops` | `lists.create` / `lists.attach` / `lists.detach` (toggle) | Toggle. |
| `indent-increase` | `composed-doc-ops` | `lists.indent` (in list) / `format.paragraph.setIndentation` (else) | Branch on context. |
| `indent-decrease` | `composed-doc-ops` | `lists.outdent` (in list) / `format.paragraph.setIndentation` (else) | Branch on context. |
| `undo` | `single-doc-op` | `history.undo` | Editor-session state, but the contract owns it, so `ui.commands` must not bypass it. |
| `redo` | `single-doc-op` | `history.redo` | |
| `clear-formatting` | `single-doc-op` | `format.paragraph.resetDirectFormatting` | |
| `track-changes-accept-selection` | `single-doc-op` | `trackChanges.decide({ decision: 'accept' })` | |
| `track-changes-reject-selection` | `single-doc-op` | `trackChanges.decide({ decision: 'reject' })` | |
| `image` | `single-doc-op` | `create.image` | UI layer owns the file picker / upload dialog. Mutation goes through doc-api. |
| `table-insert` | `single-doc-op` | `create.table` | |
| `table-add-row-before` | `single-doc-op` | `tables.insertRow({ position: 'before' })` | |
| `table-add-row-after` | `single-doc-op` | `tables.insertRow({ position: 'after' })` | |
| `table-delete-row` | `single-doc-op` | `tables.deleteRow` | |
| `table-add-column-before` | `single-doc-op` | `tables.insertColumn({ position: 'before' })` | |
| `table-add-column-after` | `single-doc-op` | `tables.insertColumn({ position: 'after' })` | |
| `table-delete-column` | `single-doc-op` | `tables.deleteColumn` | |
| `table-delete` | `single-doc-op` | `tables.delete` | |
| `table-merge-cells` | `single-doc-op` | `tables.mergeCells` | |
| `table-split-cell` | `single-doc-op` | `tables.splitCell` | |
| `table-remove-borders` | `single-doc-op` | `tables.clearBorder` | |

### Field-annotation special case

`bold`, `italic`, `underline`, `strikethrough`, and a few others have a pre-check today: if the cursor is in a "field annotation" UI element, they call `editor.commands.toggleFieldAnnotationsFormat(...)` instead of the normal mark path. That branch stays as-is for now — it's a UI-internal special case that doesn't have a doc-api equivalent. Pair tests skip the field-annotation path; only the normal-text path is asserted. If field-annotation formatting needs to land on the contract later, it gets its own gap ticket.

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
