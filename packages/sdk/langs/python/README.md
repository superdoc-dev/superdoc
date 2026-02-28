# superdoc-sdk

Programmatic SDK for deterministic DOCX operations through SuperDoc's Document API.

## Install

```bash
pip install superdoc-sdk
```

The package installs a platform-specific CLI companion package automatically via [PEP 508 environment markers](https://peps.python.org/pep-0508/). Supported platforms:

| Platform | Architecture |
|----------|-------------|
| macOS | Apple Silicon (arm64), Intel (x64) |
| Linux | x64, ARM64 |
| Windows | x64 |

## Quick start

```python
import asyncio

from superdoc import AsyncSuperDocClient


async def main():
    client = AsyncSuperDocClient()

    await client.doc.open({"doc": "./contract.docx"})

    info = await client.doc.info({})
    print(info["counts"])

    results = await client.doc.find({"type": "text", "pattern": "termination"})
    target = results["items"][0]["context"]["textRanges"][0]

    await client.doc.replace({"target": target, "text": "expiration"})
    await client.doc.save({"inPlace": True})
    await client.doc.close({})


asyncio.run(main())
```

## API

### Client

```python
from superdoc import SuperDocClient

client = SuperDocClient()
```

All document operations are on `client.doc`:

```python
await client.doc.open(params)
await client.doc.find(params)
await client.doc.insert(params)
# ... etc
```

### Operations

| Category | Operations |
|----------|-----------|
| **Query** | `find`, `get_node`, `get_node_by_id`, `info` |
| **Mutation** | `insert`, `replace`, `delete` |
| **Format** | `format.bold`, `format.italic`, `format.underline`, `format.strikethrough` |
| **Create** | `create.paragraph` |
| **Lists** | `lists.list`, `lists.get`, `lists.insert`, `lists.set_type`, `lists.indent`, `lists.outdent`, `lists.restart`, `lists.exit` |
| **Comments** | `comments.create`, `comments.patch`, `comments.delete`, `comments.get`, `comments.list` |
| **Track Changes** | `track_changes.list`, `track_changes.get`, `track_changes.decide` |
| **Lifecycle** | `open`, `save`, `close` |
| **Session** | `session.list`, `session.save`, `session.close`, `session.set_default` |
| **Introspection** | `status`, `describe`, `describe_command` |

## Troubleshooting

### Custom CLI binary

If you need to use a custom-built CLI binary (e.g. a newer version or a patched build), set the `SUPERDOC_CLI_BIN` environment variable:

```bash
export SUPERDOC_CLI_BIN=/path/to/superdoc
```

### Air-gapped / private index environments

Mirror both `superdoc-sdk` and the `superdoc-sdk-cli-*` package for your platform to your private index. For example, on macOS ARM64:

```bash
pip download superdoc-sdk superdoc-sdk-cli-darwin-arm64
# Upload both wheels to your private index
```

## Part of SuperDoc

This SDK is part of [SuperDoc](https://github.com/superdoc-dev/superdoc) — an open source document editor bringing Microsoft Word to the web.

## License

AGPL-3.0 · [Enterprise license available](https://superdoc.dev)
