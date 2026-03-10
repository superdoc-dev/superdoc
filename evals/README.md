# SuperDoc AI Evals

Tests whether LLMs correctly use SuperDoc's document editing tools.

## Quick start

```bash
pnpm run extract-tools   # extract tools from SDK (run once)
cp .env.example .env     # add your OPENAI_API_KEY
pnpm run eval            # run tests
pnpm run eval:view       # see results in browser
```

## What it tests

Given a task like "Find the indemnification clause", does the LLM call the right tool with the right arguments?

26 tests across two files:
- **tool-tests.yaml** -- tool selection, argument structure, correctness rules
- **workflows.yaml** -- find/replace, tracked changes, lists, multi-step editing

## Commands

| Command | What it does |
|---------|-------------|
| `pnpm run eval` | Run all tests (4 OpenAI models, ~$0.30) |
| `pnpm run eval:cross` | Cross-provider (GPT-5.4 vs Claude vs Gemini) |
| `pnpm run eval:gdpval` | Model+SuperDoc vs Model-Only (~$1-2) |
| `pnpm run eval:view` | Open results in browser |
| `pnpm run extract-tools` | Re-extract tools from SDK |

## Structure

```
evals/
  promptfooconfig.yaml               Main config (OpenAI models)
  promptfooconfig.cross-provider.yaml Cross-provider config
  promptfooconfig.gdpval.yaml        GDPval benchmark config
  prompts/
    agent.txt                        System prompt (from labs agent)
    minimal.txt                      Minimal prompt (customer sim)
  tests/
    tool-tests.yaml                  Tool selection + arguments + rules
    workflows.yaml                   Editing workflows
    cross-provider.yaml              Cross-provider tests
    gdpval-workflows.yaml            GDPval tests (llm-rubric)
  lib/
    assertions.cjs                   Shared assertion functions
    normalize.cjs                    Cross-provider output normalization
    extract.mjs                      Tool extraction from SDK
    save-baseline.mjs                Save results snapshot
    compare-baselines.mjs            Compare two snapshots
```

## Writing tests

```yaml
- description: 'Find text calls query_match'
  vars:
    task: 'Find where it talks about payment terms.'
  assert:
    - type: tool-call-f1
      value: [query_match]
      threshold: 1.0
    - type: javascript
      value: file://lib/assertions.cjs:textSearchArgs
```

`tool-call-f1` checks tool selection. `file://lib/assertions.cjs:functionName` checks arguments.

## Notes

- Run `pnpm run generate:all` from repo root if `extract-tools` fails (SDK artifacts missing).
- `prompts/agent.txt` is copied from `services/labs-sd-agent/src/features/agent/prompts/system.md`. Update both when changing.
- Promptfoo caches responses. Changing assertions re-runs cached data for free. Clear cache: `npx promptfoo cache clear`.
- Cross-provider tests use `lib/normalize.cjs` to convert Anthropic/Google tool call formats to OpenAI format.
