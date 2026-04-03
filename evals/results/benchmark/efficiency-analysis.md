# SuperDoc MCP Efficiency Analysis

April 3, 2026. Based on NDA creation benchmark (45 tool calls, $0.70, 184s) and 3 parallel investigations.

---

## The Problem

Creating a simple NDA via SuperDoc MCP requires ~45 tool calls. Each heading needs 3-4 calls: create, search for ref, format color, format alignment. A 10-section document = 40+ calls just for headings.

## Root Causes (5)

### 1. System prompt tells agents to re-fetch blocks after create (unnecessary)

`superdoc_create` already returns a `ref` in its response (`create.types.ts:26`). But the system prompt (line 25, 39) and tool catalog descriptions explicitly say "Re-fetch blocks with superdoc_get_content to get a fresh ref before formatting." Agents follow this instruction and waste a call per block.

**Fix (documentation only):** Update system-prompt.md and catalog descriptions to say "Use the returned ref directly. Do NOT re-fetch blocks."
**Impact:** Saves ~10 calls for a typical NDA. Zero code changes.

### 2. superdoc_create doesn't accept formatting parameters

`CreateHeadingInput` only takes `text`, `level`, `placement`. No `alignment`, `color`, `bold`, `fontSize`. So creating a red, centered heading requires 3 calls: create + format inline (color) + format set_alignment (center).

**Fix:** Add optional `inline` and `alignment` params to create types. Apply formatting in the same ProseMirror transaction.
**Impact:** Collapses 3 calls per block to 1. Files: `create.types.ts`, `create-wrappers.ts`, catalog codegen.

### 3. superdoc_format requires two calls per block

Inline formatting (`action: "inline"`, uses text ref) and paragraph formatting (`action: "set_alignment"`, uses block target) are separate actions with incompatible target types. Each block needs two format calls.

**Fix:** Add a compound format action that accepts both inline + paragraph properties, or accept paragraph properties on the inline action.
**Impact:** Saves 1 call per formatted block.

### 4. superdoc_mutations can't mix create + format steps

The mutations batch tool supports `text.rewrite`, `text.insert`, `format.apply` but explicitly prohibits mixing them. It also doesn't support `create.heading` or `create.paragraph` as step types.

**Fix:** Add `block.create` step type. Allow create + format mixing in one call. The plan engine already supports both.
**Impact:** Enables 1-call document creation (open, mutations with 30 steps, save = 3 total calls).

### 5. Tool schemas are 56KB (~14,400 tokens)

The 12 SuperDoc tools total 57,725 bytes of JSON schema. `superdoc_mutations` alone is 21KB. This payload is sent with every LLM request. Plus user MCP servers (Linear: 43 tools, Excalidraw: 5) add more schema weight even with `settingSources: []`.

**Fix (short-term):** File a bug against Claude Agent SDK. `settingSources: []` should prevent loading user MCP servers but doesn't.
**Fix (long-term):** Reduce schema size. The mutations tool schema could be simplified with `$ref` definitions.

---

## What Competitors Do

### Google Docs: batchUpdate (the gold standard)

One POST with an array of requests. Create 30 paragraphs + style them = 1 API call. Requests are ordered, positions update as earlier requests apply, batch is atomic.

SuperDoc's `superdoc_mutations` follows this same model but with a limited vocabulary.

### Notion: append_block_children (bulk create)

One PATCH with up to 100 blocks including 2 levels of nesting. One call creates an entire section with headings, paragraphs, lists.

Maps directly to a hypothetical `superdoc_create_blocks` that accepts an array of block specs.

### Anthropic vendor skill: code generation (zero API)

The agent writes a Node.js script using `docx-js` that generates the entire document in one execution. Zero round-trips. Fast for creation but fragile for editing existing documents.

### MCP BatchIt: meta-aggregator

A generic MCP proxy that wraps multiple tool calls into one. Works without modifying tool APIs but can't handle cross-step dependencies.

### Other DOCX MCP servers

Office-Word-MCP-Server and docx-mcp both use the same one-call-per-operation pattern. Neither has batch tools. Nobody has solved this yet.

---

## Quick Win: superdoc_edit with type: "markdown"

The existing `superdoc_edit` tool already supports `action: "insert"` with `type: "markdown"`. This means an agent could insert an entire section in one call:

```
superdoc_edit({
  session_id, action: "insert", placement: "end",
  type: "markdown",
  value: "# 1. Definitions\n\n\"Confidential Information\" means...\n\n# 2. Obligations\n\n..."
})
```

The system prompt and tool descriptions don't mention this capability for document creation. Agents default to superdoc_create one-at-a-time because the prompt guides them there.

**Fix:** Update system prompt to recommend markdown insert for multi-block creation. Zero code changes.

---

## Prioritized Action Plan

| # | Change | Type | Calls saved | Effort |
|---|--------|------|:-:|:-:|
| 1 | Update prompt: "use returned ref, don't re-fetch" | Docs | ~10 per doc | Hours |
| 2 | Update prompt: "use markdown insert for multi-block creation" | Docs | ~20 per doc | Hours |
| 3 | Add `inline` + `alignment` to superdoc_create | Code | ~2 per block | Days |
| 4 | Allow create + format mixing in superdoc_mutations | Code | Enables 1-call creation | Days |
| 5 | Add `superdoc_create_blocks` bulk tool (Notion pattern) | Code | ~30 per doc | Week |
| 6 | Fix settingSources SDK bug | SDK bug report | ~4000 tokens/turn | N/A |
| 7 | Reduce mutations schema from 21KB | Code | ~5000 tokens/turn | Days |

Items 1-2 are pure documentation fixes that could cut tool calls by 60-70% immediately.
