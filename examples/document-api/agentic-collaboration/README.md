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
│  - Connects to document via SDK (client.doc.open)                   │
│  - Uses chooseTools() to get Document API tools                     │
│  - Processes requests with OpenAI gpt-4o                            │
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
npm install
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

| File | Description |
|------|-------------|
| `agent.ts` | AI agent with SDK integration and agentic loop |
| `server.ts` | Fastify server for collaboration + chat WebSocket |
| `src/App.vue` | Vue client with editor and chat sidebar |

## SDK Usage

### Connecting to a Document

```typescript
import { createSuperDocClient } from '@superdoc-dev/sdk';

const client = createSuperDocClient();
await client.connect();

await client.doc.open({
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

const { tools } = await chooseTools({
  provider: 'openai',
  mode: 'all',  // Include mutation tools
});

// tools is an array of OpenAI-compatible tool definitions
```

### Executing Tools

```typescript
import { dispatchSuperDocTool } from '@superdoc-dev/sdk';

// Insert content at end of document
await dispatchSuperDocTool(client, 'insert_content', {
  value: '# New Heading\n\nSome paragraph text.',
  type: 'markdown',
});

// Get document text
const text = await client.doc.getText({});
```

### Agentic Loop

```typescript
for (let i = 0; i < 10; i++) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages,
    tools,
    tool_choice: i === 0 ? 'required' : 'auto',
  });

  const message = response.choices[0].message;

  if (!message.tool_calls?.length) {
    return message.content;  // Done
  }

  // Execute each tool call
  for (const call of message.tool_calls) {
    const args = JSON.parse(call.function.arguments);
    const result = await dispatchSuperDocTool(client, call.function.name, args);
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
| `npm run dev:client:remote` | Run local frontend against deployed backend |
| `npm run deploy:backend` | Deploy backend to Google Cloud Run |
| `npm run deploy:frontend` | Deploy frontend to Cloudflare Pages |

## Deployment

The demo can be deployed with the frontend on Cloudflare Pages and the backend on Google Cloud Run.

### Prerequisites

- **Google Cloud CLI** (`gcloud`) authenticated with a project
- **Wrangler CLI** (`npx wrangler`) authenticated with Cloudflare
- **OpenAI API key** in `.env`

### Step 1: Deploy Backend (Cloud Run)

The backend includes the collaboration server and AI agent in a single container.

```bash
# Make sure .env has your OpenAI key
npm run deploy:backend
```

This will:
1. Build a Docker container with the server and agent
2. Push it to Google Container Registry
3. Deploy to Cloud Run with WebSocket support
4. Output the service URL (e.g., `https://superdoc-agent-demo-xxxxx.run.app`)

### Step 2: Configure Frontend

Add the backend URL to your `.env` file:

```bash
# .env
OPENAI_API_KEY=sk-your-key-here
VITE_BACKEND_URL=https://superdoc-agent-demo-xxxxx.run.app
```

### Step 3: Deploy Frontend (Cloudflare Pages)

```bash
npm run deploy:frontend
```

This will:
1. Build the Vue client with the backend URL baked in
2. Deploy to Cloudflare Pages (project: `document-api-agentic-demo`)

The frontend will be available at: `https://document-api-agentic-demo.pages.dev`

### Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Cloudflare Pages (Frontend)                      │
│              https://document-api-agentic-demo.pages.dev            │
│                         Vue + SuperDoc Editor                       │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ WebSocket (wss://)
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Google Cloud Run (Backend)                       │
│              https://superdoc-agent-demo-xxxxx.run.app              │
│  ┌─────────────────────────┐    ┌─────────────────────────────────┐ │
│  │   Collaboration Server  │    │          AI Agent               │ │
│  │   (Fastify + Yjs)       │    │   (OpenAI + SuperDoc SDK)       │ │
│  └─────────────────────────┘    └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### Environment Variables

| Variable | Where | Description |
|----------|-------|-------------|
| `OPENAI_API_KEY` | Cloud Run | OpenAI API key for the agent |
| `VITE_BACKEND_URL` | Build time | Backend URL for frontend to connect to |

### Testing Locally with Deployed Backend

To test the local frontend against the deployed Cloud Run backend:

```bash
# 1. Set the backend URL in .env
echo "VITE_BACKEND_URL=https://superdoc-agent-demo-xxxxx.run.app" >> .env

# 2. Run only the frontend (no local server/agent)
npm run dev:client:remote
```

Open `http://localhost:5173` - the local Vue app will connect to the deployed backend.

### Health Check

The backend exposes a health endpoint for monitoring:

```bash
curl https://superdoc-agent-demo-xxxxx.run.app/health
# Returns: {"status":"ok"}
```

## Troubleshooting

### Agent shows "Offline"

Make sure the agent is running. Check the terminal for errors. The agent needs a valid `OPENAI_API_KEY` in `.env`.

### Tools not working

Some tools have complex schemas and are excluded. The agent logs show which tools are available.

### Edits not appearing

Both client and agent connect to the same collaboration room. The SDK handles syncing edits automatically.

## Learn More

- [SuperDoc Documentation](https://docs.superdoc.dev)
- [Document API SDK Reference](https://docs.superdoc.dev/document-api)
- [Self-hosted Collaboration Guide](https://docs.superdoc.dev/guides/superdoc-yjs)
