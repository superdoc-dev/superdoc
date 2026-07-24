# External DOCX feedback loop

Run an externally generated DOCX through SuperDoc import, comment projection, export, and re-import:

```bash
pnpm --filter superdoc test:external-docx -- \
  --fixture /absolute/path/input.docx
```

The command prints temporary paths for the exported DOCX and JSON evidence. Keep artifacts at explicit paths when another tool, such as Microsoft Word, needs to inspect them:

```bash
pnpm --filter superdoc test:external-docx -- \
  --fixture /absolute/path/input.docx \
  --output /tmp/superdoc-roundtrip.docx \
  --evidence /tmp/superdoc-roundtrip.json
```

The fixture must contain at least one comment. The run fails when comment import is empty or a comment disappears during sidebar projection or export. The evidence records input and output hashes, rendered comment HTML, and imported node types.

The DOCX editor and comments store are real. User, selection, collaboration, and comment-model host plumbing are mocked so this test stays focused on document conversion and sidebar projection. Generated fixtures and artifacts stay outside the repository.
