# Drop-in friction log

What a developer actually hits when trying to replace their editor (TipTap / CKEditor / tinyMCE) with SuperDoc while keeping their own custom UI. Findings are grouped by the flow a developer naturally walks through: mount → toolbar → selection → comments → track changes. Each entry has the gap, the workaround (if any), and what would fix it.

**Scope.** DOCX in, DOCX out. Comparing on what's painful *after* you already have a DOCX open. Not raising HTML/Markdown import as a friction point — that's not what SuperDoc is for.

**Severity.** 🟥 blocker · 🟧 major · 🟨 minor

**Legend.**
- ✅ Closed by a shipped fix
- 🔧 Workaround in this repro app
- 📝 Documentation-only gap (the behaviour works, consumers just can't find it)

## Closed since the original assessment (shipped to main)

The drop-in assessment originally landed against pre-SD-2667 SuperDoc. Most mechanical blockers and several DX gaps have closed since then under the umbrella, and the example app now runs on the canonical `createSuperDocUI({ superdoc })` controller.

- ✅ **SD-2635** (PR #2876) — React wrapper re-init flicker on inline object props.
- ✅ **SD-2668** (PR #2924) — `editor.doc.selection.current()` + multi-segment `TextTarget` for `comments.create`.
- ✅ **SD-2670** (PR #2928) — `editor.doc.ranges.scrollIntoView({ target })` for text + entity targets, paginated and virtualized.
- ✅ **SD-2789** (PR #2987) — Comment reopen via `comments.patch({ status: 'active' })`. Closes prior **S11**.
- ✅ **SD-2790** (PR #2982) — `ui.comments.*` domain on the new controller.
- ✅ **SD-2791** (PR #2983) — `ui.review.*` merged comments + tracked-changes feed with `next` / `previous` navigation. Closes prior **S6**.
- ✅ **SD-2792** (PR #2981) — `selection.current()` exposes `activeCommentIds` / `activeChangeIds`. Closes prior **S8**.
- ✅ **SD-2793** (PR #2984) — `ui.viewport.getRect(target)` and `ui.viewport.scrollIntoView(input)`. Closes prior **S9**.
- ✅ **SD-2794** (PR #2979) — `createSuperDocUI({ superdoc })` skeleton + selector substrate. The canonical build-your-own-UI entry.
- ✅ **SD-2795** (PR #2988) — Removed `editor.doc.selection.onChange` and `ranges.scrollIntoView` from the doc-api surface. UI subscriptions now ride the controller.
- ✅ **SD-2796** (PR #2980) — `ui.toolbar` + per-command observables (`ui.commands.<id>.observe`).
- ✅ **SD-2802** (PR #3004) — `ui.commands.register({ id, execute, getState })` with typed handle, async execute, invalidate. Closes prior **S3**.
- ✅ **SD-2803** (PR #2999) — `superdoc/ui` ships its own bundle entry; consumers no longer pull the full editor.

The example app has been refactored to consume `superdoc/ui` end-to-end (see `SuperDocAdapter.ts`). What's left below is the residue.

---

## Systemic DX findings (what still slows evaluation)

### S1 · 🟥 📝 No "bring your own UI" recipe anywhere

Every breakthrough during the original assessment came from reading source. The path now exists end-to-end on `createSuperDocUI({ superdoc })` — selection slice, comments domain, review feed, viewport scroll, custom toolbar commands — but the docs guide that walks a consumer through it is still in flight as **SD-2669**.

**Would fix it.** SD-2669 ships the page. Until it does, this app is the canonical reference.

### S2 · 🟧 Track-changes is asymmetric with comments on the read side

Comments return `CommentInfo.target: TextTarget` — positional, addressable. Tracked changes return `TrackChangeInfo.address: TrackedChangeAddress` — entity-only.

`ui.viewport.getRect` (SD-2793) and `ui.review.scrollTo` (SD-2791) close the geometry and scroll asymmetries. But anything else positional — inline decoration math, "what's the next change after this position" — still resolves each TC individually via `trackChanges.get`. That's N+1 for sidebar render.

**Would fix it.** Add `target?: TextTarget` to `TrackChangeInfo`. Internals already produce the positions.

### S4 · 🟧 Track-changes recording is entangled with view mode

To enable TC recording, consumers flip `documentMode` to `'suggesting'`. The same setting controls what the user *sees* (revisions visible) and whether their edits get *recorded*. Three concerns collapsed into one axis: view, permissions, recording.

Real workflows need them independent — a reviewer comments without editing, a co-author edits with TC always on, a publisher reads the clean version.

**Would fix it.** `editor.doc.trackChanges.setRecording(boolean)` as an independent switch. Leave `documentMode` as pure view/permission state. **SD-2799** stages the broader move of UI-only commands off the toolbar registry to dedicated `ui.<domain>` surfaces.

### S5 · 🟧 Author identity is init-time

Comments and tracked changes inherit authorship from `editor.options.user` at construction. Changing identity (login/logout, multi-session workstation, delegated edits) requires rebuilding the editor — full DOCX reparse even with the SD-2635 wrapper fix.

**Would fix it.** `editor.doc.setAuthor({ name, email, image })` as a runtime update. Optional `author` override on individual `comments.create` / selection mutations for "write this on behalf of X" cases.

### S7 · 🟨 Reply threads are hinted, not demonstrated

`CommentsCreateInput.parentCommentId` is public and the read side exposes `parentCommentId` on `CommentInfo`. The pattern for building a threaded comment UI (tree vs flat, ordering, who can reply) isn't covered anywhere.

**Would fix it.** A short "Threaded comments" section in the SD-2669 guide showing how to list root threads + replies, create a reply, resolve a whole thread.

### S10 · 🟧 Virtualized non-body entities can't be scrolled to

When a tracked change lives in a non-body story (header/footer/footnote/endnote) on a page that isn't currently mounted in the DOM, `ui.viewport.scrollIntoView({ target: EntityAddress })` returns `{ success: false }`. Tracked as **SD-2750**. Not a blocker for the body-only happy path the sample DOCX exercises.

### S12 · 🟨 Telemetry defaults to on

`telemetry: { enabled: true }` is the default in `SuperDoc.js`. Enterprise drop-in adopters will want this explicitly disabled. The example sets `telemetry: { enabled: false }` to demonstrate the opt-out; that line is the only place in the repo where the pattern is shown.

**Would fix it.** Either flip the default to disabled (breaking, but prospect-friendly) or document the opt-out prominently in `AGENTS.md` and the React wrapper README.

---

## Toolbar

### 🟨 T1. `createSuperDocUI` lives at a sub-entry, not the main package

**Gap.** `import { createSuperDocUI } from 'superdoc'` doesn't compile. The path is `'superdoc/ui'`. SD-2803 made the sub-entry tight (consumers no longer pull the full editor), but the discoverability is still on documentation. Same pattern as the legacy `superdoc/headless-toolbar` — sub-entries that consumers can't find without reading `package.json` exports.

**Would fix it.** The SD-2669 guide should call out the sub-entries explicitly. Re-exporting from the main entry is a separate decision; today the bundle hygiene argues against it.

### 🟧 T2. No direct heading commands in the headless toolbar

**Gap.** `PublicToolbarItemId` includes inline marks, lists, link, alignment, but no `heading-1`, `heading-2`, `paragraph`. Only `linked-style`, which takes a Word-style name object.

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

**Gap.** TipTap: `new Editor({ element: myDiv })` — point it at your div, your layout wraps it. SuperDoc's `<SuperDocEditor>` renders its own wrapper, loader, and error surface, hidden until its internal `isLoading` flips. A consumer can't easily wrap the editor in a three-panel layout without trusting that internal state.

**Workaround.** 🔧 Use `contained` + `hideToolbar` props and wrap in a flex container. Works in practice.

**Would fix it.** Either (a) expose an imperative `createSuperDoc({ mount: element })` alongside the React component, or (b) let consumers own `isLoading` / `isReady` via controlled props.

### 🟥 L2. Workspace linking requires a build — `pnpm i` alone leaves Vite broken

**Gap.** After `pnpm install` in the monorepo, `@superdoc-dev/react` workspace link points at `./dist/` which doesn't exist until you run the publish build. Vite errors: `Failed to resolve import "@superdoc-dev/react"`.

**Impact.** First-time contributor experience: install, dev, error with no clear signal that a build is missing.

**Would fix it.** Either (a) a root `predev` script that builds dependent packages, (b) `main` pointing at `src` during dev with a `tsc` compose config, or (c) a line in the root README.

---

## Ranked summary

| # | Sev | Gap | Editors impacted |
|---|---|---|---|
| S2 | 🟧 | `TrackChangeInfo` lacks positional target | All |
| S10 | 🟧 | Virtualized non-body entity scroll fails (SD-2750) | All |
| S4 | 🟧 | Track-changes recording entangled with view mode (SD-2799) | All |
| S5 | 🟧 | Author identity is init-time only | All |
| T2 | 🟧 | No heading commands in headless toolbar | TipTap, CKE, tinyMCE |
| T3 | 🟧 | No boolean highlight toggle | TipTap, tinyMCE |
| S1 | 🟥 📝 | "Bring your own UI" undocumented (SD-2669) | All |
| L2 | 🟥 | Workspace-dev requires build step | Contributors |
| S12 | 🟨 | Telemetry on by default | Enterprise adopters |
| S7 | 🟨 | Reply threads undocumented | All |
| L1 | 🟨 | React wrapper owns its DOM lifecycle | Layout-heavy consumers |
| T1 | 🟨 | `superdoc/ui` sub-entry discovery | All |
| T4 | 🟨 | Industry-standard naming mismatches | All |

---

## What we learned

After SD-2667, the controller surface is real and the example app rides it end-to-end. Remaining friction splits cleanly:

1. **Discoverability (S1, T1, S12)** — consumers abandon before finding the right import path or config flag. Solvable by docs (SD-2669), no API change needed.
2. **Parity with comments (S2, S10)** — tracked changes still can't be sorted by position or scrolled to when offscreen in non-body stories. Comments are 100% consumer-ready; tracked changes need one more round.
3. **Control surface (S4, S5)** — runtime levers for things that are today init-time or coupled with documentMode: independent TC recording, author switching.
4. **Toolbar parity (T2, T3, T4)** — heading commands, boolean highlight, naming aliases for the three editors consumers are migrating from.

None of these are DOCX-first concerns. They're the cost of adopting SuperDoc as a UI platform, and each one is fixable without touching the rendering pipeline.
