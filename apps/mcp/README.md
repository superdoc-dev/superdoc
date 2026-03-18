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

The MCP server exposes 12 tools total:

- 3 lifecycle tools: `superdoc_open`, `superdoc_save`, `superdoc_close`
- 9 grouped intent tools generated from the SDK catalog

All tools except `superdoc_open` take a `session_id` from `superdoc_open`.

### Lifecycle

| Tool | Description |
| --- | --- |
| `superdoc_open` | Open a `.docx` file and get a `session_id` |
| `superdoc_save` | Save the document to disk (original path or custom `out` path) |
| `superdoc_close` | Close the session and release memory |

### Intent tools

| Tool | Actions | Description |
| --- | --- | --- |
| `superdoc_get_content` | `text`, `markdown`, `html`, `info` | Read document content in different formats |
| `superdoc_search` | `match` | Find text or nodes and return handles or addresses for later edits |
| `superdoc_edit` | `insert`, `replace`, `delete`, `undo`, `redo` | Perform text edits and history actions |
| `superdoc_format` | `inline`, `set_style`, `set_alignment`, `set_indentation`, `set_spacing` | Apply inline or paragraph formatting |
| `superdoc_create` | `paragraph`, `heading` | Create structural block elements |
| `superdoc_list` | `insert`, `create`, `detach`, `indent`, `outdent`, `set_level`, `set_type` | Create and manipulate lists |
| `superdoc_comment` | `create`, `update`, `delete`, `get`, `list` | Manage comment threads |
| `superdoc_track_changes` | `list`, `decide` | Review and resolve tracked changes |
| `superdoc_mutations` | `preview`, `apply` | Execute multi-step atomic edits as a batch |

## Workflow

Every interaction follows the same pattern:

```
open → read/search → edit → save → close
```

1. `superdoc_open` loads a document and returns a `session_id`
2. `superdoc_get_content` reads the current document and `superdoc_search` finds stable handles or addresses
3. Intent tools use `session_id` plus `action` to modify content
4. `superdoc_save` writes changes to disk
5. `superdoc_close` releases the session

### Tracked changes

Actions that support tracked edits use the underlying Document API's `changeMode: "tracked"` option. Review or resolve tracked edits with `superdoc_track_changes`.

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
