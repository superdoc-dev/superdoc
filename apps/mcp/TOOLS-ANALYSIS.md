# SuperDoc Tools Analysis: SDK vs Experimental MCP

Analysis based on building and testing a minimal MCP tool set against real-world document workflows (contract redlining, document creation), then comparing against the existing SDK intent tools.

## Executive Summary

The existing SDK ships **9 intent tools** that multiplex ~178 underlying Document API operations via `action` discriminators. In practice, LLMs struggle with these — the `action` + nested schema pattern causes parameter errors, the lack of batching forces 20+ round trips for common tasks, and tracked changes replace whole paragraphs instead of individual words. Our experimental MCP server achieved the same real-world tasks with **6 tools and 4-5 round trips** total, zero errors, word-level tracked changes, and proper comments.

The core issue isn't the Document API (which is excellent) — it's the tool surface design. The 9 intent tools are a reasonable count, but the way they multiplex operations, the lack of batching, and the complex input schemas make them hard for LLMs to use reliably.

---

## What the SDK Tools Get Right

### 1. Contract-driven generation
The single-source-of-truth architecture (`operation-definitions.ts` → codegen → catalog) is solid engineering. Every tool stays in sync with the API automatically. This should be preserved.

### 2. Tool count is reasonable
9 intent tools is a good number — well within what LLMs can reason about. The problem isn't how many tools there are, it's how each tool works internally.

### 3. Good intent groupings
The groupings (search, get_content, edit, format, create, list, comment, track_changes, mutations) map to real user intents. The categories are right.

### 4. Policy-based tool filtering
`tools-policy.json` with operational phases (read → locate → mutate → review) is a good idea — context-aware tool selection.

### 5. Provider-specific formats
Generating OpenAI, Anthropic, Vercel, and generic tool formats from one source is valuable for distribution.

### 6. Rich operation coverage
178 underlying operations covering tables, sections, TOC, images, hyperlinks, etc. The Document API is comprehensive. Exposing these as individual tools would be wrong, but having them available as building blocks is correct.

---

## What's Wrong

### 1. The `action` discriminator pattern is confusing

Each intent tool multiplexes several operations behind an `action` parameter:
- `superdoc_edit` → insert, replace, delete, undo, redo (5 actions, different params each)
- `superdoc_format` → inline + paragraph formatting (different schemas per action)
- `superdoc_get_content` → info, blocks, text, markdown, html (5 actions)

The LLM must:
1. Pick the right intent tool (9 choices) — this part works
2. Pick the right `action` within that tool — this is where errors happen
3. Know which params apply to which action (varies per action) — frequent mistakes

The schema for one tool must describe ALL actions' parameters, with conditional requirements. LLMs frequently pass params meant for one action to another.

**Evidence:** In our experimental run, the model never picked the wrong tool (6 clear tools). With the SDK intent tools, the MCP server model frequently needed the 9KB system prompt to avoid action/param mismatches.

### 2. No batching

Every operation is a separate tool call. A contract redline that needs to:
- Search for 10 text passages → 10 `superdoc_search` calls
- Replace 8 of them → 8 `superdoc_edit` calls
- Add 6 comments → 6 `superdoc_comment` calls

That's **24 round trips** minimum. With our experimental tools: **4 calls** (open → find batch → edit batch → save).

Each round trip costs:
- Token overhead (tool call + response parsing)
- Latency (MCP protocol, API call, response serialization)
- Context window consumption
- Risk of the model losing track of what it was doing

### 3. Refs expire after mutations

The system prompt explicitly warns: "Refs expire after mutations — always re-search before next operation." This means:
1. Find text → get ref
2. Replace text → ref is now stale
3. Must re-find before next operation

This makes sequential edits quadratic in round trips. Our batch approach with the plan engine (`mutations.apply`) solves this — all operations execute atomically, refs remain valid within the batch.

### 4. No tracked change diff

When the SDK applies a replace with `changeMode: 'tracked'`, it replaces the entire matched text as one tracked change. In Word, this shows as the whole paragraph deleted + re-inserted. Real redlining requires word-level tracked changes where only the changed words are marked.

Our experimental approach computes a word-level LCS diff and creates targeted `text.rewrite`, `text.delete`, and `text.insert` steps for each changed region.

### 5. Complex nested schemas

Tool inputs require deeply nested objects:
```json
{
  "target": {
    "kind": "text",
    "blockId": "00000001",
    "range": { "start": 5, "end": 42 }
  },
  "within": {
    "kind": "block",
    "nodeType": "paragraph",
    "nodeId": "00000001"
  }
}
```

LLMs frequently get these wrong — missing `kind` discriminators, wrong nesting, mixing up `target` vs `within`. Our experimental tools use flat parameters (`block_id`, `range_start`, `range_end`) that LLMs handle without errors.

### 6. System prompt compensates for tool complexity

The 9KB system prompt is essentially documentation the LLM reads on every turn. It includes rules like:
- "Always start with `superdoc_get_content({action: "blocks"})`"
- "Search before editing"
- "Refs expire after mutations"
- "Split into logical phases: text edits first, then formatting"
- "Batch multi-step edits with `superdoc_mutations`"

These are workarounds for tool design problems. If the tools were designed for LLM consumption, the instructions would be minimal.

### 7. `superdoc_format` exposes too much surface area

The format intent tool bundles ~47 formatting operations (bold, italic, strike, underline, highlight, color, font_size, font_family, letter_spacing, position, vert_align, dstrike, small_caps, caps, shading, border, outline, shadow, emboss, imprint, char_scale, kerning, vanish, rtl, east_asian_layout, ligatures, stylistic_sets, etc.).

