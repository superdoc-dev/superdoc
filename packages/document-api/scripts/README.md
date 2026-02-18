# Document API Script Catalog

This folder contains deterministic generator/check entry points for the Document API contract and docs.

## Calling model

- `generate-*` scripts write generated artifacts.
- `check-*` scripts validate generated artifacts or docs and fail with non-zero exit code on drift.
- Root `package.json` exposes three canonical entry points:
  - `pnpm run docapi:sync` — runs `generate-contract-outputs.ts`
  - `pnpm run docapi:check` — runs `check-contract-parity.ts` + `check-contract-outputs.ts`
  - `pnpm run docapi:sync:check` — sync then check
- Pre-commit hook (`lefthook.yml`) auto-runs `docapi:sync` when document-api source files are staged.
- CI workflow (`ci-document-api.yml`) runs `docapi:check` on PRs touching document-api paths.

## Manual vs generated boundaries

- Hand-authored inputs:
  - `packages/document-api/src/contract/*`
  - `packages/document-api/src/index.ts` and related runtime/types
  - `packages/document-api/scripts/*`
- Generated outputs (checked into git):
  - `packages/document-api/generated/*`
  - `apps/docs/document-api/reference/*`
  - generated marker block in `apps/docs/document-api/overview.mdx`

Do not hand-edit generated output files. Regenerate instead.

## Script index

| Script | Kind | Purpose | Reads | Writes | Typical caller |
| --- | --- | --- | --- | --- | --- |
| `check-contract-outputs.ts` | check | Full generated-output gate across schemas/manifests/agent/reference + overview block | Contract snapshot + generated roots + docs overview | None | CI/local full verification |
| `generate-contract-outputs.ts` | generate | Full regeneration across schemas/manifests/agent/reference + overview block | Contract snapshot + docs overview | `packages/document-api/generated/*`, `apps/docs/document-api/reference/*`, generated block in overview | Main local sync before commit |
| `check-stable-schemas.ts` | check | Validate stable schema artifact drift | Contract snapshot + `packages/document-api/generated/schemas` | None | Focused check during schema work |
| `generate-stable-schemas.ts` | generate | Regenerate stable schema artifacts | Contract snapshot | `packages/document-api/generated/schemas/*` | Focused schema regeneration |
| `check-tool-manifests.ts` | check | Validate tool manifest artifact drift | Contract snapshot + `packages/document-api/generated/manifests` | None | Focused manifest check |
| `generate-tool-manifests.ts` | generate | Regenerate tool manifest artifacts | Contract snapshot | `packages/document-api/generated/manifests/*` | Focused manifest regeneration |
| `check-agent-artifacts.ts` | check | Validate agent artifact drift | Contract snapshot + `packages/document-api/generated/agent` | None | Focused agent-artifact check |
| `generate-agent-artifacts.ts` | generate | Regenerate agent artifacts (remediation/workflow/compatibility) | Contract snapshot | `packages/document-api/generated/agent/*` | Focused agent-artifact regeneration |
| `check-generated-reference-docs.ts` | check | Validate generated reference docs and overview generated block drift | Contract snapshot + `apps/docs/document-api/reference` + overview | None | Focused docs generation check |
| `generate-reference-docs.ts` | generate | Regenerate generated reference docs and overview generated block | Contract snapshot + overview markers | `apps/docs/document-api/reference/*`, generated block in `apps/docs/document-api/overview.mdx` | Focused docs regeneration |
| `check-overview-alignment.ts` | check | Enforce overview quality rules (required copy/markers, forbidden placeholders, known API paths only) | `apps/docs/document-api/overview.mdx` + `DOCUMENT_API_MEMBER_PATHS` | None | Docs consistency gate |
| `check-doc-coverage.ts` | check | Ensure every operation has a `### \`<operationId>\`` section in `src/README.md` | `packages/document-api/src/README.md` + `OPERATION_IDS` | None | Contract/docs coverage gate |
| `check-examples.ts` | check | Ensure required workflow example headings exist in `src/README.md` | `packages/document-api/src/README.md` | None | Docs workflow example gate |
| `check-contract-parity.ts` | check | Enforce parity between operation IDs, command catalog, maps, and runtime API member paths | `packages/document-api/src/index.js` exports + runtime API shape | None | Contract surface integrity gate |
| `generate-internal-schemas.ts` | generate | Generate internal-only operation schema snapshot | Contract snapshot + schema dialect | `packages/document-api/.generated-internal/contract-schemas/index.json` | Local tooling/debugging |

## Compile-time parity checks

Not all parity checks are runtime scripts. `TypedDispatchTable` in `invoke.ts` is a mapped type that validates at compile time that every `OperationId` has a matching dispatch entry. If you add an operation to `operation-definitions.ts` and `operation-registry.ts` but forget the dispatch entry, `tsc` will fail before any script runs.

## Recommended usage

1. Change contract/docs sources.
2. Run `pnpm run docapi:sync` (or the individual `generate-*` script for focused work).
3. Run `pnpm run docapi:check` to verify zero drift.

Or combine: `pnpm run docapi:sync:check`

The pre-commit hook handles step 2 automatically when document-api files are staged. CI enforces step 3.
