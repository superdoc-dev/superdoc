# SuperDoc AI Agent Example

Real-time collaborative document editing with an AI agent. You upload a `.docx` file, the AI edits it through SuperDoc's tool system, and every change appears live in your browser via Y.js CRDT sync.

## How It Works

There are two processes. The **client** is a React app that renders the SuperDoc editor and a chat interface. The **server** runs the AI agent (OpenAI function calling loop) and a Y.js WebSocket relay. Both connect to the same Y.js collaboration room, so edits made by the AI agent appear instantly in the browser.

```
You (browser)                              Server
┌──────────────────────┐                  ┌────────────────────────────┐
│                      │                  │                            │
│  SuperDoc Editor     │◄── Y.js CRDT ──► │  y-websocket  (port 8081)  │
│  (renders document)  │    (WebSocket)   │  (syncs Y.js state)        │
│                      │                  │                            │
│  Chat + Tool Logs    │── HTTP / SSE ──► │  Agent API   (port 8090)   │
│  (sends prompts,     │                  │  ├─ OpenAI streaming       │
│   shows tool calls)  │                  │  ├─ SuperDoc SDK           │
│                      │                  │  └─ Room manager           │
└──────────────────────┘                  └────────────────────────────┘
      port 5173                                       │
                                                      ▼
                                                 OpenAI API
```

**The data flow for a single prompt:**

1. You type "Make the title bold" in the chat sidebar
2. The client sends the prompt to the agent API via `POST /v1/rooms/:id/messages`
3. The agent server builds a message array (system prompt + conversation history + your prompt) and calls the OpenAI API with SuperDoc tool definitions
4. OpenAI responds with tool calls (e.g., `superdoc_search` to find the title, then `superdoc_format` to bold it)
5. The agent executes each tool call against the SuperDoc SDK, which modifies the document via ProseMirror
6. ProseMirror changes propagate through `y-prosemirror` to the Y.js document
7. The y-websocket server relays the Y.js update to the browser
8. The browser's Y.js provider receives the update, applies it to its local Y.Doc, and SuperDoc re-renders
9. Meanwhile, each tool call and token is streamed back to the chat UI via Server-Sent Events

## Quick Start

Prerequisites: Node.js 22+, pnpm (for client), an OpenAI API key.

```bash
# 1. Install dependencies
make install

# 2. Add your OpenAI API key
#    (make install creates .env from template if missing)
echo "OPENAI_API_KEY=sk-..." > .env

# 3. Start everything
make dev
```

