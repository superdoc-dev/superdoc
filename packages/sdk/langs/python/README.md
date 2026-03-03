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
from superdoc import SuperDocClient

with SuperDocClient() as client:
    client.doc.open({"doc": "./contract.docx"})

    info = client.doc.info({})
    print(info["counts"])

    results = client.doc.find({"type": "text", "pattern": "termination"})
    target = results["items"][0]["context"]["textRanges"][0]

    client.doc.replace({"target": target, "text": "expiration"})
    client.doc.save({"inPlace": True})
    client.doc.close({})
```

### Async

```python
import asyncio
from superdoc import AsyncSuperDocClient

async def main():
    async with AsyncSuperDocClient() as client:
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

## Client lifecycle

The SDK uses a persistent host process for all operations. The host is started on first use and reused across calls, avoiding per-operation subprocess overhead.

### Context managers (recommended)

```python
# Sync
with SuperDocClient() as client:
    client.doc.find({"query": "test"})

# Async
async with AsyncSuperDocClient() as client:
    await client.doc.find({"query": "test"})
```

The context manager calls `connect()` on entry and `dispose()` on exit (including on exception).

### Explicit lifecycle

```python
client = SuperDocClient()
client.connect()      # Optional — first invoke() auto-connects
result = client.doc.find({"query": "test"})
client.dispose()      # Shuts down the host process
```

`connect()` is optional. If not called explicitly, the first operation triggers a lazy connection to the host process.

### Configuration

```python
client = SuperDocClient(
    startup_timeout_ms=10_000,    # Max time for host handshake (default: 5000)
    shutdown_timeout_ms=5_000,    # Max time for graceful shutdown (default: 5000)
    request_timeout_ms=60_000,    # Per-operation timeout passed to CLI (default: None)
    watchdog_timeout_ms=30_000,   # Client-side safety timer per request (default: 30000)
    default_change_mode="tracked", # Auto-inject changeMode for mutations (default: None)
    env={"SUPERDOC_CLI_BIN": "/path/to/superdoc"},  # Environment overrides
)
```

### Thread safety

Client instances are serialized: one operation at a time per client. For parallelism, use multiple client instances. Do not share a single client across threads.

## API

### Client

```python
from superdoc import SuperDocClient

client = SuperDocClient()
```

All document operations are on `client.doc`:

```python
client.doc.open(params)
client.doc.find(params)
client.doc.insert(params)
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

### Collaboration

The Python SDK supports realtime collaboration through the same host transport as the Node SDK. Pass collaboration parameters to `doc.open`:

```python
with SuperDocClient() as client:
    client.doc.open({
        "doc": "./contract.docx",
        "collabUrl": "ws://localhost:4000",
        "collabDocumentId": "my-doc-id",
    })
    # Operations now use the collaborative session
    client.doc.find({"query": "test"})
    client.doc.close({})
```

## Troubleshooting

### Custom CLI binary

If you need to use a custom-built CLI binary (e.g. a newer version or a patched build), set the `SUPERDOC_CLI_BIN` environment variable:

```bash
export SUPERDOC_CLI_BIN=/path/to/superdoc
```

### Debug logging

Enable transport-level debug logging to diagnose connectivity issues:

```bash
export SUPERDOC_DEBUG=1
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
