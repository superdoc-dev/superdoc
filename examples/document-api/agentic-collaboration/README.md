# SuperDoc Document Editing Agent

A chat-based AI agent that can read and modify documents using the SuperDoc SDK. This example demonstrates:

- Real-time chat interface with an AI document editing agent
- Agent uses `chooseTools()` to get LLM-compatible tool definitions
- Full agentic loop with tool calling via OpenAI
- Document edits broadcast to all clients via Yjs collaboration

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Vue Client (port 5173)                      │
│  ┌──────────────────────────┐    ┌────────────────────────────────┐ │
│  │     SuperDoc Editor      │    │       Chat Sidebar             │ │
│  │   (document editing)     │    │   - Send messages to agent     │ │
│  │                          │    │   - See agent responses        │ │
│  │                          │    │   - Agent status indicator     │ │
│  └──────────────────────────┘    └────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
              │                                │
              │ SuperDoc collaboration         │ WebSocket /chat/:roomId
              │ (document sync)                │ (simple JSON messages)
              ▼                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  Collaboration Server (port 3050)                   │
│                     Fastify + Yjs + WebSocket                       │
│         /collaboration/:docId        /chat/:roomId                  │
└─────────────────────────────────────────────────────────────────────┘
              ▲                                ▲
              │ SDK collaboration              │ WebSocket /chat/:roomId
              │                                │
┌─────────────────────────────────────────────────────────────────────┐
│                         AI Agent (Node.js)                          │
│  - Connects to document via SDK (client.open)                       │
│  - Uses chooseTools() to get Document API tools                     │
│  - Processes requests with OpenAI                                   │
│  - Executes tools via dispatchSuperDocTool()                        │
│  - Edits broadcast to all clients automatically                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Prerequisites

- **Node.js** 18+
- **OpenAI API key**

## Quick Start

### 1. Install dependencies

```bash
npm run install:all
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and add your OpenAI API key:

```
OPENAI_API_KEY=sk-your-key-here
```

### 3. Run the example

```bash
npm run dev
```

This starts:
- **Collaboration server** on `http://localhost:3050`
- **Vue client** on `http://localhost:5173`
- **AI agent** connected to the same document

### 4. Try it out

1. Open `http://localhost:5173`
2. Use the chat sidebar on the right to talk to the agent
3. Try commands like:
   - "Add a heading that says 'Introduction'"
   - "Insert a paragraph about AI"
   - "Make the first line bold"
   - "What's in this document?"

## Project Structure

```
client/          Vue frontend with SuperDoc editor and chat sidebar
server/          Fastify collaboration server with WebSocket endpoints
agent/           AI agent with SDK integration and agentic loop
```

## SDK Usage

### Connecting to a Document

```typescript
import { createSuperDocClient } from '@superdoc-dev/sdk';

const client = createSuperDocClient();
await client.connect();

const doc = await client.open({
  collaboration: {
    providerType: 'y-websocket',
    url: 'ws://localhost:3050/collaboration',
    documentId: 'my-doc',
  },
});
```

### Getting Tools for LLM

```typescript
import { chooseTools } from '@superdoc-dev/sdk';

const { tools } = await chooseTools({ provider: 'openai' });

// tools is an array of OpenAI-compatible tool definitions
```

### Executing Tools

```typescript
import { dispatchSuperDocTool } from '@superdoc-dev/sdk';

// Insert content at end of document
await dispatchSuperDocTool(doc, 'insert_content', {
  value: 'Hello, world!',
  type: 'text',
});

// Get document text
const result = await dispatchSuperDocTool(doc, 'get_document_text', {});
```

### Agentic Loop

```typescript
const MAX_ITERATIONS = 20;

for (let i = 0; i < MAX_ITERATIONS; i++) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4.1',
    messages,
    tools,
  });

  const message = response.choices[0].message;

  if (!message.tool_calls?.length) {
    return message.content;  // Done
  }

  // Execute each tool call
  for (const call of message.tool_calls) {
    const args = JSON.parse(call.function.arguments);
    const result = await dispatchSuperDocTool(doc, call.function.name, args);
    messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
  }
}
```

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Run all components (server + client + agent) |
| `npm run dev:server` | Run only the collaboration server |
| `npm run dev:client` | Run only the Vue client |
| `npm run dev:agent` | Run only the AI agent |

## Troubleshooting

### Agent shows "Offline"

Make sure the agent is running. Check the terminal for errors. The agent needs a valid `OPENAI_API_KEY` in `.env`.

### Edits not appearing

Both client and agent connect to the same collaboration room. The SDK handles syncing edits automatically.

## Learn More

- [SuperDoc Documentation](https://docs.superdoc.dev)
- [Document API SDK Reference](https://docs.superdoc.dev/document-api)
- [Self-hosted Collaboration Guide](https://docs.superdoc.dev/guides/superdoc-yjs)
