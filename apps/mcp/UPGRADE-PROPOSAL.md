# Proposal: Upgrading the 9 SDK Intent Tools

Based on eval results comparing experimental (6 tools) vs shipped intent (9 tools) across 6 real-world tasks.

## Eval Summary

| Task | Experimental | SDK Intent | Gap |
|------|-------------|-----------|-----|
| Find & replace | 4 calls, PASS | 4 calls, PASS | None |
| Add comments | 4 calls, PASS | 27 calls, FAIL | **Batching** |
| Redline (tracked) | 4 calls, PASS | 12 calls, FAIL | **Tracked changes** |
| Create document | 5 calls, PASS | 5 calls, PASS | None |
| Read & summarize | 1 call, PASS | 1 call, PASS | None |
| Format text | 7 calls, PASS | 5 calls, PASS | SDK wins |

The intent tools work for simple tasks. They fail on **batch operations** (comments) and **tracked changes** (redlining). These are the two most important enterprise workflows.

---

## Changes Required (3 tools + system prompt)

### 1. `superdoc_search` — add batch pattern support

**Problem:** Each search is a separate tool call. A contract review needs 8-10 searches = 8-10 round trips.

**Change:** Accept `pattern` as string OR array of strings. Return results grouped by pattern.

```
// Before (one pattern per call)
superdoc_search({ type: "text", pattern: "indemnification" })
superdoc_search({ type: "text", pattern: "liability cap" })
superdoc_search({ type: "text", pattern: "confidentiality" })

// After (all patterns in one call)
superdoc_search({ type: "text", pattern: ["indemnification", "liability cap", "confidentiality"] })
```

**Also:** Include `blockId` and `range` in each text match result. Currently only `handle.ref` is returned. Comments need `blockId` + `range` — without them, the model can't target comments without constructing a `TextAddress` object (which it frequently gets wrong).

