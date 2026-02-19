# @superdoc-dev/cli

LLM-first CLI for deterministic DOCX operations through SuperDoc's Document API.

## Install

```bash
npm install -g @superdoc-dev/cli
```

The package automatically installs a native binary for your platform via optionalDependencies. Supported platforms:

| Platform | Package |
|----------|---------|
| macOS (Apple Silicon) | `@superdoc-dev/cli-darwin-arm64` |
| macOS (Intel) | `@superdoc-dev/cli-darwin-x64` |
| Linux (x64) | `@superdoc-dev/cli-linux-x64` |
| Linux (ARM64) | `@superdoc-dev/cli-linux-arm64` |
| Windows (x64) | `@superdoc-dev/cli-windows-x64` |

## Usage

```bash
superdoc <command> [options]
```

## Getting Started

Stateful editing flow (recommended for multi-step edits):

```bash
superdoc open ./contract.docx
superdoc find --type text --pattern "termination"
superdoc replace --target-json '{"kind":"text","blockId":"p1","range":{"start":0,"end":11}}' --text "expiration"
superdoc save --in-place
superdoc close
```

Legacy compatibility commands (v0.x behavior):

```bash
superdoc search "indemnification" ./contracts/*.docx
superdoc replace-legacy "ACME Corp" "Globex Inc" ./merger/*.docx
superdoc read ./proposal.docx
```

## Command Index

| Category | Commands |
|----------|----------|
| query | `find`, `get-node`, `get-node-by-id`, `info` |
| mutation | `insert`, `replace`, `delete` |
| format | `format bold` |
| create | `create paragraph` |
| lists | `lists list`, `lists get`, `lists insert`, `lists set-type`, `lists indent`, `lists outdent`, `lists restart`, `lists exit` |
| comments | `comments add`, `comments edit`, `comments reply`, `comments move`, `comments resolve`, `comments remove`, `comments set-internal`, `comments set-active`, `comments go-to`, `comments get`, `comments list` |
| trackChanges | `track-changes list`, `track-changes get`, `track-changes accept`, `track-changes reject`, `track-changes accept-all`, `track-changes reject-all` |
| lifecycle | `open`, `save`, `close` |
| session | `session list`, `session save`, `session close`, `session set-default`, `session use` |
| introspection | `status`, `describe`, `describe command` |
| low-level | `call <operationId>` |
| legacy compat | `search`, `replace-legacy <find> <to> <files...>`, `read` |

For full command help and examples, run:

```bash
superdoc --help
```

## v1 Breaking Changes

This CLI replaces the previous `@superdoc-dev/cli` package surface with the v1 contract-driven command set.

| Legacy command | v1 status | Migration |
|---------------|-----------|-----------|
| `superdoc replace <find> <to> <files...>` | Renamed to `replace-legacy` | Use `replace-legacy`, or use `find` + `replace --target-json` for the v1 workflow. |

Legacy compatibility is retained for `search`, `read`, and `replace-legacy`.

## Normative Policy

- Canonical contract/version metadata comes from `@superdoc/document-api` (`CONTRACT_VERSION`, operation metadata, and schemas).
- This README is usage guidance for CLI consumers.
- If guidance here conflicts with `superdoc describe`/`describe command` output or document-api contract exports, those are authoritative.

## Host mode (stdio JSON-RPC)

```bash
superdoc host --stdio
```

- Starts a persistent JSON-RPC 2.0 host over newline-delimited stdio frames.
- Intended for SDK/runtime integrations that need long-lived command execution in a single process.
- Supported methods:
  - `host.ping`
  - `host.capabilities`
  - `host.describe`
  - `host.describe.command` (requires `params.operationId`)
  - `host.shutdown`
  - `cli.invoke` (executes canonical CLI command semantics)

## API introspection commands

```bash
superdoc describe
superdoc describe command doc.find
superdoc status
```

- `describe` returns contract + protocol metadata and the operation catalog.
- `describe command <operationId>` returns one operation definition (inputs, response schema, errors, examples).
- `status` shows current session status and document metadata.

