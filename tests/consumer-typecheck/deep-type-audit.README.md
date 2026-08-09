# Deep Public-Type Audit

Walks every type reachable from `superdoc`'s public exports in the
**packed-and-installed** tarball and reports `any` findings on SuperDoc-owned
declarations.

Tracked under SD-2977 as part of the "drain to fully compliant" umbrella
SD-2976.

## Status: report-only inventory (gate deferred until audit is scoped to the facade)

Today this audit runs in **inventory mode**: it walks the public surface,
prints a tiered breakdown of findings, and always exits 0. It does NOT
gate CI yet.

The v2 facade lives at `packages/superdoc/src/public/index.ts` and is now the
root contract. The package export map is limited to the root entry and
stylesheet assets, so the audit should be scoped to the curated root facade
rather than historical compatibility paths.

Gating on either number would recreate the prior allowlist problem
(see "Why no allowlist file is checked in (yet)" below).

The remaining work, tracked under SD-3213 follow-up:

1. Improve audit attribution per entry/bucket so findings can be tied to the
   root facade member that exposes them.
2. Scope the audit to curated v2 facade entries, then make it strict.

## What "fully compliant" means (final state)

The umbrella's success definition:

- deep audit allowlist reaches **0 owned findings against the curated
  public facade**
- the public facade is intentionally defined, not inherited from
  accidental barrel reachability
- anything outside the facade is internal and is not part of the
  TypeScript compliance promise
- consumer matrix passes with `skipLibCheck: false`
- CJS / ESM package metadata is honest
- `publint` and `attw --pack` pass as required CI gates
- no private workspace package references survive in published types
- release workflow runs the same type gates as PR CI

Two compliance classes, both required:

- **Type-quality compliance**: every reachable type *in the curated
  facade* is real, not `any`. This audit (in `--strict` mode, scoped to
  facade entries) will enforce it.
- **Package-shape compliance**: manifest, exports, conditions, CDN
  fields are honest. SD-2978 (Packaging Honesty) owns this side.

## What it checks

For every export entry in `packages/superdoc/package.json`'s `exports` map
that has a `types` field, the audit:

1. Builds a TypeScript Program rooted at the entry's `.d.ts`
2. Recursively walks every reachable type (properties, function params,
   return types, type arguments, union/intersection constituents)
3. Records every `any` declared inside `node_modules/superdoc/...`
4. Prints a tiered breakdown (by tier, by file)
5. If `deep-type-audit.allowlist.json` exists: compares findings against it
   and reports new vs stale entries
6. Under `--strict`, exits 1 on:
   - a new finding not in the allowlist (regression)
   - a stale allowlist entry (a fix landed; entry must be removed)
   - any compiler diagnostic on the public surface
   - any private `@superdoc/*` specifier in installed declarations

Skipped on purpose:

- `#private` class fields (TypeScript represents them as `any` but they are
  legitimately inaccessible to consumers)
- `private` and `protected` class members (same reason)
- Upstream `any` (declared in `node_modules/{vue, prosemirror-*, yjs, ...}`):
  we don't own those types and can't fix them. The walker stops at
  upstream package boundaries.

## Why no allowlist file is checked in (yet)

A previous iteration committed `deep-type-audit.allowlist.json` with ~1700
entries. That was reverted because:

- A 17K-line public artifact creates noise in every PR diff
- It would commit the team to typing internals (Pinia stores, EventEmitter,
  Vue SFC types) that should be hidden behind the curated facade, not typed
- It risks legitimizing accidental public surface as the type contract

The allowlist re-emerges once the audit is scoped to the curated facade
entries (SD-3213 follow-up). Each entry has a stable key
(`kind|file|symbolPath|snippet`) so reformatting and line shifts won't
churn it.

## Attribution (SD-3213d)

Each report prints export-entry and root-bucket breakdowns alongside the historical tier
and top-files tables, and writes a machine-readable JSON to
`tmp/deep-type-audit-attribution.json` (gitignored). The point is to
distinguish supported-root leaks from legacy compat reach so strict gates can
be scoped without guessing.

The tables in a typical run look like:

```
[audit] By export entry (reachedFrom; one finding can count under several):
   1237  .
     ...

[audit] By root bucket (only for findings reached from root '.'):
    950  supported-root
    190  legacy-root
     97  internal-candidate

```