Open [http://localhost:5173](http://localhost:5173). Upload a `.docx` file (or click "Use sample document"), then chat with the AI to edit it.

## Project Structure

```
ai-node-sdk/
├── .env                    Your OpenAI API key (git-ignored)
├── .env.example            Template
├── Makefile                All dev commands
│
├── client/                 React frontend (Vite, port 5173)
│   ├── src/
│   │   ├── pages/
│   │   │   ├── landing.tsx             Create/join room form
│   │   │   └── room.tsx                Three-panel editor view
│   │   ├── components/
│   │   │   ├── editor/
│   │   │   │   ├── editor-workspace.tsx  SuperDoc + Y.js provider wiring
│   │   │   │   ├── editor-layout.tsx     Three-panel layout (tools | editor | chat)
│   │   │   │   └── room-header.tsx       Room ID, connection status
│   │   │   ├── chat/
│   │   │   │   ├── chat-sidebar.tsx      Chat container, model/mode controls
│   │   │   │   ├── chat-input.tsx        Input with inline suggestions
│   │   │   │   ├── message-bubble.tsx    User/assistant message rendering
│   │   │   │   └── suggestion-chips.tsx  Prompt suggestions
│   │   │   ├── tool-logs/
│   │   │   │   ├── tool-logs-sidebar.tsx  Trace list container
│   │   │   │   ├── trace-group.tsx        One trace per prompt
│   │   │   │   └── tool-call-entry.tsx    Single tool call with I/O
│   │   │   └── shared/
│   │   │       ├── json-viewer.tsx        Inline JSON display
│   │   │       ├── json-modal.tsx         Draggable/resizable JSON window
│   │   │       └── json-modal-manager.tsx Multi-instance modal system
│   │   ├── hooks/
│   │   │   ├── use-agent-stream.ts   SSE consumer, manages traces
│   │   │   ├── use-start-room.ts     TanStack mutation for room creation
│   │   │   ├── use-room-status.ts    TanStack query, polls agent readiness
│   │   │   └── use-send-message.ts   TanStack mutation for chat messages
│   │   ├── lib/
│   │   │   ├── agent-api.ts          Fetch wrappers for all server endpoints
│   │   │   ├── sse-parser.ts         Async generator for SSE streams
│   │   │   └── room-names.ts         Random room name generator
│   │   └── types/
│   │       ├── agent.ts              SSE events, Trace, ToolCallEntry, ChatMessage
│   │       └── room.ts              RoomStatus, RoomConfig
│   └── package.json
│
└── server/                 Agent + collab server (Fastify, ports 8090 + 8081)
    ├── src/
    │   ├── index.ts                  Fastify app, CORS, route registration
    │   ├── routes/
    │   │   └── rooms.ts              REST endpoints + SSE streaming
    │   ├── agent/
    │   │   ├── runner.ts             OpenAI streaming loop (async generator)
    │   │   └── tools.ts              chooseTools + dispatchSuperDocTool wrappers
    │   ├── runtime/
    │   │   └── room-manager.ts       Multi-room state, conversation history, SSE dispatch
    │   └── superdoc/
    │       └── editor.ts             SDK client lifecycle (create/dispose)
    └── package.json
```

## How the Pieces Connect

### Room creation

When you click "Create Room", the client sends a `POST /v1/rooms/:roomId/start` request (with the uploaded file as multipart form data). The server saves the file to a temp directory, then boots a SuperDoc SDK client:

```
client.open({ doc: '/tmp/room.docx', collaboration: { url: 'ws://localhost:8081', documentId: roomId } })
```

This spawns a headless SuperDoc CLI process that opens the document and connects to the y-websocket room. The CLI's `y-prosemirror` plugin syncs the ProseMirror document state into the Y.js room. Once this completes, `agentReady` becomes `true`.

The browser polls `GET /v1/rooms/:roomId/status` every second. When `agentReady` is true, the room page renders the editor. The `EditorWorkspace` component creates a `Y.Doc` + `WebsocketProvider` (cached at module level to survive HMR), waits for the `sync` event, then renders `<SuperDocEditor>` with the synced Y.Doc.

### Chat and streaming

When you send a message, the client calls `POST /v1/rooms/:roomId/messages` which returns a `messageId`. The client immediately opens an SSE stream at `GET /v1/rooms/:roomId/messages/:messageId/stream`.

The server fires the OpenAI streaming loop (`runner.ts`) as an async generator. Each event (token, tool_call_start, tool_call_end, done) is yielded, pushed to SSE subscribers, and written to the HTTP response as `data: {...}\n\n` lines.

The client's `useAgentStream` hook parses these events and updates React state: tokens accumulate into the chat bubble, tool calls populate the trace in the left sidebar.

### Tool execution

The runner loads all SuperDoc tool definitions via `chooseTools({ provider: 'openai' })` and sends them with the OpenAI request. When OpenAI responds with tool calls, the runner:

1. Assembles streaming tool call deltas (OpenAI splits function arguments across multiple chunks)
2. Parses the accumulated JSON arguments
3. Dispatches each call via `dispatchSuperDocTool(documentHandle, toolName, args)`
4. The SDK validates the args against the tool schema, routes to the correct document API operation, and executes it
5. The result is sent back to OpenAI as a tool response for the next turn

This continues for up to 15 turns until OpenAI responds without tool calls (just text).

### Y.js collaboration

Both the browser and the SDK use the same `y-websocket` protocol to connect to port 8081. The y-websocket server is a standard Y.js relay: it maintains Y.Doc state per room in memory, syncs new clients on connect, and broadcasts updates between peers. No persistence. Rooms are ephemeral and lost on server restart.

The browser creates its Y.Doc and provider at module level (not inside a React effect) so they survive Vite HMR. This means you can edit frontend code without losing the document state.

## Commands

| Command | What it does |
|---------|-------------|
| `make install` | Install server deps (npm) and client deps (pnpm) |
| `make dev` | Start server + client using the published npm SDK |
| `make dev-local` | Start using the local monorepo SDK (builds CLI binary if needed) |
| `make dev-server` | Start server only |
| `make dev-client` | Start client only |
| `make rebuild-local-sdk` | Rebuild the CLI binary after changes to `apps/cli/` |
| `make kill` | Kill any running instances |
| `make clean` | Remove all node_modules |
| `make help` | Show all commands |

### Local SDK development

`make dev-local` symlinks `server/node_modules/@superdoc-dev/sdk` to the workspace source at `packages/sdk/langs/node/` and copies the locally-built CLI binary. Changes to the SDK source are picked up immediately (symlink). Changes to the CLI require `make rebuild-local-sdk`.

## Server API

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/v1/rooms/:roomId/start` | Create room, upload file, boot SDK client |
| `GET` | `/v1/rooms/:roomId/status` | Room status (agentReady, model, mode) |
| `POST` | `/v1/rooms/:roomId/messages` | Send prompt, returns messageId |
| `GET` | `/v1/rooms/:roomId/messages/:id/stream` | SSE stream of execution events |
| `POST` | `/v1/rooms/:roomId/messages/:id/cancel` | Abort active execution |
| `POST` | `/v1/rooms/:roomId/settings` | Update model or edit mode |
| `POST` | `/v1/rooms/:roomId/stop` | Dispose SDK client, clean up room |

## Technologies

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Editor | `@superdoc-dev/react` | SuperDoc React wrapper |
| Collaboration | `yjs` + `y-websocket` | CRDT sync between browser and agent |
| AI | `openai` (streaming) | Chat completions with function calling |
| SDK | `@superdoc-dev/sdk` | Document operations via tool dispatch |
| Frontend | React 19, Vite, Tailwind v4, shadcn/ui | UI framework |
| API calls | TanStack Query | Mutations and polling |
| Server | Fastify | HTTP server with SSE |
