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

Both ESM and CommonJS are supported.

```ts
// ESM
import { createSuperDocClient } from '@superdoc-dev/sdk';

// CJS
const { createSuperDocClient } = require('@superdoc-dev/sdk');
```

```ts
import { createSuperDocClient } from '@superdoc-dev/sdk';

const client = createSuperDocClient();
await client.connect();

const doc = await client.open({ doc: './contract.docx' });

const info = await doc.info();
console.log(info.counts);

const match = await doc.query.match({
  select: { type: 'text', pattern: 'termination' },
  require: 'first',
});

const target = match.items?.[0]?.target;
if (target) {
  await doc.replace({
    target,
    text: 'expiration',
  });
}

await doc.save({ inPlace: true });
await doc.close();
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

Open documents from the client, then operate on the returned handle:

```ts
const doc = await client.open(params)
await doc.find(params)
await doc.insert(params)
await doc.save(params)
await doc.close(params)
```

### Operations

| Category | Operations |
|----------|-----------|
| **Query** | `find`, `query.match`, `getNode`, `getNodeById`, `info` |
| **Mutation** | `insert`, `replace`, `delete` |
| **Format** | `format.bold`, `format.italic`, `format.underline`, `format.strike` |
| **Create** | `create.paragraph` |
| **Lists** | `lists.list`, `lists.get`, `lists.insert`, `lists.create`, `lists.attach`, `lists.detach`, `lists.indent`, `lists.outdent`, `lists.join`, `lists.separate`, `lists.setLevel`, `lists.setValue`, `lists.continuePrevious`, `lists.setLevelRestart`, `lists.convertToText`, `lists.canJoin`, `lists.canContinuePrevious` |
| **Comments** | `comments.create`, `comments.patch`, `comments.delete`, `comments.get`, `comments.list` |
| **Track Changes** | `trackChanges.list`, `trackChanges.get`, `trackChanges.decide` |
| **Lifecycle** | `client.open`, `doc.save`, `doc.close` |
| **Client** | `client.describe`, `client.describeCommand` |

### AI Tool Integration

The SDK includes built-in support for exposing grouped intent tools as AI tool definitions:

```ts
import {
  chooseTools,
  dispatchSuperDocTool,
  getToolCatalog,
} from '@superdoc-dev/sdk';

// Get the full grouped tool set for your AI provider
const { tools, meta } = await chooseTools({
  provider: 'openai',  // 'openai' | 'anthropic' | 'vercel' | 'generic'
});

// Optional: inspect the generated tool catalog
const catalog = await getToolCatalog();

// Dispatch a tool call from the AI model
const doc = await client.open({ doc: './contract.docx' });
const result = await dispatchSuperDocTool(doc, toolName, args);
```

The current catalog contains 9 grouped tools:
`superdoc_get_content`, `superdoc_edit`, `superdoc_format`, `superdoc_create`, `superdoc_list`, `superdoc_comment`, `superdoc_track_changes`, `superdoc_search`, and `superdoc_mutations`.

Multi-action tools use an `action` field to select the underlying operation. Single-action tools like `superdoc_search` do not require `action`.

| Function | Description |
|----------|-------------|
| `chooseTools(input)` | Load grouped tool definitions for a provider |
| `listTools(provider)` | List all tool definitions for a provider |
| `dispatchSuperDocTool(doc, toolName, args)` | Execute a tool call against a bound document handle |
| `getToolCatalog()` | Load the grouped tool catalog with metadata |
| `getSystemPrompt()` | Read the bundled system prompt for intent tools |

## Part of SuperDoc

This SDK is part of [SuperDoc](https://github.com/superdoc-dev/superdoc) — the open-source document engine for DOCX files. Renders, edits, and automates .docx in the browser and on the server.

## License

AGPL-3.0 · [Enterprise license available](https://superdoc.dev)
