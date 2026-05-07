# Deep Public-Type Audit

Walks every type reachable from `superdoc`'s public exports in the
**packed-and-installed** tarball and reports `any` findings on SuperDoc-owned
declarations.

Tracked under SD-2977 as part of the "drain to fully compliant" umbrella
SD-2976.

## Status: report-only inventory (gate deferred until SD-2966)

Today this audit runs in **inventory mode**: it walks the public surface,
prints a tiered breakdown of findings, and always exits 0. It does NOT
gate CI yet.

The gate behavior (failing CI on new findings) is intentionally deferred.
The current public surface is the *accidental declaration graph*: 1700+
findings reachable through Pinia stores, EventEmitter generics, Vue SFC
component types, and other code that was never deliberately committed as
public API. Locking in an allowlist of that surface would be measuring
the wrong thing and would risk legitimizing internals as public API.

SD-2966 defines the deliberate facade. Once it lands:

1. Re-run this audit; the allowlist is much smaller (expected ~200-400
   entries against the facade, not 1700+ against the accidental graph).
2. Seed the allowlist via `node deep-type-audit.mjs --write`.
3. Add `--strict` to the CI invocation to make this a real gate.

Until then, the audit's value is the inventory: visible CI signal of how
much accidental surface is leaking, useful as evidence that SD-2966 is
worth doing.

## What "fully compliant" means (final state)

The umbrella's success definition:

- deep audit allowlist reaches **0 owned findings against the deliberate
  public facade defined by SD-2966**
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

- **Type-quality compliance**: every reachable type *in the facade* is
  real, not `any`. This audit (in `--strict` mode, post-facade) enforces it.
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
  Vue SFC types) that should be hidden via SD-2966's facade, not typed
- It risks legitimizing accidental public surface as the type contract

The allowlist re-emerges after SD-2966 lands, scoped to the facade. Each
entry has a stable key (`kind|file|symbolPath|snippet`) so reformatting and
line shifts won't churn it.

## Commands

```bash
# Default: report-only inventory. Prints findings, always exits 0
# (unless the script itself errors). Used by CI today.
node tests/consumer-typecheck/deep-type-audit.mjs

# Pack + install superdoc into the fixture, then run inventory
node tests/consumer-typecheck/deep-type-audit.mjs --pack

# Strict mode: fails on findings if no allowlist exists, or on
# new/stale entries if an allowlist exists. NOT used in CI today;
# becomes the gate after SD-2966 defines the facade.
node tests/consumer-typecheck/deep-type-audit.mjs --strict

# Seed or regenerate deep-type-audit.allowlist.json from current findings
# (intended for use after SD-2966 to baseline against the facade)
node tests/consumer-typecheck/deep-type-audit.mjs --write
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
