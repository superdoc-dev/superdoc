# SDT classification fixtures (PR #3616)

Real `.docx` fixtures that validate the nested content-control classifier in
`super-converter/v3/handlers/w/sdt/`. Exercised by
`tests/editor/sdt-nested-classification.test.js`.

The claim under test: block vs run/inline SDT classification is driven by the
translated ProseMirror content shape plus import context, not only by the direct
XML child names of `w:sdtContent`.

## Provenance and conformance

Each fixture's surrounding package (content types, rels, styles, theme, fonts, and
image media) is taken verbatim from a Word-authored base already in this folder.
Only `word/document.xml` is hand-authored to encode the exact OOXML shape, so the
package stays valid while the structure is precise. All fixtures are therefore
**schema-only** (hand-authored structure, not produced or validated by Word).

The `conformance` column distinguishes shapes that are valid ECMA-376 from one that
is deliberately malformed to exercise the PR's defensive normalization:

| Fixture | Conformance | Base package | Shape under `w:body` |
|---|---|---|---|
| `sdt-nested-block.docx` | conformant | `blank-doc.docx` | block `w:sdt` whose `w:sdtContent` directly contains a nested block `w:sdt` (no direct `w:p`) wrapping a paragraph. Legal: `EG_ContentBlockContent` permits `sdt`. |
| `sdt-nested-inline.docx` | conformant | `blank-doc.docx` | `w:p` containing an inline `w:sdt` that contains a nested inline `w:sdt` of runs, between two text runs. Legal: `CT_SdtContentRun` is `EG_PContent`. |
| `sdt-mixed-block.docx` | **defensive (malformed)** | `blank-doc.docx` | block `w:sdt` whose `w:sdtContent` holds a bare inline `w:sdt`, a `w:p`, and a `w:tbl`. The bare inline `w:sdt` is **non-conformant**: a `w:sdt` directly under block content is positionally `CT_SdtBlock`, whose content may not be a bare `w:r` (`EG_ContentBlockContent` allows only `customXml/sdt/p/tbl/EG_RunLevelElts`, and `EG_RunLevelElts` excludes `w:r`). Included on purpose to drive `wrapInlineRunsAsParagraphs`, which the PR uses to normalize bare inline content inside a block SDT. |
| `sdt-inline-picture.docx` | conformant | `anchor_images.docx` (reuses `media/image1.png`, `rId4`) | `w:p` > inline `w:sdt` with `<w:picture/>` marker > `w:sdtContent` > `w:r` > `w:drawing`. Legal per ECMA-376 §17.5.2.24 (picture content control wrapping a single DrawingML picture). |

## Rebuild

```
node packages/super-editor/src/editors/v1/tests/data/sdt-fixtures.generate.cjs
```

The generator resolves all paths from its own location and reads the two base
packages (`blank-doc.docx`, `anchor_images.docx`) from this folder, so it is
portable. It re-reads each built file and asserts the intended shape. Set
`SDT_FIXTURE_OUT=/some/dir` to write to a scratch dir instead of overwriting the
committed fixtures (useful for a dry run). Regeneration is content-equivalent;
only zip metadata may differ.

## Out of scope

Row-level SDTs (`w:tbl > w:sdt > w:sdtContent > w:tr`, Google Docs `goog_rdk_*`
exports) are a separate table-walk concern tracked by SD-3118 / IT-1040. The real
Google Docs artifact attached to those tickets should be used as that fixture, and
its preservation checked through a Word round-trip before choosing transparent
unwrap vs. `rowSdt` metadata. Not covered by these fixtures.
