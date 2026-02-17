# @superdoc/document-api

Contract-first Document API package (internal workspace package).

## Generated vs manual files

This package intentionally checks generated artifacts into git. Use this boundary when editing:

| Path | Source of truth | Edit directly? |
| --- | --- | --- |
| `packages/document-api/src/contract/*` | Hand-authored contract source | Yes |
| `packages/document-api/src/index.ts` and other `src/**` runtime/types | Hand-authored source | Yes |
| `packages/document-api/scripts/**` | Hand-authored generation/check tooling | Yes |
| `packages/document-api/generated/**` | Generated from contract + scripts | No (regenerate) |
| `apps/docs/document-api/reference/**` | Generated docs from contract + scripts | No (regenerate) |
| `apps/docs/document-api/overview.mdx` | Mixed: manual page + generated section between markers | Yes, but do not hand-edit inside generated marker block |

Generated marker block in overview:

- `/* DOC_API_GENERATED_API_SURFACE_START */`
- `/* DOC_API_GENERATED_API_SURFACE_END */`

## Regeneration commands

From repo root:

```bash
pnpm exec tsx packages/document-api/scripts/generate-contract-outputs.ts
pnpm exec tsx packages/document-api/scripts/check-contract-outputs.ts
```

## Related docs

- `packages/document-api/src/README.md` for contract semantics and invariants
- `packages/document-api/scripts/README.md` for script catalog and behavior
