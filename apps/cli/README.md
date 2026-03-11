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

# Use query match to find a mutation-grade target
superdoc query match --select-json '{"type":"text","pattern":"termination"}' --require exactlyOne

# Mutate using the returned target
superdoc replace --target-json '{"kind":"text","blockId":"p1","range":{"start":0,"end":11}}' --text "expiration"

superdoc save --in-place
superdoc close
```

## Choosing the Right Command

### Which command should I use?

| I want to... | Use this command |
|--------------|------------------|
| Find a mutation target (block ID, text range) | `query match` |
| Search/browse document content | `find` |
| Insert inline text within a block | `insert` |
| Create a new standalone paragraph | `create paragraph` |
| Create a new heading | `create heading` |
| Insert a list item before/after another list item | `lists insert` |
| Apply formatting to a text range | `format apply` or format helpers (`format bold`, etc.) |
| Apply multiple changes in one operation | `mutations apply` |

### Mutation targeting workflow

Always use `query match` to discover targets before mutating:

```bash
# Step 1: Find the target
superdoc query match --select-json '{"type":"text","pattern":"Introduction"}' --require exactlyOne

# Step 2: Use the returned address in a mutation
superdoc replace --block-id <returned-blockId> --start <start> --end <end> --text "Overview"
```

`find` is for content discovery and inspection. `query match` is for mutation targeting — it returns exact addresses with cardinality guarantees.

### Block-oriented editing workflow

Use `blocks list` for ordered inspection, then `blocks delete-range` for contiguous removal:

```bash
superdoc open ./contract.docx

# 1. Inspect block order, IDs, and text previews
superdoc blocks list --limit 30

# 2. Preview the deletion (no mutation, shows what would be removed)
superdoc blocks delete-range \
  --start-json '{"kind":"block","nodeType":"paragraph","nodeId":"abc123"}' \
  --end-json '{"kind":"block","nodeType":"paragraph","nodeId":"def456"}' \
  --dry-run

# 3. Apply the deletion
superdoc blocks delete-range \
  --start-json '{"kind":"block","nodeType":"paragraph","nodeId":"abc123"}' \
  --end-json '{"kind":"block","nodeType":"paragraph","nodeId":"def456"}'

superdoc save --in-place
```

This replaces the pattern of calling `blocks delete` once per block. A 17-block removal becomes one command.

### Preview-before-apply workflow

Use `--dry-run` and `--expected-revision` for safe, auditable mutations:

```bash
superdoc open ./contract.docx

# 1. Check session state
superdoc status

# 2. Find the mutation target
superdoc query match --select-json '{"type":"text","pattern":"termination"}' --require exactlyOne

# 3. Preview the change (validates input, shows what would change, no mutation)
superdoc replace --block-id p1 --start 0 --end 11 --text "expiration" --dry-run

# 4. Apply with revision guard (fails if document changed since preview)
superdoc replace --block-id p1 --start 0 --end 11 --text "expiration" --expected-revision 1

