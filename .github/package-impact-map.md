# Package impact map

Source of truth for which repo paths should trigger CI and release workflows for each published surface.

## Principle

**Test broad, release narrow.**

- **CI gates compatibility.** A change to SuperDoc core should run the CI of every dependent package — that's how breakage in `@superdoc-dev/react` or `@superdoc-dev/sdk` gets caught before it ships. CI paths follow *compatibility* impact.
- **Release gates artifact changes.** A package should only publish a new version when its own published artifact actually changes. Release paths follow *artifact* impact.

These two are not the same. `template-builder` and `esign` externalize `superdoc` in their builds and declare it as a `peerDependency`, so a core change doesn't change their tarballs → CI broad, release narrow. CLI bundles core into platform binaries, so a core change does change the CLI tarball → both broad.

## Surfaces

| Surface | Purpose | Release impact | CI impact |
|---|---|---|---|
| `superdoc` | Main browser DOCX editor/runtime | core | core |
| `@superdoc-dev/react` | React wrapper around superdoc | react + core (see note below) | react + core |
| `@superdoc-dev/template-builder` | React SDT/template authoring UI | `packages/template-builder/**` only | template-builder + core |
| `@superdoc-dev/esign` | React signing workflow | `packages/esign/**` only | esign + core |
| `@superdoc-dev/cli` | Native Document API CLI | cli + doc-api + core | same |
| `@superdoc-dev/sdk` | JS/Python SDK packaging CLI binaries | sdk + cli + doc-api + core | same |
| `@superdoc-dev/mcp` | MCP server over SDK/document engine | mcp + sdk + cli + doc-api + core | same |
| `superdoc-vscode-ext` | VS Code DOCX editor | vscode-ext + core | same |
| `@superdoc-dev/create` | Project scaffolder | `apps/create/**` only | own changes only |
| `@superdoc-dev/superdoc-yjs-collaboration` | Standalone Yjs server (no SuperDoc dep) | `packages/collaboration-yjs/**` only | own changes + collaboration examples |
| `@superdoc/docs` (private) | Documentation site | N/A (not published) | docs + public API / doc generation |
| demos, examples (private) | Compatibility samples | N/A (not published) | own paths + relevant upstream runtime |

## Path expansions

**core** expands to:
- `packages/superdoc/**`
- `packages/super-editor/**`
- `packages/layout-engine/**`
- `packages/word-layout/**`
- `packages/preset-geometry/**`
- `shared/**`
- `pnpm-workspace.yaml`

**doc-api** is `packages/document-api/**`.

**cli** is `apps/cli/**`.

**sdk** is `packages/sdk/**`.

**mcp**, **vscode-ext**, **create** are their respective `apps/*/**` or `packages/*/**` paths.

## Why each classification

- **`template-builder` and `esign`** externalize `superdoc` in their Vite build (`rollupOptions.external`) and declare it as a `peerDependency`. A SuperDoc core change does not change the wrapper's published bundle — consumers receive the new core through their own `npm install`. Release-on-core is pure version noise; CI-on-core remains necessary to catch breaking API changes.
- **`react`** externalizes `superdoc` in its Vite build the same way, and declares `superdoc` in **both** `dependencies` and `peerDependencies`. The `dependencies` entry preserves auto-install for every consumer (zero-break regardless of package manager); the `peerDependencies` entry signals the singleton contract and aligns the manifest with template-builder/esign. Because the `dependencies` entry still pins via lockfiles, existing consumers only pick up a new core version when react republishes, so release-on-core stays correct *today*. The unlock for release-narrow is to remove `superdoc` from `dependencies` entirely — that is a breaking change and tracked as a separate decision.
- **CLI / SDK** bundle engine behavior into platform-specific native binaries (see `apps/cli/.releaserc.cjs` and `packages/sdk/.releaserc.cjs` — both use `patch-commit-filter.cjs` to expand release analysis into core paths). The published artifact genuinely changes when core changes.
- **MCP** depends on SDK via `workspace:*` and imports engine/session code directly. Its current release trigger (`apps/mcp/**` only) causes it to lag SDK releases. Expand to match SDK's release paths.
- **VS Code extension** packages SuperDoc into the extension VSIX. Treated like CLI/SDK.
- **collaboration-yjs** has no SuperDoc dependency. It's a standalone Yjs server. Release and CI both narrow.
- **create** is a scaffolder with no dependencies on SuperDoc runtime. Release and CI both narrow.
- **docs, demos, examples** are not published. They get CI on changes to anything they render to catch visual or behavior regressions.

## Notes

- `packages/ai/**` has been removed from all release and CI triggers. `@superdoc-dev/ai` is being deprecated; npm-side deprecation is a separate operational step.
- When SuperDoc core ships a breaking API change, `template-builder` and `esign` must be manually updated and released. Their `peerDependencies` version bump is the signal; semantic-release won't auto-trigger on upstream changes for them.
- `@superdoc-dev/react` declares `superdoc` in both `dependencies` and `peerDependencies` to preserve zero-break install semantics while still signaling the singleton contract. Removing `superdoc` from `dependencies` is the unlock for release-narrow and is tracked as a separate decision.
- When editing a release or CI workflow, its `paths:` filter must match the corresponding row in this map. Workflow-lint rules should enforce this.
