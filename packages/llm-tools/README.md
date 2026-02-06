# LLM Tools (WIP)

This package defines the source‑of‑truth tool schemas for SuperDoc's LLM tooling.
It is **work in progress** and currently serves as a placeholder for early tooling
experiments. The public surface and stability guarantees are not finalized yet.

## Why this exists

SuperDoc’s Document API is the stable, engine‑agnostic interface for reading and
editing documents. LLM tools are just one consumer. This package exists to
translate the Document API (and related capabilities) into structured tool
definitions that external agents can call safely and deterministically.

## Status

- **WIP / Placeholder**: definitions and generated output may change.
- **Not production‑ready**: do not rely on these schemas for external contracts yet.

## Structure

- Tool definitions: `src/definitions/tools/`
- Formatters: `src/formatters/`
- Generated output: `dist/tool-definitions.json`

## Generate tool definitions

```bash
pnpm -C packages/llm-tools install
pnpm -C packages/llm-tools run tools:generate
```

The generated JSON is consumed by `devtools/llm-tools` via its `tools:sync` command.
