# Deep Public-Type Audit

A CI gate that walks every type reachable from `superdoc`'s public exports
in the **packed-and-installed** tarball and locks in zero `any` regressions
on SuperDoc-owned declarations.

Tracked under SD-2977 as part of the "drain to fully compliant" umbrella
SD-2976.

## What "fully compliant" means

The umbrella's success definition (a public-type contract worth shipping):

- deep audit allowlist reaches **0 owned findings**
- consumer matrix passes with `skipLibCheck: false`
- CJS / ESM package metadata is honest (no false ESM masquerade, no
  missing CDN files, no unpublished `source` paths)
- `publint` and `attw --pack` pass as required CI gates
- no private workspace package references survive in published types
- release workflow runs the same type gates as PR CI

Two compliance classes, both required:

- **Type-quality compliance**: every reachable public type is real, not
  `any`. This audit gate enforces it; the tier-by-tier drain achieves it.
- **Package-shape compliance**: manifest, exports, conditions, CDN
  fields are honest. SD-2978 (Packaging Honesty) owns this side.

## What it checks

For every export entry in `packages/superdoc/package.json`'s `exports` map
that has a `types` field, the audit:

1. Builds a TypeScript Program rooted at the entry's `.d.ts`
2. Recursively walks every reachable type (properties, function params,
   return types, type arguments, union/intersection constituents)
3. Records every `any` declared inside `node_modules/superdoc/...`
4. Compares findings against `deep-type-audit.allowlist.json`
5. Fails CI on:
   - a new finding not in the allowlist (regression)
   - a stale allowlist entry that no longer corresponds to a finding
     (a fix landed; allowlist must be updated to match)
   - any compiler diagnostic on the public surface
   - any unresolved import (TypeScript `error` type, distinct from `any`)

Skipped on purpose:

- `#private` class fields (TypeScript represents them as `any` but they are
  legitimately inaccessible to consumers)
- `private` and `protected` class members (same reason)
- Upstream `any` (declared in `node_modules/{vue, prosemirror-*, yjs, ...}`):
  we don't own those types and can't fix them. The walker stops at
  upstream package boundaries.

## Why an allowlist instead of a full clean state

The initial seed has ~290 entries. Fixing all of them up-front would block
the gate from landing for weeks and let regressions accumulate in the
meantime. The allowlist:

- Lets the gate land green today, blocking any *new* regressions
- Tags every entry with an `owner` (`tier-1-pinia`, `tier-2-toolbar`,
  `tier-3-helpers`, `tier-4-public-contract`, `tier-5-other`)
- Lets follow-up PRs drain entries by owner

See `deep-type-audit.allowlist.json` for the seed. Each entry has a stable
key (`kind|file|symbolPath|snippet`) so reformatting / line shifts do not
churn the allowlist.

## Commands

```bash
# CI mode: check against allowlist, fail on regression
node tests/consumer-typecheck/deep-type-audit.mjs

# Pack + install superdoc into the fixture, then check
node tests/consumer-typecheck/deep-type-audit.mjs --pack

# Regenerate the allowlist from current findings (after intentional
# additions or after a fix removes an entry)
node tests/consumer-typecheck/deep-type-audit.mjs --write

# Print findings without failing (debugging / drainage planning)
node tests/consumer-typecheck/deep-type-audit.mjs --report-only
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
- **tier-4-public-contract** (~2 entries): the curated `core/types/index.ts`
  file. These are surgical fixes (`transaction: any` should import
  `Transaction` from `prosemirror-state`, etc).
- **tier-5-other**: catchall for anything that doesn't match the patterns
  above.

## Relationship to other gates

- `typecheck-matrix.mjs`: runs `tsc --noEmit` under N consumer tsconfigs.
  Catches *resolution* errors and *missing exports*. Doesn't see member-level
  `any`.
- `check-public-types.mjs`: verifies every public `@typedef` has an
  assertion fixture. Asserts top-level type aliases aren't `any`. Doesn't
  see member-level `any`.
- **deep-type-audit.mjs (this)**: recursive walk; catches what the others
  cannot. Together the three gates form the public-type contract guarantee.

## CI wiring

Runs in `.github/workflows/ci-superdoc.yml` and
`.github/workflows/release-superdoc.yml` after the matrix step (which packs
and installs the tarball into this fixture). The audit runs without
`--pack` because the matrix already prepared the fixture.
