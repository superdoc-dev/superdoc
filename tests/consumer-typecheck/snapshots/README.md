# Public surface snapshots

These files lock the public TypeScript surface that ships through the v2
`superdoc` package contract. CI fails when a snapshot drifts.

## What each file locks

| File | Source | Scope |
| --- | --- | --- |
| `superdoc-root-exports.json` | 4-source root inventory (`types.import` / `types.require` / `import` / `require`) | Drift gate on each root source's exported name set. Cross-source mismatches are reported in the companion `.md` evidence file. |
| `superdoc-root-exports.md` | Companion evidence report for the root inventory | Regenerated on `--write`; not a drift gate. Includes per-name evidence from fixtures, JSDoc typedefs, docs, examples, demos, and package-boundaries references. |
| `superdoc-root-classification.json` | SD-3212 PR A1 classification | Decision record assigning root names to supported or legacy buckets. Not a drift gate. |
| `superdoc-root-classification.md` | Companion human-review surface for the classification | Grouped by bucket with per-name rationale. |

The unified entry point is `tests/consumer-typecheck/snapshot.mjs`.

- `--family v2-only-resolution` is a source-only absence gate. It verifies
  supported v2 package exports exist and removed v1 subpaths/package surfaces do
  not exist in `packages/superdoc/package.json` or the workspace package layout.
- `--family root` checks the packed-and-installed consumer fixture's root export
  inventory against `superdoc-root-exports.json`.
- `--all --check` runs both families.

## What to do when CI fails

For `v2-only-resolution` failures, reject the change unless the v2 public
contract has intentionally changed. Removed v1 package, editor, type,
converter, zipper, toolbar, and UI surfaces must not be reintroduced.

For `root` failures, inspect the added and removed names. Default response is
to keep the root contract stable and remove accidental public leakage. If the
root contract intentionally changes, regenerate the root family:

```bash
node tests/consumer-typecheck/snapshot.mjs --family root --write
```

Commit the updated snapshot with the source change that caused it.

## How to run locally

The v2-only absence gate is source-only:

```bash
node tests/consumer-typecheck/snapshot.mjs --family v2-only-resolution --check
```

The root snapshot requires the packed-and-installed fixture under
`tests/consumer-typecheck/node_modules/superdoc/`. The matrix script sets this
up:

```bash
node tests/consumer-typecheck/typecheck-matrix.mjs
node tests/consumer-typecheck/snapshot.mjs --family root --check
```

Run all active families:

```bash
node tests/consumer-typecheck/snapshot.mjs --all --check
```

## What this gate does not do

- It does not lock the type shapes of exported symbols, only their names.
- The v2-only family checks the source package export map and workspace package
  layout. It intentionally does not read a generated fixture, because local
  fixtures can be stale.
- The root family still depends on the generated packed fixture and can fail
  when that fixture was not refreshed.
