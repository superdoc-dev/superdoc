# Drop-in assessment

Scratch app that answers one question:

> If a team has built a custom toolbar and custom comments sidebar on top of another editor (TipTap, CKEditor, tinyMCE, Apryse, Aspose), how easy is it to swap that editor for SuperDoc *without rewriting the UI*?

## Approach

- Shared React UI (`src/ui/`) — toolbar, comments sidebar, composer, comment card, tracked-change card. Agnostic to the underlying editor.
- Editor-agnostic contract (`src/core/EditorAdapter.ts`) — the capability checklist any drop-in editor must satisfy.
- Two adapters:
  - `src/adapters/TipTapAdapter.ts` — v1 reference. Shows the "ideal" shape.
  - `src/adapters/SuperDocAdapter.ts` — v2. Fulfills the same interface using SuperDoc's public API (`editor.doc.*`). Every workaround (marked `FRICTION:` or `ESCAPE HATCH:` in comments) is a DX gap.
- `FRICTION.md` — running log of remaining gaps, ordered by how painful they were to work around.

## Running

```bash
pnpm install                        # at repo root
pnpm --filter dropin-assessment dev # http://localhost:5188
```

Toggle between TipTap and SuperDoc in the header to compare the two experiences with the exact same UI.

## Scope (what this app exercises)

- **Comments**: range selection → `comments.create` with a multi-segment `TextTarget`, `comments.list`, `comments.patch({ status: 'resolved' })`, `comments.delete`, card ↔ inline highlight sync, scroll-to-anchor via `editor.doc.ranges.scrollIntoView({ target: EntityAddress })`.
- **Tracked changes**: imported from a Word-authored DOCX, rendered in the same sidebar feed as comments, accept/reject through `trackChanges.decide`, scroll-to-anchor via `ranges.scrollIntoView`.
- **Selection**: live selection read through `editor.doc.selection.current()` (no PM reach-in).
- **Toolbar**: driven by SuperDoc's `createHeadlessToolbar` (40-command closed union).

## Honest omissions

- **TipTap does not ship tracked-changes** out of the box (requires `@tiptap-pro/extension-track-changes`). The TipTap view shows an empty tracked-changes panel — the missing capability is the finding, not something to paper over with mocks.
- **HTML / Markdown persistence**: out of scope. SuperDoc is DOCX-first; consumers that persist HTML or ProseMirror JSON have a harder migration. A fuller scenario matrix (load/save/export, undo/redo, read-only, threaded replies, search, tables, etc.) is deferred to a follow-up assessment.
- **Failures are surfaced, not masked**. `addComment` returns `null` when the engine rejects the insert — the harness surfaces the gap rather than inventing placeholder state. Read console errors during exploration.

## Sample content

The app loads `public/sample-review.docx` — a two-page Word memo with 3 comments and 3 tracked insertions, authored by two distinct users. This document exercises multi-page scroll, multi-author attribution, and non-contiguous tracked changes on the same document body.

## Telemetry

The example sets `telemetry: { enabled: false }` on the SuperDoc config. SuperDoc defaults to telemetry-enabled; drop-in adopters typically want to explicitly opt out (or wire their own consent) before shipping.
