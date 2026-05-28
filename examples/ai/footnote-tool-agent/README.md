# SuperDoc - Footnote tool agent

Real LLM tool-calling against a live SuperDoc document. The user types a natural-language request; the model picks a tool; the browser executes it against the Document API; the document updates. The `OPENAI_API_KEY` never leaves the server.

## Files, in the order you'd read them

1. **`src/tool.ts`** — the Document API wrapper. One function: `addFootnoteCitation(api, { sourceText })`. Wraps `selection.current` + `footnotes.insert` + `footnotes.list` and returns a typed receipt.
2. **`src/agent.ts`** — the tool-use loop. `runAgentTurn` posts the user message, dispatches any `tool_calls` the model returns to local handlers, sends results back, and emits events to the UI. SDK-agnostic — speaks the Chat Completions message shape but doesn't import any provider SDK.
3. **`src/App.tsx`** — the UI. Mounts SuperDoc, captures the user prompt, binds `addFootnoteCitation` to the live `editor.doc` as a handler, calls `runAgentTurn`, renders chat rows.
4. **`server.mjs`** — the proxy. Declares the tool schema (`strict: true`, `parallel_tool_calls: false`), forwards turn requests to `openai.chat.completions.create`, returns the assistant message untouched.

## Architecture

```
Browser ──POST /api/turn──▶ Node proxy ──▶ OpenAI
   ▲                            │
   │       message or         ◀┘
   │       tool_calls
   ▼
editor.doc.* (tool execution lives here)
   │
   └── POST /api/turn with the tool result, loop until the model returns text
```

| Surface  | Owns                                   |
| -------- | -------------------------------------- |
| Server   | API key, model client, tool **schema** |
| Browser  | Editor, Document API, tool **impl**    |

The browser owns tool execution because `editor.doc` lives there. The server has no editor. So the server runs the model conversation; the browser runs the document.

## Adding more tools

1. Add a handler in `src/App.tsx`'s `handlers` map.
2. Mirror the JSON schema in `server.mjs`'s `TOOLS` array.

That's it. The loop and dispatch in `src/agent.ts` are tool-agnostic.

## Run

```bash
cp .env.example .env       # then add your OPENAI_API_KEY
pnpm install
pnpm dev                   # Node proxy + Vite, run together
```

Open http://localhost:5181. Click into the paragraph, then send a message like:

> Add a footnote citing Doe's 2024 cloud reliability paper.

The chat shows: user → `used addFootnoteCitation · ok` → one-line assistant confirmation. The doc shows the superscript marker.

## Notes

- Non-streaming: each `/api/turn` call is request/response. For a streaming-token UX layered on top of tool calls, swap to the Responses API or SSE per-event delivery.
- Each `send` starts a fresh tool loop — prior turns are not preserved. For multi-turn conversations, lift `messages` into app state and append rather than replace.
- For production, add auth, rate limiting, a stricter iteration cap, and reject tool calls that aren't in the registry.

## See also

- [examples/ai/streaming](../streaming) — SSE token streaming into a document (no tool use).