superdoc save --in-place
```

### Common mistakes

1. **Do not use `find` output to construct mutation targets.** `find` returns discovery-grade data, not mutation-grade addresses. Use `query match` instead.
2. **Do not use `insert --block-id` for sibling block insertion.** `insert` inserts inline text *within* a block. To create a new block adjacent to another, use `create paragraph`, `create heading`, or `lists insert`.
3. **Do not use `create paragraph` to continue a list.** If you want to add a list item adjacent to existing list items, use `lists insert`. `create paragraph` creates a standalone (non-list) paragraph.

## Command Index

| Category | Commands |
|----------|----------|
| query | `find`, `query match`, `get-node`, `get-node-by-id`, `get-text`, `info` |
| mutation | `insert`, `replace`, `delete`, `blocks delete`, `blocks delete-range`, `blocks list`, `mutations apply`, `mutations preview` |
| format | `format apply`, `format bold`, `format italic`, `format underline`, `format strikethrough` |
| create | `create paragraph`, `create heading`, `create table-of-contents` |
| lists | `lists list`, `lists get`, `lists insert`, `lists create`, `lists attach`, `lists detach`, `lists join`, `lists separate`, `lists set-level`, `lists indent`, `lists outdent`, `lists set-value`, `lists set-type`, `lists convert-to-text` |
| comments | `comments add`, `comments reply`, `comments delete`, `comments get`, `comments list` |
| trackChanges | `track-changes list`, `track-changes get`, `track-changes accept`, `track-changes reject`, `track-changes accept-all`, `track-changes reject-all` |
| history | `history get`, `history undo`, `history redo` |
| lifecycle | `open`, `save`, `close` |
| session | `session list`, `session save`, `session close`, `session set-default`, `session use` |
| introspection | `status`, `describe`, `describe command` |
| low-level | `call <operationId>` |
| legacy compat | `search`, `replace-legacy <find> <to> <files...>`, `read` |

For full command help and examples, run:

```bash
superdoc --help
superdoc describe command <command-name>
```

## v1 Breaking Changes

This CLI replaces the previous `@superdoc-dev/cli` package surface with the v1 contract-driven command set.

| Legacy command | v1 status | Migration |
|---------------|-----------|-----------|
| `superdoc replace <find> <to> <files...>` | Renamed to `replace-legacy` | Use `replace-legacy`, or use `query match` + `replace --target-json` for the v1 workflow. |

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
superdoc query match --select-json '{"type":"text","pattern":"termination"}' --require exactlyOne
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
superdoc find [<doc>] --type text --pattern "termination" --limit 5
superdoc query match [<doc>] --select-json '{"type":"text","pattern":"termination"}' --require exactlyOne
superdoc get-node [<doc>] --address-json '{"kind":"block","nodeType":"paragraph","nodeId":"p1"}'
superdoc get-node-by-id [<doc>] --id p1 --node-type paragraph
```

- `find` returns discovery-grade results for content search and browsing.
- `query match` returns mutation-grade addresses and text ranges — use this before any mutation.
- For text queries, use the returned `blocks[].range` as targets for `replace`, `comments add`, and formatting commands.

## Mutating commands

```bash
superdoc replace [<doc>] --target-json '{...}' --text "Updated text" [--out ./updated.docx]
superdoc insert [<doc>] --value "New text" [--out ./inserted.docx]
superdoc blocks delete [<doc>] --node-type paragraph --node-id abc123
superdoc blocks delete-range --start-json '{"kind":"block",...}' --end-json '{"kind":"block",...}'
superdoc create paragraph [<doc>] --text "New paragraph" [--at-json '{"kind":"after","target":{"kind":"block","nodeType":"paragraph","nodeId":"p1"}}']
superdoc lists insert [<doc>] --node-id li1 --position after --text "New item"
superdoc format bold [<doc>] --target-json '{...}' [--out ./bolded.docx]
superdoc comments add [<doc>] --block-id p1 --start 0 --end 10 --text "Please revise" [--out ./with-comment.docx]
```

- In stateless mode (`<doc>` provided), mutating commands require `--out`.
- In stateful mode (after `open`), mutating commands update the active working document and `--out` is optional.
- Use `--dry-run` to preview any mutation without applying it.
- Use `--expected-revision <n>` with stateful mutating commands for optimistic concurrency checks.

## Block inspection

```bash
superdoc blocks list
superdoc blocks list --limit 20 --offset 10
superdoc blocks list --node-types-json '["paragraph","heading"]'
```

- Returns ordered block metadata: ordinal, nodeId, nodeType, textPreview, isEmpty.
- Use the returned nodeIds as targets for `blocks delete`, `blocks delete-range`, or other block-oriented commands.

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
- `--version`, `-v`

## Input payload flags

- `--query-json`, `--query-file`
- `--address-json`, `--address-file`
- `--target-json`, `--target-file`
- `--at-json`, `--at-file` (for `create paragraph`)

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
    "code": "INVALID_TARGET",
    "message": "Expected paragraph:abc123 but found listItem:abc123.",
    "details": {
      "requestedNodeType": "paragraph",
      "actualNodeType": "listItem",
      "nodeId": "abc123",
      "remediation": "Use lists.insert to add an item to a list sequence."
    }
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
