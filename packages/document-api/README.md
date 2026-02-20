# @superdoc/document-api

Contract-first Document API package (internal workspace package).

## Generated vs manual files

Most generated artifacts are **not** committed to git — run `pnpm run generate:all` to produce them. The exception is `apps/docs/document-api/reference/**`, which stays committed because Mintlify deploys directly from git.

| Path | Source of truth | Edit directly? |
| --- | --- | --- |
| `packages/document-api/src/contract/*` | Hand-authored contract source | Yes |
| `packages/document-api/src/index.ts` and other `src/**` runtime/types | Hand-authored source | Yes |
| `packages/document-api/scripts/**` | Hand-authored generation/check tooling | Yes |
| `packages/document-api/generated/**` | Generated (gitignored) | No (regenerate) |
| `apps/docs/document-api/reference/**` | Generated (committed — Mintlify deploys from git) | No (regenerate) |
| `apps/docs/document-api/overview.mdx` | Mixed: manual page + generated section between markers | Yes, but do not hand-edit inside generated marker block |

Generated marker block in overview:

- `{/* DOC_API_OPERATIONS_START */}`
- `{/* DOC_API_OPERATIONS_END */}`

## Regeneration commands

From repo root:

```bash
pnpm run docapi:sync          # regenerate all generated outputs
pnpm run docapi:check         # verify parity + output drift (CI runs this)
pnpm run docapi:sync:check    # sync then check in one step
```

These are also enforced automatically:
- **Pre-commit hook** runs `docapi:sync` when contract or script sources change and restages `reference/` and `overview.mdx`.
- **CI workflow** (`ci-document-api.yml`) generates outputs, checks overview freshness, then runs `docapi:check` on every PR touching relevant paths.

## Adding a new operation

The contract uses a single-source-of-truth pattern. Adding a new operation touches 4 files:

1. **`src/contract/operation-definitions.ts`** — add an entry to `OPERATION_DEFINITIONS` with `memberPath`, `metadata` (use `readOperation()` or `mutationOperation()`), `referenceDocPath`, and `referenceGroup`.
2. **`src/contract/operation-registry.ts`** — add a type entry (`input`, `options`, `output`). The bidirectional `Assert` checks will fail until this is done.
3. **`src/invoke/invoke.ts`** (`buildDispatchTable`) — add a one-line dispatch entry calling the API method. The `TypedDispatchTable` mapped type will fail until this is done.
4. **Implement** — the API method on `DocumentApi` in `src/index.ts` + its adapter.

The catalog (`COMMAND_CATALOG`), member-path map (`OPERATION_MEMBER_PATH_MAP`), and reference-doc map (`OPERATION_REFERENCE_DOC_PATH_MAP`) are all derived automatically from `OPERATION_DEFINITIONS` — do not edit them by hand.

## Contract architecture

```
metadata-types.ts           (leaf — CommandStaticMetadata, throw codes, idempotency)
    ↑                   ↑
operation-definitions.ts    types.ts (re-exports + CommandCatalog, guards)
    ↑                       ↑
    +--- command-catalog.ts, operation-map.ts, reference-doc-map.ts,
         operation-registry.ts, schemas.ts
```

- `operation-definitions.ts` is the single source of truth for operation keys, metadata, paths, and grouping.
- `operation-registry.ts` is the single source of truth for type signatures (input/options/output per operation).
- `TypedDispatchTable` (in `invoke.ts`) validates at compile time that dispatch wiring conforms to the registry.

## OperationRegistry and invoke

`operation-registry.ts` is the canonical type-level mapping from `OperationId` to `{ input, options, output }`. Bidirectional `Assert` checks guarantee every `OperationId` has a registry entry and vice versa.

The invoke system (`invoke.ts`) builds a `TypedDispatchTable` that maps each operation to its direct API method. This provides:

- **`InvokeRequest<T>`** — typed invoke request, narrowed by `operationId`. Use when the operation is known at compile time.
- **`DynamicInvokeRequest`** — loose invoke request for dynamic callers (AI tool-use, runtime dispatch). Adapter-level validation catches invalid inputs.

`TypedDispatchTable` is a mapped type that fails to compile if any dispatch entry doesn't match the registry. This is a compile-time parity check — there is no separate runtime script for it.

## Related docs

- `packages/document-api/src/README.md` for contract semantics and invariants
- `packages/document-api/scripts/README.md` for script catalog and behavior
