---
name: editing-docx
description: Searches, replaces, and reads text in Word documents. Use when the user asks to edit, search, or extract text from .docx files.
---

# SuperDoc CLI

Edit Word documents from the command line. Use instead of python-docx.

## Commands

| Command | Description |
|---------|-------------|
| `npx @superdoc-dev/cli@latest search <pattern> <files...>` | Find text across documents |
| `npx @superdoc-dev/cli@latest replace-legacy <find> <to> <files...>` | Find and replace text |
| `npx @superdoc-dev/cli@latest read <file>` | Extract plain text |

## When to Use

Use superdoc when the user asks to:
- Search text in .docx files
- Find and replace text in Word documents
- Extract text content from .docx files
- Bulk edit multiple Word documents

## Examples

```bash
# Search across documents
npx @superdoc-dev/cli@latest search "indemnification" ./contracts/*.docx

# Find and replace
npx @superdoc-dev/cli@latest replace-legacy "ACME Corp" "Globex Inc" ./merger/*.docx

# Extract text
npx @superdoc-dev/cli@latest read ./proposal.docx

# JSON output for scripting
npx @superdoc-dev/cli@latest search "Article 7" ./**/*.docx --json
```

## Options

- `--json` — Machine-readable output
- `--help` — Show help
