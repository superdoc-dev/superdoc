# SD-1810: Backspace Doesn't Delete Empty Paragraph in Suggesting Mode

## The Issue

In suggesting mode, pressing Backspace on an empty paragraph does nothing. The full repro:

1. Type text into a paragraph (e.g., Lorem Ipsum)
2. Switch to Suggesting mode
3. Click in the middle of the paragraph
4. Press Enter twice (creates 3 paragraphs, middle one empty)
5. Press Backspace (should delete empty paragraph)
6. Press Backspace again (should join the two remaining paragraphs)

**Before the fix**: Both Backspace presses did nothing. The empty paragraph stayed, and the join was silently swallowed.

## How Suggesting Mode Works Behind the Scenes

### Transaction Interception

When track changes is active (suggesting mode), every ProseMirror transaction goes through a special pipeline:

```
User action (keydown, paste, etc.)
    |
    v
ProseMirror creates Transaction with Steps
    |
    v
Editor.#dispatchTransaction()
    |
    v
trackedTransaction({ tr, state, user })    <-- intercepts here
    |
    v
For each step:
  - ReplaceStep  --> replaceStep() handler
  - AddMarkStep  --> addMarkStep() handler
  - RemoveMarkStep --> removeMarkStep() handler
    |
    v
Returns modified transaction with track-insert/track-delete marks
```

### The `replaceStep()` Function

This is the core handler. It takes the user's original step and rewrites it as a tracked change:

1. **Inverts** the original step (to preserve existing content)
2. **Inserts** the new content with a `track-insert` mark
3. **Marks deletion** on the old content range with `track-delete` marks
4. Returns the rewritten transaction

### Key Files

| File | Purpose |
|------|---------|
| `track-changes/trackChangesHelpers/trackedTransaction.js` | Entry point, routes steps to handlers |
| `track-changes/trackChangesHelpers/replaceStep.js` | Handles ReplaceStep (deletion, insertion, join) |
| `track-changes/trackChangesHelpers/markDeletion.js` | Applies track-delete marks to inline nodes |
| `track-changes/trackChangesHelpers/markInsertion.js` | Applies track-insert marks to inline nodes |
| `core/extensions/keymap.js` | Keyboard shortcuts (Enter, Backspace, Delete) |

## Root Cause

### Problem 1: Empty Paragraph Deletion

When Backspace removes an empty paragraph, ProseMirror creates:

```
ReplaceStep(from=emptyParaStart, to=emptyParaEnd, slice=Slice.empty)
```

The `replaceStep()` handler:
1. Inverts the step (no-op since content is empty)
2. Tries `markDeletion(from, to)` on the range
3. `markDeletion` iterates `nodesBetween(from, to)` looking for **inline nodes** to mark
4. An empty paragraph has **zero inline nodes**
5. Nothing gets marked, and the deletion step is never applied to the transaction
6. Result: the empty paragraph stays

### Problem 2: Paragraph Join

When Backspace at the start of a paragraph creates a join, ProseMirror creates:

```
ReplaceStep(from=para1End-1, to=para2Start+1, slice=Slice.empty)
```

The step range `[from, to]` spans only 2 positions (the closing `</p>` token and opening `<p>` token). Same issue:

1. `markDeletion(from, to)` scans for inline nodes in range
2. The range contains only block boundary tokens, no inline nodes
3. Nothing gets marked, join is silently swallowed
4. Result: paragraphs stay separate

### The Common Pattern

Both cases share the same root cause: `markDeletion` operates on **inline content only** (text nodes, images, etc.). It cannot represent structural changes (removing block boundaries, deleting empty blocks) because there's nothing to attach a mark to.

```
                 Inline content?
                    /     \
                  YES       NO
                  /           \
          markDeletion    markDeletion
          adds marks      finds nothing
          (works!)        (silent no-op!)
```

## The Fix

Added an early guard at the top of `replaceStep()`:

```javascript
// Handle structural deletions with no inline content (e.g., empty paragraph removal,
// paragraph joins). When there's no content being inserted and no inline content in
// the deletion range, markDeletion has nothing to mark -- apply the step directly.
if (step.from !== step.to && step.slice.content.size === 0) {
  let hasInlineContent = false;
  newTr.doc.nodesBetween(step.from, step.to, (node) => {
    if (node.isInline) {
      hasInlineContent = true;
      return false;
    }
  });

  if (!hasInlineContent) {
    if (!newTr.maybeStep(step).failed) {
      map.appendMap(step.getMap());
    }
    return;
  }
}
```

The logic:

1. **Is this a pure deletion?** `step.from !== step.to && step.slice.content.size === 0`
2. **Does the range contain any inline content?** Scan with `nodesBetween`
3. **If no inline content**: Apply the step directly (bypass tracking flow)

This handles both empty paragraph deletion AND paragraph joins, because both are structural operations where `markDeletion` has nothing to work with.

### Why Not Track These Operations?

The track changes system represents changes as **marks on inline nodes** (text, images). Structural changes (paragraph boundaries) have no inline node to attach marks to. Properly tracking them would require:

- A new mark type for paragraph boundary deletions
- New decoration rendering for visual feedback
- Changes across the entire track changes accept/reject system

This is significant architectural work. The pragmatic solution: apply structural operations directly when they can't be represented as tracked changes. This matches the actual behavior before the fix (the operations were already untracked -- they were just silently lost instead of applied).

## Additional Changes in This PR

### `keymap.js`: History Group Boundaries

Added `closeHistory` dispatch before Enter, Backspace, and Delete handlers. This ensures each structural operation creates a separate undo group, so Ctrl+Z undoes them individually.

### `block-node.js`: Duplicate sdBlockId Prevention

When `tr.split()` creates a new paragraph (Enter key), ProseMirror copies ALL attributes including `sdBlockId`. The `FlowBlockCache` uses `sdBlockId` as its sole cache key, so duplicates cause garbled rendering.

Fix: Track `seenBlockIds` in the `appendTransaction` handler. When a duplicate ID is found, assign a new UUID.

## Testing

### Unit Tests

- `replaceStep.test.js`: Tests empty paragraph deletion and paragraph join
- `keymap-history.test.js`: Tests undo group boundaries for Enter/Space

### Manual Browser Verification

1. Open `localhost:9097`, type text, switch to Suggesting mode
2. Click in middle of paragraph
3. Enter, Enter, Backspace, Backspace
4. Verify: returns to 1 paragraph with all text intact
