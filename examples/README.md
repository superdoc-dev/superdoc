# SuperDoc Examples

Minimal, self-contained examples showing how to use SuperDoc.

## Getting Started

| Example | Description |
|---------|-------------|
| [react](./getting-started/react) | React + TypeScript with Vite |
| [vue](./getting-started/vue) | Vue 3 + TypeScript with Vite |
| [vanilla](./getting-started/vanilla) | Plain JavaScript with Vite |
| [cdn](./getting-started/cdn) | Zero build tools — just an HTML file |

## Features

| Example | Description | Docs |
|---------|-------------|------|
| [track-changes](./features/track-changes) | Accept/reject workflow with suggesting mode | [Track Changes](https://docs.superdoc.dev/editor/built-in-ui/track-changes) |
| [ai-redlining](./features/ai-redlining) | LLM-powered document review with tracked changes | [AI Agents](https://docs.superdoc.dev/getting-started/ai) |
| [comments](./features/comments) | Threaded comments with resolve workflow and event log | [Comments](https://docs.superdoc.dev/editor/built-in-ui/comments) |
| [custom-toolbar](./features/custom-toolbar) | Custom button groups, excluded items, and custom buttons | [Toolbar](https://docs.superdoc.dev/editor/built-in-ui/toolbar) |
| [collaboration](./collaboration) | Real-time editing with various Yjs providers | [Guides](https://docs.superdoc.dev/guides) |
| [headless](./headless) | Server-side AI redlining with Node.js | [AI Agents](https://docs.superdoc.dev/getting-started/ai) |

## AI Integrations

Connect SuperDoc's Document Engine to cloud AI platforms and agent frameworks.

### Cloud Platforms

| Integration | Description | Docs |
|-------------|-------------|------|
| [AWS Bedrock](./ai/bedrock) | Bedrock Converse API with tool use | [Integrations](https://docs.superdoc.dev/ai/agents/integrations) |
| [Google Vertex AI](./ai/vertex) | Gemini with function calling | [Integrations](https://docs.superdoc.dev/ai/agents/integrations) |

### Agent Frameworks

| Integration | Description | Docs |
|-------------|-------------|------|
| [Vercel AI SDK](./ai/vercel-ai) | Any model via the Vercel AI SDK | [Integrations](https://docs.superdoc.dev/ai/agents/integrations) |
| [LangChain](./ai/langchain) | LangGraph ReAct agent | [Integrations](https://docs.superdoc.dev/ai/agents/integrations) |

### Demos

| Example | Description | Docs |
|---------|-------------|------|
| [Contract Review](./ai/contract-review) | Full demo: agentic + headless contract review | [AI Agents](https://docs.superdoc.dev/getting-started/ai) |

## Running an example

```bash
cd <example>
npm install
npm run dev
```

For the CDN example, just open `index.html` or run `npx serve .`.

## Documentation

- [Getting Started](https://docs.superdoc.dev/getting-started/quickstart)
- [Configuration](https://docs.superdoc.dev/editor/superdoc/configuration)
