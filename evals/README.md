# SuperDoc AI Eval Suite

Promptfoo-based evaluation suite for SuperDoc's document-editing AI tools. Tests that AI models select the right tools, pass correct arguments, and produce correct document edits when run end-to-end.

## Architecture

```
                          ┌─────────────────────────────────────────────────────────────┐
                          │                      Eval Suite                             │
                          │                                                             │
  ┌────────────────┐      │   ┌──────────────────────┐    ┌──────────────────────────┐  │
  │                │      │   │  LEVEL 1: Tool Quality│    │  LEVEL 2: Execution (E2E)│  │
  │   promptfoo    │      │   │                       │    │                          │  │
  │   (runner)     │◄─────│   │  "Does the model pick │    │  "Does the edit actually │  │
  │                │      │   │   the right tool?"    │    │   change the document?"  │  │
  └───────┬────────┘      │   │                       │    │                          │  │
          │               │   │  4 tests              │    │  51 tests (20+31)        │  │
          │               │   │  tool-quality.yaml    │    │  execution.yaml          │  │
          ▼               │   │                       │    │  customer-workflows.yaml │  │
  ┌────────────────┐      │   └──────────┬────────────┘    └────────────┬─────────────┘  │
  │  SDK Tool      │      │              │                              │                │
  │  Definitions   │      │              │                              │                │
  │  (9 tools)     │      │              ▼                              ▼                │
  └────────────────┘      │   ┌──────────────────┐          ┌────────────────────────┐   │
                          │   │ Native OpenAI    │          │ Vercel AI SDK +        │   │
                          │   │ Providers        │          │ AI Gateway Provider    │   │
                          │   │                  │          │                        │   │
                          │   │ Tool calls only  │          │ Opens real DOCX files  │   │
                          │   │ No execution     │          │ Runs full agent loop   │   │
                          │   └──────────────────┘          │ Asserts on doc content │   │
                          │                                 └───────────┬────────────┘   │
                          │                                             │                │
                          └─────────────────────────────────────────────│────────────────┘
                                                                       │
                                                              ┌────────▼────────┐
                                                              │  SuperDoc CLI   │
                                                              │  + SDK Runtime  │
                                                              │                 │
                                                              │  Opens .docx    │
                                                              │  Dispatches     │
                                                              │  tool calls     │
                                                              │  Returns text   │
                                                              └─────────────────┘
```

## Level 2 execution flow

```
  Test YAML                    Provider                         SuperDoc
  ─────────                    ────────                         ────────
  ┌──────────────┐
  │ fixture:     │
  │   nda.docx   │─────┐
  │ task:        │     │
  │   "Replace   │     │      ┌─────────────────────────────────────────────────┐
  │    Iqidis    │     │      │                                                 │
  │    with Irys"│     └─────►│  1. Copy fixture to temp file                  │
  │              │            │  2. Open doc via SuperDoc CLI                   │
  │ assert:      │            │  3. Build tools from sdk.chooseTools()          │
  │  - contains  │            │  4. ┌─────────── Agent Loop ──────────────┐    │
  │    "Irys"    │            │     │                                      │    │
  │  - not-has   │            │     │  LLM ──► tool call ──► SDK dispatch  │    │
  │    "Iqidis"  │            │     │   ▲                        │         │    │
  │  - traceOk   │            │     │   └──── tool result ◄──────┘         │    │
  └──────────────┘            │     │                                      │    │
        │                     │     │  (repeats until done or 10 steps)    │    │
        │                     │     └──────────────────────────────────────┘    │
        │                     │  5. Extract final documentText                 │
        │                     │  6. Build trace [{tool, args, ok}]             │
        │                     │  7. Return JSON output                         │
        │                     └──────────────────────┬──────────────────────────┘
        │                                            │
        │              ┌─────────────────────────────┘
        │              │
        │              ▼
        │      { documentText: "...",
        │        trace: [{step, toolCalls, toolResults}],
        │        toolCalls: [{tool, args, ok}],
        └──────► stepCount: 3 }
               │
               ▼
        Assertions run against this JSON:
          ✓ documentText includes "Irys Inc."
          ✓ documentText excludes "Iqidis"
          ✓ All tool calls succeeded (traceAllOk)
```

