# SuperDoc - Streaming LLM into a document

Stream tokens from an LLM straight into a SuperDoc editor, ChatGPT-style. The browser appends each text delta to the document via the SuperDoc Document API. The OpenAI key never leaves the server.

## Architecture

```
Browser  ───POST /api/generate──▶  Node proxy (server.mjs)  ──▶  OpenAI
   ▲                                       │
   └──── Server-Sent Events ◀──────────────┘
   │
   └─── editor.doc.insert({ value, type: 'text' })
```

- `server.mjs` reads `OPENAI_API_KEY` from `.env` and re-emits OpenAI's stream as SSE events.
- The browser fetches `/api/generate`, parses the SSE stream, and appends tokens to the SuperDoc editor.
- Tokens are buffered and flushed at most every 150ms (or immediately on a newline) to avoid one document mutation per token.

## How the streaming works

```ts
for await (const chunk of streamFromServer(prompt, signal)) {
  buffer += chunk;
  if (chunk.includes('\n')) flush();
  else if (!pendingFlush) pendingFlush = setTimeout(flush, 150);
}

function flush() {
  editor.doc.insert({ value: buffer, type: 'text' });
  buffer = '';
}
```

`editor.doc` is the public Document API. With no `target`/`ref`, `insert` appends at the end of the document. Newlines become paragraph breaks.

## Run

```bash
cp .env.example .env       # then add your OPENAI_API_KEY
pnpm install
pnpm dev                   # runs the Node proxy and Vite together
```

Open http://localhost:5180.

## Notes

- This example streams plain text. For headings, lists, tables, or bold, switch to `type: 'markdown'` and buffer until you have complete blocks before calling `insert`.
- For tracked-change-style streaming (a human reviewer can accept/reject), pass `{ changeMode: 'tracked' }` as the second argument.
- The component aborts the in-flight stream on unmount, and the server aborts upstream when the client disconnects, so neither side burns tokens after Stop or navigation.
- For production, add auth, rate limiting, and per-user storage around `server.mjs`.
