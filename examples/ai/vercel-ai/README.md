# SuperDoc + Vercel AI SDK

Agentic document editing using the Vercel AI SDK. The cleanest integration — `generateText` handles the agentic loop automatically.

**Docs:** [Integrations](https://docs.superdoc.dev/document-engine/ai-agents/integrations)

## Prerequisites

- `OPENAI_API_KEY` environment variable (or swap the provider)

## Run

```bash
npm install
OPENAI_API_KEY=sk-... npx tsx index.ts contract.docx reviewed.docx
```

## Configuration

The example uses OpenAI by default. Swap the provider import to use any model Vercel AI supports:

```typescript
// OpenAI (default)
import { openai } from '@ai-sdk/openai';
model: openai('gpt-4o')

// Anthropic
import { anthropic } from '@ai-sdk/anthropic';
model: anthropic('claude-sonnet-4-6-20250514')

// Google
import { google } from '@ai-sdk/google';
model: google('gemini-2.5-pro')
```

## How it works

1. Connects to SuperDoc via the SDK
2. Loads tool definitions in Vercel format and wraps them as `tool()` objects
3. Calls `generateText` with `maxSteps: 20` — the SDK handles the tool call loop
4. Saves the reviewed document
