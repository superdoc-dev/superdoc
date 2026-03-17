# SuperDoc AI Eval Suite

Promptfoo-based evaluation suite for SuperDoc document-editing tools.

It has two layers:

- Tool quality: does the model choose the right tool with the right arguments?
- Execution: does the document actually change correctly when the full agent loop runs?

## Quick start

Run these commands from the repo root:

```bash
pnpm install
pnpm run generate:all                                  # if packages/sdk/tools/*.json are missing
cp evals/.env.example evals/.env
pnpm --filter @superdoc-testing/evals run extract-tools
pnpm --filter @superdoc-testing/evals run eval:openai  # Level 1
pnpm --prefix apps/cli run build                       # required for Level 2
pnpm --filter @superdoc-testing/evals run eval:e2e    # Level 2
pnpm --filter @superdoc-testing/evals run view
```

Edit `evals/.env` before running:

- `OPENAI_API_KEY` for `eval` and `eval:openai`
- `AI_GATEWAY_API_KEY` for `eval:e2e`
- `ANTHROPIC_API_KEY` for `analyze`
- `GOOGLE_API_KEY` only if you enable a native Google provider in `promptfooconfig.yaml`

If you prefer to work inside `evals/`, the same scripts are available as `pnpm run <script>`.

## Two levels of testing

### Level 1: Tool quality

Give the model a task plus a small essential tool bundle. Check whether it chooses the right tools and arguments. No real document execution.

- **31 tests** across 12 categories
- **2 prompts**: `prompts/agent.txt` and `prompts/minimal.txt`
- **3 active providers** via native Promptfoo OpenAI providers: GPT-4o, GPT-4.1-mini, GPT-5.4
- **186 evaluations per full run**: 31 tests x 2 prompts x 3 providers
- Config: `promptfooconfig.yaml`
- Tool bundle: `lib/essential.json` (generated, gitignored)

### Level 2: Execution (E2E)

Run the full agent loop on real `.docx` fixtures. Open the document, let the model pick tools, execute them through the SDK/CLI, and assert on the resulting document text.

- **21 tests** on 3 fixture documents: `document.docx`, `memorandum.docx`, `table-doc.docx`
- **3 providers** via Vercel AI SDK + AI Gateway: GPT-5.4, Claude Haiku 4.5, Gemini 2.5 Pro
- Config: `promptfooconfig.e2e.yaml`
- Provider: `providers/superdoc-agent-gateway.mjs`

## Commands

| Command | What it does |
|---------|--------------|
| `pnpm run extract-tools` | Generate `lib/essential.json` from SDK tool catalogs |
| `pnpm run eval` | Level 1 across all active providers in `promptfooconfig.yaml` |
| `pnpm run eval:openai` | Level 1 filtered to `GPT-*` providers; currently equivalent to `eval` |
| `pnpm run eval:e2e` | Level 2 execution tests via AI Gateway |
| `pnpm run eval:repeat` | Repeat Level 1 three times with Promptfoo cache disabled |
| `pnpm run view` | Open the Promptfoo results UI |
| `pnpm run analyze` | Generate an HTML analysis dashboard from `results/latest.json` |
| `pnpm run eval:analyze` | Run Level 1, then generate the HTML analysis dashboard |
| `pnpm run baseline:save <label>` | Save `results/latest.json` as a versioned baseline |
| `pnpm run baseline:compare <a> <b>` | Compare two saved baselines |

## Structure

```text
evals/
  promptfooconfig.yaml              Level 1 tool-quality config
  promptfooconfig.e2e.yaml          Level 2 execution config
  prompts/
    agent.txt                       Main system prompt
    minimal.txt                     Minimal baseline prompt
  tests/
    tool-quality.yaml               31 tool-selection / argument-shape tests
    execution.yaml                  21 real DOCX editing tests
  providers/
    superdoc-agent-gateway.mjs      AI SDK + AI Gateway execution provider
    superdoc-agent.mjs              Legacy direct OpenAI execution provider
    vercel-tools.mjs                Capture-only AI SDK provider for tool-call experiments
    utils.mjs                       Shared SDK loading, file management, caching
  lib/
    checks.cjs                      Assertion helpers for tool-call validation
    normalize.cjs                   Cross-provider tool call normalization
    extract.mjs                     SDK tool extraction script
    essential.json                  Generated tool bundle: 7 essential tools + discover_tools
    save-baseline.mjs               Save versioned result snapshots
    compare-baselines.mjs           Compare baseline snapshots
    analyze-results.mjs             Generate HTML analysis from eval output
  fixtures/
    document.docx                   Bullet-list fixture
    memorandum.docx                 Legal memo fixture
    table-doc.docx                  Table fixture
    contract.docx                   Longer contract fixture
    comments-doc.docx               Comment fixture
  results/
    latest.json                     Latest Level 1 output
    latest-openai.json              Latest Level 1 filtered OpenAI output
    latest-e2e.json                 Latest Level 2 output
    analysis.html                   Generated analysis dashboard
    .cache/                         Provider cache
    baselines/                      Saved snapshots
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

`tool-call-f1` checks tool selection. `file://lib/checks.cjs:functionName` runs a named assertion helper.

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