99% of LLM use cases need: bold, italic, underline, color, highlight, font size, font family. The remaining 40 properties add schema complexity that the model must parse on every call. Our experimental tool exposes 8 formatting params directly on the `edit_document` operation — that's all an LLM needs.

---

## What We Learned Building the Experimental Tools

### Principle 1: Fewer tools, more parameters per tool
6 tools beats 178. The LLM can reason about all 6 tools at once without confusion. Each tool does one clear thing.

### Principle 2: Batch by default
`find_in_document` accepts an array of patterns. `edit_document` accepts an array of operations. One call does the work of 10-20 sequential calls.

### Principle 3: Flat parameters
`block_id`, `range_start`, `range_end` instead of `{ kind: "text", blockId, range: { start, end } }`. LLMs get flat params right on the first try.

### Principle 4: Design for the workflow, not the API
Real workflows are: open → read → find → edit → save. The tools map 1:1 to these steps. The SDK tools map 1:1 to API operations, which isn't how users think.

### Principle 5: Safe defaults
`mode: "copy"` by default so the original file is never modified. New files auto-detect edit mode. The LLM doesn't need to think about this.

### Principle 6: Minimal instructions
The experimental MCP instructions are 2KB. The SDK system prompt is 9KB. Less instruction = less token overhead and less for the model to misinterpret.

### Principle 7: Timing instrumentation
Every tool response includes `_timing: { ms }`. This surfaces performance issues without requiring external monitoring.

---

## Comparison: Real-World Task Performance

### Contract Redlining (find issues, suggest changes as tracked changes, add comments)

| Metric | SDK Intent Tools (9 tools) | Experimental MCP (6 tools) |
|--------|---------------------------|---------------------------|
| Tool calls | ~24 (sequential find × N, edit × N, comment × N) | 5 (open, read, find batch, edit batch, save) |
| Error rate | Frequent (action/param mismatches, stale refs) | 0 on clean run |
| Tracked changes | Whole paragraph delete+insert | Word-level diff (LCS-based) |
| Comments | Separate `superdoc_comment` calls, TextAddress needed | Batched in `edit_document`, blockId+range from find |
| Batching | No — one operation per call | Yes — all patterns in one find, all edits in one call |
| Edit time | N × round trip latency | 66ms for 27 steps |

### Document Creation (build a proposal from scratch)

| Metric | SDK Intent Tools (9 tools) | Experimental MCP (6 tools) |
|--------|---------------------------|---------------------------|
| Tool calls | N × (`superdoc_create` + `superdoc_edit`) | 3 (open, edit with N inserts, save) |
| Markdown support | No (text only, must format separately) | Yes (ref-less inserts default to markdown) |
| Formatting | Separate `superdoc_format` calls per element | Handled by markdown parser on insert |

---

## Recommended Next Steps

### Phase 1: Immediate (apply learnings to MCP server)

1. **Ship the experimental MCP as the default** — replace the intent-dispatch MCP with the direct tools approach. 6 tools, proven with real workflows.

2. **Add table support** — the experimental tools don't cover tables yet. Add `op: "create_table"` and basic table operations to `edit_document`. Most LLM table use cases are: create table, add rows, set cell content.

3. **Add image support** — `op: "insert_image"` with a file path. Keep it simple.

### Phase 2: Apply learnings to the SDK intent tools

4. **Add batching to the intent tools** — `superdoc_search` should accept an array of patterns. `superdoc_mutations` should be the default path for multi-edit workflows, not an advanced escape hatch. Consider making `superdoc_edit` accept an operations array.

5. **Word-level diff as a first-class feature** — the diff logic (LCS tokenization → targeted text.rewrite/text.delete/text.insert steps) shouldn't live in the MCP tool handler. Move it into the Document API or SDK so `changeMode: 'tracked'` on any replace produces word-level tracked changes automatically.

6. **Simplify `superdoc_format`** — expose the 7 common properties (bold, italic, underline, strike, color, highlight, font_size, font_family) as flat params. Keep the full 47 properties accessible via `format.apply` for advanced use, but don't surface them all in the tool schema.

7. **Rethink the system prompt** — with better tools, the prompt should be <2KB. Just the workflow (open → read → find → edit → save) and key rules. The current 9KB prompt compensates for tool complexity that should be solved in tool design.

### Phase 3: Validation

8. **Build an eval suite for tool calling** — test LLMs against real document tasks (redline, create, format, comment) and measure:
   - Tool call count per task
   - Error rate (wrong tool, wrong params, retries)
   - Output quality (tracked changes granularity, comment placement)
   - Latency (end-to-end task completion time)

9. **Test with multiple models** — Sonnet, GPT-4o, Gemini. Different models handle tool calling differently. The simpler the tools, the more portable across models.

10. **Test with real customer documents** — the Brazilian contract was one test case. Need to validate with: English contracts, financial reports, medical documents, government forms, multilingual docs.

---

## Files Reference

| File | Purpose |
|------|---------|
| `apps/mcp/src/experimental.ts` | Experimental MCP entry point |
| `apps/mcp/src/tools/direct.ts` | 6 direct tools implementation |
| `apps/mcp/src/session-manager.ts` | Session lifecycle (open/save/close) |
| `packages/sdk/tools/catalog.json` | Current 178-tool catalog |
| `packages/sdk/tools/system-prompt.md` | Current 9KB system prompt |
| `packages/document-api/src/contract/operation-definitions.ts` | Single source of truth |
