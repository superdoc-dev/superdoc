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

The facade landed in SD-3212 PR C (`packages/superdoc/src/public/index.ts`
is now the root contract, with `src/public/legacy/*` for legacy subpaths).
But the audit still walks every entry in `package.json#exports`, including
the broad legacy `./super-editor` raw export. Excluding it drops findings
from ~1,835 to ~1,510; the remainder is dominated by curated root exports
(SuperDoc, Editor, PresentationEditor, SuperToolbar) pulling deep
implementation types (Pinia stores, EventEmitter, editor/toolbar config).

Gating on either number would recreate the prior allowlist problem
(see "Why no allowlist file is checked in (yet)" below).

The remaining work, tracked under SD-3213 follow-up:

1. Drain the residual `tier-4-public-contract` finding
   (`SuperConverter[key: string]: any`) via SD-3235. SD-3213c reduced the
   bucket from 16 findings to 1 by fully typing DocxZipper and partially
   typing SuperConverter's constructor + named statics.
2. Improve audit attribution per entry/bucket so findings can be
   distinguished as "supported-root leak" vs "legacy compat reach".
3. Scope the audit to curated facade entries (everything routing through
   `src/public/**` except `./super-editor`), then make it strict.

## What "fully compliant" means (final state)

The umbrella's success definition:

- deep audit allowlist reaches **0 owned findings against the curated
  public facade** (`src/public/**`, scoped to exclude broad legacy raw
  exports like `./super-editor`)
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

## Commands

```bash
# Default: report-only inventory. Prints findings, always exits 0
# (unless the script itself errors). Used by CI today.
node tests/consumer-typecheck/deep-type-audit.mjs

# Pack + install superdoc into the fixture, then run inventory
node tests/consumer-typecheck/deep-type-audit.mjs --pack

# Strict mode: fails on findings if no allowlist exists, or on
# new/stale entries if an allowlist exists. NOT used in CI today;
# becomes the gate once the audit is scoped to the curated facade
# entries (SD-3213 follow-up).
node tests/consumer-typecheck/deep-type-audit.mjs --strict

# Seed or regenerate deep-type-audit.allowlist.json from current findings
# (intended for use once the audit is scoped to the curated facade)
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
- **tier-4-public-contract**: currently **1 residual finding**
  (`SuperConverter.d.ts`'s `[key: string]: any` catchall). Historically
  included two classes of finding: (1) the hand-written shim files
  `SuperConverter.d.ts` and `DocxZipper.d.ts`
  (`constructor(...args: any[])`, `[key: string]: any`) — partially
  drained in SD-3213c (DocxZipper fully typed; SuperConverter constructor
  + named statics typed); (2) curated entries in `core/types/index.ts`
  like `transaction: any` that should import `Transaction` from
  `prosemirror-state`. The residual `SuperConverter[key: string]: any`
  cannot be removed without converting `SuperConverter.js` to TypeScript
  (or formalizing a public/internal contract split) because internal
  callers across `Editor.ts`, `PresentationEditor.ts`,
  `HeaderFooterRegistry.ts`, and list-level helpers read dozens of
  instance members through it. Tracked as a follow-up to SD-3213.
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
  CI calls the unified `snapshot.mjs --all --check` which runs this family
  plus the `legacy` and `super-editor-package` families.
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

Runs in `.github/workflows/ci-superdoc.yml` and
`.github/workflows/release-superdoc.yml` after the matrix step (which packs
and installs the tarball into this fixture). The audit runs without
`--pack` because the matrix already prepared the fixture.
