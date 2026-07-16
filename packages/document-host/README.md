# @superdoc/document-host

A neutral, headless **structured document session** over the SuperDoc engine.

It does exactly four things and nothing more:

- `openDocument(bytes?)` - open a `.docx` (or a blank doc) headlessly
- `session.invoke(operationId, input?, options?)` - dispatch one operation
  directly against the engine via `document-api`'s `invoke`
- `session.export()` - serialize current state back to `.docx` bytes
- `session.close()` - release the editor and DOM environment

There is **no CLI argv layer** and **no agent-specific vocabulary** here. This is
the boring, reusable runtime boundary. Higher-level concerns (model-friendly
handles, language facades, focused tools, verification loops) belong in separate
downstream layers that consume this package as a client.

It is distilled from the existing headless assembly in
`apps/cli/src/lib/document.ts`, with CLI types and stdin handling stripped out, so
the open -> invoke -> export path is reusable on its own.

Collaboration is **optional, not removed**: a caller may inject a Y.Doc and a
collaboration provider at `openDocument` time (and drive cursors through the
session's presence handle). Without one, the session is a plain local document and
export preserves the opened bytes for a clean, unmutated session.
