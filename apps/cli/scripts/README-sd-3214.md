# SD-3214 — Manual End-to-End Reproduction

Three scenarios that exercise the headless SDK's comment-sync pipeline through real Yjs primitives. Runs in one Node process; no Liveblocks/Hocuspocus required.

## 1. Run the repro (fix on)

From the worktree root:

```bash
NODE_ENV=test bun apps/cli/scripts/repro-sd-3214.ts
```

Expected output (with the fix applied):

```
=== Scenario 1: READ — browser → agent metadata propagation ===
  agent.comments.list() returned 1 item(s):
{
  id: "<uuid>",
  text: "Please review this clause.",
  creatorName: "Browser User",
  creatorEmail: "browser@example.com",
  createdTime: 1779...,
  target: "present",
}
  READ ✓ — metadata fully propagated

=== Scenario 2: WRITE — agent resolves comment, browser sees it ===
  agent.comments.patch({status:'resolved'}).success === true
  {
    commentId: "<uuid>",
    isDone: true,
    resolvedTime: 1779...,
  }
  WRITE ✓ — resolve propagated to Y.Array

=== Scenario 3: DELETE — agent deletes, Y.Array shrinks ===
  agent.comments.delete().success === true
  Y.Array length after delete: 0
  DELETE ✓ — Y.Array entry removed
```

## 2. See the bug (fix off)

To confirm what the pre-fix state looks like, disable each fix individually.

### Disable read-side (bridge.attachEditor)

```bash
# Comment out the attachEditor wiring:
sed -i.bak "s|commentBridge?.attachEditor(editor as never);|// commentBridge?.attachEditor(editor as never);|" \
  apps/cli/src/lib/document.ts

NODE_ENV=test bun apps/cli/scripts/repro-sd-3214.ts
# Scenario 1 now prints:
#   text: undefined, creatorName: undefined, creatorEmail: undefined, createdTime: undefined
#   READ ✗ — metadata missing (this is the SD-3214 read-side bug pre-fix)

# Restore:
mv apps/cli/src/lib/document.ts.bak apps/cli/src/lib/document.ts
```

### Disable write-side (wrapper emits)

```bash
# Comment out the three emits in comments-wrappers.ts:
git stash    # save state first
git checkout HEAD~1 -- packages/super-editor/src/editors/v1/document-api-adapters/plan-engine/comments-wrappers.ts
# (this reverts the wrapper to the first commit, before the write-side fix)

NODE_ENV=test bun apps/cli/scripts/repro-sd-3214.ts
# Scenarios 2 and 3 now print:
#   WRITE ✗ — resolve did not reach Y.Array
#   DELETE ✗ — Y.Array still has the entry

# Restore:
git checkout HEAD -- packages/super-editor/src/editors/v1/document-api-adapters/plan-engine/comments-wrappers.ts
git stash pop
```

## 3. What each scenario simulates

### Scenario 1 — READ direction

Mirrors the customer's flow: a user authors a comment in the browser SuperDoc; an agent connects to the same Y.Doc and reads the comment via `editor.doc.comments.list()`.

Both sessions are headless Editor instances sharing one in-memory Y.Doc. The "browser" session uses the user identity `Browser User <browser@example.com>`; the "agent" session uses `Headless Agent <agent@superdoc.dev>`. Yjs broadcasts changes between them through the natural CRDT mechanism — no network required.

Pass condition: all four metadata fields (`text`, `creatorName`, `creatorEmail`, `createdTime`) populate on the agent side.

### Scenario 2 — WRITE direction (resolve)

The agent calls `editor.doc.comments.patch({ commentId, status: 'resolved' })`. The Y.Array entry should reflect `isDone: true` and a numeric `resolvedTime`, so other clients observing the Y.Doc see the resolution.

Pass condition: `yEntry.isDone === true && typeof yEntry.resolvedTime === 'number'`.

### Scenario 3 — WRITE direction (delete)

The agent calls `editor.doc.comments.delete({ commentId })`. The Y.Array entry should disappear.

Pass condition: `ydoc.getArray('comments').toJSON().length === 0`.

## 4. Extending to a real two-process setup

If you want to validate against an actual collaboration provider (Liveblocks, Hocuspocus, custom websocket), the same code structure works — replace `providerStub()` with a real provider returned by `@superdoc-dev/cli`'s `createCollaborationRuntime`, and run the "browser" half in the dev server (`pnpm dev`) and the "agent" half via the CLI binary connected to the same room.

The in-memory shared Y.Doc here is the structural equivalent. If it passes, the network case will pass too — Yjs's wire protocol is just the same CRDT updates delivered over a socket.

## 5. Running the unit + integration suites

For machine-readable validation:

```bash
# CLI integration tests (10 cases for SD-3214)
pnpm --filter @superdoc-dev/cli test -- --run sd-3214

# super-editor unit + integration tests
pnpm --filter super-editor test -- --run comment-entity-store
pnpm --filter super-editor test -- --run comments-wrappers

# Full suites (slower, for pre-merge confidence)
pnpm --filter @superdoc-dev/cli test     # 1248 pass
pnpm --filter super-editor test           # 13117 pass
```