## Stateful session commands

```bash
superdoc open ./contract.docx
superdoc status
superdoc find --type text --pattern "termination"
superdoc replace --target-json '{...}' --text "Updated clause"
superdoc save --in-place
superdoc close
```

- `open` creates a new session id automatically unless `--session <id>` is provided.
- If `<doc>` is omitted, commands run against the active default session.
- Explicit `<doc>` (or `--doc`) always runs in stateless mode and does not use session state.

## Session management

```bash
superdoc session list
superdoc session save <sessionId> [--in-place] [--out <path>] [--force]
superdoc session set-default <sessionId>
superdoc session use <sessionId>
superdoc session close <sessionId> [--discard]
```

## Read / locate commands

```bash
superdoc info [<doc>]
superdoc find [<doc>] --type text --pattern "termination"
superdoc find [<doc>] --type run
superdoc get-node [<doc>] --address-json '{"kind":"block","nodeType":"paragraph","nodeId":"p1"}'
superdoc get-node-by-id [<doc>] --id p1 --node-type paragraph
```

- Flat `find` flags are convenience syntax and are normalized into the canonical query object used by `editor.doc.find`.
- Use `--query-json` / `--query-file` for complex or programmatic queries.
- For text queries, use `result.context[*].textRanges[*]` as targets for `replace`, `comments add`, and formatting commands.

## Mutating commands

```bash
superdoc comments add [<doc>] --target-json '{...}' --text "Please revise" [--out ./with-comment.docx]
superdoc replace [<doc>] --target-json '{...}' --text "Updated text" [--out ./updated.docx]
superdoc format bold [<doc>] --target-json '{...}' [--out ./bolded.docx]
```

- In stateless mode (`<doc>` provided), mutating commands require `--out`.
- In stateful mode (after `open`), mutating commands update the active working document and `--out` is optional.
- Use `--expected-revision <n>` with stateful mutating commands for optimistic concurrency checks.

## Low-level invocation

```bash
superdoc call <operationId> --input-json '{...}'
```

- Invokes any document-api operation directly with a JSON payload.

## Save command modes

```bash
superdoc save --in-place
superdoc save --out ./final.docx
```

- `save` persists the active session but keeps it open for more edits.
- If no source path exists (for example stdin-opened docs), `save` requires `--out <path>`.
- `save --in-place` checks for source-file drift and refuses overwrite unless `--force` is passed.

## Close command modes

```bash
superdoc close
superdoc close --discard
```

- Dirty contexts require explicit `--discard` (or run `save` first, then `close`).

## Output modes

- Default: `--output json` (machine-oriented envelope)
- Human mode: `--output pretty` (or `--pretty`)

```bash
superdoc info ./contract.docx --output json
superdoc info ./contract.docx --pretty
```

## Global flags

- `--output <json|pretty>`
- `--json`
- `--pretty`
- `--session <id>`
- `--timeout-ms <n>`
- `--help`

## Input payload flags

- `--query-json`, `--query-file`
- `--address-json`, `--address-file`
- `--target-json`, `--target-file`

## Stdin support

Use `-` as `<doc>` to read DOCX bytes from stdin:

```bash
cat ./contract.docx | superdoc open -
cat ./contract.docx | superdoc info -
```

## JSON envelope contract

Normative operation/version metadata comes from `@superdoc/document-api`; use `superdoc describe` for the runtime contract surface.

Success:

```json
{
  "ok": true,
  "command": "find",
  "data": {},
  "meta": {
    "version": "1.0.0",
    "elapsedMs": 42
  }
}
```

Error:

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "..."
  },
  "meta": {
    "version": "1.0.0",
    "elapsedMs": 8
  }
}
```

## Part of SuperDoc

This CLI is part of the [SuperDoc](https://github.com/superdoc-dev/superdoc) project — an open source document editor bringing Microsoft Word to the web. Use it alongside the editor, or standalone for document automation.

## License

AGPL-3.0 · [Enterprise license available](https://superdoc.dev)
