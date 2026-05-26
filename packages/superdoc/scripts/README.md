# SuperDoc public-interface validation scripts

This directory holds the scripts that validate the published SuperDoc package's
public TypeScript surface. The repository also has a Document API public
interface under `packages/document-api/scripts/`; both are summarized here so
contributors have one place to learn the system.

If you only have time for one sentence: **run `pnpm check:public` before
opening or merging anything that touches public types.** It's the
public type/interface preflight — it does not replace `pnpm test` or
`pnpm build` for product correctness.

---

## TL;DR — what command to run when

| Question | Command | Speed | Mutates files? |
|---|---|---|---|
| Are public interfaces safe? | `pnpm check:public` | ~5 min | no |
| TypeScript compiles cleanly? | `pnpm check:types` | seconds | no |
| Only SuperDoc public surface changed? | `pnpm check:public:superdoc` | ~3 min | no |
| Only Document API contract changed? | `pnpm check:public:docapi` | seconds | no |
| Regenerate Document API artifacts after editing the contract? | `pnpm generate:docapi` | seconds | **yes** |
| Quickly see public-contract tier metadata? | `pnpm report:public:superdoc` | seconds | no |

`check:*` commands are non-mutating and safe to run anywhere. `generate:*`
commands write to the worktree (commit the changes). `report:*` commands are
read-only and not CI gates.

---

## Vocabulary

The repo's typed surface is split into two "public interfaces":

- **SuperDoc** — the `superdoc` npm package. Public types and runtime exports
  flow through `packages/superdoc/src/public/index.ts` and the subpath
  facades (`./types`, `./ui`, `./ui/react`, `./headless-toolbar`, etc.).
- **Document API** — `editor.doc.*` programmatic API typed in
  `packages/document-api/src/`. Built as TypeScript-only; the contract lives
  in `operation-definitions.ts` and several artifacts are generated from it.

Both are validated by the same root-level catch-all (`pnpm check:public`)
but have separate script chains because the validation needs differ.

---

## Command catalog (root `package.json`)

### Public-interface validation

| Command | Runs | What it gates |
|---|---|---|
| `check:public` | `check:public:superdoc` + `check:public:docapi` | Both public interfaces. The umbrella to run before merging. |
| `check:public:superdoc` | `check:public-contract` (legacy alias) | SuperDoc package: vite build + postbuild chain, consumer typecheck matrix, deep-type audit. |
| `check:public:docapi` | `docapi:check` (legacy alias) | Document API: contract parity, generated outputs are not stale, examples compile, overview alignment. Clean-checkout safe: gitignored outputs (`packages/document-api/generated/`) are built in memory; tracked outputs (`apps/docs/document-api/reference/`, overview block) are still compared byte-for-byte. |
| `report:public:superdoc` | `report:public-contract` (legacy alias) | Read-only tier metadata (supported / legacy / legacy-raw / asset / deprecated). Not a gate. |

### TypeScript compiler

| Command | Runs | What it gates |
|---|---|---|
| `check:types` | `type-check` (legacy alias) | `tsc -b tsconfig.references.json` — raw TS compile across all referenced projects. Does NOT run the SuperDoc public-contract chain. |
| `type-check:force` | `tsc -b --force` | Same as above but ignores incremental cache. |

### Generation

| Command | Runs | Mutates? |
|---|---|---|
| `generate:docapi` | `docapi:sync` (legacy alias) | yes — writes Document API artifacts under `packages/document-api/generated/` (gitignored). Run this when you want the artifacts materialized locally (e.g. for SDK builds or before publishing). `check:public:docapi` does NOT require running this first. |
| `generate:all` | schemas, SDK clients, tool catalogs, reference docs | yes — multi-target generator. Some outputs are gitignored (`generated/`), others are committed (e.g. `apps/docs/document-api/reference/`); any tracked generated changes should be committed. |

### Legacy aliases

These names predate the standardized vocabulary and stay as `pnpm`
aliases for back-compat. New CI workflows and docs should use the
canonical names above.

| Legacy | Canonical |
|---|---|
| `type-check` | `check:types` |
| `check:public-contract` | `check:public:superdoc` |
| `docapi:check` | `check:public:docapi` |
| `docapi:sync` | `generate:docapi` |
| `docapi:sync:check` | `generate:docapi && check:public:docapi` |
| `report:public-contract` | `report:public:superdoc` |

