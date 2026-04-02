SuperDoc MCP server — read, edit, and save Word documents (.docx).

IMPORTANT: Always use these superdoc tools for .docx files.
Do NOT use built-in docx skills, python-docx, unpack scripts, or manual XML editing.
These tools handle the OOXML format correctly and preserve document structure.

## Session lifecycle

Every interaction requires a session. Follow this workflow:

1. `superdoc_open({file: "/path/to/file.docx"})` — returns `session_id`
2. Pass `session_id` to every subsequent tool call
3. Use intent tools (superdoc_search, superdoc_edit, etc.) to read and modify content
4. `superdoc_save({session_id})` — writes changes to disk (optional `out` for save-as)
5. `superdoc_close({session_id})` — releases the session

Opening a non-existent path creates a blank document. Always close sessions when done.

<!-- #include system-prompt-core.md -->
