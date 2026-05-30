# v1 layout-adapter (ProseMirror → FlowBlock[])

The v1 ProseMirror adapter, owned by `@superdoc/super-editor`. It projects the
hidden ProseMirror document and resolved styles into `FlowBlock[]` for the
layout-engine pipeline. Internal consumers import it via `@core/layout-adapter`.

## DOCX → PM JSON fixtures

Use the Super Editor extraction script to extract ProseMirror JSON directly from DOCX files. From `packages/super-editor`:

```bash
pnpm run extract:docx -- --input src/editors/v1/tests/data/restart-numbering-sub-list.docx --output src/editors/v1/core/layout-adapter/fixtures/lists-docx.json
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

## Section model (ECMA-376 §17.6, §17.18.77)

Word uses **end-tagged** section semantics: a `<w:sectPr>` inside a paragraph defines the section that **ends with** that paragraph. The body-level `<w:sectPr>` defines the final section. All body children preceding a section-terminating paragraph — other paragraphs, **tables**, top-level drawings, SDT wrappers — belong to the section whose sectPr follows them.

```
<w:body>
  <w:p>This is section A's first paragraph</w:p>
  <w:p>
    <w:pPr><w:sectPr>(section A props: 1-col, nextPage)</w:sectPr></w:pPr>
  </w:p>
  <w:tbl>...</w:tbl>                                ← section B (the NEXT sectPr)
  <w:p>
    <w:pPr><w:sectPr>(section B props: 2-col continuous)</w:sectPr></w:pPr>
  </w:p>
  <w:p>This is section C's paragraph</w:p>
  <w:sectPr>(section C props: body-level)</w:sectPr>
</w:body>
```

Section ranges are computed in `sections/analysis.ts` with two parallel indices:

| Index | What it counts | Used by |
|---|---|---|
| `startParagraphIndex` / `endParagraphIndex` | Paragraph nodes only (including those inside SDT wrappers) | SDT handlers for intra-SDT section transitions |
| `startNodeIndex` / `endNodeIndex` | Every top-level `doc.content` child — paragraphs, tables, top-level drawings, SDTs | Main dispatch loop for inter-node section transitions |

The main dispatch loop in `internal.ts` calls `maybeEmitNextSectionBreakForNode` BEFORE handling each top-level node. The helper uses `currentNodeIndex === nextSection.startNodeIndex` as its trigger, so non-paragraph nodes (tables especially) correctly get the sectionBreak emitted before them when they cross a section boundary. This is the fix for SD-2646.

**When adding a new top-level block kind** (e.g., a new SDT type or a top-level drawing kind): do nothing. The dispatch-level hook covers you automatically. You only need a per-handler section check if your handler descends into children that carry their own sectPr markers — see the SDT handlers (`sdt/bibliography.ts`, `sdt/document-index.ts`, `sdt/table-of-authorities.ts`) for the intra-SDT pattern.

Continuous section breaks (`<w:type w:val="continuous"/>`) carry an extra requirement from §17.18.77: they "balance the content of the previous section." The balancing itself is the layout engine's responsibility (see `layout-engine/src/column-balancing.ts`); the adapter's job is only to ensure the right blocks are in the right section.
