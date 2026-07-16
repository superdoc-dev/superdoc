# Core actions agent

A minimal, headless agent that edits a `.docx` from a natural-language instruction using the SuperDoc SDK's **`core` LLM-tools preset** — two tools (`superdoc_inspect`, `superdoc_perform_action`), forty deterministic actions, receipts with verification.

Docs: [Core preset reference](https://docs.superdoc.dev/ai/agents/core-preset) · [AI agents overview](https://docs.superdoc.dev/ai/agents/llm-tools)

## Setup

```bash
pnpm install          # from the repo root (workspace)
export OPENAI_API_KEY=sk-...
```

Or standalone outside the monorepo: replace the `workspace:*` dependency with the published `@superdoc-dev/sdk`.

In a **dev checkout** (no published platform binary installed), point the SDK at the locally built CLI:

```bash
export SUPERDOC_CLI_BIN=<repo>/apps/cli/dist/index.js   # pnpm --prefix apps/cli run build
```

## Run (Node)

```bash
node agent.mjs ./contract.docx "Rewrite the termination clause to allow 30-day notice."

# Redlining: every edit becomes a tracked change a reviewer can accept/reject
node agent.mjs ./contract.docx "Tighten the confidentiality clause." --tracked --out reviewed.docx
```

## Run (Python)

```bash
pip install superdoc-sdk openai   # import name is `superdoc`
python agent.py ./contract.docx "Add a short summary paragraph at the top." --tracked
```

## What to look at

- **One preset everywhere** — both scripts load tools, the system prompt, and the dispatcher through a single `createAgentToolkit({ preset: 'core', ... })` (`create_agent_toolkit` in Python) call, so they can never disagree on preset or exclusions. Mixing presets between hand-assembled calls is the most common integration mistake — the toolkit makes it impossible.
- **Receipts as status lines** — each tool call prints `→ <action> … ok|partial|failed`, exactly the events you would stream to a chat UI over SSE.
- **`--tracked`** — appends a tracked-changes instruction; the model sets `changeMode: "tracked"` on every mutating action, producing redline suggestions instead of direct edits.

Both scripts cap the loop at 16 turns and save to `out.docx` by default.
