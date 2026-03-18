# SuperDoc AI Eval Suite

Promptfoo-based evaluation suite for SuperDoc document-editing tools.

It has two layers:

- Tool quality: does the model choose the right tool with the right arguments?
- Execution: does the document actually change correctly when the full agent loop runs?

## Quick start

Run these commands from the repo root:

```bash
pnpm install
cp evals/.env.example evals/.env
pnpm --filter @superdoc-testing/evals run eval:openai  # Level 1
pnpm --filter @superdoc-testing/evals run eval:e2e     # Level 2
pnpm --filter @superdoc-testing/evals run view
```

Tool artifacts are **automatically regenerated** before each eval run via pre-hooks:

- **Level 1** (`eval`, `eval:openai`): regenerates SDK tool catalogs on the fast path, and automatically falls back to a one-time full bootstrap if prerequisites are missing
- **Level 2** (`eval:e2e`): runs full `generate:all` (doc-api → CLI contract → SDK), then builds SDK + CLI

You do not need to build or bootstrap manually unless you are running `eval:repeat` or `eval:analyze` (which bypass pre-hooks). On a fresh clone, the first Level 1 run may take longer because it auto-bootstraps the doc-api contract before switching back to the fast path.

Edit `evals/.env` before running:

- `OPENAI_API_KEY` for `eval` and `eval:openai`
- `AI_GATEWAY_API_KEY` for `eval:e2e`
- `ANTHROPIC_API_KEY` for `analyze`
- `GOOGLE_API_KEY` only if you enable a native Google provider in `promptfooconfig.yaml`

If you prefer to work inside `evals/`, the same scripts are available as `pnpm run <script>`.

## Tool surface

Both levels use the same **9 grouped public tools** from the SDK:

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

Level 1 loads the generated SDK provider bundle through a thin Promptfoo adapter that returns the bundle's `tools` array. Level 2 uses `sdk.chooseTools()`. The system prompt comes from `packages/sdk/tools/system-prompt.md`.

