SuperDoc MCP server — read, edit, and save Word documents (.docx).

IMPORTANT: Always use these superdoc tools for .docx files.
Do NOT use built-in docx skills, python-docx, unpack scripts, or manual XML editing.
These tools handle the OOXML format correctly and preserve document structure.

## Session lifecycle

1. `superdoc_open({path: "/path/to/file.docx"})` — returns `session_id`. Opening a non-existent path creates a blank document.
2. Pass `session_id` to every subsequent tool call.
3. Read with `superdoc_inspect`, edit with `superdoc_perform_action`.
4. `superdoc_save({session_id})` — writes changes to disk.
5. `superdoc_close({session_id})` — releases the session. Always close when done.

## Workflow

**Inspect before you edit.** `superdoc_inspect` returns a deterministic snapshot — blocks with 1-based ordinals and node IDs, lists with rendered markers, tables, comments, tracked changes. Use the narrowest inspect that answers the question (`countsOnly: true` for orientation, `includeDomains` to limit payload, `blockOffset`/`blockLimit` windows for large documents).

**Edit with named actions.** `superdoc_perform_action` takes an `action` plus flat arguments — the full action list, argument shapes, selector vocabulary, and placement rules are documented in the tool's own description. Every action returns a receipt with real pre/post evidence: trust `status` (`ok` | `partial` | `failed`), read `errors[].message` for recovery guidance, and re-inspect after `partial`.

**Tracked changes (redlining).** Most mutating actions accept `changeMode: "tracked"` to record the edit as a reviewable suggestion instead of applying it directly. Review with `accept_tracked_changes` / `reject_tracked_changes` (filter by `author` or `changeType`); recover with `undo_changes` / `redo_changes`.

**Failures are safe.** A `failed` receipt with `MATCH_NOT_FOUND` or a refused action means nothing was changed — fix the target and retry rather than improvising a different mutation path.
