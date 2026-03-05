# superdoc-sdk

Programmatic SDK for deterministic DOCX operations through SuperDoc's Document API.

> **Alpha** — The API surface matches the [Document API](https://docs.superdoc.dev/document-api/overview) and will evolve alongside it.

## Install

```bash
pip install superdoc-sdk
```

The CLI is bundled with the SDK — no separate install needed. A platform-specific CLI companion package is installed automatically via [PEP 508 environment markers](https://peps.python.org/pep-0508/).

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
    async with AsyncSuperDocClient(default_change_mode="tracked") as client:
        # Open a document
        await client.doc.open({"doc": "./contract.docx"})

        # Find and replace text with query + mutation plan
        match = await client.doc.query.match(
            {
                "select": {"type": "text", "pattern": "ACME Corp"},
                "require": "first",
            }
        )

        items = match.get("items") or []
        first_item = items[0] if items else {}
        ref = first_item.get("handle", {}).get("ref")
        if ref:
            await client.doc.mutations.apply(
                {
                    "expectedRevision": match["evaluatedRevision"],
                    "atomic": True,
                    "steps": [
                        {
                            "id": "replace-acme",
                            "op": "text.rewrite",
                            "where": {"by": "ref", "ref": ref},
                            "args": {"replacement": {"text": "NewCo Inc."}},
                        }
                    ],
                }
            )

        # Save and close
        await client.doc.save({"inPlace": True})
        await client.doc.close({})


asyncio.run(main())
```

Set `default_change_mode="tracked"` to make mutations use tracked changes by default. If you pass `changeMode` on a specific call, that explicit value overrides the default.

The SDK also exposes a synchronous `SuperDocClient` with the same `doc.*` operations when you prefer non-async code paths.

### Sync

```python
from superdoc import SuperDocClient

with SuperDocClient() as client:
    client.doc.open({"doc": "./contract.docx"})

    info = client.doc.info({})
    print(info["counts"])

    client.doc.save({"inPlace": True})
    client.doc.close({})
```

## User identity

By default the SDK attributes edits to a generic "CLI" user. Set `user` on the client to identify your automation in comments, tracked changes, and collaboration presence:

```python
client = AsyncSuperDocClient(user={"name": "Review Bot", "email": "bot@example.com"})
```

The `user` is injected into every `doc.open` call. If you pass `userName` or `userEmail` on a specific `doc.open`, those per-call values take precedence.

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
    user={"name": "Bot", "email": "bot@example.com"},  # User identity for attribution
    env={"SUPERDOC_CLI_BIN": "/path/to/superdoc"},  # Environment overrides
)
```

### Thread safety

Client instances are serialized: one operation at a time per client. For parallelism, use multiple client instances. Do not share a single client across threads.

## Collaboration sessions

Use this when your app already has a live collaboration room (Liveblocks, Hocuspocus, or SuperDoc Yjs).

### Join an existing room

Pass `collabUrl` and `collabDocumentId` to `doc.open`:

```python
import asyncio

from superdoc import AsyncSuperDocClient


async def main():
    async with AsyncSuperDocClient() as client:
        await client.doc.open({
            "collabUrl": "ws://localhost:4000",
            "collabDocumentId": "my-doc-room",
        })

        await client.doc.insert({
            "target": {"type": "end"},
            "content": "Added by the SDK",
        })


asyncio.run(main())
```

### Start an empty room from a local `.docx`

If the room is empty, pass `doc` together with collaboration params:

```python
await client.doc.open({
    "doc": "./starting-template.docx",
    "collabUrl": "ws://localhost:4000",
    "collabDocumentId": "my-doc-room",
})
```

What happens when you pass `doc`:

| Room state | Result |
| --- | --- |
| Room already has content | SDK joins the room. `doc` is ignored. |
| Room is empty and `doc` is provided | SDK seeds the room from `doc`, then joins. |
| Room is empty and no `doc` is provided | SDK starts a blank document. |

### Control empty-room behavior

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `collabUrl` | `string` | — | WebSocket URL for your collaboration provider. |
| `collabDocumentId` | `string` | session ID | Room/document ID on the provider. |
| `doc` | `string` | — | Local `.docx` used only when the room is empty. |
| `onMissing` | `string` | `seedFromDoc` | `seedFromDoc`, `blank`, or `error`. |
| `bootstrapSettlingMs` | `number` | `1500` | Wait time (ms) before seeding to avoid race conditions. |

If you only want to join rooms that already exist, use `onMissing: 'error'`:

```python
await client.doc.open({
    "collabUrl": "ws://localhost:4000",
    "collabDocumentId": "my-doc-room",
    "onMissing": "error",
})
```

### Check if the SDK seeded or joined

`doc.open` returns bootstrap details in collaboration mode:

```python
result = await client.doc.open({
    "doc": "./starting-template.docx",
    "collabUrl": "ws://localhost:4000",
    "collabDocumentId": "my-doc-room",
})

print(result.get("bootstrap"))
# { roomState, bootstrapApplied, bootstrapSource }
```

## Available operations

The SDK exposes all operations from the [Document API](https://docs.superdoc.dev/document-api/overview) plus lifecycle and session commands.

### Lifecycle

| Operation | Description |
| --- | --- |
| `doc.open` | Open a document and create a persistent editing session. Optionally override the document body with contentOverride + overrideType (markdown, html, or text). |
| `doc.save` | Save the current session to the original file or a new path. |
| `doc.close` | Close the active editing session and clean up resources. |

### Query

| Operation | Description |
| --- | --- |
| `doc.find` | Search the document for nodes matching type, text, or attribute criteria. |
| `doc.get_node` | Retrieve a single node by target position. |
| `doc.get_node_by_id` | Retrieve a single node by its unique ID. |
| `doc.get_text` | Extract the plain-text content of the document. |
| `doc.get_markdown` | Extract the document content as a Markdown string. |
| `doc.info` | Return document metadata including revision, node count, and capabilities. |
| `doc.query.match` | Deterministic selector-based search with cardinality contracts for mutation targeting. |
| `doc.mutations.preview` | Dry-run a mutation plan, returning resolved targets without applying changes. |

### Mutation

| Operation | Description |
| --- | --- |
| `doc.insert` | Insert content at a target position, or at the end of the document when target is omitted. Supports text (default), markdown, and html content types via the `type` field. |
| `doc.replace` | Replace content at a target position with new text or inline content. |
| `doc.delete` | Delete content at a target position. |
| `doc.mutations.apply` | Execute a mutation plan atomically against the document. |

### Format

| Operation | Description |
| --- | --- |
| `doc.format.apply` | Apply inline run-property patch changes to the target range with explicit set/clear semantics. |
| `doc.format.bold` | Set or clear bold on the target text range. |
| `doc.format.italic` | Set or clear italic on the target text range. |
| `doc.format.strike` | Set or clear strikethrough on the target text range. |
| `doc.format.underline` | Set or clear underline on the target text range. |
| `doc.format.highlight` | Set or clear highlight on the target text range. |
| `doc.format.color` | Set or clear text color on the target text range. |
| `doc.format.font_size` | Set or clear font size on the target text range. |
| `doc.format.font_family` | Set or clear font family on the target text range. |

And 30+ additional formatting operations (letter spacing, vertical alignment, small caps, shading, borders, and more).

### Create

| Operation | Description |
| --- | --- |
| `doc.create.paragraph` | Create a new paragraph at the target position. |
| `doc.create.heading` | Create a new heading at the target position. |
| `doc.create.section_break` | Create a section break at the target location. |
| `doc.create.table` | Create a new table at the target position. |
| `doc.create.table_of_contents` | Insert a new table of contents at the target position. |

### Blocks

| Operation | Description |
| --- | --- |
| `doc.blocks.delete` | Delete an entire block node (paragraph, heading, list item, table, image, or sdt). |

### Lists

| Operation | Description |
| --- | --- |
| `doc.lists.list` | List all list nodes in the document, optionally filtered by scope. |
| `doc.lists.get` | Retrieve a specific list node by target. |
| `doc.lists.insert` | Insert a new list at the target position. |
| `doc.lists.create` | Create a new list from one or more paragraphs. |
| `doc.lists.attach` | Convert non-list paragraphs to list items under an existing list sequence. |
| `doc.lists.detach` | Remove numbering properties from list items, converting them to plain paragraphs. |
| `doc.lists.indent` | Increase the indentation level of a list item. |
| `doc.lists.outdent` | Decrease the indentation level of a list item. |
| `doc.lists.join` | Merge two adjacent list sequences into one. |
| `doc.lists.can_join` | Check whether two adjacent list sequences can be joined. |
| `doc.lists.separate` | Split a list sequence at the target item. |
| `doc.lists.set_level` | Set the absolute nesting level (0..8) of a list item. |
| `doc.lists.set_value` | Set an explicit numbering value at the target item. |
| `doc.lists.continue_previous` | Continue numbering from the nearest compatible previous list sequence. |
| `doc.lists.can_continue_previous` | Check whether the target sequence can continue numbering from a previous sequence. |
| `doc.lists.set_level_restart` | Set the restart behavior for a specific list level. |
| `doc.lists.convert_to_text` | Convert list items to plain paragraphs, optionally prepending the rendered marker text. |

### Comments

| Operation | Description |
| --- | --- |
| `doc.comments.create` | Create a new comment thread (or reply when parentCommentId is given). |
| `doc.comments.patch` | Patch fields on an existing comment (text, target, status, or isInternal). |
| `doc.comments.delete` | Remove a comment or reply by ID. |
| `doc.comments.get` | Retrieve a single comment thread by ID. |
| `doc.comments.list` | List all comment threads in the document. |

### Track changes

| Operation | Description |
| --- | --- |
| `doc.track_changes.list` | List all tracked changes in the document. |
| `doc.track_changes.get` | Retrieve a single tracked change by ID. |
| `doc.track_changes.decide` | Accept or reject a tracked change (by ID or scope: all). |

### History

| Operation | Description |
| --- | --- |
| `doc.history.get` | Query the current undo/redo history state of the active editor. |
| `doc.history.undo` | Undo the most recent history-safe mutation in the active editor. |
| `doc.history.redo` | Redo the most recently undone action in the active editor. |

### Session

| Operation | Description |
| --- | --- |
| `doc.session.list` | List all active editing sessions. |
| `doc.session.save` | Persist the current session state. |
| `doc.session.close` | Close a specific editing session by ID. |
| `doc.session.set_default` | Set the default session for subsequent commands. |

### Introspection

| Operation | Description |
| --- | --- |
| `doc.status` | Show the current session status and document metadata. |
| `doc.describe` | List all available CLI operations and contract metadata. |
| `doc.describe_command` | Show detailed metadata for a single CLI operation. |

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

## Related

- [Document API](https://docs.superdoc.dev/document-api/overview) — the in-browser API that defines the operation set
- [CLI](https://docs.superdoc.dev/document-engine/cli) — use the same operations from the terminal
- [Collaboration guides](https://docs.superdoc.dev/modules/collaboration/overview) — set up Liveblocks, Hocuspocus, or SuperDoc Yjs

## Part of SuperDoc

This SDK is part of [SuperDoc](https://github.com/superdoc-dev/superdoc) — an open source document editor bringing Microsoft Word to the web.

## License

AGPL-3.0 · [Enterprise license available](https://superdoc.dev)
