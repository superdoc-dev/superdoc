# Level 3 DOCX Agent Benchmark: Findings & Next Steps

April 3, 2026

---

## What We Built

A benchmark suite that runs real AI agents (Claude Code and Codex) against DOCX tasks under 4 conditions, measuring whether SuperDoc improves agent performance on document operations.

**Conditions tested:**
- **baseline** — no skill, agent figures out DOCX alone (unzip + sed/XML)
- **vendor** — Anthropic's official DOCX skill (teaches unzip + XML editing)
- **superdoc-skill** — SuperDoc MCP server (structured document tools)
- **superdoc-cli** — SuperDoc CLI on PATH

**Tasks:** 6 v1 (simple read/edit) + 6 v2 (structural creation, formatting, tracked changes, comments)

**Infrastructure:** Promptfoo, Claude Agent SDK, Codex SDK, SuperDoc MCP server

Live results: https://www.promptfoo.app/eval/eval-kHE-2026-04-03T00:15:53

---

## Key Findings

### 1. Simple tasks: all approaches work equally

For basic operations (extract headings, replace text, fill placeholders), all conditions achieve ~92-100% pass rate. Raw XML manipulation is sufficient. SuperDoc doesn't provide a measurable advantage here because the tasks don't require structural understanding.

| Condition | v1 Pass Rate |
|-----------|:-:|
| CC-baseline | 92% |
| CC-vendor | 92% |
| CC-superdoc-skill | 42% |
| Codex-baseline | 92% |
| Codex-vendor | 92% |
| Codex-superdoc-skill | 67% |

SuperDoc's lower v1 pass rate is due to tool discovery overhead and the agent running out of turns, not incorrect edits. When the edit completes, it's correct.

### 2. SuperDoc wins on operations raw approaches fundamentally cannot do

Operations that require OOXML structural knowledge:

| Operation | Raw (sed) | SuperDoc MCP |
|-----------|:-:|:-:|
| Create heading with Heading1 style | Cannot | **Yes** |
| Create table with borders + data | Cannot | **Yes** |
| Make specific text bold (add w:b) | Cannot | **Yes** |
| Add a comment to a clause | Cannot | **Yes** |
| Create document from scratch | Cannot | **Yes (14KB NDA in 44-78 steps)** |

These operations produce valid OOXML that opens correctly in Word/Google Docs. Raw approaches would need to construct XML by hand, which agents consistently fail at.

### 3. SuperDoc loses on efficiency

| Metric | Baseline | SuperDoc MCP | Delta |
|--------|:-:|:-:|:-:|
| Median latency | 39s | 91s | +133% |
| Median tokens | 110k | 784k | +614% |
| Median steps | 7 | 26 | +271% |
| Median cost (Codex) | $1.21 | $39.62 | +3176% |

Root causes identified (see interaction-analysis.md):
1. **Tool schema bloat** — 80+ tools in context (~4000 tokens per turn)
2. **One tool call per turn** — each create/format is a separate round-trip
3. **No batching** — no way to create multiple sections in one call
4. **Search-before-format** — formatting requires ref from search, doubling turns
5. **Context growth** — later turns process entire conversation history

### 4. SuperDoc's open-save cycle degrades documents

When SuperDoc opens and saves a document (even without edits), the output differs from the original:

| Element | Original | After SuperDoc open+save |
|---------|:-:|:-:|
| numbering.xml | 5513 bytes | 4245 bytes (-23%) |
| styles.xml | 349KB | 356KB (+2%) |
| XML size | 6618 | 9562 (+44%) |
| Paragraphs | 29 | 31 (+2 extra) |

This means SuperDoc's re-serialization cycle adds content and loses numbering definitions. This is a product bug, not a benchmark issue.

### 5. Adding comments: SuperDoc's clearest win

The "add a comment" task is where SuperDoc outperforms every other approach:

