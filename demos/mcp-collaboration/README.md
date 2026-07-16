# SuperDoc Live MCP Collaboration

Open a DOCX in SuperDoc, connect Codex or Claude Code through MCP, and watch
the agent's edits appear live in the browser. The demo contains no LLM and
requires no model API key: your MCP client supplies the agent.

> **Local demo only.** The MCP server exposes local file tools and uses a fixed
> bearer token. It binds to `127.0.0.1`; do not publish it to a network.

The implementation and review checklist is maintained in
[IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md).

## Architecture

```text
Browser (React + SuperDoc)
          │
          │ Yjs WebSocket
          ▼
Room server + y-websocket relay
          ▲
          │ Yjs WebSocket via superdoc_attach
          │
Hosted SuperDoc MCP server
          ▲
          │ Streamable HTTP + demo bearer token
          │
Codex / Claude Code
```

The room server imports the DOCX and keeps a headless SuperDoc SDK document in
the Yjs room. The browser and MCP server join that same room. Yjs—not the
original file—is the live source of truth while the room is active.

## Quick start

Prerequisites: Node.js 20+, pnpm, and either Codex or Claude Code. `make
install` installs the demo's local Bun test runner and builds the local
SuperDoc, React, SDK, and native CLI artifacts used by the four processes.

```bash
cd demos/mcp-collaboration
make install
make dev
```

No `.env` file or model API key is used.

Open <http://127.0.0.1:5173>, create a room from the sample document, and use
the connection sidebar. The services are:

| Service   | Address                     |
| --------- | --------------------------- |
| Client    | `http://127.0.0.1:5173`     |
| Room API  | `http://127.0.0.1:8090`     |
| Yjs relay | `ws://127.0.0.1:8081`       |
| MCP       | `http://127.0.0.1:8091/mcp` |

## Connect Codex

```bash
export MCP_DEMO_TOKEN=superdoc-demo
codex mcp add superdoc-live \
  --url http://127.0.0.1:8091/mcp \
  --bearer-token-env-var MCP_DEMO_TOKEN
```

## Connect Claude Code

```bash
claude mcp add \
  --transport http \
  --header "Authorization: Bearer superdoc-demo" \
  superdoc-live \
  http://127.0.0.1:8091/mcp
```

After connecting, paste the room-specific prompt shown in the sidebar. It asks
the agent to call `superdoc_attach` with the Yjs URL, room ID, and agent
identity. The returned `session_id` works with every other SuperDoc MCP tool.

## Saving DOCX

MCP edits update Yjs immediately and render in every connected SuperDoc
editor. They do not continuously rewrite the uploaded file. Use **Download
DOCX** in the room header to export the room's current state. An MCP client can
also use `superdoc_save`, but its output path belongs to the MCP server process.

## Tests

```bash
make test
```

The suite typechecks all components, preserves the stdio MCP regression suite,
tests HTTP authentication and protocol behavior with the official MCP client,
verifies live edits across a real Yjs relay, tests generated connection
snippets, and builds the frontend. It makes no model requests.

## Production follow-ups

A public deployment would need OAuth or expiring capability tokens, TLS/WSS,
filesystem-tool restrictions, WebSocket destination allowlisting, per-user
session isolation, persistent rooms, rate limiting, audit logging, and a
deliberate ChatGPT deployment model. Those concerns are intentionally outside
this small local integration demo.