Both levels resolve `@superdoc-dev/sdk` from the **local workspace** (`workspace:*`), not from npm. A prepare script (`scripts/prepare-local-sdk.mjs`) runs automatically before each eval to regenerate tool artifacts, build the SDK/CLI, and verify the tool surface. See [Local SDK resolution](#local-sdk-resolution) for details.

## Two levels of testing

### Level 1: Tool quality

Give the model a task plus the full public tool bundle. Check whether it chooses the right tools and arguments. No real document execution.

- **28 tests** across 11 categories
- **2 prompts**: `prompts/sdk-agent.cjs` (SDK system prompt + task) and `prompts/minimal.txt`
- **3 active providers** via native Promptfoo OpenAI providers: GPT-4o, GPT-4.1-mini, GPT-5.4
- Config: `promptfooconfig.yaml`
- Tool bundle: loaded from `../packages/sdk/tools/tools.openai.json` via `lib/sdk-tools.cjs:get_tools`

### Level 2: Execution (E2E)

Run the full agent loop on real `.docx` fixtures. Open the document, let the model pick tools, execute them through the SDK/CLI, and assert on the resulting document text.

- **21 tests** on 3 fixture documents: `document.docx`, `memorandum.docx`, `table-doc.docx`
- **3 providers** via Vercel AI SDK + AI Gateway: GPT-5.4, Claude Haiku 4.5, Gemini 2.5 Pro
- Config: `promptfooconfig.e2e.yaml`
- Provider: `providers/superdoc-agent-gateway.mjs`

## Commands

| Command | What it does |
|---------|--------------|
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
    sdk-agent.cjs                   SDK system prompt + task injection
    minimal.txt                     Minimal baseline prompt
  tests/
    tool-quality.yaml               28 tool-selection / argument-shape tests
    execution.yaml                  21 real DOCX editing tests
  scripts/
    prepare-local-sdk.mjs           Pre-run pipeline: generate, build, verify
  providers/
    superdoc-agent-gateway.mjs      AI SDK + AI Gateway execution provider
    superdoc-agent.mjs              Legacy direct OpenAI execution provider
    vercel-tools.mjs                Capture-only AI SDK provider for tool-call experiments
    utils.mjs                       Shared SDK loading, file management, caching
  lib/
    checks.cjs                      Assertion helpers for tool-call validation
    normalize.cjs                   Cross-provider tool call normalization
    sdk-tools.cjs                   Promptfoo adapter for the SDK OpenAI tool bundle
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
| `correctFormatArgs` | `superdoc_format` inline and `format.apply` both require a non-empty `inline` payload (nested under `args.inline` for mutations) |
| `textSearchArgs` | `superdoc_search` uses a valid text selector |
| `nodeSearchArgs` | `superdoc_search` uses a valid node selector |
| `usesGetContentText` | `superdoc_get_content` called with `action: "text"` |
| `noTextInsertForStructure` | Headings/paragraphs use `superdoc_create`, not `text.insert` |
| `usesCreateAction` | `superdoc_create` called with the expected `action` value |
| `usesCommentCreate` | `superdoc_comment` called with `action: "create"` |
| `usesEditUndo` | `superdoc_edit` called with `action: "undo"` |
| `isTrackedMode` | Tracked changes use `changeMode: "tracked"` |
| `isNotTrackedMode` | Direct edits do not use tracked mode |
| `atomicMultiStep` | Multi-step mutations are atomic and grouped together |
| `usesDeleteOp` | The call includes a delete-style operation |
| `usesRewriteOp` | The call includes a rewrite/replace operation |

## Adding a new model

### Level 1: native Promptfoo providers

Add another native provider to `promptfooconfig.yaml`:

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

`promptfooconfig.yaml` also includes commented native Anthropic and Google examples.

### Level 2: AI Gateway execution providers

Add another entry to `promptfooconfig.e2e.yaml`:

```yaml
- id: file://providers/superdoc-agent-gateway.mjs
  label: Claude Sonnet 4.6 (Gateway)
  config:
    modelId: anthropic/claude-sonnet-4.6
```

## Local SDK resolution

Evals depend on `@superdoc-dev/sdk` via `workspace:*`, so pnpm always resolves to the local workspace package at `packages/sdk/langs/node/` — never to the published npm version.

A prepare script (`scripts/prepare-local-sdk.mjs`) runs as a pre-hook before `eval`, `eval:openai`, and `eval:e2e`. It:

1. **Regenerates** artifacts — full `generate:all` chain for Level 2, SDK-only catalog regeneration for Level 1
   Level 1 automatically falls back to the full chain if the generated doc-api contract is missing.
2. **Builds** the SDK and CLI (Level 2 only)
3. **Verifies** all expected output files exist
4. **Guards** that `@superdoc-dev/sdk` resolves from the workspace, not npm (Level 2 only)
5. **Validates** the tool surface matches the expected 9 grouped public tools

The provider cache (`results/.cache/`) includes an SDK fingerprint — a hash of the tool catalogs, system prompt, full SDK `dist/` tree, and CLI binary. Switching branches or changing local tool/runtime artifacts automatically invalidates stale cache entries.

To skip preparation during rapid iteration (when you know your builds are current):

```bash
SKIP_PREPARE=1 pnpm run eval:e2e
```

To intentionally test the published npm SDK, change the dependency in `evals/package.json` from `workspace:*` to a version number.

## Notes

- Level 2 runs `generate:all` automatically. Level 1 uses the fast SDK-only path once prerequisites exist, and auto-falls-back to full bootstrap on a fresh clone.
- Level 1 currently uses native OpenAI Promptfoo providers. Level 2 uses a custom provider that routes through Vercel AI Gateway.
- `pnpm run view` is the correct script name. There is no `eval:view` script in the current package.
- `pnpm run analyze` reads `results/latest.json`, writes `results/analysis.html`, and requires `ANTHROPIC_API_KEY`.
- Promptfoo caches model responses. Clear Promptfoo's cache with `npx promptfoo cache clear`.
- The custom execution provider also caches results in `results/.cache/`. The cache key includes an SDK fingerprint, so local tool/runtime changes automatically invalidate old entries. Disable provider caching entirely with `PROMPTFOO_CACHE_ENABLED=false`.
- `eval:repeat` and `eval:analyze` bypass the pre-hook (they call `npx promptfoo` directly). Run `node scripts/prepare-local-sdk.mjs` manually before these if needed.

## Exit codes and troubleshooting

- Promptfoo exits non-zero when tests fail. By default it uses pass-rate threshold `100` and failed-test exit code `100`, so a run can write results successfully and still return exit status `100`.
- To treat a failing eval run as a successful shell command, set either `PROMPTFOO_PASS_RATE_THRESHOLD=0` or `PROMPTFOO_FAILED_TEST_EXIT_CODE=0`.
- If Promptfoo crashes with a missing `better-sqlite3` binding, approve and rebuild native packages:

```bash
pnpm approve-builds
pnpm rebuild better-sqlite3
```