**Implementation:**
- In `generate-intent-tools.mjs`, modify the `superdoc_search` schema to accept `pattern` as `oneOf: [string, array<string>]`
- In the dispatch code, loop over patterns and return results keyed by pattern
- Add `blockId` and `range` fields to the match result shape (they're already in `blocks[0]` — just surface them at the top level)

---

### 2. `superdoc_edit` — add batch operations + tracked mode

**Problem 1:** Each edit is a separate call. Replace 5 text passages = 5 `superdoc_edit` calls, each requiring a fresh search (refs expire after mutations).

**Problem 2:** No way to apply edits as tracked changes. `superdoc_mutations` supports `changeMode: 'tracked'` but the model rarely uses it (complex step syntax).

**Problem 3:** Tracked changes replace entire matched text — Word shows whole paragraph deleted + re-inserted instead of word-level changes.

**Change:** Add `operations` array param and `tracked` boolean. When `operations` is provided, dispatch through `mutations.apply` atomically (refs stay valid). When `tracked: true`, compute word-level diff automatically.

```
// Before (one edit per call, no tracked changes)
superdoc_edit({ action: "replace", ref: "text:v4:...", text: "new text" })

// After (batch edits, with tracked changes)
superdoc_edit({
  operations: [
    { action: "replace", ref: "text:v4:...", text: "new text", matched_text: "old text" },
    { action: "replace", ref: "text:v4:...", text: "updated clause", matched_text: "original clause" },
    { action: "insert", text: "# New Section\n\nContent here." }
  ],
  tracked: true
})
```

**`matched_text` enables word-level diff:** When provided with `tracked: true`, the tool computes an LCS-based word diff between `matched_text` and `text`, then creates targeted `text.rewrite`, `text.delete`, and `text.insert` steps for only the changed words. This produces clean tracked changes in Word — exactly like a human redline.

**Backward compatible:** When `operations` is not provided, the tool works exactly as today (single `action` + params).

**Implementation:**
- Add `operations` (optional array) and `tracked` (optional boolean) to `superdoc_edit` schema
- When `operations` is present:
  - Build mutation plan steps from the operations array
  - For tracked replaces with `matched_text`: run word-level diff → create targeted steps
  - Execute via `mutations.apply({ atomic: true, changeMode: tracked ? 'tracked' : 'direct', steps })`
- When `operations` is absent: existing single-action behavior unchanged
- Word-level diff algorithm (LCS tokenization + edit merging) should be extracted into `@superdoc/document-api` or `@superdoc-dev/sdk` so it's reusable

---

### 3. `superdoc_comment` — add batch creation with flat targeting

**Problem 1:** Each comment is a separate call. Adding 8 comments to a contract = 8 `superdoc_comment` calls + 8 `superdoc_search` calls beforehand = 16 round trips.

**Problem 2:** Comment targeting requires constructing a `TextAddress` object: `{ kind: "text", blockId: "...", range: { start: N, end: N } }`. Models frequently get the nesting wrong.

**Change:** Accept `comments` array param for batch creation. Accept flat `blockId`, `rangeStart`, `rangeEnd` params instead of nested `target` object.

```
// Before (one comment per call, nested target)
superdoc_comment({
  action: "create",
  text: "This clause is vague.",
  target: { kind: "text", blockId: "ABC123", range: { start: 5, end: 42 } }
})

// After (batch comments, flat targeting)
superdoc_comment({
  action: "create",
  comments: [
    { text: "This clause is vague.", blockId: "ABC123", rangeStart: 5, rangeEnd: 42 },
    { text: "Verify this amount.", blockId: "DEF456", rangeStart: 10, rangeEnd: 25 },
    { text: "Missing deadline.", blockId: "GHI789", rangeStart: 0, rangeEnd: 30 }
  ]
})
```

**Backward compatible:** When `comments` is not provided, the tool works as today (single `action` + `text` + `target`).

**Implementation:**
- Add `comments` (optional array) to `superdoc_comment` schema
- When `comments` is present: loop and call `api.comments.create()` for each, building `TextAddress` from flat params
- When absent: existing single-action behavior unchanged

---

### 4. System prompt — simplify

**Current:** 9KB of instructions compensating for tool limitations. Includes rules like "refs expire after mutations" and "always start with blocks" and "batch with superdoc_mutations."

**Proposed:** ~2KB. The tools now handle batching and tracked changes internally.

```markdown
You are a document editing assistant with intent-based tools.

## Workflow
1. superdoc_get_content({action: "info"}) — understand document structure
2. superdoc_search — find text (pass array of patterns to batch)
3. superdoc_edit / superdoc_format / superdoc_comment — make changes (use operations array to batch)
4. superdoc_edit({operations: [...], tracked: true}) — for redlining

## Key rules
- Batch searches: pass all patterns to one superdoc_search call
- Batch edits: pass all operations to one superdoc_edit call (they execute atomically)
- For tracked changes: include matched_text on replace operations for word-level changes
- Comments: use blockId + rangeStart + rangeEnd from search results
```

---

## What stays the same

- **9 tool names** — no breaking changes to the tool surface
- **`action` discriminator** — still works for single operations
- **Schema structure** — new params are additive (optional)
- **`superdoc_format`** — works well as-is (eval showed SDK wins on formatting)
- **`superdoc_create`** — works well as-is
- **`superdoc_list`** — no changes needed
- **`superdoc_track_changes`** — no changes needed (for reviewing, not creating)
- **`superdoc_mutations`** — still available for advanced use, but most users won't need it

---

## What gets deprecated over time

- **`superdoc_mutations` for basic batching** — `superdoc_edit` with `operations` array replaces this for 90% of use cases. `superdoc_mutations` stays for advanced step types (assert, structural insert) but is no longer the recommended path for batch text edits.
- **Nested `target` objects on `superdoc_comment`** — flat params (`blockId`, `rangeStart`, `rangeEnd`) are easier. The nested form still works for backward compat.

---

## Expected eval impact

| Task | Current (9 tools) | After upgrade |
|------|-------------------|--------------|
| Find & replace | 4 calls, PASS | 4 calls, PASS (no change) |
| Add comments | 27 calls, FAIL | **4-5 calls, PASS** (batch search + batch comments) |
| Redline | 12 calls, FAIL | **4-5 calls, PASS** (batch edit + tracked + word diff) |
| Create document | 5 calls, PASS | 5 calls, PASS (no change) |
| Read & summarize | 1 call, PASS | 1 call, PASS (no change) |
| Format text | 5 calls, PASS | 5 calls, PASS (no change) |

**Target: 6/6 pass across all tasks.**

---

## Implementation order

1. **`superdoc_search` batch patterns** — smallest change, biggest impact on call count
2. **`superdoc_edit` operations array + tracked mode** — enables redlining
3. **Word-level diff** — extract from experimental MCP into shared module
4. **`superdoc_comment` batch + flat params** — enables efficient contract review
5. **System prompt simplification** — after tools are updated
6. **Re-run eval** — verify 6/6 pass

---

## Word-level diff algorithm (for reference)

The experimental MCP implements this in `apps/mcp/src/tools/direct.ts`. Core approach:

1. Tokenize both strings into words (preserving whitespace boundaries and char offsets)
2. Compute LCS (longest common subsequence) table
3. Backtrack to find aligned pairs → group consecutive non-LCS tokens into edit regions
4. Post-process: merge edits separated by ≤3 chars of whitespace/punctuation
5. For each edit region, create the appropriate mutation step:
   - Empty replacement → `text.delete`
   - Zero-width original range → `text.insert`
   - Otherwise → `text.rewrite`

This produces tracked changes that look like manual redlining in Word — only the changed words are marked, unchanged text stays untouched.

Should be extracted to `packages/document-api/src/diff/word-diff.ts` or `packages/sdk/src/word-diff.ts` so all consumers benefit.