Execution tests should assert all three:

- New content exists
- Old content is gone
- Unrelated content is still intact

## Assertion helpers (`lib/checks.cjs`)

| Function | What it checks |
|----------|----------------|
| `noHallucinatedParams` | No non-empty `doc` or `sessionId` arguments |
| `validOpNames` | Mutation ops use `text.rewrite` / `text.insert` / `text.delete` |
| `stepFields` | Every mutation step has `op` and `where` |
| `noRequireAny` | Mutations do not use `require: "any"` |
| `noMixedBatch` | Text edits and `format.apply` are not mixed in one batch |
| `correctFormatArgs` | `format.apply` nests formatting under `args.inline` |
| `textSearchArgs` | `query_match` uses a valid text selector |
| `nodeSearchArgs` | `query_match` uses a valid node selector |
| `nodeSearchOrBlocksList` | Listing nodes uses `query_match` or `blocks_list` correctly |
| `noTextInsertForStructure` | Headings/paragraphs use standalone create tools, not `text.insert` |
| `validDiscoverGroups` | `discover_tools` loads valid group names |
| `isTrackedMode` | Tracked changes use `changeMode: "tracked"` |
| `isNotTrackedMode` | Direct edits do not use tracked mode |
| `atomicMultiStep` | Multi-step mutations are atomic and grouped together |
| `usesDeleteOp` | The mutation includes a delete-style op |
| `usesRewriteOp` | The mutation includes `text.rewrite` |

## Adding a new model

### Level 1: native Promptfoo providers

Add another native provider to `promptfooconfig.yaml`:

```yaml
- id: openai:chat:gpt-4.1
  label: GPT-4.1
  config:
    temperature: 0
    seed: 42
    tools: file://lib/essential.json
    tool_choice: required
    timeout: 30000
```

`promptfooconfig.yaml` also includes commented native Anthropic and Google examples.

### Level 2: AI Gateway execution providers

Add another entry to `promptfooconfig.e2e.yaml`:

```yaml
- id: file://providers/superdoc-agent-gateway.mjs
  label: Claude Sonnet 4.6 (Gateway)
  config:
    modelId: anthropic/claude-sonnet-4.6
```

## Notes

- `lib/essential.json` is generated and gitignored. If it is missing, run `pnpm run extract-tools`.
- If `extract-tools` fails because `packages/sdk/tools/*.json` are missing, run `pnpm run generate:all` from the repo root first.
- Level 1 currently uses native OpenAI Promptfoo providers. Level 2 uses a custom provider that routes through Vercel AI Gateway.
- `pnpm run view` is the correct script name. There is no `eval:view` script in the current package.
- `pnpm run analyze` reads `results/latest.json`, writes `results/analysis.html`, and requires `ANTHROPIC_API_KEY`.
- Promptfoo caches model responses. Clear Promptfoo's cache with `npx promptfoo cache clear`.
- The custom execution provider also caches results in `results/.cache/`. Disable it with `PROMPTFOO_CACHE_ENABLED=false`.

## Exit codes and troubleshooting

- Promptfoo exits non-zero when tests fail. By default it uses pass-rate threshold `100` and failed-test exit code `100`, so a run can write results successfully and still return exit status `100`.
- To treat a failing eval run as a successful shell command, set either `PROMPTFOO_PASS_RATE_THRESHOLD=0` or `PROMPTFOO_FAILED_TEST_EXIT_CODE=0`.
- If Promptfoo crashes with a missing `better-sqlite3` binding, approve and rebuild native packages:

```bash
pnpm approve-builds
pnpm rebuild better-sqlite3
```
