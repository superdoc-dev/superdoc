# How to Read the Level 3 Benchmark Results

Live results: https://www.promptfoo.app/eval/eval-MNC-2026-04-02T11:28:13

## What this benchmark tests

We run real AI agents (Claude Code and Codex) on real DOCX tasks and compare how they perform **with and without SuperDoc**. Each agent runs under 4 different conditions:

| Condition | What the agent has access to |
|-----------|------------------------------|
| **baseline** | Nothing. The agent figures out DOCX on its own (typically: unzip, parse XML). |
| **vendor** | Anthropic's official DOCX skill. Teaches the agent to unzip and edit XML directly. |
| **superdoc-skill** | SuperDoc MCP server. Gives the agent structured tools: `superdoc_open`, `superdoc_get_content`, `superdoc_edit`, `superdoc_save`, `superdoc_close`. |
| **superdoc-cli** | SuperDoc CLI on PATH. The agent can call `superdoc get-text`, `superdoc find`, etc. via Bash. |

The prefix tells you which agent: **CC** = Claude Code, **Codex** = OpenAI Codex.

## Reading the Promptfoo UI

### Column headers (provider summary)

Each provider column shows aggregate stats:
- **100.00% passing (6/6 cases)** = all 6 tasks passed for this provider
- **correctness 100%** = all tasks returned the right answer
- **collateral 100%** = no unintended document damage
- **steps**, **latency**, **tokens** = raw numeric metrics (ignore the percentages, they're a Promptfoo display artifact)
- **path** = 1.00 means the agent used SuperDoc, 0.00 means raw approach

### Per-cell metrics

Click any cell to see details. The badge tags show:
- **correctness 1.00** = task answer was correct
- **collateral 1.00** = document wasn't damaged
- **steps 3.00** = agent took 3 tool calls
- **latency 21.00** = completed in 21 seconds
- **tokens 87710.00** = total tokens consumed (input + output)
- **path 1.00** = used SuperDoc tools / **path 0.00** = used raw XML

### The output JSON

Each cell shows a `_summary` line at the top:
```
superdoc-skill | 3 steps | 10s | 89k in + 0k out
```
This tells you at a glance: which path was used, how many steps, how long, and token usage.

Below that is the agent's response text and the full document text after any edits.

## The 6 tasks

| # | Type | Task | What we check |
|---|------|------|--------------|
| 1 | Read | Extract headings | Agent lists headings from a clinical trial report |
| 2 | Read | Extract entity names | Agent finds "Amazing Corp" and "TechCraft LLC" in an NDA |
| 3 | Read | Extract financial figures | Agent finds $25M and $150M thresholds in a memorandum |
| 4 | Edit | Replace entity name | Replace "Amazing" with "SuperDoc Inc" without touching "TechCraft" |
| 5 | Edit | Insert new section | Add a "Force Majeure" section at the end of the NDA |
| 6 | Edit | Fill placeholders | Replace "[Candidate Name]" with "Jane Smith" in an offer letter |

## What the metrics mean

| Metric | What it measures | Lower is better? |
|--------|-----------------|-----------------|
| **Pass rate** | Did the task succeed? | N/A (higher = better) |
| **Collateral** | Did the agent damage unrelated content? | N/A (100% = no damage) |
| **Steps** | How many tool calls the agent made | Yes |
| **Latency** | Wall-clock time to complete | Yes |
| **Tokens** | Total tokens consumed (cost driver) | Yes |
| **Path** | Which DOCX approach was used | N/A (just classification) |
| **Est. Cost** | Estimated API cost based on token pricing | Yes |

## Key findings (April 2, 2026)

**Pass rates:** All conditions achieve 100% except CC-superdoc-cli (83%, one edit task failed to save).

**Latency:** SuperDoc MCP matches baseline latency for both agents. The vendor skill is slightly faster. The CLI condition is slowest (agents run many discovery commands).

**Token usage:** SuperDoc MCP uses 2-3x more tokens than baseline because the MCP tool schemas are included in every turn. This is the main cost driver.

**Collateral safety:** 100% across the board. No condition caused unintended document damage.

**Bottom line:** SuperDoc MCP achieves the same pass rate as raw approaches with comparable latency, but uses more tokens. The value proposition is in document fidelity (SuperDoc preserves OOXML structure; raw unzip/sed does not), which this benchmark doesn't yet measure.

## Running it yourself

```bash
cd evals

# Full benchmark (48 runs, ~15 min)
pnpm run eval:benchmark

# Generate report
pnpm run eval:benchmark:report

# View in browser
pnpm run view

# Share results
npx promptfoo share
```
