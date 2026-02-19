# CLI Guardrails

This package is the LLM-first CLI surface for SuperDoc. It should stay thin, predictable, and machine-safe.

## Engine Agnosticism (Non-Negotiable)

**The CLI must be 100% engine-agnostic.** No file in `apps/cli/` may import from, reference, or depend on ProseMirror (or any other editor engine) in any way. This includes:

- No `editor.state`, `editor.view`, `editor.commands`, or `editor.storage` access.
- No ProseMirror types (`Node`, `EditorState`, `Transaction`, `Schema`, `Plugin`, etc.).
- No direct document traversal (`doc.descendants`, `doc.content.size`, `doc.textContent`, `doc.nodeAt`, etc.).
- No PM position arithmetic (`pos`, `nodeSize`, `resolve()`, `from`/`to` ranges from the engine).
- No PM schema name knowledge (e.g., mapping `'paragraph'`/`'tableHeader'` type strings).
- No PM attribute shape knowledge (e.g., reading `attrs.paraId`, `attrs.sdBlockId`, `attrs.paragraphProperties`).

The **only** allowed interface to the editor is `editor.doc.*` (the Document API). If a capability is missing from the Document API, the fix is to add it there (or in adapters), never to work around it in CLI code.

**Flag any violation immediately** — engine-aware code in the CLI is a structural bug, not a shortcut.

### Known violations (to be resolved)

These exist in `src/lib/document.ts` and must be migrated to the Document API:

- `getDocumentText()` — accesses `editor.state.doc.textContent` directly. Needs a Document API method.
- `resolveCreateParagraphLocation()` + `buildBlockCandidates()` + `mapBlockNodeType()` + `resolveBlockNodeId()` — PM doc traversal for dry-run location resolution. Needs a Document API dry-run path.
- `ProseMirrorNode` type alias — should not exist in CLI code.

## Core Design

- Command handlers are orchestration only.
- Business logic belongs in Document API (`editor.doc.*`) and adapters, not CLI command files.
- JSON envelope output is the stable contract; pretty mode is a human helper.
- CLI metadata lives in `apps/cli/src/cli/*` and is derived from `@superdoc/document-api`.
- Runtime command registry/help/parser spec is built from `apps/cli/src/cli/commands.ts`.
- Runtime self-description must stay aligned with that same metadata source (`describe`, `describe command`, `host.describe`, `host.describe.command`).
- Contract/version truth comes from `@superdoc/document-api` (`CONTRACT_VERSION`, operation metadata, schemas).

## Command Implementation Rules

For each command in `src/commands/*.ts`, follow this flow:

1. Parse args with `parseCommandArgs` and shared specs.
2. Resolve doc/session routing (`<doc>` / `--doc` vs active session).
3. Build canonical payloads (`Query`, `NodeAddress`, `TextAddress`) via shared libs.
4. Validate once using `src/lib/validate.ts`.
5. Call `editor.doc.<command>` (or command chain for editor-only mutations).
6. Return a stable envelope payload + minimal pretty string.

## Non-Negotiables

- **No engine internals in CLI** — see "Engine Agnosticism" above. This is the highest-priority guardrail.
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

- Add/extend unit tests in `src/__tests__/cli.test.ts` for every new command path.
- Cover:
  - stateless and session modes,
  - JSON and pretty outputs,
  - validation failures and error codes.
