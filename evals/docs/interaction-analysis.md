# NDA Creation Interaction Analysis

Task: Create an NDA between Andrii Orlov and Golden State Warriors via Claude + SuperDoc MCP.

Result: 58 turns, $0.97, 217 seconds, 14/14 checks passed.

## Why 58 turns and $0.97 for one document?

### Problem 1: Massive tool list in context (43 Linear + 5 Excalidraw + 12 SuperDoc + built-ins)

The session loaded **69 MCP tools** from multiple servers:
- **43 Linear tools** (create_issue, get_project, delete_customer, etc.)
- **5 Excalidraw tools** (create_view, export, save_checkpoint, etc.)
- **12 SuperDoc tools** (the ones we actually need)
- **~20 built-in Claude Code tools** (Read, Write, Edit, Bash, Glob, etc.)

That's **~80 tools in context on every turn**. Each tool has a name, description, and JSON schema. This burns tokens on every API call because the full tool list is included in the system prompt.

The Claude Agent SDK loads ALL MCP servers configured on the user's machine, not just the one we specified via `mcpServers`. The `settingSources: ['project']` option that we set for some conditions causes it to load project-level MCP configs, which includes Linear, Excalidraw, Gmail, Google Calendar, and everything else configured in `~/.claude/`.

**Impact:** ~4,000+ tokens per turn just for tool definitions. Over 58 turns = ~230k tokens of pure tool definition overhead. At $3/M input tokens, that's ~$0.70 wasted on tool schemas alone.

### Problem 2: One tool call per turn

The Claude Agent SDK processes one tool call per assistant turn. Each create/format operation is a separate turn:

```
Turn 1: superdoc_open
Turn 2: superdoc_create (heading "NON-DISCLOSURE AGREEMENT")
Turn 3: superdoc_format (center alignment on heading)
Turn 4: superdoc_format (red color on heading)
Turn 5: superdoc_create (preamble paragraph)
Turn 6: superdoc_create (heading "1. Definitions")
Turn 7: superdoc_format (center on Definitions)
Turn 8: superdoc_format (red on Definitions)
...
```

Creating 8 headings = 8 create calls + 16 format calls (center + red each) = 24 turns just for headings. Add paragraphs, bold formatting, search, save, close = 58 turns total.

**Impact:** Each turn is a full API round-trip. 58 turns × 4s average = 232s. Each turn includes the full context (tool list + conversation history), so later turns process increasingly large input.

### Problem 3: No batching of operations

The SuperDoc MCP tools accept one operation at a time. The `superdoc_mutations` tool supports batched steps, but the agent doesn't use it because:
1. Each `superdoc_create` is a separate tool (not a mutation step)
2. `superdoc_format` requires a `ref` from a previous search, so it can't be batched with create
3. The agent builds the document sequentially, one element at a time

**Impact:** A hypothetical "batch create" tool that accepts an array of sections would reduce 24 heading+format turns to 1.

### Problem 4: Search-before-format pattern

To format a heading red, the agent must:
1. Search for the heading text → get a ref
2. Call superdoc_format with that ref

This doubles the number of turns for formatting. Each heading needs 2 extra turns (search + format for color) + 1 for alignment = 3 formatting turns per heading.

**Impact:** 8 headings × 3 formatting turns = 24 turns just for heading formatting.

### Problem 5: Context window growth

The conversation grows with each turn. By turn 58, the context includes:
- System prompt with 80 tool definitions
- 58 assistant messages with reasoning
- 58 tool call results (each containing the MCP response JSON)
- The CLAUDE.md project instructions

Later turns process much more input than earlier turns, driving up token count exponentially.

**Impact:** The last 10 turns consume more tokens than the first 30 combined.

## Token breakdown (estimated)

| Component | Tokens per turn | × Turns | Total |
|-----------|:-:|:-:|:-:|
| Tool definitions (80 tools) | ~4,000 | 58 | 232,000 |
| Conversation history (growing) | ~500 avg | 58 | 29,000 |
| Tool results (MCP responses) | ~200 avg | 58 | 11,600 |
| Agent reasoning | ~100 avg | 58 | 5,800 |
| **Total estimated** | | | **~280,000** |

Actual cost: $0.97 (matches ~280k input + 5.5k output at Sonnet pricing).

## Recommendations

### Short-term (harness)
1. **Don't load user settings.** Remove `settingSources: ['project']` or set to empty. Only load the SuperDoc MCP server, not Linear/Excalidraw/Gmail.
2. **Increase maxTurns but set maxBudgetUsd.** The agent needs 40-60 turns for complex tasks. Use budget as the real limit.

### Medium-term (SuperDoc MCP)
3. **Add a batch create tool.** Accept an array of {type, level, text} and create all sections in one call.
4. **Add a batch format tool.** Accept an array of {ref, format} and apply all formatting in one call.
5. **Return refs from create.** When superdoc_create returns, include the ref of the created element so the agent can format it immediately without searching.

### Long-term (architecture)
6. **Document template tool.** A single `superdoc_create_from_template` that accepts a markdown or structured document spec and creates the entire document in one call.
7. **Reduce tool count.** Merge related tools (e.g., superdoc_create + superdoc_format → superdoc_create with optional formatting).
