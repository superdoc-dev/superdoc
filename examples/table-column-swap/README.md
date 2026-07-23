# Table column reorder demo

Standalone React demonstration of a best-effort table-column reorder composed from the public SuperDoc Document API.

```bash
pnpm --filter superdoc-table-column-swap-demo dev
```

The included `default-table.docx` opens automatically. The default controls move column `0` after column `1`, visibly swapping the first two adjacent columns.

The operation is intentionally limited to plain text. SuperDoc does not yet expose a lossless column copy/move API, so rich formatting, nested controls, and complex merged-cell structures are not preserved.
