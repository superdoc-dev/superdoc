# LLM Tools Evals (devtools)

Evaluation harness for SuperDoc tool-calling behavior.

- Tool source of truth: `packages/llm-tools`
- Eval harness: `devtools/llm-tools`

## Status (WIP)

This harness is **work in progress** and subject to change. The case suite,
tool schemas, and runner behavior are evolving alongside the Document API and
LLM tooling efforts. Do not treat outputs as stable or production‑ready yet.

## What This Does

- Loads tool schemas from `fixtures/tool-schemas/current.json`.
- Runs test cases from `cases/ring0/*.yaml` against multiple runners.
- Executes tool calls in a deterministic sandbox.
- Produces normalized traces and promptfoo scores.

Current Ring0 suite has 5 cases:

- `find_service_provider_instances`
- `find_effective_clause`
- `find_no_match_here`
- `find_nonexistent_term`
- `find_reports_keyword`

## Runners

- `openai-sdk` (OpenAI Responses API)
- `anthropic-sdk` (Claude Agent SDK with in-process MCP tools)
- `vercel-ai` (Vercel AI SDK; provider mode via env)
- `openai-raw` (deterministic local baseline; mostly for debug)

## Setup

```bash
pnpm -C packages/llm-tools run tools:generate
pnpm -C devtools/llm-tools install --no-lockfile
pnpm -C devtools/llm-tools run tools:sync
```

Set env vars as needed (see `.env.example`):

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `VERCEL_AI_PROVIDER` (`ollama` | `openai` | `openai-compatible`)
- `CLAUDE_AGENT_HOME` (optional override; defaults to `.tmp/claude-agent-home`)

## Commands

- `pnpm run cases:validate`  
Validate case schema and IDs.

- `pnpm run ring0:run`  
Run deterministic sandbox assertions only.

- `pnpm run openai:smoke`  
Run OpenAI trace assertions for all Ring0 cases.

- `pnpm run anthropic:smoke`  
Run Anthropic trace assertions for all Ring0 cases.

- `pnpm run vercel:smoke`  
Run Vercel trace assertions for all Ring0 cases.

- `pnpm run eval:ci`  
Promptfoo evaluation for OpenAI + Anthropic lanes, writes `reports/promptfoo-results.json`.

- `pnpm run eval:ci:vercel`  
Promptfoo evaluation for Vercel lane, writes `reports/promptfoo-results-vercel.json`.

- `pnpm run ring0:verify`  
Full baseline Ring0 gate:
`cases:validate` + `ring0:run` + `openai:smoke` + `anthropic:smoke` + `eval:ci`.

- `pnpm run ring0:verify:vercel`  
Full Vercel Ring0 gate:
`cases:validate` + `ring0:run` + `vercel:smoke` + `eval:ci:vercel`.

- `pnpm run case:run <testId> [runner]`  
Debug one case and print full trace JSON.

## Common Flows

Baseline Ring0:

```bash
pnpm run ring0:verify
```

Vercel lane (direct OpenAI):

```bash
export VERCEL_AI_PROVIDER=openai
export OPENAI_API_KEY=...
pnpm run ring0:verify:vercel
```

Single-case debug:

```bash
pnpm run case:run find_service_provider_instances anthropic-sdk
```

## Notes

- `anthropic:smoke` runs with `HOME=/tmp` to keep Agent SDK filesystem writes in writable paths.
- Promptfoo configs are serialized (`maxConcurrency: 1`) for stability.
- Vercel smoke supports:
  - `VERCEL_SMOKE_TIMEOUT_MS` (default `40000`)
  - `VERCEL_SMOKE_MAX_TOOL_CALLS` (default `5`)
