# @superdoc/pm-adapter

## DOCX → PM JSON fixtures

Use the shared Vite configuration from Super Editor to extract ProseMirror JSON directly from DOCX files:

```bash
pnpm run extract:docx --workspace=@superdoc/pm-adapter -- --input ../../super-editor/src/editors/v1/tests/data/restart-numbering-sub-list.docx --output lists-docx.json
```

Pass `--input` and `--output` to control which DOCX file is converted and where the fixture is written.

## ProseMirror → FlowBlocks adapter (runtime)

Public API is exported from `src/index.ts`:

- `toFlowBlocks(pmDoc, options?)` — convert a PM document to `FlowBlock[]` + bookmark map for page-ref resolution.
- `toFlowBlocksMap(pmDocs, options?)` — batch version that returns a document→result map.
- Types: `AdapterOptions`, `FlowBlocksResult`, `PMNode`, `PMMark`, `SectionType`, etc.

Notes:
- Emits section break blocks + metadata when `emitSectionBreaks` is enabled, mirroring DOCX section props.
- Handles lists, tables, images, vector shapes, SDT (TOC, structured content, doc parts), tracked changes, hyperlinks.
- Consumes `@superdoc/style-engine` defaults and locale/tab interval hints from the PM document attrs.
- `@superdoc/measuring-dom` is only a dependency for types; measurement happens later in the pipeline.
