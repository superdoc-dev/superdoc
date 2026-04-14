# SuperDoc AI Eval Suite

Promptfoo-based evaluation suite for SuperDoc's document-editing AI tools. Tests that AI models select the right tools, pass correct arguments, and produce correct document edits.

## Three Levels of Testing

| Level | What it tests | Config | Tests | Providers |
|-------|--------------|--------|-------|-----------|
| **1: Tool quality** | Does the model pick the right tool? | `config/tool-quality.promptfoo.yaml` | 4 | 3 (GPT native) |
| **2: Execution (E2E)** | Does the edit change the document correctly? | `config/execution.promptfoo.yaml` | 51 | GPT-5.4, Claude Haiku, Gemini via Gateway |
| **3: Agent benchmark** | How do coding agents compare on DOCX tasks? | `config/benchmark.promptfoo.yaml` | 12 tasks x 8 conditions | Claude Code + Codex |

## Quick Start

```bash
pnpm install
cp evals/.env.example evals/.env   # add your API keys
```

```bash
pnpm run eval                      # Level 1: tool selection
pnpm run eval:e2e                  # Level 2: execution
pnpm run eval:benchmark            # Level 3: agent benchmark
pnpm run view                      # open Promptfoo results UI
```

### Environment Variables

| Variable | Required for |
|----------|-------------|
| `OPENAI_API_KEY` | Level 1, Level 3 (Codex) |
| `AI_GATEWAY_API_KEY` | Level 2 |
| `ANTHROPIC_API_KEY` | Level 3 (Claude Code), `analyze` |

## Level 1: Tool Quality

Give the model a task plus the full tool bundle. Check whether it picks the right tools with correct arguments. No document execution.

- **4 tests** in `suites/tool-quality/tests/tool-quality.yaml`
- **2 prompts**: `suites/tool-quality/prompts/sdk-agent.cjs` (SDK system prompt) and `minimal.txt`
- **3 providers**: GPT-4o, GPT-4.1-mini, GPT-5.4

```bash
pnpm run eval              # all providers
pnpm run eval:openai       # GPT only
```

## Level 2: Execution (E2E)

Run the full agent loop on real `.docx` fixtures. Open the document, let the model pick tools, execute them through the SDK, and assert on the resulting document.

