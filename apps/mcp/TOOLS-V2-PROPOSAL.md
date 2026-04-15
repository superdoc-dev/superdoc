# SuperDoc Tools v2 — Redesign Proposal

Replace the 9 intent tools with 5 purpose-driven tools. Every tool does one thing. No overlap.

## The 5 Tools

### `superdoc_read`

Read document content in different formats.

```typescript
superdoc_read({
  format: "markdown"     // "markdown" | "text" | "html" | "info" | "blocks"
})
```

**Replaces:** `superdoc_get_content` (renamed for clarity, same functionality)

---

### `superdoc_find`

Search the document. Batch multiple patterns in one call.

```typescript
superdoc_find({
  pattern: ["indemnification", "liability", "termination"],  // string | string[]
  mode: "contains",          // "contains" | "regex"
  case_sensitive: false,
  limit: 10                  // per pattern
})
```

**Returns per match:**
```json
{
  "ref": "text:v4:...",
  "matched_text": "indemnification",
  "block_id": "ABC123",
  "range_start": 5,
  "range_end": 22,
  "snippet": "...shall provide indemnification against..."
}
```

All targeting info is flat — `ref` for edits, `block_id`/`range_start`/`range_end` for comments. No nested objects.

**Replaces:** `superdoc_search` (with batch support + flat output)

---

### `superdoc_edit`

All document mutations in one tool. Pass an array of operations. They execute atomically.

```typescript
superdoc_edit({
  operations: [
    // Replace text
    { op: "replace", ref: "text:v4:...", text: "new text" },

    // Insert text (with ref = positioned, without ref = append at end)
    { op: "insert", text: "# New Heading\n\nParagraph.", ref: "text:v4:...", position: "after" },
    { op: "insert", text: "Appended at end." },

    // Delete text
    { op: "delete", ref: "text:v4:..." },

    // Format text
    { op: "format", ref: "text:v4:...", bold: true, color: "#ff0000" },

    // Add comment (anchored to text)
    { op: "comment", text: "This clause is vague.", block_id: "ABC123", range_start: 5, range_end: 42 },

    // Accept/reject tracked change
    { op: "accept", id: "tc-123" },
    { op: "reject", id: "tc-456" },
  ],

  // Optional: apply replace/insert/delete as tracked changes (redline mode)
  tracked: true,

  // Optional: for word-level tracked changes, include matched_text on replace ops
  // (the tool auto-diffs and creates granular tracked changes)
})
```

**Operations:**

| op | Required fields | Description |
|----|----------------|-------------|
| `replace` | `ref`, `text` | Replace matched text. Add `matched_text` for word-level tracked changes. |
| `insert` | `text` | Append at end (markdown by default). With `ref` + `position`: insert before/after. |
| `delete` | `ref` | Delete matched text. |
| `format` | `ref` + at least one style prop | Apply formatting. Props: `bold`, `italic`, `underline`, `strike`, `color`, `highlight`, `font_family`, `font_size`. |
| `comment` | `text`, `block_id`, `range_start`, `range_end` | Add Word comment anchored to text range. |
| `accept` | `id` | Accept a tracked change. |
| `reject` | `id` | Reject a tracked change. |

**Key behaviors:**
- All plan-engine ops (replace/insert/delete/format) execute atomically via `mutations.apply` — refs remain valid across operations
- Comments execute after plan ops
- `tracked: true` makes replace/insert/delete appear as tracked changes
- `matched_text` on replace + `tracked: true` → word-level diff (LCS algorithm) → only changed words are marked

**Replaces:** `superdoc_edit` + `superdoc_format` + `superdoc_comment` + `superdoc_mutations` + `superdoc_track_changes` (decide part)

---

### `superdoc_create`

Create structural elements. For building document structure — not for editing existing content.

```typescript
// Create a heading
superdoc_create({ type: "heading", text: "Section Title", level: 2 })

// Create a paragraph
superdoc_create({ type: "paragraph", text: "Body text here." })

// Create a list
superdoc_create({ type: "list", kind: "bullet", items: ["Item 1", "Item 2", "Item 3"] })

// Create a table
superdoc_create({ type: "table", rows: 3, columns: 2, at: { ... } })
```

**Replaces:** `superdoc_create` + `superdoc_list` (create part). List manipulation (indent/outdent/set_type) moves to `superdoc_edit` as ops.

---

### `superdoc_save`

Save and lifecycle.

```typescript
superdoc_save()                    // save to default path
superdoc_save({ path: "/out.docx" })  // save to specific path
```

**Replaces:** Save portion of lifecycle tools.

---

## Migration Path

### Phase 1: Ship v2 tools alongside v1

Both tool sets available. Consumers choose which to use. The MCP server offers a flag:

