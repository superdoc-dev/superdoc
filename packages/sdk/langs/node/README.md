# @superdoc-dev/sdk

Programmatic SDK for deterministic DOCX operations through SuperDoc's Document API.

## Install

```bash
npm install @superdoc-dev/sdk
```

The package automatically installs a native CLI binary for your platform via optionalDependencies. Supported platforms:

| Platform | Package |
|----------|---------|
| macOS (Apple Silicon) | `@superdoc-dev/sdk-darwin-arm64` |
| macOS (Intel) | `@superdoc-dev/sdk-darwin-x64` |
| Linux (x64) | `@superdoc-dev/sdk-linux-x64` |
| Linux (ARM64) | `@superdoc-dev/sdk-linux-arm64` |
| Windows (x64) | `@superdoc-dev/sdk-windows-x64` |

## Quick Start

```ts
import { createSuperDocClient } from '@superdoc-dev/sdk';

const client = createSuperDocClient();
await client.connect();

await client.doc.open({ doc: './contract.docx' });

const info = await client.doc.info();
console.log(info.counts);

const results = await client.doc.find({ query: { kind: 'text', pattern: 'termination' } });

await client.doc.replace({
  target: results.context[0].textRanges[0],
  text: 'expiration',
});

await client.doc.save({ inPlace: true });
await client.doc.close();
await client.dispose();
```

## API

### Client

```ts
import { SuperDocClient, createSuperDocClient } from '@superdoc-dev/sdk';

const client = createSuperDocClient(options?);
await client.connect();    // start the host process
await client.dispose();    // shut down gracefully
```

All document operations are on `client.doc`:

```ts
client.doc.open(params)
client.doc.find(params)
client.doc.insert(params)
// ... etc
```

### Operations

| Category | Operations |
|----------|-----------|
| **Query** | `find`, `getNode`, `getNodeById`, `info` |
| **Mutation** | `insert`, `replace`, `delete` |
| **Format** | `format.bold`, `format.italic`, `format.underline`, `format.strikethrough` |
| **Create** | `create.paragraph` |
| **Lists** | `lists.list`, `lists.get`, `lists.insert`, `lists.setType`, `lists.indent`, `lists.outdent`, `lists.restart`, `lists.exit` |
| **Comments** | `comments.add`, `comments.edit`, `comments.reply`, `comments.move`, `comments.resolve`, `comments.remove`, `comments.setInternal`, `comments.setActive`, `comments.goTo`, `comments.get`, `comments.list` |
| **Track Changes** | `trackChanges.list`, `trackChanges.get`, `trackChanges.accept`, `trackChanges.reject`, `trackChanges.acceptAll`, `trackChanges.rejectAll` |
| **Lifecycle** | `open`, `save`, `close` |
| **Session** | `session.list`, `session.save`, `session.close`, `session.setDefault` |
| **Introspection** | `status`, `describe`, `describeCommand` |

### AI Tool Integration

The SDK includes built-in support for exposing document operations as AI tool definitions:

```ts
import { chooseTools, dispatchSuperDocTool, inferDocumentFeatures } from '@superdoc-dev/sdk';

// Get tool definitions for your AI provider
const { tools, selected } = await chooseTools({
  provider: 'openai',       // 'openai' | 'anthropic' | 'vercel' | 'generic'
  profile: 'intent',        // human-friendly tool names
  taskContext: { phase: 'mutate' },
  documentFeatures: inferDocumentFeatures(await client.doc.info()),
});

// Dispatch a tool call from the AI model
const result = await dispatchSuperDocTool(client, toolName, args);
```

| Function | Description |
|----------|-------------|
| `chooseTools(input)` | Select tools filtered by phase, capabilities, and budget |
| `listTools(provider, options?)` | List all tool definitions for a provider |
| `dispatchSuperDocTool(client, toolName, args)` | Execute a tool call against a client |
| `resolveToolOperation(toolName)` | Map a tool name to its operation ID |
| `getToolCatalog(options?)` | Load the full tool catalog |
| `inferDocumentFeatures(infoResult)` | Derive feature flags from `doc.info` output |

## Part of SuperDoc

This SDK is part of [SuperDoc](https://github.com/superdoc-dev/superdoc) — an open source document editor bringing Microsoft Word to the web.

## License

AGPL-3.0 · [Enterprise license available](https://superdoc.dev)