- **51 tests**: `suites/execution/tests/execution.yaml` (20) + `customer-workflows.yaml` (31)
- **9 fixture documents** (see [Fixtures](#fixtures))
- **Provider**: GPT-5.4 via Vercel AI SDK + AI Gateway

```bash
pnpm run eval:e2e
```

## Level 3: Agent Benchmark

Compare real coding agents (Claude Code, OpenAI Codex) on DOCX tasks under 4 conditions.

### Conditions

| Condition | What the agent gets |
|-----------|-------------------|
| `baseline` | No DOCX tools, agent figures it out (unzip, sed, python-docx) |
| `baseline-with-docx-skill` | Anthropic's vendor DOCX skill |
| `superdoc-mcp` | SuperDoc MCP server (superdoc_* tools) |
| `superdoc-cli` | SuperDoc CLI on PATH |

### Prerequisites

```bash
cd apps/mcp && pnpm run build      # build MCP server
cd apps/cli && pnpm run build      # build CLI
```

### Running

```bash
pnpm run eval:benchmark            # full run (96 runs)
pnpm run eval:benchmark:claude     # Claude Code only
pnpm run eval:benchmark:codex      # Codex only
pnpm run eval:benchmark:report     # generate summary report
```

### Metrics

| Metric | Description |
|--------|-------------|
| correctness | Did the edit produce the expected content? |
| collateral | Was unrelated content preserved? |
| fidelity | OOXML structural quality (styles, tables, formatting) |
| path | Did the agent use SuperDoc tools? (required for superdoc conditions) |
| steps | Agent loop step count (tracked) |
| latency | Wall-clock time (tracked) |
| tokens | Token usage (tracked) |

### Interpreting Results

Results output to `artifacts/benchmark-runs/`. Run `pnpm run eval:benchmark:report` to generate `summary.md` and `raw.csv`. Use `pnpm run view` to open the Promptfoo web UI.

Key comparison: superdoc-mcp vs baseline pass rates. Fidelity score is the differentiator — raw XML approaches fail structural checks (comments, styled headings, tracked changes).

## Tool Surface

Both levels target the same **9 grouped public tools** from the SDK:

| Tool | Purpose |
|------|---------|
| `superdoc_search` | Find text or nodes in the document |
| `superdoc_get_content` | Read document content (text, markdown, html, info) |
| `superdoc_edit` | Insert, replace, delete text, undo/redo |
| `superdoc_format` | Apply inline and paragraph formatting |
| `superdoc_create` | Create new paragraphs, headings, or tables |
| `superdoc_list` | Create and manipulate bullet/numbered lists |
| `superdoc_comment` | Create, update, delete, and list comments |
| `superdoc_track_changes` | Review and resolve tracked changes |
| `superdoc_mutations` | Execute multi-step atomic edits in a single batch |

## Fixtures

| Fixture | Content | Used by |
|---------|---------|---------|
| `blank.docx` | Blank document template | benchmark-v2 |
| `nda.docx` | Mutual NDA (parties, indemnification, $500K cap) | benchmark, benchmark-v2, customer-workflows |
| `employment-offer.docx` | Offer letter with salary, equity, placeholders | benchmark, customer-workflows |
| `report-with-formatting.docx` | Clinical trial report with tables, citations | benchmark, customer-workflows |
| `lease-agreement.docx` | Commercial lease with rent escalation table | customer-workflows |
| `document.docx` | Bullet list document | execution |
| `memorandum.docx` | Legal memo with financial figures | execution, benchmark |
| `table-doc.docx` | Tables with component data | execution |
| `comments-doc.docx` | Document with existing comments | customer-workflows |

Fixtures are in `fixtures/docs/`.

## Commands

| Command | Level | What it does |
|---------|-------|--------------|
| `pnpm run eval` | 1 | All active providers |
| `pnpm run eval:openai` | 1 | GPT providers only |
| `pnpm run eval:repeat` | 1 | 3x, no cache |
| `pnpm run eval:e2e` | 2 | E2E execution tests |
| `pnpm run eval:benchmark` | 3 | Full benchmark (96 runs) |
| `pnpm run eval:benchmark:claude` | 3 | Claude Code conditions only |
| `pnpm run eval:benchmark:codex` | 3 | Codex conditions only |
| `pnpm run eval:benchmark:report` | 3 | Generate summary.md + raw.csv |
| `pnpm run view` | - | Open Promptfoo results UI |
| `pnpm run analyze` | - | HTML dashboard from Level 1 |
| `pnpm run baseline:save <label>` | - | Save versioned baseline |
| `pnpm run baseline:compare` | - | Compare baselines |
| `pnpm run clean` | - | Remove temp files + caches |
| `pnpm run test` | - | Unit tests for checks + utils |

## Structure

```
evals/
  config/
    tool-quality.promptfoo.yaml       Level 1 config
    execution.promptfoo.yaml          Level 2 config
    benchmark.promptfoo.yaml          Level 3 config

  suites/
    tool-quality/
      tests/tool-quality.yaml         4 tool-selection tests
      prompts/sdk-agent.cjs           SDK system prompt
      prompts/minimal.txt             Minimal baseline prompt
    execution/
      tests/execution.yaml            20 core editing tests
      tests/customer-workflows.yaml   31 customer workflow tests
    benchmark/
      tests/agent-benchmark-v2.yaml   12 benchmark tasks (current)
      tests/agent-benchmark.yaml      6 benchmark tasks (v1)
      reports/benchmark-report.mjs    Report generator

  providers/
    claude-code-agent.mjs             Claude Code agent (Level 3)
    codex-agent.mjs                   Codex agent (Level 3)
    superdoc-agent-gateway.mjs        AI SDK + Gateway (Level 2)
    superdoc-agent.mjs                Legacy direct OpenAI provider
    vercel-tools.mjs                  Capture-only AI SDK provider
    mcp-stdio-wrapper.mjs             MCP stdio transport wrapper

  shared/
    checks.cjs                        Assertion helpers (all levels)
    checks.test.mjs                   Tests for checks
    normalize.cjs                     Cross-provider normalization
    docx-fidelity.mjs                 OOXML structural checks
    docx-fidelity.test.mjs            Tests for fidelity
    sdk-tools.cjs                     Promptfoo adapter for SDK tools
    provider-utils.mjs                Shared SDK loading, caching
    provider-utils.test.mjs           Tests for utils
    analyze-results.mjs               HTML analysis generator
    save-baseline.mjs                 Save versioned snapshots
    compare-baselines.mjs             Compare baselines

  fixtures/
    docs/                             All .docx test documents
    vendor/vendor-docx-skill.md       Anthropic's DOCX skill for baseline condition

  scripts/
    prepare-local-sdk.mjs             Pre-run build pipeline
    smoke-test-benchmark.mjs          Quick benchmark sanity check
    test-nda-creation-claude.mjs      Manual NDA test (Claude)
    test-nda-creation-codex.mjs       Manual NDA test (Codex)
    review-docx-outputs.mjs           Inspect saved DOCX outputs

  docs/                               Hand-written benchmark analysis
    findings.md                       Key findings from benchmark runs
    efficiency-analysis.md            Efficiency root causes + action plan
    interaction-analysis.md           Detailed agent trace analysis
    HOW-TO-READ-RESULTS.md            Guide to interpreting results

  artifacts/                          Generated output (gitignored)
    latest/                           Level 1 + 2 results
    benchmark-runs/                   Level 3 results
    baselines/                        Saved snapshots
    cache/                            Provider cache
```

## Writing Tests

### Level 1 (tool selection)

```yaml
- description: 'Replace uses superdoc_search + superdoc_edit'
  vars:
    task: 'Replace "old title" with "new title" in the document.'
  assert:
    - type: tool-call-f1
      value: [superdoc_search, superdoc_edit]
      threshold: 0.5
      metric: tool_selection
    - type: javascript
      value: file://../shared/checks.cjs:usesRewriteOp
      metric: argument_accuracy
```

### Level 2 (execution)

```yaml
- description: 'NDA: global entity name replacement'
  vars:
    fixture: nda.docx
    keepFile: true
    task: 'Replace "Amazing Corp" with "Irys Inc." everywhere.'
  assert:
    - type: javascript
      value: |
        const d = JSON.parse(output);
        const t = d.documentText || '';
        if (t.includes('Amazing'))
          return { pass: false, score: 0, reason: 'Old name still present' };
        if (!t.includes('Irys Inc.'))
          return { pass: false, score: 0, reason: 'New name missing' };
        return { pass: true, score: 1, reason: 'Entity names replaced' };
    - type: javascript
      value: file://../shared/checks.cjs:traceAllOk
```

### Level 3 (benchmark)

```yaml
- description: 'Edit: replace entity name'
  vars:
    fixture: nda.docx
    keepFile: true
    task: 'Replace every instance of "Amazing" with "SuperDoc Inc".'
  assert:
    - type: javascript
      value: |
        const d = JSON.parse(output);
        if (!d.documentText?.includes('SuperDoc Inc'))
          return { pass: false, score: 0, reason: 'SuperDoc Inc not found' };
        return { pass: true, score: 1 };
    - type: javascript
      metric: fidelity
      value: file://../shared/checks.cjs:benchmarkFidelity
    - type: javascript
      metric: path
      value: file://../shared/checks.cjs:benchmarkPath
```

## Assertion Helpers (`shared/checks.cjs`)

### Hygiene

| Function | What it checks |
|----------|----------------|
| `noHallucinatedParams` | No non-empty `doc` or `sessionId` arguments |
| `validOpNames` | Mutation ops use `text.rewrite` / `text.insert` / `text.delete` |
| `stepFields` | Every mutation step has `op` and `where` |
| `noMixedBatch` | Text edits and `format.apply` are not mixed in one batch |

### Tool-specific

| Function | What it checks |
|----------|----------------|
| `textSearchArgs` | `superdoc_search` uses a valid text selector |
| `nodeSearchArgs` | `superdoc_search` uses a valid node selector |
| `usesGetContentText` | `superdoc_get_content` with `action: "text"` |
| `usesCreateAction` | `superdoc_create` with the expected `action` value |
| `usesCommentCreate` | `superdoc_comment` with `action: "create"` |

### Execution trace (Level 2)

| Function | What it checks |
|----------|----------------|
| `traceAllOk` | All tool calls in the trace succeeded |
| `traceLog` | Logs the full tool sequence (always passes, for debugging) |
| `traceUsesTool` | A specific tool was called at some point |
| `traceToolOrder` | Tool A was called before tool B |

### Benchmark (Level 3)

| Function | What it checks |
|----------|----------------|
| `benchmarkPath` | Did the agent use SuperDoc tools? Fails if required but not used |
| `benchmarkFidelity` | OOXML structural checks (styles, tables, formatting, comments) |
| `benchmarkDiff` | XML diff ratio between fixture and output (informational) |
| `benchmarkSteps` | Reports step count as metric |
| `benchmarkLatency` | Reports wall-clock time as metric |
| `benchmarkTokens` | Reports token usage as metric |

## Local SDK Resolution

Evals depend on `@superdoc-dev/sdk` via `workspace:*`, so pnpm always resolves to the local workspace package. A prepare script (`scripts/prepare-local-sdk.mjs`) runs as a pre-hook before each eval:

1. Regenerates SDK tool catalogs (Level 1) or full `generate:all` (Level 2)
2. Builds the SDK and CLI (Level 2 only)
3. Verifies all expected output files exist
4. Validates the tool surface matches the 9 expected grouped tools

The provider cache (`artifacts/cache/`) includes an SDK fingerprint. Switching branches or editing artifacts invalidates stale entries.

```bash
SKIP_PREPARE=1 pnpm run eval:e2e   # skip build during rapid iteration
```

## Troubleshooting

- **Promptfoo exits non-zero when tests fail**: set `PROMPTFOO_PASS_RATE_THRESHOLD=0` to suppress.
- **Missing `better-sqlite3` binding**: run `pnpm approve-builds && pnpm rebuild better-sqlite3`.
- **Codex SDK not found**: run `cd evals && pnpm install`.
- **MCP server not built**: run `cd apps/mcp && pnpm run build`.
- **CLI not built**: run `cd apps/cli && pnpm run build`.
- **Stale cache**: run `pnpm run clean` to clear all temp files and caches.
