# CLI Guardrails

This package is the LLM-first CLI surface for SuperDoc. It should stay thin, predictable, and machine-safe.

## Engine Agnosticism (Non-Negotiable)

**The canonical v1 command surface must be engine-agnostic.** Command metadata, parsing, dispatch, and non-legacy command paths in `apps/cli/` must not import from, reference, or depend on ProseMirror (or any other editor engine) in any way. This includes:

- No `editor.state`, `editor.view`, `editor.commands`, or `editor.storage` access.
- No ProseMirror types (`Node`, `EditorState`, `Transaction`, `Schema`, `Plugin`, etc.).
- No direct document traversal (`doc.descendants`, `doc.content.size`, `doc.textContent`, `doc.nodeAt`, etc.).
- No PM position arithmetic (`pos`, `nodeSize`, `resolve()`, `from`/`to` ranges from the engine).
- No PM schema name knowledge (e.g., mapping `'paragraph'`/`'tableHeader'` type strings).
- No PM attribute shape knowledge (e.g., reading `attrs.paraId`, `attrs.sdBlockId`, `attrs.paragraphProperties`).

The canonical interface to document behavior is `editor.doc.*` (the Document API), typically reached via the shared operation dispatcher. If a capability is missing from the Document API, the fix is to add it there (or in adapters), never to work around it in CLI code.

**Flag any violation immediately** — engine-aware code in the CLI is a structural bug, not a shortcut.

`src/commands/legacy-compat.ts` is a temporary v0.x compatibility bridge (`search`, `read`, `replace-legacy`) and the only accepted exception. Do not copy this pattern into any v1 command path.

## Core Design

- Command handlers are orchestration only.
- Business logic belongs in Document API (`editor.doc.*`) and adapters, not CLI command files.
- JSON envelope output is the stable contract; pretty mode is a human helper.
- CLI metadata lives in `apps/cli/src/cli/*` and is derived from `@superdoc/document-api`.
- Runtime command registry/help/parser spec is built from `apps/cli/src/cli/commands.ts`.
- Wrapper/call execution funnels through `apps/cli/src/lib/operation-executor.ts`.
- Doc-backed operations dispatch through `apps/cli/src/lib/generic-dispatch.ts` (`read-orchestrator` / `mutation-orchestrator`).
- Runtime self-description must stay aligned with that same metadata source (`describe`, `describe command`, `host.describe`, `host.describe.command`).
- Contract/version truth comes from `@superdoc/document-api` (`CONTRACT_VERSION`, operation metadata, schemas).

## Command Implementation Rules

For each new command/operation, follow this flow:

1. Define/extend metadata in `src/cli/operation-set.ts`, `src/cli/operation-params.ts`, and derived command specs.
2. Parse wrapper inputs with shared argument helpers (`src/lib/args.ts`, `src/lib/operation-wrapper-input.ts`).
3. Build canonical payloads (`Query`, `NodeAddress`, `TextAddress`) via shared libs (`find-query`, `payload`, `create-paragraph-input`).
4. Validate operation input and output through `src/lib/operation-args.ts` (plus structural validators in `src/lib/validate.ts`).
5. Dispatch through `src/lib/operation-executor.ts` (doc-backed, introspection, or allowed manual lifecycle/session path).
6. Return a stable `CommandExecution`; keep envelope formatting centralized in `src/index.ts`.

## Non-Negotiables

- **No engine internals in v1 CLI paths** — see "Engine Agnosticism" above. This is the highest-priority guardrail.
- Do not reintroduce address translation/mapping layers in CLI.
- Do not duplicate validation logic inside command files.
- Do not add PM node traversal, position resolution, or attribute inspection — these belong in Document API adapters.
- Keep `find` query-first:
  - `--query-json` / `--query-file` are canonical.
  - Flat flags are convenience syntax normalized in `src/lib/find-query.ts`.
- Use shared validators/constants from Document API types; do not fork enum lists in CLI.
- Keep command output deterministic and structured for SDK/agent use.

## Session + Stateless Behavior

- Explicit `<doc>`/`--doc` means stateless execution.
- No `<doc>` means session-context execution (`--session` or active default session).
- Mutating commands:
  - Stateless mode requires explicit output path.
  - Stateful mode updates working doc and revision metadata.

## Error and Output Rules

- Emit stable error codes from `src/lib/errors.ts`.
- Preserve envelope shape from `src/lib/envelope.ts`.
- `--output json` is default; `--pretty` must not hide machine data.

## Testing Rules

- Add/extend tests in `src/__tests__/` for every new command path.
- Cover:
  - stateless and session modes,
  - JSON and pretty outputs,
  - validation failures and error codes.
- Keep `src/__tests__/lib/cli-import-boundaries.test.ts` passing to prevent engine/internal import regressions.
