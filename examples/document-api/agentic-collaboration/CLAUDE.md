# Agentic Collaboration Demo

A chat-based AI agent that edits documents using the SuperDoc SDK and OpenAI.

## Architecture

```
Vue Client (5173)          Collaboration Server (3050)          AI Agent
┌─────────────────┐        ┌─────────────────────────┐        ┌─────────────────┐
│ SuperDoc Editor │◄──────►│ /collaboration/:docId   │◄──────►│ SDK client.open │
│ Chat Sidebar    │◄──────►│ /chat/:roomId           │◄──────►│ Chat WebSocket  │
└─────────────────┘        └─────────────────────────┘        └─────────────────┘
```

- **Client**: Vue 3 app with SuperDoc editor and chat sidebar
- **Server**: Fastify with WebSocket for collaboration (Yjs) and chat
- **Agent**: Node.js process using SuperDoc SDK + OpenAI for document editing

## Project Structure

```
client/
  src/App.vue          Main Vue component with editor + chat
  package.json         Vue/Vite dependencies

server/
  server.ts            Fastify server with collaboration + chat endpoints
  package.json         Server dependencies

agent/
  agent.ts             Main agent with agentic loop
  chat.ts              Chat WebSocket client class
  package.json         Agent dependencies (SDK, OpenAI)

.env                   Environment variables (OPENAI_API_KEY)
package.json           Root scripts (dev, install:all)
```

## Key Patterns

### SDK Client Setup

```typescript
import { createSuperDocClient, chooseTools, dispatchSuperDocTool, getSystemPrompt } from '@superdoc-dev/sdk';

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
const { tools } = await chooseTools({ provider: 'openai' });
// Returns array of OpenAI-compatible tool definitions
```

**Note**: The npm SDK has a simple API - just `{ provider }`. No `mode`, `groups`, or other options.

### System Prompt

```typescript
const systemPrompt = await getSystemPrompt();
// Reads from SDK's system-prompt.md file (async because it reads from disk)
```

### Executing Tools

```typescript
const result = await dispatchSuperDocTool(doc, 'insert_content', {
  value: 'Hello, world!',
  type: 'text',
});
```

### Agentic Loop Pattern

```typescript
const MAX_ITERATIONS = 20;  // Prevent infinite loops

for (let i = 0; i < MAX_ITERATIONS; i++) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4.1',
    messages,
    tools,
  });

  const message = response.choices[0].message;
  messages.push(message);

  if (!message.tool_calls?.length) {
    return message.content;  // Done - no more tool calls
  }

  for (const call of message.tool_calls) {
    const result = await dispatchSuperDocTool(doc, call.function.name, JSON.parse(call.function.arguments));
    messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
  }
}
```

### Two-Array Conversation Pattern

The agent uses two arrays to manage conversation:

- **`conversationHistory`**: Persistent array with system prompt + user messages + final assistant text responses (no tool calls)
- **`messages`**: Working array built fresh each turn from `[...conversationHistory]`, accumulates tool calls during processing

This keeps context clean - the LLM sees past conversation outcomes but not old tool call details.

## SuperDoc Configuration

### Layout Engine Options

Use `layoutEngineOptions` instead of deprecated `pagination`:

```javascript
new SuperDoc({
  // ...
  layoutEngineOptions: {
    flowMode: 'semantic',  // Continuous flow without pagination
  },
});
```

**Flow modes**:
- `'paginated'` (default): Standard page-first layout
- `'semantic'`: Continuous semantic flow without visible pagination boundaries

### Toolbar Configuration

```javascript
new SuperDoc({
  toolbar: '#superdoc-toolbar',
  toolbarGroups: ['center'],  // Reduces toolbar size
  modules: {
    toolbar: {
      excludeItems: ['link', 'table', 'image'],  // Remove specific buttons
    },
  },
});
```

## Chat Serialization

The `Chat` class uses a queue to serialize message processing:

```typescript
class Chat {
  private processing = false;
  private queue: string[] = [];

  serve(handler) {
    this.ws.on('message', (data) => {
      // Queue messages instead of processing immediately
      this.queue.push(msg.message.content);
      this.processQueue(handler);
    });
  }

  private async processQueue(handler) {
    if (this.processing) return;  // Already processing
    this.processing = true;
    while (this.queue.length > 0) {
      const content = this.queue.shift();
      await handler(content);  // Process one at a time
    }
    this.processing = false;
  }
}
```

This prevents concurrent requests from corrupting the shared conversation history.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | OpenAI API key for the agent |

The `.env` file should be in the root of this example directory. The agent loads it with:

```typescript
dotenv.config({ path: join(__dirname, '..', '.env') });
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run install:all` | Install dependencies for root + client + server + agent |
| `npm run dev` | Run all components (server starts first, agent waits 2s) |
| `npm run dev:server` | Run only the server |
| `npm run dev:client` | Run only the Vue client |
| `npm run dev:agent` | Run only the agent |

## Common Issues

### Agent shows "Offline"

- Check terminal for errors
- Verify `OPENAI_API_KEY` is set in `.env`
- Ensure server is running before agent connects

### Race condition on startup

The dev script adds a 2-second delay before starting the agent:

```json
"dev": "concurrently \"npm run dev:server\" \"npm run dev:client\" \"sleep 2 && npm run dev:agent\""
```

### Tool loop runs forever

The agent has `MAX_ITERATIONS = 20` to prevent infinite tool-calling loops.

### Concurrent requests corrupt history

The Chat class queues messages and processes them sequentially.

## SDK Version

This example uses `@superdoc-dev/sdk@^1.1.0`. The SDK provides:

- `createSuperDocClient()` - Create SDK client
- `chooseTools({ provider })` - Get LLM tool definitions
- `dispatchSuperDocTool(doc, name, args)` - Execute a tool
- `getSystemPrompt()` - Get the recommended system prompt (async)

## Collaboration Server

The server uses `@superdoc-dev/superdoc-yjs-collaboration` with Fastify:

```typescript
const SuperDocCollaboration = new CollaborationBuilder()
  .withName('SuperDoc Collaboration service')
  .withDebounce(2000)
  .onConfigure(handleConfig)
  .onLoad(handleLoad)
  .onAuthenticate(handleAuth)
  .build();

// WebSocket route
fastify.get('/collaboration/:documentId', { websocket: true }, (socket, request) => {
  SuperDocCollaboration.welcome(socket, request);
});
```

The `onChange` and `onAutoSave` callbacks are optional and not needed for this example.
