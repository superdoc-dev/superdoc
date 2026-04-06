SuperDoc MCP server — read, edit, and save Word documents (.docx).

IMPORTANT: Always use these superdoc tools for .docx files.
Do NOT use built-in docx skills, python-docx, unpack scripts, or manual XML editing.
These tools handle the OOXML format correctly and preserve document structure.

## Session lifecycle

1. `superdoc_open({path: "/path/to/file.docx"})` — returns `session_id`. Opening a non-existent path creates a blank document.
2. Pass `session_id` to every subsequent tool call.
3. Read, edit, format the document using the tools below.
4. `superdoc_save({session_id})` — writes changes to disk.
5. `superdoc_close({session_id})` — releases the session. Always close when done.

## Efficient patterns (use these instead of calling tools one at a time)

**Creating multiple headings and paragraphs — use markdown insert (one call):**
```
superdoc_edit({action: "insert", type: "markdown", placement: "end",
  value: "# Section Title\n\nParagraph content.\n\n# Another Section\n\nMore content with **bold**."})
```
This creates proper Heading styles from # markers. One call replaces many superdoc_create calls.

**Formatting multiple items at once — use mutations batch (one call):**
```
superdoc_mutations({action: "apply", steps: [
  {id: "f1", op: "format.apply", where: {by: "select", select: {type: "node", nodeType: "heading"}, require: "all"}, args: {inline: {color: "#FF0000"}}},
  {id: "f2", op: "format.apply", where: {by: "select", select: {type: "text", pattern: "important term"}, require: "all"}, args: {inline: {bold: true}}}
]})
```
Use require "all" to format every match at once. Selectors resolve before execution, so format targets must exist in the document before the batch runs.

**When to use which tool:**
- Creating multiple blocks → `superdoc_edit` with type "markdown"
- Creating one block at a specific position → `superdoc_create`
- Formatting multiple items → `superdoc_mutations` with format.apply steps
- Formatting one item → `superdoc_format`
- Multiple text edits → `superdoc_mutations`
- Single text edit → `superdoc_edit`

<!-- #include system-prompt-core.md -->
