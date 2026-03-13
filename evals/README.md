# SuperDoc AI Eval Suite

Tests whether LLMs correctly use SuperDoc's 193 document editing tools. Two levels: tool quality (does the model pick the right tool?) and execution (does the document actually change?).

## Quick start

```bash
cp .env.example .env           # add AI_GATEWAY_API_KEY (+ optional OPENAI_API_KEY)
pnpm run extract-tools         # extract tool definitions from SDK (run once after clone)
pnpm run eval                  # Level 1: tool quality (6 providers, 47 tests)
pnpm run eval:e2e              # Level 2: execution (3 providers, 21 real DOCX tests)
pnpm run eval:view             # open results in browser
```

## Two levels of testing

### Level 1: Tool Quality

Give the LLM a task and tool definitions. Check the response: did it pick the right tool with valid arguments? No document execution. Fast, cheap.

- **47 tests** across 9 categories (reading, mutations, formatting, structure, tables, comments, tracked changes, lists, hygiene)
- **6 providers** via Vercel AI Gateway: GPT-4o, GPT-4.1, GPT-4.1-mini, GPT-5.4, Claude Haiku 4.5, Gemini 2.5 Flash
- Config: `promptfooconfig.yaml`

### Level 2: Execution (E2E)

Run the full agent loop on real .docx files. Open document, LLM picks tools, CLI executes them. Assert the document content changed correctly.

- **21 tests** on 3 fixture documents (document.docx, memorandum.docx, table-doc.docx)
- **3 providers** via Vercel AI SDK + AI Gateway: GPT-5.4, Claude Haiku 4.5, Gemini 2.5 Pro
- Config: `promptfooconfig.e2e.yaml`
- Provider: `providers/superdoc-agent-gateway.mjs` (uses `generateText()` + `jsonSchema()` + `stepCountIs(10)`)

## Commands

| Command | What it does |
|---------|-------------|
| `pnpm run eval` | Level 1: tool quality (all providers) |
| `pnpm run eval:e2e` | Level 2: execution via AI Gateway |
| `pnpm run eval:openai` | Level 1 filtered to OpenAI models only |
| `pnpm run eval:view` | Open Promptfoo web UI with results |
| `pnpm run eval:export` | Run eval + save to `results/latest.json` |
| `pnpm run eval:repeat` | Run 3x, no cache (variance testing) |
| `pnpm run extract-tools` | Re-extract tools from SDK |
| `pnpm run baseline:save` | Snapshot current results for comparison |
| `pnpm run baseline:compare` | Compare two snapshots for regressions |

## Structure

```
evals/
  promptfooconfig.yaml              Level 1: tool quality (6 providers via AI Gateway)
  promptfooconfig.e2e.yaml          Level 2: execution (3 providers via AI Gateway)
  prompts/
    agent.txt                       System prompt (127 lines, tool categories + API guide)
    minimal.txt                     Minimal baseline prompt (for GDPval)
  tests/
    tool-quality.yaml               47 tests: tool selection + argument validation
    execution.yaml                  21 tests: real DOCX editing + content assertions
  providers/
    superdoc-agent-gateway.mjs      Vercel AI SDK provider (any model via config.modelId)
    superdoc-agent.mjs              OpenAI-only provider (legacy, direct API)
    utils.mjs                       Shared: SDK loading, file management, caching
  lib/
    checks.cjs                      18 assertion functions (noHallucinatedParams, validOpNames, etc.)
    normalize.cjs                   Cross-provider tool call format normalization
    extract.mjs                     SDK tool extraction script
    essential.json                  Extracted tool definitions (6 essential + discover_tools)
    save-baseline.mjs               Save versioned result snapshot
    compare-baselines.mjs           Compare two snapshots for regressions
  fixtures/
    document.docx                   Bullet lists (read, replace, insert)
    memorandum.docx                 Legal memo (dates, amounts, party names)
    table-doc.docx                  Tables (headers, cell content)
    contract.docx                   Long contract (future stress tests)
    comments-doc.docx               Document with comments (future)
  results/
    latest.json                     Most recent eval output
    .cache/                         Response cache (keyed by model+fixture+task)
    baselines/                      Versioned snapshots
    output/                         Saved DOCX files from keepFile tests
```