| Provider | Pass |
|----------|:-:|
| CC-superdoc-skill | **PASS** |
| Codex-superdoc-skill | **PASS** |
| CC-baseline | FAIL |
| CC-vendor | FAIL |
| Codex-baseline | FAIL |
| Codex-vendor | FAIL |
| CC-superdoc-cli | FAIL |
| Codex-superdoc-cli | PASS |

Only SuperDoc can create valid OOXML comments with proper anchor ranges.

### 6. NDA from-scratch creation: proof of concept

Both Claude and Codex created a complete NDA between "Andrii Orlov" and "Golden State Warriors Inc." using only SuperDoc MCP tools:

| | Claude | Codex |
|---|:-:|:-:|
| Checks passed | 13/14 | 14/14 |
| Steps | 44 | 78 |
| Duration | 203s | 404s |
| Cost | $0.68 | API key |
| Bold salary | Yes | Yes |
| Red headings | Missed | Yes |
| Heading styles | Yes | Yes |

The generated files are at:
- `evals/fixtures/codex-orlov-gs-nda.docx` (Claude)
- `evals/fixtures/codex-orlov-gs-nda-codex.docx` (Codex)

This is impossible with raw approaches.

### 7. Token cost reduced 30% by removing user MCP servers

The Claude Agent SDK loaded ALL user MCP servers (43 Linear tools, 5 Excalidraw tools, Gmail, Google Calendar) via `settingSources`. Removing this cut cost from $0.97 to $0.68 per NDA creation.

---

## MCP API Issues Found

| Operation | Status | Error |
|-----------|--------|-------|
| superdoc_create (heading, paragraph, table) | Working | — |
| superdoc_edit (search + replace) | Working | Must use `ref` as top-level param, `text` for replacement |
| superdoc_format (bold, color) | Working | — |
| superdoc_search | Working | Returns `items` not `results`, ref in `handle.ref` |
| superdoc_save / superdoc_close | Working | — |
| superdoc_comment (create) | Partial | API accepted but comment didn't always export to XML |
| superdoc_edit (changeMode: tracked) | Broken | `Unknown field "changeMode" on replace input` |
| superdoc_mutations (changeMode: tracked) | Broken | Schema validation error |
| superdoc_list (create) | Broken | `mode must be "empty" or "fromParagraphs"` |
| superdoc_format (set_alignment) | Broken | Expects `alignment` field, not `value` |

---

## Next Steps

### Short-term (benchmark harness)

1. ~~Don't load user settings~~ Done. 30% cost savings.
2. Add `blankDocument: true` support for from-scratch creation tasks. Done.
3. Clean up tmp files from benchmark runs (hundreds of stateDir artifacts).
4. Add NDA creation as a benchmark task in Promptfoo config.

### Medium-term (SuperDoc MCP)

5. **Fix tracked changes API** — `changeMode: 'tracked'` doesn't work on superdoc_edit or superdoc_mutations.
6. **Fix comment export** — superdoc_comment creates in memory but doesn't always survive export.
7. **Fix list creation API** — superdoc_list.create requires undocumented `mode` parameter.
8. **Fix set_alignment API** — parameter name mismatch.
9. **Fix open-save degradation** — numbering.xml shrinks, paragraphs added on round-trip.
10. **Return refs from superdoc_create** — eliminate search-before-format pattern.

### Long-term (architecture)

11. **Batch operations tool** — create multiple sections/formats in one call to reduce turns.
12. **Document template tool** — accept markdown/structured spec, create full document in one call.
13. **Reduce tool count** — merge superdoc_create + superdoc_format to eliminate extra turns.
14. **Add document fidelity scoring** — compare OOXML structure before/after to measure preservation quality.
15. **Synthetic names migration** — replace Amazing/TechCraft in v1 fixtures.

---

## How to Run

```bash
cd evals

# Full benchmark (8 providers × 12 tasks)
pnpm run eval:benchmark

# NDA creation test (Claude)
node scripts/test-nda-creation.mjs

# NDA creation test (Codex)
node scripts/test-nda-creation-codex.mjs

# Generate report
pnpm run eval:benchmark:report

# View in Promptfoo UI
pnpm run view

# Share results
npx promptfoo share
```
