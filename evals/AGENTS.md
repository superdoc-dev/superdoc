# SuperDoc Eval Suite

Promptfoo-based evaluation suite for SuperDoc's document-editing AI tools. Three levels.

| Level | What it tests | Config | Tests |
|---|---|---|---|
| **1: Tool quality** | Does the model pick the right tool with correct arguments? | `config/tool-quality.promptfoo.yaml` | 4 |
| **2: Execution (E2E)** | Does the agent edit produce the right document? | `config/execution.promptfoo.yaml` | 51 |
| **3: Agent benchmark** | How do coding agents (Claude Code, Codex) compare on DOCX tasks? | `config/benchmark.promptfoo.yaml` | 12 tasks x 8 conditions |

See `evals/README.md` for the full quickstart, env-var matrix, and per-level walkthrough.

## Quick Start

Eval scripts live in `evals/package.json`, not the root, so invoke them with `--filter` (works from any cwd in the workspace):

```bash
pnpm install
cp evals/.env.example evals/.env
pnpm --filter @superdoc-testing/evals run eval        # Level 1: tool selection
pnpm --filter @superdoc-testing/evals run eval:e2e    # Level 2: execution
pnpm --filter @superdoc-testing/evals run eval:benchmark   # Level 3: agent benchmark
pnpm --filter @superdoc-testing/evals run view        # open Promptfoo results UI
```

Inside `evals/`, the same scripts are reachable as bare `pnpm run eval`, `pnpm run view`, etc.

## Environment Variables

| Variable | Required for |
|---|---|
| `OPENAI_API_KEY` | Level 1, Level 3 (Codex) |
| `AI_GATEWAY_API_KEY` | Level 2 |
| `ANTHROPIC_API_KEY` | Level 3 (Claude Code), `analyze` |

## Where things live

- `config/` - the three Promptfoo configs.
- `suites/tool-quality/`, `suites/execution/`, `suites/benchmark/` - per-level tests and prompts.
- `providers/` - agent providers (`claude-code-agent.mjs`, `codex-agent.mjs`, `superdoc-agent.mjs`, etc.).
- `shared/` - harness, normalize, fidelity checks, baseline tooling.
- `scripts/` - prep scripts (e.g. `prepare-local-sdk.mjs`).
- `artifacts/` - Promptfoo result JSON.

## Level 3 (Agent benchmark) detail

Runs real Claude Code and Codex CLIs against DOCX tasks, comparing performance with vs without SuperDoc tools.

Conditions: `baseline`, `baseline-with-docx-skill`, `superdoc-mcp`, `superdoc-cli`.
Tasks: reading + editing across the categories in `suites/benchmark/tests/`.
Metrics per task: correctness, collateral, steps, latency, tokens, path (which DOCX approach was used).

```bash
pnpm --filter @superdoc-testing/evals run eval:benchmark           # full matrix
pnpm --filter @superdoc-testing/evals run eval:benchmark:claude    # CC-* providers only
pnpm --filter @superdoc-testing/evals run eval:benchmark:codex     # Codex-* providers only
pnpm --filter @superdoc-testing/evals run eval:benchmark:report    # markdown + CSV report
```

Prerequisites for Level 3: MCP server built (`pnpm --filter @superdoc-dev/mcp run build`) and CLI built (`apps/cli/dist/index.js`). The `prebuild:benchmark-deps` script handles both.

## Baselines

`pnpm --filter @superdoc-testing/evals run baseline:save` snapshots the latest results under a label. `pnpm --filter @superdoc-testing/evals run baseline:compare` diffs two snapshots. Useful before/after a behavior change to confirm no regression.
