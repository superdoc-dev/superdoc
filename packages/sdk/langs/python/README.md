# superdoc-sdk

Programmatic SDK for deterministic DOCX operations through SuperDoc's Document API.

## Install

```bash
pip install superdoc-sdk
```

The package bundles a native CLI binary for your platform. Supported platforms:

| Platform | Architecture |
|----------|-------------|
| macOS | Apple Silicon (arm64), Intel (x64) |
| Linux | x64, ARM64 |
| Windows | x64 |

## Quick start

```python
from superdoc import SuperDocClient

client = SuperDocClient()

await client.doc.open(doc="./contract.docx")

info = await client.doc.info()
print(info["counts"])

results = await client.doc.find(query={"kind": "text", "pattern": "termination"})

await client.doc.replace(
    target=results["context"][0]["textRanges"][0],
    text="expiration",
)

await client.doc.save(in_place=True)
await client.doc.close()
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
| **Comments** | `comments.add`, `comments.edit`, `comments.reply`, `comments.move`, `comments.resolve`, `comments.remove`, `comments.set_internal`, `comments.set_active`, `comments.go_to`, `comments.get`, `comments.list` |
| **Track Changes** | `track_changes.list`, `track_changes.get`, `track_changes.accept`, `track_changes.reject`, `track_changes.accept_all`, `track_changes.reject_all` |
| **Lifecycle** | `open`, `save`, `close` |
| **Session** | `session.list`, `session.save`, `session.close`, `session.set_default` |
| **Introspection** | `status`, `describe`, `describe_command` |

## Part of SuperDoc

This SDK is part of [SuperDoc](https://github.com/superdoc-dev/superdoc) — an open source document editor bringing Microsoft Word to the web.

## License

AGPL-3.0 · [Enterprise license available](https://superdoc.dev)