```json
{ "toolVersion": "v2" }   // or "v1" for backward compat
```

### Phase 2: Default to v2

New consumers get v2. Existing consumers keep v1 until they opt in.

### Phase 3: Deprecate v1

Remove v1 tools after migration period.

---

## Mapping: v1 → v2

| v1 Tool | v1 Action | v2 Tool | v2 Op/Param |
|---------|-----------|---------|-------------|
| `superdoc_get_content` | `info` | `superdoc_read` | `format: "info"` |
| `superdoc_get_content` | `text` | `superdoc_read` | `format: "text"` |
| `superdoc_get_content` | `markdown` | `superdoc_read` | `format: "markdown"` |
| `superdoc_get_content` | `blocks` | `superdoc_read` | `format: "blocks"` |
| `superdoc_search` | (text) | `superdoc_find` | `pattern: "..."` |
| `superdoc_search` | (node) | `superdoc_find` | `type: "node"` |
| `superdoc_edit` | `insert` | `superdoc_edit` | `op: "insert"` |
| `superdoc_edit` | `replace` | `superdoc_edit` | `op: "replace"` |
| `superdoc_edit` | `delete` | `superdoc_edit` | `op: "delete"` |
| `superdoc_edit` | `undo` | `superdoc_edit` | `op: "undo"` |
| `superdoc_edit` | `redo` | `superdoc_edit` | `op: "redo"` |
| `superdoc_format` | `inline` | `superdoc_edit` | `op: "format"` |
| `superdoc_format` | `set_style` | `superdoc_edit` | `op: "set_style"` |
| `superdoc_format` | `paragraph_*` | `superdoc_edit` | `op: "paragraph_format"` |
| `superdoc_comment` | `create` | `superdoc_edit` | `op: "comment"` |
| `superdoc_comment` | `list` | `superdoc_read` | `format: "comments"` |
| `superdoc_comment` | `delete` | `superdoc_edit` | `op: "delete_comment"` |
| `superdoc_track_changes` | `list` | `superdoc_read` | `format: "tracked_changes"` |
| `superdoc_track_changes` | `decide` | `superdoc_edit` | `op: "accept"` / `op: "reject"` |
| `superdoc_mutations` | (batch) | `superdoc_edit` | `operations: [...]` |
| `superdoc_create` | `paragraph` | `superdoc_create` | `type: "paragraph"` |
| `superdoc_create` | `heading` | `superdoc_create` | `type: "heading"` |
| `superdoc_list` | `insert` | `superdoc_create` | `type: "list"` |
| `superdoc_list` | `indent/outdent` | `superdoc_edit` | `op: "list_indent"` / `op: "list_outdent"` |

---

## System Prompt (v2)

```
You are a document editing assistant.

Tools:
- superdoc_read — get document content (markdown, text, info, blocks, comments, tracked_changes)
- superdoc_find — search text (pass array of patterns for batch). Returns ref + block_id + range for targeting.
- superdoc_edit — all changes: replace, insert, delete, format, comment, accept/reject. Pass operations array for batch.
- superdoc_create — structural elements: paragraphs, headings, lists, tables
- superdoc_save — persist to disk

Workflow: read → find (batch) → edit (batch) → save

Tips:
- Batch all searches in one superdoc_find call.
- Batch all edits in one superdoc_edit call (they execute atomically).
- For redlining: set tracked=true and include matched_text on replace ops.
- For comments: use block_id + range_start + range_end from find results.
```

~500 bytes. Down from 9KB.

---

## Why 5 tools, not 6 or 9

**5 maps to the user's mental model:**

1. I want to **read** the document → `superdoc_read`
2. I want to **find** something → `superdoc_find`
3. I want to **change** something → `superdoc_edit`
4. I want to **add structure** → `superdoc_create`
5. I want to **save** → `superdoc_save`

There's no ambiguity. "Should I use `superdoc_format` or `superdoc_edit`?" → gone. "Should I use `superdoc_mutations` or individual calls?" → gone. "Should I use `superdoc_comment` or `superdoc_edit`?" → gone.

The model never picks the wrong tool because each tool covers a distinct intent.

---

## Expected Eval Results (v2)

| Task | v1 (9 tools) | v2 (5 tools) |
|------|-------------|-------------|
| Find & replace | 4 calls, PASS | 3 calls, PASS |
| Add comments | 27 calls, FAIL | 3 calls, PASS |
| Redline | 12 calls, FAIL | 3 calls, PASS |
| Create document | 5 calls, PASS | 3 calls, PASS |
| Read & summarize | 1 call, PASS | 1 call, PASS |
| Format text | 5 calls, PASS | 3 calls, PASS |

**6/6 pass. 3 calls average. ~5x fewer tokens than v1.**