How to read these:

- **By entry** sums to more than the distinct-finding total because one
  finding can be reachable from several public entries. The same row in
  the deduped findings table contributes a count to each entry in its
  `reachedFrom` set.
- **By root bucket** counts only findings whose `reachedFrom` includes
  the root entry `.`, attributed via the top-level symbol in
  `symbolPath` (e.g. `SuperDoc.provider.on(event)` → `SuperDoc` →
  bucket from `snapshots/superdoc-root-classification.json`). If the
  top-level parser fails or the symbol isn't in the classification, the
  finding is counted as `unknown-root-export` so the parse failure rate
  is visible.
The JSON artifact mirrors the text breakdown and also lists every
finding with its `reachedFrom` and `rootBuckets` sets, so downstream
tooling (e.g. PR 3's strict-scope selector) does not need to re-run the
walker.

## Supported-root strict gate (SD-3213e)

The first real public-contract no-new-any gate. Filters findings to the
subset whose `rootBuckets` includes `supported-root` (i.e. reached from
root entry `.` via an export that the SD-3212 classification labels as
supported public API) and compares them against a committed allowlist.

- Allowlist file: `tests/consumer-typecheck/deep-type-audit.supported-root-allowlist.json`.
- **The allowlist is current known debt, not accepted API quality.**
  Drain PRs reduce it; the gate fails on stale entries to force the
  reduction to be recorded.
- Excludes `legacy-root` and `internal-candidate` reach. Each has its own drain
  story (legacy = compat, internal-candidate = should be hidden) and would
  obscure the supported-root signal if mixed in.
- CI invokes one command (`--strict-supported-root`) that prints the
  broad inventory AND runs the gate. No second workflow step.
- Top offender files + symbols are printed on every run so drain PRs
  know where to start.

```bash
# CI invocation: broad report + supported-root strict gate, one process.
node tests/consumer-typecheck/deep-type-audit.mjs --strict-supported-root

# Seed or regenerate the supported-root allowlist (after a drain or
# when seeding for the first time).
node tests/consumer-typecheck/deep-type-audit.mjs --pack --write --strict-supported-root
```

## Gate map (which gate owns what)

Multiple gates run against the public surface; each owns a distinct
failure class. Before adding a new gate, check whether one of these
already covers the concern.

| Gate | Owns |
|---|---|
| `typecheck-matrix.mjs` | Consumer `tsc --noEmit` across module modes (Bundler / Node16 / NodeNext). Catches **resolution errors and missing exports**. |
| `deep-type-audit.mjs` | Recursive `any` detection on every type reachable from public exports. Owns the **supported-root strict gate** (`--strict-supported-root`). |
| `package-shape-gate.mjs` | `publint` + `attw --pack`. Catches **manifest issues**: condition ordering, masquerading ESM, missing CDN files, unpublished `source` paths. |
| `snapshot.mjs` | V2-only resolution absence gate plus root facade symbol inventory. Catches **silent surface growth** and legacy subpath reintroduction. |
| `check-root-classification-closure.mjs` | Dependency-closure rule: no `supported-root` or `legacy-root` export references an `internal-candidate` type in its declared public type. |
| `verify-public-facade-emit.cjs` | Curated `src/public/**` facade ↔ emitted `.d.ts` parity (symbol set, ESM/CJS parity, leak grep, command signatures). Runs at postbuild. |
| `audit-declarations.cjs` | Private workspace specifier leaks (`@superdoc/*`) and declaration-emit hygiene. Runs at postbuild. |

Each gate runs once. PRs should extend an existing gate before adding
a new one — see SD-3213e (PR which added the supported-root mode to
the existing `deep-type-audit.mjs` rather than introducing a new
script).

## Commands

```bash
# Default: report-only inventory. Prints findings, always exits 0
# (unless the script itself errors).
node tests/consumer-typecheck/deep-type-audit.mjs

# Pack + install superdoc into the fixture, then run inventory
node tests/consumer-typecheck/deep-type-audit.mjs --pack

# Supported-root strict gate (CI). Prints broad inventory AND fails on
# new/stale entries in the supported-root allowlist.
node tests/consumer-typecheck/deep-type-audit.mjs --strict-supported-root

# Broad strict mode: fails on findings against the broad allowlist.
# Not used in CI yet — the broad allowlist would be ~1.8k entries
# dominated by legacy reach. Reserved for future work.
node tests/consumer-typecheck/deep-type-audit.mjs --strict

# Seed or regenerate the broad allowlist.
node tests/consumer-typecheck/deep-type-audit.mjs --write

# Seed or regenerate the supported-root allowlist (run after a drain
# PR to shrink the baseline).
node tests/consumer-typecheck/deep-type-audit.mjs --pack --write --strict-supported-root
```

## Updating the allowlist

Two legitimate reasons to run `--write`:

1. **A fix landed**: the audit reports stale entries. Run `--write`,
   commit the diff. Each removed entry should correspond to a real type
   improvement in the same PR.
2. **A new `any` is intentional and justified**: extremely rare. The new
   entry must include a `rationale` explaining why the type genuinely
   cannot be expressed any better (e.g. ProseMirror's own opaque `Plugin`
   types where we have no upstream type to import). Reviewers should
   reject auto-seeded rationales for new entries.

The `--write` flag preserves existing `owner` and `rationale` fields on
unchanged entries. Only new entries get auto-classified `owner` and a
default `auto-seeded from inventory` rationale.

> **Important:** Do not drain the allowlist by replacing `any` with
> `unknown` unless the value is genuinely opaque. Prefer precise imported
> or local public types. `unknown` is safer than `any`, but it does not
> restore IntelliSense, and "no `any`" is a mechanical gate while "good
> TypeScript support" still requires reviewer judgment. For example,
> `EditorTransactionEvent.transaction` should resolve to ProseMirror's
> `Transaction`, not `unknown`. Reviewers should reject `unknown`-only
> drains where a real type is available upstream or definable locally.

## Owner taxonomy

- **tier-1-pinia** (~160 entries): Vue/Pinia stores exposing every action
  parameter and getter as `any` because the source uses JSDoc without
  `@param` annotations. Open question: whether these should be typed or
  *removed from the public surface entirely* (Pinia stores were likely
  never intended public API).
- **tier-2-toolbar** (~46 entries): `super-toolbar`'s `customButtons[]`
  collapsing to `Ref<any>` for every property. Direct customer pain when
  configuring custom toolbar buttons.
- **tier-3-helpers** (~61 entries): `trackChangesHelpers` and
  `fieldAnnotationHelpers`. JS files exported via the `helpers` namespace
  with no JSDoc. Best fix is probably JS to TS conversion.
- **tier-4-public-contract**: curated root facade entries whose declaration
  shapes still need stronger concrete typing before the audit can become a
  strict gate.
- **tier-5-other**: catchall for anything that doesn't match the patterns
  above.

## Relationship to other gates

- `typecheck-matrix.mjs`: runs `tsc --noEmit` under N consumer tsconfigs.
  Catches *resolution* errors and *missing exports*. Doesn't see member-level
  `any`.
- `snapshot.mjs --family root --check`: locks the root export inventory
  across the four `package.json#exports` sources independently (types.import,
  types.require, import, require). Each source has its own baseline (type
  sources currently 200 names, runtime sources 41) and drift on any of the
  four fails the gate. Cross-source mismatches (typed-only, runtime-only,
  ESM vs CJS) are reported in the companion `.md` as evidence, not blockers.
  CI calls the unified `snapshot.mjs --all --check`, which runs the root
  inventory and v2-only absence families.
- `verify-public-facade-emit.cjs`: verifies the curated `src/public/**`
  facade matches the emitted `.d.ts` (symbol set, ESM/CJS parity, leak
  grep, command-signature probe).
- `check-root-classification-closure.mjs`: dependency-closure rule — no
  supported-root or legacy-root export references an internal-candidate
  type in its public declared type.
- **deep-type-audit.mjs (this)**: recursive walk; catches what the others
  cannot.

(`check-public-types.mjs` was retired in SD-3213a after the root facade
flip — the canonical root contract is now `packages/superdoc/src/public/index.ts`
plus the snapshot/facade-verifier gates above, not the legacy JSDoc
typedef block in `packages/superdoc/src/index.js`.)

## CI wiring

Runs in `.github/workflows/ci-superdoc.yml` after the matrix step (which packs
and installs the tarball into this fixture). The audit runs without
`--pack` because the matrix already prepared the fixture.
