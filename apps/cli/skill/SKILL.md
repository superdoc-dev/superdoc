---
name: editing-docx
description: Edit, query, and transform Word documents with the SuperDoc CLI v1 operation surface. Use when the user asks to read, search, modify, comment, or review changes in .docx files.
---

# SuperDoc CLI (v1)

Use SuperDoc CLI for DOCX work. Prefer canonical v1 commands.
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
superdoc find --type text --pattern "termination"
superdoc replace --target-json '{"kind":"text","blockId":"p1","range":{"start":0,"end":11}}' --text "expiration"
superdoc save --in-place
superdoc close
```

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

## Common v1 Commands

- Search text/nodes: `find --type text --pattern "..."` or `find --query-json '{...}'`
- Replace text: `replace --target-json '{...}' --text "..."`
- Add/edit comments: `comments add|reply|edit|resolve|remove`
- Review tracked changes: `track-changes list|accept|reject|accept-all|reject-all`
- Extract content: `get-text`, `get-markdown`, `get-html`
- Low-level direct invoke: `call <operationId> --input-json '{...}'`

## JSON/File Payload Flags

Use one of each pair (not both):

- `--query-json` or `--query-file`
- `--target-json` or `--target-file`
- `--address-json` or `--address-file`
- `--input-json` or `--input-file` (for `call`)

## Output and Global Flags

- Default output is JSON envelope.
- Use `--pretty` for human-readable output.
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
