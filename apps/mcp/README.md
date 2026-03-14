# @superdoc-dev/mcp

MCP server for SuperDoc. Lets AI agents open, read, edit, and save `.docx` files through the [Model Context Protocol](https://modelcontextprotocol.io).

Works with Claude Code, Claude Desktop, Cursor, Windsurf, and any MCP-compatible client.

## Quick start

```bash
npx @superdoc-dev/mcp
```

The server communicates over stdio. You don't run it directly — your MCP client spawns it as a subprocess.

## Setup

### Claude Code

```bash
claude mcp add superdoc -- npx @superdoc-dev/mcp
```

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "superdoc": {
      "command": "npx",
      "args": ["@superdoc-dev/mcp"]
    }
  }
}
```

### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "superdoc": {
      "command": "npx",
      "args": ["@superdoc-dev/mcp"]
    }
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "superdoc": {
      "command": "npx",
      "args": ["@superdoc-dev/mcp"]
    }
  }
}
```

## Tools

23 tools in eight groups. All tools take a `session_id` from `superdoc_open`.

### Lifecycle

| Tool | Description |
| --- | --- |
| `superdoc_open` | Open a `.docx` file and get a `session_id` |
| `superdoc_save` | Save the document to disk (original path or custom `out` path) |
| `superdoc_close` | Close the session and release memory |

### Query

| Tool | Description |
| --- | --- |
| `superdoc_find` | Search by text pattern, node type, or both. Returns addresses for mutations |
| `superdoc_get_node` | Get details about a specific node |
| `superdoc_info` | Document metadata and structure |
| `superdoc_get_text` | Full plain text of the document |

### Mutation

| Tool | Description |
| --- | --- |
| `superdoc_insert` | Insert text at a position. Set `suggest=true` for tracked changes |
| `superdoc_replace` | Replace content at a range. Set `suggest=true` for tracked changes |
| `superdoc_delete` | Delete content at a range. Set `suggest=true` for tracked changes |

### Format

| Tool | Description |
| --- | --- |
| `superdoc_format` | Toggle formatting (`bold`, `italic`, `underline`, `strikethrough`). Set `suggest=true` for tracked changes |

### Create

| Tool | Description |
| --- | --- |
| `superdoc_create` | Create a block element (`paragraph`, `heading`). Set `suggest=true` for tracked changes |

### Track changes

| Tool | Description |
| --- | --- |
| `superdoc_list_changes` | List all tracked changes with type, author, and excerpt |
| `superdoc_accept_change` | Accept a single tracked change |
| `superdoc_reject_change` | Reject a single tracked change |
| `superdoc_accept_all_changes` | Accept all tracked changes |
| `superdoc_reject_all_changes` | Reject all tracked changes |

### Comments

| Tool | Description |
| --- | --- |
| `superdoc_add_comment` | Add a comment anchored to a text range |
| `superdoc_list_comments` | List all comments with author, status, and anchored text |
| `superdoc_reply_comment` | Reply to an existing comment thread |
| `superdoc_resolve_comment` | Mark a comment as resolved |

### Lists

| Tool | Description |
| --- | --- |
| `superdoc_insert_list` | Insert a list item before or after an existing one |
| `superdoc_list_set_type` | Change a list between ordered and bullet |

## Workflow

Every interaction follows the same pattern:

```
open → read/edit → save → close
```

1. `superdoc_open` loads a document and returns a `session_id`
2. `superdoc_find` locates content and returns addresses
3. Edit tools use those addresses to modify content
4. `superdoc_save` writes changes to disk
5. `superdoc_close` releases the session

### Suggesting mode

Set `suggest=true` on any mutation, format, or create tool to make edits appear as tracked changes (suggestions) instead of direct edits. Use `superdoc_list_changes` to review them, and `superdoc_accept_change` / `superdoc_reject_change` to resolve them.

## Development

```bash
# Run locally
bun run src/index.ts

# Run tests
bun test

# Test with MCP Inspector
npx @modelcontextprotocol/inspector -- bun run src/index.ts
```

## License

See the [SuperDoc license](../../LICENSE).
