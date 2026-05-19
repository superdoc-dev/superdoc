# Legacy public surface snapshots (SD-3176)

These files lock the public TypeScript surface that ships through SuperDoc's legacy compatibility paths. CI fails when a snapshot drifts. See the [SD-3175 umbrella](https://linear.app/superdocworkspace/issue/SD-3175) for the architectural plan these snapshots stabilize for.

## What each file locks

| File | Source | Scope |
| --- | --- | --- |
| `super-editor-package-exports.txt` | `packages/super-editor/package.json#exports` keys | Subpaths the `@superdoc/super-editor` package advertises. New subpath = new public surface area. |
| `superdoc-super-editor.txt` | Resolved named exports through `superdoc/super-editor` | The main no-growth gate. `superdoc/src/super-editor.js` is `export *`, so growth is silent without this. |
| `superdoc-converter.txt` | Resolved exports through `superdoc/converter` | Single-purpose legacy entry; freeze check. |
| `superdoc-docx-zipper.txt` | Resolved exports through `superdoc/docx-zipper` | Single-purpose legacy entry; freeze check. |
| `superdoc-file-zipper.txt` | Resolved exports through `superdoc/file-zipper` | Single-purpose legacy entry; freeze check. |
| `superdoc-headless-toolbar.txt` | Resolved exports through `superdoc/headless-toolbar` | Reclassified as legacy in SD-3179 ahead of the `superdoc/ui` migration. 16-name surface; freeze check. |
| `superdoc-headless-toolbar-react.txt` | Resolved exports through `superdoc/headless-toolbar/react` | Framework helper paired with `superdoc/headless-toolbar`. Migration target: `superdoc/ui/react`. |
| `superdoc-headless-toolbar-vue.txt` | Resolved exports through `superdoc/headless-toolbar/vue` | Framework helper paired with `superdoc/headless-toolbar`. Migration target: tracked separately. |
| `superdoc-root-exports.json` | 4-source root inventory (`types.import` / `types.require` / `import` / `require`) | SD-3212 PR A0. Drift gate on each source's name set independently. Cross-source mismatches (typed-only, runtime-only, ESM vs CJS) reported in the companion `.md` as evidence for the SD-3212 classification pass. |
| `superdoc-root-exports.md` | Companion evidence report for the above | Regenerated on `--write`; not a drift gate. Includes per-name evidence: presence in each source, fixture import count, JSDoc typedef membership, docs/examples/demos mentions, `package-boundaries.md` reference. |

Snapshot scripts:

- `tests/consumer-typecheck/snapshot-super-editor-package-exports.mjs`
- `tests/consumer-typecheck/snapshot-superdoc-legacy-exports.mjs`
- `tests/consumer-typecheck/snapshot-superdoc-root-exports.mjs` (SD-3212 PR A0; superdoc root entry)

## What to do when CI fails

The failure message tells you which snapshot drifted, what was added, and what was removed.

**Default response: reject the change.** These paths are classified as legacy public compatibility surface in `docs/architecture/package-boundaries.md` (Decision 1). They are not supposed to grow. New entries usually mean:

1. A new public symbol leaked through a wildcard re-export. Don't add it to the snapshot - remove it from the public path, or add it through a non-legacy public entry.
2. An intentional rename or refactor that happens to flow through a legacy path. Stop and check whether the rename should travel through `superdoc` instead.

**When growth is intentional** (rare: an explicitly approved compat shim for a legacy customer, an accepted deprecation alias, or similar):

1. Make sure the PR links to SD-3175 or a child ticket so the architectural reviewer sees the justification.
2. Regenerate the affected snapshot:
   ```bash
   # Snapshot A (package exports map):
   node tests/consumer-typecheck/snapshot-super-editor-package-exports.mjs --write

   # Snapshot B (resolved exports — requires fixture installed):
   node tests/consumer-typecheck/snapshot-superdoc-legacy-exports.mjs --write
   ```
3. Commit the updated snapshot together with the change that caused it. Reviewer reads both as one decision.

**Removals are not a hard fail by intent**, but the snapshot still flags them so the diff gets reviewed. Removing from a legacy compat path can break consumers; intentional removals belong in a major-version cleanup (Phase 5 of SD-3175).

## How to run locally

Snapshot A (source-only, no fixture needed):
```bash
node tests/consumer-typecheck/snapshot-super-editor-package-exports.mjs --check
```

Snapshot B requires the packed-and-installed fixture under `tests/consumer-typecheck/node_modules/superdoc/`. The matrix script sets this up:
```bash
# Either run the full matrix first (it packs and installs):
node tests/consumer-typecheck/typecheck-matrix.mjs

# Or install manually:
pnpm --filter superdoc run pack:es                                 # repo root
cd tests/consumer-typecheck
npm install ../../packages/superdoc/superdoc.tgz --no-save
node snapshot-superdoc-legacy-exports.mjs --check
```

## What this gate does NOT do

- Does not classify supported public surfaces (root `superdoc`, `superdoc/ui`, etc.). That work lives in `tests/consumer-typecheck/public-facade-policy.json` and SD-2966 / SD-3147.
- Does not catch leaks through non-legacy paths. The full path-as-contract facade lands under SD-3175.
- Does not lock the *types* of exported symbols, only their names. A breaking change to an existing export's shape passes this gate.
- Does not run against arbitrary subpaths. Only the files listed in the table above are tracked. The authoritative list lives in `SUBPATHS` inside `tests/consumer-typecheck/snapshot-superdoc-legacy-exports.mjs`.
- Does not enumerate every file reachable through existing wildcard export-map keys in `@superdoc/super-editor` (e.g. `"./*"`, `"./converter/internal/*"`). Snapshot A freezes the export-map key set; Snapshot B freezes the resolved `superdoc/super-editor` named export surface. A new file added under an existing wildcard that a consumer reaches via deep import (`@superdoc/super-editor/something-new`) passes both gates. Wildcard removal or shrinkage belongs to the later compat/major phases of SD-3175.