## Writing tests

### Tool quality test (Level 1)

```yaml
- description: 'Replace uses text.rewrite, not bare replace'
  metadata: { category: mutation }
  vars:
    task: 'Replace "old title" with "new title" in the document.'
  assert:
    - type: tool-call-f1
      value: [query_match, apply_mutations]
      threshold: 0.5
      metric: tool_selection
    - type: javascript
      value: file://lib/checks.cjs:validOpNames
      metric: argument_accuracy
    - type: javascript
      value: file://lib/checks.cjs:noHallucinatedParams
      metric: argument_accuracy
```

`tool-call-f1` checks tool selection (F1 score). `file://lib/checks.cjs:functionName` runs a specific assertion function.

### Execution test (Level 2)

```yaml
- description: 'Replace: $25M to $50M, $150M untouched'
  vars:
    fixture: memorandum.docx
    task: 'Replace "$25,000,000" with "$50,000,000".'
  assert:
    - type: contains
      value: '$50,000,000'
    - type: not-contains
      value: '$25,000,000'
    - type: contains
      value: '$150,000,000'
```

Every execution test asserts: new content exists, old content gone, unrelated content intact.

## Assertion functions (`lib/checks.cjs`)

| Function | What it checks |
|----------|---------------|
| `noHallucinatedParams` | No `doc` or `sessionId` in tool args |
| `validOpNames` | Ops are `text.rewrite`/`text.insert`/`text.delete`, not bare `replace`/`insert`/`delete` |
| `stepFields` | Every step has `op` and `where` |
| `noRequireAny` | Mutations use `require: "first"`, not `"any"` |
| `noMixedBatch` | No `text.rewrite` + `format.apply` in same batch |
| `correctFormatArgs` | `format.apply` uses `{inline: {bold: true}}`, not `{bold: true}` |
| `textSearchArgs` | `query_match` has `select.type: "text"` + `select.pattern` |
| `nodeSearchArgs` | `query_match` has `select.type: "node"` + correct `nodeType` |
| `noTextInsertForStructure` | Headings/paragraphs use standalone tools, not `text.insert` |
| `validDiscoverGroups` | `discover_tools` groups are valid names |
| `isTrackedMode` | Tracked changes set `changeMode: "tracked"` |
| `isNotTrackedMode` | Direct edits do not set `changeMode: "tracked"` |
| `atomicMultiStep` | Multi-step has `atomic: true` + 2+ steps |

Each function: `(output, context) => { pass, score, reason }` or `true` (skip).

## Adding a new model

Add a provider to any config YAML:

```yaml
# In promptfooconfig.yaml (Level 1)
- id: vercel:anthropic/claude-sonnet-4.6
  label: Claude Sonnet 4.6
  delay: 1000
  config:
    temperature: 0
    tools: file://lib/essential.json
    maxTokens: 1024

# In promptfooconfig.e2e.yaml (Level 2)
- id: file://providers/superdoc-agent-gateway.mjs
  label: Claude Sonnet 4.6 (Gateway)
  config:
    modelId: anthropic/claude-sonnet-4.6
```

## Notes

- All providers route through **Vercel AI Gateway** (`AI_GATEWAY_API_KEY`). One key, all models.
- Run `pnpm run generate:all` from repo root if `extract-tools` fails (SDK artifacts need regenerating).
- `prompts/agent.txt` is the canonical system prompt. Update it when changing tool documentation.
- Promptfoo caches responses. Changing assertions re-runs on cached data for free. Clear: `npx promptfoo cache clear`.
- `normalize.cjs` converts Anthropic `tool_use` and Google `functionCall` formats to OpenAI format so all assertions work across providers.
- Execution provider caches results in `results/.cache/` (keyed by model+fixture+task). Disable: `PROMPTFOO_CACHE_ENABLED=false`.
- Files prefixed with `__` (e.g. `__promptfooconfig.gdpval.yaml`) are disabled/legacy configs kept for reference.
