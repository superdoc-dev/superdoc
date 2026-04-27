# Drop-in friction log

What a developer actually hits when trying to replace their editor (TipTap / CKEditor / tinyMCE) with SuperDoc while keeping their own custom UI. Findings are grouped by the flow a developer naturally walks through: mount → toolbar → selection → comments → track changes. Each entry has the gap, the workaround (if any), and what would fix it.

**Scope.** DOCX in, DOCX out. Comparing on what's painful *after* you already have a DOCX open. Not raising HTML/Markdown import as a friction point — that's not what SuperDoc is for.

**Severity.** 🟥 blocker · 🟧 major · 🟨 minor

**Legend.**
- ✅ Closed by a shipped fix during this session
- 🔧 Workaround in this repro app
- 📝 Documentation-only gap (the behaviour works, consumers just can't find it)

**Closed during this assessment (shipped to main).**
- **SD-2635** (PR #2876): React wrapper re-initialised editor on every render when object props were passed inline. Fixed with `useMemoByValue` on `user` / `users`.
- **SD-2668** (PR #2924): `editor.doc.selection.current()` + `selection.onChange()` primitives. Widened `comments.create({ target })` to accept multi-segment `TextTarget` so cross-paragraph selections anchor across the full range instead of silently collapsing.
- **SD-2670** (PR #2928): `editor.doc.ranges.scrollIntoView({ target })` — accepts `TextAddress`, `TextTarget`, or `EntityAddress` (scroll to comment or tracked change by id). Handles paginated, virtualized layouts.

These close the drop-in's mechanical blockers. What's left below is the DX patina: the experience of evaluating and adopting SuperDoc as a drop-in for another editor.

---

## Systemic DX findings (what still slows evaluation)

### S1 · 🟥 📝 No "bring your own UI" recipe anywhere

Every breakthrough during this assessment came from reading source:

- Turning off the default comments UI needed `modules: { comments: false }` — undocumented in `AGENTS.md`, the React wrapper README, or the Document API docs. Cost: an investigation agent + a manual code trace.
- Finding the PM block id attr → `sdBlockId`, undocumented. Cost: inspection of rendered DOM.
- Learning the receipt shape (`{ success, inserted }`) → read adapter source. Cost: a failed API call + debug log.
- Knowing comments return `TextTarget` but tracked changes return only `EntityAddress` (no position) → read types. Cost: a type-level investigation before each scroll attempt.
- Knowing `createHeadlessToolbar` lives at `superdoc/headless-toolbar`, not `superdoc` → runtime error on load.
- Knowing telemetry defaults to enabled and needs `telemetry: { enabled: false }` to opt out → read `SuperDoc.js` source.

Every prospect evaluating SuperDoc as a drop-in will hit every one of these. Most will abandon before finding the path.

**Would fix it.** One page in `AGENTS.md` titled *"Build your own SuperDoc UI"* with runnable examples: disable defaults → read selection → create comment → list comments → subscribe to updates → scroll to entity → toggle track-changes → opt out of telemetry. The APIs all exist today (SD-2668 and SD-2670 closed the last mechanical gaps). The experience is entirely a documentation problem. **Tracked as SD-2669.**

### S2 · 🟧 Track-changes is asymmetric with comments on the read side

Comments return `CommentInfo.target: TextTarget` — positional, addressable, consumable by geometry APIs.

Tracked changes return `TrackChangeInfo.address: TrackedChangeAddress` — an entity id, nothing positional.

SD-2670 closed the *scroll* asymmetry by accepting `EntityAddress` targets on `ranges.scrollIntoView`. But anything else positional — inline decoration, "which change is near my cursor", "what's the next change after this one", card-position math for a visually-anchored sidebar — has no public path for tracked changes today. Consumers will resolve each TC individually via `trackChanges.get` every time they need its location. That's N+1 calls per sidebar render.

**Would fix it.** Add `target?: TextTarget` to `TrackChangeInfo` — same field `CommentInfo` already has. Populating it is cheap; the internal `resolveTrackedChange` already produces the positions.

### S3 · 🟧 Toolbar command registry is closed

`PublicToolbarItemId` is a ~45-item hardcoded union. No public mechanism to register a custom command into the headless controller. Consumers bringing their own branded buttons — "AI rewrite", "Insert template", "Version history", "Open in Word", anything company-specific — have to build parallel infrastructure on top of the Document API and can't reuse the headless toolbar's snapshot / execute plumbing.

Compare with TipTap where consumers write their own extension with `addCommands()` and the command appears alongside built-ins. That's the DX expectation for any editor with a plugin ecosystem.

**Would fix it.** Expose `headlessToolbar.registerCommand({ id, label, execute, getState })`. `id` can be a `${namespace}.${name}` string to avoid collision. Snapshot + subscribe mechanics extend naturally.

### S4 · 🟧 Track-changes recording is entangled with view mode

To enable TC recording, consumers flip `documentMode` to `'suggesting'`. The same setting controls what the user *sees* (revisions visible) and whether their edits get *recorded*. Three concerns collapsed into one axis:

- **View**: rendered state (final vs revisions-visible vs clean).
- **Permissions**: what the user can do (edit vs comment-only vs read).
- **Recording**: are edits captured as revisions.

Real workflows need them independent. A reviewer comments but can't edit (read-only view, TC off). A co-author edits with TC always on (editing view, TC on). A publisher reads the clean accepted version (viewing, TC off). Today "viewer" and "TC recording state" map 1-to-1 with the three modes, so any fourth workflow is unreachable.

**Would fix it.** `editor.doc.trackChanges.setRecording(boolean)` as an independent switch. Leave `documentMode` as pure view/permission state.

### S5 · 🟧 Author identity is init-time

Comments and tracked changes inherit authorship from `editor.options.user` at construction. To change authoring identity (login/logout, multi-session workstation, delegated edits) you rebuild the editor — which pre-SD-2635 blew up with flicker, and still costs a full DOCX reparse even on the fixed wrapper.

**Would fix it.** `editor.doc.setAuthor({ name, email, image })` as a runtime update. Optional `author` override on individual `comments.create` / selection mutations for "write this on behalf of X" cases.

### S6 · 🟨 No "next / previous" navigation helpers for review

Word's Review ribbon has Next/Previous buttons for comments and for changes. A drop-in consumer building a review UI reimplements this: iterate `list()`, track "current", compute next/prev by position. Ordering by position *requires* S2 (TC positional target) to be solved — otherwise TCs can't be sorted by document position at all.

**Would fix it.** `editor.doc.review.next({ entityType, fromId?, direction })` → returns the next entity's address. Under the hood it's `list()` + position sort + current-index math. Consumers shouldn't reimplement it.

### S7 · 🟨 Reply threads are hinted, not demonstrated

`CommentsCreateInput.parentCommentId` is public and the read side exposes `parentCommentId` on `CommentInfo`. But the pattern for building a threaded comment UI (tree vs flat list, order within thread, who can reply) isn't covered anywhere. A developer coming from Google Docs threading has to guess the model.

**Would fix it.** A short "Threaded comments" section in the same doc from S1, showing how to list root threads + replies, create a reply, resolve a whole thread.

### S8 · 🟨 Finding a comment/TC at a cursor position has no public helper

`selection.current()` returns `activeMarks: string[]` but not `activeCommentId` or `activeChangeId`. To answer "is there a comment here?" a consumer has to call `comments.list()` and filter by range overlap. That's a full read per keystroke for a floating "comment here?" hint.

**Would fix it.** Add `activeCommentId?: string` and `activeChangeIds?: string[]` to `SelectionInfo`. The internals already know (the selection resolver walks marks for `activeMarks`).

### S9 · 🟧 Geometry for range anchoring is still escape-hatch

The sidebar's "card pinned next to its highlight" pattern needs `range → { top, left, width, height }` in viewport coordinates. No public API today. The repro worked around this by reaching into `editor.view.coordsAtPos`, which is PM-view-based and not aligned with SuperDoc's paginated painted DOM. The drop-in app ended up removing the feature from its shared contract because no cross-editor path works.

**Would fix it.** `editor.doc.ranges.getRect(target)` backed by the layout engine. Pairs naturally with the existing `ranges.resolve` / `ranges.scrollIntoView`.

### S10 · 🟧 Virtualized non-body entities can't be scrolled to

When a tracked change lives in a non-body story (header/footer/footnote/endnote) on a page that isn't currently mounted in the DOM, `ranges.scrollIntoView({ target: EntityAddress })` returns `{ success: false }`. The non-body navigation path uses `data-track-change-id` DOM candidates, and offscreen pages have none. Tracked as **SD-2750**. Not a blocker for the body-only happy path the sample DOCX exercises.

### S11 · 🟧 Comment reopen is one-way through the public API

`CommentsPatchInput.status` is typed as `'resolved'` only. The internal adapter has a `reopen` method; it just isn't on the public shape. A sidebar with Resolve + Reopen (basic GitHub-style flow) can't do Reopen against the public API. The drop-in app still shows the Reopen button but logs a warning — the button is a no-op on SuperDoc.

**Would fix it.** Widen `CommentsPatchInput.status` to `'resolved' | 'active'`, route to the existing internal `reopen` path.

### S12 · 🟨 Telemetry defaults to on

`telemetry: { enabled: true }` is the default in `SuperDoc.js`. The running app posts to `https://ingest.superdoc.dev/v1/collect`. Enterprise drop-in adopters will want this explicitly disabled until they have their own consent/privacy story. The example sets `telemetry: { enabled: false }` to demonstrate the opt-out; that line is the *only* place in the repo where the pattern is demonstrated.

**Would fix it.** Either flip the default to disabled (breaking, but prospect-friendly), or document the opt-out prominently in `AGENTS.md` and the React wrapper README.

---

## Toolbar

### 🟨 T1. `createHeadlessToolbar` lives at a sub-entry, not the main package

**Gap.** `import { createHeadlessToolbar } from 'superdoc'` compiles but throws at runtime: *"does not provide an export named 'createHeadlessToolbar'"*. The correct path is `'superdoc/headless-toolbar'`.

**Would fix it.** Re-export from the main entry, or document the sub-path in `AGENTS.md`.

### 🟧 T2. No direct heading commands in the headless toolbar

**Gap.** `PublicToolbarItemId` includes `bold | italic | underline | strikethrough | bullet-list | numbered-list | link | text-align | …` but no `heading-1`, `heading-2`, `paragraph`. Only `linked-style`, which takes a Word-style name object.

**Impact.** The generic toolbar has H1/H2 buttons; they're disabled on SuperDoc. Consumers coming from TipTap (`toggleHeading({ level: 1 })`), CKEditor (`heading:1`), or tinyMCE (`HeadingToggle`) have nothing to map those to.

**Would fix it.** Add `heading-1` … `heading-6` and `paragraph` to the toolbar registry, routing to the appropriate linked-style internally.

### 🟧 T3. No highlight toggle — only `highlight-color` with a color string

**Gap.** TipTap: `chain.toggleHighlight()`, boolean. SuperDoc: `execute('highlight-color', '#yellow')`, requires a color. A generic highlight button has no mapping; consumers must hard-code a default color.

**Would fix it.** Add `highlight` as a boolean toggle (alias for `highlight-color` with a default), keep `highlight-color` for pickers.

### 🟨 T4. Naming mismatches

- `strikethrough` (SuperDoc) vs `strike` / `strikeThrough` (TipTap, CKE, tinyMCE).
- `numbered-list` (SuperDoc) vs `ordered-list` / `ol` / `orderedList` (TipTap, DOM, HTML).

Not blockers, but every adapter writer re-maps them. Add aliases.

---

## Lifecycle

### 🟨 L1. SuperDoc React wrapper owns its own DOM lifecycle

**Gap.** TipTap: `new Editor({ element: myDiv })` — point it at your div, your layout wraps it. SuperDoc's `<SuperDocEditor>` renders its own wrapper, loader, error surface, and hides its inner container with `display: none` until its internal `isLoading` flag flips. A consumer can't easily wrap the editor in a three-panel layout without trusting that internal state.

**Workaround.** 🔧 Use `contained` + `hideToolbar` props and wrap in a flex container. Works in practice.

**Would fix it.** Either (a) expose an imperative `createSuperDoc({ mount: element })` alongside the React component, or (b) let consumers own `isLoading` / `isReady` via controlled props.

### 🟥 L2. Workspace linking requires a build — `pnpm i` alone leaves Vite broken

**Gap.** After `pnpm install` in the monorepo, `@superdoc-dev/react` workspace link points at `./dist/` which doesn't exist until you run the publish build. Vite errors: `Failed to resolve import "@superdoc-dev/react"`.

**Impact.** First-time contributor experience: install, dev, error with no clear signal that a build is missing.

**Would fix it.** Either (a) a root `predev` script that builds dependent packages, (b) `main` pointing at `src` during dev with a `tsc` compose config, or (c) a line in the root README.

### 🟨 L3. Vue warn on every React unmount: "Cannot unmount an app that is not mounted"

**Gap.** Toggling between editors (any `<SuperDocEditor>` unmount) prints `[Vue warn]: Cannot unmount an app that is not mounted` to the console. The React wrapper's cleanup unconditionally calls `instance.destroy()`, which calls Vue's `app.unmount()` even when the Vue app was already torn down by another path.

**Impact.** No functional regression. Just console noise consumers will ask about — and a smell on a public component's unmount path.

**Tracked as SD-2760.** Trivial fix in SuperDoc's `destroy()` (track mount state, skip unmount when not mounted).

---

## Ranked summary

| # | Sev | Gap | Editors impacted |
|---|---|---|---|
| S9 | 🟧 | No public `ranges.getRect(target)` | All |
| S2 | 🟧 | `TrackChangeInfo` lacks positional target | All |
| S10 | 🟧 | Virtualized non-body entity scroll fails (SD-2750) | All |
| S11 | 🟧 | Comment reopen is public-API one-way | All |
| S3 | 🟧 | Headless toolbar registry is closed | All |
| S4 | 🟧 | Track-changes recording entangled with view mode | All |
| S5 | 🟧 | Author identity is init-time only | All |
| T2 | 🟧 | No heading commands in headless toolbar | TipTap, CKE, tinyMCE |
| T3 | 🟧 | No boolean highlight toggle | TipTap, tinyMCE |
| S1 | 🟥 📝 | "Bring your own UI" undocumented (SD-2669) | All |
| L2 | 🟥 | Workspace-dev requires build step | Contributors |
| L3 | 🟨 | Vue warn on React unmount (SD-2760) | All React consumers |
| S12 | 🟨 | Telemetry on by default | Enterprise adopters |
| S6 | 🟨 | No next/prev navigation helpers | All |
| S7 | 🟨 | Reply threads undocumented | All |
| S8 | 🟨 | No active-entity-at-cursor helper | All |
| L1 | 🟨 | React wrapper owns its DOM lifecycle | Layout-heavy consumers |
| T1 | 🟨 | `createHeadlessToolbar` sub-entry discovery | All |
| T4 | 🟨 | Industry-standard naming mismatches | All |

---

## What we learned

The mechanical APIs now exist to build a drop-in comments + tracked-changes UI on SuperDoc. The remaining friction is split cleanly between:

1. **Discoverability (S1, T1, S12)** — consumers abandon before finding the right import path, config flag, or opt-out. Solvable with documentation, no API change needed.
2. **Parity with comments (S2, S9, S10)** — tracked changes still can't be sorted by position, anchored by geometry, or scrolled to when offscreen in non-body stories. The comments surface is 100% consumer-ready; tracked changes need one more round.
3. **Control surface (S3, S4, S5, S11)** — consumers need runtime levers for things that are today init-time or not exposed: custom toolbar commands, independent TC recording, author switching, comment reopen.

None of these are DOCX-first concerns. They're the cost of adopting SuperDoc as a UI platform, and each one is fixable without touching the rendering pipeline.
