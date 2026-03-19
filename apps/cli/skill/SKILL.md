---
name: editing-docx
description: Edit, query, and transform Word documents with the SuperDoc CLI v1 operation surface. Use when the user asks to read, search, modify, comment, or review changes in .docx files.
---

# SuperDoc CLI (v1)

Use SuperDoc CLI for DOCX work. Use v1 commands (canonical operations and their helper wrappers).
Do not default to legacy commands unless explicitly needed for v0-style bulk workflows.

Use `superdoc` if installed, or `npx @superdoc-dev/cli@latest` as a fallback.

## First Step: Discover Exact Params

For unknown commands or flags, inspect runtime metadata first:

```bash
superdoc describe
superdoc describe command find
superdoc describe command "comments add"
```

Use `describe command` for per-command args and constraints.

## Preferred Workflows

### 1) Stateful multi-step edits (recommended)

```bash
superdoc open ./contract.docx
superdoc query match --select-json '{"type":"text","pattern":"termination"}' --require exactlyOne
superdoc replace --target-json '{"kind":"text","blockId":"p1","range":{"start":0,"end":11}}' --text "expiration"
superdoc save --in-place
superdoc close
```

- Always use `query match` (not `find`) to discover mutation targets — it returns exact addresses with cardinality guarantees.
- After `open`, commands run against the active/default session when `<doc>` is omitted.
- Use `superdoc session list|set-default|save|close` for explicit session control.
- `close` on dirty state requires `--discard` or a prior `save`.

### 2) Stateless one-off reads

```bash
superdoc get-text ./proposal.docx
superdoc get-markdown ./proposal.docx
superdoc info ./proposal.docx
```

### 3) Stateless one-off mutations

```bash
superdoc replace ./proposal.docx \
  --target-json '{"kind":"text","blockId":"p1","range":{"start":0,"end":5}}' \
  --text "Updated" \
  --out ./proposal.updated.docx
```

- In stateless mode (`<doc>` provided), mutating commands require `--out` unless using `--dry-run`.

### Safety: preview before apply

- Use `--dry-run` to preview any mutation without applying it.
- Use `--expected-revision <n>` with stateful mutations for optimistic concurrency checks.

## Common v1 Commands

### Query & inspect

- Search/browse content: `find --type text --pattern "..."` or `find --query-json '{...}'`
- Find mutation target: `query match --select-json '{...}' --require exactlyOne`
- Inspect blocks: `blocks list`, `get-node`, `get-node-by-id`
- Extract content: `get-text`, `get-markdown`, `get-html`

### Mutate

- Replace text: `replace --target-json '{...}' --text "..."`
- Insert inline text: `insert --block-id <id> --offset <n> --value "..."`
- Delete text/node: `delete --target-json '{...}'`
- Delete blocks: `blocks delete`, `blocks delete-range`
- Batch mutations: `mutations apply --steps-json '[...]' --atomic true --change-mode direct`
- Create paragraph: `create paragraph --text "..."` (with optional `--at-json`)
- Create heading: `create heading --input-json '{"level":<n>,"text":"..."}'`

### Format

- Apply formatting: `format apply --block-id <id> --start <n> --end <n> --inline-json '{"bold":true}'`
- Shortcuts: `format bold`, `format italic`, `format underline`, `format strikethrough`

### Lists

- List items: `lists list`, `lists get`
- Insert list item: `lists insert --node-id <id> --position after --text "..."`
- Modify: `lists indent`, `lists outdent`, `lists set-level`, `lists set-type`, `lists convert-to-text`

### Comments

- Add/reply: `comments add`, `comments reply`
- Read: `comments get`, `comments list`
- Edit/resolve/move: `comments edit`, `comments resolve`, `comments move`, `comments set-internal`
- Delete: `comments delete` (canonical) or `comments remove` (alias)

### Track changes

- List: `track-changes list`, `track-changes get`
- Decide: `track-changes accept`, `track-changes reject`, `track-changes accept-all`, `track-changes reject-all`

### History

- `history get`, `history undo`, `history redo`

### Low-level

- Direct invoke: `call <operationId> --input-json '{...}'` (JSON output only — `--pretty` is not supported)

## JSON/File Payload Flags

Not all `--*-file` variants are available on every command. Use `describe command <name>` to check.

Always supported alongside their `-json` counterpart (use one, not both):

| Flag pair | Available on |
|-----------|-------------|
| `--query-json` / `--query-file` | `find`, `lists list` |
| `--address-json` / `--address-file` | `get-node`, `lists get` |
| `--input-json` / `--input-file` | `call`, `create paragraph` |
| `--at-json` / `--at-file` | `create paragraph` |

`--target-json` is widely available on mutation commands but has **no** `--target-file` counterpart. Use flat flags (`--block-id`, `--start`, `--end`) as an alternative to `--target-json`.

## Output and Global Flags

- Default output is JSON envelope.
- Use `--pretty` for human-readable output (not supported by `call`).
- Global flags: `--output <json|pretty>`, `--session <id>`, `--timeout-ms <n>`.
- `<doc>` can be `-` to read DOCX bytes from stdin.

## Legacy Compatibility (Use Sparingly)

Legacy v0.x bridge commands still exist:

```bash
superdoc search <pattern> <files...>
superdoc replace-legacy <find> <to> <files...>
superdoc read <file>
```

Use these only when you specifically need v0-style behavior (especially multi-file glob search/replace).
For new automations, prefer v1 operations.