---

## SuperDoc scripts in this directory

These run as part of `check:public:superdoc` (most via the vite build's
postbuild chain). Each is described by what it gates and what would fail if
it stopped running.

| Script | Stage | Gates | If removed |
|---|---|---|---|
| `type-surface.config.cjs` | data | Canonical taxonomy: relocations, base includes, shared-common targets, allowlists. Source of truth for 5+ other scripts. | Every consumer becomes independent; drift between vite / tsconfig / audit is invisible. |
| `ensure-types.cjs` | postbuild | Rewrites workspace specifiers in emitted `.d.ts` so consumers can resolve them; copies hand-written `.d.ts` files into dist. | Published declarations contain unresolvable `@superdoc/*` imports. |
| `check-tsconfig-type-surface.cjs` | postbuild | Asserts `tsconfig.json#include` equals the union of base + relocation paths in `type-surface.config.cjs`. | tsconfig and vite drift silently; IDE checks diverge from CI. |
| `audit-bundle.cjs` | postbuild | prosemirror-view single-instance check + bundle size budgets. | Duplicate PM instances break collaboration; no size discipline. |
| `audit-declarations.cjs` | postbuild | Rule 1: bare `@superdoc/*` leaks. Rule 2: pnpm-internal paths. Rule 3: `_internal-shims.d.ts` regression. | Private specifiers ship to consumers; consumers hit unresolvable imports. |
| `check-export-coverage.cjs` | postbuild | Every `package.json#exports` subpath carries a `types` field or is on the runtime-only allowlist. | `TS7016` returns for consumers on runtime-only subpaths. |
| `verify-public-facade-emit.cjs` | postbuild | Per-facade expected symbol set + ESM/CJS parity + legacy command-signature compat. Derives the expected name set directly from the facade source file under `packages/superdoc/src/public/**`; rejects `export *` / `export * as X` in facade sources so the contract stays explicit. | Symbol set drift ships silently; CJS shims diverge from ESM; a wildcard re-export silently widens the public surface. |
| `report-declaration-reachability.cjs` | postbuild | Instrumentation (not a gate): per-bucket reachability ratio of emitted declarations. | Loses visibility into unreachable emit (the SD-2952 trim target). |
| `check-jsdoc.cjs` | wrapper stage 3 (`jsdoc-ratchet`) | Two gates: (a) per-file checkJs on the hand-curated `CHECKED_FILES` (currently 6 files; each must carry `// @ts-check` and stay clean against tsc); (b) ratchet over the public-reachable .js JSDoc surface — every file must be in `CHECKED_FILES`, carry `// @ts-check`, be on `jsdoc-allowlist.cjs` with a reason, or be in `jsdoc-debt-snapshot.json` as known pre-existing debt. New public JSDoc files that aren't accounted for fail with a clear "add @ts-check or allowlist" message. Stale snapshot entries (file gone, gained @ts-check, moved out of public surface) also fail. The allowlist contract is enforced too: every entry must carry a non-empty reason, point at an existing file, and still resolve to a public-reachable JSDoc file. Refresh the snapshot with `pnpm --filter superdoc run check:jsdoc -- --write`. Runs as stage 3 of `check:public:superdoc`. | New public-reachable JSDoc files could land without type coverage; existing ones could lose their `// @ts-check` directive without surfacing as a regression; the allowlist could grow silent / typo-shaped exemptions. |
| `check-jsdoc-hygiene-ts.cjs` | wrapper stage 5 (`jsdoc-hygiene-ts`) | Companion to `check-jsdoc.cjs` for the `.ts` side. Strict-zero gate (no grandfathered baseline, no `--write`): walks every `.ts` file under `packages/superdoc/src/` and `packages/super-editor/src/` (excluding `*.d.ts`, `*.test.ts`, `*.spec.ts`, `dev/`, `__mocks__/`, `__fixtures__/`) and fails on any type-bearing JSDoc tag — `@type`, `@typedef`, `@callback`, `@template`, `@implements`, `@extends`, `@augments`, `@enum` always; `@param`, `@returns`, `@return`, `@this` only when `tag.typeExpression` is set (prose-only forms pass). AST-based via `ts.getJSDocTags`; not regex. Self-tested via `check-jsdoc-hygiene-ts-tests.cjs` (13 in-memory fixtures; name avoids the `*.test.*` glob so vitest doesn't pick it up as a unit-test suite). The self-test suite runs as wrapper stage 4 (`jsdoc-hygiene-ts-test`) immediately before this gate. Policy at `type-hygiene.md`. Fix violations in place using the patterns there; `--write` was removed when the gate flipped to strict zero. | Type-bearing JSDoc in `.ts` files is documentation-only (TS ignores it), so duplicate type information drifts silently — `@param {Element}` while signature said `HTMLElement` is the canonical example. Without this gate, that class of drift ships. |

The repo also has a top-level public-contract tier gate. One script,
`scripts/report-public-contract.mjs`, with two modes:

- default (read-only report) - what `pnpm report:public:superdoc` runs.
  Prints the tiers + a validator status block. Report mode does not
  fail on contract drift; load/runtime errors can still exit non-zero.
- `--check` (gate) - runs as stage `contract-tiers` of
  `check:public:superdoc` after the validator's unit tests
  (`contract-tiers-test`). Fails the build on any invariant violation.

Both modes share the pure `validatePublicContract` exported from the
same file (unit-tested in `scripts/report-public-contract.test.mjs`).

Invariants enforced in `--check` mode against the `publicContract`
taxonomy in `type-surface.config.cjs`:

- every `package.json#exports` subpath has a tier entry
- every tier entry exists in `package.json#exports`
- no subpath appears in more than one tier
- each entry's `tier` field matches its bucket
- `supported` subpaths route through `dist/superdoc/src/public/**` (excluding the `legacy/` subtree)
- `legacy` subpaths route through `dist/superdoc/src/public/legacy/**`
- `legacyRaw` is restricted to the explicitly accepted set (currently only `./super-editor`)

---

## Consumer-typecheck infrastructure (`tests/consumer-typecheck/`)

These run against the **packed and installed** tarball, so they validate
what an actual consumer would see — not the workspace source.

| Script | Gates | Notes |
|---|---|---|
| `typecheck-matrix.mjs` | 83 scenarios across module resolution (bundler/node16/nodenext) × strict × skipLibCheck × import path. | Packs the superdoc tarball into `node_modules/` once; later scripts reuse the install. |
| `deep-type-audit.mjs --strict-supported-root` | Walks every type reachable from `superdoc`'s public exports; fails on `any` leaks at any depth. | Compares against a committed allowlist; new findings fail, stale findings fail. |
| `snapshot.mjs --all --check` | No-growth snapshots: super-editor package exports, legacy subpath exports, root facade symbol inventory. | `--write` regenerates snapshots. |
| `check-all-public-types-fixture.mjs` | Asserts every type-only root export has an `AssertNotAny<T>` line in `src/all-public-types.ts`. | Derives the expected set from `superdoc-root-classification.json`. |
| `package-shape-gate.mjs` | External package-shape linters (publint + attw) against the packed tarball. | Catches condition ordering, masquerading exports, missing field declarations. |
| `check-root-classification-closure.mjs` | Asserts no `supported-root` or `legacy-root` export references an `internal-candidate` symbol in its public declared type. | Closure rule from SD-3212. |
| `check-public-method-coverage.mjs` | Obligation-based ratchet over public `SuperDoc` methods + getters. For each member the AST computes which obligations are meaningful (`parameters`, `returns`, or `call`); the gate fails when any required obligation is unsatisfied by a fixture under `src/` AND not on the debt snapshot. Catches the `search(text: string)` regression class — call sites do NOT satisfy `parameters`/`returns` on their own. | Snapshot at `public-method-coverage-debt-snapshot.json`; allowlist at `public-method-coverage-allowlist.cjs` (each entry validated: key must match a real member, value must be a non-empty reason). Refresh with `--write`. |

Six of these run as wrapper stages of `check:public:superdoc`.
`public-method-coverage` runs alongside the cheap policy gates
(`contract-tiers-test`, `contract-tiers`, `jsdoc-ratchet`,
`jsdoc-hygiene-ts-test`, `jsdoc-hygiene-ts`) before `build`. The other
five run after `build`:
`consumer-typecheck-matrix`, `deep-type-audit-supported-root`,
`package-shape`, `export-snapshots`, `root-classification-closure`.
`consumer-typecheck-matrix` packs `superdoc.tgz` and installs it into
the consumer fixture. The rest reuse what matrix produced:
`deep-type-audit-supported-root`, `export-snapshots`, and
`root-classification-closure` read from the installed fixture in
`node_modules/superdoc/`; `package-shape` runs `publint` / `attw`
against the packed tarball at `packages/superdoc/superdoc.tgz`
directly. `check-all-public-types-fixture.mjs` is a fixture-build
helper, not a wrapper stage.

CI (`ci-superdoc.yml`) and release workflows (`release-superdoc.yml`,
`release-stable.yml`) call `pnpm check:public:superdoc --skip-build`
directly - no duplicated step lists.

---

## Document API scripts (`packages/document-api/scripts/`)

The Document API is contract-first: `operation-definitions.ts` is the
canonical source, and several artifacts are generated from it.

| Script | Phase | What it does |
|---|---|---|
| `generate-contract-outputs.ts` | generate | Writes `generated/schemas/**` + `generated/agent/**` from the contract. Called by `generate:docapi`. |
| `check-contract-parity.ts` | check | Asserts derived maps (`operation-registry`, `invoke`, etc.) project from `operation-definitions` correctly. |
| `check-contract-outputs.ts` | check | Builds all artifacts in memory and compares against the on-disk state. For tracked outputs (`apps/docs/document-api/reference/`, overview block) the disk must match exactly. For gitignored outputs (`packages/document-api/generated/`) the in-memory build is verified to succeed, but the files are not required on disk; if they happen to be present, content is still checked. |
| `check-examples.ts` | check | Asserts contract examples compile. |
| `check-overview-alignment.ts` | check | Asserts the documentation overview reflects the current operation set. |

The four `check-*` scripts run together via `check:public:docapi`,
which invokes the staged wrapper at `scripts/check-public-docapi.mjs`.
Same shape as `check:public:superdoc`: cheap-to-expensive ordering,
named stages (`contract-parity`, `contract-outputs`, `examples`,
`overview-alignment`), stage headers + final elapsed time, and a
re-run hint on failure.

**Clean-checkout safe**: a fresh `git clone` followed by `pnpm install
&& pnpm check:public` succeeds without `generate:docapi` having run
first. `generate:docapi` remains the explicit way to materialize the
gitignored artifacts when you need them locally (SDK builds, publishing).

---

## Dataflow

```
type-surface.config.cjs               (single source of truth)
   │
   ├─ vite.config.js              ──> emits dist/**/*.d.ts
   ├─ tsconfig.json#include       ──> typecheck source tree
   ├─ ensure-types.cjs            ──> rewrites + copies in dist
   ├─ check-tsconfig-type-surface ──> tsconfig parity gate
   └─ audit-declarations.cjs      ──> reads relocationGuardPackages

src/public/index.ts                  (declarative root facade)
   │
   ├─ vite-plugin-dts             ──> emits public/index.d.ts
   ├─ verify-public-facade-emit   ──> parses facade source as the contract
   ├─ snapshot.mjs (root family)  ──> drift snapshot
   └─ check-all-public-types-fixture ──> consumer fixture coverage

packages/document-api/src/contract/operation-definitions.ts
   │
   ├─ generate-contract-outputs   ──> writes generated/**
   ├─ check-contract-parity       ──> registry/invoke drift gate
   └─ check-contract-outputs      ──> committed-vs-fresh gate
```

---

## CI vs local

All three SuperDoc lanes call the same wrapper:

- **`ci-superdoc.yml`** (PR CI) — `pnpm check:public:superdoc --skip-build` after the Build step.
- **`release-superdoc.yml`** (preview/dev release) — same.
- **`release-stable.yml`** (stable release) — same.

The wrapper enforces every SuperDoc public-surface gate in one place.
A change to the validation chain (adding a stage, reordering, renaming)
lands in `scripts/check-public-contract.mjs` and propagates to all
three lanes automatically.

Local pre-commit: just run `pnpm check:public`. If anything fails, the
failure message tells you which script and (for `check:public:docapi`)
which command to run to regenerate missing or stale artifacts.
