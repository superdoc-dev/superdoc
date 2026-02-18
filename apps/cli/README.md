# @superdoc-dev/cli

The command-line interface for [SuperDoc](https://superdoc.dev) — DOCX editing in your terminal.

```bash
npx @superdoc-dev/cli search "CONFIDENTIAL" ./legal/*.docx
```

## Commands

| Command | Status | Description |
|---------|--------|-------------|
| `search` | Available | Find text across documents |
| `replace` | Available | Find and replace text |
| `replace --track` | Coming soon | Replace with track changes |
| `read` | Available | Extract plain text |
| `diff` | Coming soon | Compare two documents |
| `convert` | Coming soon | DOCX ↔ HTML ↔ Markdown |
| `comments` | Coming soon | List, add, resolve comments |
| `accept` | Coming soon | Accept/reject track changes |

Powered by the SuperDoc document engine. Bulk operations, glob patterns, JSON output.

## Install

```bash
npm install -g @superdoc-dev/cli
```

Or run directly:

```bash
npx @superdoc-dev/cli <command>
```

## Usage

```bash
# Search across documents
superdoc search "indemnification" ./contracts/*.docx

# Find and replace
superdoc replace "ACME Corp" "Globex Inc" ./merger/*.docx

# Extract text
superdoc read ./proposal.docx

# JSON output for scripting
superdoc search "Article 7" ./**/*.docx --json
```

## Options

| Flag | Description |
|------|-------------|
| `--json` | Machine-readable output |
| `--help` | Show help |

## AI Integration

Works with AI coding assistants. Copy the skill file so Claude Code, Cursor, etc. know to use `superdoc` for DOCX operations instead of python-docx.

```bash
# Copy skill to Claude Code
cp -r skills/superdoc ~/.claude/skills/
```

See [`skills/superdoc/SKILL.md`](../../skills/superdoc/SKILL.md) for the skill definition.

## Part of SuperDoc

This CLI is part of the [SuperDoc](https://github.com/superdoc-dev/superdoc) project — an open source document editor bringing Microsoft Word to the web. Use it alongside the editor, or standalone for document automation.

## License

AGPL-3.0 · [Enterprise license available](https://superdoc.dev)