## Quick start

```bash
pnpm install
cp evals/.env.example evals/.env    # add your API keys
pnpm --filter @superdoc-testing/evals run eval:openai  # Level 1
pnpm --filter @superdoc-testing/evals run eval:e2e     # Level 2
pnpm --filter @superdoc-testing/evals run view         # open results UI
```

Tool artifacts are **automatically regenerated** before each eval run via pre-hooks:

- **Level 1** (`eval`, `eval:openai`): regenerates SDK tool catalogs on the fast path; falls back to full bootstrap if prerequisites are missing.
- **Level 2** (`eval:e2e`): runs full `generate:all` (doc-api, CLI contract, SDK), then builds SDK + CLI.

Edit `evals/.env` before running:

| Variable | Required for |
|----------|-------------|
| `OPENAI_API_KEY` | `eval`, `eval:openai` |
| `AI_GATEWAY_API_KEY` | `eval:e2e` |
| `ANTHROPIC_API_KEY` | `analyze` |
| `GOOGLE_API_KEY` | Only if you enable a native Google provider |

## Tool surface

Both levels target the same **9 grouped public tools** from the SDK:

| Tool | Purpose |
|------|---------|
| `superdoc_search` | Find text or nodes in the document |
| `superdoc_get_content` | Read document content (text, markdown, html, info) |
| `superdoc_edit` | Insert, replace, delete text, undo/redo |
| `superdoc_format` | Apply inline and paragraph formatting |
| `superdoc_create` | Create new paragraphs or headings |
| `superdoc_list` | Create and manipulate bullet/numbered lists |
| `superdoc_comment` | Create, update, delete, and list comments |
| `superdoc_track_changes` | Review and resolve tracked changes |
| `superdoc_mutations` | Execute multi-step atomic edits in a single batch |

Level 1 loads tools from the generated SDK bundle (`tools.openai.json`). Level 2 calls `sdk.chooseTools()` at runtime. The system prompt comes from `packages/sdk/tools/system-prompt.md`.

