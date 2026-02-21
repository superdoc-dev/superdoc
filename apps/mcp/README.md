# @superdoc-dev/mcp

MCP server for SuperDoc. Lets AI agents open, read, edit, and save `.docx` files through the [Model Context Protocol](https://modelcontextprotocol.io).

Works with Claude Code, Claude Desktop, Cursor, Windsurf, OpenAI Codex, and any MCP-compatible client.

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

## Tools

13 tools, grouped by purpose:

### Lifecycle

| Tool | Description |
| --- | --- |
| `superdoc_open` | Open a `.docx` file and get a `session_id` |
| `superdoc_save` | Save the document to disk |
| `superdoc_close` | Close the session and release memory |

### Query

| Tool | Description |
| --- | --- |
| `superdoc_find` | Search by text pattern, node type, or both |
| `superdoc_get_node` | Get details about a specific node |
| `superdoc_info` | Get document metadata and structure |
| `superdoc_get_text` | Get the full plain text of the document |

### Mutation

| Tool | Description |
| --- | --- |
| `superdoc_insert` | Insert text at a position |
| `superdoc_replace` | Replace content at a range |
| `superdoc_delete` | Delete content at a range |

### Format

| Tool | Description |
| --- | --- |
| `superdoc_format` | Toggle formatting (`bold`, `italic`, `underline`, `strikethrough`) on a text range |

### Create

| Tool | Description |
| --- | --- |
| `superdoc_create` | Create a new block element (`paragraph`, `heading`) |

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