Both levels resolve `@superdoc-dev/sdk` from the **local workspace** (`workspace:*`), never from npm. See [Local SDK resolution](#local-sdk-resolution).

## Two levels of testing

### Level 1: Tool quality

Give the model a task plus the full tool bundle. Check whether it picks the right tools with correct arguments. No document execution.

- **4 tests** in `tests/tool-quality.yaml`
- **2 prompts**: `prompts/sdk-agent.cjs` (SDK system prompt + task) and `prompts/minimal.txt`
- **3 providers**: GPT-4o, GPT-4.1-mini, GPT-5.4 (native OpenAI)
- Config: `promptfooconfig.yaml`

### Level 2: Execution (E2E)

Run the full agent loop on real `.docx` fixtures. Open the document, let the model pick tools, execute them through the SDK/CLI, and assert on the resulting document.

- **51 tests** across two test files:
  - `tests/execution.yaml` (20 tests): core editing mechanics (read, replace, insert, multi-step, export)
  - `tests/customer-workflows.yaml` (31 tests): real-world workflows from production customers
- **9 fixture documents** (see [Fixtures](#fixtures))
- **1 active provider**: GPT-5.4 via Vercel AI SDK + AI Gateway (Claude Haiku 4.5 and Gemini 2.5 Pro available as commented entries)
- Config: `promptfooconfig.e2e.yaml`

## Fixtures

| Fixture | Size | Content | Used by |
|---------|------|---------|---------|
| `document.docx` | 85 KB | Bullet list document | execution.yaml |
| `memorandum.docx` | 17 KB | Legal memo with financial figures ($25M, $150M) | execution.yaml |
| `table-doc.docx` | 15 KB | Tables with component data | execution.yaml |
| `contract.docx` | 26 KB | Longer legal contract | (available) |
| `comments-doc.docx` | 8 KB | Document with existing comments | customer-workflows.yaml |
| `nda.docx` | 38 KB | Mutual NDA (parties, indemnification, $500K cap) | customer-workflows.yaml |
| `lease-agreement.docx` | 38 KB | Commercial lease with rent escalation table | customer-workflows.yaml |
| `report-with-formatting.docx` | 38 KB | Clinical trial report with enrollment table, citations | customer-workflows.yaml |
| `employment-offer.docx` | 38 KB | Offer letter with salary, equity, 5+ placeholders | customer-workflows.yaml |

Fixtures are generated by `scripts/create-fixtures.py` (requires `python-docx`). Run it to regenerate:

```bash
python3 evals/scripts/create-fixtures.py
```

## Customer workflow tests

The `customer-workflows.yaml` tests are mapped from real production customer use cases across 10 SuperDoc customers. Each test exercises a documented workflow against a domain-specific fixture.

| Category | Tests | Customer use cases covered |
|----------|-------|---------------------------|
| **A. Contract modification** | 6 | Clause rewrite (Clauze), entity rename (Irys), placeholder fill, governing law change, bullet add, liability cap |
| **B. Document Q&A** | 4 | Lease assignment rights (Orbital), rent escalation, enrollment status (Tryal), compensation details |
| **C. Drafting / generation** | 4 | Glossary (Athena), disclaimer (Lighthouse), signing bonus section, follow-up paragraph |
| **D. Comments & annotations** | 3 | Comment on clause (Torke), comment on notice period, list comments |
| **E. Track changes / redlining** | 3 | Tracked edits on term duration (Clauze), salary (AcuityMD), rent with table guard |
| **F. Table operations** | 3 | Read table (Tryal), update cell, update rent schedule (Reavant) |
| **G. Multi-step compound** | 4 | Fill 5 placeholders, rename + notice, search + comment + edit, table + paragraph |
| **H. Formatting** | 2 | Replace terminology in section, bold on search result (Tryal) |
| **I. Cross-domain compound** | 2 | Counter-offer (3 changes), full contract preparation (4 operations) |

## Commands

| Command | What it does |
|---------|--------------|
| `pnpm run eval` | Level 1 across all active providers |
| `pnpm run eval:openai` | Level 1 filtered to GPT providers |
| `pnpm run eval:e2e` | Level 2 execution tests via AI Gateway |
| `pnpm run eval:repeat` | Level 1 three times, cache disabled |
| `pnpm run view` | Open the Promptfoo results UI |
| `pnpm run analyze` | Generate HTML dashboard from `results/latest.json` |
| `pnpm run eval:analyze` | Run Level 1, then generate the dashboard |
| `pnpm run baseline:save <label>` | Save `results/latest.json` as a versioned baseline |
| `pnpm run baseline:compare <a> <b>` | Compare two saved baselines |

## Structure

```text
evals/
  promptfooconfig.yaml              Level 1 tool-quality config
  promptfooconfig.e2e.yaml          Level 2 execution config
  prompts/
    sdk-agent.cjs                   SDK system prompt + task injection
    minimal.txt                     Minimal baseline prompt
  tests/
    tool-quality.yaml               4 tool-selection / argument-shape tests
    execution.yaml                  20 core DOCX editing tests
    customer-workflows.yaml         31 customer workflow tests
  scripts/
    prepare-local-sdk.mjs           Pre-run pipeline: generate, build, verify
    create-fixtures.py              Generate domain-specific DOCX fixtures
  providers/
    superdoc-agent-gateway.mjs      AI SDK + AI Gateway execution provider
    superdoc-agent.mjs              Legacy direct OpenAI execution provider
    vercel-tools.mjs                Capture-only AI SDK provider
    utils.mjs                       Shared SDK loading, file management, caching
  lib/
    checks.cjs                      Assertion helpers for tool-call validation
    normalize.cjs                   Cross-provider tool call normalization
    sdk-tools.cjs                   Promptfoo adapter for SDK tool bundle
    save-baseline.mjs               Save versioned result snapshots
    compare-baselines.mjs           Compare baseline snapshots
    analyze-results.mjs             Generate HTML analysis from eval output
  fixtures/
    document.docx                   Bullet-list document
    memorandum.docx                 Legal memo with financial figures
    table-doc.docx                  Table document
    contract.docx                   Longer contract
    comments-doc.docx               Document with comments
    nda.docx                        Mutual NDA (generated)
    lease-agreement.docx            Commercial lease (generated)
    report-with-formatting.docx     Clinical trial report (generated)
    employment-offer.docx           Offer letter (generated)
  results/
    latest.json                     Latest Level 1 output
    latest-openai.json              Latest Level 1 OpenAI output
    latest-e2e.json                 Latest Level 2 output
    analysis.html                   Generated analysis dashboard
    .cache/                         Provider cache (SDK fingerprint-keyed)
    baselines/                      Saved snapshots
    output/                         Saved DOCX files from keepFile tests
```

## Writing tests

### Tool quality test (Level 1)

```yaml
- description: 'Replace uses superdoc_search + superdoc_edit'
  metadata: { category: mutation }
  vars:
    task: 'Replace "old title" with "new title" in the document.'
  assert:
    - type: tool-call-f1
      value: [superdoc_search, superdoc_edit]
      threshold: 0.5
      metric: tool_selection
    - type: javascript
      value: file://lib/checks.cjs:usesRewriteOp
      metric: argument_accuracy
```

`tool-call-f1` checks tool selection. `file://lib/checks.cjs:functionName` runs a named assertion helper.

### Execution test (Level 2)

```yaml
- description: 'NDA: global entity name replacement'
  vars:
    fixture: nda.docx
    keepFile: true
    task: 'Replace "Iqidis Corp" with "Irys Inc." everywhere in the document.'
  assert:
    - type: javascript
      value: |
        const d = JSON.parse(output);
        const t = d.documentText || '';
        if (t.includes('Iqidis'))
          return { pass: false, score: 0, reason: 'Old name still present' };
        if (!t.includes('Irys Inc.'))
          return { pass: false, score: 0, reason: 'New name missing' };
        if (!t.includes('TechVentures'))
          return { pass: false, score: 0, reason: 'Collateral: other party removed' };
        return { pass: true, score: 1, reason: 'Entity names replaced' };
    - type: javascript
      value: file://lib/checks.cjs:traceAllOk
    - type: javascript
      value: file://lib/checks.cjs:traceLog
```

Execution tests assert on the JSON output from the provider, which contains:

| Field | Type | Description |
|-------|------|-------------|
| `documentText` | string | Final document text after all edits |
| `trace` | array | Per-step log: `[{step, toolCalls, toolResults, finishReason}]` |
| `toolCalls` | array | Flat list: `[{tool, args, ok, error?}]` |
| `stepCount` | number | Total agent loop steps |
| `outputFile` | string | Path to saved DOCX (when `keepFile: true`) |

Best practice for assertions:

1. **New content exists** (the edit worked)
2. **Old content is gone** (the replacement was complete)
3. **Unrelated content is intact** (no collateral damage)
4. **Trace is clean** (`traceAllOk` for no tool errors, `traceLog` for debugging)

### Metric annotations

Add `metric: <name>` to any assertion to track it separately in the Promptfoo UI:

```yaml
- type: javascript
  value: |
    // check step count
    const d = JSON.parse(output);
    if (d.stepCount > 6) return { pass: false, score: 0, reason: 'Too many steps' };
    return { pass: true, score: 1, reason: `${d.stepCount} steps` };
  metric: efficiency
```

Common metrics: `tool_usage`, `efficiency`, `multi_step`, `sequence`.

## Assertion helpers (`lib/checks.cjs`)

### Hygiene

| Function | What it checks |
|----------|----------------|
| `noHallucinatedParams` | No non-empty `doc` or `sessionId` arguments |
| `validOpNames` | Mutation ops use `text.rewrite` / `text.insert` / `text.delete` |
| `stepFields` | Every mutation step has `op` and `where` |
| `noRequireAny` | Mutations do not use `require: "any"` |
| `noMixedBatch` | Text edits and `format.apply` are not mixed in one batch |
| `correctFormatArgs` | Format operations have valid nested `inline` payload |

### Tool-specific

| Function | What it checks |
|----------|----------------|
| `textSearchArgs` | `superdoc_search` uses a valid text selector |
| `nodeSearchArgs` | `superdoc_search` uses a valid node selector |
| `usesGetContentText` | `superdoc_get_content` with `action: "text"` |
| `noTextInsertForStructure` | Headings/paragraphs use `superdoc_create`, not `text.insert` |
| `usesCreateAction` | `superdoc_create` with the expected `action` value |
| `usesCommentCreate` | `superdoc_comment` with `action: "create"` |
| `usesEditUndo` | `superdoc_edit` with `action: "undo"` |
| `usesRewriteOp` | Call includes a rewrite/replace operation |
| `usesDeleteOp` | Call includes a delete-style operation |

### Workflow

| Function | What it checks |
|----------|----------------|
| `isTrackedMode` | Tracked changes use `changeMode: "tracked"` |
| `isNotTrackedMode` | Direct edits do not use tracked mode |
| `atomicMultiStep` | Multi-step mutations are atomic and grouped |

### Execution trace (Level 2)

| Function | What it checks |
|----------|----------------|
| `traceAllOk` | All tool calls in the trace succeeded |
| `traceLog` | Logs the full tool sequence (always passes, for debugging) |
| `traceUsesTool` | A specific tool was called at some point |
| `traceToolOrder` | Tool A was called before tool B |
| `traceStepCount` | Total steps within a maximum |
| `docContains` | `documentText` includes a string |
| `docNotContains` | `documentText` excludes a string |

## Adding a new model

### Level 1: native Promptfoo providers

Add a provider to `promptfooconfig.yaml`:

```yaml
- id: openai:chat:gpt-4.1
  label: GPT-4.1
  config:
    temperature: 0
    seed: 42
    tools: file://lib/sdk-tools.cjs:get_tools
    tool_choice: required
    timeout: 30000
```

### Level 2: AI Gateway execution providers

Add an entry to `promptfooconfig.e2e.yaml`:

```yaml
- id: file://providers/superdoc-agent-gateway.mjs
  label: Claude Sonnet 4.6 (Gateway)
  config:
    modelId: anthropic/claude-sonnet-4.6
```

The AI Gateway routes to any supported model. Just change `modelId`.

## Local SDK resolution

Evals depend on `@superdoc-dev/sdk` via `workspace:*`, so pnpm always resolves to the local workspace package at `packages/sdk/langs/node/`. A prepare script (`scripts/prepare-local-sdk.mjs`) runs as a pre-hook before each eval. It:

1. **Regenerates** artifacts (full `generate:all` for Level 2, SDK-only for Level 1)
2. **Builds** the SDK and CLI (Level 2 only)
3. **Verifies** all expected output files exist
4. **Guards** that `@superdoc-dev/sdk` resolves from the workspace
5. **Validates** the tool surface matches the 9 expected grouped tools

The provider cache (`results/.cache/`) includes an **SDK fingerprint**, a hash of tool catalogs, system prompt, SDK `dist/` tree, and CLI binary. Switching branches or editing local artifacts automatically invalidates stale entries.

```bash
# Skip preparation during rapid iteration (when builds are current)
SKIP_PREPARE=1 pnpm run eval:e2e

# Test the published npm SDK instead of local workspace
# Change dependency in evals/package.json: "workspace:*" → "1.2.3"
```

## Notes

- `pnpm run view` opens the Promptfoo web UI with the latest results.
- `pnpm run analyze` reads `results/latest.json` and writes `results/analysis.html` (requires `ANTHROPIC_API_KEY`).
- Promptfoo caches model responses. Clear with `npx promptfoo cache clear`.
- The execution provider also caches in `results/.cache/`. Disable with `PROMPTFOO_CACHE_ENABLED=false`.
- `eval:repeat` and `eval:analyze` bypass pre-hooks. Run `node scripts/prepare-local-sdk.mjs` manually before these if needed.

## Exit codes and troubleshooting

- Promptfoo exits non-zero when tests fail (default pass-rate threshold `100`, exit code `100`).
- To treat failing evals as success: `PROMPTFOO_PASS_RATE_THRESHOLD=0` or `PROMPTFOO_FAILED_TEST_EXIT_CODE=0`.
- Missing `better-sqlite3` binding:

```bash
pnpm approve-builds
pnpm rebuild better-sqlite3
```
